import { digest, workFail, workId, readWorkMetadata } from './workProgressContracts.mjs';
import { basePath } from './campaignBaseContracts.mjs';

const bad = () => workFail('failed-precondition', 'O armazenamento do lore está inconsistente.');
const hash = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export const loreGenerationPath = (campaignId, generationId) =>
  `campaigns/${campaignId}/loreGenerations/${generationId}`;
export const loreGuardPath = (uid, campaignId, campaignToken) =>
  `users/${uid}/campaignAdoptionGuards/${digest({ campaignId, campaignToken })}`;
export async function loreStorageContext(tx, db, context) {
  const generationId = context.campaign.activeLoreGenerationId;
  if (!Object.hasOwn(context.campaign, 'activeLoreGenerationId'))
    return { lorePath: `campaigns/${context.campaignId}`, generationId: null };
  if (!hash(generationId)) bad();
  const path = loreGenerationPath(context.campaignId, generationId);
  const value = (
    await readWorkMetadata(tx, db.doc(path), [
      'schemaVersion',
      'ownerId',
      'campaignId',
      'campaignToken',
      'baseId',
      'state',
      'id',
    ])
  ).data();
  if (
    !value ||
    value.schemaVersion !== 1 ||
    value.id !== generationId ||
    value.ownerId !== context.uid ||
    value.campaignId !== context.campaignId ||
    value.campaignToken !== context.campaignToken ||
    value.baseId !== context.base.id ||
    value.state !== 'ready'
  )
    bad();
  return { lorePath: path, generationId };
}
export async function readLoreGuard(tx, db, context) {
  const ref = db.doc(loreGuardPath(context.uid, context.campaignId, context.campaignToken));
  const record = (await tx.get(ref)).data();
  if (
    record &&
    (record.schemaVersion !== 1 ||
      record.ownerId !== context.uid ||
      record.campaignId !== context.campaignId ||
      record.campaignToken !== context.campaignToken ||
      !Number.isSafeInteger(record.admissionEpoch) ||
      record.admissionEpoch < 0 ||
      (record.adoptionId != null && typeof record.adoptionId !== 'string'))
  )
    bad();
  return { ref, record };
}
export function assertLoreAdmission(context) {
  if (context.guard?.record?.adoptionId != null)
    workFail(
      'failed-precondition',
      'Uma adoção está em preparação. Encerre-a antes de editar.',
      'adoption-in-progress',
    );
}
export function normalizedBodyBinding(context, overlay) {
  if (!overlay?.manifest) return null;
  const binding = overlay.bodyBinding ?? {
    schemaVersion: 1,
    layout: context.generationId ? 'generation' : 'legacy',
    generationId: context.generationId ?? null,
    baseId: context.base.id,
    sourceKey: overlay.sourceKey,
    bodyRevision: overlay.manifest.bodyRevision,
  };
  if (
    binding.schemaVersion !== 1 ||
    !['legacy', 'generation'].includes(binding.layout) ||
    !hash(binding.baseId) ||
    binding.sourceKey !== overlay.sourceKey ||
    binding.bodyRevision !== overlay.manifest.bodyRevision ||
    (binding.layout === 'legacy' ? binding.generationId !== null : !hash(binding.generationId)) ||
    Object.keys(binding).some(
      (key) =>
        ![
          'schemaVersion',
          'layout',
          'generationId',
          'baseId',
          'sourceKey',
          'bodyRevision',
        ].includes(key),
    )
  )
    bad();
  return binding;
}
export function bindingPath(context, binding) {
  return binding.layout === 'legacy'
    ? `campaigns/${context.campaignId}`
    : loreGenerationPath(context.campaignId, binding.generationId);
}
export async function validateBodyStorage(tx, db, context, binding) {
  if (binding.layout === 'legacy') {
    const base = (
      await readWorkMetadata(tx, db.doc(basePath(context.uid, binding.baseId)), [
        'schemaVersion',
        'id',
        'ownerId',
        'campaignId',
        'adventureId',
        'state',
      ])
    ).data();
    if (
      !base ||
      base.schemaVersion !== 1 ||
      base.id !== binding.baseId ||
      base.ownerId !== context.uid ||
      base.campaignId !== context.campaignId ||
      base.adventureId !== context.base.adventureId ||
      base.state !== 'ready'
    )
      bad();
    return;
  }
  const value = (
    await readWorkMetadata(tx, db.doc(bindingPath(context, binding)), [
      'schemaVersion',
      'ownerId',
      'campaignId',
      'campaignToken',
      'baseId',
      'state',
      'id',
    ])
  ).data();
  if (
    !value ||
    value.schemaVersion !== 1 ||
    value.id !== binding.generationId ||
    value.ownerId !== context.uid ||
    value.campaignId !== context.campaignId ||
    value.campaignToken !== context.campaignToken ||
    value.baseId !== binding.baseId ||
    value.state !== 'ready'
  )
    bad();
}
export async function validateOldBodyRefs(tx, db, context, overlay, refs) {
  if (!overlay?.manifest) return;
  const binding = normalizedBodyBinding(context, overlay);
  await validateBodyStorage(tx, db, context, binding);
  for (let index = 0; index < refs.length; index++) {
    const value = (
      await readWorkMetadata(tx, refs[index], [
        'sourceKey',
        'baseId',
        'campaignToken',
        'revision',
        'index',
      ])
    ).data();
    if (
      !value ||
      value.sourceKey !== overlay.sourceKey ||
      value.baseId !== binding.baseId ||
      value.campaignToken !== context.campaignToken ||
      value.revision !== binding.bodyRevision ||
      value.index !== index
    )
      bad();
  }
}
export async function anchorContext(tx, db, context, anchor) {
  if (
    !anchor ||
    !hash(anchor.capturedBaseId) ||
    !hash(anchor.sourceKey) ||
    Object.keys(anchor).some((key) => !['capturedBaseId', 'sourceKey'].includes(key))
  )
    bad();
  if (anchor.capturedBaseId === context.base.id) return context;
  const path = basePath(context.uid, anchor.capturedBaseId);
  const base = (
    await readWorkMetadata(tx, db.doc(path), [
      'id',
      'ownerId',
      'campaignId',
      'adventureId',
      'schemaVersion',
      'state',
      'universeId',
    ])
  ).data();
  if (
    !base ||
    base.schemaVersion !== 1 ||
    base.id !== anchor.capturedBaseId ||
    base.ownerId !== context.uid ||
    base.campaignId !== context.campaignId ||
    base.adventureId !== context.base.adventureId ||
    base.state !== 'ready'
  )
    bad();
  const world =
    base.universeId == null
      ? null
      : (
          await readWorkMetadata(tx, db.doc(`universes/${workId(base.universeId)}`), [
            'authorId',
            'deleting',
            'loreVersion',
            'privacyVersion',
          ])
        ).data();
  return { ...context, base, path, world };
}
export const loreOverlayFields = [
  'schemaVersion',
  'ownerId',
  'campaignId',
  'campaignToken',
  'baseId',
  'sourceKey',
  'revision',
  'mode',
  'previousMode',
  'createdAt',
  'updatedAt',
  'name',
  'category',
  'manifest',
  'bodyBinding',
  'anchor',
  'participation',
  'retainedLegacy',
];
export async function loreWindow(tx, db, context, after, size) {
  let a = db
    .collection(context.path + '/items')
    .where('kind', '==', 'lore')
    .orderBy('__name__')
    .limit(size + 1)
    .select('sourceKey', 'origin', 'originAdventureToken', 'kind', 'title', 'structured.category');
  let b = db
    .collection(context.lorePath + '/loreVariants')
    .orderBy('__name__')
    .limit(size + 1)
    .select(...loreOverlayFields);
  if (after) {
    a = a.startAfter(after);
    b = b.startAfter(after);
  }
  const ad = (await tx.get(a)).docs,
    bd = (await tx.get(b)).docs;
  const keys = [...new Set([...ad.map((d) => d.id), ...bd.map((d) => d.id)])].sort();
  const items = new Map(ad.map((d) => [d.id, d.data()]));
  return { keys: keys.slice(0, size), items, more: keys.length > size };
}
