// Prints how many items have each status at every store (a quick view of the seed).
import fs from 'node:fs';
import { buildDb, DATA_FILES } from '../js/app-data.js';
import { freshState } from '../js/storage.js';
import { storeItems, usageInfo } from '../js/stock.js';
const src = Object.fromEntries(Object.entries(DATA_FILES).map(([k, p]) => [k, fs.readFileSync(p, 'utf8')]));
const { db } = buildDb(src, freshState());
for (const s of db.stores) {
  const c = {};
  for (const v of storeItems(db, s.id)) c[v.status.label] = (c[v.status.label] || 0) + 1;
  console.log(`${s.name.padEnd(20)} ${Object.entries(c).map(([k, n]) => `${k} ${n}`).join(', ')}`);
}
console.log('GH Deba F75 months used for AMC:', usageInfo(db, 'gh_deba', db.itemIdFor('F75')).monthsUsed.join(', '));
