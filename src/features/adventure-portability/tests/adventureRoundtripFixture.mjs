import assert from 'node:assert/strict';
import { streamAdventureArchive } from '../services/streamAdventureArchive.ts';
import { createAdventureBackupService } from '../../../../functions/src/adventureBackupService.mjs';
import { invokeAdventureBackupCallable } from '../../../../functions/src/adventureBackupCallable.mjs';
import { createBookBackupAssetStorage } from '../../../../functions/src/bookBackupAssetStorage.mjs';
import { createAdventureRestoreTransferService } from '../../../../functions/src/adventureRestoreTransfer.mjs';
import { createRestoredImageStorage } from '../../../../functions/src/restoredImageStorage.mjs';
import { bookRestoreStorageBucket } from '../../../../functions/test/helpers/bookRestoreStorageBucket.mjs';
import { transferFixture } from '../../../../functions/test/helpers/adventureRestoreTransferFixture.mjs';
import {
  prepareAdventureImages,
  finishImages,
} from '../../../../functions/test/helpers/adventureRestoreImageFixture.mjs';
import { finishImageStorage } from '../../../../functions/test/helpers/adventureRestoreImageStorageFixture.mjs';
import { finishCounts } from '../../../../functions/test/helpers/adventureRestoreCountsFixture.mjs';
import { finishAudit } from '../../../../functions/test/helpers/adventureRestoreAuditFixture.mjs';
import { finishImageLibrary } from '../../../../functions/test/helpers/adventureRestoreImageLibraryFixture.mjs';
import { activationRequest } from '../../../../functions/test/helpers/adventureRestoreActivationFixture.mjs';
import { finishMedia } from '../../../../functions/test/helpers/adventureRestoreMediaFixture.mjs';
import { finishArchiveCleanup } from '../../../../functions/test/helpers/adventureRestoreArchiveCleanupFixture.mjs';
export async function captureAdventure(f, id, assets = f.assets, draft = null) {
  const service = createAdventureBackupService({ db: f.db, assets }),
    chunks = [];
  const stream = streamAdventureArchive(
    id,
    { call: (method, input) => invokeAdventureBackupCallable(service, method, 'author', input) },
    { guard: () => {}, draft },
  );
  let proof;
  for (;;) {
    const next = await stream.next();
    if (next.done) {
      proof = next.value;
      break;
    }
    chunks.push(Buffer.from(next.value));
  }
  assert.equal(proof.validation, 'captured-data-only');
  return { bytes: Buffer.concat(chunks), proof };
}
export async function restoreAdventure(bytes) {
  const f = transferFixture(bytes),
    storage = bookRestoreStorageBucket(),
    assets = createRestoredImageStorage(storage.bucket);
  // The ordinary image-library migration also uses native DocumentReference.set outside a transaction.
  const document = f.db.doc.bind(f.db);
  f.db.doc = (path) => {
    const ref = document(path);
    return { ...ref, set: (value) => f.db.runTransaction((tx) => tx.set(ref, value)) };
  };
  f.api = createAdventureRestoreTransferService({ db: f.db, assets, now: () => 5000 });
  let p = await prepareAdventureImages(f.api, f.uid, bytes);
  p = await finishImages(f, p);
  p = await finishImageStorage(f, p);
  p = await finishCounts(f, p);
  p = await finishAudit(f, p);
  p = await finishImageLibrary(f, p);
  p = await finishAudit(f, p);
  const { request, review } = await activationRequest(f, p);
  p = (await f.api.activateAdventureRestore(f.uid, request)).progress;
  const frozen = structuredClone(f.records.get(f.path));
  let media = (
    await f.api.getAdventureRestoreMediaState(f.uid, {
      restoreId: p.restoreId,
      jobToken: p.jobToken,
    })
  ).media;
  media = await finishMedia(f, p, media);
  const collection = (
    await f.api.getAdventureRestoreArchiveCleanup(f.uid, {
      restoreId: p.restoreId,
      jobToken: p.jobToken,
    })
  ).progress;
  await finishArchiveCleanup(f, p, collection);
  assert.deepEqual(f.records.get(f.path), frozen);
  assert.equal(f.records.has('users/author/adventureRestoreRecoveryKeys/' + p.restoreId), false);
  return {
    ...f,
    p,
    review,
    storage,
    assets,
    backupAssets: createBookBackupAssetStorage(storage.bucket),
    target: { kind: 'adventure', id: p.adventureId },
    rootPath: 'adventures/' + p.adventureId,
  };
}
