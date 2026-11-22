// Demo seed data. Deterministic: the same CSV files always give the same seed.
//
// Real, from the task files: Jigawan Iro's bin card counts, every OTP's use (ODK), supervisors, linked
// ITPs, ITP items and units. Everything else is sample data, chosen so every status appears somewhere.
// Values marked PLACEHOLDER wait for the final design files (they are listed in SEED_PLACEHOLDERS).

import { at, addDays, dateOf, ms } from './time.js';
import { stamp } from './users.js';
import { usageInfo, target } from './stock.js';
import { DAYS_PER_MONTH } from './config.js';

export const SEED_VERSION = 2;

export const SEED_PLACEHOLDERS = [
  'Shipment 1042: second RUTF batch (600 sachets) batch number and expiry',
  'Shipment 1042: Tom Brown batch number and expiry',
  'Shipment 1042: requested time (27 Oct 9:00 AM) and by whom (Nasiru Bello); approval time (28 Oct 9:30 AM); sent by Abubakar Waziri',
  'Shipment 1037: type (monthly), requested and approved dates and people, sent by Abubakar Waziri, batches and expiry',
  'Jigawan Iro earlier counts on 20 and 26 Oct (5:30 PM), each with an Amoxicillin susp 60ml difference (8 and 7 bottles short), so 3 flags in 14 days reach the supervisor',
  'Count times: Zaune 4:55 PM, Tumfure last counted 29 Oct 4:40 PM, other OTPs between 3:00 and 5:50 PM, ITP logs 4:30 PM',
  'Central store RUTF batches (RU-2605, RU-2607), supplier order of 40,000 sachets (supplier name, ordered 15 Oct, due 20 Nov)',
  'ITP monthly shipment numbers 1001 - 1033 and GH Bajoga F100 batch expiring before use',
  'Opening balances on 1 Oct, batch numbers and expiry dates at every store',
];

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

// ---------- constants from CLAUDE.md and the planning decisions ----------

// Jigawan Iro bin card, 30 Oct 2026 (data/Bin_card_example.jpeg): physical count, and the bin card
// (book) column where it differs. TB Bucket is blank on the card: not counted.
const JIGAWAN_IRO = {
  zinc_oxide: 56, act_al_1: 76, amox_100: 82, amox_60: 80, ciprotap: 0, loratadine: 60, malaria_rdt: 132,
  multivite: 0, nystatin: 26, ors: 96, paracetamol: 58, rutf: 4331, act_al_2: 0, albendazole: 69,
  tetracycline: 19, tom_brown: 11, act_aa_toddler: 13, otomed: 29, zinc_sulfate: 28.5, cefixime: 25,
  act_aa_infant: 14, tb_bucket: null, bms: 11, benzyl_benzoate: 33, soap: 38, sponge: 0,
};
const JIGAWAN_IRO_BOOK = { amox_60: 86 };
const JI_EARLIER_DIFFS = { '2026-10-20': { amox_60: -8 }, '2026-10-26': { amox_60: -7 } }; // PLACEHOLDER

// RUTF on hand (sachets). Zaune is worked out: 8 days at its real Aug and Sep use (until 7 Nov).
const RUTF_FIXED = { zaune: 3630, kalshingi: 3900, ashaka_gari: 9600 };
const RUTF_OTHER_23_TOTAL = 230000;
const CENTRAL_RUTF = 410000;
const CENTRAL_RUTF_ON_ORDER = 40000;

const COUNT_TIMES = { jigawan_iro: '17:40', kurjale: '17:25', zaune: '16:55' };
const NOT_COUNTED_TODAY = { maikaho: '2026-10-29T17:15', tumfure: '2026-10-29T16:40' };

const TODAY = '2026-10-30';
const OCT_1 = '2026-10-01';
const ITP_START = '2026-07-01';

