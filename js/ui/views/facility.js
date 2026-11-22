// Screens 2, 3a, 3b, 11: facility home (laptop and phone), Receive a shipment, Request emergency stock.
// Also the read-only facility view that supervisors and logistics open from their screens.

import { html, raw, joinAnd } from '../dom.js';
import {
  ic, chip, statusChip, pic, btn, linkBtn, backLink, qtyBig, qtyText, header, longDate, dayName, countStamp, when,
  personRef, stepTracker, shipmentKind, storeShort, flashBanner, isPhone, syncPill, initials, unitLabel, cartonsSplit,
} from '../parts.js';
import { formatShortDate, formatTime, dateOf, daysBetween } from '../../time.js';
import { formatNumber, formatRutf, rutfReadBack } from '../../format.js';
import {
  STATUS, storeItems, urgentFirst, facilitySummary, stockView, today, emergencyRequest, expiryFlags, suggestTransfers,
  sentTooLong, hoursInSent,
} from '../../stock.js';
import { pendingApprovals, requestEmergency, receiveShipment, addNote, ActionError } from '../../actions.js';
import { CORRECTION_REASONS, SACHETS_PER_CARTON } from '../../config.js';
import { openEmergency, emergencyOnTheWay } from '../../alerts.js';

const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ---------- item texts ----------

export function lastsLine(v) {
  if (v.status === STATUS.NOT_COUNTED) {
    return html`<span class="lasts muted">${v.blankToday ? "Left blank on today's count" : "Waiting for today's count"}</span>`;
  }
  if (v.onHand !== null && v.onHand <= 0) return html`<span class="lasts"><span class="b">None left</span></span>`;
  if (!v.tracked) return html`<span class="lasts muted">No end date: use is not recorded</span>`;
  if (v.noRecentUse) {
    const m = (v.usage.monthsUsed || []).map((k) => MONTH_FULL[Number(k.slice(5, 7)) - 1]);
    return html`<span class="lasts muted">No use in ${m.length ? m.join(' or ') : 'recent months'}</span>`;
  }
  if (v.lastsMoreThanYear) return html`<span class="lasts">Lasts <span class="b">more than a year</span></span>`;
  return html`<span class="lasts">Lasts until <span class="b">${formatShortDate(v.lastsUntil)} (${v.days} ${v.days === 1 ? 'day' : 'days'})</span></span>`;
}

export function lastsPlain(v) {
  if (v.onHand !== null && v.onHand <= 0) return 'None left';
  if (!v.tracked) return 'No end date: use is not recorded';
  if (v.noRecentUse) return 'No use in August or September';
  if (v.lastsMoreThanYear) return 'more than a year';
  return `${formatShortDate(v.lastsUntil)} (${v.days} ${v.days === 1 ? 'day' : 'days'})`;
}

function inTransitShipments(db, storeId, itemId = null) {
  return [...db.shipments.values()].filter((sh) => sh.state === 'sent' && sh.toStoreId === storeId && (!itemId || sh.lines.some((l) => l.itemId === itemId)));
}

// Extra line on an item card (design: "On the way in shipment 1042." and friends).
function itemNote(db, v) {
  const ships = inTransitShipments(db, v.store.id, v.item.id);
  if (ships.length) {
    const nums = ships.map((s) => s.number).join(' and ');
    if (v.status === STATUS.OK && v.months !== null && v.months < 2) return `Below its 2-month target. Shipment ${nums} is on the way to top it up.`;
    return `On the way in shipment ${nums}.`;
  }
  if (v.status === STATUS.TOO_MUCH && suggestTransfers(db, [v.item.id]).some((t) => t.fromStoreId === v.store.id)) {
    return 'Logistics has been told. They may move some to another facility.';
  }
  return null;
}

function withBlank(db, v) {
  // Was this item left blank on a count submitted today?
  const d = today(db);
  const blank = [...db.countSessions.values()].some((s) => s.storeId === v.store.id && dateOf(s.submittedAt) === d && (s.blanks || []).includes(v.item.id));
  return { ...v, blankToday: blank };
}

function historyHref(storeId, itemId) {
  return `#/history/${storeId}/${itemId}`;
}

