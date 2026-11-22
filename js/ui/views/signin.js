// Screen 1: test sign-in. Pick a user, type the test PIN shown on screen.

import { html, raw } from '../dom.js';
import { ic, btn, initials, longDate, flashBanner } from '../parts.js';
import { TEST_PIN } from '../../config.js';
import { today } from '../../stock.js';

const FEATURED = ['lto_jigawan_iro', 'pharm_gh_deba', 'sup_hajara_nuhu', 'log_nasiru_bello', 'management'];

function subtitle(db, u) {
  if (u.kind === 'facility') {
    const s = db.store(u.storeId);
    if (u.name) return html`<span class="caps">${u.role}</span> · ${s.name}`;
    return html`${s.name}`;
  }
  if (u.kind === 'supervisor') return html`<span class="caps">${u.role}</span> · ${u.storeIds.map((id) => db.store(id).label).join(', ')}`;
  if (u.kind === 'logistics') return html`<span class="caps">${u.role}</span> · Central store, Gombe`;
  return 'View only';
}

function fullLine(db, u) {
  if (u.kind === 'facility') {
    const s = db.store(u.storeId);
    return u.name ? `${u.name}, ${u.role}, ${s.name}` : `${u.role}, ${s.name}`;
  }
  if (u.kind === 'management') return 'Management (view only)';
  return `${u.name}, ${u.role}`;
}

function card(db, u, selected) {
  const ini = initials(u, db.stores);
  return html`<button class="user-card${selected ? ' user-card-on' : ''}" type="button" data-act="pick-user" data-user="${u.id}" aria-pressed="${selected ? 'true' : 'false'}">
<span class="avatar" aria-hidden="true">${ini ?? ic('eye')}</span>
<span class="col g4 grow"><span class="b caps" style="font-size: 18px">${u.name || u.role}</span><span class="muted">${subtitle(db, u)}</span></span>
${selected ? html`<span class="ic ic-lg b-tick" aria-label="Selected"></span>` : ''}
</button>`;
}

function render(ctx) {
  const { db, vs } = ctx;
  const selId = vs.userId || FEATURED[0];
  const sel = db.user(selId);
  const pin = vs.pin || ['', '', '', ''];
  const full = pin.every((d) => d !== '');
  const groups = [
    ['Lead Triage Officers (OTPs)', db.users.filter((u) => u.role === 'Lead Triage Officer')],
    ['Pharmacy Technicians (ITPs)', db.users.filter((u) => u.role === 'Pharmacy Technician')],
    ['Supervisors', db.users.filter((u) => u.kind === 'supervisor')],
    ['Logistics', db.users.filter((u) => u.kind === 'logistics')],
  ];
  return html`<div class="app">
<header class="hdr">
<div class="brand"><img class="logo" src="Assets/taimaka-logo.svg" alt="Taimaka"><span class="brand-div" aria-hidden="true"></span><span class="brand-name">Stock Management</span></div>
<div class="grow"></div>
<span class="sync">${ic('saved', 'i', 'sm')}Test version</span>
</header>
<main class="wrap" style="max-width: 1080px; padding-top: 40px">
${flashBanner(ctx)}
<div class="col g8">
<h1 class="h1">Welcome. Who is using the app?</h1>
<p class="lead muted">Pick your test user, then type the test PIN shown on the right. You will only see the screens for your role.</p>
</div>
<div class="two">
<section class="card col g16" aria-labelledby="pick">
<h2 class="h3" id="pick">1. Pick your test user</h2>
${FEATURED.map((id) => card(db, db.user(id), id === selId))}
${vs.showAll
    ? groups.map(([label, list]) => html`<h3 class="sec-t" style="margin-top: 8px">${label}</h3>${list.filter((u) => !FEATURED.includes(u.id)).map((u) => card(db, u, u.id === selId))}`)
    : btn({ label: `Show all ${db.users.length} test users`, icon: 'chev', kind: 'ghost', act: 'show-all-users', style: 'align-self: flex-start; padding-left: 0' })}
</section>
<section class="card col g16" aria-labelledby="pinh">
<h2 class="h3" id="pinh">2. Type your test PIN</h2>
<p style="margin: 0">Signing in as <span class="b">${sel.name || sel.role}</span>${fullLine(db, sel).replace(sel.name || sel.role, '')}</p>
<span class="testpin">${ic('lock', 'i', 'sm')}Test PIN for this user: ${TEST_PIN.split('').join(' ')}</span>
<div class="field">
<span class="label" id="pinlbl">PIN</span>
<div class="pin pin-wrap${vs.wrong ? ' pin-wrong' : ''}">${pin.map((d, i) => html`<span class="${i === pin.filter(Boolean).length ? 'pin-now' : ''}" aria-hidden="true">${d ? '•' : ''}</span>`)}<input id="pin" class="pin-input" type="password" inputmode="numeric" autocomplete="one-time-code" maxlength="4" value="${pin.join('')}" aria-labelledby="pinlbl" data-input="pin"${vs.touched ? '' : raw(' data-autofocus')}></div>
</div>
${vs.wrong ? html`<span class="row g8" role="alert" style="color: var(--order-fg)">${ic('x')}That PIN does not match. Check the test PIN shown above.</span>` : ''}
${btn({ label: 'Sign in', icon: 'user', kind: 'primary', size: 'lg', block: true, act: 'sign-in', disabled: !full })}
<p class="small muted" style="margin: 0">The button turns on when all 4 numbers are in.</p>
<hr class="divider">
<div class="row sp">
<span class="small muted">Today: ${longDate(today(db))}</span>
<button type="button" class="link-btn small" data-act="reset-demo">Reset demo data</button>
</div>
</section>
</div>
<div class="banner bn-info">
${ic('history', 'i', 'lg')}
<p class="grow" style="margin: 0">Everything you enter is saved with your name and the time. Your name and role stay at the top of every screen.</p>
</div>
</main>
</div>`;
}

