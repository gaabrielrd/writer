// @vitest-environment node
import { it, expect } from 'vitest';
import { finishArchiveCleanup } from '../../../../functions/test/helpers/adventureRestoreArchiveCleanupFixture.mjs';
import { ARCHIVE_NAMES } from '../../../../functions/src/adventureRestoreArchiveContracts.mjs';
import { createScenesService } from '../../../../functions/src/scenes.mjs';
import { streamAdventureArchive } from '../index';
import { imageDataFixture } from './adventureImageFixture.mjs';
import { transferFixture } from '../../../../functions/test/helpers/adventureRestoreTransferFixture.mjs';
import { createAdventureRestoreTransferService } from '../../../../functions/src/adventureRestoreTransfer.mjs';
import { createRestoredImageStorage } from '../../../../functions/src/restoredImageStorage.mjs';
import { bookRestoreStorageBucket } from '../../../../functions/test/helpers/bookRestoreStorageBucket.mjs';
import {
  createAdventureStoragePNG,
  finishImageStorage,
} from '../../../../functions/test/helpers/adventureRestoreImageStorageFixture.mjs';
import {
  prepareAdventureImages,
  finishImages,
} from '../../../../functions/test/helpers/adventureRestoreImageFixture.mjs';
import { finishCounts } from '../../../../functions/test/helpers/adventureRestoreCountsFixture.mjs';
import { finishAudit } from '../../../../functions/test/helpers/adventureRestoreAuditFixture.mjs';
import { finishImageLibrary } from '../../../../functions/test/helpers/adventureRestoreImageLibraryFixture.mjs';
import { activationRequest } from '../../../../functions/test/helpers/adventureRestoreActivationFixture.mjs';
import { finishMedia } from '../../../../functions/test/helpers/adventureRestoreMediaFixture.mjs';
import { createAdventureBlocksService } from '../../../../functions/src/adventureBlocks.mjs';
import { createImageLibraryService } from '../../../../functions/src/imageLibrary.mjs';
it('collects a real Writer source while preserving images, a detached block and subsequent editing', async () => {
  const png = await createAdventureStoragePNG(),
    source = await imageDataFixture(2, true, png.length),
    chunks = [];
  source.bytes.set(png);
  const original = structuredClone([...source.records]);
  for await (const bytes of streamAdventureArchive(source.id, source.scanApi, { guard: () => {} }))
    chunks.push(bytes);
  const f = transferFixture(),
    storage = bookRestoreStorageBucket(),
    assets = createRestoredImageStorage(storage.bucket);
  f.api = createAdventureRestoreTransferService({ db: f.db, assets, now: () => 2000 });
  let p = await prepareAdventureImages(f.api, f.uid, Buffer.concat(chunks));
  p = await finishCounts(f, await finishImageStorage(f, await finishImages(f, p)));
  p = await finishAudit(f, await finishImageLibrary(f, await finishAudit(f, p)));
  const { request } = await activationRequest(f, p);
  p = (await f.api.activateAdventureRestore(f.uid, request)).progress;
  const blocks = createAdventureBlocksService({ db: f.db, now: () => 8000 }),
    uses = [...f.records].filter(([k]) => k.includes('/imageLibrary/') && k.includes('/uses/')),
    block = uses.find(([, v]) => v.resource.kind === 'block')[1].resource,
    scene = uses.find(([, v]) => v.resource.kind === 'scene')[1].resource,
    head = f.records.get('adventures/' + p.adventureId + '/sceneBlocks/' + block.id);
  await blocks.setAdventureBlockImage(f.uid, {
    adventureId: p.adventureId,
    resource: block,
    operationId: 'media-corpus-detach-0001',
    expectedRevision: head.revision,
    image: null,
  });
  await expect(
    blocks.getAdventureBlockImage(f.uid, { adventureId: p.adventureId, resource: scene }),
  ).rejects.toThrow();
  const before = structuredClone([...f.records].filter(([k]) => k.startsWith('adventures/'))),
    parent = structuredClone(f.records.get(f.path)),
    media = (
      await f.api.getAdventureRestoreMediaState(f.uid, {
        restoreId: p.restoreId,
        jobToken: p.jobToken,
      })
    ).media,
    done = await finishMedia(f, p, media);
  const initial = (
    await f.api.getAdventureRestoreArchiveCleanup(f.uid, {
      restoreId: p.restoreId,
      jobToken: p.jobToken,
    })
  ).progress;
  const collected = await finishArchiveCleanup(f, p, initial);
  expect(collected.phase).toBe('done');
  for (const name of ARCHIVE_NAMES)
    expect([...f.records.keys()].some((k) => k.startsWith(f.path + '/' + name + '/'))).toBe(false);
  expect(done).toMatchObject({ total: 2, ready: 2, processed: 2, complete: true, checkpoint: 3 });
  expect(
    (await blocks.getAdventureBlockImage(f.uid, { adventureId: p.adventureId, resource: scene }))
      .image,
  ).not.toBeNull();
  expect(
    (await blocks.getAdventureBlockImage(f.uid, { adventureId: p.adventureId, resource: block }))
      .image,
  ).toBeNull();
  f.records.set('users/' + f.uid + '/imageLibraryMigration/current', { complete: true });
  const library = createImageLibraryService({ db: f.db, assets }),
    page = await library.list(f.uid, {});
  expect(page.images).toHaveLength(2);
  expect(page.images.map((v) => v.useCount).sort()).toEqual([0, 1]);
  expect(storage.events.filter((e) => e.method === 'patch')).toHaveLength(2);
  expect([...f.records].filter(([k]) => k.startsWith('adventures/'))).toEqual(before);
  expect(f.records.get(f.path)).toEqual(parent);
  expect([...source.records]).toEqual(original);
  const nativeScene = f.records.get('adventures/' + p.adventureId + '/scenes/' + scene.id);
  const changed = await createScenesService({ db: f.db, now: () => 10000 }).updateScene(f.uid, {
    target: { kind: 'adventure', id: p.adventureId },
    sceneId: scene.id,
    operationId: 'edit-after-source-collection-0001',
    expectedRevision: nativeScene.revision,
    patch: { content: '<p>Texto após limpeza</p>' },
  });
  expect(changed.scene.mainWordCount).toBe(3);
}, 60000);
