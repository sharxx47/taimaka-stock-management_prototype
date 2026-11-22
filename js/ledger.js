// Append-only stock ledger. Nothing is ever overwritten or deleted.
//
// Expected stock = opening + received - used +/- approved adjustments, counted from the most recent
// base (the opening balance or the last count) and using only transactions timestamped before the
// count cut-off. Counts are observations compared with the expected stock; each count becomes the
// base for the next one, so one old difference does not flag every later count.

import { ms } from './time.js';

export const BASE_KINDS = new Set(['opening', 'count']);
const SIGN = { received: 1, sent: -1, used: -1, adjustment: 1, stockout_day: 0 };
const KINDS = new Set([...BASE_KINDS, ...Object.keys(SIGN)]);

export class Ledger {
  constructor() {
    this.all = [];
    this.byId = new Map();
    this.byKey = new Map();
    this.sorted = new Set();
    this.approvals = new Map(); // adjustment id -> { decision: 'approved' | 'rejected', stamp }
    this.seq = 0;
  }

  static key(storeId, itemId) {
    return `${storeId}|${itemId}`;
  }

  add(input) {
    if (!KINDS.has(input.kind)) throw new Error(`Unknown ledger entry kind "${input.kind}"`);
    if (this.byId.has(input.id)) throw new Error(`Duplicate ledger entry id ${input.id}`);
    if (!input.ts) throw new Error('Ledger entry needs a timestamp');
    if (input.kind !== 'stockout_day' && input.kind !== 'adjustment' && !(input.qty >= 0)) {
      throw new Error(`Ledger entry ${input.id}: quantity must be zero or more`);
    }
    const e = Object.freeze({ ...input, seq: ++this.seq, tsMs: ms(input.ts) });
    this.all.push(e);
    this.byId.set(e.id, e);
    const k = Ledger.key(e.storeId, e.itemId);
    if (!this.byKey.has(k)) this.byKey.set(k, []);
    this.byKey.get(k).push(e);
    this.sorted.delete(k);
    return e;
  }

  get(id) {
    return this.byId.get(id) || null;
  }

  setApproval(adjustmentId, decision, stamp) {
    const adj = this.byId.get(adjustmentId);
    if (!adj || adj.kind !== 'adjustment' || !adj.needsApproval) throw new Error('Nothing to approve');
    if (this.approvals.has(adjustmentId)) throw new Error('This correction has already been decided');
    this.approvals.set(adjustmentId, { decision, stamp });
    this.sorted.delete(Ledger.key(adj.storeId, adj.itemId));
  }

  approvalOf(e) {
    return this.approvals.get(e.id) || null;
  }

  // When an entry takes effect on the balance (null: not in effect, e.g. waiting for approval).
  // An approved correction counts from when it was entered: if the facility counted again before the
  // approval, that later count already shows the change, so it is not taken off twice.
  effectiveMs(e) {
    if (e.kind === 'adjustment' && e.needsApproval) {
      const a = this.approvals.get(e.id);
      return a && a.decision === 'approved' ? e.tsMs : null;
    }
    return e.tsMs;
  }

  entries(storeId, itemId) {
    const k = Ledger.key(storeId, itemId);
    const list = this.byKey.get(k) || [];
    if (!this.sorted.has(k)) {
      const eff = (e) => this.effectiveMs(e) ?? e.tsMs;
      list.sort((a, b) => eff(a) - eff(b) || a.seq - b.seq);
      this.sorted.add(k);
    }
    return list;
  }

  // Balance from the latest base before the cut-off.
  // beforeMs: only entries in effect before this time (strictly before when strict is true).
  balance(storeId, itemId, { beforeMs = Infinity, strict = false, excludeId = null } = {}) {
    const inWindow = (t) => t !== null && (strict ? t < beforeMs : t <= beforeMs);
    const list = this.entries(storeId, itemId);
    let base = null;
    for (const e of list) {
      if (e.id === excludeId || !BASE_KINDS.has(e.kind)) continue;
      if (inWindow(e.tsMs) && (!base || e.tsMs > base.tsMs || (e.tsMs === base.tsMs && e.seq > base.seq))) base = e;
    }
    if (!base) return { qty: null, base: null, movements: [] };
    let qty = base.qty;
    const movements = [];
    for (const e of list) {
      if (e.id === excludeId || BASE_KINDS.has(e.kind)) continue;
      const t = this.effectiveMs(e);
      if (!inWindow(t)) continue;
      if (t < base.tsMs || (t === base.tsMs && e.seq < base.seq)) continue;
      qty += SIGN[e.kind] * e.qty;
      movements.push(e);
    }
    return { qty: round6(qty), base, movements };
  }

  // Every entry with the running balance after it, oldest first (item history / audit trail).
  history(storeId, itemId) {
    const out = [];
    let running = null;
    for (const e of this.entries(storeId, itemId)) {
      const row = { entry: e, approval: this.approvalOf(e), inEffect: true, expectedBefore: running };
      if (BASE_KINDS.has(e.kind)) {
        running = e.qty;
      } else if (this.effectiveMs(e) === null) {
        row.inEffect = false; // waiting for approval, or rejected
      } else if (running !== null) {
        running = round6(running + SIGN[e.kind] * e.qty);
      }
      row.balance = running;
      out.push(row);
    }
    return out;
  }
}

export function signedQty(e) {
  return (SIGN[e.kind] ?? 0) * e.qty;
}

function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}
