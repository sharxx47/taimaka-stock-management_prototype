// Test users for the test sign-in. Each role sees only its own screens (screens come in build step 2).
// Names: Jigawan Iro from the bin card staff name field (surname shortened), supervisors from
// Facility list.csv, logistics from Taimaka's public team page. Other OTPs and the ITPs use role and facility only.

export const ROLES = {
  LTO: 'Lead Triage Officer',
  PHARM: 'Pharmacy Technician',
  SUPERVISOR: 'Supervisor',
  LOGISTICS_PO: 'Logistics Program Officer',
  LOGISTICS_ASSISTANT: 'Logistics Assistant',
  MANAGEMENT: 'Management',
};

export function buildUsers(stores) {
  const users = [];
  for (const s of stores.filter((x) => x.type === 'OTP')) {
    users.push({
      id: `lto_${s.id}`,
      name: s.id === 'jigawan_iro' ? 'Muhammad S.' : null,
      role: ROLES.LTO,
      kind: 'facility',
      storeId: s.id,
    });
  }
  for (const s of stores.filter((x) => x.type === 'ITP')) {
    users.push({ id: `pharm_${s.id}`, name: null, role: ROLES.PHARM, kind: 'facility', storeId: s.id });
  }
  const supervisors = [];
  for (const s of stores) {
    if (s.type === 'CENTRAL' || !s.supervisor) continue;
    if (!supervisors.includes(s.supervisor)) supervisors.push(s.supervisor);
  }
  for (const name of supervisors) {
    users.push({
      id: `sup_${name.toLowerCase().replace(/[^a-z]+/g, '_')}`,
      name,
      role: ROLES.SUPERVISOR,
      kind: 'supervisor',
      storeIds: stores.filter((s) => s.supervisor === name).map((s) => s.id),
    });
  }
  users.push({ id: 'log_nasiru_bello', name: 'Nasiru Bello', role: ROLES.LOGISTICS_PO, kind: 'logistics' });
  users.push({ id: 'log_abubakar_waziri', name: 'Abubakar Waziri', role: ROLES.LOGISTICS_ASSISTANT, kind: 'logistics' });
  users.push({ id: 'management', name: null, role: ROLES.MANAGEMENT, kind: 'management' });
  return users;
}

// "Muhammad S." or, for users without a name, the role and facility ("Lead Triage Officer, Ashaka Gari").
export function userDisplayName(user, stores) {
  if (user.name) return user.name;
  const store = user.storeId ? stores.find((s) => s.id === user.storeId) : null;
  return store ? `${user.role}, ${store.label}` : user.role;
}

// The stamp stored on every entry: who (name and role at the time) and when.
export function stamp(user, stores, at) {
  return { by: user.id, byName: userDisplayName(user, stores), byRole: user.role, at };
}
