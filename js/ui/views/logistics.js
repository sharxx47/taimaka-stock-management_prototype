// Screen 7: logistics dashboard ("Needs attention today" first, all 31 stores with an item selector and a
// stock-type filter, every item at a store, suggested shipments, shipments in transit, record a recount,
// receive at central store, upload ODK usage). Also the shipment page, the monthly round and transfers.

import { html, raw, joinAnd } from '../dom.js';
import {
  ic, chip, statusChip, pic, btn, linkBtn, backLink, qtyText, header, longDate, when, personRef, stepTracker,
  shipmentKind, storeShort, flashBanner, unitLabel,
} from '../parts.js';
import { navFor, lastsPlain } from './facility.js';
import { formatShortDate, formatTime, dateOf, addDays, MONTH_NAMES } from '../../time.js';
import { formatNumber, formatRutf, formatMonths } from '../../format.js';
import {
  STATUS, storeItems, stockView, today, nextMonth, suggestMonthly, suggestTransfers, sentTooLong, hoursInSent,
  batchesOnHand, onHand, target, topUp, usageInfo, expiryFlags, currentMonth,
} from '../../stock.js';
import { completeMonths, odkAmc } from '../../usage.js';
import { mergeUsage } from '../../db.js';
import { DATA_FILES } from '../../app-data.js';
import { userDisplayName } from '../../users.js';
import { needsAttention, openEmergency } from '../../alerts.js';
import {
  approveShipment, sendShipment, proposeShipment, receiveAtCentral, uploadOdk, createSupplierOrder, addNote, ActionError, STORE_PROBLEMS,
  unlockAccount, receiptDifferences, pinState,
} from '../../actions.js';
import { STOCK_TYPES, CORRECTION_REASONS, AMC_MONTHS } from '../../config.js';

const TYPE_TABS = [{ id: 'all', label: 'All types' }, ...STOCK_TYPES.map((t) => ({ id: t.id, label: t.id === 'consumable' ? 'Consumables' : t.label }))];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function sname(db, id) {
  const s = db.store(id);
  return s.type === 'CENTRAL' ? 'Central store' : s.name;
}
function shortName(db, id) {
  const s = db.store(id);
  return s.type === 'CENTRAL' ? 'Central store' : s.label;
}
const b = (x) => html`<span class="b">${x}</span>`;

function monthsText(v) {
  if (v.status === STATUS.NOT_COUNTED) return html`<span class="muted">Not counted</span>`;
  if (v.onHand !== null && v.onHand <= 0) return '0';
  if (!v.tracked || v.noRecentUse) return 'n/a';
  return Number.isFinite(v.months) ? v.months.toFixed(1) : 'n/a';
}

// ---------- Needs attention ----------

// noAction: show the alert without its button (management is view only).
export function alertBanner(ctx, a, { noAction = false } = {}) {
  const { db, user } = ctx;
  const d = today(db);
  const it = a.itemId ? db.item(a.itemId) : null;
  const pill = chip({ cls: a.pill, icon: a.icon }, a.label);
  const act = a.action;
  let text;
  let button;
  const goBtn = (label, icon, href, kind = 'secondary') => linkBtn({ label, icon, href, kind });
  switch (a.type) {
    case 'OUT': case 'ORDER_NOW': {
      const items = a.items.map((x) => html`<span class="b">${x.name}</span>${a.type === 'ORDER_NOW' ? html` lasts until ${b(formatShortDate(x.lastsUntil))} (${b(`${x.days} days`)}, ${x.months.toFixed(1)} months)` : ''}`);
      const head = a.type === 'OUT' ? (a.items.length > 1 ? html`${b(a.items.length)} items out of stock: ${joinAnd(items)}.` : html`${items[0]} is out of stock.`) : html`${joinAnd(items)}.`;
      const fromFacility = a.request && db.user(a.request.steps.requested.by).kind === 'facility';
      const req = a.request ? html` ${fromFacility ? 'Emergency request sent' : 'Emergency shipment planned'} ${when(a.request.steps.requested.at, d)} by ${personRef(a.request.steps.requested.byName, user)}${a.request.state === 'approved' ? ', approved, not sent yet' : ''}.` : '';
      const way = a.onTheWay ? html` Emergency shipment ${b(a.onTheWay.number)} is on the way, sent ${when(a.onTheWay.steps.sent.at, d)}.` : '';
      text = html`${sname(db, a.storeId)} · ${head}${req}${way}`;
      button = act.shipmentId
        ? goBtn(act.label, act.icon, `#/shipment/${act.shipmentId}`, act.kind || 'primary')
        : btn({ label: act.label, icon: act.icon, kind: 'primary', act: 'plan-emergency', data: { store: a.storeId } });
      break;
    }
    case 'OVERDUE':
      text = html`${b(`Shipment ${a.number}`)} to ${shortName(db, a.storeId)} sent ${b(formatShortDate(dateOf(a.sentAt)))} ${formatTime(a.sentAt)} (${b(`${a.hours} hours`)} ago), not yet received.`;
      button = goBtn(act.label, act.icon, `#/shipment/${a.shipmentId}`);
      break;
    case 'ESCALATION':
      text = html`Repeated differences at ${shortName(db, a.storeId)}, ${a.level === 'management' ? 'sent to management' : html`sent to supervisor ${personRef(a.supervisor, user)}`} on ${b(formatShortDate(a.supervisorSince))}. ${a.level === 'management' ? '' : html`Goes to management on ${b(formatShortDate(a.managementDate))} if it keeps happening.`}`;
      button = goBtn(act.label, act.icon, `#/history/${a.storeId}/${a.itemIds[0]}`);
      break;
    case 'COUNT_DIFF':
      text = html`${sname(db, a.storeId)} · ${b(it.name)}: counted ${b(formatNumber(a.counted))}, expected ${b(formatNumber(a.expected))} (${qtyText(it, a.diff)}).`;
      button = goBtn(act.label, act.icon, `#/recount/${a.storeId}?item=${a.itemId}`);
      break;
    case 'RECEIPT_DIFF': {
      const exp = (iso) => (iso ? `${formatShortDate(iso)} ${iso.slice(0, 4)}` : 'none');
      const parts = a.diffs.map((x) => (x.kind === 'qty'
        ? html`sent ${b(qtyText(it, x.sent))}, received ${b(qtyText(it, x.received))}${x.reason ? ` (${x.reason})` : ''}`
        : x.kind === 'batch'
          ? html`batch entered by logistics ${b(x.sent || 'none')}, confirmed ${b(x.received)}${x.reason ? ` ("${x.reason}")` : ''}`
          : html`expiry entered by logistics ${b(exp(x.sent))}, confirmed ${b(exp(x.received))}${x.reason ? ` ("${x.reason}")` : ''}`));
      text = html`${sname(db, a.storeId)} · ${b(`Shipment ${a.number}`)}, ${b(it.name)}: ${parts.map((x, i) => html`${i ? '; ' : ''}${x}`)}. Received by ${personRef(a.receivedBy, user)}, ${b(when(a.at, d))}.`;
      button = goBtn(act.label, act.icon, `#/shipment/${a.shipmentId}`);
      break;
    }
    case 'UNLOCK': {
      const u = db.user(a.userId);
      const p = pinState(db, a.userId);
      text = html`${b(userDisplayName(u, db.stores))}${u.name ? ` (${u.role}${u.storeId ? `, ${db.store(u.storeId).name}` : ''})` : ''} is locked out after 3 wrong PINs and asked for an unlock at ${b(formatTime(a.at))}. It also unlocks by itself at ${formatTime(p.lockedUntil)}.`;
      button = btn({ label: act.label, icon: act.icon, act: 'unlock-user', data: { user: a.userId } });
      break;
    }
    case 'NOT_COUNTED': {
      const names = a.stores.map((x) => sname(db, x.storeId));
      const lasts = a.stores.map((x) => (x.lastCountAt ? html`${b(formatShortDate(dateOf(x.lastCountAt)))} ${formatTime(x.lastCountAt)}` : 'never'));
      const blanks = a.partial.map((x) => html`${shortName(db, x.storeId)} left ${b(x.itemIds.length)} ${x.itemIds.length === 1 ? 'item' : 'items'} blank${x.itemIds.length <= 3 ? html`: ${joinAnd(x.itemIds.map((i) => b(db.item(i).name)))}` : ''}.`);
      text = html`${names.length ? html`${joinAnd(names)} ${names.length > 1 ? 'have' : 'has'} not sent today's count. Last ${names.length > 1 ? 'counts' : 'count'} ${joinAnd(lasts)}.` : ''}${names.length && blanks.length ? ' ' : ''}${blanks.map((x, i) => html`${i ? ' ' : ''}${x}`)}`;
      button = btn({ label: act.label, icon: act.icon, act: 'remind', data: { stores: a.storeIds.join(','), what: 'today\'s count' } });
      break;
    }
    case 'STORE_PROBLEM': {
      const words = a.problem.problems.map((x) => STORE_PROBLEMS.find((p) => p.id === x)?.label.toLowerCase() || x);
      text = html`${sname(db, a.storeId)} · store reported ${b(joinAnd(words))} by ${personRef(a.problem.byName, user)}, ${b(when(a.problem.at, d))}.${a.problem.note ? ` Note: "${a.problem.note}"` : ''}`;
      button = btn({ label: act.label, icon: act.icon, act: 'note-open', data: { target: a.problem.sessionId, label: `store problem at ${sname(db, a.storeId)}` } });
      break;
    }
    case 'APPROVAL': {
      const reason = CORRECTION_REASONS.find((r) => r.id === a.reason)?.label || a.reason;
      text = html`${sname(db, a.storeId)} · ${b(it.name)} correction ${b(qtyText(it, a.qty))} (${reason}), waiting for ${personRef(a.approver, user)}.`;
      button = btn({ label: act.label, icon: act.icon, act: 'remind', data: { stores: a.storeId, what: `the ${it.name} correction`, approver: a.approver } });
      break;
    }
    case 'CENTRAL_BELOW': {
      const together = a.onHand + a.onOrder;
      text = html`Central store · ${b(it.name)} at ${b(formatMonths(a.monthsInclOrder))}, below its 3-month target of ${qtyText(it, a.target)}. On hand ${qtyText(it, a.onHand)}, on order ${qtyText(it, a.onOrder)}, together ${qtyText(it, together)}.`;
      button = btn({ label: act.label, icon: act.icon, act: 'supplier-order', data: { item: a.itemId } });
      break;
    }
    case 'EXPIRY': {
      const bt = a.batches[0];
      text = html`${sname(db, a.storeId)} · ${b(it.name)} batch ${a.batches.map((x) => x.batch).join(', ')} ${a.expired ? 'has expired' : 'expires'} ${b(formatShortDate(a.expiry))}. About ${b(qtyText(it, Math.round(a.unused / 10) * 10 || a.unused))} will not be used by then.`;
      button = goBtn(act.label, act.icon, `#/transfer?from=${a.storeId}&item=${a.itemId}&qty=${a.unused}&batch=${encodeURIComponent(bt.batch)}`);
      break;
    }
    case 'TRANSFER': {
      const to = stockView(db, a.toStoreId, a.itemId);
      text = html`${sname(db, a.storeId)} has too much ${b(it.name)}. Move ${b(qtyText(it, a.qty))} to ${sname(db, a.toStoreId)} (${to.status.label.toLowerCase()}${to.lastsUntil && !to.lastsMoreThanYear ? `, ${to.days} days left, until ${formatShortDate(to.lastsUntil)}` : ''}).`;
      button = btn({ label: act.label, icon: act.icon, act: 'plan-transfer', data: { from: a.storeId, to: a.toStoreId, item: a.itemId, qty: a.qty } });
      break;
    }
    default:
      text = a.label;
  }
  return html`<div class="banner bn-${a.banner}">${pill}<p class="grow" style="margin: 0">${text}</p>${noAction ? '' : button}</div>`;
}

