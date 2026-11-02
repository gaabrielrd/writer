import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { activateBackupImportedAdventure } from './helpers/adventureBackupImportFixture.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { createAdventureBlocksService } from '../src/adventureBlocks.mjs';
import { libraryImage } from '../src/imageLibrary.mjs';
import { adventureImageUseKey } from '../src/adventureBlockImages.mjs';
import { createAdventureBackupSourceService } from '../src/adventureBackupSource.mjs';
import { createAdventureBackupImageService } from '../src/adventureBackupImageRead.mjs';
import { createAdventureBackupReadService } from '../src/adventureBackupRead.mjs';
import { createWorkHistoryService } from '../src/workHistory.mjs';
import { createAdventureBackupHistoryService } from '../src/adventureBackupHistoryRead.mjs';

const uid = 'author',
  imageId = 'imported-private-image-0001',
  libraryPath = 'users/' + uid + '/imageLibrary/' + imageId,
  filePath = 'book-covers/' + uid + '/' + imageId + '.png',
  hash = (b) => createHash('sha256').update(b).digest('hex');
async function fixture() {
  const f = adventureImportDb({ nativeUpdates: true }),
    imported = await activateBackupImportedAdventure(f.db),
    path = 'adventures/' + imported.adventureId,
    scenePath = path + '/scenes/' + imported.sceneId,
    bytes = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(70000, 7)]),
    assets = {
      async metadata() {
        return {
          generation: '1',
          metageneration: '1',
          size: bytes.length,
          contentType: 'image/png',
          accepted: true,
        };
      },
      async hashGeneration() {
        return {
          byteLength: bytes.length,
          contentHash: hash(bytes),
          signature: bytes.subarray(0, 8).toString('hex'),
        };
      },
      async readRange(p, generation, start, end) {
        return Buffer.from(bytes.subarray(start, end + 1));
      },
    },
    pin = await createAdventureBackupSourceService(f).getAdventureBackupSource(uid, {
      adventureId: imported.adventureId,
    });
  return {
    ...f,
    ...imported,
    path,
    scenePath,
    bytes,
    assets,
    pin,
    reader: createAdventureBackupImageService({ db: f.db, assets }),
    blocks: createAdventureBlocksService(f),
  };
}
const list = (f) =>
  f.reader.listAdventureBackupImageBindings(uid, {
    adventureId: f.adventureId,
    sourceToken: f.pin.sourceToken,
    kind: 'scene',
  });
const request = (f, row, extra = {}) => ({
  adventureId: f.adventureId,
  sourceToken: f.pin.sourceToken,
  kind: 'scene',
  id: row.id,
  bindingToken: row.bindingToken,
  ...extra,
});
const born = (f, p) => f.metadata.get(p).createdAtNanoseconds;

test('real PDF-review import creates scene before root and null image bindings remain capturable', async () => {
  const f = await fixture(),
    before = structuredClone([...f.records]);
  assert.ok(born(f, f.scenePath) < born(f, f.path));
  const row = (await list(f)).items[0];
  assert.equal(row.imageId, null);
  assert.deepEqual((await f.reader.getAdventureBackupImage(uid, request(f, row))).image, {
    kind: 'none',
  });
  assert.deepEqual([...f.records], before);
});

test('normal image writer after import authorizes earlier scene through a typed use newer than root', async () => {
  const f = await fixture(),
    sourceBody = structuredClone(f.records.get(f.scenePath + '/body/current'));
  await f.db.runTransaction((tx) =>
    tx.create(
      f.db.doc(libraryPath),
      libraryImage(
        imageId,
        {
          title: 'Own imported image',
          coverUrl: 'DO_NOT_COPY',
          path: filePath,
        },
        2000,
      ),
    ),
  );
  await f.blocks.setAdventureBlockImage(uid, {
    adventureId: f.adventureId,
    resource: { kind: 'scene', id: f.sceneId },
    operationId: 'attach-imported-image-0001',
    expectedRevision: f.records.get(f.scenePath).revision,
    image: { imageId, alt: 'Own alt', caption: '' },
  });
  const usePath =
    libraryPath + '/uses/' + adventureImageUseKey(f.adventureId, { kind: 'scene', id: f.sceneId });
  assert.ok(born(f, usePath) > born(f, f.path));
  assert.ok(born(f, f.scenePath) < born(f, f.path));
  f.pin = await createAdventureBackupSourceService(f).getAdventureBackupSource(uid, {
    adventureId: f.adventureId,
  });
  const row = (await list(f)).items[0],
    captured = await f.reader.getAdventureBackupImage(uid, request(f, row)),
    chunks = [];
  for (let index = 0; index < captured.image.chunkCount; index++)
    chunks.push(
      Buffer.from(
        (
          await f.reader.readAdventureBackupImageChunk(
            uid,
            request(f, row, { imageToken: captured.imageToken, index }),
          )
        ).chunkBase64,
        'base64',
      ),
    );
  assert.deepEqual(Buffer.concat(chunks), f.bytes);
  assert.deepEqual(f.records.get(f.scenePath + '/body/current'), sourceBody);
  const metadata = await createAdventureBackupReadService(f).readAdventureBackupStructure(uid, {
    adventureId: f.adventureId,
    sourceToken: f.pin.sourceToken,
    kind: 'adventure',
    id: f.adventureId,
    itemToken: f.pin.sourceToken,
    index: 0,
  });
  assert.equal(
    JSON.parse(Buffer.from(metadata.chunkBase64, 'base64').toString()).data.origin.kind,
    'imported',
  );
});

test('manual history after activation is newer than root and keeps the existing history guard valid', async () => {
  const f = await fixture(),
    history = createWorkHistoryService(f),
    target = { kind: 'adventure', id: f.adventureId },
    resource = { kind: 'scene', id: f.sceneId },
    source = await history.getWorkVersionSource(uid, { target, resource }),
    saved = await history.createWorkVersion(uid, {
      target,
      resource,
      operationId: 'manual-imported-version-0001',
      expectedSourceToken: source.sourceToken,
    });
  assert.ok(born(f, f.path + '/workVersions/' + saved.version.id) > born(f, f.path));
  f.pin = await createAdventureBackupSourceService(f).getAdventureBackupSource(uid, {
    adventureId: f.adventureId,
  });
  const reader = createAdventureBackupHistoryService(f),
    scope = { adventureId: f.adventureId, sourceToken: f.pin.sourceToken, kind: 'version' },
    row = (await reader.listAdventureBackupHistory(uid, scope)).items[0],
    unit = await reader.readAdventureBackupHistory(uid, {
      ...scope,
      id: row.id,
      itemToken: row.itemToken,
      index: 0,
    });
  assert.equal(
    JSON.parse(Buffer.from(unit.chunkBase64, 'base64').toString()).data.reason,
    'manual',
  );
});
