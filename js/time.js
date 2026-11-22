// Dates and times. All timestamps are ISO strings with the West Africa Time offset (+01:00).
// Date-only values ("2026-10-30") use UTC arithmetic so they never shift with the viewer's time zone.

import { TZ_OFFSET, DEMO_START, DEMO_END } from './config.js';

const OFFSET_MS = 60 * 60 * 1000; // UTC+1
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const MONTH_NAMES = MONTHS;

export function ms(iso) {
  return Date.parse(iso);
}

// "2026-10-30" + "17:40" -> "2026-10-30T17:40:00+01:00"
export function at(date, hhmm) {
  return `${date}T${hhmm.length === 5 ? `${hhmm}:00` : hhmm}${TZ_OFFSET}`;
}

// Epoch ms -> ISO string in West Africa Time.
export function isoFromMs(t) {
  const d = new Date(t + OFFSET_MS);
  return `${d.toISOString().slice(0, 19)}${TZ_OFFSET}`;
}

// Local (WAT) calendar date of a timestamp: "2026-10-30".
export function dateOf(isoOrMs) {
  const t = typeof isoOrMs === 'number' ? isoOrMs : ms(isoOrMs);
  return new Date(t + OFFSET_MS).toISOString().slice(0, 10);
}

export function monthKeyOf(date) {
  return date.slice(0, 7); // "2026-10"
}

export function addDays(date, n) {
  const t = Date.parse(`${date}T00:00:00Z`) + n * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

export function daysBetween(fromDate, toDate) {
  return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / DAY_MS);
}

export function addMonths(monthKey, n) {
  const [y, m] = monthKey.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

export function monthLabel(monthKey) {
  return MONTHS[Number(monthKey.slice(5, 7)) - 1];
}

export function monthIndexOf(monthKey) {
  return Number(monthKey.slice(5, 7)); // 1 to 12
}

// "12 Dec"
export function formatShortDate(date) {
  const [, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

// "5:40 PM"
export function formatTime(iso) {
  const d = new Date(ms(iso) + OFFSET_MS);
  let h = d.getUTCHours();
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}`;
}

// The demo clock: starts at 30 Oct 6:05 PM when the demo data is (re)set, moves with real time,
// and stops at the end of 30 Oct so "today" stays the bin card date.
export function demoNow(startedAtRealMs, realNowMs = Date.now()) {
  const start = ms(DEMO_START);
  const elapsed = Math.max(0, realNowMs - (startedAtRealMs ?? realNowMs));
  return isoFromMs(Math.min(start + elapsed, ms(DEMO_END)));
}
