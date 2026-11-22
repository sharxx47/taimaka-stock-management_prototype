// Screen 10: settings (logistics only). Facilities and "Add a facility", items with their stock type,
// lean-season multiplier by month, target overrides with a reason, and the change log.

import { html, raw } from '../dom.js';
import { ic, chip, pic, btn, header, flashBanner, when, qtyText } from '../parts.js';
import { navFor } from './facility.js';
import { formatShortDate, formatTime, dateOf, MONTH_NAMES } from '../../time.js';
import { formatNumber, rutfReadBack } from '../../format.js';
import { today, usageInfo, target, stockView } from '../../stock.js';
import { addFacility, setItemType, setMultiplier, setTargetOverride, ActionError, pinState, accessRemoved, removeAccess, restoreAccess, unlockAccount } from '../../actions.js';
import { userDisplayName } from '../../users.js';
import { STOCK_TYPES, SACHETS_PER_CARTON } from '../../config.js';

const TABS = [['facilities', 'Facilities'], ['items', 'Items'], ['lean', 'Lean season'], ['targets', 'Target overrides'], ['users', 'Users'], ['log', 'Change log']];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const START_ITEMS = [['tom_brown', 'Tom Brown'], ['amox_60', 'Amoxicillin susp 60ml']];

function facilitiesTab(ctx) {
  const { db, vs } = ctx;
  const all = vs.allFacilities ? db.stores : db.stores.slice(0, 8);
  const f = (vs.add ||= { label: '', type: 'OTP', supervisor: '', linkedItpId: '', sealed: '', loose: '', tom_brown: '', amox_60: '' });
  const supervisors = [...new Set(db.users.filter((u) => u.kind === 'supervisor').map((u) => u.name))];
  const itps = db.stores.filter((s) => s.type === 'ITP');
  const sealed = Number(f.sealed || 0);
  const loose = Number(f.loose || 0);
  return html`<section class="col g16" aria-labelledby="fac">
<div class="row sp"><h2 class="h2" id="fac">Facilities (${db.stores.length})</h2><a class="btn btn-primary" href="#/settings?at=add">${ic('plus', 'w')}Add a facility</a></div>
<div class="tbox"><table class="tbl">
<thead><tr><th>Name</th><th>Type</th><th>Supervisor</th><th>Linked ITP</th><th>Target</th></tr></thead>
<tbody>
${all.map((s) => {
    const est = s.type === 'OTP' && (usageInfo(db, s.id, 'rutf')?.estimated ?? true);
    return html`<tr><td class="b">${s.type === 'CENTRAL' ? 'Central store, Gombe' : s.name}</td><td>${s.type === 'CENTRAL' ? 'Central' : s.type}</td><td>${s.supervisor || 'Not set'}</td><td${s.linkedItpLabel ? '' : raw(' class="muted"')}>${s.linkedItpLabel || 'n/a'}</td><td>${s.type === 'CENTRAL' ? '3 months' : est ? chip('ESTIMATED', null, 'sm') : '2 months'}</td></tr>`;
  })}
${vs.allFacilities ? '' : html`<tr><td colspan="5">${btn({ label: `Show all ${db.stores.length}`, icon: 'chev', kind: 'ghost', size: 'sm', act: 'set-all-fac' })}</td></tr>`}
</tbody></table></div>
</section>
<section class="card col g16" id="add" aria-labelledby="addh">
<h2 class="h3" id="addh">Add a facility</h2>
<div class="inline-form">
<label class="field"><span class="label">Name</span><input class="input" id="af-label" value="${f.label}" placeholder="For example: Kafarati" data-change="af" data-f="label"></label>
<label class="field"><span class="label">Type</span><select class="select" id="af-type" data-change="af" data-f="type"><option value="OTP"${f.type === 'OTP' ? ' selected' : ''}>OTP</option><option value="ITP"${f.type === 'ITP' ? ' selected' : ''}>ITP</option></select></label>
<label class="field"><span class="label">Supervisor</span><select class="select" id="af-sup" data-change="af" data-f="supervisor"><option value="">Pick a supervisor</option>${supervisors.map((n) => html`<option${f.supervisor === n ? ' selected' : ''}>${n}</option>`)}</select></label>
${f.type === 'OTP' ? html`<label class="field"><span class="label">Linked ITP</span><select class="select" id="af-itp" data-change="af" data-f="linkedItpId"><option value="">Pick an ITP</option>${itps.map((s) => html`<option value="${s.id}"${f.linkedItpId === s.id ? ' selected' : ''}>${s.label}</option>`)}</select></label>` : ''}
</div>
${f.type === 'OTP' ? html`<span class="label">Starting stock</span>
<div class="inline-form">
<label class="field"><span class="label">RUTF, sealed cartons</span><input class="input" id="af-sealed" value="${f.sealed}" inputmode="numeric" data-change="af" data-f="sealed"></label>
<label class="field"><span class="label">RUTF, loose sachets</span><input class="input" id="af-loose" value="${f.loose}" inputmode="numeric" data-change="af" data-f="loose"></label>
${START_ITEMS.map(([id, name]) => html`<label class="field"><span class="label">${name}, ${db.item(id).unit.many}</span><input class="input" id="af-${id}" value="${f[id]}" inputmode="numeric" data-change="af" data-f="${id}"></label>`)}
</div>
${f.sealed !== '' || f.loose !== '' ? html`<div class="readback">${rutfReadBack(sealed, loose).text}</div>` : ''}
<span class="small muted">Other items start with no record; the first daily count sets them.</span>` : ''}
<div class="banner bn-wait">${chip('ESTIMATED')}<span class="grow">New facilities use an estimated target until they have 3 months of their own data.</span></div>
<label class="field"><span class="label">Reason</span><input class="input" id="af-reason" value="${f.reason || ''}" placeholder="For example: new site opened" data-change="af" data-f="reason"></label>
${btn({ label: 'Save facility', icon: 'tick', kind: 'primary', act: 'af-save', style: 'align-self: flex-start' })}
</section>`;
}

