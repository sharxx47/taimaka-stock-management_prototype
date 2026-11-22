// Master item list: one name per item, with aliases from every source
// (ODK usage file, Jigawan Iro bin card, ITP item list), a base unit and a stock type.
//
// Units rule (CLAUDE.md): units come from the ITP item list or the ODK item name.
// Ciprotap ear drop is in bottles (same form as Otomed drops) and Tom Brown in packs (assumptions).
// Items in neither source show "units" until Taimaka confirms.
//
// Stock types marked "assumption" are listed in the README; logistics can change them in Settings.

const PLURALS = {
  bottle: 'bottles', sachet: 'sachets', tube: 'tubes', tin: 'tins', bag: 'bags', ampoule: 'ampoules',
  vial: 'vials', tablet: 'tablets', piece: 'pieces', kit: 'kits', pack: 'packs', container: 'containers',
  unit: 'units',
};

export function makeUnit(one) {
  if (/^\d/.test(one)) return { one, many: one, multiply: true }; // "1000 ml": shown as "240 x 1000 ml"
  return { one, many: PLURALS[one] || `${one}s`, multiply: false };
}

// The 26 bin card rows, in bin card order. Display names are the names written on the bin card,
// with spelling corrected in four cases (the card spelling stays an alias): Todler, Cefexime, Spong,
// and Zinc Sulphate (shown as Zinc sulfate, the spelling in the ODK file and ITP item list).
// name: the one display name. binCard: the text printed on the card. odk: the ODK item name.
// itp: the ITP item list name when it is the same item (merged).
// unitFrom: where the unit comes from: { itp: name } | { odk: unit } | { assumption: unit } | { none: true }
const OTP_ITEMS = [
  { id: 'zinc_oxide', name: '20% Zinc oxide cream', binCard: '20% Zinc oxide cream', odk: 'Zinc oxide', itp: 'Zinc oxide cream', unitFrom: { itp: 'Zinc oxide cream' }, type: 'medication', icon: 'tube' },
  { id: 'act_al_1', name: 'ACT tablets AL 1', binCard: 'ACT tablets AL 1', odk: 'ACT AL', itp: 'ACT tablets AL 1', unitFrom: { itp: 'ACT tablets AL 1' }, type: 'medication', icon: 'tablets' },
  { id: 'amox_100', name: 'Amoxicillin susp 100ml', binCard: 'Amoxicillin susp 100ml', odk: 'Amoxicillin 100 ml bottles', unitFrom: { odk: 'bottle' }, type: 'medication', icon: 'bottle' },
  { id: 'amox_60', name: 'Amoxicillin susp 60ml', binCard: 'Amoxicillin susp 60ml', odk: 'Amoxicillin 60 ml bottles', unitFrom: { odk: 'bottle' }, type: 'medication', icon: 'bottle' },
  { id: 'ciprotap', name: 'Ciprotap ear drop', binCard: 'Ciprotap ear drop', unitFrom: { assumption: 'bottle', note: 'Same form as Otomed drops, which the ITP item list counts in bottles' }, type: 'medication', icon: 'drops' },
  { id: 'loratadine', name: 'Loratadine', binCard: 'Loratadine', odk: 'Loratadine', itp: 'Loratadine syrup', unitFrom: { itp: 'Loratadine syrup' }, type: 'medication', icon: 'bottle' },
  { id: 'malaria_rdt', name: 'Malaria RDT', binCard: 'Malaria RDT', odk: 'Malaria RDT kits', unitFrom: { odk: 'kit' }, type: 'consumable', icon: 'test' },
  { id: 'multivite', name: 'Multivite syrup (Fe/FA)', binCard: 'Multivite syrup (Fe/ FA)', unitFrom: { itp: 'Multivitamin syrup without ferrous sulfate', note: 'Same form (syrup); the ITP item is a different formulation, so it is not merged' }, type: 'medication', icon: 'bottle' },
  { id: 'nystatin', name: 'Nystatin suspension', binCard: 'Nystatin suspension', odk: 'Nystatin', itp: 'Nystatin suspension 100,000 IU/5 ml', unitFrom: { itp: 'Nystatin suspension 100,000 IU/5 ml' }, type: 'medication', icon: 'bottle' },
  { id: 'ors', name: 'ORS', binCard: 'ORS', odk: 'ORS', itp: 'ORS', unitFrom: { itp: 'ORS' }, type: 'medication', icon: 'sachet' },
  { id: 'paracetamol', name: 'Paracetamol syrup', binCard: 'Paracetamol syrup', odk: 'Paracetamol', itp: 'Paracetamol syrup 120mg/5 ml (Emzor)', unitFrom: { itp: 'Paracetamol syrup 120mg/5 ml (Emzor)' }, type: 'medication', icon: 'bottle' },
  { id: 'rutf', name: 'RUTF', binCard: 'RUTF', odk: 'RUTF', unitFrom: { odk: 'sachet', note: '1 carton = 150 sachets' }, type: 'therapeutic_food', icon: 'rutf', isRutf: true },
  { id: 'act_al_2', name: 'Tabs ACT AL 2', binCard: 'Tabs ACT AL 2', unitFrom: { none: true }, type: 'medication', icon: 'tablets' },
  { id: 'albendazole', name: 'Tabs Albendazole 400mg', binCard: 'Tabs Albendazole 400mg', odk: 'Albendazole', itp: 'Albendazole 400mg tablets', unitFrom: { itp: 'Albendazole 400mg tablets' }, type: 'medication', icon: 'tablets' },
  { id: 'tetracycline', name: 'Tetracycline ointment', binCard: 'Tetracycline ointment', odk: 'Tetracycline', itp: '3% Tetracycline ointment', unitFrom: { itp: '3% Tetracycline ointment' }, type: 'medication', icon: 'tube' },
  { id: 'tom_brown', name: 'Tom Brown', binCard: 'TOM BROWN', odk: 'Tom Brown', unitFrom: { assumption: 'pack' }, type: 'therapeutic_food', typeAssumed: true, icon: 'food' },
  { id: 'act_aa_toddler', name: 'Z AA (Toddler)', binCard: 'Z AA (Todler)', odk: 'ACT AA toddler', unitFrom: { none: true }, type: 'medication', icon: 'tablets' },
  { id: 'otomed', name: 'Z Otomed', binCard: 'Z Otomed', odk: 'Otomed', itp: 'Otomed drops', unitFrom: { itp: 'Otomed drops' }, type: 'medication', icon: 'drops' },
  { id: 'zinc_sulfate', name: 'Zinc sulfate', binCard: 'Zinc Sulphate', odk: 'Zinc sulfate', itp: 'Zinc sulfate 20mg tablets', unitFrom: { itp: 'Zinc sulfate 20mg tablets' }, type: 'medication', icon: 'tablets' },
  { id: 'cefixime', name: 'Z Sups. Cefixime', binCard: 'Z Sups. Cefexime', odk: 'Cefixime', unitFrom: { none: true }, type: 'medication', icon: 'bottle' },
  { id: 'act_aa_infant', name: 'Z AA (Infant)', binCard: 'Z AA (Infant)', odk: 'ACT AA infant', unitFrom: { none: true }, type: 'medication', icon: 'tablets' },
  // TB Bucket and the ODK item "Tom Brown container" are assumed to be the same item (to confirm with Taimaka).
  { id: 'tb_bucket', name: 'TB Bucket', binCard: 'TB Bucket', odk: 'Tom Brown container', unitFrom: { none: true }, type: 'consumable', typeAssumed: true, icon: 'bucket' },
  { id: 'bms', name: 'BMS', binCard: 'BMS', unitFrom: { none: true }, type: 'therapeutic_food', typeAssumed: true, icon: 'tin' },
  { id: 'benzyl_benzoate', name: 'Benzyl benzoate', binCard: 'Benzyl benzoate', itp: 'Benzyl benzoate lotion', unitFrom: { itp: 'Benzyl benzoate lotion' }, type: 'medication', icon: 'bottle' },
  { id: 'soap', name: 'Soap', binCard: 'Soap', unitFrom: { none: true }, type: 'consumable', icon: 'soap' },
  { id: 'sponge', name: 'Sponge', binCard: 'Spong', unitFrom: { none: true }, type: 'consumable', icon: 'sponge' },
];

