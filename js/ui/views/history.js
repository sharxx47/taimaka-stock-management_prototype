// Screen 9: item history (audit trail, newest first, balance after each line) and "Correct this entry".

import { html, raw, joinAnd } from '../dom.js';
import { ic, chip, statusChip, pic, btn, header, qtyBig, qtyText, flashBanner, when, personRef, cartonsSplit } from '../parts.js';
import { navFor, lastsPlain } from './facility.js';
import { formatShortDate, formatTime, dateOf } from '../../time.js';
import { formatNumber, formatRutf, rutfReadBack, formatMonths } from '../../format.js';
import { stockView, today, rutfAlertLevel, evaluateCount, STATUS, expiryFlags, escalation } from '../../stock.js';
import { correctEntry, ActionError } from '../../actions.js';
import { CORRECTION_REASONS, SACHETS_PER_CARTON } from '../../config.js';

const PAGE = 8;

function canCorrect(db, user, e, latestCountId) {
  if (user.kind !== 'logistics' && !(user.kind === 'facility' && user.storeId === e.storeId)) return false;
  // Only the latest count can be corrected: an older count is no longer the base of today's stock.
  if (e.kind === 'count') return e.id === latestCountId;
  return e.kind === 'received';
}

function reasonLabel(id) {
  return CORRECTION_REASONS.find((r) => r.id === id)?.label || id;
}

function sessionOf(db, e) {
  return e.sessionId ? db.countSessions.get(e.sessionId) : null;
}

