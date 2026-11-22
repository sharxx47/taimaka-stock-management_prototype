// Screen 1: test sign-in. Pick a test user, type the test PIN shown on screen.
// Round 4: quick-pick cards of one height, a search box instead of the full list, "Welcome back" for the people
// who have signed in on this browser, 3 PIN tries then a short lock, "Ask logistics to unlock", removed access.

import { html, raw } from '../dom.js';
import { ic, btn, initials, longDate, flashBanner } from '../parts.js';
import { TEST_PIN, PIN_LOCK_MINUTES, REAL_PIN_LOCK_MINUTES } from '../../config.js';
import { today } from '../../stock.js';
import { formatTime } from '../../time.js';
import { trySignIn, pinState, accessRemoved, requestUnlock } from '../../actions.js';

const FEATURED = ['lto_jigawan_iro', 'pharm_gh_deba', 'sup_hajara_nuhu', 'log_nasiru_bello', 'management'];
const GROUPS = [
  ['Lead Triage Officers', (u) => u.role === 'Lead Triage Officer'],
  ['Pharmacy Technicians', (u) => u.role === 'Pharmacy Technician'],
  ['Supervisors', (u) => u.kind === 'supervisor'],
  ['Logistics', (u) => u.kind === 'logistics'],
  ['Management', (u) => u.kind === 'management'],
];
const PER_GROUP = 6;

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

// Words a test user can be found by: name, role and facility (supervisors: each of their facilities).
function haystack(db, u) {
  const places = u.kind === 'facility' ? [db.store(u.storeId).name] : u.kind === 'supervisor' ? u.storeIds.map((id) => db.store(id).name) : u.kind === 'logistics' ? ['Central store, Gombe'] : ['view only'];
  return [u.name || '', u.role, ...places].join(' ').toLowerCase();
}

function card(db, u, selected) {
  const ini = initials(u, db.stores);
  return html`<button class="user-card${selected ? ' user-card-on' : ''}" type="button" data-act="pick-user" data-user="${u.id}" aria-pressed="${selected ? 'true' : 'false'}">
<span class="avatar" aria-hidden="true">${ini ?? ic('eye')}</span>
<span class="col g4 grow"><span class="b caps" style="font-size: 18px">${u.name || u.role}</span><span class="muted">${subtitle(db, u)}</span></span>
${selected ? html`<span class="ic ic-lg b-tick" aria-label="Selected"></span>` : ''}
</button>`;
}

function remembered(ctx) {
  const { db } = ctx;
  return (ctx.app.state.remembered || []).filter((id) => db.users.some((u) => u.id === id));
}

function findSection(ctx, selId) {
  const { db, vs } = ctx;
  const q = (vs.q || '').trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const matches = words.length ? db.users.filter((u) => words.every((w) => haystack(db, u).includes(w))) : [];
  return html`<label class="field"><span class="label">Find a test user: name, role or facility</span><input class="input" id="find-user" type="search" value="${vs.q || ''}" placeholder="For example: Deba, supervisor or Hajara" autocomplete="off" data-input="find-user"></label>
${words.length ? html`<div class="find-res" aria-live="polite">${matches.length ? GROUPS.map(([label, test]) => {
    const list = matches.filter(test);
    if (!list.length) return '';
    return html`<h3 class="sec-t">${label} (${list.length})</h3><div class="picks">${list.slice(0, PER_GROUP).map((u) => card(db, u, u.id === selId))}</div>${list.length > PER_GROUP ? html`<p class="small muted" style="margin: 0">${list.length - PER_GROUP} more. Type more of the name or facility.</p>` : ''}`;
  }) : html`<p class="muted" style="margin: 0">No test user matches "${vs.q.trim()}". Try a facility name, such as Deba, or a role, such as supervisor.</p>`}</div>` : ''}`;
}

