// Builds the app's data: CSV copies + demo seed + events saved in this browser.
// Works in the browser (fetch) and in Node (the check script passes the file text in).

import { Db } from './db.js';
import { seedDemo } from './seed.js';
import { DEMO_START } from './config.js';
import { demoNow } from './time.js';
import { loadState, saveState, resetDemoData } from './storage.js';

export const DATA_FILES = {
  facilityCsv: 'data/Facility list.csv',
  itpCsv: 'data/ITP item list.csv',
  odkCsv: 'data/ODK OTP usage Jan-Oct 2026.csv',
};

export async function fetchSources(base = '') {
  const out = {};
  for (const [k, path] of Object.entries(DATA_FILES)) {
    const res = await fetch(base + encodeURI(path));
    if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
    out[k] = await res.text();
  }
  return out;
}

// Seed, then replay the saved events in order. An event that no longer applies is dropped and reported.
export function buildDb(sources, state, nowIso = DEMO_START) {
  const db = new Db({ ...sources, nowIso: DEMO_START });
  seedDemo(db);
  db.setNow(nowIso);
  const dropped = [];
  for (const ev of state.events) {
    try { db.apply(ev, 'user'); } catch (err) { dropped.push({ ev, error: err.message }); }
  }
  db.drafts = state.drafts || {};
  return { db, dropped };
}

// Browser start-up.
export async function initApp() {
  const sources = await fetchSources();
  const loaded = loadState();
  const nowIso = demoNow(loaded.state.startedAtReal);
  const { db, dropped } = buildDb(sources, loaded.state, nowIso);
  const app = {
    db,
    state: loaded.state,
    storageAvailable: loaded.available,
    sources,
    dropped,
    tick() { app.db.setNow(demoNow(app.state.startedAtReal)); },
    save() {
      app.state.events = app.db.userEvents;
      app.state.drafts = app.db.drafts;
      return saveState(app.state);
    },
    reset() {
      app.state = resetDemoData();
      const rebuilt = buildDb(sources, app.state, demoNow(app.state.startedAtReal));
      app.db = rebuilt.db;
      return app.db;
    },
  };
  return app;
}
