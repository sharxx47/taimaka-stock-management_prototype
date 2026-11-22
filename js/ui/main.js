// App start-up, hash router, event delegation and the sync indicator.
// Each view module exports { views, actions, changes, inputs }.

import { initApp } from '../app-data.js';
import { saveState } from '../storage.js';
import { html, raw } from './dom.js';
import { ic, syncPill, syncIcon, btn, phoneNav, isPhone } from './parts.js';
import { accessRemoved } from '../actions.js';
import * as signin from './views/signin.js';
import * as facility from './views/facility.js';
import * as count from './views/count.js';
import * as logistics from './views/logistics.js';
import * as supervisor from './views/supervisor.js';
import * as history from './views/history.js';
import * as management from './views/management.js';
import * as settings from './views/settings.js';
import { ActionError } from '../actions.js';

const MODULES = [signin, facility, count, logistics, supervisor, history, management, settings];
const VIEWS = Object.assign({}, ...MODULES.map((m) => m.views || {}));
const ACTIONS = Object.assign({}, ...MODULES.map((m) => m.actions || {}));
const CHANGES = Object.assign({}, ...MODULES.map((m) => m.changes || {}));
const INPUTS = Object.assign({}, ...MODULES.map((m) => m.inputs || {}));

import { HOME } from './parts.js';
const root = document.getElementById('root');
let app = null;

// navStack: the screens visited in this app session, for the Back link (empty after a reload or sign-in).
const ui = { flash: null, modal: null, view: {}, lastRoute: null, navStack: [], goingBack: false };
let lastHash = location.hash;

function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = h.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const q = Object.fromEntries(new URLSearchParams(query));
  return { name: parts[0] || '', parts: parts.slice(1), query: q };
}

function currentUser() {
  const id = app.state.session?.userId;
  if (!id) return null;
  try { return app.db.user(id); } catch { return null; }
}

// ---------- sync (no server: the prototype only shows what would be sent) ----------
function syncState() {
  const s = app.state.sync || (app.state.sync = { pending: 0, lastSync: null });
  const user = currentUser();
  const draft = user && user.storeId ? app.db.drafts[user.storeId] : user && user.kind === 'logistics' ? Object.values(app.db.drafts).find((d) => d.kind === 'recount') : null;
  const draftLines = draft ? Object.values(draft.lines).filter((l) => l.qty !== null).length : 0;
  return { online: navigator.onLine !== false, waiting: s.pending > 0 || draftLines > 0, pending: s.pending, lastSync: s.lastSync || defaultLastSync(user) };
}

function defaultLastSync(user) {
  // Before anything is entered in this browser: the user's latest entry in the demo data, else the demo start.
  let last = null;
  if (user && user.kind === 'facility') {
    for (const e of app.db.ledger.all) if (e.stamp && e.stamp.by === user.id && e.ts <= app.db.nowIso && (!last || e.ts > last)) last = e.ts;
    for (const sh of app.db.shipments.values()) for (const st of Object.values(sh.steps)) if (st && st.by === user.id && st.at <= app.db.nowIso && (!last || st.at > last)) last = st.at;
  }
  return last || app.db.nowIso;
}

let sendTimer = null;
function afterChange() {
  const s = app.state.sync || (app.state.sync = { pending: 0, lastSync: null });
  s.pending += 1;
  persist();
  scheduleSend();
}
function scheduleSend() {
  clearTimeout(sendTimer);
  if (navigator.onLine === false) return;
  sendTimer = setTimeout(() => {
    const s = app.state.sync;
    if (s.pending > 0) { s.pending = 0; app.tick(); s.lastSync = app.db.nowIso; persist(); }
    updateSyncSlot();
  }, 1500);
}
function updateSyncSlot() {
  const st = syncState();
  root.querySelectorAll('[data-slot="sync"]').forEach((el) => {
    el.innerHTML = String(el.dataset.compact === 'icon' ? syncIcon(st) : syncPill(st, { compact: el.dataset.compact === '1' }));
  });
}