function resetDialog() {
  return html`<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="rdh">
<h2 class="h3" id="rdh">Reset demo data?</h2>
<p style="margin: 0">This removes everything entered in this browser (counts, shipments, corrections, settings) and starts the demo again at 30 Oct 6:05 PM. It cannot be undone.</p>
<div class="row g8">${btn({ label: 'Reset demo data', icon: 'recount', kind: 'danger', act: 'reset-confirm' })}${btn({ label: 'Cancel', icon: 'x', act: 'close-modal' })}</div>
</div>`;
}

export const views = { signin: { render } };

export const actions = {
  'pick-user': (ctx, el) => {
    ctx.vs.userId = el.dataset.user;
    ctx.vs.pin = ['', '', '', ''];
    ctx.vs.wrong = false;
    ctx.vs.touched = true;
    ctx.rerender();
    document.getElementById('pin')?.focus();
  },
  'show-all-users': (ctx) => { ctx.vs.showAll = true; ctx.rerender(); },
  'sign-in': (ctx) => {
    const pin = (ctx.vs.pin || []).join('');
    if (pin !== TEST_PIN) { ctx.vs.wrong = true; ctx.vs.pin = ['', '', '', '']; ctx.rerender(); document.getElementById('pin')?.focus(); return; }
    const id = ctx.vs.userId || FEATURED[0];
    ctx.ui.view = {};
    ctx.signIn(id);
  },
  'reset-demo': (ctx) => ctx.modal({ render: resetDialog }),
  'reset-confirm': (ctx) => {
    ctx.ui.modal = null;
    ctx.reset();
    ctx.flash('Demo data reset. The demo starts again at 30 Oct 6:05 PM.');
    ctx.rerender();
  },
};

export const inputs = {
  pin: (ctx, el) => {
    const v = el.value.replace(/\D/g, '').slice(0, 4);
    el.value = v;
    const pin = [0, 1, 2, 3].map((i) => v[i] || '');
    ctx.vs.pin = pin;
    ctx.vs.wrong = false;
    ctx.vs.touched = true;
    // Update the four boxes in place, so the input keeps focus while typing.
    el.parentElement.querySelectorAll('span').forEach((sp, i) => { sp.textContent = pin[i] ? '•' : ''; sp.className = i === v.length ? 'pin-now' : ''; });
    el.parentElement.classList.remove('pin-wrong');
    const b = document.querySelector('[data-act="sign-in"]');
    if (b) b.disabled = v.length !== 4;
  },
};