export function itemCard(ctx, v0, { readOnly = false, phone = false } = {}) {
  const { db } = ctx;
  const v = withBlank(db, v0);
  const d = today(db);
  const nc = v.status === STATUS.NOT_COUNTED;
  const check = v.needsCheck ? v.check : null;
  const note = nc ? null : itemNote(db, v);
  const exp = !nc && v.onHand > 0 ? expiryFlags(db, v.store.id, v.item.id) : [];
  const unit = (q) => qtyText(v.item, q);
  if (phone) {
    return html`<article class="item" style="padding: 10px 12px; gap: 6px">
<div class="row g8" style="flex-wrap: nowrap">${pic(v.item, 'sm')}<span class="b grow" style="font-size: 17px">${v.item.name}</span>${v.item.isRutf && !nc ? '' : html`<span class="b" style="font-size: 17px; white-space: nowrap">${nc ? 'Not counted' : unit(v.onHand)}</span>`}</div>${v.item.isRutf && !nc ? html`<span><span class="b" style="font-size: 17px">${formatNumber(v.onHand)} sachets</span>${v.onHand >= 150 ? html` <span class="muted">${formatRutf(v.onHand).slice(formatRutf(v.onHand).indexOf('('))}</span>` : ''}</span>` : ''}
<div class="row sp g8">${lastsLine(v)}${check ? chip('CHECK') : statusChip(v)}</div>${check ? html`<span class="muted">${v.todayCount.demo ? 'Bin card said' : 'Expected'} ${unit(check.expected)}</span>` : ''}${note ? html`<span class="muted">${note}</span>` : ''}
<a class="small muted" href="${historyHref(v.store.id, v.item.id)}">${countStamp(v, d)}</a>
</article>`;
  }
  return html`<article class="item">
<div class="item-top">${pic(v.item)}
<div class="col g4 grow"><h3 class="item-name">${v.item.name}</h3>${nc ? qtyBig(v.item, null) : qtyBig(v.item, v.onHand)}</div></div>
<div class="row sp">${lastsLine(v)}${statusChip(v)}</div>
${check ? html`<div class="prompt">${chip('CHECK', null, 'sm')}<span class="grow small">${v.todayCount.demo ? 'Bin card said' : 'Expected'} ${unit(check.expected)}</span>${readOnly ? '' : html`<a class="btn btn-ghost btn-sm" href="#/count?item=${v.item.id}">${ic('recount', 'b')}Recount</a>`}</div>` : ''}
${exp.map((b) => html`<div class="prompt" style="background: var(--exp-bg); border-color: var(--exp-bd)">${chip('EXPIRY', null, 'sm')}<span class="grow small">Batch ${b.batch} expires ${formatShortDate(b.expiry)}. About ${unit(b.unusedAtExpiry)} will not be used by then.</span></div>`)}
${v.status === STATUS.OUT && !readOnly ? html`<a class="btn btn-primary btn-sm" href="#/emergency">${ic('emergency', 'w')}Request emergency stock</a>` : ''}
${note ? html`<p class="small muted" style="margin: 0">${note}</p>` : ''}
<a class="stamp" href="${historyHref(v.store.id, v.item.id)}">${ic('history', 'i', 'sm')}${countStamp(v, d)}</a>
</article>`;
}

// ---------- summary pills ----------

export function summaryChips(db, storeId, size = '') {
  const { counts: c } = facilitySummary(db, storeId);
  const list = [];
  const add = (kind, n, text) => { if (n) list.push({ kind, n, text }); };
  add('OUT', c.out, 'out of stock');
  add('ORDER_NOW', c.orderNow, 'to order now');
  add('LOW', c.low, 'running low');
  add('TOO_MUCH', c.tooMuch, 'with too much');
  const first = list[0];
  const out = list.map((x) => chip(x.kind, `${x.n} ${x === first ? (x.n === 1 ? 'item ' : 'items ') : ''}${x.text}`, size));
  if (c.check) out.push(chip('CHECK', `${c.check} ${c.check === 1 ? 'count' : 'counts'} to check`, size));
  if (c.ok) out.push(chip('OK', list.length || c.check ? `${c.ok} OK` : 'All OK', size));
  if (!out.length && c.notCounted === c.total) out.push(chip('NOT_COUNTED', null, size));
  return out;
}

// ---------- facility alerts (same order as everywhere, without headings) ----------

