// Stock logic: use, days left, "Lasts until", months of stock, targets, top-ups, statuses,
// count differences, escalation and expiry. All functions read from a Db (see db.js) and never change it.

import {
  DAYS_PER_MONTH, AMC_MONTHS, MIN_MONTHS_FOR_FIRM_TARGET, FACILITY_TARGET_MONTHS, CENTRAL_TARGET_MONTHS,
  ORDER_NOW_DAYS, RUNNING_LOW_MONTHS, TOO_MUCH_MONTHS, ABOVE_TARGET_MIN_MONTHS, RUTF_ALERT_SACHETS,
  RUTF_ALERT_DAYS, OTHER_FLAG_PERCENT, OTHER_FLAG_DAYS, ESCALATION_FLAGS, ESCALATION_WINDOW_DAYS,
  MANAGEMENT_AFTER_DAYS, SENT_ALERT_HOURS,
} from './config.js';
import { odkAmc } from './usage.js';
import { ms, dateOf, monthKeyOf, addDays, addMonths, daysBetween, monthIndexOf } from './time.js';
import { BASE_KINDS } from './ledger.js';

const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Statuses. rank = urgent-first order (phone home and any list sorted by urgency):
// Out of stock, Order now, Check (count difference), Running low, Not counted today, Too much, OK, Usage not tracked.
export const STATUS = {
  OUT: { code: 'OUT', label: 'Out of stock', rank: 0 },
  ORDER_NOW: { code: 'ORDER_NOW', label: 'Order now', rank: 1 },
  CHECK: { code: 'CHECK', label: 'Check', rank: 2 },
  LOW: { code: 'LOW', label: 'Running low', rank: 3 },
  NOT_COUNTED: { code: 'NOT_COUNTED', label: 'Not counted today', rank: 4 },
  TOO_MUCH: { code: 'TOO_MUCH', label: 'Too much', rank: 5 },
  OK: { code: 'OK', label: 'OK', rank: 6 },
  NOT_TRACKED: { code: 'NOT_TRACKED', label: 'Usage not tracked', rank: 7 },
  // Central store only: under its 3-month target, counting stock on order (CLAUDE.md, central store rules).
  CENTRAL_LOW: { code: 'CENTRAL_LOW', label: 'Below 3-month target', rank: 3 },
};
export const ABOVE_TARGET = { code: 'ABOVE_TARGET', label: 'Above target' }; // logistics view only
export const ESTIMATED_TARGET = { code: 'ESTIMATED', label: 'Estimated target' }; // logistics view only

export const NO_USAGE_REQUEST_TEXT = 'No usage data for this item. Logistics will set the amount.';

const isFacility = (store) => store.type === 'OTP' || store.type === 'ITP';

export function nowMs(db) {
  return ms(db.nowIso);
}
export function today(db) {
  return dateOf(db.nowIso);
}
export function currentMonth(db) {
  return monthKeyOf(today(db));
}
export function nextMonth(db) {
  return addMonths(currentMonth(db), 1);
}

// ---------- Use ----------

// Average monthly use before any lean-season multiplier. null: usage not tracked for this item here.
export function usageInfo(db, storeId, itemId) {
  return db.memo(`usage|${storeId}|${itemId}`, () => {
    const store = db.store(storeId);
    if (store.type === 'OTP') {
      return odkAmc(db.odk.usage, storeId, itemId, db.odk.months, currentMonth(db));
    }
    if (store.type === 'ITP') return itpLogAmc(db, storeId, itemId);
    // Central store: the whole network's use (every facility that holds the item).
    let total = 0;
    let tracked = false;
    for (const s of db.stores) {
      if (!isFacility(s) || !db.holds(s.id, itemId)) continue;
      const u = usageInfo(db, s.id, itemId);
      if (u && u.amc !== null) { total += u.amc; tracked = true; }
    }
    return tracked ? { amc: total, source: 'network', estimated: false, monthsOfData: null, monthsUsed: null } : null;
  });
}