function itemsTab(ctx) {
  const { db } = ctx;
  const tracked = (it) => !!it.odkName || (it.heldAtItp && !it.heldAtOtp) || (it.heldAtItp && it.itpName);
  return html`<section class="col g16" aria-labelledby="its">
<h2 class="h2" id="its">Items (${db.items.length})</h2>
<p class="muted" style="margin: 0">One name per item, in bin card order, then the ITP item list. Items marked "assumed" have a unit or stock type to confirm with Taimaka.</p>
<div class="tbox"><table class="tbl">
<thead><tr><th>Item</th><th>Unit</th><th>Stock type</th><th>Usage tracked</th><th>Also known as</th></tr></thead>
<tbody>${db.items.map((it) => html`<tr><td><span class="row g8">${pic(it, 'sm')}<span class="b">${it.name}</span></span></td><td>${it.isRutf ? 'sachets (150 per carton)' : it.unit.multiply ? it.unit.one : it.unit.many}${/Assumption|neither/i.test(it.unitSource || '') ? html` <span class="small muted">(assumed)</span>` : ''}</td>
<td><select class="select" aria-label="Stock type of ${it.name}" id="type-${it.id}" data-change="item-type" data-item="${it.id}">${STOCK_TYPES.map((t) => html`<option value="${t.id}"${t.id === it.type ? ' selected' : ''}>${t.label}</option>`)}</select>${it.typeAssumed ? html` <span class="small muted">(assumed)</span>` : ''}</td>
<td>${it.odkName ? 'Yes, from ODK' : it.heldAtItp ? 'Yes, from the ITP log' : 'No'}</td><td class="small muted">${it.aliases.filter((a) => a !== it.name).join(', ')}</td></tr>`)}</tbody></table></div>
</section>`;
}