export function facilityAlerts(ctx, storeId, { readOnly = false, skipChecks = false } = {}) {
  const { db, user } = ctx;
  const views = storeItems(db, storeId);
  const d = today(db);
  const unit = (v, q) => qtyText(v.item, q);
  const out = [];
  const req = openEmergency(db, storeId);
  const way = req ? null : emergencyOnTheWay(db, storeId);
  const reqText = req ? html` Emergency request sent <span class="b">${when(req.steps.requested.at, d)}</span> by ${personRef(req.steps.requested.byName, user)}${req.state === 'approved' ? ', approved by logistics' : ''}.`
    : way ? html` Emergency shipment <span class="b">${way.number}</span> is on the way, sent <span class="b">${when(way.steps.sent.at, d)}</span>.` : '';
  const emBtn = readOnly ? '' : html`<a class="btn btn-primary" href="#/emergency">${ic('emergency', 'w')}Request emergency stock</a>`;

  const outs = views.filter((v) => v.status === STATUS.OUT);
  if (outs.length) {
    const rutf = outs.some((v) => v.item.isRutf);
    const text = outs.length === 1
      ? html`<span class="b">${outs[0].item.name}</span> is at <span class="b">0</span> ${outs[0].item.unit.many}.`
      : html`<span class="b">${outs.length}</span> items are at <span class="b">0</span>: ${joinAnd(outs.map((v) => html`<span class="b">${v.item.name}</span>`))}.`;
    out.push(html`<div class="banner bn-out">${chip('OUT')}<p class="grow" style="margin: 0">${text}${rutf ? ' A stock-out day was recorded today.' : ''}${reqText}</p>${emBtn}</div>`);
  }
  const orders = views.filter((v) => v.status === STATUS.ORDER_NOW);
  if (orders.length) {
    out.push(html`<div class="banner bn-order">${chip('ORDER_NOW')}<p class="grow" style="margin: 0">${joinAnd(orders.map((v) => html`<span class="b">${v.item.name}</span> lasts until <span class="b">${formatShortDate(v.lastsUntil)}</span> (<span class="b">${v.days} days</span>)`))}.${reqText}</p>${emBtn}</div>`);
  }
  for (const sh of db.shipments.values()) {
    if (sh.toStoreId !== storeId || !sentTooLong(db, sh)) continue;
    out.push(html`<div class="banner bn-order">${chip({ cls: 'order', icon: 'transit' }, 'Sent over 72 hours')}<p class="grow" style="margin: 0">Shipment <span class="b">${sh.number}</span> was sent <span class="b">${formatShortDate(dateOf(sh.steps.sent.at))}</span> (<span class="b">${hoursInSent(db, sh)} hours</span> ago) and is not marked received yet. Mark it received when it arrives.</p>${readOnly ? '' : html`<a class="btn btn-secondary" href="#/receive/${sh.id}">${ic('receive', 'b')}Receive a shipment</a>`}</div>`);
  }
  for (const v of views.filter((x) => x.needsCheck && !skipChecks)) {
    const c = v.check;
    const notes = db.notes.filter((n) => n.targetId === v.todayCount.id);
    // The seeded Jigawan Iro count is the bin card's own count, so its expected figure is what the card said.
    const said = v.todayCount.demo && !v.item.isRutf ? 'the bin card said' : 'we expected';
    out.push(html`<div class="banner bn-low">${chip('CHECK')}<p class="grow" style="margin: 0"><span class="b">${v.item.name}</span>: ${readOnly ? 'counted' : 'you counted'} <span class="b">${formatNumber(c.counted)}</span> ${v.item.unit.many}, ${said} <span class="b">${formatNumber(c.expected)}</span>.${notes.length ? html` Note: "${notes.at(-1).text}"` : ''}</p>${readOnly ? '' : html`<div class="row g8"><a class="btn btn-secondary btn-sm" href="#/count?item=${v.item.id}">${ic('recount', 'b')}Recount</a>${btn({ label: 'Add a note', icon: 'note', size: 'sm', act: 'note-open', data: { target: v.todayCount.id, label: v.item.name } })}</div>`}</div>`);
  }
  if (!views.some((v) => v.countedToday)) {
    const last = views.map((v) => v.lastCount).filter(Boolean).map((c) => c.submittedAt || c.ts).sort().at(-1);
    out.push(html`<div class="banner bn-nc">${chip('NOT_COUNTED')}<p class="grow" style="margin: 0">Today's count is not in yet.${last ? html` Last count <span class="b">${formatShortDate(dateOf(last))}</span> ${formatTime(last)}.` : ''}</p>${readOnly ? '' : html`<a class="btn btn-primary" href="#/count">${ic('count', 'w')}Enter today's ${db.store(storeId).type === 'ITP' ? 'log' : 'count'}</a>`}</div>`);
  }
  for (const e of pendingApprovals(db).filter((x) => x.storeId === storeId)) {
    const it = db.item(e.itemId);
    const reason = CORRECTION_REASONS.find((r) => r.id === e.reason)?.label || e.reason;
    out.push(html`<div class="banner bn-wait">${chip('WAIT', 'Approval waiting')}<p class="grow" style="margin: 0"><span class="b">${it.name}</span> correction of <span class="b">${qtyText(it, e.qty)}</span> (${reason}) by ${personRef(e.stamp.byName, user)} is waiting for ${personRef(db.store(storeId).supervisor, user)}. On hand stays the same until it is approved.</p><a class="btn btn-secondary" href="${historyHref(storeId, e.itemId)}">${ic('history', 'b')}See history</a></div>`);
  }
  for (const v of views) {
    if (!(v.onHand > 0) || v.status === STATUS.NOT_COUNTED) continue;
    for (const b of expiryFlags(db, storeId, v.item.id)) {
      out.push(html`<div class="banner bn-exp">${chip('EXPIRY')}<p class="grow" style="margin: 0"><span class="b">${v.item.name}</span> batch ${b.batch} expires <span class="b">${formatShortDate(b.expiry)}</span>. About <span class="b">${unit(v, b.unusedAtExpiry)}</span> will not be used by then. Logistics has been told.</p><a class="btn btn-secondary" href="${historyHref(storeId, v.item.id)}">${ic('history', 'b')}See history</a></div>`);
    }
  }
  return out;
}

function transitBanners(ctx, storeId, readOnly) {
  const { db } = ctx;
  return inTransitShipments(db, storeId).filter((sh) => !sentTooLong(db, sh)).map((sh) => html`<div class="banner bn-info">${ic('truck', 'b', 'lg')}<p class="grow" style="margin: 0">Shipment <span class="b">${sh.number}</span> is on the way: the ${shipmentKind(sh).replace('Emergency', 'emergency shipment').replace(/ monthly$/, ' monthly shipment')} from the ${storeShort(db.store(sh.fromStoreId))}, sent <span class="b">${formatShortDate(dateOf(sh.steps.sent.at))}</span>.${readOnly ? '' : ' Mark it received when it arrives.'}</p>${readOnly ? '' : html`<a class="btn btn-secondary btn-sm" href="#/receive/${sh.id}">${ic('receive', 'b')}Receive a shipment</a>`}</div>`);
}

// ---------- facility home ----------

function lastCountLine(db, storeId) {
  const sess = [...db.countSessions.values()].filter((s) => s.storeId === storeId && s.kind !== 'recount' && s.submittedAt <= db.nowIso).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)).at(-1);
  if (!sess) return 'No count yet';
  const by = sess.stamp?.byName;
  const word = sess.kind === 'itp_log' ? 'Logged' : 'Counted';
  return `${dateOf(sess.submittedAt) === today(db) ? `${word} today` : `Last ${word.toLowerCase()} ${formatShortDate(dateOf(sess.submittedAt))}`} ${formatTime(sess.submittedAt)}${by ? ` by ${by}` : ''}`;
}

