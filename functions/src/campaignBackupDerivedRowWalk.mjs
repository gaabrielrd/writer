import { campaignDerivedBad as bad } from './campaignBackupDerivedContent.mjs';
import { sourceMatches } from './campaignBackupDerivedStaging.mjs';
import { baseBodyKey } from './campaignBaseContracts.mjs';
import { closedCampaignRecord } from './portableCampaignManifest.mjs';
import { digest } from './workProgressContracts.mjs';
const available = (r) => r?.value?.unit?.outcome === 'available',
  same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const add = (n, amount = 1) => {
  const v = n + amount;
  if (!Number.isSafeInteger(v) || v < 0) bad();
  return v;
};
function itemMatches(item, witness, base) {
  if (
    item.sourceKey !== witness.sourceKey ||
    witness.baseId !== base.baseId ||
    witness.availability !== 'available'
  )
    bad();
  const o = item.origin,
    w = witness.origin;
  if (item.kind === 'lore') {
    if (
      o.kind === 'lore'
        ? w.kind !== 'lore' ||
          w.scopeId !== o.scopeId ||
          w.entityId !== o.id ||
          base.universe.kind !== 'reference' ||
          base.universe.id !== o.scopeId
        : w.kind !== 'adventure-lore' ||
          w.adventureId !== o.adventureId ||
          w.entityId !== o.id ||
          o.adventureId !== base.adventure.id
    )
      bad();
  } else if (
    w.kind !== 'adventure' ||
    w.adventureId !== o.adventureId ||
    o.adventureId !== base.adventure.id
  )
    bad();
}

