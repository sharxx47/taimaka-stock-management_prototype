// "Needs attention": alerts in the agreed order (CLAUDE.md, "Alert order").
// Ranked by how soon a child could go without treatment, then trust in the numbers, then planning:
//   Stock-out risk: 1 Out of stock, 2 Order now, 3 Shipment overdue (in Sent over 72 hours)
//   Data checks:    4 Escalation, 5 Count difference, 6 Store problem, 7 Not counted today (including counts
//                   submitted with blank rows), 8 Approval waiting
//   Planning:       9 Central store below target, 10 Will expire before use, 11 Too much (transfer suggestions)
// Within one type: therapeutic food, medication, consumables, non-consumables; then the most urgent
// (fewest days left, or the oldest alert); then bin card order.
// Pill labels and button labels come from the final design files (Logistics dashboard).

import { STOCK_TYPES } from './config.js';
import {
  STATUS, stockView, storeItems, escalation, evaluateCount, latestCount, today, hoursInSent, sentTooLong,
  centralBelowTarget, expiryFlags, suggestTransfers,
} from './stock.js';
import { pendingApprovals } from './actions.js';

export const ALERT_GROUPS = [
  { id: 'stockout', label: 'Stock-out risk' },
  { id: 'data', label: 'Data checks' },
  { id: 'planning', label: 'Planning' },
];

// pill: the chip class and icon; label: the pill word.
export const ALERT_TYPES = {
  OUT: { rank: 1, group: 'stockout', label: 'Out of stock', pill: 'out', banner: 'out', action: { id: 'emergency', label: 'Send emergency shipment', icon: 'truck' } },
  ORDER_NOW: { rank: 2, group: 'stockout', label: 'Order now', pill: 'order', banner: 'order', action: { id: 'emergency', label: 'Send emergency shipment', icon: 'truck' } },
  OVERDUE: { rank: 3, group: 'stockout', label: 'Sent over 72 hours', pill: 'order', icon: 'transit', banner: 'order', action: { id: 'shipment', label: 'Check shipment', icon: 'truck', kind: 'secondary' } },
  ESCALATION: { rank: 4, group: 'data', label: 'Escalation', pill: 'order', banner: 'order', action: { id: 'history', label: 'View history', icon: 'history', kind: 'secondary' } },
  COUNT_DIFF: { rank: 5, group: 'data', label: 'Count difference', pill: 'check', banner: 'low', action: { id: 'recount', label: 'Plan a recount', icon: 'recount', kind: 'secondary' } },
  STORE_PROBLEM: { rank: 6, group: 'data', label: 'Store problem', pill: 'order', banner: 'order', action: { id: 'note', label: 'Add a note', icon: 'note', kind: 'secondary' } },
  NOT_COUNTED: { rank: 7, group: 'data', label: 'Not counted today', pill: 'nc', banner: 'nc', action: { id: 'remind', label: 'Send a reminder', icon: 'bell', kind: 'secondary' } },
  APPROVAL: { rank: 8, group: 'data', label: 'Approval waiting', pill: 'wait', banner: 'wait', action: { id: 'remind_approver', label: 'Remind approver', icon: 'bell', kind: 'secondary' } },
  CENTRAL_BELOW: { rank: 9, group: 'planning', label: 'Central store low', pill: 'low', banner: 'low', action: { id: 'supplier_order', label: 'Plan supplier order', icon: 'truck', kind: 'secondary' } },
  EXPIRY: { rank: 10, group: 'planning', label: 'Will expire before use', pill: 'exp', banner: 'exp', action: { id: 'move', label: 'Move to another facility', icon: 'move', kind: 'secondary' } },
  TRANSFER: { rank: 11, group: 'planning', label: 'Too much', pill: 'much', banner: 'much', action: { id: 'transfer', label: 'Plan transfer', icon: 'move', kind: 'secondary' } },
};

const TYPE_ORDER = Object.fromEntries(STOCK_TYPES.map((t, i) => [t.id, i]));

export function itemOrder(item) {
  return item.binCardOrder ?? 100 + (item.itpOrder ?? 0);
}

// Sort key of one item inside an alert: stock type, then fewest days left, then bin card order.
function itemKey(item, days) {
  return [TYPE_ORDER[item.type] ?? 9, Number.isFinite(days) ? days : 1e9, itemOrder(item)];
}