// ITP use comes only from the stock record: used = previous count + received - today's count.
// That is (expected at the count) - (counted). Monthly totals, then the same AMC rule as ODK.
export function itpUseByMonth(db, storeId, itemId) {
  const byMonth = {};
  let firstBaseDate = null;
  for (const e of db.ledger.entries(storeId, itemId)) {
    if (!BASE_KINDS.has(e.kind)) continue;
    const d = dateOf(e.ts);
    if (!firstBaseDate) firstBaseDate = d;
    if (e.kind !== 'count' || e.expected === null || e.expected === undefined) continue;
    const used = e.expected - e.qty;
    const m = monthKeyOf(d);
    byMonth[m] = (byMonth[m] || 0) + used;
  }
  return { byMonth, firstBaseDate };
}

function itpLogAmc(db, storeId, itemId) {
  const { byMonth, firstBaseDate } = itpUseByMonth(db, storeId, itemId);
  if (!firstBaseDate) return null;
  const cur = currentMonth(db);
  // A month counts as complete when it has ended and the log already had a base before it started.
  const complete = Object.keys(byMonth).filter((m) => m < cur && firstBaseDate < `${m}-01`).sort();
  if (!complete.length) return { amc: null, source: 'log', estimated: true, monthsOfData: 0, monthsUsed: [] };
  const recent = complete.slice(-AMC_MONTHS);
  const amc = recent.reduce((s, m) => s + byMonth[m], 0) / recent.length;
  return {
    amc: Math.max(0, amc), source: 'log', monthsUsed: recent, monthsOfData: complete.length,
    estimated: complete.length < MIN_MONTHS_FOR_FIRM_TARGET,
  };
}

export function multiplier(db, monthKey) {
  return db.settings.multipliers[monthIndexOf(monthKey)] ?? 1;
}

// AMC for a month = base AMC x lean-season multiplier for that month.
export function amc(db, storeId, itemId, monthKey = currentMonth(db)) {
  const u = usageInfo(db, storeId, itemId);
  if (!u || u.amc === null) return null;
  return u.amc * multiplier(db, monthKey);
}

// ---------- Stock position ----------

export function onHand(db, storeId, itemId) {
  return db.ledger.balance(storeId, itemId, { beforeMs: nowMs(db) }).qty;
}

export function inTransitTo(db, storeId, itemId) {
  let q = 0;
  for (const sh of db.shipments.values()) {
    if (sh.state !== 'sent' || sh.toStoreId !== storeId) continue;
    for (const l of sh.lines) if (l.itemId === itemId) q += l.qtySent || 0;
  }
  return q;
}

// Stock on order from suppliers (central store only): ordered minus already received against the order.
export function onOrder(db, itemId) {
  let q = 0;
  for (const po of db.purchaseOrders.values()) {
    if (po.itemId !== itemId) continue;
    q += Math.max(0, po.qty - receivedAgainstPo(db, po.id));
  }
  return q;
}

function receivedAgainstPo(db, poId) {
  let q = 0;
  for (const e of db.ledger.all) if (e.kind === 'received' && e.poId === poId) q += e.qty;
  return q;
}

// Days of stock = on hand / (AMC / 30.4), rounded down to whole days.
export function daysOfStock(qty, monthlyUse) {
  if (qty === null || monthlyUse === null) return null;
  if (monthlyUse <= 0) return Infinity;
  return Math.floor(qty / (monthlyUse / DAYS_PER_MONTH));
}

export function monthsOfStock(qty, monthlyUse) {
  if (qty === null || monthlyUse === null) return null;
  if (monthlyUse <= 0) return Infinity;
  return qty / monthlyUse;
}

// ---------- Targets ----------

// Facility target (max) = 2 months of AMC; central store target = 3 months of network AMC.
// Logistics overrides win; every override and multiplier change carries who, when and why.
export function target(db, storeId, itemId, monthKey = currentMonth(db)) {
  const store = db.store(storeId);
  const months = store.type === 'CENTRAL' ? CENTRAL_TARGET_MONTHS : FACILITY_TARGET_MONTHS;
  const override = db.settings.targetOverrides.get(`${storeId}|${itemId}`) || null;
  const use = amc(db, storeId, itemId, monthKey);
  const mult = multiplier(db, monthKey);
  const u = usageInfo(db, storeId, itemId);
  if (!override && use === null) return null;
  const computed = use === null ? null : use * months;
  const explanations = [];
  if (mult !== 1 && use !== null) {
    const change = db.settings.multiplierLog.filter((c) => c.month === monthIndexOf(monthKey)).at(-1);
    const who = change ? `, changed by ${change.stamp.byName}` : '';
    explanations.push(`Target ${mult > 1 ? 'raised' : 'lowered'}: lean-season multiplier ${mult} for ${MONTH_FULL[monthIndexOf(monthKey) - 1]}${who}`);
  }
  if (override) explanations.push(`Target set by ${override.stamp.byName}: ${override.reason}`);
  return {
    qty: override ? override.qty : Math.round(computed),
    exact: override ? override.qty : computed,
    months,
    monthKey,
    multiplier: mult,
    override,
    estimated: !!(u && u.estimated),
    explanations,
  };
}

