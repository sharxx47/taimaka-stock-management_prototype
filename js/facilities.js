// Stores from Facility list.csv: 1 central store, 27 OTPs, 3 ITPs.

export const CENTRAL_SUPERVISOR_TEXT = 'n/a, run by logistics';

export function siteIdFromLabel(label) {
  return String(label).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function displayName(label, type) {
  if (type === 'OTP') return `${label} OTP`;
  if (type === 'ITP') return `${label} ITP`;
  return label;
}

const SITE_TYPES = { OTP: 'Outpatient site', ITP: 'Inpatient site', 'Central store': null };

export function buildStores(facilityRecords) {
  const stores = facilityRecords.map((r) => {
    const type = r.type;
    if (!(type in SITE_TYPES)) throw new Error(`Unknown facility type "${type}" for ${r.label}`);
    const id = type === 'Central store' ? 'central' : siteIdFromLabel(r.label);
    return {
      id,
      label: r.label,
      name: displayName(r.label, type),
      type: type === 'Central store' ? 'CENTRAL' : type,
      siteType: SITE_TYPES[type],
      lga: r.local_government_area,
      linkedItpLabel: r.associated_itp || null,
      supervisor: r.supervisor || (type === 'Central store' ? CENTRAL_SUPERVISOR_TEXT : null),
      odkSiteId: type === 'OTP' ? siteIdFromLabel(r.label) : null,
      addedInDemo: false,
    };
  });
  const byLabel = new Map(stores.map((s) => [s.label, s]));
  for (const s of stores) s.linkedItpId = s.linkedItpLabel ? byLabel.get(s.linkedItpLabel)?.id ?? null : null;
  // Display order: central store, OTPs (file order), ITPs.
  const rank = { CENTRAL: 0, OTP: 1, ITP: 2 };
  return stores
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank[a.s.type] - rank[b.s.type] || a.i - b.i)
    .map(({ s }) => s);
}
