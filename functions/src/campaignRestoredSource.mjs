import { assertLoreItemOrigin } from './campaignLoreOrigin.mjs';
import { validatePortableCampaignWitness } from './portableCampaignProvenance.mjs';
import { readCampaignSourceAccess } from './campaignSourceAccess.mjs';
import { digest, workFail, workId, readWorkMetadata } from './workProgressContracts.mjs';

const hash = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const closed = (v, keys) =>
  v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).length === keys.length &&
  Object.keys(v).every((k) => keys.includes(k));
const bad = () =>
  workFail(
    'failed-precondition',
    'A procedência restaurada está inconsistente.',
    'campaign-restored-source-inconsistent',
  );
function evidence(value, kind) {
  if (
    !closed(value, ['schemaVersion', 'archiveHash', 'source']) ||
    value.schemaVersion !== 1 ||
    !hash(value.archiveHash)
  )
    bad();
  let source;
  try {
    source = validatePortableCampaignWitness(value.source);
  } catch {
    bad();
  }
  if (source.kind !== kind) bad();
  return { archiveHash: value.archiveHash, source };
}
/** Absence of both discriminants identifies an existing native capture. */
export function restoredCampaignBaseSource(base) {
  if (!Object.hasOwn(base, 'sourceMode') && !Object.hasOwn(base, 'sourceEvidence')) return null;
  if (base.sourceMode !== 'restored' || !Object.hasOwn(base, 'sourceEvidence')) bad();
  const result = evidence(base.sourceEvidence, 'base'),
    source = result.source;
  if (
    source.adventure.id !== base.adventureId ||
    source.capturedAt !== base.capturedAt ||
    (source.universe.kind === 'none'
      ? base.universeId != null
      : source.universe.id !== base.universeId)
  )
    bad();
  return result;
}
/** Current authorization never treats the new base's birth as evidence of an old source. */
export async function readRestoredCampaignBaseAccess(tx, db, uid, base) {
  const proof = restoredCampaignBaseSource(base);
  return proof
    ? { ...proof, ...(await readCampaignSourceAccess(tx, db, uid, proof.source)) }
    : null;
}
function itemSource(baseProof, item) {
  const proof = evidence(item.sourceEvidence, 'item'),
    source = proof.source,
    origin = item.origin;
  if (
    proof.archiveHash !== baseProof.archiveHash ||
    source.baseId !== baseProof.source.baseId ||
    source.sourceKey !== item.sourceKey ||
    source.availability !== 'available' ||
    !hash(item.sourceKey) ||
    !origin ||
    digest(origin) !== item.sourceKey
  )
    bad();
  const o = source.origin;
  if (item.kind === 'lore') {
    if (origin.kind === 'lore') {
      if (
        o.kind !== 'lore' ||
        o.scopeId !== origin.scopeId ||
        o.entityId !== origin.id ||
        baseProof.source.universe.kind !== 'reference' ||
        o.scopeId !== baseProof.source.universe.id
      )
        bad();
    } else if (origin.kind === 'adventure-lore') {
      if (
        o.kind !== 'adventure-lore' ||
        o.adventureId !== origin.adventureId ||
        o.entityId !== origin.id ||
        o.adventureId !== baseProof.source.adventure.id
      )
        bad();
    } else bad();
  } else if (
    o.kind !== 'adventure' ||
    o.adventureId !== baseProof.source.adventure.id ||
    origin.adventureId !== o.adventureId ||
    origin.kind !== item.kind
  )
    bad();
  return source;
}
export async function restoredCampaignItemAvailable(tx, db, context, item) {
  const baseProof = restoredCampaignBaseSource(context.base);
  if (!baseProof) {
    if (Object.hasOwn(item, 'sourceEvidence')) bad();
    return null;
  }
  workId(item.sourceKey);
  // Existing list/relationship projections intentionally omit private evidence.
  const head = (
    await readWorkMetadata(tx, db.doc(context.path + '/items/' + item.sourceKey), [
      'sourceKey',
      'kind',
      'origin',
      'sourceEvidence',
    ])
  ).data();
  if (!head) return false;
  if (
    head.sourceKey !== item.sourceKey ||
    head.kind !== item.kind ||
    digest(head.origin) !== digest(item.origin)
  )
    bad();
  if (head.kind === 'lore') assertLoreItemOrigin(head, context.base);
  const source = itemSource(baseProof, head);
  const access = await readCampaignSourceAccess(tx, db, context.uid, baseProof.source, source);
  return access.availability === 'available';
}
