// @vitest-environment node
import { it, expect } from 'vitest';
import { streamAdventureArchive } from '../index';
import { imageDataFixture } from './adventureImageFixture.mjs';
import {
  transferFixture,
  cleanup,
} from '../../../../functions/test/helpers/adventureRestoreTransferFixture.mjs';
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
it('audits the actual Writer archive with separate scene/block images without enabling the copy', async () => {
  const png = await createAdventureStoragePNG(),
    source = await imageDataFixture(2, true, png.length),
    chunks = [];
  source.bytes.set(png);
  const original = structuredClone([...source.records]);
  for await (const part of streamAdventureArchive(source.id, source.scanApi, { guard: () => {} }))
    chunks.push(part);
  const f = transferFixture(),
    storage = bookRestoreStorageBucket(),
    assets = createRestoredImageStorage(storage.bucket);
  f.api = createAdventureRestoreTransferService({ db: f.db, assets, now: () => 2000 });
  let p = await prepareAdventureImages(f.api, f.uid, Buffer.concat(chunks));
  p = await finishImages(f, p);
  p = await finishImageStorage(f, p);
  p = await finishCounts(f, p);
  const ready = await finishAudit(f, p);
  expect(ready.staging.auditJournals).toBe(p.staging.artifactCount);
  expect(ready.staging.auditPhysical).toBe(p.staging.artifactCount);
  expect(ready.staging.auditMedia).toBe(2);
  expect(f.records.get('adventures/' + p.adventureId).ownerId).toBeUndefined();
  expect(f.records.get('adventures/' + p.adventureId + '/workProgress/current').countReady).toBe(
    false,
  );
  for (const path of storage.current.keys()) {
    expect(storage.version(path).bytes).toEqual(png);
    expect(storage.version(path).metadata.metadata.accepted).toBe('false');
  }
  expect([...source.records]).toEqual(original);
  const cancelled = await cleanup(f, ready, 20);
  expect(cancelled.staging.cleanedArtifacts).toBe(p.staging.artifactCount);
  expect(cancelled.staging.storageFenced).toBe(2);
}, 60000);