function line(ctx, row, latestCountId) {
  const { db, user } = ctx;
  const d = today(db);
  const e = row.entry;
  const it = db.item(e.itemId);
  const q = (n) => qtyText(it, n);
  const by = e.stamp ? `By ${e.stamp.byName}, ${formatShortDate(dateOf(e.ts))} ${formatTime(e.ts)}` : '';
  const notes = db.notes.filter((n) => n.targetId === e.id);
  let title;
  const extra = [];
  let small = by;
  let icStyle = '';
  let balance = html`<span class="b num-t">${row.balance === null ? '' : q(row.balance)}</span>`;
  switch (e.kind) {
    case 'opening':
      title = `Opening balance: ${q(e.qty)}`;
      small = `${e.note || 'Opening balance'} · ${formatShortDate(dateOf(e.ts))} ${formatTime(e.ts)}`;
      break;
    case 'used':
      title = `Daily use: -${q(e.qty)}`;
      small = e.source === 'odk' ? `From ODK usage upload by ${e.stamp.byName}, ${formatShortDate(dateOf(e.ts))} ${formatTime(e.ts)}` : by;
      break;
    case 'received': {
      const sh = e.shipmentId ? db.shipments.get(e.shipmentId) : null;
      const from = sh ? (db.store(sh.fromStoreId).type === 'CENTRAL' ? 'Central store' : db.store(sh.fromStoreId).name) : e.supplier ? `supplier (${e.supplier})` : 'supplier';
      title = `${sh ? 'Shipment' : 'Stock'} received from ${from}: +${q(e.qty)}`;
      const bt = (e.batches || []).map((b) => `batch ${b.batch}${b.expiry ? `, expires ${formatShortDate(b.expiry)} ${b.expiry.slice(0, 4)}` : ''}`).join('; ');
      const recvLine = sh ? sh.lines.find((l) => l.itemId === e.itemId) : null;
      extra.push(html`<span class="muted">${sh ? `Shipment ${sh.number} · ` : ''}${bt}${it.isRutf && e.qty >= SACHETS_PER_CARTON && cartonsSplit(e.qty).loose === 0 ? ` · ${cartonsSplit(e.qty).sealed} sealed cartons` : ''}${recvLine && recvLine.reason ? ` · ${recvLine.reason}` : ''}</span>`);
      small = sh && sh.steps.sent ? `Sent by ${sh.steps.sent.byName} ${formatShortDate(dateOf(sh.steps.sent.at))} · received by ${e.stamp.byName}, ${formatShortDate(dateOf(e.ts))} ${formatTime(e.ts)}` : by;
      break;
    }
    case 'sent': {
      const sh = db.shipments.get(e.shipmentId);
      title = `Sent in shipment ${sh ? sh.number : ''} to ${sh ? db.store(sh.toStoreId).name : 'a facility'}: -${q(e.qty)}`;
      break;
    }
    case 'stockout_day':
      title = 'Stock-out day recorded';
      icStyle = 'background: var(--out-bg)';
      break;
    case 'count': {
      const ev = evaluateCount(db, e);
      const sess = sessionOf(db, e);
      if (e.stockCheck) {
        // The central store has no daily count: logistics checks its stock.
        title = `Stock check by logistics: ${q(e.qty)}`;
        small = `${by} · ${ev && ev.diff ? `difference ${q(ev.diff)}` : 'matches expected'}`;
      } else if (e.recount) {
        title = `Recount by logistics: ${q(e.qty)}, expected ${q(e.expected)}`;
        icStyle = 'background: var(--primary)';
        if (ev && ev.applicable && ev.diff) extra.push(html`<span class="muted">Difference ${q(ev.diff)}.${e.reason ? ` Reason: ${reasonLabel(e.reason)}.` : ''}</span>`);
        small = `${by} · ${ev && ev.flagged && ev.alertLogistics ? 'at or above the alert level' : 'below the alert level, no approval needed'}`;
      } else if (e.itpLog) {
        const used = e.expected !== null && e.expected !== undefined ? Math.round((e.expected - e.qty) * 100) / 100 : null;
        title = `Daily log: ${q(e.qty)} on the shelf${used !== null ? `, used ${q(used)}` : ''}${e.receivedToday ? ` (received ${formatNumber(e.receivedToday)})` : ''}`;
      } else {
        title = it.isRutf && (e.sealed !== undefined && e.sealed !== null && e.sealed !== '')
          ? `Daily count: ${rutfReadBack(Number(e.sealed || 0), Number(e.loose || 0)).text}`
          : it.isRutf ? `Daily count: ${(() => { const c = cartonsSplit(e.qty); return `${c.sealed} sealed cartons + ${formatNumber(c.loose)} loose = ${formatNumber(e.qty)}`; })()}` : `Daily count: ${q(e.qty)}`;
        const parts = [by];
        if (ev && ev.applicable) parts.push(ev.flagged ? `Check: expected ${q(e.expected)} (difference ${q(Math.round((e.qty - e.expected) * 1e6) / 1e6)})${ev.corrected ? ', corrected afterwards' : ''}` : 'matches expected');
        if (sess && sess.storeCheck) parts.push('store cool, dry and locked');
        small = parts.join(' · ');
      }
      break;
    }
    case 'adjustment': {
      const orig = e.correctsId ? db.ledger.get(e.correctsId) : null;
      const pending = e.needsApproval && !row.approval;
      icStyle = pending ? 'background: var(--est-bg)' : '';
      if (e.reason === 'count_correction' && orig && orig.kind === 'count') {
        title = `Correction of the ${formatShortDate(dateOf(orig.ts))} count`;
        extra.push(html`<span><span class="strike">Original: ${q(orig.qty)}</span> → corrected to ${q(orig.qty + e.qty)}${e.reasonText ? ` (${e.reasonText.toLowerCase()})` : ''}</span>`);
        small = `Original by ${orig.stamp.byName}, ${formatShortDate(dateOf(orig.ts))} ${formatTime(orig.ts)} · corrected by ${e.stamp.byName}, ${formatShortDate(dateOf(e.ts))} ${formatTime(e.ts)}`;
      } else {
        title = `Correction: ${e.qty > 0 ? '+' : ''}${q(e.qty)} · ${reasonLabel(e.reason)}`;
        if (e.reasonText) extra.push(html`<span class="muted">"${e.reasonText}"</span>`);
      }
      if (pending) {
        const after = row.balance === null ? null : row.balance + e.qty;
        balance = html`<span class="col g4" style="align-items: flex-end"><span class="b num-t">${q(row.balance)}</span>${after !== null ? html`<span class="small muted">${q(after)} once approved</span>` : ''}</span>`;
        extra.push(html`<span class="chip chip-wait chip-sm" style="align-self: flex-start">${ic('wait', 's', 'sm')}Waiting for approval by a second person: ${db.store(e.storeId).supervisor}</span>`);
      } else if (row.approval) {
        extra.push(row.approval.decision === 'approved'
          ? html`<span class="chip chip-ok chip-sm" style="align-self: flex-start">${ic('ok', 's', 'sm')}Approved by ${row.approval.stamp.byName}, ${when(row.approval.stamp.at, d)}</span>`
          : html`<span class="chip chip-nc chip-sm" style="align-self: flex-start">${ic('x', 'i', 'sm')}Not approved by ${row.approval.stamp.byName}, ${when(row.approval.stamp.at, d)}: not applied</span>`);
      }
      break;
    }
    default:
      title = e.kind;
  }
  return html`<li class="tl">
<span class="tl-ic"${icStyle ? raw(` style="${icStyle}"`) : ''}>${ic(e.kind === 'received' ? 'receive' : e.kind === 'used' ? 'chart' : e.kind === 'adjustment' ? 'edit' : e.kind === 'sent' ? 'truck' : e.kind === 'stockout_day' ? 'x' : 'count', icStyle.includes('primary') || icStyle.includes('out-bg') ? 'w' : 'i')}</span>
<div class="grow col g4">
<div class="row sp"><span class="b">${title}</span>${balance}</div>
${extra}
${notes.map((n) => html`<span class="small">Note by ${n.stamp.byName}, ${when(n.stamp.at, d)}: "${n.text}"</span>`)}
<span class="small muted">${small}</span>
${canCorrect(db, user, e, latestCountId) ? btn({ label: 'Correct this entry', icon: 'edit', kind: 'ghost', size: 'sm', act: 'correct-open', data: { id: e.id }, style: 'align-self: flex-start; padding-left: 0' }) : ''}
</div>
</li>`;
}