function persist() {
  app.state.events = app.db.userEvents;
  app.state.drafts = app.db.drafts;
  const ok = saveState(app.state);
  if (!ok && !ui.storageWarned) {
    ui.storageWarned = true;
    ui.flash = { kind: 'low', text: 'This browser will not let the app save. Your entries are kept until you close the page.' };
  }
  return ok;
}

// ---------- context passed to views ----------
function makeCtx(route) {
  app.tick();
  const user = currentUser();
  return {
    app, db: app.db, user, route, ui, sync: syncState(),
    get vs() { return (ui.view[route.name] ||= {}); },
    go, rerender: render, changed: afterChange, persist,
    flash(text, kind = 'ok') { ui.flash = { text, kind }; },
    modal(m) { ui.modal = m; render(); },
    closeModal() { ui.modal = null; render(); },
    signIn(userId) {
      ui.navStack = [];
      app.state.session = { userId };
      // This browser remembers who signed in on it (most recent first, a few at most), for "Welcome back".
      app.state.remembered = [userId, ...(app.state.remembered || []).filter((x) => x !== userId)].slice(0, 5);
      persist();
      go(HOME[app.db.user(userId).kind]);
    },
    signOut() { app.state.session = null; ui.view = {}; ui.modal = null; ui.flash = null; persist(); go('#/signin'); },
    reset() { app.reset(); app.state.session = null; app.state.sync = { pending: 0, lastSync: null }; ui.view = {}; persist(); },
    home: user ? HOME[user.kind] : '#/signin',
  };
}

function go(hash) {
  if (ui.flash) ui.flash.keep = true; // a message set just before moving shows on the next screen
  if (location.hash === hash) render();
  else location.hash = hash;
  window.scrollTo(0, 0);
}

function render() {
  if (!app) return;
  const route = parseRoute();
  let user = currentUser();
  if (user && accessRemoved(app.db, user.id)) {
    // Access removed by logistics takes effect at once, also for someone who is signed in.
    app.state.session = null;
    persist();
    ui.flash = { kind: 'order', text: 'This account no longer has access. Ask your supervisor.', keep: true };
    user = null;
  }
  if (!user && route.name !== 'signin') { location.replace('#/signin'); return; }
  if (route.name === '' || (user && route.name === 'signin')) { location.replace(user ? HOME[user.kind] : '#/signin'); return; }
  const view = VIEWS[route.name];
  const ctx = makeCtx(route);
  let body;
  if (!view || (view.roles && user && !view.roles.includes(user.kind))) {
    body = notAllowed(ctx, !!view);
  } else {
    try {
      body = view.render(ctx, route);
    } catch (err) {
      // A refused screen (for example another facility's page) is a normal answer, not an error.
      if (err instanceof ActionError) body = notAllowed(ctx, true, err.message);
      else { console.error(err); body = errorScreen(ctx, err); }
    }
  }
  if (user && route.name !== 'signin' && location.hash.split('?')[0] !== HOME[user.kind]) {
    // Back: to the previous screen in the app, or to the user's home if this screen was opened directly.
    const back = String(html`<a href="${HOME[user.kind]}" class="btn btn-ghost" data-act="go-back" style="align-self: flex-start; padding-left: 0">${ic('back', 'b')}Back</a>`);
    body = raw(String(body).replace(/(<main class="wrap"[^>]*>)/, `$1${back}`));
  }
  const focus = captureFocus();
  const routeKey = location.hash.split('?')[0];
  // Phones: one bottom bar with the role's tabs (and the facility staff's three actions); the page leaves room for it.
  const bar = user && route.name !== 'signin' && isPhone() ? phoneNav(ctx) : '';
  root.classList.toggle('has-bbar', !!bar);
  root.innerHTML = String(html`${body}${bar}${ui.modal ? html`<div class="app overlay" role="presentation" data-act="modal-bg">${ui.modal.render(ctx)}</div>` : ''}`);
  const routeChanged = ui.lastRoute !== location.hash;
  if (routeChanged) { ui.lastRoute = location.hash; if (route.query.at) scrollToId(route.query.at); }
  restoreFocus(focus);
  stackWrappedActions();
  const af = root.querySelector('[data-autofocus]');
  if (af && !focus && (routeChanged || ui.modal)) { af.focus(); if (route.query.item) af.scrollIntoView({ block: 'center' }); }
  document.title = `${root.querySelector('h1')?.textContent || 'Stock Management'} · Taimaka Stock Management`;
}