function needsSection(ctx) {
  const groups = needsAttention(ctx.db);
  if (!groups.length) return html`<div class="banner bn-ok">${chip('OK', 'All OK')}<p class="grow" style="margin: 0">Nothing needs attention today.</p></div>`;
  return html`<section class="col g8 needs" aria-label="Alerts">
${groups.map((g) => html`<h2 class="grp-h">${g.heading}</h2>${g.alerts.map((a) => alertBanner(ctx, a))}`)}
</section>`;
}

// ---------- All stores ----------

function itemsForFilter(db, type) {
  return db.items.filter((it) => type === 'all' || it.type === type);
}

// scope: { storeIds, readOnly, base } for the supervisor's view-only Stores (their facilities only).
function storesTable(ctx, scope = {}) {
  const { db, vs } = ctx;
  const base = scope.base || '#/logistics/stores';
  const d = today(db);
  const type = vs.type || 'all';
  const list = itemsForFilter(db, type);
  const itemId = list.some((x) => x.id === vs.itemId) ? vs.itemId : (list.find((x) => x.isRutf) || list[0])?.id;
  const it = itemId ? db.item(itemId) : null;
  const rows = db.stores.filter((s) => !scope.storeIds || scope.storeIds.includes(s.id)).map((s, i) => {
    const holds = it && db.holds(s.id, it.id);
    const v = holds ? stockView(db, s.id, it.id) : null;
    const rank = s.type === 'CENTRAL' ? -1 : !holds ? 99 : v.sortRank;
    return { s, v, holds, rank, i };
  }).sort((a, z) => a.rank - z.rank || a.i - z.i);
  const shown = vs.allStores ? rows : rows.slice(0, 9);
  const cell = (r) => {
    const { s, v } = r;
    if (!r.holds) return html`<td class="r muted">Not held here</td><td class="r muted">Not held</td><td class="small muted">No status</td>`;
    if (v.status === STATUS.NOT_COUNTED) return html`<td class="r muted">Waiting for today's count</td><td class="r muted">Not shown</td><td>${chip('NOT_COUNTED', null, 'sm')}</td>`;
    if (s.type === 'CENTRAL') {
      // One rule for the central store: its status comes from the stock view, as on every other screen.
      return html`<td class="r">${qtyText(it, v.onHand)}</td><td class="r">${v.months !== null && Number.isFinite(v.months) ? v.months.toFixed(1) : 'n/a'}${v.onOrder ? html` <span class="small muted">incl. ${qtyText(it, v.onOrder)} on order</span>` : ''}</td><td>${statusChip(v, { size: 'sm' })}</td>`;
    }
    return html`<td class="r">${qtyText(it, v.onHand)}</td><td class="r">${monthsText(v)}</td><td><span class="row g8">${v.needsCheck && v.status !== STATUS.OUT ? chip('CHECK', null, 'sm') : ''}${statusChip(v, { size: 'sm', logistics: ctx.user.kind === 'logistics' })}${v.estimated && ctx.user.kind === 'logistics' ? chip('ESTIMATED', null, 'sm') : ''}</span></td>`;
  };
  const updated = (r) => {
    if (!r.holds) {
      const any = storeItems(db, r.s.id).find((v) => v.countedToday) || storeItems(db, r.s.id)[0];
      return any && any.lastUpdated ? when(any.countedAt || any.lastUpdated.at, d, { capital: true }) : '';
    }
    const v = r.v;
    if (r.s.type === 'CENTRAL') return v.lastUpdated ? when(v.lastUpdated.at, d, { capital: true }) : '';
    const c = v.countedToday ? v.countedAt : v.lastCount ? (v.lastCount.submittedAt || v.lastCount.ts) : null;
    return c ? when(c, d, { capital: true }) : 'Never';
  };
  const sel = vs.storeId || (scope.storeIds ? scope.storeIds[0] : 'jigawan_iro');
  return html`<section class="col g16" id="stores" aria-labelledby="st">
<div class="row sp"><h2 class="h2" id="st">${scope.storeIds ? 'Your stores' : 'All stores'}</h2>
<label class="row g8"><span class="label">Item</span><select class="select" id="store-item" data-change="store-item">${list.map((x) => html`<option value="${x.id}"${x.id === itemId ? ' selected' : ''}>${x.name}${x.isRutf ? ' (sachets)' : ''}</option>`)}</select></label></div>
<div class="tabs" role="group" aria-label="Stock type">${TYPE_TABS.map((t) => html`<button type="button" class="tab${type === t.id ? ' tab-on' : ''}" aria-pressed="${type === t.id}" data-act="store-type" data-type="${t.id}">${t.label}</button>`)}</div>
${it ? html`<div class="tbox">
<table class="tbl">
<thead><tr><th>Store</th><th>Type</th><th class="r">${it.name} on hand</th><th class="r">Months of stock</th><th>Status</th><th>Last updated</th></tr></thead>
<tbody>
${shown.map((r) => html`<tr class="click${r.s.id === sel ? ' sel' : ''}" data-act="pick-store" data-store="${r.s.id}"><td class="b"><a class="b" href="${base}?store=${r.s.id}" data-act="pick-store" data-store="${r.s.id}">${r.s.type === 'CENTRAL' ? 'Central store, Gombe' : r.s.name}</a></td><td>${r.s.type === 'CENTRAL' ? 'Central' : r.s.type}</td>${cell(r)}<td class="small muted">${updated(r)}</td></tr>`)}
${vs.allStores || rows.length <= shown.length ? '' : html`<tr><td colspan="6">${btn({ label: `Show ${rows.length - shown.length} more stores`, icon: 'chev', kind: 'ghost', size: 'sm', act: 'all-stores' })}</td></tr>`}
</tbody>
</table>
</div>` : html`<p class="muted">No items of this type yet.</p>`}
</section>`;
}

function storeDetail(ctx, scope = {}) {
  const { db, vs } = ctx;
  const sid = vs.storeId && (!scope.storeIds || scope.storeIds.includes(vs.storeId)) ? vs.storeId : scope.storeIds ? scope.storeIds[0] : 'jigawan_iro';
  const store = db.store(sid);
  const views = storeItems(db, sid).filter((v) => (vs.type || 'all') === 'all' || v.item.type === vs.type);
  const last = views.filter((v) => v.countedToday).map((v) => v.todayCount).sort((a, z) => (a.submittedAt || a.ts).localeCompare(z.submittedAt || z.ts)).at(-1);
  const d = today(db);
  return html`<section class="card col g16" id="detail" aria-labelledby="dt">
<div class="row sp"><h2 class="h3" id="dt">${store.type === 'CENTRAL' ? 'Central store, Gombe' : store.name} · every item today</h2><span class="small muted">${last ? `Counted today ${formatTime(last.submittedAt || last.ts)} by ${last.stamp.byName}` : store.type === 'CENTRAL' ? 'Run by logistics' : 'Not counted today'} · supervisor ${store.supervisor}</span></div>
<div class="row g8">${store.type !== 'CENTRAL' ? html`<a class="btn btn-secondary btn-sm" href="#/facility/${sid}">${ic('eye', 'b')}Open facility view</a>${scope.readOnly ? '' : html`<a class="btn btn-secondary btn-sm" href="#/recount/${sid}">${ic('recount', 'b')}Record a recount</a>`}` : ''}</div>
<div class="tbox">
<table class="tbl">
<thead><tr><th>Item</th><th class="r">On hand</th><th class="r">Months</th><th>Lasts until</th><th>Status</th></tr></thead>
<tbody>
${views.map((v, i) => {
    const nc = v.status === STATUS.NOT_COUNTED;
    const below = v.status === STATUS.OK && v.months !== null && v.months < 2 && store.type !== 'CENTRAL';
    return html`<tr class="click" data-act="go" data-href="#/history/${sid}/${v.item.id}"><td><a class="row g8" href="#/history/${sid}/${v.item.id}" style="color: inherit; text-decoration: none">${pic(v.item, 'sm')}${store.type === 'OTP' ? `${i + 1}. ` : ''}${v.item.name}</a></td>
<td class="r">${nc ? 'Not counted' : qtyText(v.item, v.onHand)}</td><td class="r">${monthsText(v)}</td>
<td>${nc ? (v.lastCount ? `Last counted ${when(v.lastCount.submittedAt || v.lastCount.ts, d)}` : 'Not counted') : v.tracked && !v.noRecentUse && !v.lastsMoreThanYear && v.onHand > 0 ? `${formatShortDate(v.lastsUntil)} (${v.days} days)` : lastsPlain(v)}</td>
<td><span class="row g8">${statusChip(v, { size: 'sm', logistics: ctx.user.kind === 'logistics' })}${v.needsCheck ? chip('CHECK', null, 'sm') : ''}${v.estimated && ctx.user.kind === 'logistics' ? chip('ESTIMATED', null, 'sm') : ''}${below ? html`<span class="small muted">below 2-month target</span>` : ''}${v.target && v.target.explanations.length ? html`<span class="small muted">${v.target.explanations.join('. ')}</span>` : ''}</span></td></tr>`;
  })}
</tbody>
</table>
</div>
</section>`;
}

