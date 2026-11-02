import sharp from 'sharp';
import {
  adventureBlockScope,
  readAdventureScene,
  readAdventureResource,
  readAdventureBody,
} from './adventureBlocksContracts.mjs';
import { adventureImage } from './adventureBlockImages.mjs';
import { readActiveLibraryImage } from './imageLibrary.mjs';
import { workId, workLimit, workFail, workClosed, digest } from './workProgressContracts.mjs';
import { historyCursor, encodeHistoryCursor, sourceToken } from './workHistoryContracts.mjs';
import {
  PREVIEW_BYTES,
  PREVIEW_IMAGE_BYTES,
  previewAudience,
  allowedAudience,
  previewToken,
  previewImageResource,
  previewStamp,
  previewItem,
} from './adventurePreviewContracts.mjs';

export async function deriveAdventurePreviewImage(bytes) {
  try {
    if (!Buffer.isBuffer(bytes) || bytes.length > 25 * 1024 * 1024) throw new Error();
    const output = await sharp(bytes, { limitInputPixels: 25000000 })
      .rotate()
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    if (output.length > PREVIEW_IMAGE_BYTES) throw new Error();
    return output;
  } catch {
    workFail('failed-precondition', 'Não foi possível preparar a imagem da prévia.');
  }
}
export function createAdventurePreviewService({
  db,
  assets,
  deriveImage = deriveAdventurePreviewImage,
}) {
  async function imageAccess(uid, data) {
    const context = adventureBlockScope(db, uid, data, [
        'sceneId',
        'audience',
        'projectionToken',
        'imageKey',
      ]),
      id = workId(data.sceneId),
      audience = previewAudience(data.audience),
      token = sourceToken(data.projectionToken),
      resource = previewImageResource(data.imageKey, token);
    return db.runTransaction(async (tx) => {
      const value = await readAdventureResource(tx, db, context, resource);
      if (value.scene.id !== id || previewToken(context, value, audience) !== token)
        workFail('failed-precondition', 'A prévia mudou. Atualize para continuar.');
      const blockAudience =
        resource.kind === 'scene'
          ? (value.scene.mainBlockAudience ?? 'creator')
          : (value.block.audience ?? 'creator');
      if (
        (resource.kind === 'block' && value.block.archived) ||
        !allowedAudience(audience, blockAudience)
      )
        workFail('not-found', 'Imagem indisponível nesta prévia.');
      const link = adventureImage(resource, value.scene, value.block);
      if (!link) workFail('not-found', 'Imagem indisponível nesta prévia.');
      const image = await readActiveLibraryImage(tx, db, uid, link.imageId);
      if (image.value.useCount < 1)
        workFail('failed-precondition', 'O vínculo da imagem está inconsistente.');
      return {
        path: image.value.path,
        identity: digest({
          token,
          resource,
          link,
          snapshot: previewStamp(image.snapshot),
          path: image.value.path,
        }),
      };
    });
  }
  return {
    async readAdventureScenePreview(uid, data) {
      const context = adventureBlockScope(db, uid, data, [
          'sceneId',
          'audience',
          'cursor',
          'limit',
        ]),
        id = workId(data.sceneId),
        audience = previewAudience(data.audience),
        limit = workLimit(data.limit);
      return db.runTransaction(async (tx) => {
        const value = await readAdventureScene(tx, db, context, id),
          token = previewToken(context, value, audience),
          scope = { projection: token },
          cursor = historyCursor(data.cursor, scope);
        if (cursor) workClosed(cursor, ['version', 'scope', 'date', 'id']);
        if (cursor && (!Number.isSafeInteger(cursor.date) || cursor.date < 0))
          workFail('invalid-argument', 'Página inválida.');
        if (cursor) workId(cursor.id);
        let query = db
          .collection(context.path + '/sceneBlocks')
          .where('sceneId', '==', id)
          .where('archived', '==', false)
          .where('deleting', '==', false);
        if (audience === 'gm') query = query.where('audience', 'in', ['gm', 'players']);
        else if (audience === 'players') query = query.where('audience', '==', 'players');
        query = query
          .orderBy('order')
          .orderBy('__name__')
          .limit(limit + 1)
          .select(
            'ownerId',
            'sceneId',
            'revision',
            'title',
            'narrativeType',
            'audience',
            'archived',
            'deleting',
            'order',
            'bodyHash',
            'image',
          );
        if (cursor) query = query.startAfter(cursor.date, cursor.id);
        const page = await tx.get(query),
          candidates = page.docs.map((snapshot) => ({
            snapshot,
            block: snapshot.data(),
            resource: { kind: 'block', id: snapshot.id },
          }));
        const mainOrder = value.state.mainOrder;
        if (
          allowedAudience(audience, value.scene.mainBlockAudience ?? 'creator') &&
          (!cursor || mainOrder > cursor.date || (mainOrder === cursor.date && id > cursor.id))
        )
          candidates.push({
            snapshot: value.sceneSnapshot,
            block: value.scene,
            resource: { kind: 'scene', id },
            order: mainOrder,
          });
        candidates.sort(
          (a, b) =>
            (a.order ?? a.block.order) - (b.order ?? b.block.order) ||
            (a.resource.id < b.resource.id ? -1 : 1),
        );
        const items = [];
        let last = null;
        for (const candidate of candidates.slice(0, limit)) {
          if (
            candidate.block.ownerId !== uid ||
            (candidate.resource.kind === 'block' && candidate.block.sceneId !== id)
          )
            workFail('failed-precondition', 'Bloco inconsistente.');
          const body = await readAdventureBody(tx, db, {
              blockSnapshot: candidate.snapshot,
              block: candidate.block,
            }),
            item = previewItem(
              candidate.resource,
              value.scene,
              candidate.block,
              body.content,
              adventureImage(candidate.resource, value.scene, candidate.block),
              token,
            ),
            nextCursor = encodeHistoryCursor({
              scope,
              date: candidate.order ?? candidate.block.order,
              id: candidate.resource.id,
            });
          if (
            Buffer.byteLength(
              JSON.stringify({ items: [...items, item], nextCursor, projectionToken: token }),
            ) > PREVIEW_BYTES
          ) {
            if (!items.length)
              workFail('failed-precondition', 'O bloco ultrapassa o orçamento da prévia.');
            break;
          }
          items.push(item);
          last = candidate;
        }
        return {
          items,
          projectionToken: token,
          nextCursor:
            candidates.length > items.length
              ? encodeHistoryCursor({
                  scope,
                  date: last.order ?? last.block.order,
                  id: last.resource.id,
                })
              : null,
        };
      });
    },
    async readAdventurePreviewImage(uid, data) {
      const before = await imageAccess(uid, data);
      let bytes;
      try {
        bytes = await assets.read(before.path);
      } catch {
        workFail('unavailable', 'Não foi possível carregar a imagem da prévia.');
      }
      const output = await deriveImage(bytes);
      if (!Buffer.isBuffer(output) || output.length > PREVIEW_IMAGE_BYTES)
        workFail('failed-precondition', 'A imagem ultrapassa o orçamento da prévia.');
      const after = await imageAccess(uid, data);
      if (after.identity !== before.identity)
        workFail('failed-precondition', 'A imagem mudou. Atualize a prévia.');
      return { dataUrl: 'data:image/webp;base64,' + output.toString('base64') };
    },
  };
}
