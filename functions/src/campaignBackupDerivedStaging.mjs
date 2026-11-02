import {
  parseCampaignDerivedUnit,
  campaignDerivedBad as bad,
} from './campaignBackupDerivedContent.mjs';
export const ordered = [
  'base:item',
  'base:bodies',
  'base:links',
  'base:loreReferences',
  'image',
  'variant',
  'w:item',
  'w:anchor',
];
export const ranks = [
  'base',
  'base:item',
  'base:bodies',
  'base:links',
  'base:loreReferences',
  'image',
  'variant',
];
export const keyFor = (id, field = null) => JSON.stringify([id, field]);

const safeAdd = (a, b = 1) => {
  const n = a + b;
  if (!Number.isSafeInteger(n) || n < 0) bad();
  return n;
};
export function sourceMatches(source, witness) {
  if (
    !source ||
    source.adventureId !== witness.adventure.id ||
    source.capturedAt !== witness.capturedAt ||
    source.universeId !== (witness.universe.kind === 'none' ? null : witness.universe.id)
  )
    bad();
}

export const createCampaignDerivedStageState = () => ({
  sizes: {},
  last: {},
  stored: 0,
  lastRank: -1,
  lastVariant: null,
  awaitingAnchor: false,
  pending: null,
  baseUnit: null,
  baseWitness: null,
});
export function createCampaignDerivedStaging(s, onRow) {
  async function stage(section, id, field, value) {
    const key = keyFor(id, field),
      position = s.sizes[section] ?? 0;
    if (ordered.includes(section) && s.last[section] !== undefined && key <= s.last[section]) bad();
    s.last[section] = key;
    s.sizes[section] = safeAdd(position);
    const bytes = Buffer.from(JSON.stringify(value));
    if (bytes.length > 65536) bad();
    await onRow({ index: s.stored, section, key, position, value });
    s.stored = safeAdd(s.stored);
  }
  return {
    async witness(record) {
      const [section, id] = record;
      if (section === 'project') return;
      if (section === 'base') {
        if (s.baseWitness) bad();
        s.baseWitness = record;
      }
      await stage('w:' + section, id, null, { record });
    },
    async unit(unit, payload, contentVersion) {
      const section = unit.section,
        field = section === 'base:field' || section === 'anchor:field';
      if (field) {
        if (!s.pending || section !== s.pending.section || unit.id !== s.pending.id) bad();
        const expected = s.pending.fields[s.pending.index++];
        if (
          !expected ||
          unit.field !== expected.field ||
          unit.byteLength !== expected.bytes ||
          unit.chunkCount !== expected.chunkCount ||
          unit.contentHash !== expected.sha256
        )
          bad();
        if (s.pending.index === s.pending.fields.length) s.pending = null;
      } else {
        if (s.pending) bad();
        if (s.awaitingAnchor && section !== 'anchor') bad();
        if (section !== 'anchor') {
          const rank = ranks.indexOf(section);
          if (rank < s.lastRank || rank < 0) bad();
          s.lastRank = rank;
        }
      }
      const meta = parseCampaignDerivedUnit(unit, payload, contentVersion);
      if (section === 'base') {
        if (s.baseUnit) bad();
        s.baseUnit = { unit, meta };
      }
      if (section === 'variant') {
        s.lastVariant = {
          unit: { id: unit.id, outcome: unit.outcome },
          meta: meta ? { anchorKey: meta.anchorKey } : null,
        };
        s.awaitingAnchor = true;
      }
      if (section === 'anchor') {
        if (!s.awaitingAnchor || !s.lastVariant || unit.outcome !== s.lastVariant.unit.outcome)
          bad();
        if (unit.id !== (meta ? s.lastVariant.meta.anchorKey : s.lastVariant.unit.id)) bad();
        s.awaitingAnchor = false;
      }
      const fields =
        section === 'base:item' ? meta?.fields : section === 'anchor' ? meta?.item.fields : null;
      if (fields?.length)
        s.pending = {
          section: section === 'anchor' ? 'anchor:field' : 'base:field',
          id: unit.id,
          fields,
          index: 0,
        };
      await stage(section, unit.id, unit.field ?? null, { unit, meta });
    },
    finish(file) {
      if (
        s.pending ||
        s.awaitingAnchor ||
        !s.baseUnit ||
        !s.baseWitness ||
        s.baseUnit.unit.outcome !== file.manifest.availability ||
        s.baseWitness[2] !== file.manifest.availability ||
        s.baseUnit.unit.id !== s.baseWitness[1]
      )
        bad();
      const active = s.baseWitness[2] === 'available' ? s.baseWitness[3] : null;
      if (active) sourceMatches(s.baseUnit.meta, active);

      return active;
    },
  };
}
