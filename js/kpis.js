// Management indicators for the current month. Days before today come from MONTH_BASELINE (demo values,
// see js/seed.js); today's part is worked out live from the data, so the figures move with every entry.

import { MONTH_BASELINE, seedRand, largestRemainder } from './seed.js';
import { today, evaluateCount, networkPosition, currentMonth, amc, onHand } from './stock.js';
import { dateOf, addDays } from './time.js';

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

// ---------- What is behind each management number (round 4) ----------
// Each indicator opens the records behind it, worst first. The 1 to 29 October part is broken down into
// deterministic demo records (same every load) that add up exactly to MONTH_BASELINE; today's part comes from
// the live data. Records that already exist in the seed (Jigawan Iro's two Amoxicillin differences on 20 and
// 26 Oct, its missing count on 27 Oct, and the emergency shipments 1029, 1037 and 1039) are used as they are.
// BUILD-NOTES.md "Demo values" lists every rule.

// Demo stock-out days, 1 to 29 Oct (RUTF at zero at an OTP): the two busiest sites, both new this year.
const DEMO_STOCKOUTS = [
  { storeId: 'jamari', itemId: 'rutf', from: '2026-10-08', days: 3 },
  { storeId: 'zaune', itemId: 'rutf', from: '2026-10-21', days: 2 },
];
// Days with no count, 1 to 29 Oct: Jigawan Iro 27 Oct (no count that day in the seed), and the two sites that
// have not counted today miss more often. The rest is spread over the other OTPs.
const DEMO_MISSED_FIXED = { jigawan_iro: ['2026-10-27'], maikaho: 7, tumfure: 6 };
const DEMO_ITEM_UNEXPLAINED = 'ors';

function monthDays(base) {
  const out = [];
  for (let d = `${base.month}-01`; d <= base.throughDate; d = addDays(d, 1)) out.push(d);
  return out;
}

// Picks n dates for a store, the same every load, avoiding the dates in skip.
function pickDates(key, days, n, skip = []) {
  return days.filter((d) => !skip.includes(d)).map((d) => ({ d, r: seedRand(`${key}|${d}`) })).sort((a, b) => a.r - b.r).slice(0, n).map((x) => x.d).sort();
}