// Top-up quantity = target - stock on hand - stock in transit, never negative.
// Exact units (RUTF in sachets), not rounded to whole cartons. Central store also counts stock on order.
export function topUp(db, storeId, itemId, monthKey = currentMonth(db), frozenTarget = null) {
  const t = frozenTarget ?? target(db, storeId, itemId, monthKey)?.exact ?? null;
  if (t === null) return null;
  const have = onHand(db, storeId, itemId);
  if (have === null) return null;
  const pipeline = db.store(storeId).type === 'CENTRAL' ? onOrder(db, itemId) : inTransitTo(db, storeId, itemId);
  return Math.max(0, Math.round(t - have - pipeline));
}

// ---------- Counts and differences ----------

export function countedToday(db, storeId, itemId) {
  const d = today(db);
  const t = nowMs(db);
  return db.ledger.entries(storeId, itemId).some((e) => e.kind === 'count' && dateOf(e.ts) === d && e.tsMs <= t);
}

export function latestCount(db, storeId, itemId, { onDate = null } = {}) {
  const t = nowMs(db);
  const list = db.ledger.entries(storeId, itemId).filter((e) => e.kind === 'count' && e.tsMs <= t && (!onDate || dateOf(e.ts) === onDate));
  return list.at(-1) || null;
}

// RUTF alert level: 1 carton (150 sachets) or 3 days of the site's own use, whichever is smaller.
export function rutfAlertLevel(db, storeId, itemId) {
  const use = amc(db, storeId, itemId);
  if (!use) return RUTF_ALERT_SACHETS;
  return Math.min(RUTF_ALERT_SACHETS, RUTF_ALERT_DAYS * (use / 30.4));
}

// Compares one count with the expected stock at its cut-off.
// RUTF: any difference shows "Check"; at or above the alert level it alerts logistics the same day.
// Other items: flagged when the difference is more than 5% or 2 days of use, whichever is larger.
// Surpluses (more counted than expected) are flagged too. ITP logs have no difference: the app
// works out use from them instead.
export function evaluateCount(db, entry) {
  if (!entry || entry.kind !== 'count') return null;
  const store = db.store(entry.storeId);
  const item = db.item(entry.itemId);
  if (store.type === 'ITP' || entry.expected === null || entry.expected === undefined) {
    return { applicable: false, counted: entry.qty, expected: entry.expected ?? null };
  }
  // A count corrected with "Count correction" (for example a typing mistake) is judged on the corrected amount.
  const corrections = countCorrections(db, entry);
  const counted = Math.round((entry.qty + corrections) * 1e6) / 1e6;
  const diff = Math.round((counted - entry.expected) * 1e6) / 1e6;
  const use = amc(db, entry.storeId, entry.itemId) || 0;
  const daily = use / DAYS_PER_MONTH;
  let flagged;
  let threshold;
  let alertLogistics = false;
  if (item.isRutf) {
    threshold = rutfAlertLevel(db, entry.storeId, entry.itemId);
    flagged = diff !== 0;
    alertLogistics = Math.abs(diff) >= threshold && diff !== 0;
  } else {
    threshold = Math.max(OTHER_FLAG_PERCENT * entry.expected, OTHER_FLAG_DAYS * daily);
    flagged = Math.abs(diff) > threshold;
  }
  return {
    applicable: true, counted, original: entry.qty, corrected: corrections !== 0, expected: entry.expected, diff, surplus: diff > 0,
    flagged, alertLogistics, threshold, isRutf: item.isRutf,
  };
}

