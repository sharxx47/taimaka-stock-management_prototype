// Screen 8: management overview (read only). Indicators, network RUTF with months of stock, and RUTF use
// by month (real ODK data). Round 4: each indicator card opens the records behind its number (its own screen,
// with Back), RUTF across the network is a full-width section, and each month of the chart has a tooltip.

import { html, raw } from '../dom.js';
import { ic, chip, header, linkBtn, flashBanner, statusChip } from '../parts.js';
import { formatShortDate, formatTime, MONTH_NAMES, addDays, dateOf } from '../../time.js';
import { formatNumber, formatRutf } from '../../format.js';
import { today, centralBelowTarget, currentMonth, stockView, STATUS } from '../../stock.js';
import { monthKpis, monthDetails, rutfByMonth, ACCURACY_GOAL } from '../../kpis.js';
import { DAYS_PER_MONTH } from '../../config.js';

const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const LEAN = new Set(['06', '07', '08', '09']); // design: "Lean season (Jun to Sep)"
const DEMO_LINE = 'Stock-out days, counts on time, count accuracy, unexplained differences and emergency orders for 1 to 29 October are demo values; today\'s part is worked out from today\'s entries. RUTF use and months of stock come from the real ODK usage file.';

function pct(x, digits = 0) {
  return x === null ? 'n/a' : `${(x * 100).toFixed(digits)}%`;
}

// ---------- RUTF used per month (chart with a tooltip per month) ----------

function chart(ctx) {
  const { db } = ctx;
  const data = rutfByMonth(db);
  const max = Math.max(...data.map((x) => x.qty));
  const cur = currentMonth(db);
  const peak = data.reduce((a, b) => (b.qty > a.qty ? b : a), data[0]);
  const first = data[0];
  const sites = Object.values(db.odk.usage);
  return html`<section class="card col g16" aria-labelledby="ch">
<div class="row sp"><h2 class="h3" id="ch">RUTF used per month, thousands of sachets, all ${Object.keys(db.odk.usage).length} OTPs, ${cur.slice(0, 4)}</h2><span class="row g16 small"><span class="row g8"><span style="width: 14px; height: 14px; background: #FFF6E3; border: 1px solid #F0C47A; border-radius: 3px; display: inline-block"></span>Lean season (Jun to Sep)</span><span class="row g8"><span style="width: 14px; height: 14px; border: 2px dashed #5E6A6E; border-radius: 3px; display: inline-block"></span>${MONTH_FULL[Number(cur.slice(5, 7)) - 1]} is partial: data runs to about 19 Oct</span></span></div>
<p class="small muted" style="margin: 0">Point at a month, or tap it, for the details.</p>
<div>
<div class="row" style="flex-wrap: nowrap; align-items: flex-end; gap: 6px; height: 280px; border-bottom: 2px solid #1B2A2F">
${data.map((x, i) => {
    const m = x.month.slice(5, 7);
    const lean = LEAN.has(m);
    const partial = x.month === cur;
    const h = Math.round((x.qty / max) * 240);
    const prev = data[i - 1];
    const change = prev ? x.qty - prev.qty : null;
    const reported = sites.filter((u) => (u.rutf?.[x.month] || 0) > 0).length;
    const name = `${MONTH_FULL[Number(m) - 1]} ${x.month.slice(0, 4)}`;
    const bar = partial
      ? `display: block; width: 70%; max-width: 56px; height: ${h}px; box-sizing: border-box; background: #FFFFFF; border: 2px dashed #5E6A6E; border-bottom: 0; border-radius: 6px 6px 0 0`
      : `display: block; width: 70%; max-width: 56px; height: ${h}px; background: ${lean ? '#292D3D' : '#8FA3B8'}; border-radius: 6px 6px 0 0`;
    const changeText = change === null ? 'First month in the file' : `${change >= 0 ? '+' : '-'}${formatNumber(Math.round(Math.abs(change)))} sachets (${change >= 0 ? '+' : '-'}${Math.abs(Math.round((change / prev.qty) * 100))}%) from ${MONTH_NAMES[Number(prev.month.slice(5, 7)) - 1]}`;
    const tipSide = i < 2 ? ' tip-l' : i > data.length - 3 ? ' tip-r' : '';
    return html`<button type="button" class="mcol${tipSide}" aria-label="${name}: ${formatRutf(Math.round(x.qty))} used. ${changeText}. ${reported} OTPs reported.${lean ? ' Lean season.' : ''}${partial ? ' Partial month.' : ''}"${lean ? raw(' style="background: #FFF6E3"') : ''}>
<span class="small b num-t">${Math.round(x.qty / 1000)}k</span><span class="mbar" style="${raw(bar)}"></span>
<span class="tip" aria-hidden="true"><span class="b">${name}${partial ? ' (partial, to about 19 Oct)' : ''}</span><br>${formatRutf(Math.round(x.qty))} used<br>${changeText}<br>${reported} of ${sites.length} OTPs reported<br>${lean ? 'Lean season' : 'Not lean season'}</span>
</button>`;
  })}