function countLabel(store) {
  return store.type === 'ITP' ? "Enter today's log" : "Enter today's count";
}

function homeLaptop(ctx, storeId, { readOnly = false } = {}) {
  const { db, user } = ctx;
  const store = db.store(storeId);
  const views = storeItems(db, storeId);
  const alerts = facilityAlerts(ctx, storeId, { readOnly });
  const transit = transitBanners(ctx, storeId, readOnly);
  const place = { name: store.name, type: store.siteType };
  const nav = readOnly ? navFor(ctx) : null;
  return html`<div class="app">
${header(ctx, { place, nav, sync: !readOnly || user.kind !== 'management', dataAsOf: user.kind === 'management' ? `${formatShortDate(today(db))} ${formatTime(db.nowIso)}` : null })}
<main class="wrap">
${flashBanner(ctx)}
${readOnly ? backLink(ctx.home, user.kind === 'supervisor' ? 'Back to your facilities' : 'Back') : ''}
<div class="col g8">
<p class="muted" style="margin: 0">${longDate(today(db))} · ${lastCountLine(db, storeId)}</p>
<h1 class="h1">${readOnly ? `${store.name} today` : 'Your stock today'}</h1>
${readOnly ? html`<p class="muted" style="margin: 0">View only. ${store.type === 'CENTRAL' ? '' : `Supervisor ${store.supervisor}.`}</p>` : ''}
</div>
<div class="sum" aria-label="Summary">${summaryChips(db, storeId)}</div>
${readOnly ? '' : html`<div class="actions">
<a class="btn btn-primary btn-lg" href="#/count">${ic('count', 'w', 'lg')}${countLabel(store)}</a>
<a class="btn btn-secondary btn-lg" href="#/receive">${ic('receive', 'b', 'lg')}Receive a shipment</a>
<a class="btn btn-secondary btn-lg" href="#/emergency">${ic('emergency', 'b', 'lg')}Request emergency stock</a>
</div>`}
${alerts.length || transit.length ? html`<section class="col g8 needs" aria-labelledby="att">
<h2 class="sec-t" id="att">Needs attention</h2>
${alerts}${transit}
</section>` : html`<div class="banner bn-ok">${chip('OK', 'All OK')}<p class="grow" style="margin: 0">Nothing needs attention right now.</p></div>`}
<section class="col g8" aria-labelledby="all">
<div class="row sp"><h2 class="sec-t" id="all">All items, ${store.type === 'OTP' ? 'in bin card order' : 'in item list order'}</h2><span class="small muted">${views.length} items</span></div>
<div class="items">${views.map((v) => itemCard(ctx, v, { readOnly }))}</div>
</section>
</main>
</div>`;
}

// Phone home (PhoneHome artboard): urgent-first list and the three actions at the bottom.
function homePhone(ctx, storeId) {
  const { db, user } = ctx;
  const store = db.store(storeId);
  const views = storeItems(db, storeId);
  const outs = views.filter((v) => v.status === STATUS.OUT);
  const rest = urgentFirst(views.filter((v) => v.status !== STATUS.OUT));
  // The urgent-first list already shows each Check, so the phone skips those banners.
  const alerts = facilityAlerts(ctx, storeId, { skipChecks: true }).slice(outs.length ? 1 : 0);
  const req = openEmergency(db, storeId);
  return html`<div class="app ph-page">
<div class="ph-hdr">
<div class="row sp"><img class="logo" src="Assets/taimaka-logo.svg" alt="Taimaka" style="height: 40px"><span class="row g8">${btn({ label: 'Sign out', icon: 'logout', kind: 'ghost', size: 'sm', act: 'signout' })}<span class="avatar" aria-label="${user.name || user.role}">${initials(user, db.stores)}</span></span></div>
<div class="place-box">${ic('store')}<span class="col" style="gap: 0"><span class="pb-name">${store.name}</span><span class="pb-type">${store.siteType}</span></span></div>
<span class="small muted">${user.name ? html`<span class="caps">${user.name}</span> · ` : ''}<span class="caps">${user.role}</span></span>
<span data-slot="sync" data-compact="1">${syncPill(ctx.sync, { compact: true })}</span>
</div>
<div class="ph-body">
${flashBanner(ctx)}
<div class="col g4"><span class="small muted">${dayName(today(db), true)} ${formatShortDate(today(db))} · ${lastCountLine(db, storeId).replace(/ by .*$/, '')}</span>
<div class="row g8">${summaryChips(db, storeId, 'sm')}</div></div>
${outs.length ? html`<article class="item" style="border: 2px solid var(--out-bg); padding: 12px; gap: 8px">
<div class="row sp"><span class="b" style="font-size: 18px">Out of stock</span>${chip('OUT')}</div>
${outs.map((v) => html`<div class="row g8" style="flex-wrap: nowrap">${pic(v.item, 'sm')}<span class="grow b">${v.item.name}</span><span>${qtyText(v.item, 0)}</span></div>`)}
${req ? html`<span class="muted">Emergency request sent ${when(req.steps.requested.at, today(db))} by ${req.steps.requested.byName === user.name ? 'you' : req.steps.requested.byName}.</span>` : ''}
<a class="btn btn-primary btn-block" href="#/emergency">${ic('emergency', 'w')}Request emergency stock</a>
</article>` : ''}
${alerts.length ? html`<div class="col g8">${alerts}</div>` : ''}
${rest.map((v) => itemCard(ctx, v, { phone: true }))}
</div>
<div class="ph-foot">
<a class="btn btn-primary btn-lg btn-block" href="#/count">${ic('count', 'w', 'lg')}${countLabel(store)}</a>
<div class="ph-actions">
<a class="btn btn-secondary" href="#/receive">${ic('receive', 'b')}Receive a shipment</a>
<a class="btn btn-secondary" href="#/emergency">${ic('emergency', 'b')}Request emergency stock</a>
</div>
</div>
</div>`;
}