function leanTab(ctx) {
  const { db, vs } = ctx;
  const m = db.settings.multipliers;
  const p = vs.pendingMult;
  return html`<section class="card col g16" aria-labelledby="ls">
<h2 class="h3" id="ls">Lean-season multiplier by month</h2>
<p class="muted" style="margin: 0">Targets are multiplied by this number in each month. 1.0 means no change.</p>
<div class="row g8">${MONTH_NAMES.map((name, i) => html`<label class="field"><span class="label">${name}</span><input class="input${p && p.month === i + 1 ? ' num-focus' : ''}" id="mult-${i + 1}" value="${p && p.month === i + 1 ? p.value : (m[i + 1] ?? 1).toFixed(1)}" inputmode="decimal" style="width: 72px" data-change="mult" data-month="${i + 1}"></label>`)}</div>
${p ? html`<div class="card card-tight col g8">
<span class="label">You changed ${MONTH_FULL[p.month - 1]} from ${(m[p.month] ?? 1).toFixed(1)} to ${Number(p.value).toFixed(1)}. Why?</span>
<input class="input" id="mult-reason" value="${p.reason || ''}" data-input="mult-reason" data-autofocus>
<div class="row g8">${btn({ label: 'Save change', icon: 'tick', kind: 'primary', size: 'sm', act: 'mult-save' })}${btn({ label: 'Cancel', icon: 'x', size: 'sm', act: 'mult-cancel' })}</div>
<span class="small muted">This changes ${MONTH_FULL[p.month - 1]} targets at all ${db.stores.filter((s) => s.type !== 'CENTRAL').length} facilities. Each one will show the reason.</span>
</div>` : ''}
<div class="banner bn-info"><span class="grow">Shown on every affected item, for example: <span class="b">"Target raised: lean-season multiplier ${(m[7] ?? 1)} for July${db.settings.multiplierLog.filter((x) => x.month === 7).at(-1) ? `, changed by ${db.settings.multiplierLog.filter((x) => x.month === 7).at(-1).stamp.byName}` : ''}"</span></span></div>
</section>`;
}

function targetsTab(ctx) {
  const { db, vs } = ctx;
  const f = (vs.ov ||= { storeId: 'jigawan_iro', itemId: 'rutf', qty: '', reason: '' });
  const stores = db.stores;
  const items = db.itemsForStore(f.storeId);
  if (!items.some((i) => i.id === f.itemId)) f.itemId = items[0].id;
  const it = db.item(f.itemId);
  const t = target(db, f.storeId, f.itemId);
  const list = [...db.settings.targetOverrides.entries()];
  return html`<section class="card col g16" aria-labelledby="ovh">
<h2 class="h3" id="ovh">Override a target</h2>
<p class="muted" style="margin: 0">Use this when the usual target is wrong for a site, for example a new site with a fast-growing caseload. Every override is saved with who, when and why, and the item shows the reason.</p>
<div class="inline-form">
<label class="field"><span class="label">Store</span><select class="select" id="ov-store" data-change="ov" data-f="storeId">${stores.map((s) => html`<option value="${s.id}"${s.id === f.storeId ? ' selected' : ''}>${s.type === 'CENTRAL' ? 'Central store, Gombe' : s.name}</option>`)}</select></label>
<label class="field"><span class="label">Item</span><select class="select" id="ov-item" data-change="ov" data-f="itemId">${items.map((x) => html`<option value="${x.id}"${x.id === f.itemId ? ' selected' : ''}>${x.name}</option>`)}</select></label>
<label class="field"><span class="label">New target (${it.unit.multiply ? it.unit.one : it.unit.many})</span><input class="input" id="ov-qty" value="${f.qty}" inputmode="numeric" style="width: 160px" data-change="ov" data-f="qty"></label>
<label class="field"><span class="label">Why?</span><input class="input" id="ov-reason" value="${f.reason}" style="width: 280px" data-change="ov" data-f="reason"></label>
${btn({ label: 'Save override', icon: 'tick', kind: 'primary', act: 'ov-save' })}
</div>
<span class="small muted">Current target: ${t ? qtyText(it, t.qty) : 'none (no usage data)'}${t && t.override ? ' (overridden)' : ''}.</span>
${list.length ? html`<div class="tbox"><table class="tbl"><thead><tr><th>Store</th><th>Item</th><th class="r">Target</th><th>Reason</th><th></th></tr></thead><tbody>${list.map(([k, o]) => { const [sid, iid] = k.split('|'); return html`<tr><td>${db.store(sid).name}</td><td>${db.item(iid).name}</td><td class="r">${qtyText(db.item(iid), o.qty)}</td><td>${o.reason} <span class="small muted">(${o.stamp.byName}, ${formatShortDate(dateOf(o.stamp.at))})</span></td><td>${btn({ label: 'Remove', icon: 'x', kind: 'ghost', size: 'sm', act: 'ov-remove', data: { store: sid, item: iid } })}</td></tr>`; })}</tbody></table></div>` : html`<p class="small muted" style="margin: 0">No overrides yet.</p>`}
</section>`;
}