export function demoMonthRecords(db) {
  const base = MONTH_BASELINE;
  const days = monthDays(base);
  const inBase = (iso) => iso.slice(0, 7) === base.month && dateOf(iso) <= base.throughDate;
  const otps = db.stores.filter((s) => s.type === 'OTP' && !s.addedInDemo);
  const seededCountDays = (storeId) => [...db.countSessions.values()].filter((x) => x.storeId === storeId && x.kind === 'daily' && inBase(x.submittedAt)).map((x) => dateOf(x.submittedAt));

  // Counts submitted on time: every day not on time is a day with no count (the baseline's 870 - 818 = 52
  // equals 27 OTPs x 29 days - 731 OTP counts, and the ITPs logged every day in the seed).
  const missedTotal = base.facilityDays - base.countsOnTime;
  const missed = {};
  let fixedTotal = 0;
  for (const [id, v] of Object.entries(DEMO_MISSED_FIXED)) {
    missed[id] = Array.isArray(v) ? v : pickDates(`miss|${id}`, days, v, seededCountDays(id));
    fixedTotal += missed[id].length;
  }
  const rest = otps.filter((s) => !(s.id in DEMO_MISSED_FIXED));
  const split = largestRemainder(rest.map((s) => seedRand(`missw|${s.id}`) ** 2 + 0.05), missedTotal - fixedTotal);
  rest.forEach((s, i) => { missed[s.id] = pickDates(`miss|${s.id}`, days, split[i], seededCountDays(s.id)); });

  // Count accuracy: counts made = days with a count; the counts that did not match go to busier sites more often.
  const unmatchedTotal = base.otpCounts - base.otpCountsAccurate;
  const real = db.ledger.all.filter((e) => e.kind === 'count' && !e.recount && !e.itpLog && db.store(e.storeId).type === 'OTP' && inBase(e.ts))
    .map((e) => ({ e, ev: evaluateCount(db, e) })).filter((x) => x.ev && x.ev.flagged);
  const realUnmatched = {};
  for (const x of real) (realUnmatched[x.e.storeId] ||= new Set()).add(dateOf(x.e.ts));
  const realN = Object.values(realUnmatched).reduce((t, set) => t + set.size, 0);
  const others = otps.filter((s) => !realUnmatched[s.id]);
  const uSplit = largestRemainder(others.map((s) => (amc(db, s.id, 'rutf') || 1000) * (0.5 + seedRand(`accw|${s.id}`))), unmatchedTotal - realN);
  const accuracy = otps.map((s) => {
    const counted = days.filter((d) => !missed[s.id].includes(d));
    const unmatched = realUnmatched[s.id] ? [...realUnmatched[s.id]].sort() : pickDates(`acc|${s.id}`, counted, uSplit[others.indexOf(s)]);
    return { storeId: s.id, made: counted.length, matched: counted.length - unmatched.length, unmatchedDates: unmatched };
  });

  // Unexplained differences: the seed's own differences with no note and no correction, then demo records
  // (ORS at the sites with the most differences) up to the baseline.
  const unexplained = real.filter((x) => !db.notes.some((n) => n.targetId === x.e.id) && !db.ledger.all.some((a) => a.kind === 'adjustment' && a.correctsId === x.e.id))
    .map((x) => ({ storeId: x.e.storeId, itemId: x.e.itemId, date: dateOf(x.e.ts), counted: x.ev.counted, expected: x.ev.expected, entryId: x.e.id }));
  const byDiffs = accuracy.filter((a) => !realUnmatched[a.storeId] && a.unmatchedDates.length).sort((a, z) => (z.made - z.matched) - (a.made - a.matched) || a.storeId.localeCompare(z.storeId));
  for (let i = 0; unexplained.length < base.unexplained && i < byDiffs.length; i++) {
    const a = byDiffs[i];
    const use = amc(db, a.storeId, DEMO_ITEM_UNEXPLAINED) || 60;
    const expected = Math.max(12, Math.round((use / 30.4) * 20));
    const short = Math.max(3, Math.round(expected * 0.09));
    unexplained.push({ storeId: a.storeId, itemId: DEMO_ITEM_UNEXPLAINED, date: a.unmatchedDates[0], counted: expected - short, expected, demo: true });
  }

  const stockOuts = DEMO_STOCKOUTS.map((x) => ({ ...x, to: addDays(x.from, x.days - 1), stillOut: false, demo: true }));
  return { missed, accuracy, unexplained, stockOuts };
}