export function navFor(ctx) {
  const { user, route } = ctx;
  if (user.kind === 'logistics') {
    const here = route.name === 'logistics' ? (route.parts[0] || 'today') : route.name;
    return [
      { href: '#/logistics', label: 'Today', on: here === 'today' },
      { href: '#/logistics/stores', label: 'Stores', on: here === 'stores' || route.name === 'facility' },
      { href: '#/logistics/shipments', label: 'Shipments', on: here === 'shipments' || route.name === 'shipment' || route.name === 'monthly' },
      { href: '#/history', label: 'History', on: route.name === 'history' },
      { href: '#/settings', label: 'Settings', on: route.name === 'settings' },
    ];
  }
  return null;
}

function renderHome(ctx) {
  const { user } = ctx;
  return isPhone() ? homePhone(ctx, user.storeId) : homeLaptop(ctx, user.storeId);
}

function renderFacility(ctx, route) {
  const storeId = route.parts[0];
  ctx.db.store(storeId);
  return homeLaptop(ctx, storeId, { readOnly: true });
}

// ---------- note dialog (shared) ----------
export function noteDialog(targetId, label) {
  return {
    render: (ctx) => html`<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="ndh">
<div class="row sp"><h2 class="h3" id="ndh">Add a note: ${label}</h2>${btn({ label: 'Close', icon: 'x', kind: 'ghost', size: 'sm', act: 'close-modal' })}</div>
<p class="muted" style="margin: 0">The note is saved with your name and the time, next to the entry.</p>
<label class="field"><span class="label">Note</span><textarea class="input" rows="3" id="note-text" data-autofocus placeholder="For example: counted twice, the bin card was not updated"></textarea></label>
<div class="row g8">${btn({ label: 'Save note', icon: 'tick', kind: 'primary', act: 'note-save', data: { target: targetId } })}${btn({ label: 'Cancel', icon: 'x', act: 'close-modal' })}</div>
</div>`,
  };
}

// ---------- Request emergency stock (screen 3b) ----------