function compareKeys(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

function make(type, fields) {
  const t = ALERT_TYPES[type];
  return { type, rank: t.rank, group: t.group, label: t.label, pill: t.pill, icon: t.icon || t.pill, banner: t.banner, action: { ...t.action }, ...fields };
}

function storeRank(db, storeId) {
  return db.stores.findIndex((s) => s.id === storeId);
}

// The store problem still open at a store: the latest submitted count, log or recount where the storage
// box was not ticked. null once a later count confirms the store is cool, dry and locked.
export function storeProblem(db, storeId) {
  const sess = [...db.countSessions.values()].filter((x) => x.storeId === storeId && x.submittedAt <= db.nowIso).sort((x, y) => x.submittedAt.localeCompare(y.submittedAt)).at(-1);
  if (!sess || sess.storeCheck || !(sess.storeProblems || []).length) return null;
  return { problems: sess.storeProblems, note: sess.storeNote || '', at: sess.submittedAt, byName: sess.stamp?.byName || null, sessionId: sess.id };
}

// The open emergency request for a facility (Requested or Approved, not yet sent), if any.
export function openEmergency(db, storeId) {
  return [...db.shipments.values()].filter((sh) => sh.type === 'emergency' && sh.toStoreId === storeId && (sh.state === 'requested' || sh.state === 'approved')).at(-1) || null;
}

// An emergency shipment already on its way to a facility (Sent), if any, for any of these items.
export function emergencyOnTheWay(db, storeId, itemIds = null) {
  return [...db.shipments.values()].filter((sh) => sh.type === 'emergency' && sh.toStoreId === storeId && sh.state === 'sent' && (!itemIds || sh.lines.some((l) => itemIds.includes(l.itemId)))).at(-1) || null;
}

// One alert per facility for each stock status, listing every item (in alert item order).
function statusAlerts(db, type, status) {
  const out = [];
  for (const s of db.stores) {
    if (s.type === 'CENTRAL') continue;
    const views = storeItems(db, s.id).filter((v) => v.status === status);
    if (!views.length) continue;
    const items = views
      .map((v) => ({ itemId: v.item.id, name: v.item.name, onHand: v.onHand, days: v.days, months: v.months, lastsUntil: v.lastsUntil, key: itemKey(v.item, v.status === STATUS.OUT ? 0 : v.days) }))
      .sort((a, b) => compareKeys(a.key, b.key));
    const request = openEmergency(db, s.id);
    const onTheWay = request ? null : emergencyOnTheWay(db, s.id, items.map((x) => x.itemId));
    const a = make(type, { storeId: s.id, items, request, onTheWay, key: [...items[0].key, storeRank(db, s.id)] });
    if (onTheWay) a.action = { id: 'shipment', label: 'Check shipment', icon: 'truck', kind: 'secondary', shipmentId: onTheWay.id };
    // A request from the facility is waiting: the next step is to approve it.
    if (request && request.state === 'requested' && request.steps.requested.by !== undefined && db.user(request.steps.requested.by).kind === 'facility') {
      a.action = { id: 'approve_request', label: 'Approve request', icon: 'tick', kind: 'primary', shipmentId: request.id };
    } else if (request) {
      a.action = { ...a.action, shipmentId: request.id };
    }
    out.push(a);
  }
  return out;
}

export function needsAttention(db) {
  const alerts = [];
  const d = today(db);

  // 1 and 2. Out of stock, Order now.
  alerts.push(...statusAlerts(db, 'OUT', STATUS.OUT));
  alerts.push(...statusAlerts(db, 'ORDER_NOW', STATUS.ORDER_NOW));

  // 3. Shipment overdue: in Sent for more than 72 hours (oldest first).
  for (const sh of db.shipments.values()) {
    if (!sentTooLong(db, sh)) continue;
    const first = sh.lines.map((l) => db.item(l.itemId)).sort((a, b) => compareKeys(itemKey(a, 0), itemKey(b, 0)))[0];
    alerts.push(make('OVERDUE', {
      storeId: sh.toStoreId, fromStoreId: sh.fromStoreId, shipmentId: sh.id, number: sh.number, hours: hoursInSent(db, sh), sentAt: sh.steps.sent.at,
      key: [TYPE_ORDER[first.type], -hoursInSent(db, sh), itemOrder(first)],
    }));
  }

  // 4. Escalation: repeated count differences that reached the supervisor or management.
  for (const s of db.stores) {
    const esc = escalation(db, s.id);
    if (esc.level !== 'supervisor' && esc.level !== 'management') continue;
    const items = [...new Set(esc.run.map((f) => f.entry.itemId))].map((id) => db.item(id));
    const top = items.sort((a, b) => compareKeys(itemKey(a, 0), itemKey(b, 0)))[0];
    alerts.push(make('ESCALATION', {
      storeId: s.id, level: esc.level, supervisor: esc.supervisor, flagCount: esc.run.length, firstFlagDate: esc.firstFlagDate,
      supervisorSince: esc.supervisorSince, managementDate: esc.managementDate, itemIds: items.map((i) => i.id), run: esc.run,
      key: [TYPE_ORDER[top.type], esc.firstFlagDate, itemOrder(top)],
    }));
  }

  // 5. Count difference: RUTF differences at or above the alert level alert logistics the same day.
  // (Other items go to the facility first and reach logistics through escalation.)
  for (const s of db.stores) {
    for (const it of db.itemsForStore(s.id)) {
      const c = latestCount(db, s.id, it.id, { onDate: d });
      const ev = c ? evaluateCount(db, c) : null;
      if (!ev || !ev.applicable || !ev.alertLogistics) continue;
      alerts.push(make('COUNT_DIFF', {
        storeId: s.id, itemId: it.id, entryId: c.id, expected: ev.expected, counted: ev.counted, diff: ev.diff,
        key: [TYPE_ORDER[it.type], c.ts, itemOrder(it)],
      }));
    }
  }

  // 6. Store problem: the latest submitted count or log did not confirm "Store is cool, dry and locked today".
  // It clears at the next submitted count where the box is ticked.
  for (const s of db.stores) {
    const p = storeProblem(db, s.id);
    if (p) alerts.push(make('STORE_PROBLEM', { storeId: s.id, problem: p, key: [0, p.at, storeRank(db, s.id)] }));
  }

  // 7. Not counted today: one alert listing every facility with no count submitted today (oldest last count
  // first), and every facility whose count today left items blank.
  const notCounted = [];
  const partial = [];
  for (const s of db.stores) {
    if (s.type !== 'OTP' && s.type !== 'ITP') continue;
    const views = storeItems(db, s.id);
    if (views.some((v) => v.countedToday)) {
      const blank = views.filter((v) => !v.countedToday);
      if (blank.length) partial.push({ storeId: s.id, itemIds: blank.map((v) => v.item.id) });
      continue;
    }
    let last = null;
    for (const v of views) {
      const c = latestCount(db, s.id, v.item.id);
      const t = c ? (c.submittedAt || c.ts) : null;
      if (t && (!last || t > last)) last = t;
    }
    notCounted.push({ storeId: s.id, lastCountAt: last });
  }
  if (notCounted.length || partial.length) {
    notCounted.sort((a, b) => (a.lastCountAt || '').localeCompare(b.lastCountAt || '') || storeRank(db, a.storeId) - storeRank(db, b.storeId));
    partial.sort((a, b) => storeRank(db, a.storeId) - storeRank(db, b.storeId));
    const first = notCounted[0] || partial[0];
    alerts.push(make('NOT_COUNTED', {
      storeId: first.storeId, stores: notCounted, partial,
      storeIds: [...notCounted.map((x) => x.storeId), ...partial.map((x) => x.storeId)],
      key: [0, notCounted[0] ? notCounted[0].lastCountAt || '' : 'z'],
    }));
  }

  // 8. Approval waiting: corrections waiting for a second named person (oldest first).
  for (const e of pendingApprovals(db)) {
    const it = db.item(e.itemId);
    alerts.push(make('APPROVAL', {
      storeId: e.storeId, itemId: e.itemId, entryId: e.id, qty: e.qty, reason: e.reason, requestedBy: e.stamp.byName, at: e.ts,
      approver: db.store(e.storeId).supervisor, key: [TYPE_ORDER[it.type], e.ts, itemOrder(it)],
    }));
  }

  // 9. Central store below its 3-month target, counting stock on order.
  for (const v of centralBelowTarget(db)) {
    alerts.push(make('CENTRAL_BELOW', {
      storeId: 'central', itemId: v.item.id, onHand: v.onHand, onOrder: v.onOrder, monthsInclOrder: v.monthsInclPipeline,
      target: v.target.qty, key: [TYPE_ORDER[v.item.type], v.monthsInclPipeline ?? 0, itemOrder(v.item)],
    }));
  }

  // 10. Will expire before use: one alert per item and store, listing the batches.
  for (const s of db.stores) {
    for (const it of db.itemsForStore(s.id)) {
      const v = stockView(db, s.id, it.id);
      if (!v.onHand) continue;
      const batches = expiryFlags(db, s.id, it.id, v.lastsUntil);
      if (!batches.length) continue;
      alerts.push(make('EXPIRY', {
        storeId: s.id, itemId: it.id, batches, qty: batches.reduce((t, b) => t + b.qty, 0), unused: batches.reduce((t, b) => t + b.unusedAtExpiry, 0),
        expiry: batches[0].expiry, lastsUntil: v.lastsUntil, expired: batches.some((b) => b.expired),
        key: [TYPE_ORDER[it.type], batches[0].expiry, itemOrder(it)],
      }));
    }
  }

  // 11. Too much: transfer suggestions to a site that needs the stock.
  for (const t of suggestTransfers(db)) {
    const it = db.item(t.lines[0].itemId);
    const days = stockView(db, t.toStoreId, it.id).days;
    alerts.push(make('TRANSFER', { storeId: t.fromStoreId, toStoreId: t.toStoreId, itemId: it.id, qty: t.lines[0].qty, key: itemKey(it, days) }));
  }

  alerts.sort((a, b) => a.rank - b.rank || compareKeys(a.key, b.key));
  return ALERT_GROUPS.map((g) => {
    const list = alerts.filter((a) => a.group === g.id);
    return { ...g, count: list.length, heading: `${g.label} (${list.length})`, alerts: list };
  }).filter((g) => g.count > 0); // groups with no alerts are hidden
}

// Supervisor home and other filtered views: the same order without headings.
export function alertsForStores(db, storeIds) {
  const set = new Set(storeIds);
  return needsAttention(db).flatMap((g) => g.alerts).filter((a) => set.has(a.storeId) || set.has(a.toStoreId) || (a.storeIds || []).some((x) => set.has(x)));
}