function picker(ctx, storeId, itemId) {
  const { db, user } = ctx;
  // Only the stores this role can see: one for facility staff, their facilities for a supervisor.
  const stores = user.kind === 'facility' ? [db.store(user.storeId)] : user.kind === 'supervisor' ? user.storeIds.map((id) => db.store(id)) : db.stores;
  return html`<div class="inline-form">
<label class="field"><span class="label">Store</span><select class="select" id="h-store" data-change="h-store">${stores.map((s) => html`<option value="${s.id}"${s.id === storeId ? ' selected' : ''}>${s.type === 'CENTRAL' ? 'Central store, Gombe' : s.name}</option>`)}</select></label>
<label class="field"><span class="label">Item</span><select class="select" id="h-item" data-change="h-item">${db.itemsForStore(storeId).map((it) => html`<option value="${it.id}"${it.id === itemId ? ' selected' : ''}>${it.name}</option>`)}</select></label>
</div>`;
}

function render(ctx, route) {
  const { db, user, vs } = ctx;
  let [storeId, itemId] = route.parts;
  if (!storeId) storeId = user.storeId || (user.kind === 'supervisor' ? user.storeIds[0] : 'jigawan_iro');
  const store = db.store(storeId);
  if (user.kind === 'facility' && user.storeId !== storeId) throw new ActionError('You can only see your own facility.');
  if (user.kind === 'supervisor' && !user.storeIds.includes(storeId)) throw new ActionError('You can only see your own facilities.');
  if (!itemId || !db.holds(storeId, itemId)) itemId = db.itemsForStore(storeId).find((i) => i.isRutf)?.id || db.itemsForStore(storeId)[0].id;
  const it = db.item(itemId);
  const v = stockView(db, storeId, itemId);
  const rows = db.ledger.history(storeId, itemId).filter((r) => r.entry.tsMs <= Date.parse(db.nowIso)).reverse();
  const latestCount = rows.find((r) => r.entry.kind === 'count');
  const n = vs.pages && vs.key === `${storeId}|${itemId}` ? vs.pages : 1;
  const shown = rows.slice(0, PAGE * n);
  const facilityUser = user.kind === 'facility';
  const nc = v.status === STATUS.NOT_COUNTED;
  return html`<div class="app">
${header(ctx, { place: { name: store.type === 'CENTRAL' ? 'Central store, Gombe' : store.name, type: store.siteType }, nav: navFor(ctx), sync: user.kind !== 'management', dataAsOf: user.kind === 'management' ? `${formatShortDate(today(db))} ${formatTime(db.nowIso)}` : null })}
<main class="wrap">
${flashBanner(ctx)}
${picker(ctx, storeId, itemId)}
<div class="row g16">
${pic(it, 'lg')}
<div class="col g4 grow">
<span class="muted">Item history</span>
<h1 class="h1">${it.name} at ${store.type === 'CENTRAL' ? 'the central store' : store.name}</h1>
<span class="row g8">${nc ? html`<span class="qty" style="font-size: 22px">Not counted today</span>` : html`<span class="qty">${it.isRutf ? html`${formatNumber(v.onHand)} <small>sachets now${v.onHand >= SACHETS_PER_CARTON ? formatRutf(v.onHand).slice(formatRutf(v.onHand).indexOf(' (')) : ''}</small>` : html`${formatNumber(v.onHand ?? 0)} <small>${it.unit.multiply ? `x ${it.unit.one}` : it.unit.many} now</small>`}</span>`}${statusChip(v, { logistics: user.kind === 'logistics' })}${v.tracked && !nc ? html`<span class="muted">${v.onHand > 0 ? `Lasts until ${lastsPlain(v)}` : 'None left'}${facilityUser || !Number.isFinite(v.months) || v.months === null ? '' : ` · ${formatMonths(v.months)}${v.isCentral ? ' including stock on order' : ''}`}</span>` : ''}</span>
${v.isCentral && v.target ? html`<span class="small muted">Target ${qtyText(it, v.target.qty)} (3 months of network use)${v.onOrder ? ` · ${qtyText(it, v.onOrder)} on order` : ''}</span>` : ''}
${v.onHand > 0 ? expiryFlags(db, storeId, itemId).map((b) => html`<div class="banner bn-exp">${chip('EXPIRY')}<p class="grow" style="margin: 0">Batch ${b.batch} ${b.expired ? 'has expired' : 'expires'} <span class="b">${formatShortDate(b.expiry)}</span>. About <span class="b">${qtyText(it, b.unusedAtExpiry)}</span> will not be used by then.</p></div>`) : ''}
${(() => { const esc = escalation(db, storeId); const fl = (esc.run || []).filter((x) => x.entry.itemId === itemId); return (esc.level === 'supervisor' || esc.level === 'management') && fl.length ? html`<div class="banner bn-order">${chip('ORDER_NOW', 'Escalation')}<p class="grow" style="margin: 0"><span class="b">${fl.length}</span> count differences for ${it.name}: ${joinAnd(fl.map((x) => html`<span class="b">${formatShortDate(x.date)}</span> (counted ${formatNumber(x.eval.counted)}, expected ${formatNumber(x.eval.expected)})`))}. ${esc.level === 'management' ? 'Sent to management.' : html`Sent to supervisor ${esc.supervisor} on ${formatShortDate(esc.supervisorSince)}; goes to management on ${formatShortDate(esc.managementDate)} if it keeps happening.`}</p></div>` : ''; })()}
${v.target && v.target.explanations.length ? html`<span class="small muted">${v.target.explanations.join('. ')}</span>` : ''}
</div>
</div>
<section class="card col g8" aria-labelledby="tlh">
<div class="row sp"><h2 class="h3" id="tlh">Every movement, newest first</h2><span class="small muted">Balance after each line · nothing is ever deleted</span></div>
${rows.length ? html`<ol class="timeline">${shown.map((r) => line(ctx, r, latestCount ? latestCount.entry.id : null))}</ol>` : html`<p class="muted">No entries yet for this item.</p>`}
${rows.length > shown.length ? btn({ label: 'Show older entries', icon: 'history', act: 'h-more', data: { key: `${storeId}|${itemId}` }, style: 'align-self: flex-start; margin-top: 12px' }) : ''}
</section>
</main>
</div>`;
}