function renderEmergency(ctx) {
  const { db, user, vs } = ctx;
  const storeId = user.storeId;
  const store = db.store(storeId);
  const d = today(db);
  const open = [...db.shipments.values()].filter((sh) => sh.type === 'emergency' && sh.toStoreId === storeId && sh.state !== 'received');
  const covered = new Set(open.flatMap((sh) => sh.lines.map((l) => l.itemId)));
  const req = emergencyRequest(db, storeId);
  const lines = req.lines.filter((l) => !covered.has(l.itemId));
  const onTheWay = storeItems(db, storeId).filter((v) => (v.status === STATUS.LOW || v.status === STATUS.ORDER_NOW) && v.inTransit > 0 && !lines.some((l) => l.itemId === v.item.id));
  const transitNums = (itemId) => inTransitShipments(db, storeId, itemId).map((s) => s.number).join(' and ');
  return html`<div class="app">
${header(ctx)}
<main class="wrap" style="max-width: 880px">
${flashBanner(ctx)}
${backLink('#/home', 'Back to your stock')}
<div class="col g8">
<h1 class="h1">Request emergency stock</h1>
<p class="lead muted">${lines.length ? 'We filled this in for you from today\'s count. Check it, then press Send.' : open.length ? 'Your request is with logistics. You can follow it here.' : 'Nothing is out of stock or running out within 10 days.'}</p>
</div>
${open.map((sh) => html`<section class="card col g16" aria-label="Request ${sh.number}">
${sh.state === 'requested' ? html`<div class="banner bn-ok">${ic('tick', 'i', 'lg')}<span class="grow"><span class="b">Emergency request sent.</span> Logistics usually sends within 24 to 48 hours.</span></div>` : ''}
<div class="row sp"><span class="b">Shipment ${sh.number} · Emergency</span><span class="small muted">Sent ${when(sh.steps.requested.at, d)} by ${sh.steps.requested.byName === user.name ? `you (${user.name})` : sh.steps.requested.byName}</span></div>
${stepTracker(sh, d, { viewer: user })}
<div class="col g8">${sh.lines.map((l) => { const it = db.item(l.itemId); return html`<div class="row g16">${pic(it, 'sm')}<span class="grow b">${it.name}</span><span>${l.qtySent !== null ? qtyText(it, l.qtySent) : l.qtyProposed !== null ? qtyText(it, l.qtyProposed) : 'Logistics will set the amount'}</span></div>`; })}</div>
${sh.state === 'sent' ? html`<a class="btn btn-primary" href="#/receive/${sh.id}" style="align-self: flex-start">${ic('receive', 'w')}Receive this shipment</a>` : ''}
</section>`)}
${lines.length ? html`<section class="card col g16" aria-labelledby="need">
<h2 class="h3" id="need">Items that need it now</h2>
${lines.map((l) => { const it = db.item(l.itemId); const v = stockView(db, storeId, l.itemId); return html`<div class="item-top" style="align-items: center">
${pic(it)}
<div class="col g4 grow"><span class="item-name">${it.name}</span>${v.status === STATUS.OUT ? html`<span class="chip chip-out chip-sm" style="align-self: flex-start">${ic('out', 's', 'sm')}Out of stock · ${qtyText(it, 0)}</span>` : html`<span class="chip chip-order chip-sm" style="align-self: flex-start">${ic('order', 's', 'sm')}Order now · lasts until ${formatShortDate(v.lastsUntil)} (${v.days} days)</span>`}</div>
<div class="col g4" style="align-items: flex-end; max-width: 300px; text-align: right">${l.qty === null ? html`<span class="b">${l.note}</span>` : html`<span class="b">${qtyText(it, l.qty)}</span><span class="small muted">Tops up to the ${l.estimated ? 'estimated ' : ''}2-month target of ${qtyText(it, l.target)}</span>`}</div>
</div>`; })}
</section>
${onTheWay.length ? html`<section class="card col g8" aria-labelledby="also">
<h2 class="h3" id="also">Already on the way</h2>
${onTheWay.map((v) => html`<div class="row g16">${pic(v.item, 'sm')}<span class="grow">${v.item.name} · ${qtyText(v.item, v.onHand)} · lasts until ${lastsPlain(v)}</span>${statusChip(v, { size: 'sm' })}</div><p class="small muted" style="margin: 0">On the way in shipment ${transitNums(v.item.id)}.</p>`)}
</section>` : ''}
<label class="field"><span class="label">Note for logistics (optional)</span><textarea class="input" rows="2" id="em-note" data-input="em-note" placeholder="For example: many ear infection cases this week">${vs.note || ''}</textarea></label>
<div class="card col g16" style="border: 2px solid var(--primary)">
<p style="margin: 0">Goes to <span class="b">Logistics, Central store</span>. Emergency shipments usually arrive within <span class="b">24 to 48 hours</span>.</p>
${btn({ label: 'Send request', icon: 'truck', kind: 'primary', size: 'lg', act: 'em-send', style: 'align-self: flex-start' })}
<p class="small muted" style="margin: 0">Sent as ${user.name || user.role}, ${store.name}. You can follow it here and under Receive a shipment.</p>
</div>` : !open.length ? html`<section class="card col g8"><span class="tl-ic">${ic('tick')}</span><span class="h3">Nothing needs emergency stock</span><span class="muted">Items that are out of stock or will run out within 10 days show here.</span>${linkBtn({ label: 'Back to your stock', icon: 'back', href: '#/home', style: 'align-self: flex-start' })}</section>` : ''}
</main>
</div>`;
}

// ---------- Receive a shipment (screen 3a) ----------

const DIFF_KINDS = ['Short', 'Damaged', 'Extra'];

function parseDmy(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? null : iso;
}
function toDmy(iso) {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '';
}
function longExpiry(iso) {
  return iso ? `${formatShortDate(iso)} ${iso.slice(0, 4)}` : 'no expiry recorded';
}

// Entered values for one shipment, kept while the screen is open: { [itemId]: { batches: [{sealed, loose, qty, batch, expiry}], kind, note } }
function recvState(vs, sh) {
  vs.recv ||= {};
  if (!vs.recv[sh.id]) {
    vs.recv[sh.id] = {};
    for (const l of sh.lines) {
      vs.recv[sh.id][l.itemId] = { batches: (l.batchesSent || [{ batch: '', expiry: null, qty: l.qtySent }]).map((b) => ({ sealed: '', loose: '', qty: '', batch: b.batch || '', expiry: toDmy(b.expiry), sent: b.qty })), kind: 'Short', note: '' };
    }
  }
  return vs.recv[sh.id];
}

function batchQty(item, b) {
  if (item.isRutf) {
    if (b.sealed === '' && b.loose === '') return null;
    return Number(b.sealed || 0) * SACHETS_PER_CARTON + Number(b.loose || 0);
  }
  return b.qty === '' ? null : Number(b.qty);
}

