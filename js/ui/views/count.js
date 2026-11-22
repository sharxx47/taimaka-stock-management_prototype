// Screens 4, 5 and 12: daily count (compact rows, one line per item in bin card order), the ITP pharmacy
// daily log ("We ran out of this today"; the app works out use), and the logistics recount (same screen,
// marked "Recount by logistics"). Each line saves by itself; then review and submit.

import { html, raw, joinAnd } from '../dom.js';
import { ic, chip, pic, btn, header, backLink, qtyText, unitLabel, flashBanner, dayName, when, cartonsSplit, deviceType } from '../parts.js';
import { formatShortDate, formatTime, dateOf } from '../../time.js';
import { formatNumber, formatRutf, rutfReadBack } from '../../format.js';
import { today, onHand, previewDifference, nowMs } from '../../stock.js';
import { saveCountLine, submitCount, draftKey, ActionError } from '../../actions.js';
import { SACHETS_PER_CARTON } from '../../config.js';
import { navFor, noteDialog } from './facility.js';

function modeOf(ctx, route) {
  if (route.name === 'recount') return { kind: 'recount', storeId: route.parts[0] };
  const store = ctx.db.store(ctx.user.storeId);
  return { kind: store.type === 'ITP' ? 'itp_log' : 'daily', storeId: store.id };
}

function draftOf(ctx, mode) {
  const d = ctx.db.drafts[draftKey(mode.storeId, mode.kind)];
  return d && d.kind === mode.kind ? d : { kind: mode.kind, lines: {} };
}

// Previous count and receipts since (ITP log: "Yesterday" and "Received today").
function itpBase(db, storeId, itemId) {
  const b = db.ledger.balance(storeId, itemId, { beforeMs: nowMs(db) });
  const received = b.movements.filter((e) => e.kind === 'received').reduce((t, e) => t + e.qty, 0);
  return { base: b.base, prev: b.base ? b.base.qty : null, received, expected: b.qty };
}

function savedStamp(line) {
  return html`<span class="cr-saved">${ic('ok', 's', 'sm')}Saved ${formatTime(line.savedAt)}</span>`;
}

function inputBox(id, value, label, { warn = false, item, field = 'qty', mode, extraCls = '', focus = false } = {}) {
  return html`<input class="num-c${warn ? ' num-warn' : ''}${extraCls}" id="${id}"${focus ? raw(' data-autofocus') : ''} value="${value ?? ''}" inputmode="${item.isRutf ? 'numeric' : 'decimal'}" autocomplete="off" aria-label="${label}" data-change="cnt" data-item="${item.id}" data-f="${field}" data-store="${mode.storeId}" data-kind="${mode.kind}">`;
}

