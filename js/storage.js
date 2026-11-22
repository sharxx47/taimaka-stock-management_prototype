// Browser storage. Only what people add is saved (the seed is rebuilt from the CSV copies on load).
// Every storage access is wrapped in try/catch: private windows, full storage or blocked site data
// fall back to memory, and the app still works for the session.

import { STORAGE_KEY, STORAGE_VERSION } from './config.js';
import { SEED_VERSION } from './seed.js';

let memoryFallback = null;
let lastError = null;

function storage() {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    const probe = `${STORAGE_KEY}-probe`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch (err) {
    lastError = err;
    return null;
  }
}

export function freshState(realNowMs = Date.now()) {
  return { version: STORAGE_VERSION, seedVersion: SEED_VERSION, startedAtReal: realNowMs, events: [], drafts: {} };
}

// Returns { state, available, reset }: reset is true when saved data was missing, unreadable or from an older version.
export function loadState() {
  const s = storage();
  if (!s) return { state: memoryFallback || (memoryFallback = freshState()), available: false, reset: !memoryFallback };
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === STORAGE_VERSION && parsed.seedVersion === SEED_VERSION && Array.isArray(parsed.events)) {
        parsed.drafts = parsed.drafts || {};
        return { state: parsed, available: true, reset: false };
      }
    }
  } catch (err) {
    lastError = err;
  }
  const state = freshState();
  saveState(state);
  return { state, available: true, reset: true };
}

// Returns true when saved in the browser, false when only kept in memory.
export function saveState(state) {
  memoryFallback = state;
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    lastError = err;
    return false;
  }
}

// "Reset demo data": forget everything added in this browser and restart the demo clock.
export function resetDemoData() {
  const state = freshState();
  const s = storage();
  if (s) {
    try { s.removeItem(STORAGE_KEY); } catch (err) { lastError = err; }
  }
  saveState(state);
  return state;
}

export function storageError() {
  return lastError;
}