export function seedDemo(db) {
  const S = db.stores;
  const user = (id) => db.user(id);
  const st = (userId, iso) => stamp(user(userId), S, iso);
  const NASIRU = 'log_nasiru_bello';
  const ABUBAKAR = 'log_abubakar_waziri';
  let n = 0;
  const id = (p = 's') => `${p}-${++n}`;
  const entries = [];
  const push = (e) => entries.push({ id: id(), demo: true, ...e });

  const batchFor = (storeId, itemId, date, months, key) => {
    const code = itemId === 'rutf' ? 'RU' : itemId.replace(/^itp_/, '').slice(0, 3).toUpperCase();
    const life = Math.max(365, Math.ceil(months * DAYS_PER_MONTH) + 240);
    return { batch: `${code}-${date.slice(2, 4)}${String(intBetween(`${key}|b`, 1, 99)).padStart(2, '0')}`, expiry: addDays(date, life) };
  };

  // ---------- OTPs ----------
  const otps = S.filter((s) => s.type === 'OTP');
  const otherRutf = otps.filter((s) => s.id !== 'jigawan_iro' && !(s.id in RUTF_FIXED));
  const rutfWeights = otherRutf.map((s) => usageInfo(db, s.id, 'rutf').amc * between(`rutf|${s.id}`, 1.2, 1.8));
  const rutfShare = largestRemainder(rutfWeights, RUTF_OTHER_23_TOTAL);
  const rutfQty = Object.fromEntries(otherRutf.map((s, i) => [s.id, rutfShare[i]]));
  Object.assign(rutfQty, RUTF_FIXED);

  for (const s of otps) {
    const lto = `lto_${s.id}`;
    const isJI = s.id === 'jigawan_iro';
    const lastCount = NOT_COUNTED_TODAY[s.id] ? `${NOT_COUNTED_TODAY[s.id]}:00+01:00` : at(TODAY, COUNT_TIMES[s.id] || hhmm(intBetween(`time|${s.id}`, 15 * 60, 17 * 60 + 50)));
    const countMs = ms(lastCount);
    for (const it of db.itemsForStore(s.id)) {
      const info = usageInfo(db, s.id, it.id);
      const a = info ? info.amc : null;
      let q;
      if (isJI) q = JIGAWAN_IRO[it.id];
      else if (it.isRutf) q = rutfQty[s.id];
      else if (a === null) q = intBetween(`q|${s.id}|${it.id}`, 5, 40);
      else if (a === 0) q = intBetween(`q|${s.id}|${it.id}`, 4, 15);
      else if (s.id === 'ashaka_gari' && it.id === 'otomed') q = Math.round(a * 0.6); // PLACEHOLDER: Otomed transfer example
      // At least 1 unit: an item with very small use (for example 0.1 a month) would otherwise round to 0.
      else q = Math.max(1, Math.round(a * between(`f|${s.id}|${it.id}`, 1.2, 1.8)));
      if (q === null || q === undefined) continue; // blank on the card: no record at all

      // Daily use (handed out, from ODK) at 2:00 PM, 1 Oct to 30 Oct.
      const days = 30;
      const amounts = a ? dailyAmounts(a, days, `use|${s.id}|${it.id}`) : Array(days).fill(0);
      const useEntries = amounts.map((qty, i) => ({ date: addDays(OCT_1, i), ts: at(addDays(OCT_1, i), '14:00'), qty })).filter((u) => u.qty > 0);
      const useBetween = (fromMs, toMs) => useEntries.filter((u) => ms(u.ts) > fromMs && ms(u.ts) < toMs).reduce((t, u) => t + u.qty, 0);
      const openingTs = at(OCT_1, '07:00');

      // Counts, worked backwards so the expected stock at each count is right.
      const counts = [];
      let opening;
      if (isJI) {
        const book = JIGAWAN_IRO_BOOK[it.id] ?? q;
        const t30 = countMs;
        const t26 = ms(at('2026-10-26', '17:30'));
        const t20 = ms(at('2026-10-20', '17:30'));
        const c26 = book + useBetween(t26, t30);
        const e26 = c26 - (JI_EARLIER_DIFFS['2026-10-26'][it.id] || 0);
        const c20 = e26 + useBetween(t20, t26);
        const e20 = c20 - (JI_EARLIER_DIFFS['2026-10-20'][it.id] || 0);
        counts.push({ ts: at('2026-10-20', '17:30'), qty: c20, expected: e20 });
        counts.push({ ts: at('2026-10-26', '17:30'), qty: c26, expected: e26 });
        counts.push({ ts: lastCount, qty: q, expected: book });
        opening = e20 + useBetween(ms(openingTs), t20);
      } else if (NOT_COUNTED_TODAY[s.id]) {
        // q is the stock on hand now: the last count (29 Oct) plus the use recorded since.
        const c29 = q + useBetween(countMs, ms(at(TODAY, '18:05')));
        counts.push({ ts: lastCount, qty: c29, expected: c29 });
        opening = c29 + useBetween(ms(openingTs), countMs);
      } else {
        counts.push({ ts: lastCount, qty: q, expected: q });
        opening = q + useBetween(ms(openingTs), countMs);
      }
      const months = a ? opening / a : 6;
      push({ kind: 'opening', storeId: s.id, itemId: it.id, qty: opening, ts: openingTs, stamp: st(NASIRU, openingTs), note: 'Opening balance (demo)', batches: [{ ...batchFor(s.id, it.id, OCT_1, months, `${s.id}|${it.id}`), qty: opening }] });
      for (const u of useEntries) push({ kind: 'used', storeId: s.id, itemId: it.id, qty: u.qty, ts: u.ts, stamp: st(lto, u.ts), source: 'odk', note: 'Handed out (ODK)' });
      for (const c of counts) {
        push({ kind: 'count', storeId: s.id, itemId: it.id, qty: c.qty, expected: c.expected, ts: c.ts, stamp: st(lto, c.ts), sessionId: `seed-count-${s.id}-${dateOf(c.ts)}` });
        if (it.isRutf && c.qty === 0) push({ kind: 'stockout_day', storeId: s.id, itemId: it.id, qty: 0, ts: c.ts, stamp: st(lto, c.ts) });
      }
    }
  }
  db.apply({ type: 'ledger_batch', entries: entries.splice(0) }, 'seed');

  // ---------- ITPs: daily logs 1 Jul to 30 Oct (sample values) ----------
  const itps = S.filter((s) => s.type === 'ITP');
  const ITP_SIZE = { gh_bajoga: 1.0, gh_deba: 1.2, gh_dukku: 0.9 };
  const RATE_BY_UNIT = { '1000 ml': [3, 8], sachet: [4, 15], tin: [0.3, 1], bag: [0.5, 3], tube: [0.2, 1.2], ampoule: [0.5, 3], vial: [0.5, 4], bottle: [0.3, 2], tablet: [2, 8], piece: [1, 4] };
  const f75 = db.itemIdFor('F75');
  const f100 = db.itemIdFor('F100');
  const ceftriaxone = db.itemIdFor('Ceftriaxone 1g (Tandak/Syceph)');
  const RATE_OVERRIDE = { [`gh_dukku|${f75}`]: 10, [`gh_dukku|${ceftriaxone}`]: 1.7 }; // so shipment 1037 is a 2-month top-up
  const IN_1037 = new Set([f75, ceftriaxone]);
  const months = ['2026-07', '2026-08', '2026-09', '2026-10'];
  const deliveries = {}; // `${storeId}|${month}` -> [{ itemId, qty, batch }]
  const totalDays = 122; // 1 Jul to 30 Oct

  for (const s of itps) {
    const pharm = `pharm_${s.id}`;
    for (const it of db.itemsForStore(s.id)) {
      const range = RATE_BY_UNIT[it.unit.one] || [0.5, 3];
      const rate = RATE_OVERRIDE[`${s.id}|${it.id}`] ?? between(`rate|${s.id}|${it.id}`, range[0], range[1]) * ITP_SIZE[s.id];
      const openBatch = (sid, iid) => {
        const b = batchFor(sid, iid, '2026-06-30', 2, `${sid}|${iid}|open`);
        if (sid === 'gh_bajoga' && iid === f100) b.expiry = addDays('2026-06-30', 50); // PLACEHOLDER: short-dated F100
        return b;
      };
      let stock = Math.round(rate * DAYS_PER_MONTH * between(`open|${s.id}|${it.id}`, 1.3, 1.7));
      const openTs = at('2026-06-30', '16:30');
      push({ kind: 'opening', storeId: s.id, itemId: it.id, qty: stock, ts: openTs, stamp: st(NASIRU, openTs), note: 'Opening balance (demo)', batches: [{ ...openBatch(s.id, it.id), qty: stock }] });
      let acc = rand(`acc|${s.id}|${it.id}`);
      for (let i = 0; i < totalDays; i++) {
        const date = addDays(ITP_START, i);
        const month = date.slice(0, 7);
        let received = 0;
        if (date.slice(8) === '02') {
          const skip = s.id === 'gh_dukku' && month === '2026-10' && IN_1037.has(it.id); // sent in shipment 1037, not yet received
          const qty = skip ? 0 : Math.max(0, Math.round(2 * rate * DAYS_PER_MONTH - stock));
          if (qty > 0) {
            const b = batchFor(s.id, it.id, date, 2, `${s.id}|${it.id}|${month}`);
            if (s.id === 'gh_bajoga' && it.id === f100) b.expiry = month >= '2026-09' ? '2026-11-21' : addDays(date, 50); // PLACEHOLDER: expires before use
            (deliveries[`${s.id}|${month}`] ||= []).push({ itemId: it.id, qty, batch: { ...b, qty } });
            received = qty;
            stock += qty;
          }
        }
        const octFactor = month === '2026-10' ? 0.85 : 1;
        acc += rate * octFactor * between(`d|${s.id}|${it.id}|${i}`, 0.5, 1.5);
        let used = Math.floor(acc);
        acc -= used;
        const before = stock;
        let ranOut = false;
        if (used >= stock) { used = stock; ranOut = used > 0 || stock === 0; }
        stock -= used;
        const ts = at(date, '16:30');
        push({ kind: 'count', storeId: s.id, itemId: it.id, qty: stock, expected: before, ts, stamp: st(pharm, ts), itpLog: true, sessionId: `seed-log-${s.id}-${date}`, receivedToday: received });
        if (ranOut) push({ kind: 'stockout_day', storeId: s.id, itemId: it.id, qty: 0, ts, stamp: st(pharm, ts) });
      }
    }
  }
  const itpCounts = entries.splice(0);

  // ITP monthly shipments (received on the 2nd at 11:00 AM; sent on the 1st at 9:00 AM).
  const numbers = { '2026-07': 1001, '2026-08': 1011, '2026-09': 1021, '2026-10': 1031 };
  for (const month of months) {
    itps.forEach((s, i) => {
      const lines = deliveries[`${s.id}|${month}`];
      if (!lines) return;
      const shId = id('sh');
      const day1 = `${month}-01`;
      const day2 = `${month}-02`;
      createShipment(db, {
        id: shId, number: numbers[month] + i, type: 'monthly', fromStoreId: 'central', toStoreId: s.id, monthKey: month,
        lines: lines.map((l) => ({ itemId: l.itemId, qtyProposed: l.qty, targetFrozen: null })),
      }, {
        requested: st(NASIRU, at(addDays(day1, -3), '09:00')),
        approved: st(NASIRU, at(addDays(day1, -2), '09:00')),
        sent: { stamp: st(ABUBAKAR, at(day1, '09:00')), lines: lines.map((l) => ({ itemId: l.itemId, qty: l.qty, batches: [l.batch] })) },
        received: { stamp: st(`pharm_${s.id}`, at(day2, '11:00')), lines: lines.map((l) => ({ itemId: l.itemId, qty: l.qty, batches: [l.batch] })) },
      }, id);
    });
  }
  db.apply({ type: 'ledger_batch', entries: itpCounts }, 'seed');

  // ---------- Shipments in transit (from the design) ----------
  // 1042, October monthly, central store to Jigawan Iro: in transit.
  const ri = 'rutf';
  createShipment(db, {
    id: 'sh-1042', number: 1042, type: 'monthly', fromStoreId: 'central', toStoreId: 'jigawan_iro', monthKey: '2026-10',
    lines: [
      { itemId: ri, qtyProposed: 1800, targetFrozen: target(db, 'jigawan_iro', ri, '2026-10')?.qty ?? null },
      { itemId: 'tom_brown', qtyProposed: 23, targetFrozen: target(db, 'jigawan_iro', 'tom_brown', '2026-10')?.qty ?? null },
    ],
  }, {
    requested: st(NASIRU, at('2026-10-27', '09:00')), // PLACEHOLDER time and person
    approved: st(NASIRU, at('2026-10-28', '09:30')), // PLACEHOLDER time
    sent: {
      stamp: st(ABUBAKAR, at('2026-10-29', '10:15')), // PLACEHOLDER person
      lines: [
        { itemId: ri, qty: 1800, batches: [{ batch: 'RU-2604', expiry: '2027-03-31', qty: 1200 }, { batch: 'PLACEHOLDER', expiry: null, qty: 600, placeholder: true }] },
        { itemId: 'tom_brown', qty: 23, batches: [{ batch: 'PLACEHOLDER', expiry: null, qty: 23, placeholder: true }] },
      ],
    },
  }, id);

  // 1037, central store to GH Dukku ITP: sent 26 Oct 2:00 PM, not yet received (over 72 hours).
  createShipment(db, {
    id: 'sh-1037', number: 1037, type: 'monthly', fromStoreId: 'central', toStoreId: 'gh_dukku', monthKey: '2026-10', // PLACEHOLDER type
    lines: [
      { itemId: f75, qtyProposed: 600, targetFrozen: null },
      { itemId: ceftriaxone, qtyProposed: 100, targetFrozen: null },
    ],
  }, {
    requested: st(NASIRU, at('2026-10-24', '09:00')), // PLACEHOLDER
    approved: st(NASIRU, at('2026-10-25', '09:00')), // PLACEHOLDER
    sent: {
      stamp: st(ABUBAKAR, at('2026-10-26', '14:00')), // PLACEHOLDER person
      lines: [
        { itemId: f75, qty: 600, batches: [{ batch: 'PLACEHOLDER', expiry: null, qty: 600, placeholder: true }] },
        { itemId: ceftriaxone, qty: 100, batches: [{ batch: 'PLACEHOLDER', expiry: null, qty: 100, placeholder: true }] },
      ],
    },
  }, id);

  // ---------- Central store: opening balance 30 Oct 7:00 AM (after shipments already sent) ----------
  const cTs = at(TODAY, '07:00');
  for (const it of db.itemsForStore('central')) {
    let q;
    let batches;
    if (it.isRutf) {
      q = CENTRAL_RUTF;
      batches = [{ batch: 'RU-2605', expiry: '2027-04-30', qty: 200000 }, { batch: 'RU-2607', expiry: '2027-06-30', qty: 210000 }]; // PLACEHOLDER
    } else {
      const u = usageInfo(db, 'central', it.id);
      q = u ? Math.round(u.amc * between(`central|${it.id}`, 3.1, 3.6)) : intBetween(`central|${it.id}`, 100, 400);
      batches = [{ ...batchFor('central', it.id, TODAY, 3.6, `central|${it.id}`), qty: q }];
    }
    push({ kind: 'opening', storeId: 'central', itemId: it.id, qty: q, ts: cTs, stamp: st(NASIRU, cTs), note: 'Opening balance (demo)', batches });
  }
  db.apply({ type: 'ledger_batch', entries: entries.splice(0) }, 'seed');
  db.apply({
    type: 'po_create',
    po: { id: 'po-1', itemId: 'rutf', qty: CENTRAL_RUTF_ON_ORDER, supplier: 'Supplier (PLACEHOLDER)', orderedOn: '2026-10-15', due: '2026-11-20' },
    stamp: st(NASIRU, at('2026-10-15', '10:00')),
  }, 'seed');
}

// Replays a shipment through its steps as seed events (stock leaves when Sent, arrives when Received).
function createShipment(db, shipment, steps, id) {
  db.apply({ type: 'shipment_create', shipment: { ...shipment, lines: shipment.lines.map((l) => ({ ...l, qtySent: null, batchesSent: null, qtyReceived: null, batchesReceived: null, reason: null, note: null })) }, stamp: steps.requested }, 'seed');
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
    lines: steps.received.lines.map((l) => ({ itemId: l.itemId, qtyReceived: l.qty, batchesReceived: l.batches, reason: null })),
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
