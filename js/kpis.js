// Management indicators for the current month. Days before today come from MONTH_BASELINE (demo values,
// see js/seed.js); today's part is worked out live from the data, so the figures move with every entry.

import { MONTH_BASELINE } from './seed.js';
import { today, evaluateCount, networkPosition, currentMonth } from './stock.js';
import { dateOf } from './time.js';

export const ACCURACY_GOAL = 0.95;

export function monthKpis(db) {
  const d = today(db);
  const nowIso = db.nowIso;
  const base = MONTH_BASELINE.month === currentMonth(db) ? MONTH_BASELINE : { facilityDays: 0, countsOnTime: 0, otpCounts: 0, otpCountsAccurate: 0, stockOutDays: 0, stockOutDaysLastMonth: 0, unexplained: 0, orders: 0, emergencyOrders: 0 };
  const facilities = db.stores.filter((s) => s.type === 'OTP' || s.type === 'ITP');

  // Counts submitted on time: a count (or ITP log) submitted on the day it is for.
  const sessionsToday = [...db.countSessions.values()].filter((s) => s.kind !== 'recount' && s.submittedAt <= nowIso && dateOf(s.submittedAt) === d);
  const countedToday = new Set(sessionsToday.map((s) => s.storeId));

  // Count accuracy: OTP counts today (latest per facility) with no flagged difference.
  let otpToday = 0;
  let accurateToday = 0;
  let unexplainedToday = 0;
  for (const s of facilities.filter((x) => x.type === 'OTP' && countedToday.has(x.id))) {
    const latest = sessionsToday.filter((x) => x.storeId === s.id && x.kind === 'daily').sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)).at(-1);
    if (!latest) continue;
    otpToday++;
    const entries = db.ledger.all.filter((e) => e.kind === 'count' && e.sessionId === latest.id);
    const flagged = entries.filter((e) => evaluateCount(db, e)?.flagged);
    if (!flagged.length) accurateToday++;
    for (const e of flagged) {
      const explained = db.notes.some((n) => n.targetId === e.id) || db.ledger.all.some((a) => a.kind === 'adjustment' && a.correctsId === e.id);
      if (!explained) unexplainedToday++;
    }
  }

  const stockOutToday = new Set(db.ledger.all.filter((e) => e.kind === 'stockout_day' && dateOf(e.ts) === d && e.ts <= nowIso).map((e) => `${e.storeId}|${e.itemId}`)).size;
  const shipsToday = [...db.shipments.values()].filter((s) => dateOf(s.steps.requested.at) === d && s.steps.requested.at <= nowIso);
  const posToday = [...db.purchaseOrders.values()].filter((p) => dateOf(p.stamp.at) === d);

  const facilityDays = base.facilityDays + facilities.length;
  const countsOnTime = base.countsOnTime + countedToday.size;
  const otpCounts = base.otpCounts + otpToday;
  const accurate = base.otpCountsAccurate + accurateToday;
  const orders = base.orders + shipsToday.length + posToday.length;
  const emergency = base.emergencyOrders + shipsToday.filter((s) => s.type === 'emergency').length;
  return {
    facilities: facilities.length,
    stockOutDays: base.stockOutDays + stockOutToday,
    stockOutDaysLastMonth: base.stockOutDaysLastMonth,
    countsOnTime, facilityDays, onTimeShare: facilityDays ? countsOnTime / facilityDays : null,
    accuracy: otpCounts ? accurate / otpCounts : null, accurate, otpCounts,
    unexplained: base.unexplained + unexplainedToday,
    orders, emergency, emergencyShare: orders ? emergency / orders : null,
    rutf: networkPosition(db, 'rutf'),
  };
}

// RUTF used per month across all OTPs (ODK), Jan to Oct.
export function rutfByMonth(db) {
  return db.odk.months.map((m) => ({ month: m, qty: Object.values(db.odk.usage).reduce((t, u) => t + (u.rutf?.[m] || 0), 0) }));
}