// Layout fix: button labels never wrap past two lines. If a phone's bottom actions would, stack them.
function stackWrappedActions() {
  root.querySelectorAll('.ph-actions').forEach((g) => {
    g.classList.remove('stack');
    const tooTall = [...g.querySelectorAll('.btn')].some((b) => {
      const lh = parseFloat(getComputedStyle(b).lineHeight) || 19;
      const pad = parseFloat(getComputedStyle(b).paddingTop) + parseFloat(getComputedStyle(b).paddingBottom) + 4;
      return (b.getBoundingClientRect().height - pad) / lh > 2.2;
    });
    if (tooTall) g.classList.add('stack');
  });
}

function scrollToId(id) {
  requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
}

function captureFocus() {
  const a = document.activeElement;
  if (!a || a === document.body || !a.id) return null;
  return { id: a.id, start: a.selectionStart, end: a.selectionEnd };
}
function restoreFocus(f) {
  if (!f) return;
  const el = document.getElementById(f.id);
  if (!el) return;
  el.focus({ preventScroll: true });
  try { if (f.start !== null && f.start !== undefined) el.setSelectionRange(f.start, f.end); } catch { /* not a text input */ }
}

function notAllowed(ctx, exists, reason = null) {
  return html`<div class="app"><main class="wrap" style="max-width: 720px; padding-top: 40px">
<h1 class="h1">${exists ? 'This screen is not for your role' : 'Page not found'}</h1>
<p class="lead muted">${reason || (exists ? 'Each role sees only the screens it needs.' : 'The link may be old.')}</p>
<a class="btn btn-primary" href="${ctx.home}" style="align-self: flex-start">${ic('back', 'w')}Go to your home screen</a>
</main></div>`;
}

function errorScreen(ctx, err) {
  return html`<div class="app"><main class="wrap" style="max-width: 720px; padding-top: 40px">
<div class="banner bn-order"><p class="grow" style="margin: 0">Something went wrong on this screen. <span class="b">Your saved numbers are safe in this browser.</span></p><a class="btn btn-primary" href="${ctx.home}">${ic('back', 'w')}Go to your home screen</a></div>
<p class="small muted code">${err.message}</p>
</main></div>`;
}

// ---------- events ----------
function handle(map, key, el, ev) {
  const fn = map[key];
  if (!fn) return;
  const ctx = makeCtx(parseRoute());
  try {
    fn(ctx, el, ev);
  } catch (err) {
    if (err instanceof ActionError) {
      ui.flash = { kind: 'order', text: err.message };
      render();
    } else {
      console.error(err);
      ui.flash = { kind: 'order', text: `Something went wrong: ${err.message}` };
      render();
    }
  }
}

root.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || !root.contains(el)) return;
  const act = el.dataset.act;
  if (act === 'modal-bg') { if (ev.target === el) { ui.modal = null; render(); } return; }
  if (el.tagName === 'A') ev.preventDefault();
  handle({ ...ACTIONS, ...BASE_ACTIONS }, act, el, ev);
});
root.addEventListener('change', (ev) => {
  const el = ev.target.closest('[data-change]');
  if (el) handle(CHANGES, el.dataset.change, el, ev);
});
root.addEventListener('input', (ev) => {
  const el = ev.target.closest('[data-input]');
  if (el) handle(INPUTS, el.dataset.input, el, ev);
});
root.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && ui.modal) { ui.modal = null; render(); }
  if (ev.key === 'Enter' && ev.target.id === 'pin') root.querySelector('[data-act="sign-in"]:not([disabled])')?.click();
  if (ev.key === 'Enter' && ev.target.matches('input[data-change]')) {
    // Enter moves to the next box (the change event saves the line).
    ev.preventDefault();
    const list = [...root.querySelectorAll('input[data-change]:not([type=checkbox])')];
    const next = list[list.indexOf(ev.target) + 1];
    if (next) next.focus(); else ev.target.blur();
  }
});
root.addEventListener('submit', (ev) => ev.preventDefault());

