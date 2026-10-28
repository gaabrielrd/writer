import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createRestoredImageStorage } from '../../src/restoredImageStorage.mjs';
import { createAdventureRestoreTransferService } from '../../src/adventureRestoreTransfer.mjs';
import { bookRestoreStorageBucket } from './bookRestoreStorageBucket.mjs';
import { imageFixture, finishImages } from './adventureRestoreImageFixture.mjs';
import { mutation } from './adventureRestoreTransferFixture.mjs';
export const storageRequest = (p) =>
  mutation(p, 'image-storage-step-' + String(p.checkpoint).padStart(8, '0'));
export const storageRows = (f) =>
  [...f.records].filter(
    ([k, v]) =>
      k.startsWith(f.path + '/preparedRoot/') && v.kind === 'adventure-restore-image-storage',
  );
export const createAdventureStoragePNG = () =>
  sharp({ create: { width: 3, height: 4, channels: 4, background: '#123456' } })
    .png()
    .toBuffer();
export async function imageStorageFixture(options = {}) {
  const png = options.image ?? (await createAdventureStoragePNG()),
    { f, p } = await imageFixture({ ...options, image: png }),
    storage = bookRestoreStorageBucket(),
    assets = createRestoredImageStorage(storage.bucket);
  f.api = createAdventureRestoreTransferService({ db: f.db, assets, now: () => 2000 });
  Object.assign(f, { assets, storage, png });
  return { f, p: await finishImages(f, p) };
}
export const storageStep = async (f, p) =>
  (await f.api.advanceAdventureRestoreImageStorage(f.uid, storageRequest(p))).progress;
export async function finishImageStorage(f, p) {
  for (let n = 0; p.staging.phase !== 'image-storage-ready'; n++) {
    assert.ok(n < 10000);
    p = await storageStep(f, p);
  }
  return p;
}
