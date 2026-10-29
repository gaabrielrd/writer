import { restoredCampaignBaseSource } from './campaignRestoredSource.mjs';
import { workFail } from './workProgressContracts.mjs';
const hash = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const closed = (v, required, optional = []) =>
  v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  required.every((k) => Object.hasOwn(v, k)) &&
  Object.keys(v).every((k) => required.includes(k) || optional.includes(k));
const bad = () =>
  workFail(
    'failed-precondition',
    'As relações portáteis estão inconsistentes.',
    'campaign-portable-relations-inconsistent',
  );
const text = (v) => {
  if (typeof v !== 'string' || Buffer.from(v).toString('utf8') !== v) bad();
  return v;
};
/** Server-owned frozen metadata; logical keys never authorize live target lookup. */
export function portableBaseLoreRelations(base, item) {
  const stored = item.structured;
  if (
    !stored ||
    (!Object.hasOwn(stored, 'relationMode') && !Object.hasOwn(stored, 'portableRelations'))
  )
    return null;
  if (
    item.kind !== 'lore' ||
    !restoredCampaignBaseSource(base) ||
    stored.relationMode !== 'portable' ||
    Object.hasOwn(stored, 'relations') ||
    !Array.isArray(stored.portableRelations) ||
    stored.portableRelations.length > 50
  )
    bad();
  return Object.freeze(
    stored.portableRelations.map((r) => {
      if (!r || typeof r.available !== 'boolean' || !hash(r.targetKey)) bad();
      if (!r.available) {
        if (!closed(r, ['targetKey', 'available'])) bad();
        return Object.freeze({ targetKey: r.targetKey, available: false });
      }
      if (!closed(r, ['targetKey', 'available', 'relationType'], ['description'])) bad();
      return Object.freeze({
        targetKey: r.targetKey,
        available: true,
        relationType: text(r.relationType),
        ...(Object.hasOwn(r, 'description') ? { description: text(r.description) } : {}),
      });
    }),
  );
}
