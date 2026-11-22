// Screen 8: management overview (read only). Indicators, network RUTF with months of stock, and RUTF use
// by month (real ODK data).

import { html, raw } from '../dom.js';
import { ic, chip, header, linkBtn, flashBanner } from '../parts.js';
import { formatShortDate, formatTime, MONTH_NAMES } from '../../time.js';
import { formatNumber, formatRutf } from '../../format.js';
import { today, centralBelowTarget, currentMonth } from '../../stock.js';
import { monthKpis, rutfByMonth, ACCURACY_GOAL } from '../../kpis.js';

const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const LEAN = new Set(['06', '07', '08', '09']); // design: "Lean season (Jun to Sep)"

function pct(x, digits = 0) {
  return x === null ? 'n/a' : `${(x * 100).toFixed(digits)}%`;
}

function chart(ctx) {
  const { db } = ctx;
  const data = rutfByMonth(db);
  const max = Math.max(...data.map((x) => x.qty));
  const cur = currentMonth(db);
  const peak = data.reduce((a, b) => (b.qty > a.qty ? b : a), data[0]);
  const first = data[0];
  return html`<section class="card col g16" aria-labelledby="ch">
<div class="row sp"><h2 class="h3" id="ch">RUTF used per month, thousands of sachets, all ${Object.keys(db.odk.usage).length} OTPs, ${cur.slice(0, 4)}</h2><span class="row g16 small"><span class="row g8"><span style="width: 14px; height: 14px; background: #FFF6E3; border: 1px solid #F0C47A; border-radius: 3px; display: inline-block"></span>Lean season (Jun to Sep)</span><span class="row g8"><span style="width: 14px; height: 14px; border: 2px dashed #5E6A6E; border-radius: 3px; display: inline-block"></span>${MONTH_FULL[Number(cur.slice(5, 7)) - 1]} is partial: data runs to about 19 Oct</span></span></div>
<div role="img" aria-label="${data.map((x) => `${MONTH_NAMES[Number(x.month.slice(5, 7)) - 1]} ${formatNumber(Math.round(x.qty))} sachets`).join(', ')}">
<div class="row" style="flex-wrap: nowrap; align-items: flex-end; gap: 6px; height: 280px; border-bottom: 2px solid #1B2A2F">
${data.map((x) => {
    const m = x.month.slice(5, 7);
    const lean = LEAN.has(m);
    const partial = x.month === cur;
    const h = Math.round((x.qty / max) * 240);
    const bar = partial
      ? `display: block; width: 70%; max-width: 56px; height: ${h}px; box-sizing: border-box; background: #FFFFFF; border: 2px dashed #5E6A6E; border-bottom: 0; border-radius: 6px 6px 0 0`
      : `display: block; width: 70%; max-width: 56px; height: ${h}px; background: ${lean ? '#292D3D' : '#8FA3B8'}; border-radius: 6px 6px 0 0`;
    return html`<div class="col g4" style="flex: 1 1 0; align-items: center; justify-content: flex-end; min-width: 0${lean ? raw('; background: #FFF6E3; border-radius: 8px 8px 0 0') : ''}"><span class="small b num-t">${Math.round(x.qty / 1000)}k</span><span style="${raw(bar)}"></span></div>`;
  })}
</div>
<div class="row" style="flex-wrap: nowrap; gap: 6px; padding-top: 6px">${data.map((x) => html`<span class="small muted" style="flex: 1 1 0; min-width: 0; overflow-wrap: anywhere; text-align: center">${MONTH_NAMES[Number(x.month.slice(5, 7)) - 1]}${x.month === cur ? ' (partial)' : ''}</span>`)}</div>
</div>
<p class="muted" style="margin: 0">Peak in ${MONTH_FULL[Number(peak.month.slice(5, 7)) - 1]}: ${formatRutf(Math.round(peak.qty))}, ${peak.qty / first.qty >= 4 ? `more than ${Math.floor(peak.qty / first.qty)} times` : `${(peak.qty / first.qty).toFixed(1)} times`} ${MONTH_FULL[Number(first.month.slice(5, 7)) - 1]} (${formatRutf(Math.round(first.qty)).replace(' (', ', ').replace(/\)$/, '')})</p>
</section>`;
}

function render(ctx) {
  const { db } = ctx;
  const d = today(db);
  const k = monthKpis(db);
  const asOf = `${formatShortDate(d)} ${formatTime(db.nowIso)}`;
  const below = centralBelowTarget(db).find((v) => v.item.isRutf);
  const r = k.rutf;
  const monthsAll = r.monthlyUse ? (r.held + r.inTransit + r.onOrder) / r.monthlyUse : null;
  const acc = k.accuracy;
  return html`<div class="app">