// ---------- Correct this entry ----------

function correctDialog(entryId) {
  return {
    render: (ctx) => {
      const { db } = ctx;
      const e = db.ledger.get(entryId);
      const it = db.item(e.itemId);
      const store = db.store(e.storeId);
      const s = (ctx.ui.correct ||= { id: entryId, reason: 'count_correction', text: '' });
      if (s.id !== entryId) Object.assign(s, { id: entryId, reason: 'count_correction', text: '', sealed: undefined, loose: undefined, qty: undefined });
      const split = cartonsSplit(e.qty);
      const sealed = s.sealed ?? String(split.sealed);
      const loose = s.loose ?? String(split.loose);
      const newQty = it.isRutf ? Number(sealed || 0) * SACHETS_PER_CARTON + Number(loose || 0) : Number(s.qty ?? e.qty);
      const delta = Math.round((newQty - e.qty) * 1e6) / 1e6;
      const level = rutfAlertLevel(db, e.storeId, e.itemId);
      const needsApproval = it.isRutf && delta < 0 && Math.abs(delta) >= level;
      const what = e.kind === 'count' ? (e.recount ? 'Recount' : e.itpLog ? 'Daily log' : 'Daily count') : 'Shipment received';
      return html`<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg">
<div class="row sp"><h2 class="h3" id="dlg">Correct this entry</h2>${btn({ label: 'Close', icon: 'x', kind: 'ghost', size: 'sm', act: 'close-modal' })}</div>
<p class="muted" style="margin: 0">${what}, ${formatShortDate(dateOf(e.ts))} ${formatTime(e.ts)}, by ${e.stamp.byName}: ${qtyText(it, e.qty)}. The original stays visible in the history.</p>
<fieldset class="col g8" style="border: 0; padding: 0; margin: 0">
<legend class="label" style="margin-bottom: 8px">Why are you correcting it?</legend>
${CORRECTION_REASONS.map((r) => html`<label class="radio${s.reason === r.id ? ' radio-on' : ''}"><input type="radio" name="reason" value="${r.id}" data-change="c-reason"${s.reason === r.id ? ' checked' : ''}>${r.id === 'other' ? 'Other (please explain)' : r.label}</label>`)}
</fieldset>
${it.isRutf ? html`<div class="row g16" style="align-items: flex-end">
<label class="field"><span class="label">Sealed cartons</span><input class="num" id="c-sealed" value="${sealed}" inputmode="numeric" style="max-width: 120px" data-change="c-field" data-f="sealed"></label>
<label class="field"><span class="label">Loose sachets</span><input class="num" id="c-loose" value="${loose}" inputmode="numeric" style="max-width: 120px" data-change="c-field" data-f="loose"></label>
</div>
<div class="readback">${rutfReadBack(Number(sealed || 0), Number(loose || 0)).text}${delta ? ` (${delta > 0 ? '+' : ''}${formatNumber(delta)})` : ''}</div>`
    : html`<label class="field"><span class="label">Corrected amount (${it.unit.multiply ? it.unit.one : it.unit.many})</span><input class="num" id="c-qty" value="${s.qty ?? e.qty}" inputmode="decimal" data-change="c-field" data-f="qty"></label>${delta ? html`<div class="readback">${qtyText(it, newQty)} (${delta > 0 ? '+' : ''}${formatNumber(delta)})</div>` : ''}`}
${needsApproval ? html`<div class="banner bn-wait"><span class="grow small">Above the alert level of ${formatRutf(Math.round(level))}. This will show "Waiting for approval by a second person" until ${store.supervisor} confirms.</span></div>` : ''}
<label class="field"><span class="label">Note${s.reason === 'other' ? '' : ' (optional)'}</span><textarea class="input" rows="2" id="c-text" data-input="c-text">${s.text}</textarea></label>
<div class="row g8">${btn({ label: 'Save correction', icon: 'tick', kind: 'primary', act: 'correct-save', data: { id: entryId } })}${btn({ label: 'Cancel', icon: 'x', act: 'close-modal' })}</div>
</div>`;
    },
  };
}

