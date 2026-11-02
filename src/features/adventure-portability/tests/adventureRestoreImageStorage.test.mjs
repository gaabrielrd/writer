// @vitest-environment node
import { it, expect } from 'vitest';
import { streamAdventureArchive } from '../index';
import { imageDataFixture } from './adventureImageFixture.mjs';
import {
  transferFixture,
  cleanup,
} from '../../../../functions/test/helpers/adventureRestoreTransferFixture.mjs';
import {
  prepareAdventureImages,
  finishImages,
} from '../../../../functions/test/helpers/adventureRestoreImageFixture.mjs';
import {
  finishImageStorage,
  createAdventureStoragePNG,
} from '../../../../functions/test/helpers/adventureRestoreImageStorageFixture.mjs';
import { createAdventureRestoreTransferService } from '../../../../functions/src/adventureRestoreTransfer.mjs';
import { createRestoredImageStorage } from '../../../../functions/src/restoredImageStorage.mjs';
import { bookRestoreStorageBucket } from '../../../../functions/test/helpers/bookRestoreStorageBucket.mjs';
it('materializes the actual Writer PNG archive with separate scene/block identities and fences both before native cleanup', async () => {
  const png = await createAdventureStoragePNG(),
    source = await imageDataFixture(2, true, png.length),
    parts = [];
  source.bytes.set(png);
  for await (const part of streamAdventureArchive(source.id, source.scanApi, { guard: () => {} }))
    parts.push(part);
  const f = transferFixture(),
    storage = bookRestoreStorageBucket(),
    assets = createRestoredImageStorage(storage.bucket);
  f.api = createAdventureRestoreTransferService({ db: f.db, assets, now: () => 2000 });
  const p = await finishImages(f, await prepareAdventureImages(f.api, f.uid, Buffer.concat(parts))),
    original = structuredClone([...f.records].filter(([k]) => k.startsWith('adventures/'))),
    end = await finishImageStorage(f, p);
  expect(end.staging.storageBindings).toBe(3);
  expect(end.staging.storageIntents).toBe(2);
  expect(end.staging.storagePrepared).toBe(2);
  expect(storage.current.size).toBe(2);
  for (const path of storage.current.keys()) {
    expect(storage.version(path).bytes).toEqual(png);
    expect(storage.version(path).metadata.metadata.accepted).toBe('false');
    expect(storage.version(path).metadata.metadata).not.toHaveProperty(
      'firebaseStorageDownloadTokens',
    );
  }
  expect([...f.records].filter(([k]) => k.startsWith('adventures/'))).toEqual(original);
  expect([...f.records.keys()].some((k) => k.includes('/imageLibrary/'))).toBe(false);
  const cancelled = await cleanup(f, end, 2);
  expect(cancelled.staging.storageFenced).toBe(2);
  expect(cancelled.staging.cleanedArtifacts).toBe(end.staging.artifactCount);
  for (const path of storage.current.keys()) {
    expect(storage.version(path).bytes.length).toBe(0);
    expect(storage.versions.get(path).size).toBe(1);
  }
}, 60000);
