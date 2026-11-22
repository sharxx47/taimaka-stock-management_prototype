// Shared building blocks: icons, status pills, product pictures, buttons, quantities, the header,
// the sync indicator and the shipment step tracker. Class names are the design stylesheet's (tm.css).

import { html, raw, attrs, esc } from './dom.js';
import { formatQty, formatNumber, formatRutf } from '../format.js';
import { formatShortDate, formatTime, dateOf } from '../time.js';
import { SACHETS_PER_CARTON } from '../config.js';

// ---------- icons ----------
// variant: i (ink), b (navy), w (white), s (status).
export function ic(name, variant = 'i', size = '') {
  return html`<span class="ic ${size ? `ic-${size} ` : ''}${variant}-${name}" aria-hidden="true"></span>`;
}

// ---------- status pills ----------
export const PILL = {
  OUT: { cls: 'out', icon: 'out', label: 'Out of stock' },
  ORDER_NOW: { cls: 'order', icon: 'order', label: 'Order now' },
  CHECK: { cls: 'check', icon: 'check', label: 'Check' },
  LOW: { cls: 'low', icon: 'low', label: 'Running low' },
  NOT_COUNTED: { cls: 'nc', icon: 'nc', label: 'Not counted today' },
  TOO_MUCH: { cls: 'much', icon: 'much', label: 'Too much' },
  OK: { cls: 'ok', icon: 'ok', label: 'OK' },
  NOT_TRACKED: { cls: 'untr', icon: 'untr', label: 'Usage not tracked' },
  ABOVE_TARGET: { cls: 'above', icon: 'above', label: 'Above target' },
  CENTRAL_LOW: { cls: 'low', icon: 'low', label: 'Below 3-month target' },
  ESTIMATED: { cls: 'est', icon: 'est', label: 'Estimated target' },
  EXPIRY: { cls: 'exp', icon: 'exp', label: 'Will expire before use' },
  TRANSIT: { cls: 'transit', icon: 'transit', label: 'In transit' },
  WAIT: { cls: 'wait', icon: 'wait', label: 'Waiting for approval' },
};

// chip('OUT') or chip({ cls, icon }, 'label'); size: '' (normal) or 'sm'.
export function chip(kind, label = null, size = '') {
  const p = typeof kind === 'string' ? PILL[kind] : kind;
  const sm = size === 'sm';
  return html`<span class="chip chip-${p.cls}${sm ? ' chip-sm' : ''}">${ic(p.icon, 's', sm ? 'sm' : '')}${label ?? p.label}</span>`;
}

export function statusChip(view, { size = '', logistics = false } = {}) {
  if (logistics && view.aboveTarget) return chip('ABOVE_TARGET', null, size);
  return chip(view.status.code, null, size);
}

// ---------- product pictures (design artboards: one picture per item) ----------
const PIC_BY_ITEM = {
  zinc_oxide: 'tube', act_al_1: 'blister', amox_100: 'bottle', amox_60: 'bottle', ciprotap: 'drops', loratadine: 'box',
  malaria_rdt: 'rdt', multivite: 'bottle', nystatin: 'bottle', ors: 'ors', paracetamol: 'bottle', rutf: 'rutf',
  act_al_2: 'blister', albendazole: 'blister', tetracycline: 'tube', tom_brown: 'tombrown', act_aa_toddler: 'blister',
  otomed: 'drops', zinc_sulfate: 'box', cefixime: 'box', act_aa_infant: 'blister', tb_bucket: 'bucket', bms: 'box',
  benzyl_benzoate: 'lotion', soap: 'soap', sponge: 'sponge', muac_tape: 'box',
};
const PIC_BY_UNIT = { '1000 ml': 'tin', tin: 'tin', sachet: 'ors', bag: 'ivbag', vial: 'vial', ampoule: 'vial', bottle: 'bottle', tube: 'tube', tablet: 'blister', piece: 'box' };
const PIC_LABEL = {
  tube: 'Cream tube', blister: 'Tablet blister pack', bottle: 'Medicine bottle', drops: 'Dropper bottle', box: 'Medicine box',
  rdt: 'Rapid test kit', ors: 'ORS sachet', rutf: 'RUTF sachet', tombrown: 'Tom Brown pack', bucket: 'Bucket', lotion: 'Lotion bottle',
  soap: 'Soap bar', sponge: 'Sponge', tin: 'Tin', vial: 'Vial', ivbag: 'IV bag',
};