// Users (round 4): logistics manages the test accounts. The system cannot know by itself that someone has left,
// so removing access is a step someone takes; it works at once and is logged with who, when and why.
function usersTab(ctx) {
  const { db, user, vs } = ctx;
  const q = (vs.uq || '').trim().toLowerCase();
  const place = (u) => (u.kind === 'facility' ? db.store(u.storeId).name : u.kind === 'supervisor' ? u.storeIds.map((id) => db.store(id).label).join(', ') : u.kind === 'logistics' ? 'Central store, Gombe' : 'Whole network, view only');
  const list = db.users.filter((u) => !q || `${u.name || ''} ${u.role} ${place(u)}`.toLowerCase().includes(q));
  const status = (u) => {
    if (accessRemoved(db, u.id)) return chip('OUT', 'Access removed', 'sm');
    const p = pinState(db, u.id);
    if (p.locked) return chip('WAIT', `Locked until ${formatTime(p.lockedUntil)}`, 'sm');
    return chip('OK', 'Active', 'sm');
  };
  const action = (u) => {
    if (accessRemoved(db, u.id)) return btn({ label: 'Restore access', icon: 'recount', size: 'sm', act: 'acc-restore', data: { user: u.id } });
    const p = pinState(db, u.id);
    return html`<span class="row g8">${p.locked ? btn({ label: 'Unlock now', icon: 'lock', size: 'sm', act: 'acc-unlock', data: { user: u.id } }) : ''}${u.id === user.id ? html`<span class="small muted">You</span>` : btn({ label: 'Remove access', icon: 'x', kind: 'ghost', size: 'sm', act: 'acc-remove', data: { user: u.id } })}</span>`;
  };
  return html`<section class="col g16" aria-labelledby="ush">
<div class="col g4"><h2 class="h2" id="ush">Users (${db.users.length})</h2>
<p class="muted" style="margin: 0">Every test user, with their role and facility. "Remove access" works at once: the person cannot sign in and sees "This account no longer has access. Ask your supervisor." In real use, HR's leaver step (or the supervisor) triggers the removal within 24 hours at the latest, and accounts not used for 30 days are flagged for review.</p></div>
<label class="field" style="max-width: 420px"><span class="label">Find a user</span><input class="input" id="u-find" type="search" value="${vs.uq || ''}" placeholder="Name, role or facility" data-input="u-find"></label>
<div class="tbox"><table class="tbl">
<thead><tr><th>Name</th><th>Role</th><th>Facility</th><th>Status</th><th></th></tr></thead>
<tbody>${list.map((u) => html`<tr><td class="b">${u.name || userDisplayName(u, db.stores).split(',')[0]}</td><td>${u.role}</td><td>${place(u)}</td><td>${status(u)}</td><td>${action(u)}</td></tr>`)}</tbody>
</table></div>
${db.accounts.log.length ? html`<h3 class="h3">Access log</h3>
<div class="tbox"><table class="tbl"><thead><tr><th>When</th><th>Who</th><th>Change</th><th>Reason</th></tr></thead>
<tbody>${[...db.accounts.log].reverse().map((r) => html`<tr><td class="small">${formatShortDate(dateOf(r.stamp.at))} ${formatTime(r.stamp.at)}</td><td>${r.stamp.byName}</td><td>${r.text}: ${userDisplayName(db.user(r.userId), db.stores)}</td><td>${r.reason}</td></tr>`)}</tbody></table></div>` : ''}
</section>`;
}

function removeDialog(db, userId) {
  const u = db.user(userId);
  return {
    render: () => html`<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="rah">
<div class="row sp"><h2 class="h3" id="rah">Remove access: ${userDisplayName(u, db.stores)}</h2>${btn({ label: 'Close', icon: 'x', kind: 'ghost', size: 'sm', act: 'close-modal' })}</div>
<p style="margin: 0">From now on this person cannot sign in. Everything they entered stays, with their name. You can restore access later.</p>
<label class="field"><span class="label">Why? (needed)</span><input class="input" id="ra-reason" data-autofocus placeholder="For example: left Taimaka on 30 Oct"></label>
<div class="row g8">${btn({ label: 'Remove access', icon: 'x', kind: 'danger', act: 'acc-remove-confirm', data: { user: userId } })}${btn({ label: 'Cancel', icon: 'back', act: 'close-modal' })}</div>
</div>`,
  };
}