// ---------- Suggested shipments and shipments in transit ----------

function lineText(db, sh, l) {
  const it = db.item(l.itemId);
  if (l.qtySent !== null && l.qtySent !== undefined) return qtyText(it, l.qtySent);
  if (l.qtyProposed !== null && l.qtyProposed !== undefined) return qtyText(it, l.qtyProposed);
  return 'amount not set';
}

function firstBatch(db, storeId, itemId) {
  const bt = batchesOnHand(db, storeId, itemId)[0];
  return bt && bt.batch ? `batch ${bt.batch} (expires ${formatShortDate(bt.expiry)} ${bt.expiry.slice(0, 4)}) first` : null;
}

function proposalCard(ctx, sh, { readOnly = false } = {}) {
  const { db, user, vs } = ctx;
  const d = today(db);
  const toName = sh.type === 'transfer' ? `${sname(db, sh.fromStoreId)} → ${sname(db, sh.toStoreId)}` : sname(db, sh.toStoreId);
  const pill = sh.type === 'emergency' ? chip('ORDER_NOW', 'Emergency', 'sm') : sh.type === 'transfer' ? chip('TRANSIT', 'Transfer between facilities', 'sm') : html`<span class="tag">${ic('truck', 'i', 'sm')}Monthly</span>`;
  const amounts = (vs.amounts ||= {});
  const byFacility = db.user(sh.steps.requested.by).kind === 'facility';
  const unset = sh.lines.filter((l) => l.qtyProposed === null).length;
  return html`<article class="card col g16">
<div class="row sp"><a class="h3" href="#/shipment/${sh.id}" style="color: inherit">${toName}</a>${pill}</div>
${unset ? html`<span class="b">No usage data for ${unset === 1 ? 'this item' : 'these items'}. Logistics will set the amount.</span>` : ''}
${lowFirst(db, sh.toStoreId, sh.lines).map((l) => {
    const it = db.item(l.itemId);
    const v = stockView(db, sh.toStoreId, l.itemId);
    const key = `${sh.id}|${l.itemId}`;
    if (l.qtyProposed === null && readOnly) {
      return html`<div class="row g8" style="flex-wrap: nowrap">${pic(it, 'sm')}<span class="grow">${it.name} · amount not set yet</span>${statusChip(v, { size: 'sm', logistics: ctx.user.kind === 'logistics' })}</div>`;
    }
    if (l.qtyProposed === null) {
      return html`<div class="row g8" style="flex-wrap: nowrap">${pic(it, 'sm')}<label class="grow" for="amt-${sh.id}-${l.itemId}">${it.name}<span class="small muted"> · amount to send (${it.unit.multiply ? it.unit.one : it.unit.many})</span></label><input class="input" id="amt-${sh.id}-${l.itemId}" value="${amounts[key] ?? ''}" placeholder="Set amount" inputmode="decimal" style="width: 130px" data-change="amount" data-key="${key}"></div>`;
    }
    const t = l.targetFrozen;
    const fb = firstBatch(db, sh.fromStoreId, l.itemId);
    return html`<div class="row g8" style="flex-wrap: nowrap">${pic(it, 'sm')}<span class="grow">${it.name} · <span class="b">${qtyText(it, l.qtyProposed)}</span>${sh.type === 'transfer' ? ' from "Too much" stock' : ''}</span>${statusChip(v, { size: 'sm', logistics: ctx.user.kind === 'logistics' })}</div>
${sh.type !== 'transfer' && t ? html`<span class="small muted">Tops up to its ${v.estimated ? 'estimated ' : ''}2-month target of ${qtyText(it, t)}, less ${qtyText(it, v.onHand ?? 0)} on hand${v.inTransit ? `, less ${qtyText(it, v.inTransit)} on the way` : ''}${fb ? ` · ${fb}` : ''} · <span class="row g4" style="display: inline-flex">${ic('lock', 'i', 'sm')}target locked ${formatShortDate(dateOf(sh.steps.requested.at))} ${formatTime(sh.steps.requested.at)}</span></span>` : ''}`;
  })}
${sh.type === 'transfer' ? html`<span class="small muted">Leaves ${shortName(db, sh.fromStoreId)} when Sent, arrives at ${shortName(db, sh.toStoreId)} when Received</span>` : ''}
${sh.note ? html`<span class="small">Note: "${sh.note}"</span>` : ''}
<span class="small muted">${byFacility ? 'Requested' : 'Planned'} by ${sh.steps.requested.byName} ${when(sh.steps.requested.at, d)}${sh.state === 'approved' ? ` · approved by ${sh.steps.approved.byName} ${when(sh.steps.approved.at, d)}` : ''}</span>
${readOnly ? html`<span class="small muted">${sh.state === 'requested' ? 'Waiting for logistics to approve' : 'Approved, waiting to be sent'}</span>` : html`<div class="row g8">${btn({ label: 'Approve', icon: 'tick', kind: sh.state === 'requested' ? 'primary' : 'secondary', act: 'ship-approve', data: { sh: sh.id }, disabled: sh.state !== 'requested' })}${btn({ label: 'Send', icon: 'truck', kind: sh.state === 'approved' ? 'primary' : 'secondary', act: 'ship-send', data: { sh: sh.id }, disabled: sh.state !== 'approved' })}</div>`}
</article>`;
}

// Running low lines first, then the rest in item order (CLAUDE.md: Running low is logistics' action through the round).
function lowFirst(db, storeId, lines) {
  return lines.map((l, i) => ({ l, i, low: stockView(db, storeId, l.itemId).status === STATUS.LOW ? 0 : 1 })).sort((a, z) => a.low - z.low || a.i - z.i).map((x) => x.l);
}

// Items running low across facilities, from the real data (the monthly round card).
function runningLow(db) {
  const out = [];
  for (const s of db.stores) {
    if (s.type !== 'OTP' && s.type !== 'ITP') continue;
    const n = storeItems(db, s.id).filter((v) => v.status === STATUS.LOW).length;
    if (n) out.push({ storeId: s.id, n });
  }
  return { items: out.reduce((t, x) => t + x.n, 0), facilities: out.length };
}

function monthlyRoundCard(ctx) {
  const { db } = ctx;
  const month = nextMonth(db);
  const proposed = [...db.shipments.values()].filter((s) => s.type === 'monthly' && s.monthKey === month);
  const monthName = MONTH_FULL[Number(month.slice(5, 7)) - 1];
  const waiting = db.stores.filter((s) => (s.type === 'OTP' || s.type === 'ITP') && !storeItems(db, s.id).some((v) => v.countedToday));
  const ready = suggestMonthly(db, month).filter((x) => !waiting.some((w) => w.id === x.toStoreId));
  const count = (st) => proposed.filter((s) => s.state === st).length;
  const low = runningLow(db);
  const lowLine = low.items ? html`<span>${chip('LOW', `${low.items} ${low.items === 1 ? 'item' : 'items'} running low at ${low.facilities} ${low.facilities === 1 ? 'facility' : 'facilities'}`, 'sm')}</span>` : '';
  let body;
  let button;
  if (!proposed.length) {
    body = html`<span>${ready.length} facilities ready${waiting.length ? html`, ${waiting.length} waiting for today's count (${waiting.map((s) => s.label).join(', ')})` : ''}.</span>`;
    button = linkBtn({ label: `Review ${ready.length} shipments`, icon: 'truck', kind: 'primary', href: '#/monthly' });
  } else {
    body = html`<span>${proposed.length} shipments proposed: ${count('requested')} waiting for approval, ${count('approved')} approved, ${count('sent')} sent, ${count('received')} received.</span>`;
    button = count('requested') ? btn({ label: `Approve ${count('requested')} shipments`, icon: 'tick', kind: 'primary', act: 'monthly-approve' })
      : count('approved') ? btn({ label: `Send ${count('approved')} shipments`, icon: 'truck', kind: 'primary', act: 'monthly-send' })
        : linkBtn({ label: 'See the round', icon: 'truck', href: '#/monthly' });
  }
  return html`<article class="card col g16">
<div class="row sp"><span class="h3">${monthName} monthly round</span><span class="tag">${ic('truck', 'i', 'sm')}Monthly</span></div>
${lowLine}
${body}
<span class="small muted">Planned dispatch ${formatShortDate(`${month}-02`)} · targets locked once proposed</span>
<div class="row g8">${button}</div>
</article>`;
}