const BASE_ACTIONS = {
  signout: (ctx) => ctx.signOut(),
  go: (ctx, el) => ctx.go(el.dataset.href),
  'close-modal': (ctx) => ctx.closeModal(),
  'dismiss-flash': () => { ui.flash = null; render(); },
  'go-back': (ctx) => {
    const prev = ui.navStack.pop();
    if (prev) { ui.goingBack = true; location.hash = prev; window.scrollTo(0, 0); } else ctx.go(ctx.home);
  },
};

window.addEventListener('hashchange', () => {
  const h = location.hash;
  if (ui.goingBack) ui.goingBack = false;
  else if (lastHash && lastHash !== h && !lastHash.startsWith('#/signin')) ui.navStack.push(lastHash);
  if (h.startsWith('#/signin')) ui.navStack = [];
  lastHash = h; for (const v of Object.values(ui.view)) delete v.done; ui.flash = ui.flash && ui.flash.keep ? { ...ui.flash, keep: false } : null; ui.modal = null; render(); });
window.addEventListener('online', () => { scheduleSend(); render(); });
// Add to home screen: the service worker keeps the app's own files so it opens without signal (network first).
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* the app still works without it */ }); });
}
window.addEventListener('offline', () => render());
let wasPhone = window.innerWidth < 640;
window.addEventListener('resize', () => {
  const p = window.innerWidth < 640;
  if (p !== wasPhone) { wasPhone = p; render(); } else stackWrappedActions();
});
setInterval(() => {
  if (!app) return;
  app.tick();
  updateSyncSlot();
  // The sign-in screen counts down a PIN lock: show the PIN boxes again once it has ended.
  if (parseRoute().name === 'signin' && root.querySelector('[data-locked-until]')) {
    const until = Date.parse(root.querySelector('[data-locked-until]').dataset.lockedUntil);
    if (Date.parse(app.db.nowIso) >= until) render();
  }
}, 5000);

// ---------- start ----------
(async function start() {
  root.innerHTML = String(loadingScreen());
  try {
    app = await initApp();
    if (app.dropped.length) console.warn('Saved entries that no longer apply were skipped', app.dropped);
    if (!app.state.sync) app.state.sync = { pending: 0, lastSync: null };
    render();
    scheduleSend();
    // Test hook for the browser checks (switch the signed-in test user without the sign-in screen).
    window.taimakaTest = { signInAs: (id) => { app.state.session = { userId: id }; ui.view = {}; ui.navStack = []; location.hash = HOME[app.db.user(id).kind]; render(); }, app: () => app };
  } catch (err) {
    console.error(err);
    root.innerHTML = String(html`<div class="app"><main class="wrap" style="max-width: 720px; padding-top: 40px">
<h1 class="h1">The app could not start</h1>
<div class="banner bn-order"><p class="grow" style="margin: 0">We could not load the stock data files. ${location.protocol === 'file:' ? raw('Open the app through a local web server (see README), not by double-clicking the file.') : 'Check your internet connection, then try again.'}</p><button class="btn btn-primary" type="button" onclick="location.reload()"><span class="ic w-recount" aria-hidden="true"></span>Try again</button></div>
<p class="small muted code">${err.message}</p></main></div>`);
  }
})();

function loadingScreen() {
  return html`<div class="app"><main class="wrap" style="max-width: 720px; padding-top: 40px">
<div class="row g8"><span class="spinner" aria-hidden="true"></span><span>Loading your stock...</span></div>
${[1, 2, 3].map(() => html`<div class="row g16"><span class="skel skel-pic"></span><div class="col g8 grow"><span class="skel skel-line"></span><span class="skel skel-line-2"></span></div></div>`)}
</main></div>`;
}
