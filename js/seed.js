// Demo seed data. Deterministic: the same CSV files always give the same seed.
//
// Real, from the task files: Jigawan Iro's bin card counts, every OTP's use (ODK), supervisors, linked
// ITPs, ITP items and units. Everything else is sample data, chosen so every status appears somewhere.
// Demo values shown in the final design files (times, batches, shipment details, the expiry example,
// the ITP log at GH Deba, the Jigawan Iro RUTF history) are used as they are; BUILD-NOTES.md lists
// every demo value and every case where a CLAUDE.md rule made a design value impossible.

import { at, addDays, ms } from './time.js';
import { stamp } from './users.js';
import { usageInfo, target } from './stock.js';
import { DAYS_PER_MONTH } from './config.js';

export const SEED_VERSION = 4;

// ---------- deterministic random numbers ----------

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rand(key) {
  let t = (hashStr(key) + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export { rand as seedRand, largestRemainder };
const between = (key, lo, hi) => lo + rand(key) * (hi - lo);
const intBetween = (key, lo, hi) => Math.floor(between(key, lo, hi + 1));

function hhmm(minutesAfterMidnight) {
  const h = Math.floor(minutesAfterMidnight / 60);
  const m = Math.round(minutesAfterMidnight % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Splits a monthly use into whole daily amounts that add up correctly over time.
function dailyAmounts(monthlyUse, days, key) {
  const out = [];
  let acc = rand(`${key}|start`);
  for (let i = 0; i < days; i++) {
    acc += (monthlyUse / DAYS_PER_MONTH) * between(`${key}|${i}`, 0.7, 1.3);
    const q = Math.floor(acc);
    acc -= q;
    out.push(q);
  }
  return out;
}

// ---------- constants from CLAUDE.md, the planning decisions and the design files ----------

const TODAY = '2026-10-30';
const OCT_1 = '2026-10-01';
const ITP_START = '2026-07-01';

// Jigawan Iro bin card, 30 Oct 2026 (data/Bin_card_example.jpeg): physical count, and the bin card
// (book) column where it differs. TB Bucket is blank on the card: not counted today.
const JIGAWAN_IRO = {
  zinc_oxide: 56, act_al_1: 76, amox_100: 82, amox_60: 80, ciprotap: 0, loratadine: 60, malaria_rdt: 132,
  multivite: 0, nystatin: 26, ors: 96, paracetamol: 58, rutf: 4331, act_al_2: 0, albendazole: 69,
  tetracycline: 19, tom_brown: 11, act_aa_toddler: 13, otomed: 29, zinc_sulfate: 28.5, cefixime: 25,
  act_aa_infant: 14, tb_bucket: null, bms: 11, benzyl_benzoate: 33, soap: 38, sponge: 0,
};
const JI_BOOK = { amox_60: 86 };
// Earlier Jigawan Iro counts: full counts at 5:30 PM on 20 and 26 Oct (each with an Amoxicillin
// susp 60ml difference, so 3 flags in 14 days reach the supervisor), 28 Oct 5:36 PM and 29 Oct 5:20 PM.
// No count on 27 Oct (the RUTF history in the design goes straight from the 27 Oct delivery to 28 Oct).
const JI_COUNT_DAYS = [
  { date: '2026-10-20', time: '17:30', diffs: { amox_60: -8 } },
  { date: '2026-10-26', time: '17:30', diffs: { amox_60: -7 } },
  { date: '2026-10-28', time: '17:36', diffs: { rutf: -36 } }, // RUTF typed as 4,526, corrected at 5:50 PM
  { date: '2026-10-29', time: '17:20', diffs: {} },
];
// The 30 Oct count, line by line (design: items 1 to 12 saved from 5:33 PM; submitted 5:40 PM).
const JI_LINE_TIMES = ['17:33', '17:34', '17:34', '17:35', '17:36', '17:36', '17:37', '17:37', '17:38', '17:38', '17:39', '17:40'];
const JI_RUTF_USE = { '2026-10-28': 98, '2026-10-29': 100, '2026-10-30': 101 }; // design: item history
const JI_TB_BUCKET_29 = 6; // demo: TB Bucket counted on 29 Oct 5:20 PM, left blank today

// RUTF on hand (sachets). Zaune is worked out: 8 days at its real Aug and Sep use (until 7 Nov).
const RUTF_FIXED = { zaune: 3630, kalshingi: 3900, ashaka_gari: 9600 };
const RUTF_OTHER_23_TOTAL = 230000;
const CENTRAL_RUTF_BATCHES = [{ batch: 'RU-2604', expiry: '2027-03-31', qty: 150000 }, { batch: 'RU-2611', expiry: '2027-06-30', qty: 260000 }];
const CENTRAL_RUTF_ON_ORDER = 40000;

// Count times (design: logistics "All stores" table and supervisor home).
const COUNT_TIMES = { jigawan_iro: '17:40', kurjale: '17:25', zaune: '16:55', kalshingi: '17:02', ashaka_gari: '17:31' };
const NOT_COUNTED_TODAY = { maikaho: '2026-10-29T17:15', tumfure: '2026-10-29T17:20' };
const ITP_LOG_TIMES = { gh_bajoga: '16:30', gh_deba: '16:20', gh_dukku: '15:58' };
const ODK_UPLOAD_TIME = '09:10'; // "Last ODK upload: today 9:10 AM by Nasiru Bello"; daily use lines carry this time

// Management indicators: values for 1 to 29 Oct (and September). Purely hypothetical demo values
// (decisions log C11); today's part is worked out live from the data, so the numbers move when people
// submit counts or request stock. With today's seed they give the design's figures:
// 6 stock-out days (4 in Sept), 846 of 900 counts on time (94%), count accuracy 96.2%,
// 3 unexplained differences, emergency orders 5 of 36 (14%).
export const MONTH_BASELINE = {
  month: '2026-10',
  throughDate: '2026-10-29',
  facilityDays: 870, // 30 facilities x 29 days
  countsOnTime: 818,
  otpCounts: 731,
  otpCountsAccurate: 703,
  stockOutDays: 5,
  stockOutDaysLastMonth: 4,
  unexplained: 3,
  orders: 34, // 30 monthly shipments, 3 emergency shipments (1029, 1037, 1039), 1 supplier order
  emergencyOrders: 3,
};

export function seedDemo(db) {
  const S = db.stores;
  const user = (id) => db.user(id);
  const st = (userId, iso) => stamp(user(userId), S, iso);
  const NASIRU = 'log_nasiru_bello';
  const ABUBAKAR = 'log_abubakar_waziri';
  const MUHAMMAD = 'lto_jigawan_iro';
  let n = 0;
  const id = (p = 's') => `${p}-${++n}`;
  const entries = [];
  const push = (e) => { const x = { id: id(), demo: true, ...e }; entries.push(x); return x; };
  const sessions = new Map();
  const session = (sid, storeId, submittedAt, by, extra = {}) => {
    if (!sessions.has(sid)) sessions.set(sid, { id: sid, storeId, kind: 'daily', storeCheck: true, blanks: [], submittedAt, by, ...extra });
    return sessions.get(sid);
  };

  const batchFor = (itemId, date, months, key) => {
    const code = itemId === 'rutf' ? 'RU' : itemId.replace(/^itp_/, '').slice(0, 3).toUpperCase();
    const life = Math.max(365, Math.ceil(months * DAYS_PER_MONTH) + 240);
    return { batch: `${code}-${date.slice(2, 4)}${String(intBetween(`${key}|b`, 1, 99)).padStart(2, '0')}`, expiry: addDays(date, life) };
  };

  db.odk.uploads.push({ fileName: 'ODK OTP usage Jan-Oct 2026.csv', stamp: st(NASIRU, at(TODAY, ODK_UPLOAD_TIME)), siteCount: 27, itemCount: 19, seed: true });

  // ---------- OTPs ----------
  const otps = S.filter((s) => s.type === 'OTP');
  const otherRutf = otps.filter((s) => s.id !== 'jigawan_iro' && !(s.id in RUTF_FIXED));
  const rutfWeights = otherRutf.map((s) => usageInfo(db, s.id, 'rutf').amc * between(`rutf|${s.id}`, 1.2, 1.8));
  const rutfShare = largestRemainder(rutfWeights, RUTF_OTHER_23_TOTAL);
  const rutfQty = Object.fromEntries(otherRutf.map((s, i) => [s.id, rutfShare[i]]));
  Object.assign(rutfQty, RUTF_FIXED);
  const openingTs = at(OCT_1, '07:00');

  for (const s of otps) {
    const lto = `lto_${s.id}`;
    const isJI = s.id === 'jigawan_iro';
    const items = db.itemsForStore(s.id);
    items.forEach((it, idx) => {
      const info = usageInfo(db, s.id, it.id);
      const a = info ? info.amc : null;
      let q; // stock on hand now (30 Oct 6:05 PM)
      if (isJI) q = it.id === 'tb_bucket' ? JI_TB_BUCKET_29 : JIGAWAN_IRO[it.id];
      else if (it.isRutf) q = rutfQty[s.id];
      else if (a === null) q = intBetween(`q|${s.id}|${it.id}`, 5, 40);
      else if (a === 0) q = intBetween(`q|${s.id}|${it.id}`, 4, 15);
      else if (s.id === 'ashaka_gari' && it.id === 'otomed') q = Math.round(a * 0.6); // running low: receives the Otomed transfer
      // At least 1 unit: an item with very small use (for example 0.1 a month) would otherwise round to 0.
      else q = Math.max(1, Math.round(a * between(`f|${s.id}|${it.id}`, 1.2, 1.8)));

      // Timeline, oldest first. Daily use (handed out, from the ODK upload) at 9:10 AM, 1 Oct to 30 Oct.
      const tl = [];
      const amounts = a ? dailyAmounts(a, 30, `use|${s.id}|${it.id}`) : Array(30).fill(0);
      amounts.forEach((qty, i) => {
        const date = addDays(OCT_1, i);
        const pinned = isJI && it.isRutf ? JI_RUTF_USE[date] : undefined;
        const u = pinned ?? qty;
        if (u > 0) tl.push({ t: 'use', ts: at(date, ODK_UPLOAD_TIME), qty: u });
      });
      const countLine = (ts, diff = 0, extra = {}) => tl.push({ t: 'count', ts, diff, ...extra });
      if (isJI) {
        for (const d of JI_COUNT_DAYS) countLine(at(d.date, d.time), d.diffs[it.id] || 0, { submittedAt: at(d.date, d.time) });
        if (it.isRutf) {
          tl.push({ t: 'receipt', ts: at('2026-10-27', '10:05'), qty: 600, shipmentId: 'sh-1029' });
          tl.push({ t: 'correction', ts: at('2026-10-28', '17:50'), qty: 36, of: at('2026-10-28', '17:36') });
          countLine(at('2026-10-29', '11:30'), -30, { recount: true, reason: 'count_correction', by: NASIRU });
        }
        if (it.id !== 'tb_bucket') {
          const lineTime = JI_LINE_TIMES[idx] || '17:40';
          countLine(at(TODAY, lineTime), (JI_BOOK[it.id] !== undefined ? q - JI_BOOK[it.id] : 0), { submittedAt: at(TODAY, '17:40') });
        }
      } else if (NOT_COUNTED_TODAY[s.id]) {
        const ts = `${NOT_COUNTED_TODAY[s.id]}:00+01:00`;
        countLine(ts, 0, { submittedAt: ts });
      } else {
        const ts = at(TODAY, COUNT_TIMES[s.id] || hhmm(intBetween(`time|${s.id}`, 15 * 60, 17 * 60 + 50)));
        countLine(ts, 0, { submittedAt: ts });
      }
      tl.sort((x, y) => ms(x.ts) - ms(y.ts));

      // Worked backwards from the stock now, so the expected stock at every count is right.
      let running = q;
      for (let i = tl.length - 1; i >= 0; i--) {
        const ev = tl[i];
        if (ev.t === 'use') running += ev.qty;
        else if (ev.t === 'receipt') running -= ev.qty;
        else if (ev.t === 'correction') running -= ev.qty;
        else if (ev.t === 'count') { ev.qty = running; ev.expected = running - ev.diff; running = ev.expected; }
      }
      const opening = running;
      const months = a ? opening / a : 6;
      push({ kind: 'opening', storeId: s.id, itemId: it.id, qty: opening, ts: openingTs, stamp: st(NASIRU, openingTs), note: 'Opening balance (demo)', batches: [{ ...batchFor(it.id, OCT_1, months, `${s.id}|${it.id}`), qty: opening }] });
      const countIds = new Map();
      for (const ev of tl) {
        if (ev.t === 'use') {
          push({ kind: 'used', storeId: s.id, itemId: it.id, qty: ev.qty, ts: ev.ts, stamp: st(NASIRU, ev.ts), source: 'odk', note: 'From ODK usage upload' });
        } else if (ev.t === 'receipt') {
          // added with shipment 1029 below
        } else if (ev.t === 'correction') {
          push({ kind: 'adjustment', storeId: s.id, itemId: it.id, qty: ev.qty, ts: ev.ts, stamp: st(MUHAMMAD, ev.ts), reason: 'count_correction', reasonText: 'Typing mistake', correctsId: countIds.get(ev.of), needsApproval: false });
        } else {
          const who = ev.by || lto;
          const sid = ev.recount ? `seed-recount-${s.id}-${ev.ts.slice(0, 10)}` : `seed-count-${s.id}-${ev.ts.slice(0, 10)}`;
          const sess = session(sid, s.id, ev.submittedAt || ev.ts, who, ev.recount ? { kind: 'recount' } : {});
          const e = push({
            kind: 'count', storeId: s.id, itemId: it.id, qty: ev.qty, expected: ev.expected, ts: ev.ts, stamp: st(who, ev.ts),
            sessionId: sid, submittedAt: sess.submittedAt, recount: !!ev.recount, reason: ev.reason || null,
          });
          countIds.set(ev.ts, e.id);
          if (it.isRutf && ev.qty === 0) push({ kind: 'stockout_day', storeId: s.id, itemId: it.id, qty: 0, ts: ev.ts, stamp: st(who, ev.ts) });
        }
      }
      if (isJI && it.id === 'tb_bucket') session(`seed-count-${s.id}-${TODAY}`, s.id, at(TODAY, '17:40'), MUHAMMAD).blanks.push('tb_bucket');
    });
  }
  const otpEntries = entries.splice(0);
  for (const sess of sessions.values()) db.countSessions.set(sess.id, { ...sess, stamp: st(sess.by, sess.submittedAt) });
  db.apply({ type: 'ledger_batch', entries: otpEntries }, 'seed');

  // A note on today's Amoxicillin difference (design: "Differences: 1, note added (Amoxicillin)").
  const amoxToday = db.ledger.entries('jigawan_iro', 'amox_60').filter((e) => e.kind === 'count').at(-1);
  db.apply({ type: 'note', targetId: amoxToday.id, text: 'Counted twice: 80 bottles on the shelf.', stamp: st(MUHAMMAD, at(TODAY, '17:36')) }, 'seed');

  // ---------- ITPs: daily logs 1 Jul to 30 Oct (sample values) ----------
  // Generated backwards from the stock on 30 Oct, so the design's GH Deba log and the GH Bajoga
  // expiry example come out exactly. used = previous count + received - today's count.
  const itps = S.filter((s) => s.type === 'ITP');
  const ITP_SIZE = { gh_bajoga: 1.0, gh_deba: 1.2, gh_dukku: 0.9 };
  const RATE_BY_UNIT = { '1000 ml': [3, 8], sachet: [4, 15], tin: [0.3, 1], bag: [0.5, 3], tube: [0.2, 1.2], ampoule: [0.5, 3], vial: [0.5, 4], bottle: [0.3, 2], tablet: [2, 8], piece: [1, 4] };
  const f75 = db.itemIdFor('F75');
  const f100 = db.itemIdFor('F100');
  const ceftriaxone = db.itemIdFor('Ceftriaxone 1g (Tandak/Syceph)');
  const artesunate = db.itemIdFor('IV Artesunate 30mg (Rekmal)');
  const saline = db.itemIdFor('Normal saline 500 ml');
  // Design, ITP pharmacy daily log at GH Deba: yesterday's count, received today, today's count.
  const DEBA_LOG = {
    [f75]: { y: 240, r: 0, c: 214, line: '16:12' },
    [f100]: { y: 410, r: 120, c: 468, line: '16:13' },
    [ceftriaxone]: { y: 48, r: 0, c: 36, line: '16:14' },
    [artesunate]: { y: 6, r: 0, c: 0, line: '16:15', ranOut: true },
    [saline]: { y: 75, r: 0, c: 68, line: '16:16' },
  };
  const RATE_OVERRIDE = {
    // GH Deba: average daily use below the design's "used since yesterday" (a busy day), so the log
    // values give Running low, not Order now.
    [`gh_deba|${f75}`]: 10, [`gh_deba|${f100}`]: 22, [`gh_deba|${ceftriaxone}`]: 2.5, [`gh_deba|${artesunate}`]: 2, [`gh_deba|${saline}`]: 2.5,
    [`gh_dukku|${f75}`]: 14.7, [`gh_dukku|${ceftriaxone}`]: 2.45, // so 1037 (600 and 100) is about a top-up to 2 months
    [`gh_bajoga|${f100}`]: 8,
  };
  const months = ['2026-07', '2026-08', '2026-09', '2026-10'];
  const deliveries = {}; // `${storeId}|${month}` -> [{ itemId, qty, batch }]
  const totalDays = 122; // 1 Jul to 30 Oct
  const dates = Array.from({ length: totalDays }, (_, i) => addDays(ITP_START, i));
  const itpCountEntries = [];

  for (const s of itps) {
    const pharm = `pharm_${s.id}`;
    const logTime = ITP_LOG_TIMES[s.id];
    for (const it of db.itemsForStore(s.id)) {
      const key = `${s.id}|${it.id}`;
      const range = RATE_BY_UNIT[it.unit.one] || [0.5, 3];
      const rate = RATE_OVERRIDE[key] ?? between(`rate|${key}`, range[0], range[1]) * ITP_SIZE[s.id];
      const pin = s.id === 'gh_deba' ? DEBA_LOG[it.id] : null;
      // Daily use, whole units.
      const use = [];
      let acc = rand(`acc|${key}`);
      for (let i = 0; i < totalDays; i++) {
        acc += rate * between(`d|${key}|${i}`, 0.6, 1.4);
        const u = Math.floor(acc);
        acc -= u;
        use.push(u);
      }
      if (pin) use[totalDays - 1] = pin.y + pin.r - pin.c;
      const sum = (from, to) => dates.reduce((t, d, i) => (d >= from && d <= to ? t + use[i] : t), 0);
      const amc = (sum('2026-08-01', '2026-08-31') + sum('2026-09-01', '2026-09-30')) / 2;
      // Stock on 30 Oct after the log.
      let close30;
      if (pin) close30 = pin.c;
      else if (s.id === 'gh_dukku' && (it.id === f75 || it.id === ceftriaxone)) close30 = Math.round((amc / DAYS_PER_MONTH) * 15); // running low, 1037 on the way
      else if (s.id === 'gh_bajoga' && it.id === f100) close30 = Math.round(210 + 31 * (amc / DAYS_PER_MONTH)); // 210 left unused at expiry on 30 Nov
      else close30 = Math.max(1, Math.round(amc * between(`c30|${key}`, 1.1, 1.7)));

      const received = Array(totalDays).fill(0);
      if (pin && pin.r) received[totalDays - 1] = pin.r; // shipment 1039, received today
      const close = Array(totalDays).fill(0);
      close[totalDays - 1] = close30;
      const deliveryAt = {};
      for (let i = totalDays - 1; i > 0; i--) {
        // close[i] = close[i-1] + received[i] - use[i]
        if (dates[i].slice(8) === '02') {
          const level = Math.max(1, Math.round((amc / DAYS_PER_MONTH) * between(`lvl|${key}|${dates[i]}`, 9, 18))); // stock left before the monthly delivery
          const q = Math.max(0, close[i] + use[i] - level);
          received[i] = q;
          deliveryAt[dates[i].slice(0, 7)] = q;
        }
        close[i - 1] = close[i] + use[i] - received[i];
      }
      const opening = close[0] + use[0] - received[0]; // 30 Jun, before the 1 Jul log

      const short = s.id === 'gh_bajoga' && it.id === f100; // short-dated F100: older batches expire before 30 Nov too
      const openBatch = { ...batchFor(it.id, '2026-06-30', 2, `${key}|open`), qty: opening };
      if (short) openBatch.expiry = '2026-10-10';
      const openTs = at('2026-06-30', '16:30');
      push({ kind: 'opening', storeId: s.id, itemId: it.id, qty: opening, ts: openTs, stamp: st(NASIRU, openTs), note: 'Opening balance (demo)', batches: [openBatch] });
      for (const month of months) {
        const qty = deliveryAt[month];
        if (!qty) continue;
        const b = batchFor(it.id, `${month}-02`, 2, `${key}|${month}`);
        if (short) b.expiry = { '2026-07': '2026-10-31', '2026-08': '2026-11-10', '2026-09': '2026-11-20', '2026-10': '2026-11-30' }[month];
        if (short && month === '2026-10') b.batch = 'F1-2501';
        (deliveries[`${s.id}|${month}`] ||= []).push({ itemId: it.id, qty, batch: { ...b, qty } });
      }
      for (let i = 0; i < totalDays; i++) {
        const date = dates[i];
        const isToday = i === totalDays - 1;
        const time = isToday && pin ? pin.line : logTime;
        const ts = at(date, time);
        const sid = `seed-log-${s.id}-${date}`;
        const submittedAt = at(date, logTime);
        session(sid, s.id, submittedAt, pharm, { kind: 'itp_log' });
        const before = (i === 0 ? opening : close[i - 1]) + received[i];
        itpCountEntries.push({
          id: id(), demo: true, kind: 'count', storeId: s.id, itemId: it.id, qty: close[i], expected: before, ts, stamp: st(pharm, ts),
          itpLog: true, sessionId: sid, submittedAt, receivedToday: received[i],
        });
        const ranOut = (pin && pin.ranOut && isToday) || (close[i] === 0 && use[i] > 0);
        if (ranOut) itpCountEntries.push({ id: id(), demo: true, kind: 'stockout_day', storeId: s.id, itemId: it.id, qty: 0, ts, stamp: st(pharm, ts), sessionId: sid });
      }
    }
  }
  for (const sess of sessions.values()) if (!db.countSessions.has(sess.id)) db.countSessions.set(sess.id, { ...sess, stamp: st(sess.by, sess.submittedAt) });

  // ITP monthly shipments (sent on the 1st at 9:00 AM by Abubakar Waziri; received on the 2nd at 11:00 AM).
  const numbers = { '2026-07': 1001, '2026-08': 1011, '2026-09': 1021, '2026-10': 1031 };
  for (const month of months) {
    itps.forEach((s, i) => {
      const lines = deliveries[`${s.id}|${month}`];
      if (!lines) return;
      const day1 = `${month}-01`;
      const day2 = `${month}-02`;
      createShipment(db, {
        id: id('sh'), number: numbers[month] + i, type: 'monthly', fromStoreId: 'central', toStoreId: s.id, monthKey: month,
        lines: lines.map((l) => ({ itemId: l.itemId, qtyProposed: l.qty, targetFrozen: null })),
      }, {
        requested: st(NASIRU, at(addDays(day1, -3), '09:00')),
        approved: st(NASIRU, at(addDays(day1, -2), '09:00')),
        sent: { stamp: st(ABUBAKAR, at(day1, '09:00')), lines: lines.map((l) => ({ itemId: l.itemId, qty: l.qty, batches: [l.batch] })) },
        received: { stamp: st(`pharm_${s.id}`, at(day2, '11:00')), lines: lines.map((l) => ({ itemId: l.itemId, qty: l.qty, batches: [l.batch] })) },
      }, id);
    });
  }
  // 1039, emergency, Central store to GH Deba ITP: F100 120 x 1000 ml, received today 10:30 AM
  // (the "Received today 120" on the design's GH Deba log).
  createShipment(db, {
    id: 'sh-1039', number: 1039, type: 'emergency', fromStoreId: 'central', toStoreId: 'gh_deba', monthKey: '2026-10',
    lines: [{ itemId: f100, qtyProposed: 120, targetFrozen: null }],
  }, {
    requested: st('pharm_gh_deba', at('2026-10-28', '15:00')),
    approved: st(NASIRU, at('2026-10-29', '09:00')),
    sent: { stamp: st(ABUBAKAR, at('2026-10-29', '13:00')), lines: [{ itemId: f100, qty: 120, batches: [{ batch: 'F1-2610', expiry: '2027-04-30', qty: 120 }] }] },
    received: { stamp: st('pharm_gh_deba', at(TODAY, '10:30')), lines: [{ itemId: f100, qty: 120, batches: [{ batch: 'F1-2610', expiry: '2027-04-30', qty: 120 }] }] },
  }, id);
  db.apply({ type: 'ledger_batch', entries: [...itpCountEntries, ...entries.splice(0)] }, 'seed');

  // ---------- Jigawan Iro shipments (from the design) ----------
  // 1029, Central store to Jigawan Iro: RUTF 600 sachets (4 cartons), sent by Nasiru Bello 26 Oct,
  // received by Muhammad S. 27 Oct 10:05 AM (design: item history).
  createShipment(db, {
    id: 'sh-1029', number: 1029, type: 'emergency', fromStoreId: 'central', toStoreId: 'jigawan_iro', monthKey: '2026-10',
    lines: [{ itemId: 'rutf', qtyProposed: 600, targetFrozen: null }],
  }, {
    requested: st(MUHAMMAD, at('2026-10-26', '08:30')),
    approved: st(NASIRU, at('2026-10-26', '09:00')),
    sent: { stamp: st(NASIRU, at('2026-10-26', '14:00')), lines: [{ itemId: 'rutf', qty: 600, batches: [{ batch: 'RU-2604', expiry: '2027-03-31', qty: 600 }] }] },
    received: { stamp: st(MUHAMMAD, at('2026-10-27', '10:05')), lines: [{ itemId: 'rutf', qty: 600, batches: [{ batch: 'RU-2604', expiry: '2027-03-31', qty: 600 }], note: '4 sealed cartons' }] },
  }, id);

  // 1042, October monthly, Central store to Jigawan Iro: in transit.
  createShipment(db, {
    id: 'sh-1042', number: 1042, type: 'monthly', fromStoreId: 'central', toStoreId: 'jigawan_iro', monthKey: '2026-10',
    lines: [
      { itemId: 'rutf', qtyProposed: 1800, targetFrozen: target(db, 'jigawan_iro', 'rutf', '2026-10')?.qty ?? null },
      { itemId: 'tom_brown', qtyProposed: 23, targetFrozen: target(db, 'jigawan_iro', 'tom_brown', '2026-10')?.qty ?? null },
    ],
  }, {
    requested: st(NASIRU, at('2026-10-27', '09:00')),
    approved: st(NASIRU, at('2026-10-28', '09:30')),
    sent: {
      stamp: st(ABUBAKAR, at('2026-10-29', '10:15')),
      lines: [
        { itemId: 'rutf', qty: 1800, batches: [{ batch: 'RU-2604', expiry: '2027-03-31', qty: 1200 }, { batch: 'RU-2611', expiry: '2027-06-30', qty: 600 }] },
        { itemId: 'tom_brown', qty: 23, batches: [{ batch: 'TB-0925', expiry: '2027-01-15', qty: 23 }] },
      ],
    },
  }, id);

  // 1037, emergency, Central store to GH Dukku ITP: sent 26 Oct 2:00 PM, not yet received (over 72 hours).
  createShipment(db, {
    id: 'sh-1037', number: 1037, type: 'emergency', fromStoreId: 'central', toStoreId: 'gh_dukku', monthKey: '2026-10',
    lines: [{ itemId: f75, qtyProposed: 600, targetFrozen: null }, { itemId: ceftriaxone, qtyProposed: 100, targetFrozen: null }],
  }, {
    requested: st('pharm_gh_dukku', at('2026-10-24', '15:40')),
    approved: st(NASIRU, at('2026-10-25', '09:00')),
    sent: {
      stamp: st(ABUBAKAR, at('2026-10-26', '14:00')),
      lines: [
        { itemId: f75, qty: 600, batches: [{ batch: 'F7-2609', expiry: '2027-02-28', qty: 600 }] },
        { itemId: ceftriaxone, qty: 100, batches: [{ batch: 'CE-2610', expiry: '2027-09-30', qty: 100 }] },
      ],
    },
  }, id);

  // ---------- Central store ----------
  // Opening balance on 30 Jun 8:00 AM, before its first movement (shipments sent from 1 Jul), so every line of
  // the item history shows the balance after it. Its amount is today's stock plus everything sent since, so
  // today's numbers do not change. Logistics checked the stock at 8:00 AM today (the "Today 8:00 AM" of the
  // design's logistics table); the central store has no daily count.
  const openTs = at('2026-06-30', '08:00');
  const cTs = at(TODAY, '08:00');
  for (const it of db.itemsForStore('central')) {
    let q;
    let batches;
    if (it.isRutf) {
      batches = CENTRAL_RUTF_BATCHES.map((b) => ({ ...b }));
      q = batches.reduce((t, b) => t + b.qty, 0);
    } else {
      const u = usageInfo(db, 'central', it.id);
      q = u ? Math.round(u.amc * between(`central|${it.id}`, 3.1, 3.6)) : intBetween(`central|${it.id}`, 100, 400);
      batches = [{ ...batchFor(it.id, TODAY, 3.6, `central|${it.id}`), qty: q }];
    }
    const sentBefore = db.ledger.entries('central', it.id).filter((e) => e.kind === 'sent' && e.ts < cTs);
    const sentQty = sentBefore.reduce((t, e) => t + e.qty, 0);
    const openBatches = new Map(batches.map((b) => [b.batch, { ...b }]));
    for (const e of sentBefore) {
      for (const b of e.batches || []) {
        const prev = openBatches.get(b.batch) || { batch: b.batch, expiry: b.expiry, qty: 0 };
        prev.qty += b.qty;
        openBatches.set(b.batch, prev);
      }
    }
    push({ kind: 'opening', storeId: 'central', itemId: it.id, qty: q + sentQty, ts: openTs, stamp: st(NASIRU, openTs), note: 'Opening balance (demo)', batches: [...openBatches.values()] });
    push({ kind: 'count', storeId: 'central', itemId: it.id, qty: q, expected: q, ts: cTs, stamp: st(NASIRU, cTs), recount: true, stockCheck: true, submittedAt: cTs });
  }
  db.apply({ type: 'ledger_batch', entries: entries.splice(0) }, 'seed');
  db.apply({
    type: 'po_create',
    po: { id: 'po-1', itemId: 'rutf', qty: CENTRAL_RUTF_ON_ORDER, supplier: 'Supplier order (demo)', orderedOn: '2026-10-15', due: '2026-11-20' },
    stamp: st(NASIRU, at('2026-10-15', '10:00')),
  }, 'seed');

  // ---------- Today's requests (design: logistics "Suggested shipments" and "Needs attention") ----------
  // Zaune: emergency top-up planned by logistics at 5:10 PM ("target locked 30 Oct 5:10 PM").
  const zTarget = target(db, 'zaune', 'rutf');
  db.apply({
    type: 'shipment_create',
    shipment: blankLines({ id: 'sh-1043', number: 1043, type: 'emergency', fromStoreId: 'central', toStoreId: 'zaune', monthKey: '2026-10', lines: [{ itemId: 'rutf', qtyProposed: Math.max(0, Math.round(zTarget.exact - 3630)), targetFrozen: zTarget.qty }] }),
    stamp: st(NASIRU, at(TODAY, '17:10')),
  }, 'seed');
  // Jigawan Iro's emergency request is not seeded: the walkthrough starts with Muhammad S. sending it
  // (decision after the build, 22 Nov). It then gets shipment number 1044.

  // Jigawan Iro RUTF correction waiting for approval (decision after the step 1 check):
  // -180 sachets (1 carton + 30 loose), Damaged, entered by Muhammad S. at 5:48 PM, waiting for Hajara Nuhu.
  const rutfToday = db.ledger.entries('jigawan_iro', 'rutf').filter((e) => e.kind === 'count').at(-1);
  db.apply({
    type: 'ledger',
    entry: {
      id: 'seed-adj-rutf-180', demo: true, kind: 'adjustment', storeId: 'jigawan_iro', itemId: 'rutf', qty: -180, ts: at(TODAY, '17:48'),
      stamp: st(MUHAMMAD, at(TODAY, '17:48')), reason: 'damaged', reasonText: 'Rats got into 1 carton and 30 loose sachets.',
      correctsId: rutfToday.id, needsApproval: true,
    },
  }, 'seed');

  // ---------- Settings (design: Settings screen) ----------
  Object.assign(db.settings.multipliers, { 5: 1.2, 6: 1.3, 7: 1.3, 8: 1.5, 9: 1.3 });
  db.apply({ type: 'set_multiplier', month: 7, value: 1.5, reason: 'Plan for the 2027 lean-season peak', stamp: st(NASIRU, at(TODAY, '15:12')) }, 'seed');
  db.settings.facilityLog.push({ storeId: 'kalshingi', text: 'Added Kalshingi OTP, supervisor Hilary Chukusa', reason: 'New site opened', stamp: st(NASIRU, at('2026-08-12', '10:40')) });
}

function blankLines(shipment) {
  return { ...shipment, lines: shipment.lines.map((l) => ({ note: null, ...l, qtySent: null, batchesSent: null, qtyReceived: null, batchesReceived: null, reason: null })) };
}

// Replays a shipment through its steps as seed events (stock leaves when Sent, arrives when Received).
function createShipment(db, shipment, steps, id) {
  db.apply({ type: 'shipment_create', shipment: blankLines(shipment), stamp: steps.requested }, 'seed');
  db.apply({ type: 'shipment_step', shipmentId: shipment.id, step: 'approved', stamp: steps.approved }, 'seed');
  if (!steps.sent) return;
  db.apply({
    type: 'shipment_step', shipmentId: shipment.id, step: 'sent', stamp: steps.sent.stamp,
    lines: steps.sent.lines.map((l) => ({ itemId: l.itemId, qtySent: l.qty, batchesSent: l.batches })),
    ledger: steps.sent.lines.map((l) => ({ id: id(), demo: true, kind: 'sent', storeId: shipment.fromStoreId, itemId: l.itemId, qty: l.qty, ts: steps.sent.stamp.at, stamp: steps.sent.stamp, shipmentId: shipment.id, batches: l.batches })),
  }, 'seed');
  if (!steps.received) return;
  db.apply({
    type: 'shipment_step', shipmentId: shipment.id, step: 'received', stamp: steps.received.stamp,
    lines: steps.received.lines.map((l) => ({ itemId: l.itemId, qtyReceived: l.qty, batchesReceived: l.batches, reason: null, note: l.note || null })),
    ledger: steps.received.lines.map((l) => ({ id: id(), demo: true, kind: 'received', storeId: shipment.toStoreId, itemId: l.itemId, qty: l.qty, ts: steps.received.stamp.at, stamp: steps.received.stamp, shipmentId: shipment.id, batches: l.batches })),
  }, 'seed');
}

// Whole numbers in proportion to the weights that add up exactly to the total.
function largestRemainder(weights, total) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (w / sum) * total);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f).forEach(({ i }) => { if (left > 0) { out[i]++; left--; } });
  return out;
}
