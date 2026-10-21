import { workLimit } from './workProgressContracts.mjs';
import { bounded, digest, fail } from './campaignSessionReferenceContracts.mjs';
import { decodeBaseCursor, encodeBaseCursor, BASE_IMAGE_BYTES } from './campaignBaseContracts.mjs';
import {
  loadContent,
  readBaseImageAccess,
  checkCapturedImageStorage,
} from './campaignBaseRead.mjs';
import { deriveAdventurePreviewImage } from './adventurePreview.mjs';
import { PREVIEW_IMAGE_BYTES } from './adventurePreviewContracts.mjs';
import {
  sceneReadInput,
  sceneReadContext,
  sceneEnvelope,
  projectedScene,
  blockFields,
  blockSummary,
  readBlockMetadata,
  validateSceneBindings,
  validateBlockBindings,
  projectedBlockImage,
  blockKeyInput,
  archiveInput,
  materialFail,
} from './campaignSessionSceneContracts.mjs';

export function createCampaignSessionScenesService({
  db,
  assets,
  deriveImage = deriveAdventurePreviewImage,
}) {
  async function imageAccess(uid, data) {
    return db.runTransaction(async (tx) => {
      const access = await sceneReadContext(tx, db, uid, data),
        envelope = sceneEnvelope(access);
      const block = await readBlockMetadata(tx, db, access, data.blockKey, [
        'image.imageKey',
        'image.alt',
        'image.caption',
      ]);
      const image = block ? projectedBlockImage(block) : null;
      if (!image) return { envelope, imageKey: null };
      const pinned = await readBaseImageAccess(tx, db, access.context, image.imageKey);
      return {
        envelope,
        imageKey: image.imageKey,
        image: pinned.image,
        binding: digest({
          envelope,
          sceneKey: access.scene.sourceKey,
          block: blockSummary(block, access, data.blockKey),
          image,
          pinIdentity: pinned.identity,
        }),
      };
    });
  }
  return {
    async listCampaignSessionSceneBlocks(uid, data) {
      sceneReadInput(uid, data, ['archive', 'cursor', 'limit']);
      const archive = archiveInput(data.archive),
        size = workLimit(data.limit);
      return db.runTransaction(async (tx) => {
        const access = await sceneReadContext(tx, db, uid, data),
          envelope = sceneEnvelope(access);
        const scope = { ...envelope, archive, resource: 'blocks' };
        const cursor = decodeBaseCursor(data.cursor, scope, ['key', 'order']);
        if (cursor) {
          blockKeyInput(cursor.key);
          if (
            typeof cursor.order !== 'string' ||
            !cursor.order ||
            Buffer.byteLength(cursor.order) > 1500
          )
            fail('invalid-argument', 'Página inválida.');
        }
        const result = { ...envelope, scene: projectedScene(access), items: [], nextCursor: null };
        if (!access.scene) return bounded(result);
        if (cursor) {
          const after = await readBlockMetadata(tx, db, access, cursor.key);
          if (
            !after ||
            after.orderKey !== cursor.order ||
            (archive !== 'all' && after.archived !== (archive === 'archived'))
          )
            fail('invalid-argument', 'Página inválida.');
        }
        let query = db
          .collection(access.context.path + '/items')
          .where('kind', '==', 'block')
          .where('parentKey', '==', access.scene.sourceKey);
        if (archive !== 'all') query = query.where('archived', '==', archive === 'archived');
        query = query
          .orderBy('orderKey')
          .orderBy('__name__')
          .limit(size + 1)
          .select(...blockFields);
        if (cursor) query = query.startAfter(cursor.order, cursor.key);
        const docs = (await tx.get(query)).docs;
        result.items = docs.slice(0, size).map((doc) => blockSummary(doc.data(), access, doc.id));
        if (docs.length > size) {
          const last = docs[size - 1];
          result.nextCursor = encodeBaseCursor({
            version: 1,
            scope,
            key: last.id,
            order: last.data().orderKey,
          });
        }
        return bounded(result);
      });
    },
    async readCampaignSessionSceneReference(uid, data) {
      sceneReadInput(uid, data, ['blockKey', 'cursor', 'limit']);
      const blockKey = Object.hasOwn(data, 'blockKey') ? blockKeyInput(data.blockKey) : null;
      const size = data.limit ?? 4;
      if (!Number.isInteger(size) || size < 1 || size > 8)
        fail('invalid-argument', 'Página inválida.');
      return db.runTransaction(async (tx) => {
        const access = await sceneReadContext(tx, db, uid, data),
          envelope = sceneEnvelope(access),
          resourceKind = blockKey ? 'block' : 'scene-plan';
        const scope = { ...envelope, resourceKind, blockKey };
        const cursor = decodeBaseCursor(data.cursor, scope, ['index']);
        const result = { ...envelope, blockKey, resourceKind, resourceKey: null, material: null };
        if (!access.scene) return bounded(result);
        let item, stored;
        if (blockKey) {
          if (!(await readBlockMetadata(tx, db, access, blockKey))) return bounded(result);
          stored = (await tx.get(db.doc(access.context.path + '/items/' + blockKey))).data();
          const scene =
            stored.role === 'main'
              ? (
                  await tx.get(db.doc(access.context.path + '/items/' + access.scene.sourceKey))
                ).data()
              : access.scene;
          validateBlockBindings(stored, scene, access);
          item = {
            ...blockSummary(stored, access, blockKey),
            fields: [],
            image: projectedBlockImage(stored),
          };
        } else {
          stored = (
            await tx.get(db.doc(access.context.path + '/items/' + access.scene.sourceKey))
          ).data();
          const fields = validateSceneBindings(stored, access.context);
          stored = { ...stored, fields: fields.filter((field) => field.field !== 'content') };
          item = { ...projectedScene(access), kind: 'scene-plan', fields: [] };
        }
        const content = await loadContent(tx, db, access.context, stored),
          offset = cursor?.index ?? 0;
        if (offset > content.chunks.length) fail('invalid-argument', 'Página inválida.');
        item.fields = content.fields;
        return bounded({
          ...result,
          resourceKey: stored.sourceKey,
          material: {
            item,
            chunks: content.chunks.slice(offset, offset + size),
            nextCursor:
              offset + size < content.chunks.length
                ? encodeBaseCursor({ version: 1, scope, index: offset + size })
                : null,
          },
        });
      });
    },
    async readCampaignSessionSceneImage(uid, data) {
      sceneReadInput(uid, data, ['blockKey']);
      blockKeyInput(data.blockKey);
      const before = await imageAccess(uid, data);
      const result = {
        ...before.envelope,
        blockKey: data.blockKey,
        imageKey: before.imageKey,
        dataUrl: null,
      };
      if (!before.imageKey) return bounded(result);
      const metadata = await checkCapturedImageStorage(assets, before.image);
      if (metadata.size !== before.image.size) materialFail();
      let bytes;
      try {
        bytes = await assets.readGeneration(before.image.path, before.image.generation);
      } catch {
        fail('not-found', 'Ilustração indisponível.');
      }
      if (
        !Buffer.isBuffer(bytes) ||
        bytes.length !== metadata.size ||
        bytes.length > BASE_IMAGE_BYTES
      )
        materialFail();
      const assertCurrent = async () => {
        const current = await imageAccess(uid, data);
        if (current.binding !== before.binding)
          fail(
            'failed-precondition',
            'O material mudou. Consulte novamente.',
            'source-context-changed',
          );
        const after = await checkCapturedImageStorage(assets, before.image);
        if (after.size !== metadata.size) materialFail();
      };
      await assertCurrent();
      const output = await deriveImage(bytes);
      if (!Buffer.isBuffer(output) || output.length < 1 || output.length > PREVIEW_IMAGE_BYTES)
        materialFail();
      await assertCurrent();
      return bounded({ ...result, dataUrl: 'data:image/webp;base64,' + output.toString('base64') });
    },
  };
}
