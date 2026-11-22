// Logic check: prints the Jigawan Iro results for all 26 bin card items, the facility summary,
// Zaune and other agreed values, and the logistics "Needs attention" list, and compares each value
// with the agreed check values (CLAUDE.md "Data facts" and the second round of design feedback, item 12).
// Run: node tools/check.mjs

import fs from 'node:fs';
import { buildDb, DATA_FILES } from '../js/app-data.js';
import { freshState, loadState, saveState, resetDemoData } from '../js/storage.js';
import {
  storeItems, facilitySummary, stockView, emergencyRequest, target, escalation, usageInfo, amc, networkPosition,
  hoursInSent, sentTooLong, latestCount, urgentFirst, topUp, batchesOnHand,
} from '../js/stock.js';
import { needsAttention, alertsForStores } from '../js/alerts.js';
import { monthKpis, monthDetails, demoMonthRecords } from '../js/kpis.js';
import { formatQty, formatRutf, formatNumber, rutfReadBack } from '../js/format.js';
import { formatShortDate, formatTime } from '../js/time.js';
import {
  saveCountLine, submitCount, correctEntry, decideCorrection, receiveShipment, uploadOdk, pendingApprovals, requestEmergency,
  trySignIn, requestUnlock, unlockAccount, pinState, removeAccess, restoreAccess, addNote,
} from '../js/actions.js';
import { dateOf } from '../js/time.js'; // eslint-disable-line

const src = Object.fromEntries(Object.entries(DATA_FILES).map(([k, p]) => [k, fs.readFileSync(p, 'utf8')]));
const { db } = buildDb(src, freshState());

const mismatches = [];
function expect(label, actual, expected) {
  const ok = String(actual) === String(expected);
  if (!ok) mismatches.push(`${label}: got "${actual}", expected "${expected}"`);
  return ok ? '' : ' <-- MISMATCH';
}

// ---------- Jigawan Iro, 26 bin card items ----------
// [id, on hand, unit, days, lasts until, months, status, logistics badge, check]
const EXPECTED = [
  ['zinc_oxide', '56', 'tubes', 119, '26 Feb', '3.9', 'OK', 'Above target', ''],
  ['act_al_1', '76', 'sachets', 76, '14 Jan', '2.5', 'OK', 'Above target', ''],
  ['amox_100', '82', 'bottles', 50, '19 Dec', '1.7', 'OK', '', ''],
  ['amox_60', '80', 'bottles', 54, '23 Dec', '1.8', 'OK', '', 'Check (expected 86)'],
  ['ciprotap', '0', 'bottles', '', '', '', 'Out of stock', '', ''],
  ['loratadine', '60', 'bottles', 243, '30 Jun', '8.0', 'Too much', '', ''],
  ['malaria_rdt', '132', 'kits', 60, '29 Dec', '2.0', 'OK', 'Above target', ''], // just over 2 months: the rule gives Above target
  ['multivite', '0', 'bottles', '', '', '', 'Out of stock', '', ''],
  ['nystatin', '26', 'bottles', 69, '7 Jan', '2.3', 'OK', 'Above target', ''],
  ['ors', '96', 'pieces', 50, '19 Dec', '1.7', 'OK', '', ''],
  ['paracetamol', '58', 'bottles', 228, '15 Jun', '7.5', 'Too much', '', ''],
  ['rutf', '4,331 sachets (28 cartons + 131 loose)', 'sachets', 43, '12 Dec', '1.4', 'OK', '', ''],
  ['act_al_2', '0', 'units', '', '', '', 'Out of stock', '', ''],
  ['albendazole', '69', 'sachets', 105, '12 Feb', '3.5', 'OK', 'Above target', ''],
  ['tetracycline', '19', 'tubes', 67, '5 Jan', '2.2', 'OK', 'Above target', ''],
  ['tom_brown', '11', 'packs', 20, '19 Nov', '0.7', 'Running low', '', ''],
  ['act_aa_toddler', '13', 'units', '', 'No use in August or September', '', 'Too much', '', ''],
  ['otomed', '29', 'bottles', '', 'Lasts more than a year', '20.7', 'Too much', '', ''],
  ['zinc_sulfate', '28.5', 'sachets', 320, '15 Sep', '10.6', 'Too much', '', ''],
  ['cefixime', '25', 'units', 211, '29 May', '6.9', 'Too much', '', ''],
  ['act_aa_infant', '14', 'units', 212, '30 May', '7.0', 'Too much', '', ''],
  ['tb_bucket', '', 'units', '', '', '', 'Not counted today', '', ''],
  ['bms', '11', 'units', '', '', '', 'Usage not tracked', '', ''],
  ['benzyl_benzoate', '33', 'bottles', '', '', '', 'Usage not tracked', '', ''],
  ['soap', '38', 'units', '', '', '', 'Usage not tracked', '', ''],
  ['sponge', '0', 'units', '', '', '', 'Out of stock', '', ''],
];

function lastsText(v) {
  if (v.noRecentUse) return 'No use in August or September';
  if (v.lastsMoreThanYear) return 'Lasts more than a year';
  return v.lastsUntil ? formatShortDate(v.lastsUntil) : '';
}