function receiveLine(ctx, sh, l, st) {
  const it = ctx.db.item(l.itemId);
  const s = st[l.itemId];
  const total = s.batches.reduce((t, b) => t + (batchQty(it, b) ?? 0), 0);
  const allIn = s.batches.every((b) => batchQty(it, b) !== null);
  const diff = allIn ? total - l.qtySent : 0;
  const key = (i, f) => `rv-${l.itemId}-${i}-${f}`;
  const field = (i, f, label, value, cls, extra = '') => html`<label class="field"><span class="label">${label}</span><input class="${cls}" id="${key(i, f)}" value="${value}" ${raw(extra)} data-change="rv-field" data-sh="${sh.id}" data-item="${l.itemId}" data-i="${i}" data-f="${f}"></label>`;
  return html`<section class="card col g16" aria-labelledby="r-${l.itemId}">
<div class="item-top">${pic(it)}
<div class="col g4 grow"><h2 class="h3" id="r-${l.itemId}">${it.name}</h2><span class="muted">Sent: <span class="b">${qtyText(it, l.qtySent)}</span> in ${s.batches.length} ${s.batches.length === 1 ? 'batch' : 'batches'}</span></div></div>
${s.batches.map((b, i) => {
    const q = batchQty(it, b);
    const warn = q !== null && q !== b.sent;
    const numCls = `num${warn ? ' num-warn' : ''}`;
    const inner = html`<div class="row g16" style="align-items: flex-end">
${it.isRutf ? html`${field(i, 'sealed', 'Sealed cartons', b.sealed, numCls, 'inputmode="numeric" style="max-width: 140px"')}${field(i, 'loose', 'Loose sachets', b.loose, numCls, 'inputmode="numeric" style="max-width: 140px"')}` : field(i, 'qty', `${unitLabel(it)} received`, b.qty, numCls, 'inputmode="decimal" style="max-width: 140px"')}
${field(i, 'batch', 'Batch number', b.batch, 'input', 'style="width: 160px"')}
${field(i, 'expiry', 'Expiry date', b.expiry, 'input', 'placeholder="DD/MM/YYYY" style="width: 160px"')}
${!it.isRutf && q !== null && !warn ? html`<span class="savedline">${ic('ok', 's', 'sm')}Matches what was sent</span>` : ''}
</div>
${it.isRutf && q !== null ? html`<div class="readback">${ic(warn ? 'count' : 'tick', 'b')}${rutfReadBack(Number(b.sealed || 0), Number(b.loose || 0)).text}${warn ? '' : ' · matches what was sent'}</div>` : ''}`;
    return s.batches.length > 1 || it.isRutf
      ? html`<div class="card card-tight col g16" style="background: #FAF8F4"><div class="row sp"><span class="b">Batch ${b.batch || 'not recorded'} · expires ${longExpiry(parseDmy(b.expiry))}</span><span class="small muted">Sent ${qtyText(it, b.sent)}</span></div>${inner}</div>`
      : inner;
  })}
${diff !== 0 ? html`<div class="prompt" style="flex-direction: column; align-items: stretch">
<div class="row g8">${chip('CHECK', `${qtyText(it, Math.abs(diff))} ${diff < 0 ? 'short' : 'extra'}`, 'sm')}<span class="b">What happened?</span></div>
<div class="row g8" role="group" aria-label="What happened">${DIFF_KINDS.map((k) => html`<button type="button" class="tab${s.kind === k ? ' tab-on' : ''}" data-act="rv-kind" data-sh="${sh.id}" data-item="${l.itemId}" data-kind="${k}" aria-pressed="${s.kind === k}">${k}</button>`)}</div>
<label class="field"><span class="label">Add a note</span><textarea class="input" rows="2" id="rv-note-${l.itemId}" data-input="rv-note" data-sh="${sh.id}" data-item="${l.itemId}">${s.note}</textarea></label>
</div>` : ''}
</section>`;
}

function renderReceive(ctx, route) {
  const { db, user, vs } = ctx;
  const storeId = user.storeId;
  const store = db.store(storeId);
  const d = today(db);
  const sent = inTransitShipments(db, storeId);
  const waiting = [...db.shipments.values()].filter((sh) => sh.toStoreId === storeId && (sh.state === 'requested' || sh.state === 'approved'));
  const sh = route.parts[0] ? db.shipments.get(route.parts[0]) : sent.length === 1 ? sent[0] : null;
  const head = html`${header(ctx)}<main class="wrap" style="max-width: 1040px">${flashBanner(ctx)}${backLink('#/home', 'Back to your stock')}`;
  if (!sh || sh.state !== 'sent' || sh.toStoreId !== storeId) {
    return html`<div class="app">${head}
<div class="col g8"><h1 class="h1">Receive a shipment</h1><p class="lead muted">Shipments on the way to ${store.name}.</p></div>
${sent.length ? sent.map((s) => html`<section class="card col g16"><div class="row sp"><span class="b">Shipment ${s.number} · ${shipmentKind(s)}</span>${chip('TRANSIT')}</div>${stepTracker(s, d, { viewer: user })}<span class="small muted">${s.lines.map((l) => `${db.item(l.itemId).name} ${qtyText(db.item(l.itemId), l.qtySent)}`).join(' · ')}</span><a class="btn btn-primary" href="#/receive/${s.id}" style="align-self: flex-start">${ic('receive', 'w')}Check what arrived</a></section>`)
    : html`<section class="card col g8"><span class="tl-ic">${ic('truck')}</span><span class="h3">No shipments in transit</span><span class="muted">When logistics sends you stock, it shows here.</span></section>`}
${waiting.length ? html`<h2 class="sec-t">Not sent yet</h2>${waiting.map((s) => html`<section class="card col g16"><div class="row sp"><span class="b">Shipment ${s.number} · ${shipmentKind(s)}</span><span class="small muted">Requested ${when(s.steps.requested.at, d)}</span></div>${stepTracker(s, d, { viewer: user })}</section>`)}` : ''}
</main></div>`;
  }
  const st = recvState(vs, sh);
  const items = sh.lines.map((l) => db.item(l.itemId));
  const summary = sh.lines.map((l) => {
    const it = db.item(l.itemId);
    const s = st[l.itemId];
    const allIn = s.batches.every((b) => batchQty(it, b) !== null);
    if (!allIn) return html`${it.name}: <span class="muted">not entered yet</span>`;
    const tot = s.batches.reduce((t, b) => t + batchQty(it, b), 0);
    const diff = tot - l.qtySent;
    return html`${it.name}: <span class="b">${it.isRutf ? `${formatRutf(tot)} of ${formatRutf(l.qtySent)}` : `${formatNumber(tot)} of ${qtyText(it, l.qtySent)}`}</span> received${diff ? `, ${qtyText(it, Math.abs(diff))} ${diff < 0 ? (s.kind === 'Damaged' ? 'damaged' : 'short') : 'extra'}${s.note.trim() ? ' (note added)' : ''}` : ''}`;
  });
  return html`<div class="app">${head}
<div class="col g8">
<h1 class="h1">Receive a shipment</h1>
<p class="lead muted">${shipmentKind(sh)} shipment from the ${db.store(sh.fromStoreId).type === 'CENTRAL' ? 'Central store, Gombe' : db.store(sh.fromStoreId).name}. Check what arrived, item by item.</p>
</div>
<section class="card col g16" aria-label="Shipment progress">
<div class="row sp"><span class="b">Shipment ${sh.number} · ${shipmentKind(sh)}</span>${chip('TRANSIT')}</div>
${stepTracker(sh, d, { viewer: user })}
<p class="small muted row g8" style="margin: 0">${ic('lock', 'i', 'sm')}Sent amounts are locked. Only ${store.name} can mark this received.</p>
</section>
${sh.lines.map((l) => receiveLine(ctx, sh, l, st))}
<section class="card col g16" style="border: 2px solid var(--primary)">
<h2 class="h3">Check and confirm</h2>
<p style="margin: 0">${summary.map((s, i) => html`${i ? '. ' : ''}${s}`)}.</p>
${btn({ label: 'Confirm shipment received', icon: 'tick', kind: 'primary', size: 'lg', act: 'rv-confirm', data: { sh: sh.id }, style: 'align-self: flex-start' })}
<p class="small muted" style="margin: 0">This adds the stock to ${store.name}, stamped ${user.name || user.role}, ${formatShortDate(d)} ${d.slice(0, 4)}.</p>
</section>
</main></div>`;
}