</div>
<div class="row" style="flex-wrap: nowrap; gap: 6px; padding-top: 6px" aria-hidden="true">${data.map((x) => html`<span class="small muted" style="flex: 1 1 0; min-width: 0; overflow-wrap: anywhere; text-align: center">${MONTH_NAMES[Number(x.month.slice(5, 7)) - 1]}${x.month === cur ? ' (partial)' : ''}</span>`)}</div>
</div>
<p class="muted" style="margin: 0">Peak in ${MONTH_FULL[Number(peak.month.slice(5, 7)) - 1]}: ${formatRutf(Math.round(peak.qty))}, ${peak.qty / first.qty >= 4 ? `more than ${Math.floor(peak.qty / first.qty)} times` : `${(peak.qty / first.qty).toFixed(1)} times`} ${MONTH_FULL[Number(first.month.slice(5, 7)) - 1]} (${formatRutf(Math.round(first.qty)).replace(' (', ', ').replace(/\)$/, '')})</p>
</section>`;
}

// ---------- RUTF across the network (full width) ----------

function rutfSection(ctx) {
  const { db } = ctx;
  const d = today(db);
  const r = monthKpis(db).rutf;
  const central = stockView(db, 'central', 'rutf');
  const use = r.monthlyUse;
  const atFac = r.held - (central.onHand || 0);
  const parts = [
    { key: 'fac', label: 'At facilities', qty: atFac, cls: 'rs-fac', note: `${db.stores.filter((s) => s.type === 'OTP').length} OTPs` },
    { key: 'cen', label: 'At the central store', qty: central.onHand || 0, cls: 'rs-cen', note: 'Gombe' },
    { key: 'tr', label: 'In transit', qty: r.inTransit, cls: 'rs-tr', note: 'sent, not yet received' },
    { key: 'ord', label: 'On order', qty: r.onOrder, cls: 'rs-ord', note: 'from the supplier' },
  ];
  const total = parts.reduce((t, p) => t + p.qty, 0);
  const months = use ? total / use : null;
  const days = use ? Math.floor(total / (use / DAYS_PER_MONTH)) : null;
  const pos = [...db.purchaseOrders.values()].filter((p) => p.itemId === 'rutf');
  const facViews = db.stores.filter((s) => s.type !== 'CENTRAL' && db.holds(s.id, 'rutf')).map((s) => ({ s, v: stockView(db, s.id, 'rutf') }));
  const groups = [['OUT', 'Out of stock'], ['ORDER_NOW', 'Order now'], ['LOW', 'Running low']].map(([code, label]) => ({ code, label, list: facViews.filter((x) => x.v.status.code === code) }));
  const targetQty = central.target ? central.target.qty : null;
  const together = (central.onHand || 0) + central.onOrder;
  const share = (q) => (total ? (q / total) * 100 : 0);
  return html`<section class="card col g24" aria-labelledby="rutfh">
