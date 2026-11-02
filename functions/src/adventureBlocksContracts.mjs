import {
  workScope,
  workClosed,
  workId,
  workProject,
  workFail,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import { digest } from './sceneContracts.mjs';
import { adventureBlockState, adventureSceneFields } from './adventureBlocksState.mjs';

export function adventureBlockScope(db, uid, data, fields) {
  if (!uid) workFail('unauthenticated', 'Entre na sua conta.');
  workClosed(data, ['adventureId', ...fields]);
  return workScope(db, uid, { target: { kind: 'adventure', id: workId(data.adventureId) } }, []);
}
export function adventureBlockResource(value) {
  workClosed(value, ['kind', 'id']);
  if (!['scene', 'block'].includes(value.kind)) workFail('invalid-argument', 'Bloco inválido.');
  return { kind: value.kind, id: workId(value.id) };
}
export async function readAdventureScene(
  tx,
  db,
  context,
  id,
  { repair = false, includeState = true } = {},
) {
  if (context.target.kind !== 'adventure') workFail('invalid-argument', 'Aventura inválida.');
  const root = await workProject(tx, context),
    snapshot = await tx.get(db.doc(context.path + '/scenes/' + workId(id))),
    scene = snapshot.data();
  if (!scene || scene.ownerId !== context.uid || scene.deleting)
    workFail('not-found', 'Cena indisponível.');
  if (scene.parentId !== null) {
    const parent = (
      await readWorkMetadata(tx, db.doc(context.path + '/parts/' + workId(scene.parentId)), [
        'ownerId',
        'deleting',
      ])
    ).data();
    if (
      !parent ||
      (parent.ownerId && parent.ownerId !== context.uid) ||
      (parent.deleting && !scene.archived)
    )
      workFail('not-found', 'Cena indisponível.');
  }
  return {
    context,
    root,
    sceneSnapshot: snapshot,
    scene,
    state: includeState ? adventureBlockState(scene, { repair }) : null,
  };
}
export async function readAdventureResource(tx, db, context, resource, options) {
  if (resource.kind === 'scene') {
    const value = await readAdventureScene(tx, db, context, resource.id, options);
    return { ...value, resource, blockSnapshot: value.sceneSnapshot, block: value.scene };
  }
  const snapshot = await tx.get(db.doc(context.path + '/sceneBlocks/' + workId(resource.id))),
    block = snapshot.data();
  if (!block || block.ownerId !== context.uid || block.deleting)
    workFail('not-found', 'Bloco indisponível.');
  return {
    ...(await readAdventureScene(tx, db, context, workId(block.sceneId), options)),
    resource,
    blockSnapshot: snapshot,
    block,
  };
}
export function adventureBlockTotals(scene) {
  const state = adventureBlockState(scene);
  return {
    sceneRevision: scene.revision,
    sceneWordCount: state.total,
    structureRevision: state.structure,
    mainBodyHash: scene.bodyHash,
  };
}
export function adventureBlockSummary(resource, scene, block = scene) {
  const main = resource.kind === 'scene',
    state = adventureBlockState(scene),
    fields = adventureSceneFields(scene);
  return {
    resource,
    sceneId: scene.id,
    revision: block.revision,
    title: main ? fields.mainBlockTitle : block.title,
    narrativeType: main ? fields.mainBlockType : block.narrativeType,
    audience: main ? fields.mainBlockAudience : block.audience,
    archived: main ? false : block.archived,
    order: main ? state.mainOrder : block.order,
    wordCount: main ? state.main : block.wordCount,
    bodyHash: block.bodyHash,
    bodyBytes: block.bodyBytes,
    createdAt: block.createdAt,
    updatedAt: block.updatedAt,
  };
}
export async function readAdventureBody(tx, db, value) {
  const snapshot = await tx.get(db.doc(value.blockSnapshot.ref.path + '/body/current')),
    body = snapshot.data();
  if (
    !body ||
    typeof body.content !== 'string' ||
    digest(body.content) !== body.hash ||
    body.hash !== value.block.bodyHash
  )
    workFail('failed-precondition', 'Corpo do bloco inconsistente.');
  return { snapshot, content: body.content };
}