function pinSection(ctx, sel) {
  const { db, vs } = ctx;
  const pin = vs.pin || ['', '', '', ''];
  const full = pin.every((d) => d !== '');
  const removed = accessRemoved(db, sel.id);
  const p = pinState(db, sel.id);
  const head = html`<h2 class="h3" id="pinh">2. Type your test PIN</h2>
<p style="margin: 0">Signing in as <span class="b caps">${sel.name || sel.role}</span>${fullLine(db, sel).replace(sel.name || sel.role, '')}</p>`;
  if (removed) {
    return html`${head}<div class="banner bn-order" role="alert">${ic('lock', 'i', 'lg')}<p class="grow" style="margin: 0"><span class="b">This account no longer has access. Ask your supervisor.</span></p></div>`;
  }
  if (p.locked) {
    return html`${head}<div class="banner bn-order" role="alert" data-locked-until="${p.lockedUntil}">${ic('lock', 'i', 'lg')}<p class="grow" style="margin: 0"><span class="b">Locked after 3 wrong PINs.</span> It unlocks by itself at <span class="b">${formatTime(p.lockedUntil)}</span>, in ${PIN_LOCK_MINUTES} minute. (In the real app the lock would last longer, ${REAL_PIN_LOCK_MINUTES} minutes, to set with Taimaka.)</p></div>
${p.request ? html`<div class="banner bn-ok" role="status">${ic('tick', 'i', 'lg')}<p class="grow" style="margin: 0"><span class="b">Request sent to logistics</span> at ${formatTime(p.request.at)}. Once it is unlocked, you can try again here.</p></div>`
    : html`<p style="margin: 0">Need to sign in now, for an emergency?</p>${btn({ label: 'Ask logistics to unlock', icon: 'bell', kind: 'primary', act: 'ask-unlock', data: { user: sel.id }, style: 'align-self: flex-start' })}`}`;
  }
  const msg = vs.msg && vs.msg.userId === sel.id ? vs.msg : null;
  return html`${head}
<span class="testpin">${ic('lock', 'i', 'sm')}Test PIN for this user: ${TEST_PIN.split('').join(' ')}</span>
<div class="field">
<span class="label" id="pinlbl">PIN</span>
<div class="pin pin-wrap${msg ? ' pin-wrong' : ''}">${pin.map((d, i) => html`<span class="${i === pin.filter(Boolean).length ? 'pin-now' : ''}" aria-hidden="true">${d ? '•' : ''}</span>`)}<input id="pin" class="pin-input" type="password" inputmode="numeric" autocomplete="one-time-code" maxlength="4" value="${pin.join('')}" aria-labelledby="pinlbl" data-input="pin"${vs.touched ? '' : raw(' data-autofocus')}></div>
</div>
${msg ? html`<span class="row g8" role="alert" style="color: var(--order-fg)">${ic('x')}Wrong PIN. ${msg.triesLeft} ${msg.triesLeft === 1 ? 'try' : 'tries'} left.</span>` : ''}
${btn({ label: 'Sign in', icon: 'user', kind: 'primary', size: 'lg', block: true, act: 'sign-in', disabled: !full })}
<p class="small muted" style="margin: 0">The button turns on when all 4 numbers are in. After 3 wrong PINs the account locks for a short time.</p>`;
}

