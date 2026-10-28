import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import {
  readyMedia,
  finishMedia,
  mediaState,
  uid,
} from '../../functions/test/helpers/bookRestoreMediaFixture.mjs';
import {
  archiveStep,
  finishArchive,
} from '../../functions/test/helpers/bookRestoreArchiveFixture.mjs';
import { BOOK_RESTORE_ARCHIVE_NAMES } from '../../functions/src/bookRestoreArchiveContracts.mjs';
import { createImageLibraryService } from '../../functions/src/imageLibrary.mjs';
import { createBookLoreReadService } from '../../functions/src/bookLoreRead.mjs';
import { readAvailablePersonaMetadata } from '../../functions/src/personaAvailability.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-restore-archive';
let env, admin;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127[.]0[.]0[.]1:[0-9]+$/.test(address ?? ''))
    throw Error('Dedicated loopback demo emulator required');
  const [host, port] = address.split(':');
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
  await env.clearFirestore();
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
test('SDK activated archive cleanup authenticates source deletion, preserves edited live data and proofs, and never reconstructs an owner-deleted cover', async () => {
  const f = await readyMedia({ db: admin }),
    imageId = f.p.preparation.cover.imageId,
    library = createImageLibraryService({
      db: admin,
      assets: {
        retireRestoreImage: f.assets.retire,
        remove: (path) => f.storage.bucket().file(path).delete({ ignoreNotFound: true }),
      },
    });
  await library.detach(uid, f.p.bookId, imageId);
  await library.remove(uid, { id: imageId });
  const mediaEvents = f.storage.events.length;
  f.mediaDone = await finishMedia(f);
  assert.equal(f.mediaDone.media.state, 'unavailable');
  assert.equal(f.storage.events.length, mediaEvents);
  const own = env.authenticatedContext(uid).firestore(),
    rootRef = admin.doc('books/' + f.p.bookId);
  await assertSucceeds(
    updateDoc(doc(own, rootRef.path), { title: 'Edited before source cleanup' }),
  );
  const root = await rootRef.get(),
    job = await admin.doc(f.root).get(),
    batch = await admin.doc('users/' + uid + '/aiPersonaRestoreBatches/' + f.p.bookId).get(),
    profiles = await admin
      .collection('users/' + uid + '/aiPersonas')
      .where('restoreOrigin.bookId', '==', f.p.bookId)
      .get(),
    media = await admin.doc(f.root + '/activationMedia/current').get();
  f.archiveProgress = (
    await f.factory().getBookRestoreArchiveCleanup(uid, { restoreId: f.id, jobToken: f.p.jobToken })
  ).progress;
  const first = await archiveStep(f),
    p = await finishArchive(f, first.progress),
    control = await admin.doc(f.root + '/archiveCleanup/current').get(),
    receipt = await admin
      .doc('users/' + uid + '/bookRestoreArchiveOperations/' + p.lastOperationId)
      .get();
  assert.equal(p.phase, 'done');
  assert.equal(
    p.removed.journals,
    f.p.preparation.artifactCount - (f.p.preparation.retiredArtifacts ?? 0),
  );
  assert.equal(p.removed.chunks, f.p.uploadedChunks);
  assert.equal(p.removed.bytes, f.p.uploadedBytes);
  assert.equal(p.removed.proofs, f.p.integrity.checkedChunks);
  assert.equal(p.removed.items, f.p.validation.items);
  assert.equal(p.scannedOperations, f.p.checkpoint + 1);
  assert.equal(control.updateTime.isEqual(receipt.createTime), true);
  for (const name of BOOK_RESTORE_ARCHIVE_NAMES)
    assert.equal(
      (
        await admin
          .collection(f.root + '/' + name)
          .limit(1)
          .get()
      ).empty,
      true,
      name,
    );
  for (const original of [root, job, batch, media, ...profiles.docs]) {
    const current = await original.ref.get();
    assert.deepEqual(current.data(), original.data());
    assert.equal(current.updateTime.isEqual(original.updateTime), true);
  }
  for (const actor of [
    env.authenticatedContext(uid),
    env.authenticatedContext('other'),
    env.unauthenticatedContext(),
  ]) {
    await assertFails(getDoc(doc(actor.firestore(), control.ref.path)));
    await assertFails(getDoc(doc(actor.firestore(), receipt.ref.path)));
  }
  const replay = await archiveStep(f);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.deepEqual(replay.progress, p);
  assert.deepEqual(await f.factory().activateBookRestore(uid, f.request), f.activation);
  assert.equal((await mediaState(f)).media.state, 'unavailable');
  const lore = createBookLoreReadService({ db: admin }),
    rows = await lore.listBookLoreRead(uid, { bookId: f.p.bookId, limit: 1 });
  assert.ok(
    await lore.getBookLoreRead(uid, {
      bookId: f.p.bookId,
      id: rows.items[0].id,
      readToken: rows.items[0].readToken,
    }),
  );
  for (const profile of profiles.docs)
    assert.ok(
      await admin.runTransaction((tx) => readAvailablePersonaMetadata(tx, admin, uid, profile.id)),
    );
  await rootRef.delete();
  await admin.doc('deletedBooks/' + f.p.bookId).create({ ownerId: uid, kind: 'normal-deletion' });
  const done = await f
    .factory()
    .getBookRestoreArchiveCleanup(uid, { restoreId: f.id, jobToken: f.p.jobToken });
  assert.deepEqual(done.progress, p);
  assert.equal((await rootRef.get()).exists, false);
  const value = control.data();
  await control.ref.delete();
  await control.ref.create(value);
  await assert.rejects(() =>
    f.factory().getBookRestoreArchiveCleanup(uid, { restoreId: f.id, jobToken: f.p.jobToken }),
  );
  assert.deepEqual((await control.ref.get()).data(), value);
});
