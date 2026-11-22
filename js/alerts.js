// "Needs attention": alerts in the agreed order (CLAUDE.md, "Alert order").
// Ranked by how soon a child could go without treatment, then trust in the numbers, then planning:
//   Stock-out risk: 1 Out of stock, 2 Order now, 3 Shipment overdue (in Sent over 72 hours)
//   Data checks:    4 Escalation, 5 Count difference, 6 Not counted today, 7 Approval waiting
//   Planning:       8 Central store below target, 9 Will expire before use, 10 Too much (transfer suggestions)
// Within one type: therapeutic food, medication, consumables, non-consumables; then the most urgent
// (fewest days left, or the oldest alert); then bin card order.
//
// Button labels marked "label TO CONFIRM" wait for the final design files.

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

export const ALERT_TYPES = {
  OUT: { rank: 1, group: 'stockout', label: 'Out of stock', action: { id: 'emergency', label: 'Send emergency stock (label TO CONFIRM)' } },
  ORDER_NOW: { rank: 2, group: 'stockout', label: 'Order now', action: { id: 'emergency', label: 'Send emergency stock (label TO CONFIRM)' } },
  OVERDUE: { rank: 3, group: 'stockout', label: 'Shipment overdue', action: { id: 'shipment', label: 'Check shipment (label TO CONFIRM)' } },
  ESCALATION: { rank: 4, group: 'data', label: 'Escalation', action: { id: 'history', label: 'See history (label TO CONFIRM)' } },
  COUNT_DIFF: { rank: 5, group: 'data', label: 'Count difference', action: { id: 'recount', label: 'Record a recount' } },
  NOT_COUNTED: { rank: 6, group: 'data', label: 'Not counted today', action: { id: 'contact', label: 'Contact facility (label TO CONFIRM)' } },
  APPROVAL: { rank: 7, group: 'data', label: 'Approval waiting', action: { id: 'approve', label: 'Review correction (label TO CONFIRM)' } },
  CENTRAL_BELOW: { rank: 8, group: 'planning', label: 'Central store below target', action: { id: 'central', label: 'Receive at central store' } },
  EXPIRY: { rank: 9, group: 'planning', label: 'Will expire before use', action: { id: 'transfer', label: 'Move to another facility' } },
  TRANSFER: { rank: 10, group: 'planning', label: 'Too much', action: { id: 'transfer', label: 'Plan transfer (label TO CONFIRM)' } },
};

const TYPE_ORDER = Object.fromEntries(STOCK_TYPES.map((t, i) => [t.id, i]));

function itemOrder(item) {
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
  return { type, rank: t.rank, group: t.group, label: t.label, action: t.action, ...fields };
}

function storeRank(db, storeId) {
  return db.stores.findIndex((s) => s.id === storeId);
}

// One alert per facility for each stock status, listing every item (in alert item order).
function statusAlerts(db, type, status) {
  const out = [];
  for (const s of db.stores) {
    const views = storeItems(db, s.id).filter((v) => v.status === status);
    if (!views.length) continue;
    const items = views
      .map((v) => ({ itemId: v.item.id, name: v.item.name, onHand: v.onHand, days: v.days, lastsUntil: v.lastsUntil, key: itemKey(v.item, v.status === STATUS.OUT ? 0 : v.days) }))
      .sort((a, b) => compareKeys(a.key, b.key));
    out.push(make(type, { storeId: s.id, items, key: [...items[0].key, storeRank(db, s.id)] }));
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
      storeId: sh.toStoreId, shipmentId: sh.id, number: sh.number, hours: hoursInSent(db, sh), sentAt: sh.steps.sent.at,
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
      managementDate: esc.managementDate, itemIds: items.map((i) => i.id),
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

  // 6. Not counted today: facilities with no count submitted today (oldest last count first).
  // Single blank rows (for example TB Bucket) show on the facility's own screen, not here.
  for (const s of db.stores) {
    if (s.type !== 'OTP' && s.type !== 'ITP') continue;
    const views = storeItems(db, s.id);
    if (views.some((v) => v.countedToday)) continue;
    let last = null;
    for (const v of views) {
      const c = latestCount(db, s.id, v.item.id);
      if (c && (!last || c.ts > last)) last = c.ts;
    }
    alerts.push(make('NOT_COUNTED', { storeId: s.id, lastCountAt: last, key: [0, last || '', storeRank(db, s.id)] }));
  }

  // 7. Approval waiting: corrections waiting for a second named person (oldest first).
  for (const e of pendingApprovals(db)) {
    const it = db.item(e.itemId);
    alerts.push(make('APPROVAL', { storeId: e.storeId, itemId: e.itemId, entryId: e.id, qty: e.qty, requestedBy: e.stamp.byName, key: [TYPE_ORDER[it.type], e.ts, itemOrder(it)] }));
  }

  // 8. Central store below its 3-month target, counting stock on order.
  for (const v of centralBelowTarget(db)) {
    alerts.push(make('CENTRAL_BELOW', {
      storeId: 'central', itemId: v.item.id, onHand: v.onHand, onOrder: v.onOrder, monthsInclOrder: v.monthsInclPipeline,
      target: v.target.qty, key: [TYPE_ORDER[v.item.type], v.monthsInclPipeline ?? 0, itemOrder(v.item)],
    }));
  }

  // 9. Will expire before use: one alert per item and store, listing the batches.
  for (const s of db.stores) {
    for (const it of db.itemsForStore(s.id)) {
      const v = stockView(db, s.id, it.id);
      if (!v.onHand) continue;
      const batches = expiryFlags(db, s.id, it.id, v.lastsUntil);
      if (!batches.length) continue;
      alerts.push(make('EXPIRY', {
        storeId: s.id, itemId: it.id, batches, qty: batches.reduce((t, b) => t + b.qty, 0), expiry: batches[0].expiry,
        lastsUntil: v.lastsUntil, expired: batches.some((b) => b.expired),
        key: [TYPE_ORDER[it.type], batches[0].expiry, itemOrder(it)],
      }));
    }
  }

  // 10. Too much: transfer suggestions to a site that needs the stock.
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

// Facility home and supervisor home: the same order without headings.
export function alertsForStores(db, storeIds) {
  const set = new Set(storeIds);
  return needsAttention(db).flatMap((g) => g.alerts).filter((a) => set.has(a.storeId) || set.has(a.toStoreId));
}
