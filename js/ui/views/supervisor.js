// Screen 6: supervisor home (escalations, corrections waiting for approval, their facilities).

import { html, joinAnd } from '../dom.js';
import { ic, chip, btn, linkBtn, header, longDate, when, personRef, qtyText, flashBanner } from '../parts.js';
import { summaryChips, noteDialog, lastsPlain } from './facility.js';
import { formatShortDate, formatTime, dateOf, daysBetween } from '../../time.js';
import { formatNumber, formatRutf } from '../../format.js';
import { today, escalation, storeItems, stockView, rutfAlertLevel, evaluateCount, STATUS } from '../../stock.js';
import { pendingApprovals, decideCorrection, addNote } from '../../actions.js';
import { CORRECTION_REASONS } from '../../config.js';

function greeting(nowIso) {
  const h = Number(nowIso.slice(11, 13));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function escalationBanner(ctx, storeId, esc) {
  const { db, user } = ctx;
  const store = db.store(storeId);
  const byItem = new Map();
  for (const f of esc.run) {
    if (!byItem.has(f.entry.itemId)) byItem.set(f.entry.itemId, []);
    byItem.get(f.entry.itemId).push(f);
  }
  const lines = [...byItem.entries()].map(([itemId, fl]) => {
    const it = db.item(itemId);
    const last = fl.at(-1).eval;
    return html`<span><span class="b">${it.name}</span>: <span class="b">${fl.length}</span> ${fl.length === 1 ? 'difference' : 'differences'} in ${daysBetween(fl[0].date, fl.at(-1).date) + 1} ${daysBetween(fl[0].date, fl.at(-1).date) === 0 ? 'day' : 'days'} (latest: counted <span class="b">${formatNumber(last.counted)}</span>, expected <span class="b">${formatNumber(last.expected)}</span>).</span>`;
  });
  const told = esc.run.filter((f) => f.date < esc.supervisorSince).map((f) => html`<span class="b">${formatShortDate(f.date)}</span>`);
  return html`<div class="banner bn-order" style="align-items: flex-start">
${chip('ORDER_NOW', 'Repeated differences')}
<div class="grow col g4">
<span style="font-size: 18px">Repeated differences at ${store.label}, sent to ${personRef(store.supervisor, user)} on <span class="b">${formatShortDate(esc.supervisorSince)}</span></span>
${lines}
<span class="small muted">${told.length ? html`The facility was told on ${joinAnd(told)}. ` : ''}If this is still happening on <span class="b">${formatShortDate(esc.managementDate)}</span> (30 days after the first flag), it goes to management.</span>
<a href="#/history/${storeId}/${[...byItem.keys()][0]}" class="small">See the full item history</a>
</div>
<div class="row g8">${btn({ label: 'Ask logistics to recount', icon: 'recount', kind: 'primary', act: 'ask-recount', data: { store: storeId } })}${btn({ label: 'Add a note', icon: 'note', act: 'note-open', data: { target: `esc|${storeId}`, label: store.name } })}</div>
</div>`;
}

function approvalBanner(ctx, e) {
  const { db, user } = ctx;
  const it = db.item(e.itemId);
  const store = db.store(e.storeId);
  const reason = CORRECTION_REASONS.find((r) => r.id === e.reason)?.label || e.reason;
  const level = rutfAlertLevel(db, e.storeId, e.itemId);
  return html`<div class="banner bn-wait" style="align-items: flex-start">
${chip('WAIT')}
<div class="grow col g4">
<span style="font-size: 18px">${store.name} · <span class="b">${it.name}</span> correction of <span class="b">${qtyText(it, e.qty)}</span></span>
<span>Reason: ${reason}.${e.reasonText ? ` "${e.reasonText}"` : ''}</span>
<span class="small muted">Entered by ${personRef(e.stamp.byName, user)}, <span class="b">${formatShortDate(dateOf(e.ts))}</span> ${formatTime(e.ts)}. Above the alert level of ${formatRutf(Math.round(level))}, so a second person must confirm.</span>
<a href="#/history/${e.storeId}/${e.itemId}" class="small">See the full item history</a>
</div>
<div class="row g8">${btn({ label: 'Approve', icon: 'tick', kind: 'primary', act: 'approve', data: { id: e.id } })}${btn({ label: 'Do not approve', icon: 'x', act: 'reject', data: { id: e.id } })}</div>
</div>`;
}

function facilityCard(ctx, storeId) {
  const { db } = ctx;
  const d = today(db);
  const store = db.store(storeId);
  const views = storeItems(db, storeId);
  const counted = views.filter((v) => v.countedToday);
  const lastAt = counted.length ? counted.map((v) => v.countedAt).sort().at(-1) : views.map((v) => v.lastCount).filter(Boolean).map((c) => c.submittedAt || c.ts).sort().at(-1);
  const stampText = counted.length ? `${store.type === 'ITP' ? 'Logged' : 'Counted'} today ${formatTime(lastAt)}` : lastAt ? `Last count ${formatShortDate(dateOf(lastAt))} ${formatTime(lastAt)}` : 'No count yet';
  let pills;
  let detail;
  let button;
  if (!counted.length) {
    pills = [chip('NOT_COUNTED', null, 'sm')];
    detail = "Yesterday's numbers are hidden until today's count is in.";
    button = btn({ label: 'Send a reminder', icon: 'bell', size: 'sm', act: 'remind', data: { stores: storeId, what: "today's count" } });
  } else {
    const all = summaryChips(db, storeId, 'sm');
    const nonOk = all.filter((c) => !String(c).includes('chip-ok') && !String(c).includes('chip-check'));
    pills = nonOk.length ? nonOk : [chip('OK', 'All OK', 'sm')];
    const monthFlags = escalation(db, storeId).flags.filter((f) => f.date.slice(0, 7) === d.slice(0, 7)).length;
    const key = views.find((v) => v.item.isRutf) || views.find((v) => v.item.type === 'therapeutic_food');
    const keyText = key && key.status !== STATUS.NOT_COUNTED ? `${key.item.name} lasts until ${lastsPlain(key)}` : null;
    detail = [keyText, monthFlags ? `${monthFlags} ${monthFlags === 1 ? 'difference' : 'differences'} this month` : 'No differences this month'].filter(Boolean).join(' · ');
    button = linkBtn({ label: 'Open facility', icon: 'eye', size: 'sm', href: `#/facility/${storeId}` });
  }
  return html`<article class="item fac-card">
<div class="row sp"><h3 class="item-name">${store.name}</h3><span class="small muted">${stampText}</span></div>
<div class="row g8">${pills}</div>
<span class="muted">${detail}</span>
${button}
</article>`;
}

function render(ctx) {
  const { db, user } = ctx;
  const d = today(db);
  const esc = user.storeIds.map((id) => ({ id, esc: escalation(db, id) })).filter((x) => x.esc.level === 'supervisor' || x.esc.level === 'management');
  const approvals = pendingApprovals(db, user);
  return html`<div class="app">
${header(ctx, { place: { name: 'Your facilities' } })}
<main class="wrap">
${flashBanner(ctx)}
<div class="col g8">
<p class="muted" style="margin: 0">${longDate(d)}</p>
<h1 class="h1">${greeting(db.nowIso)}, ${user.name.split(' ')[0]}</h1>
</div>
<section class="col g8 needs" aria-labelledby="es">
<h2 class="sec-t" id="es">Escalated to you (${esc.length})</h2>
${esc.length ? esc.map((x) => escalationBanner(ctx, x.id, x.esc)) : html`<p class="muted" style="margin: 0">Nothing has been escalated to you. Repeated count differences (3 in 14 days) show here.</p>`}
</section>
<section class="col g8 needs" aria-labelledby="wa">
<h2 class="sec-t" id="wa">Waiting for your approval (${approvals.length})</h2>
${approvals.length ? approvals.map((e) => approvalBanner(ctx, e)) : html`<p class="muted" style="margin: 0">No corrections are waiting for you.</p>`}
</section>
<section class="col g8" aria-labelledby="fa">
<h2 class="sec-t" id="fa">Your facilities (${user.storeIds.length})</h2>
<div class="items">${user.storeIds.map((id) => facilityCard(ctx, id))}</div>
</section>
</main>
</div>`;
}

export const views = { supervisor: { render, roles: ['supervisor'] } };

export const actions = {
  approve: (ctx, el) => {
    const e = ctx.db.ledger.get(el.dataset.id);
    decideCorrection(ctx.db, ctx.user, e.id, 'approved');
    ctx.changed();
    ctx.flash(`Correction approved. ${ctx.db.item(e.itemId).name} at ${ctx.db.store(e.storeId).name} is now ${qtyText(ctx.db.item(e.itemId), stockView(ctx.db, e.storeId, e.itemId).onHand)}.`);
    ctx.rerender();
  },
  reject: (ctx, el) => {
    const e = ctx.db.ledger.get(el.dataset.id);
    decideCorrection(ctx.db, ctx.user, e.id, 'rejected');
    ctx.changed();
    ctx.flash(`Correction not approved. The stock stays at ${qtyText(ctx.db.item(e.itemId), stockView(ctx.db, e.storeId, e.itemId).onHand)}, and ${e.stamp.byName} can see your decision in the item history.`);
    ctx.rerender();
  },
  'ask-recount': (ctx, el) => {
    addNote(ctx.db, ctx.user, `recount|${el.dataset.store}`, `Recount requested by ${ctx.user.name}`);
    ctx.changed();
    ctx.flash(`Logistics has been asked to recount at ${ctx.db.store(el.dataset.store).name}. The request is saved with your name and the time.`);
    ctx.rerender();
  },
};