<div class="row sp" style="align-items: flex-start">
<div class="col g4"><h2 class="h2" id="rutfh">RUTF across the network</h2><p class="muted" style="margin: 0">The core of treatment and the biggest cost. Network use: <span class="b">${formatRutf(Math.round(use))} a month</span> (average of August and September, all OTPs).</p></div>
<div class="col g4" style="align-items: flex-end; text-align: right"><span class="kpi-v">${months === null ? 'n/a' : months.toFixed(1)} <span style="font-size: 18px">months</span></span><span class="muted">Lasts until <span class="b">${days === null ? 'n/a' : `${formatShortDate(addDays(d, days))} ${addDays(d, days).slice(0, 4)}`}</span> at current use, counting stock on order</span></div>
</div>
<div class="col g8">
<h3 class="h3">Where the stock is</h3>
<div class="rbar" role="img" aria-label="${parts.map((p) => `${p.label} ${Math.round(share(p.qty))}%`).join(', ')}">${parts.filter((p) => p.qty > 0).map((p) => html`<span class="${p.cls}" style="width: ${share(p.qty).toFixed(2)}%" title="${p.label}"></span>`)}</div>
<div class="rlegend" aria-hidden="true">${parts.map((p) => html`<span class="row g8"><span class="sw-key ${p.cls}"></span>${p.label} <span class="b">${share(p.qty) < 1 && p.qty > 0 ? 'under 1' : Math.round(share(p.qty))}%</span></span>`)}</div>
<div class="tbox"><table class="tbl">
<thead><tr><th>Where</th><th class="r">Sachets</th><th class="r">Months of use</th></tr></thead>
<tbody>${parts.map((p) => html`<tr><td><span class="row g8"><span class="sw-key ${p.cls}" aria-hidden="true"></span><span><span class="b">${p.label}</span> <span class="muted">${p.note}</span></span></span></td><td class="r">${formatRutf(p.qty)}</td><td class="r">${use ? (p.qty > 0 && p.qty / use < 0.05 ? 'under 0.1' : (p.qty / use).toFixed(1)) : 'n/a'}</td></tr>`)}
<tr><td class="b">Total</td><td class="r b">${formatRutf(total)}</td><td class="r b">${months === null ? 'n/a' : months.toFixed(1)}</td></tr></tbody>
</table></div>
</div>
<div class="two">
<div class="col g8">
<div class="row sp"><h3 class="h3">Central store against its 3-month target</h3>${statusChip(central, { size: 'sm' })}</div>
<div class="bar" style="position: relative; height: 14px"><span style="width: ${targetQty ? Math.min(100, (together / targetQty) * 100).toFixed(1) : 0}%; background: ${central.belowCentralTarget ? 'var(--low-fg)' : 'var(--ok-fg)'}"></span></div>
<div class="tbox"><table class="tbl"><tbody>
<tr><td>On hand</td><td class="r">${formatRutf(central.onHand || 0)}</td></tr>
<tr><td>On order</td><td class="r">${formatRutf(central.onOrder)}</td></tr>
<tr><td class="b">Together</td><td class="r b">${central.monthsInclPipeline === null ? 'n/a' : `${central.monthsInclPipeline.toFixed(1)} months`}</td></tr>
<tr><td>3-month target</td><td class="r">${targetQty === null ? 'n/a' : formatRutf(targetQty)}</td></tr>
${targetQty !== null && together < targetQty ? html`<tr><td>Short of the target</td><td class="r">${formatRutf(targetQty - together)}</td></tr>` : ''}
</tbody></table></div>
${pos.length ? pos.map((p) => html`<p style="margin: 0">${ic('truck', 'i', 'sm')} Supplier order: <span class="b">${formatRutf(p.qty)}</span> from ${p.supplier}, ordered ${formatShortDate(p.orderedOn)}, <span class="b">due ${formatShortDate(p.due)} ${p.due.slice(0, 4)}</span>.</p>`) : html`<p class="muted" style="margin: 0">No supplier order open.</p>`}
${linkBtn({ label: 'See the central store', icon: 'eye', href: '#/facility/central', style: 'align-self: flex-start' })}
</div>
<div class="col g8">
<h3 class="h3">Facilities that need RUTF</h3>
${groups.map((g) => html`<div class="card card-tight col g8">
<div class="row sp">${chip(g.code)}<span class="h3 num-t">${g.list.length} ${g.list.length === 1 ? 'facility' : 'facilities'}</span></div>
${g.list.length ? html`<details><summary class="link-btn" style="min-height: 44px; display: inline-flex; align-items: center; gap: 8px">${ic('chev', 'b', 'sm')}See which</summary><ul class="col g4" style="margin: 8px 0 0; padding-left: 20px">${g.list.map((x) => html`<li><a href="#/facility/${x.s.id}">${x.s.name}</a> · ${formatRutf(x.v.onHand)}${x.v.lastsUntil && x.v.days !== null ? `, lasts until ${formatShortDate(x.v.lastsUntil)} (${x.v.days} days)` : ''} · supervisor ${x.s.supervisor}</li>`)}</ul></details>` : html`<span class="muted">None today.</span>`}
</div>`)}
</div>
</div>
<p class="small muted" style="margin: 0">Only stock records and the ODK usage file; no prices were given, so no money values are shown.</p>
</section>`;
}

// ---------- overview ----------

const CARDS = [
  { id: 'stockouts', title: 'Stock-out days this month' },
  { id: 'ontime', title: 'Counts submitted on time' },
  { id: 'accuracy', title: 'Count accuracy' },
  { id: 'unexplained', title: 'Unexplained differences' },
  { id: 'emergency', title: 'Emergency orders' },
];

function kpiCard(id, inner) {
  const c = CARDS.find((x) => x.id === id);
  return html`<a class="kpi kpi-link" href="#/kpi/${id}" aria-label="${c.title}: see details"><span class="muted">${c.title}</span>${inner}<span class="kpi-more">See details ${ic('chev', 'b', 'sm')}</span></a>`;
}

function render(ctx) {
  const { db } = ctx;
  const d = today(db);
  const k = monthKpis(db);
  const asOf = `${formatShortDate(d)} ${formatTime(db.nowIso)}`;
  const below = centralBelowTarget(db).find((v) => v.item.isRutf);
  const acc = k.accuracy;
  const good = acc !== null && acc >= ACCURACY_GOAL;
  return html`<div class="app">
