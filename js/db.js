// The in-browser database. Everything is an append-only event: ledger entries, approvals,
// shipment steps, purchase orders, settings changes, ODK uploads and count submissions.
// The demo seed is rebuilt from the CSV copies on every load; only the events people add are saved
// (in localStorage, see storage.js). Replaying seed + saved events gives the same state every time.

import { buildItems, attachItpOrder, makeAliasIndex, itemsForStore } from './items.js';
import { buildStores } from './facilities.js';
import { buildUsers } from './users.js';
import { parseCsvObjects } from './csv.js';
import { parseOdkCsv, closest } from './usage.js';
import { Ledger } from './ledger.js';
import { TODAY } from './config.js';

export class Db {
  constructor({ facilityCsv, itpCsv, odkCsv, nowIso }) {
    const itp = parseCsvObjects(itpCsv).records;
    this.itpRecords = itp;
    this.items = attachItpOrder(buildItems(itp), itp);
    this.itemById = new Map(this.items.map((i) => [i.id, i]));
    this.itemIdFor = makeAliasIndex(this.items);
    this.stores = buildStores(parseCsvObjects(facilityCsv).records);
    this.users = buildUsers(this.stores);
    this.nowIso = nowIso;
    this.ledger = new Ledger();
    this.shipments = new Map();
    this.purchaseOrders = new Map();
    this.countSessions = new Map();
    this.notes = [];
    this.settings = {
      multipliers: {}, // month 1 to 12 -> value (default 1.0)
      multiplierLog: [],
      targetOverrides: new Map(), // "store|item" -> { qty, reason, stamp }
      overrideLog: [],
      typeLog: [],
      facilityLog: [], // facilities added or changed: { storeId, text, reason, stamp }
    };
    this.odk = { usage: {}, months: [], source: 'bundled', uploads: [], text: odkCsv, bundledText: odkCsv };
    this.loadOdk(odkCsv, 'bundled');
    // Test sign-in safety (round 4): wrong PIN tries and locks, unlock requests, removed access.
    this.accounts = { pin: {}, unlockRequests: [], removed: new Map(), log: [] };
    this.userEvents = []; // events added in this browser (saved to localStorage)
    this.rev = 0;
    this._memo = new Map();
    this._memoRev = -1;
  }

  // Parses an ODK file. Nothing changes here: the upload preview and loadOdk both use it.
  parseOdk(text) {
    const year = Number(TODAY.slice(0, 4));
    const siteIds = this.stores.filter((s) => s.odkSiteId).map((s) => s.odkSiteId);
    const names = this.items.flatMap((it) => it.aliases.map((a) => ({ a, name: it.name })));
    return parseOdkCsv(text, {
      stores: this.stores, itemIdFor: this.itemIdFor, year,
      closestSite: (w) => closest(w, siteIds),
      closestItem: (w) => {
        const a = closest(w, names.map((x) => x.a));
        if (!a) return null;
        const it = names.find((x) => x.a === a);
        return it.a === it.name ? it.name : `${it.a} (shown as ${it.name})`;
      },
    });
  }

  // The bundled file replaces everything. An upload merges: each site, item and month in the file replaces
  // the current value; anything the file does not have (a missing month, a row it cannot read, a site that is
  // not in it) keeps its current value, so an upload never deletes usage data (decisions log, round 4).
  loadOdk(text, source) {
    const parsed = this.parseOdk(text);
    if (!parsed.ok) return parsed;
    if (source === 'bundled') {
      this.odk.usage = parsed.usage;
      this.odk.months = parsed.months;
    } else {
      this.odk.usage = mergeUsage(this.odk.usage, parsed.usage);
      this.odk.months = [...new Set([...this.odk.months, ...parsed.months])].sort();
    }
    this.odk.source = source;
    this.odk.text = text;
    this.touch();
    return parsed;
  }

  touch() {
    this.rev++;
  }

  memo(key, fn) {
    if (this._memoRev !== this.rev) { this._memo.clear(); this._memoRev = this.rev; }
    if (this._memo.has(key)) return this._memo.get(key);
    const v = fn();
    this._memo.set(key, v);
    return v;
  }

  setNow(nowIso) {
    if (nowIso !== this.nowIso) { this.nowIso = nowIso; this.touch(); }
  }