function suggestedSection(ctx) {
  const { db } = ctx;
  const month = nextMonth(db);
  const open = [...db.shipments.values()].filter((s) => (s.state === 'requested' || s.state === 'approved') && !(s.type === 'monthly' && s.monthKey === month));
  const order = { emergency: 0, transfer: 1, monthly: 2 };
  open.sort((a, z) => order[a.type] - order[z.type] || a.steps.requested.at.localeCompare(z.steps.requested.at));
  const proposedTransfers = new Set(open.filter((s) => s.type === 'transfer').map((s) => `${s.fromStoreId}|${s.toStoreId}|${s.lines[0].itemId}`));
  const transfers = suggestTransfers(db).filter((t) => !proposedTransfers.has(`${t.fromStoreId}|${t.toStoreId}|${t.lines[0].itemId}`));
  return html`<section class="col g16" id="ship" aria-labelledby="sg">
<div class="row sp"><h2 class="h2" id="sg">Suggested shipments</h2><span class="muted">Each tops up to target. Soonest-expiring batch goes first.</span></div>
<div class="two">
${open.map((sh) => proposalCard(ctx, sh))}
${transfers.map((t) => { const it = db.item(t.lines[0].itemId); return html`<article class="card col g16">
<div class="row sp"><span class="h3">${sname(db, t.fromStoreId)} → ${sname(db, t.toStoreId)}</span>${chip('TRANSIT', 'Transfer between facilities', 'sm')}</div>
<div class="row g8" style="flex-wrap: nowrap">${pic(it, 'sm')}<span class="grow">${it.name} · <span class="b">${qtyText(it, t.lines[0].qty)}</span> from "Too much" stock</span></div>
<span class="small muted">Leaves ${shortName(db, t.fromStoreId)} when Sent, arrives at ${shortName(db, t.toStoreId)} when Received</span>
<div class="row g8">${btn({ label: 'Approve', icon: 'tick', kind: 'primary', act: 'plan-transfer', data: { from: t.fromStoreId, to: t.toStoreId, item: it.id, qty: t.lines[0].qty, approve: '1' } })}${btn({ label: 'Send', icon: 'truck', disabled: true })}</div>
</article>`; })}
${monthlyRoundCard(ctx)}
</div>
</section>`;
}

function transitCard(ctx, sh, { readOnly = false } = {}) {
  const { db } = ctx;
  const d = today(db);
  const late = sentTooLong(db, sh);
  return html`<article class="card col g16"${late ? raw(' style="border: 2px solid var(--order-fg)"') : ''}>
<div class="row sp">${readOnly ? html`<span class="b">${sh.number} · ${shipmentKind(sh)} · ${storeShort(db.store(sh.fromStoreId))} → ${sname(db, sh.toStoreId)}</span>` : html`<a class="b" href="#/shipment/${sh.id}" style="color: inherit">${sh.number} · ${shipmentKind(sh)} · ${storeShort(db.store(sh.fromStoreId))} → ${sname(db, sh.toStoreId)}</a>`}${late ? chip('ORDER_NOW', `${hoursInSent(db, sh)} hours in Sent`, 'sm') : html`<span class="small muted">Sent ${hoursInSent(db, sh)} hours ago</span>`}</div>
${stepTracker(sh, d, { detail: false })}
<span class="small muted">${sh.lines.map((l) => `${db.item(l.itemId).name} ${lineText(db, sh, l)}`).join(' · ')}</span>
</article>`;
}

function transitSection(ctx) {
  const { db, vs } = ctx;
  const list = [...db.shipments.values()].filter((s) => s.state === 'sent').sort((a, z) => a.steps.sent.at.localeCompare(z.steps.sent.at));
  const shown = vs.allTransit ? list : list.slice(0, 6);
  return html`<section class="col g16" aria-labelledby="tr">
<h2 class="h2" id="tr">Shipments in transit (${list.length})</h2>
${list.length ? html`<div class="two">${shown.map((sh) => transitCard(ctx, sh))}</div>${list.length > shown.length ? btn({ label: `Show ${list.length - shown.length} more`, icon: 'chev', kind: 'ghost', act: 'all-transit', style: 'align-self: flex-start' }) : ''}`
    : html`<section class="card col g8"><span class="tl-ic">${ic('truck')}</span><span class="h3">No shipments in transit</span><span class="muted">Shipments show here from the moment they are sent until the facility marks them received.</span></section>`}
</section>`;
}

function centralReceiveSection(ctx) {
  const { db, vs } = ctx;
  const f = (vs.central ||= { itemId: 'rutf', qty: '', batch: '', expiry: '', supplier: '' });
  const items = db.itemsForStore('central');
  const po = [...db.purchaseOrders.values()].filter((p) => p.itemId === f.itemId).at(-1);
  const it = db.item(f.itemId);
  return html`<section class="card col g16" id="central" aria-labelledby="rc">
<h2 class="h3" id="rc">Receive at central store</h2>
<p class="muted" style="margin: 0">Stock arriving from a supplier. One line per batch.${po ? ` Open supplier order: ${qtyText(it, po.qty)} from ${po.supplier}, due ${formatShortDate(po.due)}.` : ''}</p>
<div class="inline-form">
<label class="field"><span class="label">Item</span><select class="select" id="rc-item" data-change="rc" data-f="itemId">${items.map((x) => html`<option value="${x.id}"${x.id === f.itemId ? ' selected' : ''}>${x.name}${x.isRutf ? ' (sachets)' : ''}</option>`)}</select></label>
<label class="field"><span class="label">Quantity (${it.unit.multiply ? it.unit.one : it.unit.many})</span><input class="input" id="rc-qty" value="${f.qty}" inputmode="numeric" style="width: 140px" data-change="rc" data-f="qty"></label>
<label class="field"><span class="label">Batch number</span><input class="input" id="rc-batch" value="${f.batch}" placeholder="As printed" style="width: 160px" data-change="rc" data-f="batch"></label>
<label class="field"><span class="label">Expiry date</span><input class="input" id="rc-expiry" value="${f.expiry}" placeholder="DD/MM/YYYY" style="width: 160px" data-change="rc" data-f="expiry"></label>
<label class="field"><span class="label">Supplier</span><input class="input" id="rc-supplier" value="${f.supplier || (po ? po.supplier : '')}" style="width: 200px" data-change="rc" data-f="supplier"></label>
${btn({ label: 'Add to central store', icon: 'receive', kind: 'primary', act: 'rc-add' })}
</div>
${f.qty && it.isRutf && Number(String(f.qty).replace(/,/g, '')) >= 150 ? html`<div class="readback">${formatRutf(Number(String(f.qty).replace(/,/g, '')))}</div>` : ''}
</section>`;
}

// ---------- the dashboard ----------

function renderDashboard(ctx, route) {
  const { db, vs } = ctx;
  const sub = route.parts[0] || 'today';
  if (route.query.store) vs.storeId = route.query.store;
  const up = db.odk.uploads.at(-1);
  const d = today(db);
  return html`<div class="app">
${header(ctx, { nav: navFor(ctx) })}
<main class="wrap">
${flashBanner(ctx)}
<div class="row sp" style="align-items: flex-end">
<div class="col g4"><p class="muted" style="margin: 0">${longDate(d)} · ${db.stores.length} stores</p><h1 class="h1">${sub === 'stores' ? 'All stores' : sub === 'shipments' ? 'Shipments' : 'Needs attention today'}</h1></div>
<div class="row g8">
${btn({ label: 'Upload ODK usage (CSV)', icon: 'upload', act: 'odk-open' })}
${btn({ label: 'Record a recount', icon: 'recount', act: 'recount-open' })}
<a class="btn btn-secondary" href="#/logistics/shipments?at=central">${ic('receive', 'b')}Receive at central store</a>
</div>
</div>
${up ? html`<p class="small muted" style="margin: -12px 0 0">Last ODK upload: ${lastUploadLine(db)}</p>` : ''}
${sub === 'today' ? needsSection(ctx) : ''}
${sub === 'today' || sub === 'stores' ? html`${storesTable(ctx)}${storeDetail(ctx)}` : ''}
${sub === 'today' || sub === 'shipments' ? html`${suggestedSection(ctx)}${transitSection(ctx)}${centralReceiveSection(ctx)}` : ''}
</main>
</div>`;
}

// ---------- shipment page ----------