function logTab(ctx) {
  const { db } = ctx;
  const s = db.settings;
  const rows = [
    ...s.multiplierLog.map((x) => ({ stamp: x.stamp, change: `Lean-season multiplier, ${MONTH_FULL[x.month - 1]}: ${Number(x.from).toFixed(1)} → ${Number(x.to).toFixed(1)}`, reason: x.reason })),
    ...s.overrideLog.map((x) => { const [sid, iid] = x.key.split('|'); return { stamp: x.stamp, change: `Target, ${db.item(iid).name} at ${db.store(sid).name}: ${x.qty === null ? 'override removed' : qtyText(db.item(iid), x.qty)}`, reason: x.reason }; }),
    ...s.typeLog.map((x) => ({ stamp: x.stamp, change: `Stock type, ${db.item(x.itemId).name}: ${STOCK_TYPES.find((t) => t.id === x.from)?.label} → ${STOCK_TYPES.find((t) => t.id === x.to)?.label}`, reason: x.reason })),
    ...s.facilityLog.map((x) => ({ stamp: x.stamp, change: x.text, reason: x.reason })),
    ...db.odk.uploads.map((u) => ({ stamp: u.stamp, change: `ODK usage uploaded: ${u.fileName} (${u.siteCount} OTPs, ${u.itemCount} items)`, reason: '' })),
    ...db.accounts.log.map((x) => ({ stamp: x.stamp, change: `${x.text}: ${userDisplayName(db.user(x.userId), db.stores)}`, reason: x.reason })),
  ].sort((a, b) => b.stamp.at.localeCompare(a.stamp.at));
  return html`<section class="col g8" aria-labelledby="lg">
<h2 class="h3" id="lg">Change log</h2>
<div class="tbox"><table class="tbl">
<thead><tr><th>When</th><th>Who</th><th>Change</th><th>Reason</th></tr></thead>
<tbody>${rows.map((r) => html`<tr><td class="small">${formatShortDate(dateOf(r.stamp.at))} ${formatTime(r.stamp.at)}</td><td>${r.stamp.byName}</td><td>${r.change}</td><td>${r.reason}</td></tr>`)}</tbody></table></div>
</section>`;
}

function render(ctx, route) {
  const { vs } = ctx;
  const tab = route.query.at === 'add' ? 'facilities' : (route.query.tab && TABS.some(([id]) => id === route.query.tab) ? route.query.tab : vs.tab || 'facilities');
  return html`<div class="app">
${header(ctx, { nav: navFor(ctx) })}
<main class="wrap">
${flashBanner(ctx)}
<div class="col g4"><h1 class="h1">Settings</h1><p class="muted" style="margin: 0">Only logistics can see this page. Every change is saved with who made it and when.</p></div>
<div class="tabs" role="group" aria-label="Section">${TABS.map(([id, label]) => html`<button type="button" class="tab${tab === id ? ' tab-on' : ''}" aria-pressed="${tab === id}" data-act="set-tab" data-tab="${id}">${label}</button>`)}</div>
${tab === 'facilities' ? facilitiesTab(ctx) : tab === 'items' ? itemsTab(ctx) : tab === 'lean' ? leanTab(ctx) : tab === 'targets' ? targetsTab(ctx) : tab === 'users' ? usersTab(ctx) : logTab(ctx)}
</main>
</div>`;
}

export const views = { settings: { render, roles: ['logistics'] } };