export function picName(item) {
  if (PIC_BY_ITEM[item.id]) return PIC_BY_ITEM[item.id];
  if (/lotion/i.test(item.name)) return 'lotion';
  return PIC_BY_UNIT[item.unit.one] || 'box';
}

export function pic(item, size = '') {
  const p = picName(item);
  return html`<span class="pic${size ? ` pic-${size}` : ''} p-${p}" role="img" aria-label="${PIC_LABEL[p]}"></span>`;
}

// ---------- buttons ----------
// kind: primary | secondary | ghost | danger. Every button has an icon.
export function btn({ label, icon = null, kind = 'secondary', size = '', act = null, data = {}, block = false, disabled = false, type = 'button', style = null, id = null, iconAfter = false }) {
  const v = kind === 'primary' || kind === 'danger' ? 'w' : 'b';
  const cls = `btn btn-${kind}${size ? ` btn-${size}` : ''}${block ? ' btn-block' : ''}`;
  const a = { class: cls, type, 'data-act': act, disabled, style, id };
  for (const [k, val] of Object.entries(data)) a[`data-${k}`] = val;
  const icn = icon ? ic(icon, v, size === 'lg' ? 'lg' : '') : '';
  return html`<button${attrs(a)}>${iconAfter ? '' : icn}${label}${iconAfter ? icn : ''}</button>`;
}

export function linkBtn({ label, icon = null, kind = 'secondary', size = '', href, block = false, style = null }) {
  const v = kind === 'primary' ? 'w' : 'b';
  return html`<a class="btn btn-${kind}${size ? ` btn-${size}` : ''}${block ? ' btn-block' : ''}" href="${href}"${attrs({ style })}>${icon ? ic(icon, v, size === 'lg' ? 'lg' : '') : ''}${label}</a>`;
}

// Every screen other than the user's home gets one "Back" link from main.js (CLAUDE.md, navigation),
// so views no longer add their own.
export function backLink() {
  return '';
}

export const HOME = { facility: '#/home', supervisor: '#/supervisor', logistics: '#/logistics', management: '#/management' };

// Header tabs for each role: only screens the role can already open, the home first (CLAUDE.md, navigation).
export function roleTabs(ctx) {
  const { user, route } = ctx;
  const n = route.name;
  if (user.kind === 'logistics') {
    const here = n === 'logistics' ? (route.parts[0] || 'today') : n;
    return [
      { href: '#/logistics', label: 'Today', on: here === 'today' || n === 'recount' || n === 'transfer' },
      { href: '#/logistics/stores', label: 'Stores', on: here === 'stores' || n === 'facility' },
      { href: '#/logistics/shipments', label: 'Shipments', on: here === 'shipments' || n === 'shipment' || n === 'monthly' },
      { href: '#/history', label: 'History', on: n === 'history' },
      { href: '#/settings', label: 'Settings', on: n === 'settings' },
    ];
  }
  if (user.kind === 'facility') {
    return [
      { href: '#/home', label: 'Today', on: ['home', 'count', 'receive', 'emergency'].includes(n) },
      { href: '#/history', label: 'History', on: n === 'history' },
    ];
  }
  if (user.kind === 'supervisor') {
    return [
      { href: '#/supervisor', label: 'Today', on: n === 'supervisor' || n === 'facility' },
      { href: '#/stores', label: 'Stores', on: n === 'stores' },
      { href: '#/shipments', label: 'Shipments', on: n === 'shipments' },
      { href: '#/history', label: 'History', on: n === 'history' },
    ];
  }
  return [
    { href: '#/management', label: 'Overview', on: n === 'management' },
    { href: '#/facility/central', label: 'Central store', on: n === 'facility' },
    { href: '#/history', label: 'History', on: n === 'history' },
  ];
}

export function tabsNav(ctx, extraClass = '') {
  return html`<nav class="nav${extraClass ? ` ${extraClass}` : ''}" aria-label="Main">${roleTabs(ctx).map((t) => html`<a href="${t.href}"${t.on ? raw(' class="on" aria-current="page"') : ''}>${t.label}</a>`)}</nav>`;
}

// ---------- quantities ----------
export function qtyText(item, qty) {
  return formatQty(item, qty);
}