// Count corrections in effect for one count.
export function countCorrections(db, entry) {
  let d = 0;
  for (const e of db.ledger.entries(entry.storeId, entry.itemId)) {
    if (e.kind === 'adjustment' && e.correctsId === entry.id && e.reason === 'count_correction' && db.ledger.effectiveMs(e) !== null) d += e.qty;
  }
  return d;
}

// A count not saved yet, judged with the same rules (daily count screen, as you type).
export function previewDifference(db, storeId, itemId, qty) {
  const store = db.store(storeId);
  const item = db.item(itemId);
  const expected = onHand(db, storeId, itemId);
  if (store.type === 'ITP' || expected === null || qty === null) return { applicable: false, expected };
  const diff = Math.round((qty - expected) * 1e6) / 1e6;
  const daily = (amc(db, storeId, itemId) || 0) / DAYS_PER_MONTH;
  const flagged = item.isRutf ? diff !== 0 : Math.abs(diff) > Math.max(OTHER_FLAG_PERCENT * expected, OTHER_FLAG_DAYS * daily);
  return { applicable: true, expected, diff, flagged };
}

// ---------- Escalation ----------

// First to the facility; 3 flags in 14 days goes to the named supervisor; still happening
// 30 days after the first flag goes to management.
export function escalation(db, storeId) {
  const store = db.store(storeId);
  const t = nowMs(db);
  const flags = [];
  for (const e of db.ledger.all) {
    // Logistics recounts are the follow-up to a difference, so only the facility's own counts escalate.
    if (e.storeId !== storeId || e.kind !== 'count' || e.recount || e.tsMs > t) continue;
    const ev = evaluateCount(db, e);
    if (ev && ev.flagged) flags.push({ entry: e, date: dateOf(e.ts), eval: ev });
  }
  flags.sort((a, b) => a.entry.tsMs - b.entry.tsMs);
  const d = today(db);
  const empty = { level: null, flags, supervisor: store.supervisor };
  if (!flags.length) return empty;
  const latest = flags.at(-1);
  if (daysBetween(latest.date, d) > ESCALATION_WINDOW_DAYS) return empty; // nothing recent: resolved
  // The current run: flags with no gap longer than the window.
  let startIdx = flags.length - 1;
  while (startIdx > 0 && daysBetween(flags[startIdx - 1].date, flags[startIdx].date) <= ESCALATION_WINDOW_DAYS) startIdx--;
  const run = flags.slice(startIdx);
  const firstFlagDate = run[0].date;
  // Supervisor: the first time 3 flags fell within 14 days.
  let supervisorSince = null;
  for (let i = ESCALATION_FLAGS - 1; i < run.length; i++) {
    if (daysBetween(run[i - ESCALATION_FLAGS + 1].date, run[i].date) <= ESCALATION_WINDOW_DAYS) { supervisorSince = run[i].date; break; }
  }
  const managementDate = addDays(firstFlagDate, MANAGEMENT_AFTER_DAYS);
  let level = 'facility';
  if (supervisorSince) level = d >= managementDate ? 'management' : 'supervisor';
  const recent = flags.filter((f) => daysBetween(f.date, d) < ESCALATION_WINDOW_DAYS);
  return {
    level, flags, run, recentCount: recent.length, firstFlagDate, supervisorSince, managementDate,
    supervisor: store.supervisor,
  };
}

// ---------- Batches and expiry ----------

// Batches on hand: issues go soonest expiry first, so what remains is the latest-expiring stock.
export function batchesOnHand(db, storeId, itemId) {
  const qty = onHand(db, storeId, itemId);
  if (qty === null || qty <= 0) return [];
  const lots = new Map();
  for (const e of db.ledger.entries(storeId, itemId)) {
    if (!e.batches || (e.kind !== 'opening' && e.kind !== 'received')) continue;
    for (const b of e.batches) {
      const k = `${b.batch}|${b.expiry}`;
      const prev = lots.get(k) || { batch: b.batch, expiry: b.expiry, qty: 0 };
      prev.qty += b.qty;
      lots.set(k, prev);
    }
  }
  const sorted = [...lots.values()].sort((a, b) => (a.expiry < b.expiry ? 1 : -1));
  let remaining = qty;
  const out = [];
  for (const lot of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(lot.qty, remaining);
    out.push({ batch: lot.batch, expiry: lot.expiry, qty: take });
    remaining -= take;
  }
  if (remaining > 0) out.push({ batch: null, expiry: null, qty: remaining }); // batch not recorded
  return out.sort((a, b) => (a.expiry ?? '9999') < (b.expiry ?? '9999') ? -1 : 1); // soonest expiry first
}