  store(id) {
    const s = this.stores.find((x) => x.id === id);
    if (!s) throw new Error(`Unknown store ${id}`);
    return s;
  }

  item(id) {
    const it = this.itemById.get(id);
    if (!it) throw new Error(`Unknown item ${id}`);
    return it;
  }

  user(id) {
    const u = this.users.find((x) => x.id === id);
    if (!u) throw new Error(`Unknown user ${id}`);
    return u;
  }

  itemsForStore(storeId) {
    return itemsForStore(this.items, this.store(storeId));
  }

  holds(storeId, itemId) {
    const s = this.store(storeId);
    const it = this.item(itemId);
    return s.type === 'CENTRAL' || (s.type === 'OTP' ? it.heldAtOtp : it.heldAtItp);
  }

  // Applies one event. origin 'user' events are kept for saving; 'seed' events are rebuilt each load.
  apply(event, origin = 'user') {
    const handler = HANDLERS[event.type];
    if (!handler) throw new Error(`Unknown event type ${event.type}`);
    handler(this, event);
    if (origin === 'user') this.userEvents.push(event);
    this.touch();
    return event;
  }
}

export function mergeUsage(current, incoming) {
  const out = structuredClone(current);
  for (const [storeId, items] of Object.entries(incoming)) {
    out[storeId] ||= {};
    for (const [itemId, byMonth] of Object.entries(items)) out[storeId][itemId] = { ...(out[storeId][itemId] || {}), ...byMonth };
  }
  return out;
}

const PIN_LOCK_MS = 60 * 1000; // prototype: 1 minute (the real app would use a longer time, see config.js)