export const actions = {
  'set-tab': (ctx, el) => { ctx.vs.tab = el.dataset.tab; if (location.hash.includes('?')) ctx.go('#/settings'); else ctx.rerender(); },
  'set-all-fac': (ctx) => { ctx.vs.allFacilities = true; ctx.rerender(); },
  'acc-remove': (ctx, el) => ctx.modal(removeDialog(ctx.db, el.dataset.user)),
  'acc-remove-confirm': (ctx, el) => {
    const reason = document.getElementById('ra-reason')?.value || '';
    removeAccess(ctx.db, ctx.user, el.dataset.user, reason);
    ctx.changed();
    ctx.ui.modal = null;
    ctx.flash(`Access removed for ${userDisplayName(ctx.db.user(el.dataset.user), ctx.db.stores)}. They can no longer sign in.`);
    ctx.rerender();
  },
  'acc-restore': (ctx, el) => {
    restoreAccess(ctx.db, ctx.user, el.dataset.user, 'Restored in Settings');
    ctx.changed();
    ctx.flash(`Access restored for ${userDisplayName(ctx.db.user(el.dataset.user), ctx.db.stores)}.`);
    ctx.rerender();
  },
  'acc-unlock': (ctx, el) => {
    unlockAccount(ctx.db, ctx.user, el.dataset.user, 'Unlocked in Settings');
    ctx.changed();
    ctx.flash(`${userDisplayName(ctx.db.user(el.dataset.user), ctx.db.stores)} is unlocked.`);
    ctx.rerender();
  },
  'af-save': (ctx) => {
    const { db, user, vs } = ctx;
    const f = vs.add;
    if (!f.supervisor) throw new ActionError('Pick the supervisor.');
    const startingStock = {};
    if (f.type === 'OTP') {
      if (f.sealed !== '' || f.loose !== '') startingStock.rutf = Number(f.sealed || 0) * SACHETS_PER_CARTON + Number(f.loose || 0);
      for (const [id] of START_ITEMS) if (f[id] !== '') startingStock[id] = Number(f[id]);
    }
    const s = addFacility(db, user, { label: f.label, type: f.type, supervisor: f.supervisor, linkedItpId: f.type === 'OTP' ? f.linkedItpId || null : null, startingStock, reason: f.reason || '' });
    vs.add = null;
    ctx.changed();
    ctx.flash(`${s.name} added. It shows "Estimated target" until it has 3 months of its own data. A test user for it is on the sign-in screen.`);
    ctx.rerender();
  },
  'mult-save': (ctx) => {
    const p = ctx.vs.pendingMult;
    setMultiplier(ctx.db, ctx.user, p.month, p.value, p.reason || '');
    ctx.vs.pendingMult = null;
    ctx.changed();
    ctx.flash(`${MONTH_FULL[p.month - 1]} multiplier saved. Targets for ${MONTH_FULL[p.month - 1]} now show the reason.`);
    ctx.rerender();
  },
  'mult-cancel': (ctx) => { ctx.vs.pendingMult = null; ctx.rerender(); },
  'ov-save': (ctx) => {
    const f = ctx.vs.ov;
    setTargetOverride(ctx.db, ctx.user, f.storeId, f.itemId, f.qty === '' ? null : Number(f.qty.replace(/,/g, '')), f.reason);
    ctx.vs.ov = { storeId: f.storeId, itemId: f.itemId, qty: '', reason: '' };
    ctx.changed();
    ctx.flash('Target override saved. The item shows who set it and why.');
    ctx.rerender();
  },
  'ov-remove': (ctx, el) => {
    setTargetOverride(ctx.db, ctx.user, el.dataset.store, el.dataset.item, null, 'Override removed');
    ctx.changed();
    ctx.flash('Override removed. The usual target applies again.');
    ctx.rerender();
  },
};

export const changes = {
  af: (ctx, el) => { ctx.vs.add[el.dataset.f] = el.value.trim(); if (['type', 'sealed', 'loose'].includes(el.dataset.f)) ctx.rerender(); },
  'item-type': (ctx, el) => {
    setItemType(ctx.db, ctx.user, el.dataset.item, el.value, 'Changed in Settings');
    ctx.changed();
    ctx.flash(`${ctx.db.item(el.dataset.item).name} is now "${STOCK_TYPES.find((t) => t.id === el.value).label}". Alerts sort by the new type.`);
    ctx.rerender();
  },
  mult: (ctx, el) => {
    const v = Number(el.value);
    if (!(v > 0)) throw new ActionError('The multiplier must be a number more than 0, for example 1.3.');
    ctx.vs.pendingMult = { month: Number(el.dataset.month), value: v, reason: '' };
    ctx.rerender();
  },
  ov: (ctx, el) => { ctx.vs.ov[el.dataset.f] = el.value; if (el.dataset.f === 'storeId' || el.dataset.f === 'itemId') ctx.rerender(); },
};

export const inputs = {
  'u-find': (ctx, el) => { ctx.vs.uq = el.value; ctx.rerender(); },
  'mult-reason': (ctx, el) => { ctx.vs.pendingMult.reason = el.value; },
};