// "Will expire before use": a batch expiring before the date the stock would be used up ("Lasts until").
// unusedAtExpiry: how much of the batch is still left on its expiry date at the current rate of use,
// using the soonest-expiring batch first.
export function expiryFlags(db, storeId, itemId, lastsUntil = null) {
  const v = stockView(db, storeId, itemId);
  const lu = lastsUntil ?? v.lastsUntil;
  const d = today(db);
  const daily = v.amc ? v.amc / DAYS_PER_MONTH : 0;
  let before = 0;
  const out = [];
  for (const b of batchesOnHand(db, storeId, itemId)) {
    const start = before;
    before += b.qty;
    if (!b.expiry || !(b.expiry <= d || (lu && b.expiry < lu))) continue;
    const usedByExpiry = b.expiry <= d ? 0 : daily * daysBetween(d, b.expiry);
    const unused = Math.max(0, Math.min(b.qty, before - Math.max(start, usedByExpiry)));
    out.push({ ...b, expired: b.expiry <= d, unusedAtExpiry: Math.round(unused), label: b.expiry <= d ? 'Expired' : 'Will expire before use', action: 'Move to another facility' });
  }
  return out;
}

// ---------- The item view: everything a screen needs for one item at one store ----------

export function stockView(db, storeId, itemId) {
  return db.memo(`view|${storeId}|${itemId}`, () => {
    const store = db.store(storeId);
    const item = db.item(itemId);
    const qty = onHand(db, storeId, itemId);
    const u = usageInfo(db, storeId, itemId);
    const use = amc(db, storeId, itemId);
    const tracked = use !== null;
    const days = tracked ? daysOfStock(qty, use) : null;
    const months = tracked ? monthsOfStock(qty, use) : null;
    const finiteDays = Number.isFinite(days) ? days : null;
    const lastsUntil = finiteDays !== null && qty !== null ? addDays(today(db), finiteDays) : null;
    const counted = countedToday(db, storeId, itemId);
    const todayCount = latestCount(db, storeId, itemId, { onDate: today(db) });
    const check = todayCount ? evaluateCount(db, todayCount) : null;

    const t = target(db, storeId, itemId);
    const transit = store.type === 'CENTRAL' ? 0 : inTransitTo(db, storeId, itemId);
    const ordered = store.type === 'CENTRAL' ? onOrder(db, itemId) : 0;
    const monthsInclPipeline = tracked && qty !== null && use > 0 ? (qty + transit + ordered) / use : null;
    const belowCentralTarget = store.type === 'CENTRAL' && t !== null && qty !== null ? qty + ordered < t.exact : false;

    let status;
    let zeroUse = false;
    if (store.type === 'CENTRAL') {
      // The central store has no daily count; it is judged against 3 months of network use, counting stock on order.
      if (qty === null) status = STATUS.NOT_TRACKED;
      else if (qty <= 0) status = STATUS.OUT;
      else if (!tracked) status = STATUS.NOT_TRACKED;
      else if (belowCentralTarget) status = STATUS.CENTRAL_LOW;
      else status = STATUS.OK;
    } else if (!counted) status = STATUS.NOT_COUNTED;
    else if (qty === null) status = STATUS.NOT_COUNTED;
    else if (qty <= 0) status = STATUS.OUT;
    else if (!tracked) status = STATUS.NOT_TRACKED;
    else if (use === 0) { status = STATUS.TOO_MUCH; zeroUse = true; }
    else if (days <= ORDER_NOW_DAYS) status = STATUS.ORDER_NOW;
    else if (months < RUNNING_LOW_MONTHS) status = STATUS.LOW;
    else if (months > TOO_MUCH_MONTHS) status = STATUS.TOO_MUCH;
    else status = STATUS.OK;

    const needsCheck = !!(check && check.applicable && check.flagged);
    const sortRank = status === STATUS.OUT || status === STATUS.ORDER_NOW ? status.rank : needsCheck ? STATUS.CHECK.rank : status.rank;
    const aboveTarget = isFacility(store) && status === STATUS.OK && months >= ABOVE_TARGET_MIN_MONTHS && months <= TOO_MUCH_MONTHS;
    const lastEntry = db.ledger.entries(storeId, itemId).filter((e) => e.tsMs <= nowMs(db)).at(-1) || null;

    return {
      store, item, onHand: qty, usage: u, amc: use, tracked, days, lastsUntil,
      // Central store: months of stock count stock on order (the same figure as the logistics table).
      months: store.type === 'CENTRAL' ? monthsInclPipeline : months,
      lastsMoreThanYear: days !== null && days > 365,
      noRecentUse: zeroUse,
      status, needsCheck, check, sortRank, aboveTarget,
      estimated: !!(u && u.estimated),
      countedToday: counted, todayCount, countedAt: todayCount ? (todayCount.submittedAt || todayCount.ts) : null,
      lastCount: latestCount(db, storeId, itemId),
      target: t, inTransit: transit, onOrder: ordered, monthsInclPipeline,
      belowCentralTarget,
      isCentral: store.type === 'CENTRAL',
      lastUpdated: lastEntry ? { at: lastEntry.ts, byName: lastEntry.stamp?.byName ?? null, kind: lastEntry.kind } : null,
    };
  });
}