function render(ctx) {
  const { db, vs } = ctx;
  const recent = remembered(ctx);
  const welcome = recent.length > 0 && !vs.other;
  const selId = vs.userId && db.users.some((u) => u.id === vs.userId) ? vs.userId : welcome ? recent[0] : FEATURED[0];
  const sel = db.user(selId);
  const first = db.user(recent[0] || FEATURED[0]);
  return html`<div class="app">
<header class="hdr">
<div class="brand"><img class="logo" src="Assets/taimaka-logo.svg" alt="Taimaka"><span class="brand-div" aria-hidden="true"></span><span class="brand-name">Stock Management</span></div>
<div class="grow"></div>
<span class="sync">${ic('saved', 'i', 'sm')}Test version</span>
</header>
<main class="wrap" style="max-width: 1080px; padding-top: 40px">
${flashBanner(ctx)}
<div class="col g8">
${welcome ? html`<h1 class="h1">Welcome back, <span class="caps">${first.name || first.role}</span></h1>
<p class="lead muted">${subtitle(db, first)}</p>` : html`<h1 class="h1">Welcome. Who is using the app?</h1>
<p class="lead muted">Pick your test user, then type the test PIN shown on the right. You will only see the screens for your role.</p>`}
</div>
<div class="two">
<section class="card col g16" aria-labelledby="pick">
${welcome ? html`<h2 class="h3" id="pick">1. ${recent.length > 1 ? 'Who is signing in?' : 'Is this you?'}</h2>
<p class="small muted" style="margin: 0">${recent.length > 1 ? `The ${recent.length} test users who signed in on this browser, most recent first.` : 'Signed in on this browser before.'}</p>
<div class="picks">${recent.map((id) => card(db, db.user(id), id === selId))}</div>
${btn({ label: 'Use another test user', icon: 'user', kind: 'secondary', act: 'other-user', style: 'align-self: flex-start' })}`
    : html`<h2 class="h3" id="pick">1. Pick your test user</h2>
<div class="picks">${FEATURED.map((id) => card(db, db.user(id), id === selId))}</div>
${findSection(ctx, selId)}
${recent.length ? btn({ label: 'Back to recent users', icon: 'back', kind: 'ghost', act: 'recent-users', style: 'align-self: flex-start; padding-left: 0' }) : ''}`}
</section>
<div class="col g24 signin-right">
<section class="card col g16" aria-labelledby="pinh">
${pinSection(ctx, sel)}
<hr class="divider">
<div class="row sp">
<span class="small muted">Today: ${longDate(today(db))}</span>
<button type="button" class="link-btn small" data-act="reset-demo">Reset demo data</button>
</div>
</section>
<section class="card qr-box" aria-label="Open on a phone">
<img class="qr-img" src="Assets/qr-live-link.svg" width="130" height="130" alt="QR code of the prototype's live link">
<p class="muted" style="margin: 0">Scan with your phone to view the prototype as a mobile web app.</p>
</section>
</div>
</div>
<div class="banner bn-low">
${ic('lock', 'i', 'lg')}
<p class="grow" style="margin: 0">Prototype: test users with a test PIN, and demo data where real data was not provided. In the real app, each person signs in with their own username and PIN, and a device only remembers the people who have signed in on it.</p>
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
<p style="margin: 0">This removes everything entered in this browser (counts, shipments, corrections, settings, the test users remembered here, locks and removed access) and starts the demo again at 30 Oct 6:05 PM. It cannot be undone.</p>
<div class="row g8">${btn({ label: 'Reset demo data', icon: 'recount', kind: 'danger', act: 'reset-confirm' })}${btn({ label: 'Cancel', icon: 'x', act: 'close-modal' })}</div>
</div>`;
}

export const views = { signin: { render } };

function selected(ctx) {
  const recent = remembered(ctx);
  if (ctx.vs.userId) return ctx.vs.userId;
  return recent.length && !ctx.vs.other ? recent[0] : FEATURED[0];
}

export const actions = {
  'pick-user': (ctx, el) => {
    ctx.vs.userId = el.dataset.user;
    ctx.vs.pin = ['', '', '', ''];
    ctx.vs.msg = null;
    ctx.vs.touched = true;
    ctx.rerender();
    document.getElementById('pin')?.focus();
  },
  'other-user': (ctx) => { ctx.vs.other = true; ctx.vs.userId = null; ctx.vs.msg = null; ctx.rerender(); document.getElementById('find-user')?.focus(); },
  'recent-users': (ctx) => { ctx.vs.other = false; ctx.vs.userId = null; ctx.vs.msg = null; ctx.rerender(); },
  'sign-in': (ctx) => {
    const pin = (ctx.vs.pin || []).join('');
    const id = selected(ctx);
    const r = trySignIn(ctx.db, id, pin);
    ctx.persist();
    if (!r.ok) {
      ctx.vs.msg = r.reason === 'wrong' ? { userId: id, triesLeft: r.triesLeft } : null;
      ctx.vs.pin = ['', '', '', ''];
      ctx.rerender();
      document.getElementById('pin')?.focus();
      return;
    }
    ctx.ui.view = {};
    ctx.signIn(id);
  },
  'ask-unlock': (ctx, el) => {
    requestUnlock(ctx.db, el.dataset.user);
    ctx.persist();
    ctx.rerender();
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
    ctx.vs.touched = true;
    // Update the four boxes in place, so the input keeps focus while typing.
    el.parentElement.querySelectorAll('span').forEach((sp, i) => { sp.textContent = pin[i] ? '•' : ''; sp.className = i === v.length ? 'pin-now' : ''; });
    const b = document.querySelector('[data-act="sign-in"]');
    if (b) b.disabled = v.length !== 4;
  },
  'find-user': (ctx, el) => { ctx.vs.q = el.value; ctx.rerender(); },
};
