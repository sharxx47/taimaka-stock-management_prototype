// ODK OTP usage: parse the monthly CSV, and work out average monthly use (AMC).
//
// Rule: AMC = average of the most recent complete months (for this data: August and September,
// because October is a partial month). A site with fewer than 3 complete months of data shows
// "Estimated target".

import { parseCsv } from './csv.js';
import { AMC_MONTHS, MIN_MONTHS_FOR_FIRM_TARGET } from './config.js';
import { MONTH_NAMES } from './time.js';

// Parses the ODK file format: site,item,Jan,...,Oct,total_jan_oct
// Returns { ok, errors, warnings, usage: { [siteId]: { [itemId]: { 'YYYY-MM': n } } }, months, siteCount, itemCount }.
export function parseOdkCsv(text, { stores, itemIdFor, year }) {
  const errors = [];
  const warnings = [];
  const rows = parseCsv(text);
  if (rows.length < 2) return { ok: false, errors: ['The file is empty.'], warnings, usage: {}, months: [] };
  const header = rows[0].map((h) => h.trim());
  const siteCol = header.findIndex((h) => h.toLowerCase() === 'site');
  const itemCol = header.findIndex((h) => h.toLowerCase() === 'item');
  if (siteCol < 0 || itemCol < 0) {
    return { ok: false, errors: ['The file needs a "site" column and an "item" column.'], warnings, usage: {}, months: [] };
  }
  const monthCols = [];
  header.forEach((h, i) => {
    const idx = MONTH_NAMES.findIndex((m) => m.toLowerCase() === h.toLowerCase());
    if (idx >= 0) monthCols.push({ col: i, key: `${year}-${String(idx + 1).padStart(2, '0')}` });
  });
  if (!monthCols.length) {
    return { ok: false, errors: ['No month columns (Jan, Feb, ...) found.'], warnings, usage: {}, months: [] };
  }

  const siteIds = new Map(stores.filter((s) => s.odkSiteId).map((s) => [s.odkSiteId, s.id]));
  const usage = {};
  const unknownSites = new Set();
  const unknownItems = new Set();
  rows.slice(1).forEach((r, n) => {
    const site = (r[siteCol] || '').trim();
    const itemName = (r[itemCol] || '').trim();
    const storeId = siteIds.get(site);
    const itemId = itemIdFor(itemName);
    if (!storeId) { unknownSites.add(site); return; }
    if (!itemId) { unknownItems.add(itemName); return; }
    const byMonth = {};
    for (const { col, key } of monthCols) {
      const raw = (r[col] || '').trim();
      const v = raw === '' ? 0 : Number(raw);
      if (!Number.isFinite(v) || v < 0) {
        errors.push(`Row ${n + 2}: "${raw}" is not a valid quantity (${site}, ${itemName}).`);
        continue;
      }
      byMonth[key] = v;
    }
    usage[storeId] = usage[storeId] || {};
    usage[storeId][itemId] = byMonth;
  });
  if (unknownSites.size) warnings.push(`Sites not in the facility list, skipped: ${[...unknownSites].join(', ')}`);
  if (unknownItems.size) warnings.push(`Items not in the master item list, skipped: ${[...unknownItems].join(', ')}`);
  const siteCount = Object.keys(usage).length;
  const itemCount = new Set(Object.values(usage).flatMap((o) => Object.keys(o))).size;
  if (!siteCount) errors.push('No rows matched a known OTP site.');
  return { ok: errors.length === 0, errors, warnings, usage, months: monthCols.map((m) => m.key), siteCount, itemCount };
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