function countRow(ctx, mode, it, n, line) {
  const { db } = ctx;
  const expected = onHand(db, mode.storeId, it.id);
  const qty = line && line.qty !== null ? line.qty : null;
  const prev = qty !== null ? previewDifference(db, mode.storeId, it.id, qty) : null;
  const flagged = !!(prev && prev.flagged);
  const label = `${unitLabel(it)} on the shelf`;
  const expText = expected === null ? 'No count yet' : `Expected ${qtyText(it, expected)}`;
  const notePart = line && line.note ? html`<span class="small">Note: "${line.note}"</span>` : '';
  if (it.isRutf) {
    const sealed = line ? line.sealed ?? '' : '';
    const loose = line ? line.loose ?? '' : '';
    const wrongCartons = sealed !== '' && Number(sealed) > 300 && expected !== null && Number(sealed) > 3 * Math.max(1, expected / SACHETS_PER_CARTON);
    return html`<div class="crow${flagged ? ' crow-warn' : ' crow-now'}" id="row-${it.id}">
<span class="cr-name">${pic(it, 'sm')}${n}. ${it.name}</span>
<span class="cr-exp">${expText}</span>
${line ? savedStamp(line) : html`<span class="cr-saved" style="color: var(--ink-2)">Not entered yet</span>`}
<div class="cr-full row g16" style="align-items: flex-end">
<label class="field"><span class="label">Sealed cartons</span><span class="hint">150 sachets each</span>${inputBox(`cnt-${it.id}-sealed`, sealed, 'Sealed cartons', { item: it, field: 'sealed', mode, warn: wrongCartons, focus: ctx.route.query.item === it.id })}</label>
<span style="font-size: 24px; font-weight: 700; padding-bottom: 8px" aria-hidden="true">+</span>
<label class="field"><span class="label">Loose sachets</span><span class="hint">Any opened carton counts here</span>${inputBox(`cnt-${it.id}-loose`, loose, 'Loose sachets', { item: it, field: 'loose', mode })}</label>
</div>
${wrongCartons ? html`<div class="prompt cr-full"><span class="grow">${formatNumber(Number(sealed))} cartons would be ${formatNumber(Number(sealed) * SACHETS_PER_CARTON)} sachets. Did you mean loose sachets?</span>${btn({ label: 'Move to loose sachets', icon: 'move', size: 'sm', act: 'cnt-move-loose', data: { item: it.id, store: mode.storeId, kind: mode.kind } })}</div>` : ''}
${qty !== null ? html`<div class="readback cr-full">${ic('tick', 'b')}${rutfReadBack(Number(sealed || 0), Number(loose || 0)).text}</div>` : ''}
${flagged ? html`<div class="prompt cr-full">${chip('CHECK', null, 'sm')}<span class="grow">You counted ${formatNumber(qty)}, we expected ${formatNumber(prev.expected)}. Please recount or add a note.</span>${notePart}<div class="row g8">${btn({ label: 'Recount', icon: 'recount', act: 'cnt-recount', data: { item: it.id, store: mode.storeId, kind: mode.kind } })}${btn({ label: line.note ? 'Change note' : 'Add a note', icon: 'note', act: 'cnt-note', data: { item: it.id, store: mode.storeId, kind: mode.kind, label: it.name } })}</div></div>` : ''}
</div>`;
  }
  return html`<div class="crow${flagged ? ' crow-warn' : ''}" id="row-${it.id}">
<span class="cr-name">${pic(it, 'sm')}${n}. ${it.name}</span>
<span class="cr-exp">${expText}</span>
<label class="cr-in"><span class="sr-only">${label}</span>${inputBox(`cnt-${it.id}`, qty, label, { item: it, mode, warn: flagged, focus: ctx.route.query.item === it.id })}</label>
${line ? (qty === null ? html`<span class="cr-saved" style="color: var(--ink-2)">Left blank</span>` : savedStamp(line)) : html`<span class="cr-saved" style="color: var(--ink-2)"></span>`}
${flagged ? html`<div class="prompt cr-full">${chip('CHECK', null, 'sm')}<span class="grow">You counted ${formatNumber(qty)}, we expected ${formatNumber(prev.expected)}. Please recount or add a note.</span>${notePart}<div class="row g8">${btn({ label: 'Recount', icon: 'recount', act: 'cnt-recount', data: { item: it.id, store: mode.storeId, kind: mode.kind } })}${btn({ label: line.note ? 'Change note' : 'Add a note', icon: 'note', act: 'cnt-note', data: { item: it.id, store: mode.storeId, kind: mode.kind, label: it.name } })}</div></div>` : ''}
</div>`;
}

function logRow(ctx, mode, it, n, line) {
  const { db } = ctx;
  const b = itpBase(db, mode.storeId, it.id);
  const qty = line && line.qty !== null ? line.qty : null;
  const used = qty !== null && b.expected !== null ? Math.round((b.expected - qty) * 100) / 100 : null;
  const ranOut = !!(line && line.ranOut);
  const prevLabel = b.base && dateOf(b.base.submittedAt || b.base.ts) === today(db) ? `Earlier today ${formatTime(b.base.submittedAt || b.base.ts)}` : 'Yesterday';
  const label = `${unitLabel(it)} on the shelf now`;
  return html`<div class="crow${ranOut || qty === 0 ? ' crow-warn' : ''}" id="row-${it.id}">
<span class="cr-name">${pic(it, 'sm')}${n}. ${it.name}</span>
<span class="cr-exp">${prevLabel} ${b.prev === null ? 'no count' : qtyText(it, b.prev)}${b.received ? html` · <span class="b">received ${formatNumber(b.received)}</span>` : ''}</span>
<label class="cr-in"><span class="sr-only">${label}</span>${inputBox(`cnt-${it.id}`, qty, label, { item: it, mode, focus: ctx.route.query.item === it.id })}</label>
${line && qty !== null ? savedStamp(line) : html`<span class="cr-saved" style="color: var(--ink-2)">${line ? 'Left blank' : ''}</span>`}
${qty !== null ? html`<div class="cr-full row g16"><span class="readback" style="font-size: 16px">Used since ${prevLabel === 'Yesterday' ? 'yesterday' : 'the last count'}: ${used !== null ? qtyText(it, used) : 'shows after you type'}</span>
<span class="toggle"><button type="button" class="sw${ranOut ? ' sw-on' : ''}" role="switch" aria-checked="${ranOut}" aria-label="We ran out of this today" data-act="cnt-ranout" data-item="${it.id}" data-store="${mode.storeId}" data-kind="${mode.kind}"></button>We ran out of this today</span></div>` : ''}
${ranOut || qty === 0 ? html`<div class="banner bn-out cr-full"><p class="grow" style="margin: 0">${ranOut ? 'A stock-out day is recorded.' : 'None left.'} Ask for more now so patients are not missed.</p><a class="btn btn-primary" href="#/emergency">${ic('emergency', 'w')}Request emergency stock</a></div>` : ''}
</div>`;
}