${header(ctx, { place: { name: 'Network overview' }, dataAsOf: asOf })}
<main class="wrap">
${flashBanner(ctx)}
<div class="row sp" style="align-items: flex-end">
<div class="col g4"><p class="muted" style="margin: 0">${MONTH_FULL[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)} · ${db.stores.length} stores</p><h1 class="h1">How the network is doing</h1></div>
<span class="tag">${ic('chart', 'i', 'sm')}This month, to ${formatShortDate(d)}</span>
</div>
${below ? html`<div class="banner bn-order">${chip('ORDER_NOW', 'Needs a decision')}<p class="grow" style="margin: 0">Central store RUTF is below its 3-month target: ${below.monthsInclPipeline.toFixed(1)} months, including ${formatRutf(below.onOrder)} on order.</p>${linkBtn({ label: 'See the central store', icon: 'eye', href: '#/facility/central' })}</div>` : ''}
<div class="kpis">
<div class="kpi"><span class="muted">Stock-out days this month</span><span class="kpi-v">${formatNumber(k.stockOutDays)}</span><span class="small muted">across ${k.facilities} facilities · ${k.stockOutDaysLastMonth} in Sept</span></div>
<div class="kpi"><span class="muted">Counts submitted on time</span><span class="kpi-v">${pct(k.onTimeShare)}</span><span class="small muted">${formatNumber(k.countsOnTime)} of ${formatNumber(k.facilityDays)} facility days</span></div>
<div class="kpi"><span class="muted">Count accuracy</span><span class="kpi-v">${pct(acc, 1)}</span>
<div class="bar" style="position: relative"><span style="width: ${acc === null ? 0 : (acc * 100).toFixed(1)}%; background: ${acc !== null && acc >= ACCURACY_GOAL ? 'var(--ok-fg)' : 'var(--low-fg)'}"></span><i style="position: absolute; left: ${ACCURACY_GOAL * 100}%; top: -4px; width: 3px; height: 18px; background: #1B2A2F" aria-hidden="true"></i></div>
<span class="small row g4" style="color: ${acc !== null && acc >= ACCURACY_GOAL ? 'var(--ok-fg)' : 'var(--low-fg)'}">${ic(acc !== null && acc >= ACCURACY_GOAL ? 'ok' : 'low', 's', 'sm')}${acc !== null && acc >= ACCURACY_GOAL ? 'Above' : 'Below'} the 95% goal</span><span class="small muted">${formatNumber(k.accurate)} of ${formatNumber(k.otpCounts)} OTP counts matched</span></div>
<div class="kpi"><span class="muted">Unexplained differences</span><span class="kpi-v">${formatNumber(k.unexplained)}</span><span class="small muted">count differences with no note or correction</span></div>
<div class="kpi"><span class="muted">Emergency orders</span><span class="kpi-v">${pct(k.emergencyShare)}</span><span class="small muted">${k.emergency} of ${k.orders} orders this month</span></div>
<div class="kpi"><span class="muted">RUTF across the network</span><span class="kpi-v">${monthsAll === null ? 'n/a' : monthsAll.toFixed(1)} <span style="font-size: 18px">months</span></span><span class="small muted">${formatRutf(r.held)} on hand + ${formatRutf(r.inTransit)} in transit + ${formatRutf(r.onOrder)} on order, at ${formatRutf(Math.round(r.monthlyUse))} used a month</span></div>
</div>
${chart(ctx)}
<p class="small muted" style="margin: 0">Stock-out days, counts on time, count accuracy, unexplained differences and emergency orders for 1 to 29 October are demo values; today's part is worked out from today's entries. RUTF use and months of stock come from the real ODK usage file.</p>
</main>
</div>`;
}

export const views = { management: { render, roles: ['management'] } };