export const views = { history: { render, roles: ['facility', 'supervisor', 'logistics', 'management'] } };

export const actions = {
  'h-more': (ctx, el) => { ctx.vs.key = el.dataset.key; ctx.vs.pages = (ctx.vs.pages || 1) + 1; ctx.rerender(); },
  'correct-open': (ctx, el) => { ctx.ui.correct = null; ctx.modal(correctDialog(el.dataset.id)); },
  'correct-save': (ctx, el) => {
    const { db, user } = ctx;
    const s = ctx.ui.correct || {};
    const e = db.ledger.get(el.dataset.id);
    const it = db.item(e.itemId);
    const split = cartonsSplit(e.qty);
    const newQty = it.isRutf ? Number(s.sealed ?? split.sealed) * SACHETS_PER_CARTON + Number(s.loose ?? split.loose) : Number(s.qty ?? e.qty);
    const adj = correctEntry(db, user, e.id, { newQty, reason: s.reason || 'count_correction', text: s.text || '' });
    ctx.changed();
    ctx.ui.modal = null;
    ctx.ui.correct = null;
    ctx.flash(adj.needsApproval
      ? `Correction saved. It is waiting for approval by ${db.store(e.storeId).supervisor}; the stock does not change until then.`
      : `Correction saved: ${qtyText(it, adj.qty)}. The original entry stays in the history.`);
    ctx.rerender();
  },
};

export const changes = {
  'h-store': (ctx, el) => ctx.go(`#/history/${el.value}`),
  'h-item': (ctx, el) => ctx.go(`#/history/${document.getElementById('h-store')?.value || ctx.route.parts[0]}/${el.value}`),
  'c-reason': (ctx, el) => { ctx.ui.correct.reason = el.value; ctx.rerender(); },
  'c-field': (ctx, el) => {
    const v = el.value.trim().replace(/,/g, '');
    if (v !== '' && !/^\d+(\.\d+)?$/.test(v)) throw new ActionError('Type a number of 0 or more.');
    ctx.ui.correct[el.dataset.f] = v;
    ctx.rerender();
  },
};

export const inputs = {
  'c-text': (ctx, el) => { ctx.ui.correct.text = el.value; },
};
