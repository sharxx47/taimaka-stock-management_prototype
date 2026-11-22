// Everything a person can do. Each action checks who may do it, stamps the entry with the user's
// name, role and time, and appends events. Nothing is edited or deleted.

import { stamp } from './users.js';
import { CORRECTION_REASONS, STOCK_TYPES, SACHETS_PER_CARTON } from './config.js';
import {
  rutfAlertLevel, target, currentMonth, batchesOnHand, emergencyRequest, onHand, evaluateCount,
} from './stock.js';
import { ms } from './time.js';
import { siteIdFromLabel } from './facilities.js';

let counter = 0;
function newId(prefix) {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export class ActionError extends Error {}

function fail(msg) {
  throw new ActionError(msg);
}

const isLogistics = (u) => u.kind === 'logistics';

function mustWorkAt(db, user, storeId) {
  if (user.kind === 'facility' && user.storeId === storeId) return;
  fail('You can only enter data for your own facility.');
}

// ---------- Daily count and ITP log (save as you go, then submit) ----------

// drafts: { [key]: { kind, lines: { [itemId]: { qty, sealed, loose, ranOut, note, savedAt, by } } } }
// key: the store id, or "<store id>|recount" for a logistics recount (so it never replaces the facility's own draft).
export function draftKey(storeId, kind) {
  return kind === 'recount' ? `${storeId}|recount` : storeId;
}

export function saveCountLine(db, drafts, user, storeId, itemId, { qty = null, sealed = null, loose = null, ranOut = false, note = undefined } = {}, kind = 'daily') {
  if (kind === 'recount') { if (!isLogistics(user)) fail('Only logistics can record a recount.'); } else mustWorkAt(db, user, storeId);
  const item = db.item(itemId);
  if (!db.holds(storeId, itemId)) fail(`${item.name} is not held at this store.`);
  let value = qty;
  if (item.isRutf && (sealed !== null || loose !== null)) {
    const s = Number(sealed || 0);
    const l = Number(loose || 0);
    if (!Number.isInteger(s) || s < 0 || !Number.isInteger(l) || l < 0) fail('Enter whole numbers of cartons and sachets.');
    value = s * SACHETS_PER_CARTON + l;
  }
  if (value !== null && value !== '') {
    value = Number(value);
    if (!Number.isFinite(value) || value < 0) fail('Enter a number of 0 or more.');
  } else {
    value = null; // left blank
  }
  const key = draftKey(storeId, kind);
  const d = drafts[key] && drafts[key].kind === kind ? drafts[key] : { kind, lines: {} };
  const prev = d.lines[itemId] || {};
  const same = prev.qty === value && !!prev.ranOut === !!ranOut;
  d.lines[itemId] = { qty: value, sealed, loose, ranOut: !!ranOut, note: note === undefined ? prev.note || '' : note, savedAt: same && prev.savedAt ? prev.savedAt : db.nowIso, by: user.id };
  drafts[key] = d;
  return d.lines[itemId];
}

export const STORE_PROBLEMS = [
  { id: 'not_cool', label: 'Not cool' },
  { id: 'not_dry', label: 'Not dry' },
  { id: 'not_locked', label: 'Not locked' },
];

// storeCheck: "Store is cool, dry and locked today". When it is not ticked, storeProblems names at least one
// problem (not_cool, not_dry, not_locked), with an optional storeNote. The count still submits.
export function submitCount(db, drafts, user, storeId, { storeCheck = false, storeProblems = [], storeNote = '', kind: wanted = null } = {}) {
  const key = draftKey(storeId, wanted || drafts[storeId]?.kind || 'daily');
  const draft = drafts[key];
  if (!draft) fail('Nothing has been entered yet.');
  const kind = draft.kind;
  if (kind === 'recount') { if (!isLogistics(user)) fail('Only logistics can record a recount.'); } else mustWorkAt(db, user, storeId);
  const st = stamp(user, db.stores, db.nowIso);
  const sessionId = newId('count');
  const entries = [];
  const blanks = [];
  const notes = [];
  for (const it of db.itemsForStore(storeId)) {
    const line = draft.lines[it.id];
    if (!line || line.qty === null) { blanks.push(it.id); continue; }
    const lineStamp = { ...st, at: line.savedAt };
    const expected = db.ledger.balance(storeId, it.id, { beforeMs: ms(line.savedAt), strict: true }).qty;
    entries.push({
      id: newId('e'), kind: 'count', storeId, itemId: it.id, qty: line.qty, ts: line.savedAt, stamp: lineStamp,
      expected, sessionId, recount: kind === 'recount', itpLog: kind === 'itp_log',
      sealed: line.sealed, loose: line.loose, submittedAt: db.nowIso,
    });
    if (line.note && line.note.trim()) notes.push({ entryId: entries.at(-1).id, text: line.note.trim() });
    // A stock-out day is recorded whenever the RUTF count is zero, and when an ITP marks "We ran out of this today".
    if ((it.isRutf && line.qty === 0) || line.ranOut) {
      entries.push({ id: newId('e'), kind: 'stockout_day', storeId, itemId: it.id, qty: 0, ts: line.savedAt, stamp: lineStamp, sessionId });
    }
  }
  if (!entries.length) fail('Enter at least one count before submitting.');
  const problems = storeCheck ? [] : storeProblems.filter((p) => STORE_PROBLEMS.some((x) => x.id === p));
  if (!storeCheck && !problems.length) fail('Say what is wrong with the store: not cool, not dry or not locked.');
  const session = { id: sessionId, storeId, kind, storeCheck: !!storeCheck, storeProblems: problems, storeNote: storeCheck ? '' : storeNote.trim(), blanks, submittedAt: db.nowIso };
  db.apply({ type: 'count_submit', session, entries, stamp: st });
  for (const n of notes) db.apply({ type: 'note', targetId: n.entryId, text: n.text, stamp: st });
  delete drafts[key];
  const results = entries.filter((e) => e.kind === 'count').map((e) => ({ entry: db.ledger.get(e.id), eval: evaluateCount(db, db.ledger.get(e.id)) }));
  return { session, blanks, results };
}

// ---------- Corrections ----------

// "Correct this entry": a reason from the fixed list, the original stays visible.
// A negative RUTF correction at or above the alert level waits for a second named person.
export function correctEntry(db, user, entryId, { delta = null, newQty = null, reason, text = '' }) {
  const orig = db.ledger.get(entryId);
  if (!orig) fail('Entry not found.');
  if (user.kind === 'management') fail('Management view is read only.');
  if (user.kind === 'facility') mustWorkAt(db, user, orig.storeId);
  if (user.kind === 'supervisor') fail('Supervisors approve corrections; they do not make them.');
  if (!CORRECTION_REASONS.some((r) => r.id === reason)) fail('Pick a reason from the list.');
  if (reason === 'other' && !text.trim()) fail('Say what happened.');
  let d = delta;
  if (d === null) {
    if (newQty === null) fail('Enter the corrected amount.');
    d = Number(newQty) - orig.qty;
  }
  d = Number(d);
  if (!Number.isFinite(d) || d === 0) fail('The correction must change the amount.');
  const item = db.item(orig.itemId);
  const needsApproval = item.isRutf && d < 0 && Math.abs(d) >= rutfAlertLevel(db, orig.storeId, orig.itemId);
  const st = stamp(user, db.stores, db.nowIso);
  const entry = {
    id: newId('e'), kind: 'adjustment', storeId: orig.storeId, itemId: orig.itemId, qty: d, ts: db.nowIso,
    stamp: st, reason, reasonText: text.trim(), correctsId: orig.id, needsApproval,
  };
  db.apply({ type: 'ledger', entry, stamp: st });
  return db.ledger.get(entry.id);
}

export function decideCorrection(db, user, adjustmentId, decision) {
  const adj = db.ledger.get(adjustmentId);
  if (!adj || !adj.needsApproval) fail('Nothing to approve.');
  if (!['approved', 'rejected'].includes(decision)) fail('Approve or reject.');
  if (adj.stamp.by === user.id) fail('A second person must approve this correction.');
  const store = db.store(adj.storeId);
  const ok = isLogistics(user) || (user.kind === 'supervisor' && store.supervisor === user.name);
  if (!ok) fail('Only the facility supervisor or logistics can approve this.');
  const st = stamp(user, db.stores, db.nowIso);
  db.apply({ type: 'approval', targetId: adjustmentId, decision, stamp: st });
}

export function pendingApprovals(db, user = null) {
  return db.ledger.all.filter((e) => e.kind === 'adjustment' && e.needsApproval && !db.ledger.approvalOf(e))
    .filter((e) => !user || isLogistics(user) || (user.kind === 'supervisor' && db.store(e.storeId).supervisor === user.name));
}

export function addNote(db, user, targetId, text) {
  if (!text || !text.trim()) fail('Write a note first.');
  if (user.kind === 'management') fail('Management view is read only.');
  db.apply({ type: 'note', targetId, text: text.trim(), stamp: stamp(user, db.stores, db.nowIso) });
}

// ---------- Shipments ----------

let shipmentNumber = 1043; // the next new shipment is 1044 (seeded shipments go up to 1043)
export function nextShipmentNumber(db) {
  const max = Math.max(shipmentNumber, ...[...db.shipments.values()].map((s) => s.number));
  return max + 1;
}

// Requested: lines with the target frozen at the time of the proposal.
export function proposeShipment(db, user, { type, fromStoreId, toStoreId, monthKey = currentMonth(db), lines, note = '' }) {
  if (!['monthly', 'emergency', 'transfer'].includes(type)) fail('Unknown shipment type.');
  if (type === 'emergency' && user.kind === 'facility') mustWorkAt(db, user, toStoreId);
  else if (!isLogistics(user)) fail('Only logistics can plan shipments.');
  if (fromStoreId === toStoreId) fail('A shipment needs two different stores.');
  const frozen = lines.map((l) => {
    const t = target(db, toStoreId, l.itemId, monthKey);
    return {
      itemId: l.itemId, qtyProposed: l.qty ?? null, targetFrozen: t ? t.qty : null, note: l.note || null,
      qtySent: null, batchesSent: null, qtyReceived: null, batchesReceived: null, reason: null,
    };
  });
  const sh = { id: newId('sh'), number: nextShipmentNumber(db), type, fromStoreId, toStoreId, monthKey, lines: frozen, note: note.trim() || null };
  db.apply({ type: 'shipment_create', shipment: sh, stamp: stamp(user, db.stores, db.nowIso) });
  return db.shipments.get(sh.id);
}

// skipItemIds: items already in an open request. note: optional note for logistics.
export function requestEmergency(db, user, storeId, { skipItemIds = [], note = '' } = {}) {
  const req = emergencyRequest(db, storeId);
  const lines = req.lines.filter((l) => !skipItemIds.includes(l.itemId));
  if (!lines.length) fail('Nothing needs emergency stock right now.');
  return proposeShipment(db, user, { type: 'emergency', fromStoreId: 'central', toStoreId: storeId, lines, note });
}

// Approved: logistics can set quantities here (e.g. items with no usage data).
export function approveShipment(db, user, shipmentId, quantities = {}) {
  if (!isLogistics(user)) fail('Only logistics can approve shipments.');
  const sh = db.shipments.get(shipmentId);
  const lines = sh.lines.map((l) => ({ itemId: l.itemId, qtyProposed: quantities[l.itemId] ?? l.qtyProposed }));
  if (lines.some((l) => l.qtyProposed === null || !(l.qtyProposed > 0))) fail('Set an amount for every item.');
  db.apply({ type: 'shipment_step', shipmentId, step: 'approved', lines, stamp: stamp(user, db.stores, db.nowIso) });
}

// Sent: the quantity locks. Stock leaves the sender now, soonest-expiring batch first.
export function sendShipment(db, user, shipmentId) {
  if (!isLogistics(user)) fail('Only logistics can send shipments.');
  const sh = db.shipments.get(shipmentId);
  const st = stamp(user, db.stores, db.nowIso);
  const lines = [];
  const ledger = [];
  for (const l of sh.lines) {
    const qty = l.qtyProposed;
    const have = onHand(db, sh.fromStoreId, l.itemId) ?? 0;
    if (qty > have) fail(`${db.item(l.itemId).name}: only ${have} on hand at the sender.`);
    const batches = [];
    let left = qty;
    for (const b of batchesOnHand(db, sh.fromStoreId, l.itemId)) {
      if (left <= 0) break;
      const take = Math.min(left, b.qty);
      batches.push({ batch: b.batch, expiry: b.expiry, qty: take });
      left -= take;
    }
    lines.push({ itemId: l.itemId, qtySent: qty, batchesSent: batches });
    ledger.push({ id: newId('e'), kind: 'sent', storeId: sh.fromStoreId, itemId: l.itemId, qty, ts: db.nowIso, stamp: st, shipmentId, batches });
  }
  db.apply({ type: 'shipment_step', shipmentId, step: 'sent', lines, ledger, stamp: st });
}

// Received: only the receiving facility, with quantity, batch and expiry per batch,
// and a reason for anything short, damaged or extra.
export function receiveShipment(db, user, shipmentId, received) {
  const sh = db.shipments.get(shipmentId);
  if (!sh || sh.state !== 'sent') fail('This shipment is not on its way.');
  const receiverOk = (user.kind === 'facility' && user.storeId === sh.toStoreId) || (sh.toStoreId === 'central' && isLogistics(user));
  if (!receiverOk) fail('Only the receiving facility can mark this shipment received.');
  const st = stamp(user, db.stores, db.nowIso);
  const lines = [];
  const ledger = [];
  for (const l of sh.lines) {
    const r = received[l.itemId];
    if (!r) fail(`Enter what arrived for ${db.item(l.itemId).name}.`);
    const batches = (r.batches || []).filter((b) => b.qty > 0);
    const qty = batches.reduce((s, b) => s + Number(b.qty), 0);
    if (batches.some((b) => !b.batch || !b.expiry)) fail('Enter the batch and expiry for every batch.');
    if (qty !== l.qtySent && !(r.reason && r.reason.trim())) fail(`${db.item(l.itemId).name}: say why the amount differs from what was sent.`);
    lines.push({ itemId: l.itemId, qtyReceived: qty, batchesReceived: batches, reason: r.reason || null });
    if (qty > 0) ledger.push({ id: newId('e'), kind: 'received', storeId: sh.toStoreId, itemId: l.itemId, qty, ts: db.nowIso, stamp: st, shipmentId, batches });
  }
  db.apply({ type: 'shipment_step', shipmentId, step: 'received', lines, ledger, stamp: st });
}

// ---------- Central store ----------

export function receiveAtCentral(db, user, { itemId, qty, batch, expiry, supplier, poId = null }) {
  if (!isLogistics(user)) fail('Only logistics can receive at the central store.');
  if (!(Number(qty) > 0)) fail('Enter the quantity received.');
  if (!batch || !expiry || !supplier) fail('Enter the batch, expiry and supplier.');
  const st = stamp(user, db.stores, db.nowIso);
  const entry = {
    id: newId('e'), kind: 'received', storeId: 'central', itemId, qty: Number(qty), ts: db.nowIso, stamp: st,
    supplier, poId, batches: [{ batch, expiry, qty: Number(qty) }],
  };
  db.apply({ type: 'ledger', entry, stamp: st });
}

// Supplier order for the central store (counts as stock on order).
export function createSupplierOrder(db, user, { itemId, qty, supplier, due }) {
  if (!isLogistics(user)) fail('Only logistics can order from suppliers.');
  if (!(Number(qty) > 0)) fail('Enter the quantity to order.');
  if (!supplier || !supplier.trim()) fail('Enter the supplier.');
  if (!due) fail('Enter the date it is due.');
  const st = stamp(user, db.stores, db.nowIso);
  const po = { id: newId('po'), itemId, qty: Number(qty), supplier: supplier.trim(), orderedOn: db.nowIso.slice(0, 10), due };
  db.apply({ type: 'po_create', po, stamp: st });
  return po;
}

// ---------- ODK upload and settings (logistics) ----------

export function uploadOdk(db, user, fileName, csvText) {
  if (!isLogistics(user)) fail('Only logistics can upload ODK usage.');
  const st = stamp(user, db.stores, db.nowIso);
  db.apply({ type: 'odk_upload', fileName, csvText, stamp: st });
  return db.odk.uploads.at(-1);
}

export function setItemType(db, user, itemId, stockType, reason = '') {
  if (!isLogistics(user)) fail('Only logistics can change settings.');
  if (!STOCK_TYPES.some((t) => t.id === stockType)) fail('Unknown stock type.');
  db.apply({ type: 'set_item_type', itemId, stockType, reason, stamp: stamp(user, db.stores, db.nowIso) });
}

export function setMultiplier(db, user, month, value, reason) {
  if (!isLogistics(user)) fail('Only logistics can change settings.');
  if (!(month >= 1 && month <= 12)) fail('Pick a month.');
  if (!(Number(value) > 0)) fail('The multiplier must be more than 0.');
  if (!reason || !reason.trim()) fail('Say why you are changing it.');
  db.apply({ type: 'set_multiplier', month, value: Number(value), reason: reason.trim(), stamp: stamp(user, db.stores, db.nowIso) });
}

export function setTargetOverride(db, user, storeId, itemId, qty, reason) {
  if (!isLogistics(user)) fail('Only logistics can change targets.');
  if (qty !== null && !(Number(qty) >= 0)) fail('Enter a target of 0 or more.');
  if (!reason || !reason.trim()) fail('Say why you are changing it.');
  db.apply({ type: 'set_target_override', storeId, itemId, qty: qty === null ? null : Number(qty), reason: reason.trim(), stamp: stamp(user, db.stores, db.nowIso) });
}

// Add a facility: name, type, supervisor, linked ITP, starting stock. It shows "Estimated target"
// until it has 3 months of data.
export function addFacility(db, user, { label, type, supervisor, linkedItpId = null, lga = '', startingStock = {}, reason = '' }) {
  if (!isLogistics(user)) fail('Only logistics can add a facility.');
  if (!label || !label.trim()) fail('Enter the facility name.');
  if (!['OTP', 'ITP'].includes(type)) fail('Pick OTP or ITP.');
  label = label.trim().replace(/\s+(OTP|ITP)$/i, ''); // "Kafarati OTP" and "Kafarati" are the same name
  const id = siteIdFromLabel(label);
  if (db.stores.some((s) => s.id === id)) fail(`A facility called ${label} already exists.`);
  const st = stamp(user, db.stores, db.nowIso);
  const store = {
    id, label: label.trim(), name: `${label.trim()} ${type}`, type, siteType: type === 'OTP' ? 'Outpatient site' : 'Inpatient site',
    lga, linkedItpId, linkedItpLabel: linkedItpId ? db.store(linkedItpId).label : null, supervisor: supervisor || null,
    odkSiteId: type === 'OTP' ? id : null,
  };
  db.apply({ type: 'add_store', store, reason: reason.trim(), stamp: st });
  const entries = Object.entries(startingStock).filter(([, q]) => q !== null && q !== '').map(([itemId, q]) => ({
    id: newId('e'), kind: 'opening', storeId: id, itemId, qty: Number(q), ts: db.nowIso, stamp: st,
  }));
  if (entries.length) db.apply({ type: 'ledger_batch', entries, stamp: st });
  return db.store(id);
}
