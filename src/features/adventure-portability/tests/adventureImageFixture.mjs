import { createHash } from 'node:crypto';
import { editorChatFixture, uid } from '../../../../functions/test/helpers/editorChatFixture.mjs';
import { adventureImportDb } from '../../../../functions/test/helpers/adventureImportDb.mjs';
import { createAdventureBlocksService } from '../../../../functions/src/adventureBlocks.mjs';
import { createAdventureBackupImageService } from '../../../../functions/src/adventureBackupImageRead.mjs';
import { libraryImage } from '../../../../functions/src/imageLibrary.mjs';
import { inventoryReadHarness } from './adventureInventoryFixture.mjs';
export async function imageDataFixture(count = 1, withImage = true, size = 140008) {
  const f = await editorChatFixture('adventure', false, adventureImportDb({ nativeUpdates: true }));
  const blocks = createAdventureBlocksService({ db: f.db, now: () => 2000 }),
    id = f.target.id;
  const sceneId = f.resource.id,
    blockId = 'image-file-block-0001',
    imageId = 'image-file-library-0001';
  for (let n = 1; n < count; n++)
    await f.scenes.createScene(uid, {
      target: f.target,
      operationId: 'image-file-scene-' + String(n).padStart(4, '0'),
      title: 'PRIVATE_SCENE',
    });
  await blocks.createAdventureBlock(uid, {
    adventureId: id,
    sceneId,
    operationId: blockId,
    title: 'PRIVATE_BLOCK',
    content: 'PRIVATE_TEXT',
  });
  const bytes = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(size - 8, 7)]);
  const meta = {
    generation: '12',
    metageneration: '3',
    size: bytes.length,
    contentType: 'image/png',
    accepted: true,
  };
  const io = [],
    hook = { metadata: null, hash: null, range: null };
  const path = 'book-covers/' + uid + '/' + imageId + '.png';
  if (withImage) {
    await f.db.runTransaction((tx) =>
      tx.create(
        f.db.doc('users/' + uid + '/imageLibrary/' + imageId),
        libraryImage(
          imageId,
          { title: 'PRIVATE_PNG 🌙', coverUrl: 'DO_NOT_COPY_TOKEN_URL', path, acceptedAt: 2100 },
          2100,
        ),
      ),
    );
    for (const resource of [
      { kind: 'scene', id: sceneId },
      { kind: 'block', id: blockId },
    ]) {
      const p = f.path + (resource.kind === 'scene' ? '/scenes/' : '/sceneBlocks/') + resource.id;
      await blocks.setAdventureBlockImage(uid, {
        adventureId: id,
        resource,
        operationId: 'image-file-attach-' + resource.kind,
        expectedRevision: f.records.get(p).revision,
        image: { imageId, alt: '  PRIVATE_ALT 🌙  ', caption: 'PRIVATE_CAPTION' },
      });
    }
  }
  const assets = {
    async metadata(p) {
      io.push(['metadata', p]);
      await hook.metadata?.();
      return { ...meta };
    },
    async hashGeneration(p, generation, max) {
      io.push(['hash', p, generation, max]);
      await hook.hash?.();
      return {
        byteLength: bytes.length,
        contentHash: createHash('sha256').update(bytes).digest('hex'),
        signature: bytes.subarray(0, 8).toString('hex'),
      };
    },
    async readRange(p, generation, start, end) {
      io.push(['range', p, generation, start, end]);
      const value = Buffer.from(bytes.subarray(start, end + 1));
      await hook.range?.();
      return value;
    },
  };
  const harness = inventoryReadHarness(f);
  Object.assign(harness.handlers, createAdventureBackupImageService({ db: f.db, assets }));
  return { ...f, ...harness, blocks, id, sceneId, blockId, imageId, bytes, meta, io, hook };
}