// Every item a store holds, in bin card order (or ITP list order).
export function storeItems(db, storeId) {
  return db.itemsForStore(storeId).map((it) => stockView(db, storeId, it.id));
}

// Urgent-first order: Out of stock, Order now, Check, Running low, Not counted today, Too much, OK, Usage not tracked.
export function urgentFirst(views) {
  return views.map((v, i) => ({ v, i })).sort((a, b) => a.v.sortRank - b.v.sortRank || a.i - b.i).map(({ v }) => v);
}

// Facility home summary: "4 items out of stock, 1 running low, 7 with too much".
export function facilitySummary(db, storeId) {
  const views = storeItems(db, storeId);
  const c = { out: 0, orderNow: 0, low: 0, centralLow: 0, tooMuch: 0, ok: 0, notCounted: 0, notTracked: 0, check: 0, total: views.length };
  for (const v of views) {
    if (v.status === STATUS.OUT) c.out++;
    else if (v.status === STATUS.ORDER_NOW) c.orderNow++;
    else if (v.status === STATUS.LOW) c.low++;
    else if (v.status === STATUS.CENTRAL_LOW) c.centralLow++;
    else if (v.status === STATUS.TOO_MUCH) c.tooMuch++;
    else if (v.status === STATUS.OK) c.ok++;
    else if (v.status === STATUS.NOT_COUNTED) c.notCounted++;
    else if (v.status === STATUS.NOT_TRACKED) c.notTracked++;
    if (v.needsCheck) c.check++;
  }
  const parts = [];
  if (c.out) parts.push(`${c.out} out of stock`);
  if (c.orderNow) parts.push(`${c.orderNow} to order now`);
  if (c.low) parts.push(`${c.low} running low`);
  if (c.centralLow) parts.push(`${c.centralLow} below 3-month target`);
  if (c.tooMuch) parts.push(`${c.tooMuch} with too much`);
  if (parts.length) {
    const firstN = Number(parts[0].split(' ')[0]);
    parts[0] = parts[0].replace(/^(\d+) /, `$1 ${firstN === 1 ? 'item' : 'items'} `);
  }
  return {
    counts: c,
    line: parts.length ? parts.join(', ') : 'All items OK',
    checkLine: c.check ? `${c.check} ${c.check === 1 ? 'count' : 'counts'} to check` : null,
  };
}

// ---------- Shipments: suggestions and requests ----------

