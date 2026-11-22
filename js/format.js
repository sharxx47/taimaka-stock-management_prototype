// Display formatting. Display only: every calculation stays in exact units (RUTF in exact sachets).

import { SACHETS_PER_CARTON } from './config.js';

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Counts show exactly as recorded (28.5 stays 28.5), with thousands separators.
export function formatNumber(n) {
  return nf.format(n);
}

// ODK values have decimals (compilation artifacts): round them for display.
export function formatRounded(n) {
  return nf0.format(Math.round(n));
}

export function formatMonths(m) {
  return `${nf1.format(m)} months`;
}

export function unitWord(unit, qty) {
  return Math.abs(qty) === 1 ? unit.one : unit.many;
}

// "23,870 sachets (159 cartons + 20 loose)", "1,800 sachets (12 cartons)", "131 sachets".
export function formatRutf(sachets) {
  const sign = sachets < 0 ? '-' : '';
  const n = Math.abs(sachets);
  const base = `${sign}${formatNumber(n)} ${n === 1 ? 'sachet' : 'sachets'}`;
  if (n < SACHETS_PER_CARTON) return base;
  const cartons = Math.floor(n / SACHETS_PER_CARTON);
  const loose = Math.round((n - cartons * SACHETS_PER_CARTON) * 100) / 100;
  const cartonText = `${formatNumber(cartons)} ${cartons === 1 ? 'carton' : 'cartons'}`;
  return loose === 0 ? `${base} (${cartonText})` : `${base} (${cartonText} + ${formatNumber(loose)} loose)`;
}

// Daily count read-back: "28 sealed cartons + 131 loose = 4,331 sachets".
export function rutfReadBack(sealedCartons, looseSachets) {
  const total = sealedCartons * SACHETS_PER_CARTON + looseSachets;
  return {
    total,
    text: `${formatNumber(sealedCartons)} sealed ${sealedCartons === 1 ? 'carton' : 'cartons'} + ${formatNumber(looseSachets)} loose = ${formatNumber(total)} ${total === 1 ? 'sachet' : 'sachets'}`,
  };
}

// Any quantity with its unit: "80 bottles", "1 tube", "240 x 1000 ml", RUTF with cartons.
export function formatQty(item, qty) {
  if (qty === null || qty === undefined) return 'No count';
  if (item.isRutf) return formatRutf(qty);
  if (item.unit.multiply) return `${formatNumber(qty)} x ${item.unit.one}`;
  return `${formatNumber(qty)} ${unitWord(item.unit, qty)}`;
}