function renderShipment(ctx, route) {
  const { db, user, vs } = ctx;
  const sh = db.shipments.get(route.parts[0]);
  const d = today(db);
  if (!sh) return html`<div class="app">${header(ctx, { nav: navFor(ctx) })}<main class="wrap"><h1 class="h1">Shipment not found</h1>${backLink('#/logistics', 'Back to today')}</main></div>`;
  const notes = db.notes.filter((n) => n.targetId === sh.id);
  const amounts = (vs.amounts ||= {});
  return html`<div class="app">
${header(ctx, { nav: navFor(ctx) })}
<main class="wrap" style="max-width: 1040px">
${flashBanner(ctx)}
<div class="col g8">
<h1 class="h1">Shipment ${sh.number}</h1>
<p class="lead muted">${shipmentKind(sh)} · ${storeShort(db.store(sh.fromStoreId))} → ${sname(db, sh.toStoreId)}</p>
</div>
<section class="card col g16" aria-label="Shipment progress">
<div class="row sp"><span class="b">Shipment ${sh.number} · ${shipmentKind(sh)}</span>${sh.state === 'sent' ? (sentTooLong(db, sh) ? chip('ORDER_NOW', `${hoursInSent(db, sh)} hours in Sent`) : chip('TRANSIT')) : sh.state === 'received' ? chip('OK', 'Received') : chip('WAIT', sh.state === 'requested' ? 'Waiting for approval' : 'Approved, not sent')}</div>
${stepTracker(sh, d)}
${sh.state === 'sent' ? html`<p class="small muted row g8" style="margin: 0">${ic('lock', 'i', 'sm')}Sent amounts are locked. Only ${sname(db, sh.toStoreId)} can mark this received.</p>` : ''}
</section>
<section class="card col g16" aria-labelledby="ln">
<h2 class="h3" id="ln">What is in it</h2>
<div class="tbox"><table class="tbl">
<thead><tr><th>Item</th><th class="r">Amount</th><th>Batches</th><th>Target</th></tr></thead>
<tbody>${sh.lines.map((l) => {
    const it = db.item(l.itemId);
    const key = `${sh.id}|${l.itemId}`;
    const batches = (sh.state === 'received' ? l.batchesReceived : l.batchesSent) || [];
    const bText = (x) => `${x.batch || 'no batch'}${x.sentBatch !== undefined && x.sentBatch !== x.batch ? ` (logistics entered ${x.sentBatch || 'none'})` : ''}${x.expiry ? ` (expires ${formatShortDate(x.expiry)} ${x.expiry.slice(0, 4)}${x.sentExpiry !== undefined && x.sentExpiry !== x.expiry ? `; logistics entered ${x.sentExpiry ? `${formatShortDate(x.sentExpiry)} ${x.sentExpiry.slice(0, 4)}` : 'none'}` : ''})` : ''}: ${qtyText(it, x.qty)}`;
    const amountCell = l.qtyProposed === null && sh.state === 'requested'
      ? html`<input class="input" id="amt-${sh.id}-${l.itemId}" value="${amounts[key] ?? ''}" placeholder="Set the amount" inputmode="decimal" style="width: 160px" data-change="amount" data-key="${key}" aria-label="Amount of ${it.name} to send">`
      : html`${lineText(db, sh, l)}${sh.state === 'received' && l.qtyReceived !== l.qtySent ? html`<br><span class="small">Received ${qtyText(it, l.qtyReceived)}</span>` : ''}`;
    return html`<tr><td><span class="row g8">${pic(it, 'sm')}${it.name}</span>${l.reason ? html`<br><span class="small muted">${l.reason}</span>` : ''}</td><td class="r">${amountCell}</td><td class="small">${batches.length ? batches.map(bText).join('; ') : sh.state === 'approved' || sh.state === 'requested' ? firstBatch(db, sh.fromStoreId, l.itemId) || 'Picked when sent' : ''}</td><td class="small muted">${l.targetFrozen !== null && l.targetFrozen !== undefined ? html`${qtyText(it, l.targetFrozen)} ${ic('lock', 'i', 'sm')}` : l.note || 'n/a'}</td></tr>`;
  })}</tbody></table></div>
${(() => { const diffs = sh.lines.flatMap((l) => receiptDifferences(sh, l).map((x) => ({ ...x, it: db.item(l.itemId) }))); return diffs.length ? html`<div class="banner bn-low">${chip('CHECK', 'Receipt difference')}<p class="grow" style="margin: 0">Received by ${sh.steps.received.byName}, ${when(sh.steps.received.at, d)}: ${diffs.map((x, i) => html`${i ? '; ' : ''}<span class="b">${x.it.name}</span> ${x.kind === 'qty' ? html`sent <span class="b">${qtyText(x.it, x.sent)}</span>, received <span class="b">${qtyText(x.it, x.received)}</span>${x.reason ? ` (${x.reason})` : ''}` : x.kind === 'batch' ? html`batch: logistics entered <span class="b">${x.sent || 'none'}</span>, confirmed <span class="b">${x.received}</span>${x.reason ? ` ("${x.reason}")` : ''}` : html`expiry: logistics entered <span class="b">${x.sent ? `${formatShortDate(x.sent)} ${x.sent.slice(0, 4)}` : 'none'}</span>, confirmed <span class="b">${formatShortDate(x.received)} ${x.received.slice(0, 4)}</span>${x.reason ? ` ("${x.reason}")` : ''}`}`)}. The stock uses what was confirmed. Add a note when it is sorted out; the alert then clears.</p></div>` : ''; })()}
${sh.note ? html`<p style="margin: 0">Note from ${sh.steps.requested.byName}: "${sh.note}"</p>` : ''}
${notes.map((n) => html`<p class="small" style="margin: 0">${n.stamp.byName}, ${when(n.stamp.at, d)}: "${n.text}"</p>`)}
<div class="row g8">
${sh.state === 'requested' ? btn({ label: 'Approve', icon: 'tick', kind: 'primary', act: 'ship-approve', data: { sh: sh.id } }) : ''}
${sh.state === 'approved' ? btn({ label: 'Send', icon: 'truck', kind: 'primary', act: 'ship-send', data: { sh: sh.id } }) : ''}
${btn({ label: 'Add a note', icon: 'note', act: 'note-open', data: { target: sh.id, label: `shipment ${sh.number}` } })}
</div>
</section>
</main>
</div>`;
}

// ---------- monthly round ----------