// Monthly shipment suggestions: top up every tracked item to target for the month being shipped for.
export function suggestMonthly(db, monthKey = nextMonth(db)) {
  const out = [];
  for (const s of db.stores) {
    if (!isFacility(s)) continue;
    const lines = [];
    for (const it of db.itemsForStore(s.id)) {
      const t = target(db, s.id, it.id, monthKey);
      if (!t) continue;
      const q = topUp(db, s.id, it.id, monthKey, t.exact);
      if (q && q > 0) lines.push({ itemId: it.id, qty: q, target: t.qty, targetExact: t.exact, estimated: t.estimated, explanations: t.explanations });
    }
    if (lines.length) out.push({ type: 'monthly', fromStoreId: 'central', toStoreId: s.id, monthKey, lines });
  }
  return out;
}

// Emergency request: every item that is Out of stock or Order now, topped up to target.
// Items with no usage data: no quantity, "No usage data for this item. Logistics will set the amount."
export function emergencyRequest(db, storeId) {
  const lines = [];
  for (const v of storeItems(db, storeId)) {
    if (v.status !== STATUS.OUT && v.status !== STATUS.ORDER_NOW) continue;
    const t = target(db, storeId, v.item.id);
    if (!t) {
      lines.push({ itemId: v.item.id, status: v.status.code, qty: null, note: NO_USAGE_REQUEST_TEXT });
    } else {
      lines.push({ itemId: v.item.id, status: v.status.code, qty: topUp(db, storeId, v.item.id, currentMonth(db), t.exact), target: t.qty, targetExact: t.exact, estimated: t.estimated });
    }
  }
  return { type: 'emergency', fromStoreId: 'central', toStoreId: storeId, lines };
}

// Transfers between facilities: stock above target at a "Too much" site moves to a site that needs it.
export function suggestTransfers(db, itemIds = null) {
  const out = [];
  const ids = itemIds || db.items.map((i) => i.id);
  for (const itemId of ids) {
    const donors = [];
    const receivers = [];
    for (const s of db.stores) {
      if (!isFacility(s) || !db.holds(s.id, itemId)) continue;
      const v = stockView(db, s.id, itemId);
      if (!v.tracked || !v.target || v.onHand === null) continue;
      if (v.status === STATUS.TOO_MUCH && v.amc > 0) donors.push({ s, spare: Math.floor(v.onHand - v.target.exact) });
      if (v.status === STATUS.OUT || v.status === STATUS.ORDER_NOW || v.status === STATUS.LOW) {
        const need = topUp(db, s.id, itemId);
        if (need > 0) receivers.push({ s, need, rank: v.status.rank });
      }
    }
    donors.sort((a, b) => b.spare - a.spare);
    receivers.sort((a, b) => a.rank - b.rank || b.need - a.need);
    for (const r of receivers) {
      const d = donors.find((x) => x.spare > 0);
      if (!d) break;
      const q = Math.min(d.spare, r.need);
      d.spare -= q;
      out.push({ type: 'transfer', fromStoreId: d.s.id, toStoreId: r.s.id, lines: [{ itemId, qty: q }] });
    }
  }
  return out;
}

export function sentTooLong(db, sh) {
  if (sh.state !== 'sent') return false;
  return nowMs(db) - ms(sh.steps.sent.at) > SENT_ALERT_HOURS * 3600 * 1000;
}

export function hoursInSent(db, sh) {
  if (sh.state !== 'sent') return null;
  return Math.round((nowMs(db) - ms(sh.steps.sent.at)) / 3600000); // display: nearest hour
}

// ---------- Network and central store ----------

// Network stock of one item: central store + every facility + in transit, and months including stock on order.
export function networkPosition(db, itemId) {
  let held = 0;
  let transit = 0;
  for (const s of db.stores) {
    if (!db.holds(s.id, itemId)) continue;
    held += onHand(db, s.id, itemId) || 0;
  }
  for (const sh of db.shipments.values()) {
    if (sh.state !== 'sent') continue;
    for (const l of sh.lines) if (l.itemId === itemId) transit += l.qtySent || 0;
  }
  const ordered = onOrder(db, itemId);
  const use = amc(db, 'central', itemId);
  return {
    held, inTransit: transit, onOrder: ordered, monthlyUse: use,
    months: use ? (held + transit) / use : null,
    monthsInclOrder: use ? (held + transit + ordered) / use : null,
  };
}

// Central store items below their 3-month target, counting stock on order.
export function centralBelowTarget(db) {
  return db.itemsForStore('central').map((it) => stockView(db, 'central', it.id)).filter((v) => v.belowCentralTarget);
}
