// Logic check: prints the Jigawan Iro results for all 26 bin card items, the facility summary,
// Zaune and other agreed values, and the logistics "Needs attention" list, and compares each value
// with the agreed check values (CLAUDE.md "Data facts" and the second round of design feedback, item 12).
// Run: node tools/check.mjs

import fs from 'node:fs';
import { buildDb, DATA_FILES } from '../js/app-data.js';
import { freshState, loadState, saveState, resetDemoData } from '../js/storage.js';
import {
  storeItems, facilitySummary, stockView, emergencyRequest, target, escalation, usageInfo, amc, networkPosition,
  hoursInSent, sentTooLong, latestCount, urgentFirst, topUp,
} from '../js/stock.js';
import { needsAttention } from '../js/alerts.js';
import { monthKpis } from '../js/kpis.js';
import { formatQty, formatRutf, formatNumber, rutfReadBack } from '../js/format.js';
import { formatShortDate, formatTime } from '../js/time.js';
import { saveCountLine, submitCount, correctEntry, decideCorrection, receiveShipment, uploadOdk, pendingApprovals, requestEmergency } from '../js/actions.js';
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

// Statuses that appear somewhere in the network.
const seen = new Set();
for (const s of db.stores) for (const v of storeItems(db, s.id)) { seen.add(v.status.label); if (v.needsCheck) seen.add('Check'); if (v.aboveTarget) seen.add('Above target'); if (v.estimated) seen.add('Estimated target'); }
row('Every status appears somewhere', ['Out of stock', 'Order now', 'Check', 'Running low', 'Not counted today', 'Too much', 'OK', 'Usage not tracked', 'Above target', 'Estimated target'].filter((x) => !seen.has(x)).join(', ') || 'all', 'all');

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
      case 'NOT_COUNTED': text = a.stores.map((x) => `${sname(x.storeId)}: last counted ${formatShortDate(dateOf(x.lastCountAt))} ${formatTime(x.lastCountAt)}`).join('; '); break;
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

console.log(`\n## Result: ${mismatches.length ? `${mismatches.length} mismatch(es)` : 'all values match'}\n`);
for (const m of mismatches) console.log(`- ${m}`);
