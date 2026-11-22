// ODK OTP usage: parse the monthly CSV, and work out average monthly use (AMC).
//
// Rule: AMC = average of the most recent complete months (for this data: August and September,
// because October is a partial month). A site with fewer than 3 complete months of data shows
// "Estimated target".

import { parseCsv } from './csv.js';
import { AMC_MONTHS, MIN_MONTHS_FOR_FIRM_TARGET } from './config.js';
import { MONTH_NAMES } from './time.js';

// Parses the ODK file format: site,item,Jan,...,Oct,total_jan_oct
// Returns { ok, errors, warnings, problems, usage: { [siteId]: { [itemId]: { 'YYYY-MM': n } } }, months, siteCount, itemCount, rowCount }.
// errors: the file cannot be used at all (no site or item column, no month column, no row for a known site).
// problems: rows it cannot read, with the row number and the reason in plain words; those rows are skipped.
// Columns other than site, item and the month names (for example total_jan_oct) are ignored.
export function parseOdkCsv(text, { stores, itemIdFor, year, closestSite = null, closestItem = null }) {
  const errors = [];
  const warnings = [];
  const problems = [];
  const rows = parseCsv(text);
  if (rows.length < 2) return { ok: false, errors: ['The file is empty.'], warnings, problems, usage: {}, months: [] };
  const header = rows[0].map((h) => h.trim());
  const siteCol = header.findIndex((h) => h.toLowerCase() === 'site');
  const itemCol = header.findIndex((h) => h.toLowerCase() === 'item');
  if (siteCol < 0 || itemCol < 0) {
    return { ok: false, errors: ['The file needs a "site" column and an "item" column.'], warnings, problems, usage: {}, months: [] };
  }
  const monthCols = [];
  header.forEach((h, i) => {
    const idx = MONTH_NAMES.findIndex((m) => m.toLowerCase() === h.toLowerCase());
    if (idx >= 0) monthCols.push({ col: i, key: `${year}-${String(idx + 1).padStart(2, '0')}` });
  });
  if (!monthCols.length) {
    return { ok: false, errors: ['No month columns (Jan, Feb, ...) found.'], warnings, problems, usage: {}, months: [] };
  }
  const ignored = header.filter((h, i) => i !== siteCol && i !== itemCol && !monthCols.some((m) => m.col === i));

  const siteIds = new Map(stores.filter((s) => s.odkSiteId).map((s) => [s.odkSiteId, s.id]));
  const usage = {};
  rows.slice(1).forEach((r, n) => {
    const row = n + 2; // the header is row 1
    const site = (r[siteCol] || '').trim();
    const itemName = (r[itemCol] || '').trim();
    const storeId = siteIds.get(site);
    const itemId = itemIdFor(itemName);
    if (!storeId) {
      const near = closestSite ? closestSite(site) : null;
      problems.push({ row, site, item: itemName, reason: `Unknown site "${site}"${near ? `. Did you mean ${near}?` : ''}` });
      return;
    }
    if (!itemId) {
      const near = closestItem ? closestItem(itemName) : null;
      problems.push({ row, site, item: itemName, reason: `Unknown item name "${itemName}"${near ? `. Closest known name: ${near}` : ''}` });
      return;
    }
    const byMonth = {};
    const bad = [];
    for (const { col, key } of monthCols) {
      const raw = (r[col] || '').trim();
      const v = raw === '' ? 0 : Number(raw.replace(/,/g, ''));
      if (!Number.isFinite(v) || v < 0) { bad.push(`"${raw}" under ${header[col]}`); continue; }
      byMonth[key] = v;
    }
    if (bad.length) {
      problems.push({ row, site, item: itemName, storeId, itemId, reason: `A number it cannot read: ${bad.join(', ')}` });
      return;
    }
    usage[storeId] = usage[storeId] || {};
    usage[storeId][itemId] = byMonth;
  });
  const siteCount = Object.keys(usage).length;
  const itemCount = new Set(Object.values(usage).flatMap((o) => Object.keys(o))).size;
  if (problems.length) warnings.push(`${problems.length} ${problems.length === 1 ? 'row' : 'rows'} could not be read and ${problems.length === 1 ? 'is' : 'are'} skipped.`);
  if (!siteCount) errors.push('No rows matched a known OTP site.');
  return { ok: errors.length === 0, errors, warnings, problems, usage, months: monthCols.map((m) => m.key), ignored, siteCount, itemCount, rowCount: rows.length - 1 };
}

// Closest match by edit distance (for "Did you mean ...?"). Returns null when nothing is close.
export function closest(word, candidates) {
  const w = String(word || '').toLowerCase();
  if (!w) return null;
  let best = null;
  let bestD = Infinity;
  for (const c of candidates) {
    const d = editDistance(w, String(c).toLowerCase());
    if (d < bestD) { bestD = d; best = c; }
  }
  return best !== null && bestD <= Math.max(2, Math.floor(w.length / 3)) ? best : null;
}

function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

// Months that have ended before the current month.
export function completeMonths(months, currentMonthKey) {
  return months.filter((m) => m < currentMonthKey).sort();
}

// Number of complete months since the site first reported any use (any item).
export function siteMonthsOfData(siteUsage, months, currentMonthKey) {
  const complete = completeMonths(months, currentMonthKey);
  const first = complete.find((m) => Object.values(siteUsage || {}).some((byMonth) => (byMonth[m] || 0) > 0));
  if (!first) return 0;
  return complete.filter((m) => m >= first).length;
}

// AMC for one site and item from ODK monthly totals. Returns null when the item is not tracked in ODK there.
export function odkAmc(usage, storeId, itemId, months, currentMonthKey) {
  const byMonth = usage?.[storeId]?.[itemId];
  if (!byMonth) return null;
  const recent = completeMonths(months, currentMonthKey).slice(-AMC_MONTHS);
  if (!recent.length) return null;
  const total = recent.reduce((s, m) => s + (byMonth[m] || 0), 0);
  const monthsOfData = siteMonthsOfData(usage[storeId], months, currentMonthKey);
  return {
    amc: total / recent.length,
    monthsUsed: recent,
    monthsOfData,
    estimated: monthsOfData < MIN_MONTHS_FOR_FIRM_TARGET,
    source: 'odk',
  };
}