// The big number on item cards: "4,331 sachets" with "(28 cartons + 131 loose)" below for RUTF.
export function qtyBig(item, qty) {
  if (qty === null || qty === undefined) return html`<span class="qty" style="font-size: 22px">Not counted</span>`;
  const unit = Math.abs(qty) === 1 ? item.unit.one : item.unit.many;
  if (item.isRutf) {
    const full = formatRutf(qty);
    const paren = full.includes('(') ? full.slice(full.indexOf('(')) : '';
    return html`<span class="qty">${formatNumber(qty)} <small>${qty === 1 ? 'sachet' : 'sachets'}</small></span>${paren ? html`<span class="small muted">${paren}</span>` : ''}`;
  }
  if (item.unit.multiply) return html`<span class="qty">${formatNumber(qty)} <small>x ${item.unit.one}</small></span>`;
  return html`<span class="qty">${formatNumber(qty)} <small>${unit}</small></span>`;
}

export function unitLabel(item, capital = true) {
  // "Bottles on the shelf", "Sachets on the shelf", "1000 ml on the shelf"
  const w = item.unit.multiply ? item.unit.one : item.unit.many;
  return capital ? w.charAt(0).toUpperCase() + w.slice(1) : w;
}

export function cartonsSplit(sachets) {
  const sealed = Math.floor(sachets / SACHETS_PER_CARTON);
  return { sealed, loose: Math.round((sachets - sealed * SACHETS_PER_CARTON) * 100) / 100 };
}

