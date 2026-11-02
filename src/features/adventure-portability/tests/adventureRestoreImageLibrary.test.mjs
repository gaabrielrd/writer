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
import { finishImageLibrary } from '../../../../functions/test/helpers/adventureRestoreImageLibraryFixture.mjs';
it('installs distinct image/use pairs from the real Writer archive and reaudits them without changing originals', async () => {
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
  p = await finishImages(f, p);
  p = await finishImageStorage(f, p);
  p = await finishCounts(f, p);
  const first = await finishAudit(f, p),
    installed = await finishImageLibrary(f, first),
    imageRows = [...f.records].filter(
      ([k]) => k.startsWith('users/' + f.uid + '/imageLibrary/') && !k.includes('/uses/'),
    ),
    uses = [...f.records].filter(
      ([k]) => k.startsWith('users/' + f.uid + '/imageLibrary/') && k.includes('/uses/'),
    );
  expect(installed.staging.libraryImages).toBe(2);
  expect(installed.staging.libraryUses).toBe(2);
  expect(installed.staging.artifactCount).toBe(first.staging.artifactCount + 4);
  expect(installed.staging.auditJournals).toBeUndefined();
  expect(new Set(imageRows.map(([, v]) => v.id)).size).toBe(2);
  expect(uses.map(([, v]) => v.resource.kind).sort()).toEqual(['block', 'scene']);
  for (const [path, image] of imageRows) {
    expect(image.state).toBe('preparing');
    expect(image.url).toBeNull();
    expect(image.useCount).toBe(1);
    expect(image.restoreOrigin.target).toEqual({ kind: 'adventure', id: p.adventureId });
    expect(image.restoreOrigin).not.toHaveProperty('bookId');
    const use = uses.find(([key]) => key.startsWith(path + '/uses/'));
    expect(f.metadata.get(path)).toEqual(f.metadata.get(use[0]));
  }
  const ready = await finishAudit(f, installed);
  expect(ready.staging.auditPhysical).toBe(installed.staging.artifactCount);
  expect(ready.staging.auditJournals).toBe(installed.staging.artifactCount);
  expect(f.records.get('adventures/' + p.adventureId).ownerId).toBeUndefined();
  expect([...source.records]).toEqual(original);
  const cancelled = await cleanup(f, ready, 2);
  expect(cancelled.staging.cleanedArtifacts).toBe(installed.staging.artifactCount);
  expect([...f.records.keys()].some((k) => k.startsWith('users/' + f.uid + '/imageLibrary/'))).toBe(
    false,
  );
  for (const path of storage.current.keys()) expect(storage.version(path).bytes.length).toBe(0);
}, 60000);
