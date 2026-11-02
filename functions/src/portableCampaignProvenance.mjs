const encoder = new TextEncoder(),
  decoder = new TextDecoder('utf-8', { fatal: true });
const bad = () => {
  throw new TypeError('Procedência portátil de campanha inválida.');
};
const closed = (v, keys) =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).length === keys.length &&
  Object.keys(v).every((k) => keys.includes(k));
const hash = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function id(v) {
  if (
    typeof v !== 'string' ||
    !v ||
    v.length > 1500 ||
    v.includes('/') ||
    ['.', '..'].includes(v) ||
    encoder.encode(v).length > 1500 ||
    decoder.decode(encoder.encode(v)) !== v
  )
    bad();
  return v;
}
function born(v) {
  if (
    !closed(v, ['seconds', 'nanoseconds']) ||
    !Number.isSafeInteger(v.seconds) ||
    v.seconds < 0 ||
    !Number.isInteger(v.nanoseconds) ||
    v.nanoseconds < 0 ||
    v.nanoseconds >= 1e9
  )
    bad();
  return Object.freeze({ seconds: v.seconds, nanoseconds: v.nanoseconds });
}
function universe(v) {
  if (closed(v, ['kind']) && v.kind === 'none') return Object.freeze({ kind: 'none' });
  if (closed(v, ['kind', 'id']) && v.kind === 'unavailable')
    return Object.freeze({ kind: 'unavailable', id: id(v.id) });
  if (!closed(v, ['kind', 'id', 'born']) || v.kind !== 'reference') bad();
  return Object.freeze({ kind: 'reference', id: id(v.id), born: born(v.born) });
}
function base(v) {
  if (
    !closed(v, ['kind', 'baseId', 'capturedAt', 'adventure', 'universe']) ||
    v.kind !== 'base' ||
    !hash(v.baseId) ||
    !Number.isFinite(v.capturedAt) ||
    v.capturedAt < 0 ||
    v.capturedAt > 8640000000000000 ||
    !closed(v.adventure, ['id', 'born'])
  )
    bad();
  return Object.freeze({
    kind: 'base',
    baseId: v.baseId,
    capturedAt: v.capturedAt,
    adventure: Object.freeze({ id: id(v.adventure.id), born: born(v.adventure.born) }),
    universe: universe(v.universe),
  });
}
function item(v) {
  const available = v?.availability === 'available';
  if (
    !closed(v, ['kind', 'baseId', 'sourceKey', 'availability', ...(available ? ['origin'] : [])]) ||
    v.kind !== 'item' ||
    !hash(v.baseId) ||
    !hash(v.sourceKey) ||
    !['available', 'unavailable'].includes(v.availability)
  )
    bad();
  const result = {
    kind: 'item',
    baseId: v.baseId,
    sourceKey: v.sourceKey,
    availability: v.availability,
  };
  if (!available) return Object.freeze(result);
  const o = v.origin;
  let origin;
  if (closed(o, ['kind', 'adventureId']) && o.kind === 'adventure')
    origin = { kind: 'adventure', adventureId: id(o.adventureId) };
  else if (closed(o, ['kind', 'scopeId', 'entityId', 'born']) && o.kind === 'lore')
    origin = { kind: 'lore', scopeId: id(o.scopeId), entityId: id(o.entityId), born: born(o.born) };
  else if (closed(o, ['kind', 'adventureId', 'entityId', 'born']) && o.kind === 'adventure-lore')
    origin = {
      kind: 'adventure-lore',
      adventureId: id(o.adventureId),
      entityId: id(o.entityId),
      born: born(o.born),
    };
  else bad();
  return Object.freeze({ ...result, origin: Object.freeze(origin) });
}
/** Pure closed projections; these facts require an authenticated manifest and current authorization. */
export function validatePortableCampaignWitness(v) {
  if (v?.kind === 'project') {
    if (!closed(v, ['kind', 'campaignId', 'universe'])) bad();
    return Object.freeze({
      kind: 'project',
      campaignId: id(v.campaignId),
      universe: universe(v.universe),
    });
  }
  if (v?.kind === 'base') return base(v);
  if (v?.kind === 'item') return item(v);
  if (
    !closed(v, ['kind', 'anchorKey', 'base', 'item']) ||
    v.kind !== 'anchor' ||
    !hash(v.anchorKey)
  )
    bad();
  const b = base(v.base),
    i = item(v.item);
  if (
    i.availability !== 'available' ||
    b.baseId !== i.baseId ||
    i.origin.kind === 'adventure' ||
    (i.origin.kind === 'adventure-lore' && i.origin.adventureId !== b.adventure.id) ||
    (i.origin.kind === 'lore' &&
      (b.universe.kind !== 'reference' || i.origin.scopeId !== b.universe.id))
  )
    bad();
  return Object.freeze({ kind: 'anchor', anchorKey: v.anchorKey, base: b, item: i });
}