const HANDLERS = {
  ledger(db, ev) {
    const e = { ...ev.entry };
    if (e.kind === 'count' && e.expected === undefined) {
      // Expected stock at the count cut-off: only transactions timestamped before the count.
      e.expected = db.ledger.balance(e.storeId, e.itemId, { beforeMs: Date.parse(e.ts), strict: true }).qty;
    }
    db.ledger.add(e);
  },
  ledger_batch(db, ev) {
    for (const entry of ev.entries) HANDLERS.ledger(db, { entry });
  },
  approval(db, ev) {
    db.ledger.setApproval(ev.targetId, ev.decision, ev.stamp);
  },
  shipment_create(db, ev) {
    if (db.shipments.has(ev.shipment.id)) throw new Error(`Shipment ${ev.shipment.id} already exists`);
    db.shipments.set(ev.shipment.id, {
      ...structuredClone(ev.shipment),
      state: 'requested',
      steps: { requested: ev.stamp, approved: null, sent: null, received: null },
    });
  },
  shipment_step(db, ev) {
    const sh = db.shipments.get(ev.shipmentId);
    if (!sh) throw new Error(`Unknown shipment ${ev.shipmentId}`);
    const order = ['requested', 'approved', 'sent', 'received'];
    if (order.indexOf(ev.step) !== order.indexOf(sh.state) + 1) throw new Error(`Shipment ${sh.number} cannot go from ${sh.state} to ${ev.step}`);
    sh.steps[ev.step] = ev.stamp;
    sh.state = ev.step;
    for (const upd of ev.lines || []) {
      const line = sh.lines.find((l) => l.itemId === upd.itemId);
      if (!line) throw new Error(`Shipment ${sh.number} has no ${upd.itemId}`);
      Object.assign(line, structuredClone(upd));
    }
    if (ev.ledger) for (const entry of ev.ledger) HANDLERS.ledger(db, { entry });
  },
  po_create(db, ev) {
    db.purchaseOrders.set(ev.po.id, { ...ev.po, stamp: ev.stamp });
  },
  count_submit(db, ev) {
    db.countSessions.set(ev.session.id, { ...structuredClone(ev.session), stamp: ev.stamp });
    for (const entry of ev.entries) HANDLERS.ledger(db, { entry });
  },
  note(db, ev) {
    db.notes.push({ targetId: ev.targetId, text: ev.text, stamp: ev.stamp });
  },
  set_item_type(db, ev) {
    const it = db.item(ev.itemId);
    db.settings.typeLog.push({ itemId: ev.itemId, from: it.type, to: ev.stockType, reason: ev.reason, stamp: ev.stamp });
    it.type = ev.stockType;
  },
  set_multiplier(db, ev) {
    db.settings.multiplierLog.push({ month: ev.month, from: db.settings.multipliers[ev.month] ?? 1, to: ev.value, reason: ev.reason, stamp: ev.stamp });
    db.settings.multipliers[ev.month] = ev.value;
  },
  set_target_override(db, ev) {
    const k = `${ev.storeId}|${ev.itemId}`;
    db.settings.overrideLog.push({ key: k, qty: ev.qty, reason: ev.reason, stamp: ev.stamp });
    if (ev.qty === null) db.settings.targetOverrides.delete(k);
    else db.settings.targetOverrides.set(k, { qty: ev.qty, reason: ev.reason, stamp: ev.stamp });
  },
  add_store(db, ev) {
    if (db.stores.some((s) => s.id === ev.store.id)) throw new Error(`A facility called ${ev.store.label} already exists`);
    db.stores.push({ ...ev.store, addedInDemo: true });
    // A test user for the new facility, and the facility on its supervisor's list.
    const role = ev.store.type === 'ITP' ? 'Pharmacy Technician' : 'Lead Triage Officer';
    if (!db.users.some((u) => u.storeId === ev.store.id)) db.users.push({ id: `${ev.store.type === 'ITP' ? 'pharm' : 'lto'}_${ev.store.id}`, name: null, role, kind: 'facility', storeId: ev.store.id });
    const sup = db.users.find((u) => u.kind === 'supervisor' && u.name === ev.store.supervisor);
    if (sup && !sup.storeIds.includes(ev.store.id)) sup.storeIds.push(ev.store.id);
    db.settings.facilityLog.push({ storeId: ev.store.id, text: `Added ${ev.store.name}${ev.store.supervisor ? `, supervisor ${ev.store.supervisor}` : ''}`, reason: ev.reason || '', stamp: ev.stamp });
  },
  odk_upload(db, ev) {
    const res = db.loadOdk(ev.csvText, 'upload');
    if (!res.ok) throw new Error(res.errors.join(' '));
    db.odk.uploads.push({ fileName: ev.fileName, stamp: ev.stamp, siteCount: res.siteCount, itemCount: res.itemCount, months: res.months, skipped: res.problems.length });
  },
  // Wrong PIN: after the third wrong try in a row the account locks for a short time and unlocks by itself.
  pin_fail(db, ev) {
    const p = (db.accounts.pin[ev.userId] ||= { fails: 0, lockedUntil: null });
    p.fails += 1;
    if (p.fails >= 3) { p.fails = 0; p.lockedUntil = new Date(Date.parse(ev.at) + PIN_LOCK_MS).toISOString(); p.lockedAt = ev.at; }
  },
  pin_ok(db, ev) {
    const p = db.accounts.pin[ev.userId];
    if (p) { p.fails = 0; p.lockedUntil = null; }
    for (const r of db.accounts.unlockRequests) if (r.userId === ev.userId && !r.closedAt) { r.closedAt = ev.at; r.closedBy = 'signed in'; }
  },
  unlock_request(db, ev) {
    if (db.accounts.unlockRequests.some((r) => r.userId === ev.userId && !r.closedAt)) return;
    db.accounts.unlockRequests.push({ userId: ev.userId, at: ev.at, closedAt: null });
  },
  account_unlock(db, ev) {
    const p = db.accounts.pin[ev.userId];
    if (p) { p.fails = 0; p.lockedUntil = null; }
    for (const r of db.accounts.unlockRequests) if (r.userId === ev.userId && !r.closedAt) { r.closedAt = ev.stamp.at; r.closedBy = ev.stamp.byName; }
    db.accounts.log.push({ userId: ev.userId, text: 'Unlocked', reason: ev.reason || '', stamp: ev.stamp });
  },
  access_remove(db, ev) {
    db.accounts.removed.set(ev.userId, { reason: ev.reason, stamp: ev.stamp });
    db.accounts.log.push({ userId: ev.userId, text: 'Access removed', reason: ev.reason, stamp: ev.stamp });
  },
  access_restore(db, ev) {
    db.accounts.removed.delete(ev.userId);
    db.accounts.log.push({ userId: ev.userId, text: 'Access restored', reason: ev.reason, stamp: ev.stamp });
  },
};
