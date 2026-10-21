import { validateId } from './generation.mjs';
import { workRevision, workConflict } from './workProgressContracts.mjs';
import { token } from './campaignSessionsContracts.mjs';
import { baseSourceKey } from './campaignBaseContracts.mjs';
import { validateCapturedFields } from './campaignBaseRead.mjs';
import {
  fail,
  scopeInput,
  scopeFields,
  sourceContextInput,
  ownCampaign,
  activeSession,
  referenceControl,
  readWorkMetadata,
  referenceFields,
  storedReference,
  optionalLore,
  projectedContext,
  compareSource,
  envelope,
  sceneRecord,
  sceneCandidate,
  digest,
} from './campaignSessionReferenceContracts.mjs';

export const sceneReadFields = [
  ...scopeFields,
  'referenceId',
  'expectedRevision',
  'expectedReferenceCollectionRevision',
  'sourceContext',
];
export const blockFields = [
  'sourceKey',
  'kind',
  'parentKey',
  'origin',
  'title',
  'orderKey',
  'type',
  'audience',
  'role',
  'archived',
  'structured.ownArchived',
];
export const narrativeTypes = [
  'introduction',
  'preparation',
  'scene',
  'location',
  'quest',
  'clue',
  'ending',
];
export const materialFail = () =>
  fail(
    'failed-precondition',
    'O material capturado está inconsistente.',
    'scene-material-inconsistent',
  );
const utf8 = (value) => typeof value === 'string' && Buffer.from(value).toString('utf8') === value;
export function archiveInput(value = 'active') {
  if (!['active', 'archived', 'all'].includes(value)) fail('invalid-argument', 'Arquivo inválido.');
  return value;
}
export function sceneReadInput(uid, data, extra) {
  scopeInput(uid, data, [...sceneReadFields, ...extra]);
  validateId(data.referenceId);
  if (!workRevision(data.expectedRevision)) fail('invalid-argument', 'Revisão inválida.');
  workRevision(data.expectedReferenceCollectionRevision);
  sourceContextInput(data.sourceContext);
}
export async function sceneReadContext(tx, db, uid, data) {
  const c = await referenceControl(
    tx,
    db,
    await activeSession(tx, db, await ownCampaign(tx, db, uid, data), data),
  );
  if (c.referenceCollectionRevision !== data.expectedReferenceCollectionRevision) workConflict();
  const reference = storedReference(
    (
      await readWorkMetadata(
        tx,
        db.doc(c.path + '/sessionReferences/' + data.referenceId),
        referenceFields,
      )
    ).data(),
    c,
    data.referenceId,
  );
  if (!reference || reference.deleted) fail('not-found', 'Vínculo indisponível.');
  if (reference.revision !== data.expectedRevision) workConflict();
  if (reference.target.kind !== 'scene') fail('invalid-argument', 'O vínculo não é de cena.');
  const context = await optionalLore(tx, db, c),
    sourceContext = projectedContext(context);
  compareSource(data.sourceContext, sourceContext);
  const scene = context ? await sceneRecord(tx, db, context, reference.target.sourceKey) : null;
  return { c, reference, context, sourceContext, scene };
}
export const sceneEnvelope = (access) => ({
  ...envelope(access.c),
  referenceId: access.reference.id,
  referenceRevision: access.reference.revision,
  sourceContext: access.sourceContext,
});
export const projectedScene = (access) =>
  access.scene ? sceneCandidate(access.scene, access.context, access.scene.sourceKey) : null;
export function blockSummary(item, access, key) {
  const scene = access.scene,
    origin = item?.origin;
  if (
    !item ||
    !scene ||
    item.sourceKey !== key ||
    item.kind !== 'block' ||
    item.parentKey !== scene.sourceKey ||
    !origin ||
    Object.keys(origin).length !== 4 ||
    origin.kind !== 'block' ||
    origin.role !== item.role ||
    origin.adventureId !== access.context.base.adventureId ||
    !utf8(origin.id) ||
    !origin.id ||
    origin.id.includes('/') ||
    baseSourceKey(origin) !== key ||
    !['main', 'additional'].includes(item.role) ||
    (item.role === 'main' && origin.id !== scene.origin.id) ||
    !utf8(item.title) ||
    !utf8(item.orderKey) ||
    !item.orderKey ||
    !narrativeTypes.includes(item.type) ||
    !['creator', 'gm', 'players'].includes(item.audience) ||
    typeof item.archived !== 'boolean'
  )
    materialFail();
  const ownArchived = item.role === 'main' ? null : item.structured?.ownArchived;
  if (
    (item.role === 'main' && item.structured?.ownArchived !== undefined) ||
    (item.role === 'additional' && typeof ownArchived !== 'boolean') ||
    item.archived !== Boolean(scene.archived || ownArchived)
  )
    materialFail();
  return {
    kind: 'block',
    sourceKey: key,
    parentKey: scene.sourceKey,
    title: item.title,
    orderKey: item.orderKey,
    type: item.type,
    audience: item.audience,
    role: item.role,
    archived: item.archived,
    ownArchived,
  };
}
export async function readBlockMetadata(tx, db, access, key, extra = []) {
  if (!access.scene) return null;
  const item = (
    await readWorkMetadata(tx, db.doc(access.context.path + '/items/' + key), [
      ...blockFields,
      ...extra,
    ])
  ).data();
  if (!item) return null;
  blockSummary(item, access, key);
  return item;
}
export function validateSceneBindings(scene, context) {
  sceneCandidate(scene, context, scene.sourceKey);
  const fields = validateCapturedFields(scene);
  if (
    !fields.some((field) => field.field === 'content') ||
    fields.some((field) => field.bodySourceKey !== scene.sourceKey)
  )
    materialFail();
  return fields;
}
export function validateBlockBindings(block, scene, access) {
  blockSummary(block, access, block.sourceKey);
  const fields = validateCapturedFields(block);
  if (fields.length !== 1 || fields[0].field !== 'content') materialFail();
  const content = fields[0];
  if (block.role === 'main') {
    const main = validateSceneBindings(scene, access.context).find(
      (field) => field.field === 'content',
    );
    if (content.bodySourceKey !== scene.sourceKey || digest(content) !== digest(main))
      materialFail();
  } else if (content.bodySourceKey !== block.sourceKey) materialFail();
}
export function projectedBlockImage(block) {
  if (block.image == null) return null;
  const image = block.image;
  if (!/^[a-f0-9]{64}$/.test(image.imageKey) || !utf8(image.alt) || !utf8(image.caption))
    materialFail();
  return { imageKey: image.imageKey, alt: image.alt, caption: image.caption };
}
export function blockKeyInput(value) {
  return token(value);
}