${header(ctx, { place: { name: 'Network overview' }, dataAsOf: asOf })}
<main class="wrap">
${flashBanner(ctx)}
<div class="row sp" style="align-items: flex-end">
<div class="col g4"><p class="muted" style="margin: 0">${MONTH_FULL[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)} · ${db.stores.length} stores</p><h1 class="h1">How the network is doing</h1></div>
<span class="tag">${ic('chart', 'i', 'sm')}This month, to ${formatShortDate(d)}</span>
</div>
${below ? html`<div class="banner bn-order">${chip('ORDER_NOW', 'Needs a decision')}<p class="grow" style="margin: 0">Central store RUTF is below its 3-month target: ${below.monthsInclPipeline.toFixed(1)} months, including ${formatRutf(below.onOrder)} on order.</p>${linkBtn({ label: 'See the central store', icon: 'eye', href: '#/facility/central' })}</div>` : ''}
<p class="muted" style="margin: 0">Each card opens the records behind its number, with the facility and its supervisor.</p>
<div class="kpis kpis-5">
${kpiCard('stockouts', html`<span class="kpi-v">${formatNumber(k.stockOutDays)}</span><span class="small muted">across ${k.facilities} facilities · ${k.stockOutDaysLastMonth} in Sept</span>`)}
${kpiCard('ontime', html`<span class="kpi-v">${pct(k.onTimeShare)}</span><span class="small muted">${formatNumber(k.countsOnTime)} of ${formatNumber(k.facilityDays)} facility days</span>`)}
${kpiCard('accuracy', html`<span class="kpi-v">${pct(acc, 1)}</span>
<div class="bar" style="position: relative"><span style="width: ${acc === null ? 0 : (acc * 100).toFixed(1)}%; background: ${good ? 'var(--ok-fg)' : 'var(--low-fg)'}"></span><i style="position: absolute; left: ${ACCURACY_GOAL * 100}%; top: -4px; width: 3px; height: 18px; background: #1B2A2F" aria-hidden="true"></i></div>
<span class="small row g4" style="color: ${good ? 'var(--ok-fg)' : 'var(--low-fg)'}">${ic(good ? 'ok' : 'low', 's', 'sm')}${good ? 'Above' : 'Below'} the 95% goal</span><span class="small muted">${formatNumber(k.accurate)} of ${formatNumber(k.otpCounts)} OTP counts matched</span>`)}
${kpiCard('unexplained', html`<span class="kpi-v">${formatNumber(k.unexplained)}</span><span class="small muted">count differences with no note or correction</span>`)}
${kpiCard('emergency', html`<span class="kpi-v">${pct(k.emergencyShare)}</span><span class="small muted">${k.emergency} of ${k.orders} orders this month</span>`)}
</div>
${rutfSection(ctx)}
${chart(ctx)}
<p class="small muted" style="margin: 0">${DEMO_LINE}</p>
</main>
</div>`;
}

// ---------- detail screens: the records behind each number ----------

function storeName(db, id) {
  const s = db.store(id);
  return s.type === 'CENTRAL' ? 'Central store, Gombe' : s.name;
}
function sup(db, id) {
  return db.store(id).supervisor || 'n/a, run by logistics';
}
function dateList(dates) {
  const shown = dates.slice(0, 6).map((x) => formatShortDate(x));
  return dates.length > 6 ? `${shown.join(', ')} and ${dates.length - 6} more` : shown.join(', ');
}

function detail(ctx, id) {
  const { db } = ctx;
  const d = today(db);
  const m = monthDetails(db);
  const k = m.kpis;
  const facLink = (sid) => html`<a href="#/facility/${sid}">${storeName(db, sid)}</a>`;
  const histLink = (sid, iid, label = 'Item history') => html`<a class="btn btn-ghost btn-sm" style="padding-left: 0; align-self: flex-start" href="#/history/${sid}/${iid}">${ic('history', 'b')}${label}</a>`;
  const card = (body) => html`<article class="card card-tight col g8">${body}</article>`;
  const who = (sid) => html`<span class="small muted">Supervisor: <span class="b">${sup(db, sid)}</span></span>`;
  switch (id) {
    case 'stockouts':
      return {
        title: 'Stock-out days this month',
        number: `${formatNumber(k.stockOutDays)} stock-out days`,
        how: 'A stock-out day is a day RUTF was counted at zero at an OTP, or a day an ITP marked "We ran out of this today". Longest and still out first.',
        sum: m.stockOuts.reduce((t, x) => t + x.days, 0),
        list: m.stockOuts.map((x) => card(html`<div class="row sp"><span class="b">${facLink(x.storeId)} · ${db.item(x.itemId).name}</span>${x.stillOut ? chip('OUT', 'Still out') : chip('OK', 'Back in stock')}</div>