console.log(`\n## Jigawan Iro OTP, 30 Oct 2026 (now: ${formatShortDate(dateOf(db.nowIso))} ${formatTime(db.nowIso)})\n`);
console.log('| # | Item | On hand | Unit | Days | Lasts until | Months | Status | Logistics badge | Count | Last updated |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
const views = storeItems(db, 'jigawan_iro');
expect('Jigawan Iro item count', views.length, 26);
views.forEach((v, i) => {
  const e = EXPECTED[i];
  const marks = [];
  // Not counted today: yesterday's numbers are never shown as current.
  const hidden = v.status.code === 'NOT_COUNTED';
  const onHandText = v.onHand === null || hidden ? '' : v.item.isRutf ? formatRutf(v.onHand) : formatNumber(v.onHand);
  marks.push(expect(`${v.item.name} id`, v.item.id, e[0]));
  marks.push(expect(`${v.item.name} on hand`, onHandText, e[1]));
  marks.push(expect(`${v.item.name} unit`, v.item.unit.many, e[2]));
  marks.push(expect(`${v.item.name} days`, Number.isFinite(v.days) && !v.lastsMoreThanYear && !hidden ? v.days : '', e[3]));
  marks.push(expect(`${v.item.name} lasts until`, hidden ? '' : lastsText(v), e[4]));
  const monthsText = Number.isFinite(v.months) && v.months !== null && !hidden ? v.months.toFixed(1) : '';
  marks.push(expect(`${v.item.name} months`, monthsText, e[5]));
  marks.push(expect(`${v.item.name} status`, v.status.label, e[6]));
  const badge = v.aboveTarget ? 'Above target' : '';
  marks.push(expect(`${v.item.name} logistics badge`, badge, e[7]));
  const check = v.needsCheck ? `Check (expected ${formatNumber(v.check.expected)})` : '';
  marks.push(expect(`${v.item.name} count check`, check, e[8]));
  const upd = v.countedToday ? `Counted today ${formatTime(v.countedAt)}` : `Last counted ${v.lastCount ? `${formatShortDate(dateOf(v.lastCount.submittedAt || v.lastCount.ts))} ${formatTime(v.lastCount.submittedAt || v.lastCount.ts)}` : 'never'}`;
  const flag = marks.some(Boolean) ? ' **MISMATCH**' : '';
  console.log(`| ${i + 1} | ${v.item.name} | ${onHandText} | ${v.item.unit.many} | ${e[3] === '' ? '' : v.days} | ${hidden ? '' : lastsText(v)} | ${monthsText} | ${v.status.label}${flag} | ${badge} | ${check} | ${upd} |`);
});

const sum = facilitySummary(db, 'jigawan_iro');
console.log(`\nSummary: "${sum.line}"; ${sum.checkLine}; OK ${sum.counts.ok}; not counted ${sum.counts.notCounted}; usage not tracked ${sum.counts.notTracked}`);
expect('Summary line', sum.line, '4 items out of stock, 1 running low, 7 with too much');
expect('Counts to check', sum.checkLine, '1 count to check');
expect('OK count', sum.counts.ok, 10);
console.log(`Urgent-first (phone home): ${urgentFirst(views).map((v) => `${v.item.name} [${v.needsCheck ? 'Check' : v.status.label}]`).join(', ')}`);

const ji1042 = [...db.shipments.values()].find((s) => s.number === 1042);
console.log(`RUTF: target ${formatRutf(target(db, 'jigawan_iro', 'rutf').qty)}, in transit ${formatRutf(stockView(db, 'jigawan_iro', 'rutf').inTransit)} (shipment 1042), next monthly top-up ${formatRutf(topUp(db, 'jigawan_iro', 'rutf', '2026-11'))}`);
console.log(`Emergency request: ${emergencyRequest(db, 'jigawan_iro').lines.map((l) => `${db.item(l.itemId).name}: ${l.qty === null ? l.note : formatQty(db.item(l.itemId), l.qty)}`).join('; ')}`);

// ---------- Other agreed values ----------
console.log('\n## Other agreed values\n');
console.log('| Check | Got | Expected | |');
console.log('|---|---|---|---|');
function row(label, got, want) {
  const m = expect(label, got, want);
  console.log(`| ${label} | ${got} | ${want} | ${m ? 'MISMATCH' : 'OK'} |`);
}
const z = stockView(db, 'zaune', 'rutf');
const zReq = emergencyRequest(db, 'zaune').lines.find((l) => l.itemId === 'rutf');
row('Zaune RUTF on hand', formatRutf(z.onHand), '3,630 sachets (24 cartons + 30 loose)');
row('Zaune RUTF use a month (Aug, Sep)', formatNumber(Math.round(z.amc)), '13,750');
row('Zaune RUTF lasts until', `${formatShortDate(z.lastsUntil)} (${z.days} days)`, '7 Nov (8 days)');
row('Zaune RUTF status', z.status.label, 'Order now');
row('Zaune estimated 2-month target', formatNumber(zReq.target), '27,500');
row('Zaune emergency top-up', formatRutf(zReq.qty), '23,870 sachets (159 cartons + 20 loose)');
row('Zaune Estimated target badge', z.estimated, true);
const k = stockView(db, 'kalshingi', 'rutf');
row('Kalshingi RUTF', `${formatNumber(k.onHand)}, ${k.months.toFixed(1)} months, ${k.status.label}, estimated ${k.estimated}`, '3,900, 2.0 months, OK, estimated true');
const ag = stockView(db, 'ashaka_gari', 'rutf');
row('Ashaka Gari RUTF', `${formatNumber(ag.onHand)}, ${ag.months.toFixed(1)} months, ${ag.status.label}, above target ${ag.aboveTarget}`, '9,600, 1.7 months, OK, above target false');
row('Jigawan Iro RUTF use a month', formatNumber(Math.round(amc(db, 'jigawan_iro', 'rutf'))), '3,019');
row('Kalshingi RUTF use a month', formatNumber(Math.round(amc(db, 'kalshingi', 'rutf'))), '1,970');
row('Ashaka Gari RUTF use a month', formatNumber(Math.round(amc(db, 'ashaka_gari', 'rutf'))), '5,516');
const net = networkPosition(db, 'rutf');
row('Network RUTF use a month', formatNumber(Math.round(net.monthlyUse)), '188,205');
const c = stockView(db, 'central', 'rutf');
row('Central store RUTF target (3 months)', formatNumber(c.target.qty), '564,615');
row('Central store RUTF', `${formatNumber(c.onHand)} + ${formatNumber(c.onOrder)} on order = ${c.monthsInclPipeline.toFixed(1)} months, below target ${c.belowCentralTarget}`, '410,000 + 40,000 on order = 2.4 months, below target true');
const other23 = db.stores.filter((s) => s.type === 'OTP' && !['jigawan_iro', 'zaune', 'kalshingi', 'ashaka_gari'].includes(s.id)).reduce((t, s) => t + stockView(db, s.id, 'rutf').onHand, 0);
row('Other 23 OTPs RUTF combined', formatNumber(other23), '230,000');
console.log(`| Network RUTF (stores + in transit), months incl. on order | ${formatNumber(net.held + net.inTransit)} sachets, ${net.monthsInclOrder.toFixed(1)} months | (information) | |`);
const ks = facilitySummary(db, 'kurjale');
const kc = latestCount(db, 'kurjale', 'rutf');
row('Kurjale (real use: Z AA (Toddler) about 0.1 a month)', `${ks.line}, counted today ${formatTime(kc.ts)}`, '1 item with too much, counted today 5:25 PM');
const mv = stockView(db, 'maikaho', 'rutf');
const mc = latestCount(db, 'maikaho', 'rutf');
row('Maikaho', `${mv.status.label}, last counted ${formatShortDate(dateOf(mc.ts))} ${formatTime(mc.ts)}`, 'Not counted today, last counted 29 Oct 5:15 PM');
const esc = escalation(db, 'jigawan_iro');
row('Jigawan Iro escalation', `${esc.level}, ${esc.supervisor}, first flag ${formatShortDate(esc.firstFlagDate)}, management on ${formatShortDate(esc.managementDate)}`, 'supervisor, Hajara Nuhu, first flag 20 Oct, management on 19 Nov');
row('Shipment 1042', `${ji1042.state}, ${hoursInSent(db, ji1042)} hours in Sent, ${ji1042.lines.map((l) => formatQty(db.item(l.itemId), l.qtySent)).join(' + ')}`, 'sent, 32 hours in Sent, 1,800 sachets (12 cartons) + 23 packs');
const sh1037 = [...db.shipments.values()].find((s) => s.number === 1037);
row('Shipment 1037', `${sh1037.state}, ${hoursInSent(db, sh1037)} hours, overdue ${sentTooLong(db, sh1037)}, ${sh1037.lines.map((l) => formatQty(db.item(l.itemId), l.qtySent)).join(' + ')}`, 'sent, 100 hours, overdue true, 600 x 1000 ml + 100 vials');
const est = db.stores.filter((s) => s.type === 'OTP' && usageInfo(db, s.id, 'rutf').estimated).map((s) => s.label);
row('OTPs with Estimated target', est.join(', '), 'Barambu, Daban Fulani, Dukul, Jamari, Kalshingi, Zaune');
const itpEst = db.stores.filter((s) => s.type === 'ITP').map((s) => `${s.label}: ${db.itemsForStore(s.id).filter((i) => usageInfo(db, s.id, i.id)?.estimated).length}`);
row('ITP items with Estimated target', itpEst.join(', '), 'GH Bajoga: 0, GH Deba: 0, GH Dukku: 0');
const monthly = db.odk.months.map((m) => Object.values(db.odk.usage).reduce((t, u) => t + (u.rutf?.[m] || 0), 0));
row('RUTF use by month (chart)', monthly.map((x) => formatNumber(Math.round(x))).join(' | '), '48,677 | 44,489 | 72,249 | 146,179 | 140,694 | 205,652 | 211,573 | 187,420 | 188,990 | 117,705');
row('RUTF display, exact cartons', formatRutf(1800), '1,800 sachets (12 cartons)');
row('RUTF display, under 150', formatRutf(131), '131 sachets');
row('Count read-back', rutfReadBack(12, 37).text, '12 sealed cartons + 37 loose = 1,837 sachets');

// ---------- Design demo values (final design files) ----------
const deba = (name) => {
  const it = db.itemIdFor(name);
  const counts = db.ledger.entries('gh_deba', it).filter((e) => e.kind === 'count');
  const [y, t] = counts.slice(-2);
  const recv = db.ledger.entries('gh_deba', it).filter((e) => e.kind === 'received' && dateOf(e.ts) === '2026-10-30').reduce((s, e) => s + e.qty, 0);
  return `${formatNumber(y.qty)} + ${formatNumber(recv)} - ${formatNumber(t.qty)} = ${formatNumber(y.qty + recv - t.qty)} used (${stockView(db, 'gh_deba', it).status.label})`;
};
row('GH Deba log, F75', deba('F75'), '240 + 0 - 214 = 26 used (Running low)');
row('GH Deba log, F100', deba('F100'), '410 + 120 - 468 = 62 used (Running low)');
row('GH Deba log, Ceftriaxone 1g', deba('Ceftriaxone 1g (Tandak/Syceph)'), '48 + 0 - 36 = 12 used (Running low)');
row('GH Deba log, IV Artesunate 30mg', deba('IV Artesunate 30mg (Rekmal)'), '6 + 0 - 0 = 6 used (Out of stock)');
row('GH Deba log, Normal saline 500 ml', deba('Normal saline 500 ml'), '75 + 0 - 68 = 7 used (Running low)');
const exp = needsAttention(db).flatMap((g) => g.alerts).find((a) => a.type === 'EXPIRY');
row('Will expire before use', exp ? `${db.store(exp.storeId).name}, ${db.item(exp.itemId).name} batch ${exp.batches.map((b) => b.batch).join(', ')}, expires ${formatShortDate(exp.expiry)}, about ${Math.round(exp.unused / 10) * 10} will not be used` : '', 'GH Bajoga ITP, F100 batch F1-2501, expires 30 Nov, about 210 will not be used');
const jh = db.ledger.history('jigawan_iro', 'rutf').filter((r) => r.entry.tsMs >= Date.parse('2026-10-27T10:00:00+01:00'));
row('Jigawan Iro RUTF history from the 27 Oct delivery (design: item history)', jh.map((r) => `${r.entry.kind}${r.entry.recount ? ' (recount)' : ''} ${r.entry.kind === 'count' ? r.entry.qty : r.entry.qty} -> ${r.balance}${r.inEffect ? '' : ' (waiting)'}`).join(', '),
  'received 600 -> 4660, used 98 -> 4562, count 4526 -> 4526, adjustment 36 -> 4562, used 100 -> 4462, count (recount) 4432 -> 4432, count 4432 -> 4432, used 101 -> 4331, count 4331 -> 4331, adjustment -180 -> 4331 (waiting)');
const z1043 = db.shipments.get('sh-1043');
row('Zaune emergency (planned by logistics)', `${z1043.number}, ${z1043.state}, ${formatRutf(z1043.lines[0].qtyProposed)}, target locked ${formatTime(z1043.steps.requested.at)} by ${z1043.steps.requested.byName}`, '1043, requested, 23,870 sachets (159 cartons + 20 loose), target locked 5:10 PM by Nasiru Bello');
const jiOutBefore = needsAttention(db).flatMap((g) => g.alerts).find((a) => a.type === 'OUT' && a.storeId === 'jigawan_iro');
row('Jigawan Iro emergency request (starts unsent)', `open requests ${[...db.shipments.values()].filter((sh) => sh.toStoreId === 'jigawan_iro' && sh.type === 'emergency' && sh.state === 'requested').length}, Out of stock alert button: ${jiOutBefore.action.label}`, 'open requests 0, Out of stock alert button: Send emergency shipment');

const kp = monthKpis(db);
row('Management indicators (design: Management overview)', `stock-out days ${kp.stockOutDays} (${kp.stockOutDaysLastMonth} in Sept), on time ${Math.round(kp.onTimeShare * 100)}% (${kp.countsOnTime} of ${kp.facilityDays}), accuracy ${(kp.accuracy * 100).toFixed(1)}%, unexplained ${kp.unexplained}, emergency ${Math.round(kp.emergencyShare * 100)}% (${kp.emergency} of ${kp.orders})`,
  'stock-out days 6 (4 in Sept), on time 94% (846 of 900), accuracy 96.2%, unexplained 3, emergency 11% (4 of 35)'); // 14% (5 of 36) once Muhammad S. sends his request (see Actions)
row('Network RUTF on hand (design: 661,461 + 40,000 on order)', `${formatNumber(kp.rutf.held)} held + ${formatNumber(kp.rutf.inTransit)} in transit + ${formatNumber(kp.rutf.onOrder)} on order`, '661,461 held + 1,800 in transit + 40,000 on order');

// Round 3: the central store is judged by the central store rules (3 months of network use, counting stock on order).
const cr = stockView(db, 'central', 'rutf');
row('Central store RUTF status (every screen uses this view)', `${cr.status.label}, ${cr.months.toFixed(1)} months incl. on order, above target ${cr.aboveTarget}, last updated ${formatShortDate(dateOf(cr.lastUpdated.at))} ${formatTime(cr.lastUpdated.at)}`, 'Below 3-month target, 2.4 months incl. on order, above target false, last updated 30 Oct 8:00 AM');
const firstLines = db.stores.flatMap((st) => db.itemsForStore(st.id).map((it) => db.ledger.history(st.id, it.id)[0])).filter(Boolean);
row('Every item history starts with its opening balance', firstLines.every((r) => r.entry.kind === 'opening') ? 'yes' : firstLines.filter((r) => r.entry.kind !== 'opening').length + ' do not', 'yes');

// Statuses that appear somewhere in the network.
const seen = new Set();
for (const s of db.stores) for (const v of storeItems(db, s.id)) { seen.add(v.status.label); if (v.needsCheck) seen.add('Check'); if (v.aboveTarget) seen.add('Above target'); if (v.estimated) seen.add('Estimated target'); }
row('Every status appears somewhere', ['Out of stock', 'Order now', 'Check', 'Running low', 'Not counted today', 'Too much', 'OK', 'Usage not tracked', 'Above target', 'Estimated target', 'Below 3-month target'].filter((x) => !seen.has(x)).join(', ') || 'all', 'all');

// ---------- Needs attention (logistics) ----------
console.log('\n## Logistics: Needs attention today\n');
const groups = needsAttention(db);
const sname = (id) => db.store(id).name;
for (const g of groups) {
  console.log(`### ${g.heading}`);
  g.alerts.forEach((a, i) => {
    let text;
    switch (a.type) {
      case 'OUT': case 'ORDER_NOW':
        text = `${sname(a.storeId)}: ${a.items.map((x) => `${x.name}${a.type === 'ORDER_NOW' ? ` (lasts until ${formatShortDate(x.lastsUntil)}, ${x.days} days)` : ''}`).join(', ')}`; break;
      case 'OVERDUE': text = `Shipment ${a.number} to ${sname(a.storeId)}: in Sent for ${a.hours} hours`; break;
      case 'ESCALATION': text = `${sname(a.storeId)}: ${a.flagCount} count differences since ${formatShortDate(a.firstFlagDate)} (${a.itemIds.map((x) => db.item(x).name).join(', ')}), sent to supervisor ${a.supervisor}; goes to management on ${formatShortDate(a.managementDate)} if it keeps happening`; break;
      case 'COUNT_DIFF': text = `${sname(a.storeId)}: ${db.item(a.itemId).name} counted ${a.counted}, expected ${a.expected}`; break;
      case 'NOT_COUNTED': text = [...a.stores.map((x) => `${sname(x.storeId)}: last counted ${formatShortDate(dateOf(x.lastCountAt))} ${formatTime(x.lastCountAt)}`), ...a.partial.map((x) => `${sname(x.storeId)} left ${x.itemIds.length} ${x.itemIds.length === 1 ? 'item' : 'items'} blank: ${x.itemIds.map((i) => db.item(i).name).join(', ')}`)].join('; '); break;
      case 'STORE_PROBLEM': text = `${sname(a.storeId)}: ${a.problem.problems.join(', ')} reported by ${a.problem.byName}`; break;
      case 'APPROVAL': text = `${sname(a.storeId)}: ${db.item(a.itemId).name} correction ${formatQty(db.item(a.itemId), a.qty)} (${a.reason}) by ${a.requestedBy}, waiting for ${a.approver}`; break;
      case 'CENTRAL_BELOW': text = `Central store ${db.item(a.itemId).name}: ${a.monthsInclOrder.toFixed(1)} months, including ${formatQty(db.item(a.itemId), a.onOrder)} on order (target ${formatQty(db.item(a.itemId), a.target)})`; break;
      case 'EXPIRY': text = `${sname(a.storeId)}: ${db.item(a.itemId).name} batch ${a.batches.map((b) => b.batch).join(', ')} expires ${formatShortDate(a.expiry)}, ${formatQty(db.item(a.itemId), a.qty)} on hand, about ${formatQty(db.item(a.itemId), a.unused)} will not be used by then (lasts until ${formatShortDate(a.lastsUntil)})`; break;
      case 'TRANSFER': text = `${sname(a.storeId)} to ${sname(a.toStoreId)}: ${formatQty(db.item(a.itemId), a.qty)} of ${db.item(a.itemId).name}`; break;
      default: text = JSON.stringify(a);
    }
    console.log(`${i + 1}. [${a.label}] ${text}  -> button: ${a.action.label}`);
  });
  console.log('');
}
const allAlerts = groups.flatMap((g) => g.alerts);
const ranks = allAlerts.map((a) => a.rank);
expect('Alert order is by type rank', ranks.every((r, i) => i === 0 || ranks[i - 1] <= r), true);
const ncAlert = allAlerts.find((a) => a.type === 'NOT_COUNTED');
// Round 3: Jigawan Iro now appears in "Not counted today" because its submitted count left TB Bucket blank.
expect('Not counted today alert', `${ncAlert.stores.map((x) => x.storeId).join(', ')} | blank: ${ncAlert.partial.map((x) => `${x.storeId} ${x.itemIds.join(', ')}`).join('; ')}`, 'maikaho, tumfure | blank: jigawan_iro tb_bucket');
expect('No store problem in the demo data', allAlerts.filter((a) => a.type === 'STORE_PROBLEM').length, 0);
const jiOut = allAlerts.find((a) => a.type === 'OUT' && a.storeId === 'jigawan_iro');
expect('Jigawan Iro Out of stock alert lists 4 items', jiOut ? jiOut.items.map((x) => x.name).sort().join(', ') : '', 'Ciprotap ear drop, Multivite syrup (Fe/FA), Sponge, Tabs ACT AL 2');

// ---------- Actions on a copy (the seed itself is not changed) ----------
console.log('## Actions (on a separate copy)\n');
const { db: t } = buildDb(src, freshState());
const muhammad = t.user('lto_jigawan_iro');
const drafts = {};
saveCountLine(t, drafts, muhammad, 'jigawan_iro', 'rutf', { sealed: 28, loose: 0 });
const res = submitCount(t, drafts, muhammad, 'jigawan_iro', { storeCheck: true });
const r = res.results[0];
console.log(`- New RUTF count 4,200 after the 5:40 PM count: expected ${formatNumber(r.eval.expected)}, difference ${r.eval.diff}, Check ${r.eval.flagged}, alerts logistics ${r.eval.alertLogistics}; ${res.blanks.length} blank rows listed`);
// 131 sachets is under the alert level (1 carton = 150, smaller than 3 days of use = 298): Check, but no logistics alert.
expect('Recount difference: Check, no logistics alert', `${r.eval.diff} ${r.eval.flagged} ${r.eval.alertLogistics}`, '-131 true false');
const adj = correctEntry(t, muhammad, r.entry.id, { delta: -150, reason: 'theft_loss' });
console.log(`- Correction of -150 sachets (theft or loss): needs approval ${adj.needsApproval}; on hand before approval ${formatNumber(stockView(t, 'jigawan_iro', 'rutf').onHand)}`);
let blocked = '';
try { decideCorrection(t, muhammad, adj.id, 'approved'); } catch (e) { blocked = e.message; }
console.log(`- Same person approving: "${blocked}"`);
decideCorrection(t, t.user('sup_hajara_nuhu'), adj.id, 'approved');
console.log(`- Approved by Hajara Nuhu: on hand ${formatNumber(stockView(t, 'jigawan_iro', 'rutf').onHand)}, pending approvals ${pendingApprovals(t).length}`);
expect('Correction applies after approval', stockView(t, 'jigawan_iro', 'rutf').onHand, 4050);
const req = requestEmergency(t, muhammad, 'jigawan_iro');
const jiOutAfter = needsAttention(t).flatMap((g) => g.alerts).find((a) => a.type === 'OUT' && a.storeId === 'jigawan_iro');
const kpAfter = monthKpis(t);
console.log(`- Muhammad S. sends the emergency request: shipment ${req.number}, ${req.lines.length} items (${req.lines.map((l) => (l.qtyProposed === null ? 'amount set by logistics' : l.qtyProposed)).join(', ')}); logistics button "${jiOutAfter.action.label}"; emergency orders ${kpAfter.emergency} of ${kpAfter.orders}`);
expect('Request number', req.number, 1044);
expect('Out of stock alert after the request', jiOutAfter.action.label, 'Approve request');
expect('Emergency orders after the request', `${Math.round(kpAfter.emergencyShare * 100)}% (${kpAfter.emergency} of ${kpAfter.orders})`, '14% (5 of 36)');
// Round 3: a count with the storage box unticked raises a Store problem; a later ticked count clears it.
const t2 = buildDb(src, freshState()).db;
const d2 = {};
saveCountLine(t2, d2, t2.user('lto_jigawan_iro'), 'jigawan_iro', 'ors', { qty: 96 });
let refused = '';
try { submitCount(t2, d2, t2.user('lto_jigawan_iro'), 'jigawan_iro', { storeCheck: false }); } catch (e) { refused = e.message; }
const sp1 = submitCount(t2, d2, t2.user('lto_jigawan_iro'), 'jigawan_iro', { storeCheck: false, storeProblems: ['not_cool', 'not_locked'], storeNote: 'Door lock broken' });
const spAlert = needsAttention(t2).flatMap((g) => g.alerts).find((a) => a.type === 'STORE_PROBLEM');
const spGroup = needsAttention(t2).find((g) => g.id === spAlert.group);
const order2 = needsAttention(t2).flatMap((g) => g.alerts).map((a) => a.rank);
saveCountLine(t2, d2, t2.user('lto_jigawan_iro'), 'jigawan_iro', 'ors', { qty: 96 });
submitCount(t2, d2, t2.user('lto_jigawan_iro'), 'jigawan_iro', { storeCheck: true });
const spAfter = needsAttention(t2).flatMap((g) => g.alerts).filter((a) => a.type === 'STORE_PROBLEM').length;
console.log(`- Count of 1 item with the storage box unticked: without a reason "${refused}"; with "not cool, not locked": ${sp1.blanks.length} blank rows, Store problem alert in ${spGroup.label} (${spAlert.problem.problems.join(', ')}, by ${spAlert.problem.byName}, note "${spAlert.problem.note}"); after a ticked count: ${spAfter} Store problem alerts`);
expect('Store problem raised', `${spAlert.storeId} ${spAlert.problem.problems.join(',')} ${spGroup.id}`, 'jigawan_iro not_cool,not_locked data');
expect('Store problem cleared by a ticked count', spAfter, 0);
expect('Alert order with a Store problem', order2.every((r, i) => i === 0 || order2[i - 1] <= r), true);
const sh = [...t.shipments.values()].find((s) => s.number === 1042);
receiveShipment(t, muhammad, sh.id, {
  rutf: { batches: [{ batch: 'RU-2604', expiry: '2027-03-31', qty: 1200 }, { batch: 'RU-TEST', expiry: '2027-05-31', qty: 600 }] },
  tom_brown: { batches: [{ batch: 'TB-TEST', expiry: '2027-01-31', qty: 22 }], reason: '1 pack damaged' },
});
console.log(`- Shipment 1042 received: RUTF ${formatRutf(stockView(t, 'jigawan_iro', 'rutf').onHand)}, in transit ${stockView(t, 'jigawan_iro', 'rutf').inTransit}; Tom Brown ${stockView(t, 'jigawan_iro', 'tom_brown').onHand} packs`);
expect('Receiving adds stock', stockView(t, 'jigawan_iro', 'rutf').onHand, 5850);
const up = uploadOdk(t, t.user('log_nasiru_bello'), 'ODK OTP usage Jan-Oct 2026.csv', src.odkCsv);
console.log(`- ODK upload of the provided file: ${up.siteCount} of 27 OTPs, ${up.itemCount} items`);
expect('ODK upload sites', up.siteCount, 27);
const replay = buildDb(src, { ...freshState(), events: t.userEvents });
console.log(`- Replaying the ${t.userEvents.length} saved events gives RUTF ${formatNumber(stockView(replay.db, 'jigawan_iro', 'rutf').onHand)} (dropped ${replay.dropped.length})`);
expect('Replay matches', stockView(replay.db, 'jigawan_iro', 'rutf').onHand, 5850);
const loaded = loadState();
const saved = saveState(loaded.state);
console.log(`- Storage without a browser: available ${loaded.available}, saved ${saved} (kept in memory instead); reset gives ${resetDemoData().events.length} events`);


// ---------- Round 4 ----------
console.log('\n## Round 4\n');
function detailSums(x) {
  const m = monthDetails(x);
  const k = m.kpis;
  const s = (a, f) => a.reduce((n, y) => n + f(y), 0);
  return {
    text: `stock-out days ${s(m.stockOuts, (y) => y.days)} of ${k.stockOutDays}; days not on time ${s(m.onTime, (y) => y.days)} of ${k.facilityDays - k.countsOnTime}; counts ${s(m.accuracy, (y) => y.made)} of ${k.otpCounts}, matched ${s(m.accuracy, (y) => y.matched)} of ${k.accurate}; unexplained ${m.unexplained.length} of ${k.unexplained}; emergency ${m.emergency.length} of ${k.emergency}`,
    ok: s(m.stockOuts, (y) => y.days) === k.stockOutDays && s(m.onTime, (y) => y.days) === k.facilityDays - k.countsOnTime && s(m.accuracy, (y) => y.made) === k.otpCounts && s(m.accuracy, (y) => y.matched) === k.accurate && m.unexplained.length === k.unexplained && m.emergency.length === k.emergency,
    m,
  };
}
const dBefore = detailSums(db);
row('Management detail records add up (start)', dBefore.text, 'stock-out days 6 of 6; days not on time 54 of 54; counts 756 of 756, matched 727 of 727; unexplained 3 of 3; emergency 4 of 4');
row('Demo records stay the same on every load', JSON.stringify(demoMonthRecords(db)) === JSON.stringify(demoMonthRecords(buildDb(src, freshState()).db)) ? 'yes' : 'no', 'yes');
row('Unexplained differences (worst first)', dBefore.m.unexplained.map((x) => `${db.store(x.storeId).label} ${db.item(x.itemId).name} ${formatShortDate(x.date)} ${x.counted} vs ${x.expected}`).join('; '), 'Jamari ORS 3 Oct 85 vs 93; Jigawan Iro Amoxicillin susp 60ml 26 Oct 91 vs 98; Jigawan Iro Amoxicillin susp 60ml 20 Oct 108 vs 116');
const dAfter = detailSums(t);
row('Management detail records add up (after the walkthrough copy)', dAfter.ok ? 'yes' : dAfter.text, 'yes');
console.log(`  (after: ${dAfter.text})`);

// Receive 1042 with a short RUTF amount and a changed expiry: logistics sees a Receipt difference at rank 5.
const t3 = buildDb(src, freshState()).db;
const sh3 = [...t3.shipments.values()].find((s) => s.number === 1042);
receiveShipment(t3, t3.user('lto_jigawan_iro'), sh3.id, {
  rutf: { batches: [{ batch: 'RU-2604', expiry: '2027-03-31', qty: 1200, sentBatch: 'RU-2604', sentExpiry: '2027-03-31' }, { batch: 'RU-2611', expiry: '2027-05-31', qty: 450, sentBatch: 'RU-2611', sentExpiry: '2027-06-30', editReason: 'Different date on the cartons' }], reason: 'Short: 1 carton missing' },
  tom_brown: { batches: [{ batch: 'TB-0925', expiry: '2027-01-15', qty: 23, sentBatch: 'TB-0925', sentExpiry: '2027-01-15' }] },
});
const rd = needsAttention(t3).flatMap((g) => g.alerts).filter((a) => a.type === 'RECEIPT_DIFF');
row('Receipt difference alert (1042 short, expiry changed)', rd.map((a) => `rank ${a.rank} ${a.group} ${a.number} ${t3.item(a.itemId).name}: ${a.diffs.map((x) => `${x.kind} ${x.sent} -> ${x.received}`).join(', ')}`).join(' | '), 'rank 5 data 1042 RUTF: qty 1800 -> 1650, expiry 2027-06-30 -> 2027-05-31');
const rcv3 = t3.ledger.entries('jigawan_iro', 'rutf').filter((e) => e.kind === 'received' && e.shipmentId === sh3.id).flatMap((e) => e.batches);
row('The stock record keeps the confirmed expiry and what logistics entered', rcv3.map((x) => `${x.batch} ${x.expiry}${x.sentExpiry && x.sentExpiry !== x.expiry ? ` (sent ${x.sentExpiry}, "${x.editReason}")` : ''}`).join('; '), 'RU-2604 2027-03-31; RU-2611 2027-05-31 (sent 2027-06-30, "Different date on the cartons")');
addNote(t3, t3.user('log_nasiru_bello'), sh3.id, 'Checked with the driver');
row('Receipt difference clears after a logistics note', needsAttention(t3).flatMap((g) => g.alerts).filter((a) => a.type === 'RECEIPT_DIFF').length, 0);

// Wrong PIN: 3 tries, a short lock, an unlock request for logistics, and removed access.
const t4 = buildDb(src, freshState()).db;
const tries = [trySignIn(t4, 'pharm_gh_deba', '1111'), trySignIn(t4, 'pharm_gh_deba', '2222'), trySignIn(t4, 'pharm_gh_deba', '3333')];
row('Wrong PIN tries', tries.map((x) => (x.reason === 'wrong' ? `wrong, ${x.triesLeft} left` : x.reason)).join('; '), 'wrong, 2 left; wrong, 1 left; locked');
row('Right PIN while locked', trySignIn(t4, 'pharm_gh_deba', '1234').reason, 'locked');
requestUnlock(t4, 'pharm_gh_deba');
const ua = needsAttention(t4).flatMap((g) => g.alerts).find((a) => a.type === 'UNLOCK');
row('Unlock request for logistics', ua ? `rank ${ua.rank}, ${ua.label}, button ${ua.action.label}, logistics only ${ua.logisticsOnly}` : 'none', 'rank 8, Approval waiting, button Unlock now, logistics only true');
row('Unlock request not on the supervisor home', alertsForStores(t4, ['gh_deba']).some((a) => a.type === 'UNLOCK') ? 'shown' : 'not shown', 'not shown');
unlockAccount(t4, t4.user('log_nasiru_bello'), 'pharm_gh_deba', 'Asked to unlock');
row('After Unlock now', `${trySignIn(t4, 'pharm_gh_deba', '1234').ok}, alerts ${needsAttention(t4).flatMap((g) => g.alerts).filter((a) => a.type === 'UNLOCK').length}`, 'true, alerts 0');
const t5 = buildDb(src, freshState()).db;
trySignIn(t5, 'lto_kurjale', '0000'); trySignIn(t5, 'lto_kurjale', '0000'); trySignIn(t5, 'lto_kurjale', '0000');
t5.setNow('2026-10-30T18:06:01+01:00');
row('Lock ends by itself after 1 minute', `${pinState(t5, 'lto_kurjale').locked}, sign in ${trySignIn(t5, 'lto_kurjale', '1234').ok}`, 'false, sign in true');
removeAccess(t5, t5.user('log_nasiru_bello'), 'lto_kurjale', 'Left Taimaka');
row('Removed access', `${trySignIn(t5, 'lto_kurjale', '1234').reason}; log: ${t5.accounts.log.map((x) => `${x.text} by ${x.stamp.byName} (${x.reason})`).join('; ')}`, 'removed; log: Access removed by Nasiru Bello (Left Taimaka)');
restoreAccess(t5, t5.user('log_nasiru_bello'), 'lto_kurjale', 'Back at work');
row('Restored access', trySignIn(t5, 'lto_kurjale', '1234').ok, true);
const t5r = buildDb(src, { ...freshState(), events: t5.userEvents });
row('Account events replay', `${t5r.dropped.length} dropped, ${t5r.db.accounts.log.length} log lines`, '0 dropped, 2 log lines');

// ODK upload: the bundled file, a file with a misspelled site and item, and a file with September missing.
const odkLines = src.odkCsv.split(/\r?\n/);
const misspelled = odkLines.map((l) => l.replace(/^ashaka_gari,RUTF,/, 'ashaka_garri,RUTF,').replace(/^barambu,Tom Brown,/, 'barambu,Tom Brwn,')).join('\n');
const noSep = odkLines.map((l) => l.split(',').filter((_, i) => i !== 10).join(',')).join('\n');
const pBundled = db.parseOdk(src.odkCsv);
const pMis = db.parseOdk(misspelled);
const pNoSep = db.parseOdk(noSep);
row('ODK preview, bundled file', `${pBundled.siteCount} sites, ${pBundled.itemCount} items, ${pBundled.months.length} months, ${pBundled.problems.length} problems, ignored ${pBundled.ignored.join(', ')}`, '27 sites, 19 items, 10 months, 0 problems, ignored total_jan_oct');
row('ODK preview, misspelled site and item', pMis.problems.map((p) => `row ${p.row}: ${p.reason}`).join(' | '), 'row 2: Unknown site "ashaka_garri". Did you mean ashaka_gari? | row 22: Unknown item name "Tom Brwn". Closest known name: Tom Brown');
row('ODK preview, September missing', `months ${pNoSep.months.length}, has Sep ${pNoSep.months.includes('2026-09')}`, 'months 9, has Sep false');
const t6 = buildDb(src, freshState()).db;
uploadOdk(t6, t6.user('log_nasiru_bello'), 'no-september.csv', noSep);
row('Upload without September keeps September (Zaune RUTF a month)', formatNumber(Math.round(amc(t6, 'zaune', 'rutf'))), '13,750');
uploadOdk(t6, t6.user('log_nasiru_bello'), 'misspelled.csv', misspelled);
row('Upload with unreadable rows keeps their numbers (Ashaka Gari RUTF a month)', formatNumber(Math.round(amc(t6, 'ashaka_gari', 'rutf'))), '5,516');
let badFile = '';
try { uploadOdk(t6, t6.user('log_nasiru_bello'), 'bad.csv', 'a,b\n1,2'); } catch (e) { badFile = e.message; }
row('A file without site and item columns is refused', badFile, 'The file needs a "site" column and an "item" column.');

// Service worker: its file list matches every file the app loads.
const swText = fs.readFileSync('sw.js', 'utf8');
const swFiles = [...swText.matchAll(/^\s+'([^']+)',$/gm)].map((x) => x[1]).filter((f) => f !== './');
const need = new Set(['index.html', 'manifest.webmanifest', ...Object.values(DATA_FILES)]);
const html0 = fs.readFileSync('index.html', 'utf8');
for (const m of html0.matchAll(/(?:href|src)="([^"#:]+)"/g)) need.add(m[1]);
const man = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
for (const i of man.icons) need.add(i.src);
const seenJs = new Set();
const walk = (f) => { if (seenJs.has(f)) return; seenJs.add(f); need.add(f); const dir = f.split('/').slice(0, -1).join('/'); for (const m of fs.readFileSync(f, 'utf8').matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)) { const parts = `${dir}/${m[1]}`.split('/'); const out = []; for (const p of parts) { if (p === '..') out.pop(); else if (p !== '.') out.push(p); } walk(out.join('/')); } };
walk('js/ui/main.js');
for (const f of seenJs) for (const m of fs.readFileSync(f, 'utf8').matchAll(/src="(Assets\/[^"]+)"/g)) need.add(m[1]); // images the screens load
for (const m of fs.readFileSync('css/fonts.css', 'utf8').matchAll(/url\(['"]?\.\.\/([^'")]+)/g)) need.add(m[1]);
need.add('Assets/taimaka-logo.svg');
const missingSw = [...need].filter((f) => !swFiles.includes(f));
const extraSw = swFiles.filter((f) => !need.has(f) || !fs.existsSync(f));
row('Service worker caches every file the app loads', missingSw.length || extraSw.length ? `missing ${missingSw.join(', ')}; extra ${extraSw.join(', ')}` : `yes (${swFiles.length} files)`, `yes (${swFiles.length} files)`);

console.log(`\n## Result: ${mismatches.length ? `${mismatches.length} mismatch(es)` : 'all values match'}\n`);
for (const m of mismatches) console.log(`- ${m}`);