function render(ctx, route) {
  const { db, user, vs } = ctx;
  const mode = modeOf(ctx, route);
  const store = db.store(mode.storeId);
  const items = db.itemsForStore(mode.storeId);
  const draft = draftOf(ctx, mode);
  const d = today(db);
  const isLog = mode.kind === 'itp_log';
  const isRecount = mode.kind === 'recount';
  const word = isLog ? 'log' : isRecount ? 'recount' : 'count';
  const back = isRecount ? backLink('#/logistics', 'Back to today') : backLink('#/home', 'Back to your stock');
  const place = { name: store.name, type: store.siteType };
  const head = header(ctx, { place, nav: isRecount ? navFor(ctx) : null });

  if (vs.done && vs.done.storeId === mode.storeId && vs.done.kind === mode.kind) {
    return html`<div class="app">${head}<main class="wrap" style="max-width: 720px">
${flashBanner(ctx)}
<section class="card col g16">
<span class="tl-ic">${ic('tick')}</span>
<h1 class="h3">${isRecount ? 'Recount saved' : `Today's ${word} submitted, thank you`}</h1>
<span class="muted">Sent ${formatTime(vs.done.at)} by ${user.name || user.role}${ctx.sync.online ? '' : ` · saved on this ${deviceType()}, will send when online`}</span>
${vs.done.flags ? html`<div class="banner bn-low">${chip('CHECK')}<p class="grow" style="margin: 0">${vs.done.flags} ${vs.done.flags === 1 ? 'difference' : 'differences'} to check. ${isRecount ? 'The facility and its supervisor can see them.' : 'They show on your home screen.'}</p></div>` : ''}
${isRecount ? html`<a class="btn btn-secondary" href="#/logistics" style="align-self: flex-start">${ic('back', 'b')}Back to today</a>` : html`<a class="btn btn-secondary" href="#/home" style="align-self: flex-start">${ic('back', 'b')}Back to your stock</a>`}
</section></main></div>`;
  }

  const lines = draft.lines;
  const entered = items.filter((it) => lines[it.id] && lines[it.id].qty !== null);
  const blanks = items.filter((it) => !lines[it.id] || lines[it.id].qty === null);
  const flags = isLog ? [] : entered.filter((it) => previewDifference(db, mode.storeId, it.id, lines[it.id].qty).flagged);
  const pct = Math.round((entered.length / items.length) * 100);
  const sessToday = [...db.countSessions.values()].filter((s) => s.storeId === mode.storeId && s.kind === mode.kind && dateOf(s.submittedAt) === d && s.submittedAt <= db.nowIso).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)).at(-1);
  const rutf = items.find((it) => it.isRutf);
  const rutfLine = rutf && lines[rutf.id] && lines[rutf.id].qty !== null ? lines[rutf.id] : null;
  const ranOut = items.filter((it) => lines[it.id] && lines[it.id].ranOut);
  const title = isLog ? `Today's log · ${dayName(d)} ${formatShortDate(d)}` : isRecount ? `Recount · ${store.name}` : `Today's count · ${dayName(d)} ${formatShortDate(d)}`;

  return html`<div class="app">${head}
<main class="wrap">
${flashBanner(ctx)}
<div class="col g8">
${back}
${isRecount ? html`<span class="tag tag-recount" style="align-self: flex-start">${ic('recount', 'w', 'sm')}Recount by logistics · ${user.name}</span>` : ''}
<h1 class="h1">${title}</h1>
<p class="lead muted">Count what is on the shelf and type the number. Each line saves by itself.${isLog ? ' The app works out what was used.' : ''}</p>
</div>
${sessToday && !isRecount ? html`<div class="banner bn-info">${ic('history', 'i', 'lg')}<p class="grow" style="margin: 0">Today's ${word} was submitted at <span class="b">${formatTime(sessToday.submittedAt)}</span> by ${sessToday.stamp?.byName === user.name ? 'you' : sessToday.stamp?.byName}. If you ${isLog ? 'log' : 'count'} again, the new ${word} is added and the first one stays in the history.</p></div>` : ''}
<div class="side">
<div class="main">
<div class="crows" role="group" aria-label="${isLog ? 'Daily log' : 'Count'}, one line per item">
${items.map((it, i) => (isLog ? logRow : countRow)(ctx, mode, it, i + 1, lines[it.id]))}
</div>
<section class="card col g16" aria-labelledby="rv" style="border: 2px solid var(--primary)">
<h2 class="h2" id="rv">Review today's ${word}</h2>
<div class="col g8">
<div class="row sp"><span>Items ${isLog ? 'logged' : 'counted'}</span><span class="b">${entered.length} of ${items.length}${blanks.length && blanks.length <= 3 ? ` · ${blanks.map((b) => b.name).join(', ')} left blank` : blanks.length ? ` · ${blanks.length} left blank` : ''}</span></div>
${rutfLine ? html`<div class="row sp"><span>RUTF</span><span class="b">${rutfReadBack(Number(rutfLine.sealed || 0), Number(rutfLine.loose || 0)).text}</span></div>` : ''}
${isLog ? html`<div class="row sp"><span>Ran out today</span><span class="b">${ranOut.length ? ranOut.map((x) => x.name).join(', ') : 'None'}</span></div>`
    : html`<div class="row sp"><span>Differences</span><span class="b">${flags.length ? `${flags.length}${flags.every((f) => lines[f.id].note) ? ', note added' : ''} (${flags.map((f) => f.name).join(', ')})` : 'None'}</span></div>`}
</div>
${blanks.length > 3 ? html`<p class="small muted" style="margin: 0">Left blank (these show "Not counted today"): ${blanks.map((b) => b.name).join(', ')}.</p>` : ''}
<label class="cbox"><input type="checkbox" id="store-check" data-change="cnt-check"${vs.storeCheck === false ? '' : ' checked'}>Store is cool, dry and locked today</label>
${btn({ label: `Submit ${isRecount ? 'recount' : `today's ${word}`}`, icon: 'tick', kind: 'primary', size: 'lg', act: 'cnt-submit', data: { store: mode.storeId, kind: mode.kind }, disabled: !entered.length, style: 'align-self: flex-start' })}
<p class="small muted" style="margin: 0">${entered.length ? `Submitted as ${user.name || user.role} with today's date and time.` : 'Enter at least one line to submit.'}</p>
</section>
</div>
<aside class="aside">
<div class="card col g8">
<span class="b">Progress</span>
<div class="progress" role="progressbar" aria-valuenow="${entered.length}" aria-valuemin="0" aria-valuemax="${items.length}" aria-label="Items ${isLog ? 'logged' : 'counted'}"><span style="width: ${pct}%"></span></div>
<span class="muted">${entered.length} of ${items.length} items ${isLog ? 'logged' : 'counted'}</span>
</div>
${ctx.sync.online ? html`<div class="card col g8"><span class="row g8 b">${ic('saved')}Saved as you go</span><span class="muted">Each line is saved on this ${deviceType()} as soon as you leave the box. Nothing is lost if the app closes.</span></div>`
    : html`<div class="card col g8"><span class="row g8 b">${ic('offline')}No internet right now</span><span class="muted">Your numbers are safe on this ${deviceType()}. They send by themselves when the signal comes back.</span></div>`}
${isLog ? html`<div class="card col g8"><span class="b">How "used" is worked out</span><span class="muted">Yesterday's stock + received today, minus what is on the shelf now. You never need to do the maths.</span><span class="code" style="background: #F5F3EE; padding: 8px 10px; border-radius: 8px">48 + 0 - 36 = 12 vials used</span></div>`
    : isRecount ? html`<div class="card col g8"><span class="b">Logistics recount</span><span class="muted">The recount is saved with your name and compared with the expected stock, the same way as a daily count.</span></div>`
      : html`<div class="card col g8"><span class="b">Leave a line blank</span><span class="muted">If you could not count an item, leave it blank. You can still submit; it shows "Not counted today".</span></div>`}
</aside>
</div>
</main>
</div>`;
}

function lineOf(ctx, el) {
  const key = draftKey(el.dataset.store, el.dataset.kind);
  return (ctx.db.drafts[key] && ctx.db.drafts[key].lines[el.dataset.item]) || null;
}

function save(ctx, el, patch) {
  const { db, user } = ctx;
  const item = db.item(el.dataset.item);
  const prev = lineOf(ctx, el) || {};
  const next = { qty: prev.qty ?? null, sealed: prev.sealed ?? null, loose: prev.loose ?? null, ranOut: !!prev.ranOut, note: prev.note || '', ...patch };
  if (item.isRutf && (next.sealed !== null || next.loose !== null)) {
    if ((next.sealed === '' || next.sealed === null) && (next.loose === '' || next.loose === null)) { next.sealed = null; next.loose = null; next.qty = null; }
  }
  saveCountLine(db, db.drafts, user, el.dataset.store, item.id, item.isRutf && next.sealed === null && next.loose === null ? { qty: null, ranOut: next.ranOut, note: next.note } : next, el.dataset.kind);
  ctx.persist();
  ctx.rerender();
}

export const views = {
  count: { render, roles: ['facility'] },
  recount: { render, roles: ['logistics'] },
};

export const changes = {
  cnt: (ctx, el) => {
    const v = el.value.trim().replace(/,/g, '');
    const f = el.dataset.f;
    if (v !== '' && !/^\d+(\.\d+)?$/.test(v)) throw new ActionError('Type a number of 0 or more, with no letters.');
    if ((f === 'sealed' || f === 'loose') && v !== '' && !/^\d+$/.test(v)) throw new ActionError('Type whole cartons and whole sachets.');
    if (f === 'qty') save(ctx, el, { qty: v === '' ? null : Number(v) });
    else {
      const prev = lineOf(ctx, el) || {};
      const sealed = f === 'sealed' ? v : (prev.sealed ?? '');
      const loose = f === 'loose' ? v : (prev.loose ?? '');
      save(ctx, el, { sealed, loose, qty: null });
    }
  },
  'cnt-check': (ctx, el) => { ctx.vs.storeCheck = el.checked; },
};

export const actions = {
  'cnt-recount': (ctx, el) => {
    const item = ctx.db.item(el.dataset.item);
    save(ctx, el, item.isRutf ? { sealed: '', loose: '', qty: null } : { qty: null });
    document.getElementById(item.isRutf ? `cnt-${item.id}-sealed` : `cnt-${item.id}`)?.focus();
  },
  'cnt-move-loose': (ctx, el) => {
    const prev = lineOf(ctx, el) || {};
    save(ctx, el, { sealed: '0', loose: String(Number(prev.sealed || 0) + Number(prev.loose || 0)), qty: null });
  },
  'cnt-ranout': (ctx, el) => {
    const prev = lineOf(ctx, el) || {};
    save(ctx, el, { ranOut: !prev.ranOut });
  },
  'cnt-note': (ctx, el) => {
    const line = lineOf(ctx, el);
    ctx.modal({
      render: () => html`<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="cnh">
<div class="row sp"><h2 class="h3" id="cnh">Add a note: ${el.dataset.label}</h2>${btn({ label: 'Close', icon: 'x', kind: 'ghost', size: 'sm', act: 'close-modal' })}</div>
<p class="muted" style="margin: 0">Say what you found. The note is sent with the count.</p>
<label class="field"><span class="label">Note</span><textarea class="input" rows="3" id="cnt-note-text" data-autofocus>${line?.note || ''}</textarea></label>
<div class="row g8">${btn({ label: 'Save note', icon: 'tick', kind: 'primary', act: 'cnt-note-save', data: { item: el.dataset.item, store: el.dataset.store, kind: el.dataset.kind } })}${btn({ label: 'Cancel', icon: 'x', act: 'close-modal' })}</div>
</div>`,
    });
  },
  'cnt-note-save': (ctx, el) => {
    const text = document.getElementById('cnt-note-text')?.value || '';
    ctx.ui.modal = null;
    save(ctx, el, { note: text.trim() });
  },
  'cnt-submit': (ctx, el) => {
    const { db, user } = ctx;
    const res = submitCount(db, db.drafts, user, el.dataset.store, { storeCheck: ctx.vs.storeCheck !== false, kind: el.dataset.kind });
    ctx.vs.done = { storeId: el.dataset.store, kind: el.dataset.kind, at: db.nowIso, flags: res.results.filter((r) => r.eval && r.eval.flagged).length };
    ctx.changed();
    ctx.rerender();
    window.scrollTo(0, 0);
  },
};