function renderMonthly(ctx) {
  const { db } = ctx;
  const month = nextMonth(db);
  const monthName = MONTH_FULL[Number(month.slice(5, 7)) - 1];
  const proposed = [...db.shipments.values()].filter((s) => s.type === 'monthly' && s.monthKey === month);
  const waiting = db.stores.filter((s) => (s.type === 'OTP' || s.type === 'ITP') && !storeItems(db, s.id).some((v) => v.countedToday));
  const list = proposed.length ? proposed.map((s) => ({ toStoreId: s.toStoreId, lines: s.lines.map((l) => ({ itemId: l.itemId, qty: l.qtyProposed, target: l.targetFrozen })), state: s.state, id: s.id }))
    : suggestMonthly(db, month).filter((x) => !waiting.some((w) => w.id === x.toStoreId));
  return html`<div class="app">
${header(ctx, { nav: navFor(ctx) })}
<main class="wrap">
${flashBanner(ctx)}
<div class="col g8"><h1 class="h1">${monthName} monthly round</h1>
<p class="lead muted">Each shipment tops every item up to its 2-month target for ${monthName}, less what is on hand and on the way. Targets lock when you propose.</p></div>
${waiting.length && !proposed.length ? html`<div class="banner bn-nc">${chip('NOT_COUNTED')}<p class="grow" style="margin: 0">Waiting for today's count: ${waiting.map((s) => s.name).join(', ')}. They are left out until they count.</p></div>` : ''}
${(() => { const low = runningLow(db); return low.items ? html`<p style="margin: 0">${chip('LOW', `${low.items} ${low.items === 1 ? 'item' : 'items'} running low at ${low.facilities} ${low.facilities === 1 ? 'facility' : 'facilities'}`, 'sm')} Running low items are listed first in each facility.</p>` : ''; })()}
<div class="col g8">${list.map((x) => {
    const rutf = x.lines.find((l) => l.itemId === 'rutf');
    const est = x.lines.some((l) => l.estimated || (usageInfo(db, x.toStoreId, l.itemId)?.estimated));
    const lines = lowFirst(db, x.toStoreId, x.lines);
    const nLow = lines.filter((l) => stockView(db, x.toStoreId, l.itemId).status === STATUS.LOW).length;
    return html`<details class="card card-tight"${nLow ? raw(' open') : ''}>
<summary class="row sp" style="cursor: pointer"><span class="b">${sname(db, x.toStoreId)}</span><span class="row g8">${nLow ? chip('LOW', `${nLow} running low`, 'sm') : ''}${est && ctx.user.kind === 'logistics' ? chip('ESTIMATED', null, 'sm') : ''}<span class="small muted">${x.lines.length} ${x.lines.length === 1 ? 'item' : 'items'}${rutf ? ` · RUTF ${formatRutf(rutf.qty)}` : ''}${x.state ? ` · ${x.state}` : ''}</span></span></summary>
<div class="tbox" style="margin-top: 12px"><table class="tbl"><thead><tr><th>Item</th><th class="r">To send</th><th>Status now</th></tr></thead><tbody>
${lines.map((l) => { const it = db.item(l.itemId); const v = stockView(db, x.toStoreId, l.itemId); return html`<tr><td><span class="row g8">${pic(it, 'sm')}${it.name}</span></td><td class="r">${qtyText(it, l.qty)}</td><td>${statusChip(v, { size: 'sm', logistics: ctx.user.kind === 'logistics' })}</td></tr>`; })}
</tbody></table></div>
${x.id ? html`<a class="btn btn-ghost btn-sm" href="#/shipment/${x.id}" style="padding-left: 0">${ic('chev', 'b')}Open shipment ${db.shipments.get(x.id).number}</a>` : ''}
</details>`;
  })}</div>
${proposed.length ? '' : btn({ label: `Propose ${list.length} shipments`, icon: 'truck', kind: 'primary', size: 'lg', act: 'monthly-propose', style: 'align-self: flex-start' })}
</main></div>`;
}

// ---------- transfer between facilities ("Move to another facility") ----------

function renderTransfer(ctx, route) {
  const { db, vs } = ctx;
  const q = route.query;
  const from = q.from;
  const it = db.item(q.item);
  const candidates = db.stores.filter((s) => s.id !== from && s.type !== 'CENTRAL' && db.holds(s.id, it.id))
    .map((s) => ({ s, v: stockView(db, s.id, it.id), need: topUp(db, s.id, it.id) }))
    .sort((a, z) => a.v.sortRank - z.v.sortRank || (z.need ?? 0) - (a.need ?? 0));
  const to = vs.to || candidates[0]?.s.id;
  const qty = vs.qty ?? q.qty;
  return html`<div class="app">
${header(ctx, { nav: navFor(ctx) })}
<main class="wrap" style="max-width: 1040px">
${flashBanner(ctx)}
<div class="col g8"><h1 class="h1">Move ${it.name} to another facility</h1>
${(() => { const f = q.batch ? expiryFlags(db, from, it.id).find((x) => x.batch === q.batch) : null; return f ? html`<div class="banner bn-exp">${chip('EXPIRY')}<p class="grow" style="margin: 0">${sname(db, from)} · <span class="b">${it.name}</span> batch ${f.batch} expires <span class="b">${formatShortDate(f.expiry)}</span>. About <span class="b">${qtyText(it, f.unusedAtExpiry)}</span> will not be used by then.</p></div>` : ''; })()}
<p class="lead muted">From ${sname(db, from)}${q.batch ? `, batch ${q.batch}` : ''}. Pick the facility that can use it soonest. Stock leaves ${sname(db, from)} when Sent and arrives when Received.</p></div>
<div class="tbox"><table class="tbl">
<thead><tr><th></th><th>Facility</th><th class="r">On hand</th><th class="r">Months</th><th>Status</th><th class="r">Room up to target</th></tr></thead>
<tbody>${candidates.map((c) => html`<tr class="click${c.s.id === to ? ' sel' : ''}" data-act="transfer-to" data-store="${c.s.id}"><td><input type="radio" name="to" aria-label="${c.s.name}"${c.s.id === to ? ' checked' : ''}></td><td class="b">${c.s.name}</td><td class="r">${c.v.status === STATUS.NOT_COUNTED ? 'Not counted' : qtyText(it, c.v.onHand)}</td><td class="r">${monthsText(c.v)}</td><td>${statusChip(c.v, { size: 'sm', logistics: ctx.user.kind === 'logistics' })}</td><td class="r">${c.need === null ? 'n/a' : qtyText(it, c.need)}</td></tr>`)}</tbody></table></div>
<div class="inline-form">
<label class="field"><span class="label">Amount to move (${it.unit.multiply ? it.unit.one : it.unit.many})</span><input class="input" id="tr-qty" value="${qty}" inputmode="decimal" style="width: 160px" data-change="transfer-qty"></label>
${btn({ label: 'Propose transfer', icon: 'move', kind: 'primary', act: 'transfer-propose', data: { from, item: it.id } })}
</div>
</main></div>`;
}

// ---------- dialogs ----------

// ---------- ODK usage upload (round 4): the last upload first, the format, a preview, then Apply ----------

function monthRange(keys) {
  const ks = [...keys].sort();
  if (!ks.length) return 'no months';
  const name = (k) => MONTH_NAMES[Number(k.slice(5, 7)) - 1];
  const idx = ks.map((k) => Number(k.slice(0, 4)) * 12 + Number(k.slice(5, 7)));
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (contiguous && ks.length > 2) return `${name(ks[0])} to ${name(ks.at(-1))} ${ks.at(-1).slice(0, 4)}`;
  return `${ks.map(name).join(', ')} ${ks.at(-1).slice(0, 4)}`;
}

function agoText(db, iso) {
  const mins = Math.max(0, Math.floor((Date.parse(db.nowIso) - Date.parse(iso)) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
  return `${Math.floor(h / 24)} days ago`;
}

export function lastUploadLine(db) {
  const up = db.odk.uploads.at(-1);
  if (!up) return 'No ODK upload yet';
  const d = today(db);
  return `${when(up.stamp.at, d)} (${agoText(db, up.stamp.at)}) by ${up.stamp.byName} · ${up.fileName} · ${up.siteCount} of ${db.stores.filter((s) => s.type === 'OTP').length} OTPs, ${monthRange(up.months || db.odk.months)}`;
}

// What an upload would change: average use per site and item, before and after (nothing is applied here).
function odkPreview(db, text) {
  const parsed = db.parseOdk(text);
  if (!parsed.ok) return { parsed };
  const cur = currentMonth(db);
  const newUsage = mergeUsage(db.odk.usage, parsed.usage);
  const newMonths = [...new Set([...db.odk.months, ...parsed.months])].sort();
  const usedNow = completeMonths(db.odk.months, cur).slice(-AMC_MONTHS);
  const usedNew = completeMonths(newMonths, cur).slice(-AMC_MONTHS);
  const expected = [];
  for (let m = 1; m < Number(cur.slice(5, 7)); m++) expected.push(`${cur.slice(0, 4)}-${String(m).padStart(2, '0')}`);
  const missingMonths = expected.filter((k) => !parsed.months.includes(k));
  const otps = db.stores.filter((s) => s.type === 'OTP' && s.odkSiteId);
  const sitesMissing = otps.filter((s) => !parsed.usage[s.id]);
  let changedPairs = 0;
  const siteChanges = [];
  for (const s of otps) {
    for (const itemId of new Set([...Object.keys(db.odk.usage[s.id] || {}), ...Object.keys(newUsage[s.id] || {})])) {
      const a = odkAmc(db.odk.usage, s.id, itemId, db.odk.months, cur)?.amc ?? null;
      const b = odkAmc(newUsage, s.id, itemId, newMonths, cur)?.amc ?? null;
      if (a === b || (a !== null && b !== null && Math.abs(a - b) < 0.05)) continue;
      changedPairs++;
      if (itemId === 'rutf') siteChanges.push({ storeId: s.id, from: a, to: b });
    }
  }
  siteChanges.sort((x, z) => Math.abs((z.to ?? 0) - (z.from ?? 0)) - Math.abs((x.to ?? 0) - (x.from ?? 0)));
  return { parsed, missingMonths, sitesMissing, changedPairs, siteChanges, usedNow, usedNew };
}

function odkDialog() {
  return {
    render: (ctx) => {
      const { db } = ctx;
      const st = (ctx.ui.view.logistics ||= {}).odk || {};
      const up = db.odk.uploads.at(-1);
      const cur = currentMonth(db);
      const used = completeMonths(db.odk.months, cur).slice(-AMC_MONTHS);
      const lines = db.odk.bundledText.split(/\r?\n/).filter(Boolean);
      const head = lines[0].split(',');
      const sample = lines.slice(1, 4).map((l) => l.split(','));
      const href = db.odk.source === 'bundled' ? encodeURI(DATA_FILES.odkCsv) : (st.blobUrl ||= URL.createObjectURL(new Blob([db.odk.text], { type: 'text/csv' })));
      const file = db.odk.source === 'bundled' ? DATA_FILES.odkCsv.split('/').pop() : up.fileName;
      const p = st.preview;
      const name = (k) => MONTH_FULL[Number(k.slice(5, 7)) - 1];
      return html`<div class="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="odkh">
<div class="row sp"><h2 class="h3" id="odkh">Upload ODK usage (CSV)</h2>${btn({ label: 'Close', icon: 'x', kind: 'ghost', size: 'sm', act: 'close-modal' })}</div>
<div class="banner bn-info">${ic('upload', 'i', 'lg')}<p class="grow" style="margin: 0"><span class="b">Last upload:</span> ${up ? html`${when(up.stamp.at, today(db), { capital: true })} (${agoText(db, up.stamp.at)}) by <span class="b">${up.stamp.byName}</span>. File <span class="b">${up.fileName}</span>, ${up.siteCount} OTPs, ${up.itemCount} items, ${monthRange(up.months || db.odk.months)}.` : 'none yet.'}</p></div>
${p ? odkPreviewPanel(ctx, st, p) : html`<div class="col g8">
<h3 class="h3">What the file looks like</h3>
<p style="margin: 0">The monthly ODK export, as a CSV file: <span class="b">one row per site and item</span>, sites as ids (such as ${sample[0][0]}), and <span class="b">each month's total use</span> in its own column. The first rows of the current file:</p>
<div class="tbox odk-ex"><table class="tbl"><thead><tr>${head.map((h) => html`<th>${h}</th>`)}</tr></thead><tbody>${sample.map((r) => html`<tr>${r.map((c) => html`<td>${c}</td>`)}</tr>`)}</tbody></table></div>
<p style="margin: 0"><span class="b">Needed:</span> a "site" column, an "item" column and at least one month column (Jan, Feb and so on). <span class="b">Ignored:</span> any other column, such as ${head.filter((h) => !/^(site|item)$/i.test(h) && !MONTH_NAMES.some((m) => m.toLowerCase() === h.toLowerCase())).join(', ') || 'a total'}.</p>
<p style="margin: 0"><span class="b">Average use</span> is the average of the most recent complete months: now <span class="b">${used.map(name).join(' and ')}</span>. ${MONTH_FULL[Number(cur.slice(5, 7)) - 1]} is left out because it is not over yet (a partial month would make the average too low).</p>
<p style="margin: 0">Nothing changes until you have seen what the file will change and pressed Apply. Sites, items or months the file does not have keep their current numbers.</p>
<div class="row g8"><a class="btn btn-secondary" href="${href}" download="${file}">${raw(`<span class="ic b-upload ic-flip" aria-hidden="true"></span>`)}Download the current file</a><span class="small muted">Use it as a template.</span></div>
</div>
<label class="field"><span class="label">Choose the CSV file</span><input type="file" id="odk-file" accept=".csv,text/csv" class="input" style="height: auto; padding: 8px" data-change="odk-file"></label>
${st.reading ? html`<span class="row g8"><span class="spinner" aria-hidden="true"></span>Reading the file...</span>` : ''}
<div class="row g8">${btn({ label: 'Cancel', icon: 'x', act: 'close-modal' })}</div>`}
</div>`;
    },
  };
}

function odkPreviewPanel(ctx, st, p) {
  const { db } = ctx;
  const r = p.parsed;
  const name = (k) => MONTH_FULL[Number(k.slice(5, 7)) - 1];
  if (!r.ok) {
    return html`<div class="banner bn-order" role="alert">${chip('ORDER_NOW', 'Cannot use this file')}<p class="grow" style="margin: 0"><span class="b">${st.fileName}</span>: ${r.errors.join(' ')} Nothing was changed.</p></div>
<div class="row g8">${btn({ label: 'Choose another file', icon: 'upload', act: 'odk-again' })}${btn({ label: 'Cancel', icon: 'x', act: 'close-modal' })}</div>`;
  }
  const probs = r.problems;
  return html`<div class="col g8" aria-live="polite">
<h3 class="h3">What ${st.fileName} will change</h3>
<p style="margin: 0">Found <span class="b">${r.siteCount} ${r.siteCount === 1 ? 'site' : 'sites'}</span>, <span class="b">${r.itemCount} items</span> and <span class="b">${r.months.length} months</span> (${monthRange(r.months)}) in ${r.rowCount} rows.${r.ignored.length ? ` Ignored ${r.ignored.length === 1 ? 'column' : 'columns'}: ${r.ignored.join(', ')}.` : ''}</p>
${p.missingMonths.length ? html`<div class="banner bn-low">${chip('LOW', 'Month missing', 'sm')}<p class="grow" style="margin: 0">${joinAnd(p.missingMonths.map(name))} ${p.missingMonths.length === 1 ? 'is' : 'are'} not in this file. The current numbers for ${p.missingMonths.length === 1 ? 'that month' : 'those months'} stay, so average use still comes from <span class="b">${p.usedNew.map(name).join(' and ')}</span>.</p></div>` : html`<p style="margin: 0">Average use will come from <span class="b">${p.usedNew.map(name).join(' and ')}</span>.</p>`}
${p.sitesMissing.length ? html`<p style="margin: 0">${p.sitesMissing.length} OTP ${p.sitesMissing.length === 1 ? 'site is' : 'sites are'} not in this file (${p.sitesMissing.slice(0, 5).map((s) => s.label).join(', ')}${p.sitesMissing.length > 5 ? ' and more' : ''}); ${p.sitesMissing.length === 1 ? 'it keeps its' : 'they keep their'} current numbers.</p>` : ''}
${probs.length ? html`<div class="banner bn-low">${chip('CHECK', `${probs.length} ${probs.length === 1 ? 'row' : 'rows'} it cannot read`, 'sm')}<p class="grow" style="margin: 0">These rows are skipped; anything they would have changed keeps its current numbers.</p></div>
<div class="tbox"><table class="tbl"><thead><tr><th class="r">Row</th><th>Site</th><th>Item</th><th>Why</th></tr></thead><tbody>${probs.slice(0, 12).map((x) => html`<tr><td class="r">${x.row}</td><td>${x.site}</td><td>${x.item}</td><td>${x.reason}</td></tr>`)}${probs.length > 12 ? html`<tr><td colspan="4" class="muted">and ${probs.length - 12} more rows</td></tr>` : ''}</tbody></table></div>` : html`<p class="row g8" style="margin: 0; color: var(--ok-fg)">${ic('ok', 's', 'sm')}Every row could be read.</p>`}
<h3 class="h3">Average use that would change</h3>
${p.changedPairs ? html`<p style="margin: 0"><span class="b">${p.changedPairs}</span> site and item ${p.changedPairs === 1 ? 'average' : 'averages'} would change. RUTF at the sites that change most:</p>
${p.siteChanges.length ? html`<div class="tbox"><table class="tbl"><thead><tr><th>Site</th><th class="r">RUTF a month now</th><th class="r">After the upload</th><th class="r">Change</th></tr></thead><tbody>${p.siteChanges.slice(0, 5).map((x) => html`<tr><td class="b">${db.store(x.storeId).name}</td><td class="r">${x.from === null ? 'none' : formatNumber(Math.round(x.from))}</td><td class="r">${x.to === null ? 'none' : formatNumber(Math.round(x.to))}</td><td class="r">${x.from !== null && x.to !== null ? `${x.to >= x.from ? '+' : '-'}${formatNumber(Math.round(Math.abs(x.to - x.from)))}` : 'n/a'}</td></tr>`)}</tbody></table></div>` : html`<p class="muted" style="margin: 0">RUTF averages stay the same.</p>`}`
    : html`<p style="margin: 0">No average would change: this file gives the same average use as the current data.</p>`}
<p class="small muted" style="margin: 0">After Apply, statuses, targets and suggested shipments use the new average use.</p>
</div>
<div class="row g8">${btn({ label: 'Apply', icon: 'tick', kind: 'primary', act: 'odk-apply' })}${btn({ label: 'Choose another file', icon: 'upload', act: 'odk-again' })}${btn({ label: 'Cancel', icon: 'x', act: 'close-modal' })}</div>`;
}

function recountDialog(db) {
  const facilities = db.stores.filter((s) => s.type !== 'CENTRAL');
  return {
    render: () => html`<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="rch">
<div class="row sp"><h2 class="h3" id="rch">Record a recount</h2>${btn({ label: 'Close', icon: 'x', kind: 'ghost', size: 'sm', act: 'close-modal' })}</div>
<p class="muted" style="margin: 0">Pick the facility you are visiting. The count screen opens, marked "Recount by logistics".</p>
<label class="field"><span class="label">Facility</span><select class="select" id="recount-store" data-autofocus>${facilities.map((s) => html`<option value="${s.id}">${s.name}</option>`)}</select></label>
<div class="row g8">${btn({ label: 'Start the recount', icon: 'recount', kind: 'primary', act: 'recount-go' })}${btn({ label: 'Cancel', icon: 'x', act: 'close-modal' })}</div>
</div>`,
  };
}

function supplierDialog(db, itemId) {
  const it = db.item(itemId);
  const v = stockView(db, 'central', itemId);
  const suggest = v.target ? Math.max(0, Math.round(v.target.exact - (v.onHand || 0) - v.onOrder)) : '';
  return {
    render: () => html`<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="soh">
<div class="row sp"><h2 class="h3" id="soh">Plan supplier order: ${it.name}</h2>${btn({ label: 'Close', icon: 'x', kind: 'ghost', size: 'sm', act: 'close-modal' })}</div>
<p class="muted" style="margin: 0">Target ${qtyText(it, v.target.qty)} (3 months of network use). On hand ${qtyText(it, v.onHand)}, on order ${qtyText(it, v.onOrder)}. Suggested order: ${qtyText(it, suggest)}.</p>
<label class="field"><span class="label">Quantity (${it.unit.many})</span><input class="input" id="so-qty" value="${suggest}" inputmode="numeric" data-autofocus></label>
<label class="field"><span class="label">Supplier</span><input class="input" id="so-supplier" value=""></label>
<label class="field"><span class="label">Due date</span><input class="input" id="so-due" placeholder="DD/MM/YYYY"></label>
<div class="row g8">${btn({ label: 'Save supplier order', icon: 'tick', kind: 'primary', act: 'so-save', data: { item: itemId } })}${btn({ label: 'Cancel', icon: 'x', act: 'close-modal' })}</div>
</div>`,
  };
}

function parseDmy(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function amountsFor(ctx, sh) {
  const out = {};
  const amounts = ctx.ui.view.logistics?.amounts || {};
  const amounts2 = ctx.ui.view.shipment?.amounts || {};
  for (const l of sh.lines) {
    const raw = amounts2[`${sh.id}|${l.itemId}`] ?? amounts[`${sh.id}|${l.itemId}`];
    if (l.qtyProposed === null && raw !== undefined && raw !== '') out[l.itemId] = Number(String(raw).replace(/,/g, ''));
  }
  return out;
}

// ---------- supervisor: view-only Stores and Shipments for their facilities ----------

function renderSupStores(ctx, route) {
  const { user, vs } = ctx;
  if (route.query.store && user.storeIds.includes(route.query.store)) vs.storeId = route.query.store;
  const scope = { storeIds: user.storeIds, readOnly: true, base: '#/stores' };
  return html`<div class="app">
${header(ctx, { place: { name: 'Your facilities' } })}
<main class="wrap">
${flashBanner(ctx)}
<div class="col g4"><h1 class="h1">Your stores</h1><p class="muted" style="margin: 0">View only. The same table logistics sees, for your ${user.storeIds.length} facilities.</p></div>
${storesTable(ctx, scope)}${storeDetail(ctx, scope)}
</main></div>`;
}

function renderSupShipments(ctx) {
  const { db, user } = ctx;
  const mine = (sh) => user.storeIds.includes(sh.toStoreId) || user.storeIds.includes(sh.fromStoreId);
  const all = [...db.shipments.values()].filter(mine);
  const open = all.filter((s) => s.state === 'requested' || s.state === 'approved').sort((a, z) => a.steps.requested.at.localeCompare(z.steps.requested.at));
  const transit = all.filter((s) => s.state === 'sent').sort((a, z) => a.steps.sent.at.localeCompare(z.steps.sent.at));
  const received = all.filter((s) => s.state === 'received').sort((a, z) => z.steps.received.at.localeCompare(a.steps.received.at)).slice(0, 10);
  const d = today(db);
  return html`<div class="app">
${header(ctx, { place: { name: 'Your facilities' } })}
<main class="wrap">
${flashBanner(ctx)}
<div class="col g4"><h1 class="h1">Shipments</h1><p class="muted" style="margin: 0">View only. Shipments to and from your facilities; logistics approves and sends them.</p></div>
<section class="col g16"><h2 class="h2">Waiting to be sent (${open.length})</h2>
${open.length ? html`<div class="two">${open.map((sh) => proposalCard(ctx, sh, { readOnly: true }))}</div>` : html`<p class="muted" style="margin: 0">No requests or planned shipments for your facilities.</p>`}</section>
<section class="col g16"><h2 class="h2">In transit (${transit.length})</h2>
${transit.length ? html`<div class="two">${transit.map((sh) => transitCard(ctx, sh, { readOnly: true }))}</div>` : html`<p class="muted" style="margin: 0">Nothing on the way to your facilities.</p>`}</section>
<section class="col g16"><h2 class="h2">Received recently</h2>
${received.length ? html`<div class="tbox"><table class="tbl"><thead><tr><th>Shipment</th><th>To</th><th>Received</th><th>What</th></tr></thead><tbody>${received.map((sh) => html`<tr><td class="b">${sh.number} · ${shipmentKind(sh)}</td><td>${sname(db, sh.toStoreId)}</td><td class="small">${when(sh.steps.received.at, d, { capital: true })} by ${sh.steps.received.byName}</td><td class="small">${sh.lines.map((l) => `${db.item(l.itemId).name} ${qtyText(db.item(l.itemId), l.qtyReceived ?? l.qtySent)}`).join(' · ')}</td></tr>`)}</tbody></table></div>` : html`<p class="muted" style="margin: 0">None yet.</p>`}</section>
</main></div>`;
}

export const views = {
  stores: { render: renderSupStores, roles: ['supervisor'] },
  shipments: { render: renderSupShipments, roles: ['supervisor'] },
  logistics: { render: renderDashboard, roles: ['logistics'] },
  shipment: { render: renderShipment, roles: ['logistics'] },
  monthly: { render: renderMonthly, roles: ['logistics'] },
  transfer: { render: renderTransfer, roles: ['logistics'] },
};

export const actions = {
  'store-type': (ctx, el) => { ctx.vs.type = el.dataset.type; ctx.rerender(); },
  'pick-store': (ctx, el) => {
    ctx.vs.storeId = el.dataset.store;
    ctx.rerender();
    document.getElementById('detail')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  },
  'all-stores': (ctx) => { ctx.vs.allStores = true; ctx.rerender(); },
  'all-transit': (ctx) => { ctx.vs.allTransit = true; ctx.rerender(); },
  'odk-open': (ctx) => { (ctx.ui.view.logistics ||= {}).odk = {}; ctx.modal(odkDialog()); },
  'odk-again': (ctx) => { ctx.ui.view.logistics.odk = {}; ctx.rerender(); },
  'odk-apply': (ctx) => {
    const st = ctx.ui.view.logistics.odk;
    const p = st.preview;
    try {
      const up = uploadOdk(ctx.db, ctx.user, st.fileName, st.text);
      ctx.changed();
      ctx.ui.modal = null;
      const top = p.siteChanges[0];
      const big = top && top.from !== null && top.to !== null ? ` Biggest RUTF change: ${ctx.db.store(top.storeId).name}, ${formatNumber(Math.round(top.from))} to ${formatNumber(Math.round(top.to))} sachets a month.` : '';
      ctx.flash(`ODK usage updated from ${st.fileName}: ${up.siteCount} OTPs, ${up.itemCount} items, ${monthRange(up.months)}.${up.skipped ? ` ${up.skipped} ${up.skipped === 1 ? 'row' : 'rows'} skipped.` : ''} ${p.changedPairs} site and item ${p.changedPairs === 1 ? 'average' : 'averages'} changed.${big} Statuses, targets and suggested shipments now use it.`);
    } catch (err) {
      ctx.ui.modal = null;
      ctx.flash(`The file could not be used: ${err.message} Nothing was changed.`, 'order');
    }
    ctx.ui.view.logistics.odk = {};
    ctx.rerender();
  },
  'unlock-user': (ctx, el) => {
    const u = ctx.db.user(el.dataset.user);
    unlockAccount(ctx.db, ctx.user, u.id, 'Asked to unlock');
    ctx.changed();
    ctx.flash(`${userDisplayName(u, ctx.db.stores)} is unlocked and can sign in again.`);
    ctx.rerender();
  },
  'recount-open': (ctx) => ctx.modal(recountDialog(ctx.db)),
  'recount-go': (ctx) => { const id = document.getElementById('recount-store').value; ctx.ui.modal = null; ctx.go(`#/recount/${id}`); },
  'supplier-order': (ctx, el) => ctx.modal(supplierDialog(ctx.db, el.dataset.item)),
  'so-save': (ctx, el) => {
    const due = parseDmy(document.getElementById('so-due').value);
    if (!due) throw new ActionError('Type the due date as DD/MM/YYYY.');
    const po = createSupplierOrder(ctx.db, ctx.user, { itemId: el.dataset.item, qty: document.getElementById('so-qty').value.replace(/,/g, ''), supplier: document.getElementById('so-supplier').value, due });
    ctx.changed();
    ctx.ui.modal = null;
    ctx.flash(`Supplier order saved: ${qtyText(ctx.db.item(po.itemId), po.qty)} from ${po.supplier}, due ${formatShortDate(po.due)}. It counts as stock on order.`);
    ctx.rerender();
  },
  remind: (ctx, el) => {
    const ids = el.dataset.stores.split(',');
    for (const id of ids) addNote(ctx.db, ctx.user, `remind|${id}`, `Reminder sent about ${el.dataset.what}`);
    ctx.changed();
    const who = el.dataset.approver ? el.dataset.approver : joinAnd(ids.map((id) => sname(ctx.db, id))).toString();
    ctx.flash(`Reminder sent to ${who}. (In the prototype the reminder is saved in the history; a real app would send an SMS or a notification.)`);
    ctx.rerender();
  },
  'plan-emergency': (ctx, el) => {
    const storeId = el.dataset.store;
    const existing = openEmergency(ctx.db, storeId);
    if (existing) { ctx.go(`#/shipment/${existing.id}`); return; }
    const views = storeItems(ctx.db, storeId).filter((v) => v.status === STATUS.OUT || v.status === STATUS.ORDER_NOW);
    const lines = views.map((v) => ({ itemId: v.item.id, qty: v.target ? topUp(ctx.db, storeId, v.item.id) : null, note: v.target ? null : 'No usage data for this item. Logistics will set the amount.' }));
    const sh = proposeShipment(ctx.db, ctx.user, { type: 'emergency', fromStoreId: 'central', toStoreId: storeId, lines });
    ctx.changed();
    ctx.flash(`Emergency shipment ${sh.number} planned. Check the amounts, approve, then send.`);
    ctx.go(`#/shipment/${sh.id}`);
  },
  'plan-transfer': (ctx, el) => {
    const sh = proposeShipment(ctx.db, ctx.user, { type: 'transfer', fromStoreId: el.dataset.from, toStoreId: el.dataset.to, lines: [{ itemId: el.dataset.item, qty: Number(el.dataset.qty) }] });
    if (el.dataset.approve) approveShipment(ctx.db, ctx.user, sh.id);
    ctx.changed();
    ctx.flash(`Transfer ${sh.number} ${el.dataset.approve ? 'approved' : 'planned'}: ${qtyText(ctx.db.item(el.dataset.item), Number(el.dataset.qty))} from ${sname(ctx.db, el.dataset.from)} to ${sname(ctx.db, el.dataset.to)}.`);
    ctx.go(`#/shipment/${sh.id}`);
  },
  'ship-approve': (ctx, el) => {
    const sh = ctx.db.shipments.get(el.dataset.sh);
    approveShipment(ctx.db, ctx.user, sh.id, amountsFor(ctx, sh));
    ctx.changed();
    ctx.flash(`Shipment ${sh.number} approved. Send it when it leaves the store.`);
    ctx.rerender();
  },
  'ship-send': (ctx, el) => {
    const sh = ctx.db.shipments.get(el.dataset.sh);
    sendShipment(ctx.db, ctx.user, sh.id);
    ctx.changed();
    ctx.flash(`Shipment ${sh.number} sent. The amounts are locked; ${sname(ctx.db, sh.toStoreId)} marks it received when it arrives.`);
    ctx.rerender();
  },
  'monthly-propose': (ctx) => {
    const { db, user } = ctx;
    const month = nextMonth(db);
    const waiting = db.stores.filter((s) => (s.type === 'OTP' || s.type === 'ITP') && !storeItems(db, s.id).some((v) => v.countedToday)).map((s) => s.id);
    const list = suggestMonthly(db, month).filter((x) => !waiting.includes(x.toStoreId));
    for (const x of list) proposeShipment(db, user, { type: 'monthly', fromStoreId: 'central', toStoreId: x.toStoreId, monthKey: month, lines: x.lines.map((l) => ({ itemId: l.itemId, qty: l.qty })) });
    ctx.changed();
    ctx.flash(`${list.length} monthly shipments proposed. Their targets are locked.`);
    ctx.go('#/logistics/shipments');
  },
  'monthly-approve': (ctx) => {
    const month = nextMonth(ctx.db);
    let n = 0;
    for (const sh of ctx.db.shipments.values()) if (sh.type === 'monthly' && sh.monthKey === month && sh.state === 'requested') { approveShipment(ctx.db, ctx.user, sh.id); n++; }
    ctx.changed();
    ctx.flash(`${n} monthly shipments approved.`);
    ctx.rerender();
  },
  'monthly-send': (ctx) => {
    const month = nextMonth(ctx.db);
    let n = 0;
    for (const sh of ctx.db.shipments.values()) if (sh.type === 'monthly' && sh.monthKey === month && sh.state === 'approved') { sendShipment(ctx.db, ctx.user, sh.id); n++; }
    ctx.changed();
    ctx.flash(`${n} monthly shipments sent.`);
    ctx.rerender();
  },
  'transfer-to': (ctx, el) => { ctx.vs.to = el.dataset.store; ctx.rerender(); },
  'transfer-propose': (ctx, el) => {
    const to = ctx.vs.to || document.querySelector('tr.sel')?.dataset.store;
    const qty = Number(String(document.getElementById('tr-qty').value).replace(/,/g, ''));
    if (!to) throw new ActionError('Pick a facility.');
    if (!(qty > 0)) throw new ActionError('Enter the amount to move.');
    const sh = proposeShipment(ctx.db, ctx.user, { type: 'transfer', fromStoreId: el.dataset.from, toStoreId: to, lines: [{ itemId: el.dataset.item, qty }] });
    ctx.changed();
    ctx.flash(`Transfer ${sh.number} planned. Approve it, then send it.`);
    ctx.go(`#/shipment/${sh.id}`);
  },
  'rc-add': (ctx) => {
    const f = ctx.vs.central;
    const expiry = parseDmy(f.expiry);
    if (!expiry) throw new ActionError('Type the expiry date as DD/MM/YYYY.');
    const po = [...ctx.db.purchaseOrders.values()].filter((p) => p.itemId === f.itemId).at(-1);
    const supplier = f.supplier || (po ? po.supplier : '');
    const qty = String(f.qty).replace(/,/g, '');
    receiveAtCentral(ctx.db, ctx.user, { itemId: f.itemId, qty, batch: f.batch.trim(), expiry, supplier, poId: po ? po.id : null });
    ctx.changed();
    ctx.flash(`Added to the central store: ${qtyText(ctx.db.item(f.itemId), Number(qty))}, batch ${f.batch}, expires ${formatShortDate(expiry)} ${expiry.slice(0, 4)}.`);
    ctx.vs.central = { itemId: f.itemId, qty: '', batch: '', expiry: '', supplier: '' };
    ctx.rerender();
  },
};

export const changes = {
  'odk-file': (ctx, el) => {
    const file = el.files && el.files[0];
    if (!file) return;
    const st = (ctx.ui.view.logistics ||= {}).odk ||= {};
    st.reading = true;
    ctx.rerender();
    file.text().then((text) => {
      Object.assign(st, { reading: false, fileName: file.name, text, preview: odkPreview(ctx.db, text) });
      ctx.rerender();
    });
  },
  'store-item': (ctx, el) => { ctx.vs.itemId = el.value; ctx.rerender(); },
  amount: (ctx, el) => { ctx.vs.amounts ||= {}; ctx.vs.amounts[el.dataset.key] = el.value.trim(); },
  rc: (ctx, el) => { ctx.vs.central[el.dataset.f] = el.value; if (el.dataset.f === 'itemId' || el.dataset.f === 'qty') ctx.rerender(); },
  'transfer-qty': (ctx, el) => { ctx.vs.qty = el.value; },
};