export function monthDetails(db) {
  const k = monthKpis(db);
  const d = today(db);
  const nowIso = db.nowIso;
  const demo = MONTH_BASELINE.month === currentMonth(db) ? demoMonthRecords(db) : { missed: {}, accuracy: [], unexplained: [], stockOuts: [] };
  const facilities = db.stores.filter((s) => s.type === 'OTP' || s.type === 'ITP');
  const sessionsToday = [...db.countSessions.values()].filter((s) => s.kind !== 'recount' && s.submittedAt <= nowIso && dateOf(s.submittedAt) === d);
  const countedToday = new Set(sessionsToday.map((s) => s.storeId));
  const lastCount = (storeId) => [...db.countSessions.values()].filter((s) => s.storeId === storeId && s.kind !== 'recount' && s.submittedAt <= nowIso).map((s) => s.submittedAt).sort().at(-1) || null;
  const latestToday = (storeId) => sessionsToday.filter((x) => x.storeId === storeId && x.kind === 'daily').sort((x, z) => x.submittedAt.localeCompare(z.submittedAt)).at(-1);

  // Stock-out days: demo records, then today's from the data (one day per store and item).
  const todayOuts = new Map();
  for (const e of db.ledger.all) if (e.kind === 'stockout_day' && dateOf(e.ts) === d && e.ts <= nowIso) todayOuts.set(`${e.storeId}|${e.itemId}`, e);
  const stockOuts = [...demo.stockOuts, ...[...todayOuts.values()].map((e) => ({ storeId: e.storeId, itemId: e.itemId, from: d, to: d, days: 1, stillOut: (onHand(db, e.storeId, e.itemId) ?? 0) <= 0 }))]
    .sort((a, z) => Number(z.stillOut) - Number(a.stillOut) || z.days - a.days || z.from.localeCompare(a.from));

  // Counts on time: facilities with days with no count this month, most first.
  const onTime = facilities.map((s) => {
    const dates = [...(demo.missed[s.id] || [])];
    const missingToday = !countedToday.has(s.id);
    if (missingToday) dates.push(d);
    return { storeId: s.id, days: dates.length, dates, missingToday, lastCount: lastCount(s.id) };
  }).filter((x) => x.days > 0).sort((a, z) => z.days - a.days || (a.lastCount || '').localeCompare(z.lastCount || ''));

  // Count accuracy: demo counts to 29 Oct plus today's latest OTP count, lowest match rate first.
  const accuracy = facilities.filter((s) => s.type === 'OTP').map((s) => {
    const a = demo.accuracy.find((x) => x.storeId === s.id) || { made: 0, matched: 0, unmatchedDates: [] };
    const latest = latestToday(s.id);
    let made = a.made;
    let matched = a.matched;
    const unmatchedDates = [...a.unmatchedDates];
    if (latest) {
      made += 1;
      const flagged = db.ledger.all.filter((e) => e.kind === 'count' && e.sessionId === latest.id).some((e) => evaluateCount(db, e)?.flagged);
      if (flagged) unmatchedDates.push(d); else matched += 1;
    }
    return { storeId: s.id, made, matched, rate: made ? matched / made : null, unmatchedDates };
  }).filter((x) => x.made > 0).sort((a, z) => a.rate - z.rate || (z.made - z.matched) - (a.made - a.matched) || a.storeId.localeCompare(z.storeId));

  // Unexplained differences: demo and seed records to 29 Oct, then today's flagged counts with no note or correction.
  const unexplained = [...demo.unexplained];
  for (const s of facilities.filter((x) => x.type === 'OTP')) {
    const latest = latestToday(s.id);
    if (!latest) continue;
    for (const e of db.ledger.all.filter((x) => x.kind === 'count' && x.sessionId === latest.id)) {
      const ev = evaluateCount(db, e);
      if (!ev?.flagged) continue;
      const explained = db.notes.some((n) => n.targetId === e.id) || db.ledger.all.some((a) => a.kind === 'adjustment' && a.correctsId === e.id);
      if (!explained) unexplained.push({ storeId: s.id, itemId: e.itemId, date: d, counted: ev.counted, expected: ev.expected, entryId: e.id });
    }
  }
  const share = (x) => Math.abs(x.counted - x.expected) / Math.max(1, x.expected);
  unexplained.sort((a, z) => share(z) - share(a) || z.date.localeCompare(a.date));

  // Emergency orders this month (real shipments): not sent yet first, then on the way, then received; oldest first.
  const order = { requested: 0, approved: 1, sent: 2, received: 3 };
  const emergency = [...db.shipments.values()].filter((s) => s.type === 'emergency' && s.steps.requested.at.slice(0, 7) === currentMonth(db) && s.steps.requested.at <= nowIso)
    .sort((a, z) => order[a.state] - order[z.state] || a.steps.requested.at.localeCompare(z.steps.requested.at));

  return { kpis: k, stockOuts, onTime, accuracy, unexplained, emergency, demoThrough: MONTH_BASELINE.throughDate };
}