// ---------- dates ----------
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function longDate(date) {
  const d = new Date(`${date}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${formatShortDate(date)} ${date.slice(0, 4)}`;
}
export function dayName(date, short = false) {
  const n = DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return short ? n.slice(0, 3) : n;
}

// "today 5:40 PM", "29 Oct 5:15 PM"
export function when(iso, todayDate, { capital = false } = {}) {
  if (!iso) return '';
  const d = dateOf(iso);
  const t = formatTime(iso);
  if (d === todayDate) return `${capital ? 'Today' : 'today'} ${t}`;
  return `${formatShortDate(d)} ${t}`;
}

// "Counted today 5:40 PM", "Last counted 29 Oct 5:15 PM"
export function countStamp(view, todayDate) {
  // The central store has no daily count: show when its stock was last updated, as in the logistics table.
  if (view.isCentral) return view.lastUpdated ? `Updated ${when(view.lastUpdated.at, todayDate)}` : 'No stock recorded';
  if (view.countedToday) return `Counted today ${formatTime(view.countedAt)}`;
  if (view.lastCount) {
    const t = view.lastCount.submittedAt || view.lastCount.ts;
    return `Last counted ${formatShortDate(dateOf(t))} ${formatTime(t)}`;
  }
  return 'Not counted yet';
}

// ---------- people ----------
export function initials(user, stores) {
  if (!user.name) {
    return user.kind === 'management' ? null : user.role.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  }
  return user.name.replace(/\./g, '').split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

// Text that refers to the signed-in person says "you" with their name in brackets.
export function personRef(name, user) {
  if (user && user.name && name === user.name) return html`you (<span class="b">${name}</span>)`;
  return html`<span class="b">${name}</span>`;
}

// ---------- device and sync ----------
export function deviceType() {
  const ua = navigator.userAgent || '';
  const touch = (navigator.maxTouchPoints || 0) > 1;
  if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'tablet';
  if (/Mobi|iPhone|Android/i.test(ua)) return 'phone';
  if (touch && /Macintosh/i.test(ua)) return 'tablet'; // iPadOS reports a Mac
  if (touch && window.innerWidth < 768) return 'phone';
  return 'laptop';
}

export function syncPill(sync, { compact = false } = {}) {
  const device = deviceType();
  if (!sync.online) {
    return html`<span class="sync sync-off"${compact ? raw(' style="align-self: flex-start"') : ''}>${ic('offline', 'i', 'sm')}Saved on this ${device}, will send when online</span>`;
  }
  if (sync.waiting) {
    return html`<span class="sync"${compact ? raw(' style="align-self: flex-start"') : ''}>${ic('saved', 'i', 'sm')}Saved on this ${device}, will send when online</span>`;
  }
  // Green when everything has been sent (CLAUDE.md); the OK status icon is drawn in the OK green.
  return html`<span class="sync sync-sent"${compact ? raw(' style="align-self: flex-start"') : ''}>${ic('ok', 's', 'sm')}Sent. Last sync ${formatTime(sync.lastSync)}</span>`;
}

// ---------- header ----------
// place: { name, type } or { label } for roles without one facility. nav: [{ href, label, on }].
export function header(ctx, { place = null, sync = true, dataAsOf = null } = {}) {
  const { user, db } = ctx;
  const ini = initials(user, db.stores);
  const store = user.storeId ? db.store(user.storeId) : null;
  const roleLine = user.kind === 'management'
    ? html`<span class="small muted">View only</span>`
    : !user.name && store
      ? html`<span class="small muted">${store.label}</span>`
      : html`<span class="small muted caps">${user.role}</span>`;
  const title = user.name || user.role;
  const p = place || (store ? { name: store.name, type: store.siteType } : null);
  return html`<header class="hdr">
<a class="brand brand-link" href="${HOME[user.kind]}" aria-label="Taimaka Stock Management, go to your home screen"><img class="logo" src="Assets/taimaka-logo.svg" alt="Taimaka"><span class="brand-div" aria-hidden="true"></span><span class="brand-name">Stock Management</span></a>
${p ? html`<div class="place-box">${p.icon === false ? '' : ic('store')}<span class="col" style="gap: 0"><span class="pb-name">${p.name || p.label}</span>${p.type ? html`<span class="pb-type">${p.type}</span>` : ''}</span></div>` : ''}
${tabsNav(ctx)}
<div class="grow"></div>
${dataAsOf ? html`<span class="sync">${ic('history', 'i', 'sm')}Data as of ${dataAsOf}</span>` : sync ? html`<span data-slot="sync">${syncPill(ctx.sync)}</span>` : ''}
<div class="who"><span class="avatar" aria-hidden="true">${ini ?? ic('eye')}</span><span class="col" style="gap: 0"><span class="b caps">${title}</span>${roleLine}</span></div>
${btn({ label: 'Sign out', icon: 'logout', kind: 'ghost', size: 'sm', act: 'signout' })}
</header>`;
}

// ---------- shipment step tracker ----------
const STEPS = [['requested', 'Requested'], ['approved', 'Approved'], ['sent', 'Sent'], ['received', 'Received']];

export function stepTracker(sh, todayDate, { viewer = null, detail = true } = {}) {
  const idx = STEPS.findIndex(([k]) => k === sh.state);
  return html`<ol class="steps">${STEPS.map(([k, label], i) => {
    const done = i <= idx;
    const now = i === idx + 1;
    const st = sh.steps[k];
    let sub = '';
    if (detail && st) {
      const t = k === 'sent' || k === 'received' ? when(st.at, todayDate, { capital: true }) : formatShortDate(dateOf(st.at));
      sub = k === 'approved' ? `${t} · ${st.byName}` : t;
    } else if (detail && now && viewer && k === 'received' && viewer.kind === 'facility' && viewer.storeId === sh.toStoreId) {
      sub = 'You, now';
    }
    return html`<li class="step${done ? ' step-done' : now ? ' step-now' : ''}"><span class="dot">${done ? ic('tick', 'w') : i + 1}</span><span class="step-t">${label}</span>${sub ? html`<span class="small muted">${sub}</span>` : ''}</li>`;
  })}</ol>`;
}

export const SHIPMENT_TYPE = { monthly: 'monthly', emergency: 'emergency', transfer: 'transfer' };
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function shipmentKind(sh) {
  if (sh.type === 'monthly') return `${MONTHS_FULL[Number(sh.monthKey.slice(5, 7)) - 1]} monthly`;
  if (sh.type === 'emergency') return 'Emergency';
  return 'Transfer between facilities';
}

export function storeShort(store) {
  return store.type === 'CENTRAL' ? 'Central store' : store.name;
}

// Flash messages (success and errors) shown at the top of the main area.
export function flashBanner(ctx) {
  const f = ctx.ui.flash;
  if (!f) return '';
  const kind = f.kind || 'ok';
  return html`<div class="banner bn-${kind} flash" role="${kind === 'ok' ? 'status' : 'alert'}">${ic(kind === 'ok' ? 'tick' : 'bell', 'i', 'lg')}<p class="grow" style="margin: 0">${f.text}</p>${btn({ label: 'Close', icon: 'x', kind: 'ghost', size: 'sm', act: 'dismiss-flash' })}</div>`;
}

export function isPhone() {
  return window.innerWidth < 640;
}

export { esc, html, raw };