export const BIN_CARD_ITEM_COUNT = 26;

const ITP_CATEGORY_TYPES = { 'therapeutic food': 'therapeutic_food', medication: 'medication' };

export function normalizeName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim();
}

function slug(s) {
  return normalizeName(s).replace(/%/g, 'pct').replace(/\s+/g, '_');
}

// Builds the master list. itpRecords: rows of ITP item list.csv ({ category, item, unit }).
export function buildItems(itpRecords) {
  const itpByName = new Map(itpRecords.map((r) => [normalizeName(r.item), r]));
  const items = [];
  const mergedItp = new Set();

  OTP_ITEMS.forEach((def, i) => {
    let unit;
    let unitSource;
    const uf = def.unitFrom;
    if (uf.itp) {
      const rec = itpByName.get(normalizeName(uf.itp));
      if (!rec) throw new Error(`ITP item list has no "${uf.itp}" (unit source for ${def.name})`);
      unit = makeUnit(rec.unit);
      unitSource = `ITP item list ("${rec.item}": ${rec.unit})${uf.note ? `. ${uf.note}` : ''}`;
    } else if (uf.odk) {
      unit = makeUnit(uf.odk);
      unitSource = `ODK item name ("${def.odk}")${uf.note ? `. ${uf.note}` : ''}`;
    } else if (uf.assumption) {
      unit = makeUnit(uf.assumption);
      unitSource = `Assumption${uf.note ? `: ${uf.note}` : ''}`;
    } else {
      unit = makeUnit('unit');
      unitSource = 'In neither source: "units" until Taimaka confirms';
    }
    if (def.itp) mergedItp.add(normalizeName(def.itp));
    const aliases = [def.name, def.binCard, def.odk, def.itp].filter(Boolean);
    items.push({
      id: def.id,
      name: def.name,
      unit,
      unitSource,
      type: def.type,
      typeAssumed: !!def.typeAssumed,
      icon: def.icon,
      isRutf: !!def.isRutf,
      odkName: def.odk || null,
      binCardName: def.binCard || null,
      itpName: def.itp || null,
      binCardOrder: def.binCard ? i + 1 : null,
      heldAtOtp: true,
      heldAtItp: !!def.itp,
      aliases: [...new Set(aliases)],
    });
  });

  for (const rec of itpRecords) {
    if (mergedItp.has(normalizeName(rec.item))) continue;
    const type = ITP_CATEGORY_TYPES[normalizeName(rec.category)];
    if (!type) throw new Error(`Unknown ITP category "${rec.category}"`);
    items.push({
      id: `itp_${slug(rec.item)}`,
      name: rec.item,
      unit: makeUnit(rec.unit),
      unitSource: `ITP item list (${rec.unit})`,
      type,
      typeAssumed: false,
      icon: type === 'therapeutic_food' ? 'food' : 'medicine',
      isRutf: false,
      odkName: null,
      binCardName: null,
      itpName: rec.item,
      binCardOrder: null,
      heldAtOtp: false,
      heldAtItp: true,
      aliases: [rec.item],
    });
  }
  return items;
}

// Lookup by any alias (case and punctuation insensitive).
export function makeAliasIndex(items) {
  const idx = new Map();
  for (const it of items) for (const a of it.aliases) idx.set(normalizeName(a), it.id);
  return (name) => idx.get(normalizeName(name)) || null;
}

// Items a store holds, in display order (bin card order for OTPs, ITP list order for ITPs).
export function itemsForStore(items, store) {
  if (store.type === 'OTP') return items.filter((i) => i.heldAtOtp);
  if (store.type === 'ITP') {
    // ITP list order: merged items sit where they appear in the ITP list.
    return items.filter((i) => i.heldAtItp).sort((a, b) => (a.itpOrder ?? 0) - (b.itpOrder ?? 0));
  }
  return items; // central store holds everything
}

// Adds itpOrder (row position in ITP item list.csv) to each ITP item.
export function attachItpOrder(items, itpRecords) {
  const pos = new Map(itpRecords.map((r, i) => [normalizeName(r.item), i]));
  for (const it of items) if (it.itpName) it.itpOrder = pos.get(normalizeName(it.itpName));
  return items;
}