${who(x.storeId)}
<span><span class="b">${x.days} ${x.days === 1 ? 'day' : 'days'}</span>: ${x.from === x.to ? formatShortDate(x.from) : `${formatShortDate(x.from)} to ${formatShortDate(x.to)}`}${x.demo ? html` <span class="tag">Demo value</span>` : ' (today, from the data)'}</span>
${histLink(x.storeId, x.itemId)}`)),
      };
    case 'ontime':
      return {
        title: 'Counts submitted on time',
        number: `${pct(k.onTimeShare)} (${formatNumber(k.countsOnTime)} of ${formatNumber(k.facilityDays)} facility days)`,
        how: `Facilities with days when no count (or ITP log) was submitted that day, most days first. ${formatNumber(k.facilityDays - k.countsOnTime)} facility days in all.`,
        sum: m.onTime.reduce((t, x) => t + x.days, 0),
        list: m.onTime.map((x) => card(html`<div class="row sp"><span class="b">${facLink(x.storeId)}</span><span class="b num-t">${x.days} ${x.days === 1 ? 'day' : 'days'} with no count</span></div>
${who(x.storeId)}
<span class="muted">${dateList(x.dates.filter((y) => y !== d))}${x.dates.some((y) => y !== d) ? html` <span class="tag">Demo value</span>` : ''}${x.missingToday ? html`${x.dates.length > 1 ? '; ' : ''}<span class="b">today: not in yet</span>` : ''}</span>
<span class="small muted">Last count: ${x.lastCount ? `${formatShortDate(dateOf(x.lastCount))} ${formatTime(x.lastCount)}` : 'none'}</span>`)),
      };
    case 'accuracy':
      return {
        title: 'Count accuracy',
        number: `${pct(k.accuracy, 1)} (${formatNumber(k.accurate)} of ${formatNumber(k.otpCounts)} OTP counts matched)`,
        how: 'A count matched when no item on it was flagged against the expected stock. OTPs from the lowest match rate up; the goal is 95%.',
        sum: m.accuracy.reduce((t, x) => t + x.made, 0),
        list: m.accuracy.map((x) => card(html`<div class="row sp"><span class="b">${facLink(x.storeId)}</span><span class="b num-t">${x.matched} of ${x.made} matched (${pct(x.rate, 1)})</span></div>