export const views = {
  home: { render: renderHome, roles: ['facility'] },
  facility: { render: renderFacility, roles: ['supervisor', 'logistics', 'management'] },
  emergency: { render: renderEmergency, roles: ['facility'] },
  receive: { render: renderReceive, roles: ['facility'] },
};

export const actions = {
  'note-open': (ctx, el) => ctx.modal(noteDialog(el.dataset.target, el.dataset.label)),
  'note-save': (ctx, el) => {
    const text = document.getElementById('note-text')?.value || '';
    addNote(ctx.db, ctx.user, el.dataset.target, text);
    ctx.changed();
    ctx.ui.modal = null;
    ctx.flash('Note saved.');
    ctx.rerender();
  },
  'em-send': (ctx) => {
    const { db, user } = ctx;
    const open = [...db.shipments.values()].filter((sh) => sh.type === 'emergency' && sh.toStoreId === user.storeId && sh.state !== 'received');
    const sh = requestEmergency(db, user, user.storeId, { skipItemIds: open.flatMap((s) => s.lines.map((l) => l.itemId)), note: ctx.vs.note || '' });
    ctx.vs.note = '';
    ctx.changed();
    ctx.flash(`Emergency request ${sh.number} sent to logistics.`);
    ctx.rerender();
  },
  'rv-kind': (ctx, el) => {
    const s = ctx.ui.view.receive.recv[el.dataset.sh][el.dataset.item];
    s.kind = el.dataset.kind;
    ctx.rerender();
  },
  'rv-confirm': (ctx, el) => {
    const { db, user } = ctx;
    const sh = db.shipments.get(el.dataset.sh);
    const st = ctx.vs.recv[sh.id];
    const received = {};
    for (const l of sh.lines) {
      const it = db.item(l.itemId);
      const s = st[l.itemId];
      const batches = s.batches.map((b) => {
        const q = batchQty(it, b);
        if (q === null) throw new ActionError(`Enter what arrived for ${it.name}.`);
        const exp = parseDmy(b.expiry);
        if (!exp) throw new ActionError(`${it.name}: type the expiry date as DD/MM/YYYY.`);
        return { batch: b.batch.trim(), expiry: exp, qty: q };
      });
      const tot = batches.reduce((t, b) => t + b.qty, 0);
      const reason = tot !== l.qtySent ? (s.note.trim() ? `${s.kind}: ${s.note.trim()}` : '') : null;
      received[l.itemId] = { batches, reason };
    }
    receiveShipment(db, user, sh.id, received);
    delete ctx.vs.recv[sh.id];
    ctx.changed();
    ctx.ui.flash = { text: `Shipment ${sh.number} received. The stock is added to ${db.store(sh.toStoreId).name}.`, kind: 'ok', keep: true };
    ctx.go('#/home');
  },
};


export const changes = {
  'rv-field': (ctx, el) => {
    const s = ctx.ui.view.receive.recv[el.dataset.sh][el.dataset.item];
    s.batches[Number(el.dataset.i)][el.dataset.f] = el.value.trim();
    ctx.rerender();
  },
};

export const inputs = {
  'em-note': (ctx, el) => { ctx.vs.note = el.value; },
  'rv-note': (ctx, el) => { ctx.ui.view.receive.recv[el.dataset.sh][el.dataset.item].note = el.value; },
};