export const campaignDerivedCounts = () => ({
  records: 0,
  items: 0,
  fields: 0,
  bodies: 0,
  links: 0,
  ledger: 0,
  images: 0,
  variants: 0,
  anchors: 0,
  unavailable: 0,
  externalAnchorTargets: 0,
  unresolvedRelations: 0,
});
const phases = [
  'start',
  'w:item',
  'w:anchor',
  'item-witness',
  'item-ledger',
  'item-parent',
  'item-image',
  'item-fields',
  'item-body',
  'item-relations',
  'field',
  'body',
  'link-owner',
  'link-target',
  'link-ledger',
  'ledger-reverse',
  'ledger-target',
  'image',
  'variant-witness',
  'variant-anchor',
  'variant-unavailable',
  'variant-relations',
  'anchor-fields',
  'anchor-relations',
  'done',
];
const rowHash = (row) => digest([row.index, row.section, row.key, row.position, row.value]);
export function createCampaignDerivedRowState(row) {
  return {
    schemaVersion: 1,
    rowHash: rowHash(row),
    phase: 'start',
    field: 0,
    body: 0,
    relation: 0,
    first: true,
    parent: null,
    proof: null,
    target: null,
    done: false,
  };
}
/** A fragment-compatible semantic step; reader results must already be authenticated. */
export async function advanceCampaignDerivedRow({
  row,
  context,
  counts,
  state: s,
  readers,
  write,
}) {
  if (
    !closedCampaignRecord(s, [
      'schemaVersion',
      'rowHash',
      'phase',
      'field',
      'body',
      'relation',
      'first',
      'parent',
      'proof',
      'target',
      'done',
    ]) ||
    s.schemaVersion !== 1 ||
    s.rowHash !== rowHash(row) ||
    !phases.includes(s.phase) ||
    typeof s.first !== 'boolean' ||
    typeof s.done !== 'boolean' ||
    s.done !== (s.phase === 'done')
  )
    bad();
  for (const n of [s.field, s.body, s.relation]) if (!Number.isSafeInteger(n) || n < 0) bad();
  if (s.done) return { done: true };
  const {
      section,
      value: { unit: u, meta: m, record: w },
    } = row,
    active = context.active;
  const emit = (r) => {
    write((s.first ? '' : ',') + JSON.stringify([r.section, r.key, r.value]));
    s.first = false;
  };
  const dep = async (section, id, field = null, required = true) => {
    const r = await readers.find(section, id, field, false);
    if (!r || (required && !available(r))) bad();
    emit(r);
    return r;
  };
  const reverse = async (kind, key) => {
    const r = await readers.reverse(kind, key);
    if (
      kind === 'image'
        ? r.section !== 'base:item' ||
          !available(r) ||
          r.value.meta.kind !== 'block' ||
          r.value.meta.image !== key
        : kind === 'ledger'
          ? r.section !== 'base:loreReferences' || !available(r) || r.value.meta.targetKey !== key
          : r.section !== 'base:links' ||
            !available(r) ||
            r.value.meta.target.kind !== 'lore' ||
            r.value.meta.target.sourceKey !== key
    )
      bad();
  };
  const relationTarget = async (key, variant = false) => {
    const v = variant ? await readers.find('variant', key, null, true) : null;
    if (v)
      return (
        available(v) && v.value.meta.mode !== 'removed' && v.value.meta.participation !== 'inactive'
      );
    const item = await readers.find('base:item', key, null, true);
    if (item && available(item) && item.value.meta.kind !== 'lore') bad();
    return available(item);
  };
  const finish = () => {
    write(']]\n');
    counts.records = add(counts.records);
    s.phase = 'done';
    s.done = true;
    return { done: true };
  };
  switch (s.phase) {
    case 'start': {
      write(JSON.stringify([row.section, row.key, row.value]).slice(0, -1) + ',[');
      if (section === 'base') {
        if (active && u.id !== active.baseId) bad();
        return finish();
      }
      if (section === 'w:base') {
        if (!same(w, context.baseWitness)) bad();
        return finish();
      }
      if (section === 'w:item' || section === 'w:anchor') {
        s.phase = section;
        break;
      }
      if ((section.startsWith('base:') || section === 'image') && !active) bad();
      if (u.outcome !== 'available') counts.unavailable = add(counts.unavailable);
      const field = {
        'base:item': 'items',
        'base:field': 'fields',
        'anchor:field': 'fields',
        'base:bodies': 'bodies',
        'base:links': 'links',
        'base:loreReferences': 'ledger',
        image: 'images',
        variant: 'variants',
        anchor: 'anchors',
      }[section];
      if (!field) bad();
      counts[field] = add(counts[field]);
      s.phase = {
        'base:item': 'item-witness',
        'base:field': 'field',
        'anchor:field': 'field',
        'base:bodies': 'body',
        'base:links': 'link-owner',
        'base:loreReferences': 'ledger-reverse',
        image: 'image',
        variant: 'variant-witness',
        anchor: 'anchor-fields',
      }[section];
      if (!m && ['base:bodies', 'base:links', 'base:loreReferences', 'anchor'].includes(section))
        return finish();
      if (section === 'anchor' && m.item.kind !== 'lore') bad();
      break;
    }
    case 'w:item': {
      const r = await dep('base:item', w[1], null, false);
      if (r.value.unit.outcome !== w[3].availability) bad();
      return finish();
    }
    case 'w:anchor': {
      const r = await dep('variant', w[1], null, false);
      if (r.value.unit.outcome !== w[2]) bad();
      return finish();
    }
    case 'item-witness': {
      const proof = (await dep('w:item', u.id, null, false)).value.record;
      if (
        proof[2] !== 'available' ||
        proof[3].baseId !== active.baseId ||
        proof[3].availability !== u.outcome
      )
        bad();
      if (!m) return finish();
      itemMatches(m, proof[3], active);
      s.phase = m.kind === 'lore' ? 'item-ledger' : 'item-parent';
      break;
    }
    case 'item-ledger':
      await reverse('ledger', u.id);
      s.phase = 'item-parent';
      break;
    case 'item-parent': {
      const kind =
        m.kind === 'block'
          ? 'scene'
          : m.kind === 'milestone'
            ? 'arc'
            : m.kind === 'scene' && m.parentKey !== null
              ? 'part'
              : null;
      if (kind) {
        const p = (await dep('base:item', m.parentKey)).value.meta;
        if (p.kind !== kind) bad();
        s.parent = { kind: p.kind, origin: { id: p.origin.id }, fields: p.fields };
      } else if (m.parentKey !== null) bad();
      if (
        m.kind === 'milestone' &&
        m.parentKey !==
          digest({ adventureId: m.origin.adventureId, kind: 'arc', id: m.origin.arcId })
      )
        bad();
      if (m.kind === 'block' && m.role === 'main' && m.origin.id !== s.parent.origin.id) bad();
      s.phase = 'item-image';
      break;
    }
    case 'item-image':
      if (m.image !== null) {
        if (m.kind !== 'block') bad();
        await dep('image', m.image, null, false);
      }
      s.phase = 'item-fields';
      break;
    case 'item-fields': {
      if (s.field >= m.fields.length) {
        s.phase = 'item-relations';
        break;
      }
      const f = m.fields[s.field];
      await dep('base:field', u.id, f.field);
      if (f.bodySourceKey !== u.id) {
        if (
          m.kind !== 'block' ||
          m.role !== 'main' ||
          f.field !== 'content' ||
          f.bodySourceKey !== m.parentKey ||
          !s.parent.fields.some((p) => same(p, f))
        )
          bad();
        s.field++;
      } else {
        s.body = 0;
        s.phase = 'item-body';
      }
      break;
    }
    case 'item-body': {
      const f = m.fields[s.field];
      if (!f) bad();
      if (s.body >= f.chunkCount) {
        s.field++;
        s.phase = 'item-fields';
        break;
      }
      const b = (await dep('base:bodies', baseBodyKey(u.id, f.field, s.body))).value.meta;
      if (b.sourceKey !== u.id || b.field !== f.field || b.index !== s.body) bad();
      s.body++;
      if (s.body === f.chunkCount) {
        s.field++;
        s.phase = 'item-fields';
      }
      break;
    }
    case 'item-relations': {
      if (s.relation >= m.relations.length) return finish();
      const r = m.relations[s.relation++];
      if ((await relationTarget(r.targetKey)) !== r.available) bad();
      break;
    }
    case 'field': {
      const owner = (await dep(section === 'base:field' ? 'base:item' : 'anchor', u.id)).value.meta,
        fields = section === 'base:field' ? owner.fields : owner.item.fields;
      if (
        !fields.some(
          (f) =>
            f.field === u.field &&
            f.bytes === u.byteLength &&
            f.chunkCount === u.chunkCount &&
            f.sha256 === u.contentHash,
        )
      )
        bad();
      return finish();
    }
    case 'body': {
      const owner = (await dep('base:item', m.sourceKey)).value.meta,
        f = owner.fields.find((f) => f.field === m.field);
      if (
        !f ||
        f.bodySourceKey !== m.sourceKey ||
        m.index >= f.chunkCount ||
        baseBodyKey(m.sourceKey, m.field, m.index) !== u.id
      )
        bad();
      return finish();
    }
    case 'link-owner': {
      const owner = (await dep('base:item', m.sourceKey)).value.meta;
      if (
        m.kind === 'scene'
          ? owner.kind !== 'scene'
          : !['scene', 'arc', 'milestone', 'event'].includes(owner.kind)
      )
        bad();
      s.phase = 'link-target';
      break;
    }
    case 'link-target': {
      const t = await readers.find('base:item', m.target.sourceKey, null, true);
      if (
        available(t) !== m.target.available ||
        (t && available(t) && t.value.meta.kind !== m.target.kind)
      )
        bad();
      if (t) emit(t);
      if (m.target.kind !== 'lore' || !m.target.available) return finish();
      const o = t.value.meta.origin;
      s.target =
        o.kind === 'lore'
          ? { kind: 'universe', scopeId: o.scopeId, entityId: o.id }
          : { kind: 'adventure', scopeId: o.adventureId, entityId: o.id };
      s.phase = 'link-ledger';
      break;
    }
    case 'link-ledger': {
      const ledger = (await dep('base:loreReferences', digest(s.target))).value.meta;
      if (ledger.targetKey !== m.target.sourceKey || !ledger.available) bad();
      s.target = null;
      return finish();
    }
    case 'ledger-reverse':
      await reverse('lore', m.targetKey);
      s.phase = 'ledger-target';
      break;
    case 'ledger-target': {
      const t = await readers.find('base:item', m.targetKey, null, true);
      if (available(t) !== m.available) bad();
      if (m.available) {
        const o = t.value.meta.origin;
        if (t.value.meta.kind !== 'lore') bad();
        const ref =
          o.kind === 'lore'
            ? { kind: 'universe', scopeId: o.scopeId, entityId: o.id }
            : { kind: 'adventure', scopeId: o.adventureId, entityId: o.id };
        if (digest(ref) !== u.id) bad();
      }
      return finish();
    }
    case 'image':
      await reverse('image', u.id);
      return finish();
    case 'variant-witness': {
      const proof = (await dep('w:anchor', u.id, null, false)).value.record;
      if (proof[2] !== u.outcome) bad();
      if (m) {
        s.proof = proof;
        s.phase = 'variant-anchor';
      } else s.phase = 'variant-unavailable';
      break;
    }
    case 'variant-anchor': {
      const anchor = (await dep('anchor', m.anchorKey)).value.meta,
        proof = s.proof;
      if (
        anchor.item.sourceKey !== u.id ||
        proof[3].anchorKey !== m.anchorKey ||
        m.anchorKey !== digest({ capturedBaseId: proof[3].base.baseId, sourceKey: u.id })
      )
        bad();
      sourceMatches(anchor.source, proof[3].base);
      itemMatches(anchor.item, proof[3].item, proof[3].base);
      if (
        active &&
        !['legacy', 'inactive'].includes(m.participation) &&
        proof[3].base.baseId !== active.baseId
      )
        bad();
      s.proof = null;
      s.phase = 'variant-relations';
      break;
    }
    case 'variant-unavailable':
      await dep('anchor', u.id, null, false);
      return finish();
    case 'variant-relations': {
      if (s.relation >= m.relations.length) return finish();
      const r = m.relations[s.relation++];
      if (r.unresolved) {
        const target = await readers.find('base:item', r.targetKey, null, true);
        if (target && available(target) && target.value.meta.kind !== 'lore') bad();
        counts.unresolvedRelations = add(counts.unresolvedRelations);
      } else if ((await relationTarget(r.targetKey, true)) !== r.available) bad();
      break;
    }
    case 'anchor-fields': {
      if (s.field >= m.item.fields.length) {
        s.phase = 'anchor-relations';
        break;
      }
      const f = m.item.fields[s.field++];
      if (f.bodySourceKey !== m.item.sourceKey) bad();
      await dep('anchor:field', u.id, f.field);
      break;
    }
    case 'anchor-relations': {
      if (s.relation >= m.item.relations.length) return finish();
      const r = m.item.relations[s.relation++],
        a = await readers.find('base:item', r.targetKey, null, true),
        v = await readers.find('variant', r.targetKey, null, true);
      if (a && available(a) && a.value.meta.kind !== 'lore') bad();
      if (!a && !v) counts.externalAnchorTargets = add(counts.externalAnchorTargets);
      break;
    }
    default:
      bad();
  }
  return { done: false };
}