${who(x.storeId)}
<div class="bar" style="position: relative"><span style="width: ${(x.rate * 100).toFixed(1)}%; background: ${x.rate >= ACCURACY_GOAL ? 'var(--ok-fg)' : 'var(--low-fg)'}"></span><i style="position: absolute; left: ${ACCURACY_GOAL * 100}%; top: -4px; width: 3px; height: 18px; background: #1B2A2F" aria-hidden="true"></i></div>
${x.unmatchedDates.length ? html`<span class="small muted">Did not match: ${dateList(x.unmatchedDates.map((y) => y))}</span>` : html`<span class="small muted">Every count matched.</span>`}`)),
      };
    case 'unexplained':
      return {
        title: 'Unexplained differences',
        number: `${formatNumber(k.unexplained)} count ${k.unexplained === 1 ? 'difference' : 'differences'} with no note and no correction`,
        how: 'Each count difference this month that nobody has explained yet, largest difference first. Ask the supervisor to follow up.',
        sum: m.unexplained.length,
        list: m.unexplained.map((x) => {
          const it = db.item(x.itemId);
          const diff = x.counted - x.expected;
          return card(html`<div class="row sp"><span class="b">${facLink(x.storeId)} · ${it.name}</span>${chip('CHECK')}</div>
${who(x.storeId)}
<span><span class="b">${formatShortDate(x.date)}</span>: counted <span class="b">${formatNumber(x.counted)}</span>, expected <span class="b">${formatNumber(x.expected)}</span> ${it.unit.many} (${diff > 0 ? '+' : ''}${formatNumber(diff)})${x.demo ? html` <span class="tag">Demo value</span>` : x.date < d ? ' (from the seed data)' : ' (today)'}</span>
${histLink(x.storeId, x.itemId)}`);
        }),
      };
    case 'emergency':
    default:
      return {
        title: 'Emergency orders',
        number: `${pct(k.emergencyShare)} (${k.emergency} of ${k.orders} orders this month)`,
        how: 'Every emergency shipment requested this month, from the shipment records. Not sent yet first.',
        sum: m.emergency.length,
        list: m.emergency.map((sh) => {
          const STATE = { requested: 'Requested, waiting for approval', approved: 'Approved, not sent yet', sent: 'Sent, on the way', received: 'Received' };
          const pill = sh.state === 'received' ? chip('OK', 'Received') : sh.state === 'sent' ? chip('TRANSIT') : chip('WAIT', sh.state === 'requested' ? 'Waiting for approval' : 'Approved');
          return card(html`<div class="row sp"><span class="b">Shipment ${sh.number} · ${facLink(sh.toStoreId)}</span>${pill}</div>
${who(sh.toStoreId)}
<span>${sh.lines.map((l) => db.item(l.itemId).name).join(', ')}</span>
<span class="small muted">Requested ${formatShortDate(dateOf(sh.steps.requested.at))} ${formatTime(sh.steps.requested.at)} by ${sh.steps.requested.byName} · ${STATE[sh.state]}</span>`);
        }),
      };
  }
}

function renderDetail(ctx, route) {
  const { db } = ctx;
  const d = today(db);
  const id = CARDS.some((c) => c.id === route.parts[0]) ? route.parts[0] : 'stockouts';
  const x = detail(ctx, id);
  return html`<div class="app">
${header(ctx, { place: { name: 'Network overview' }, dataAsOf: `${formatShortDate(d)} ${formatTime(db.nowIso)}` })}
<main class="wrap" style="max-width: 1040px">
${flashBanner(ctx)}
<div class="col g8">
<p class="muted" style="margin: 0">${MONTH_FULL[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)} · view only</p>
<h1 class="h1">${x.title}</h1>
<p class="lead"><span class="b">${x.number}</span></p>
<p class="muted" style="margin: 0">${x.how}</p>
</div>
<nav class="tabs" aria-label="Indicators">${CARDS.map((c) => html`<a class="tab${c.id === id ? ' tab-on' : ''}" href="#/kpi/${c.id}"${c.id === id ? raw(' aria-current="page"') : ''} style="display: inline-flex; align-items: center; text-decoration: none">${c.title}</a>`)}</nav>
${x.list.length ? html`<div class="col g8">${x.list}</div>` : html`<div class="banner bn-ok">${chip('OK', 'None')}<p class="grow" style="margin: 0">Nothing to show this month.</p></div>`}
<p class="small muted" style="margin: 0">${DEMO_LINE}</p>
</main>
</div>`;
}

export const views = { management: { render, roles: ['management'] }, kpi: { render: renderDetail, roles: ['management'] } };
