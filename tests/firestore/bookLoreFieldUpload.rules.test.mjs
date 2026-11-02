import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  fieldUploadFixture,
  control,
  appendRequest,
  uploadAll,
  sealAll,
  cancelAll,
} from '../../functions/test/helpers/bookLoreFieldUploadFixture.mjs';
import { openSealedBookLoreFieldUpload } from '../../functions/src/bookLoreFieldUploadProofs.mjs';
import { readBookResourcePayloadPart } from '../../functions/src/bookResourcePayloadRead.mjs';
import {
  resourcePayloadBodyPath,
  resourcePayloadChunkPath,
} from '../../functions/src/bookResourcePayloadPaths.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-lore-field-upload',
  sha = (value) => createHash('sha256').update(value).digest('hex');
let admin, env;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? ''))
    throw new Error('Dedicated loopback emulator required');
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
});
beforeEach(async () => env.clearFirestore());
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
async function readPart(f, p, index) {
  return admin.runTransaction(async (tx) => {
    const opening = await openSealedBookLoreFieldUpload(tx, f.c, {
      startHash: f.startHash,
      jobToken: p.jobToken,
    });
    return readBookResourcePayloadPart(tx, admin, opening.opened, index);
  });
}
test('SDK uploads more than 8 MiB/128 parts with concurrent retry, verifies native artifacts and cleans after source removal', async (t) => {
  const value = '\ufeff' + String.fromCodePoint(0x1f319).repeat(2300000),
    f = await fieldUploadFixture(admin, { value }),
    before = await admin.doc('books/book/lore/entity').get(),
    start = await f.factory().startBookLoreFieldUpload(f.uid, f.intent),
    request = appendRequest(f, start),
    concurrent = await Promise.all([
      f.factory().appendBookLoreFieldUpload(f.uid, request),
      f.factory().appendBookLoreFieldUpload(f.uid, request),
    ]);
  assert.deepEqual(concurrent[0], concurrent[1]);
  const uploaded = await uploadAll(f, concurrent[0].progress);
  assert.equal(
    (await admin.doc(resourcePayloadBodyPath(f.bookId, f.prepared.manifest.bodyId)).get()).exists,
    false,
  );
  assert.equal((await admin.doc(f.c.stateRef.path).get()).exists, false);
  const p = await sealAll(f, uploaded),
    hasher = createHash('sha256');
  assert.ok(p.totalParts > 128);
  for (let index = 0; index < p.totalParts; index++) hasher.update(await readPart(f, p, index));
  assert.equal(hasher.digest('hex'), sha(Buffer.from(JSON.stringify(value))));
  const source = await admin.doc('books/book/lore/entity').get();
  assert.equal(source.updateTime.isEqual(before.updateTime), true);
  assert.deepEqual(source.data(), before.data());
  const client = env.authenticatedContext(f.uid).firestore();
  for (const path of [
    f.c.path,
    f.c.stateRef.path,
    f.c.path + '/operations/' + request.operationId,
    'books/book/bookResourceLeases/' + f.prepared.manifest.bodyId,
    resourcePayloadBodyPath(f.bookId, f.prepared.manifest.bodyId),
  ]) {
    await assertFails(getDoc(doc(client, path)));
    await assertFails(setDoc(doc(client, path), { forged: true }));
  }
  await admin.doc('books/book').delete();
  const final = await cancelAll(f, p);
  assert.equal(final.phase, 'cancelled');
  assert.equal(final.cleanedCount, p.totalParts + 1);
  assert.equal(
    (
      await admin
        .collection('books/book/bookResourceChunks')
        .where('bodyId', '==', f.prepared.manifest.bodyId)
        .limit(1)
        .get()
    ).empty,
    true,
  );
  assert.equal(
    (await admin.doc(resourcePayloadBodyPath(f.bookId, f.prepared.manifest.bodyId)).get()).exists,
    false,
  );
  assert.equal(
    (await f.factory().appendBookLoreFieldUpload(f.uid, request)).progress.phase,
    'cancelled',
  );
  t.diagnostic(p.totalParts + ' native parts; body not adopted; permanent metadata fences remain');
});
test('SDK part recreated after its verification batch is rejected by native cutoff and preserved during cleanup', async () => {
  const f = await fieldUploadFixture(admin, { value: 'x'.repeat(17 * 65536) }),
    uploaded = await uploadAll(f),
    first = (await f.factory().advanceBookLoreFieldSeal(f.uid, control(f, uploaded, 'first-seal')))
      .progress,
    path = resourcePayloadChunkPath(f.bookId, f.prepared.manifest.bodyId, 0),
    ref = admin.doc(path),
    original = await ref.get();
  assert.equal(first.sealIndex, 16);
  await ref.delete();
  await ref.create(original.data());
  const recreated = await ref.get();
  assert.equal(original.createTime.isEqual(recreated.createTime), false);
  const sealed = await sealAll(f, first);
  await assert.rejects(() => readPart(f, sealed, 0));
  await assert.rejects(() => cancelAll(f, sealed));
  assert.equal((await ref.get()).createTime.isEqual(recreated.createTime), true);
  assert.equal(
    (await admin.doc(resourcePayloadBodyPath(f.bookId, f.prepared.manifest.bodyId)).get()).exists,
    true,
  );
});
test('SDK revocation stops new upload units, cancellation owns only its staged artifacts and an early fence blocks late start', async () => {
  const f = await fieldUploadFixture(admin, { value: 'x'.repeat(90000), inline: false }),
    start = await f.factory().startBookLoreFieldUpload(f.uid, f.intent),
    request = appendRequest(f, start),
    p = (await f.factory().appendBookLoreFieldUpload(f.uid, request)).progress;
  const sourceBefore = await admin.doc('books/book/lore/entity').get();
  assert.equal((await admin.doc(f.c.stateRef.path).get()).exists, true);
  const client = env.authenticatedContext(f.uid).firestore();
  await assertFails(getDoc(doc(client, f.c.stateRef.path)));
  await assertFails(setDoc(doc(client, f.c.stateRef.path), { forged: true }));
  await assertFails(
    getDoc(doc(client, resourcePayloadChunkPath(f.bookId, f.prepared.manifest.bodyId, 0))),
  );
  await admin.doc('books/book').update({ authorId: 'other' });
  await assert.rejects(() => f.factory().appendBookLoreFieldUpload(f.uid, appendRequest(f, p)));
  assert.equal((await f.factory().appendBookLoreFieldUpload(f.uid, request)).receipt.nextIndex, 1);
  assert.equal((await cancelAll(f, p)).phase, 'cancelled');
  assert.equal(
    (await f.factory().appendBookLoreFieldUpload(f.uid, request)).progress.phase,
    'cancelled',
  );
  const sourceAfter = await admin.doc('books/book/lore/entity').get();
  assert.equal(sourceAfter.updateTime.isEqual(sourceBefore.updateTime), true);
  assert.equal(
    (
      await admin
        .doc(
          resourcePayloadBodyPath(
            f.bookId,
            sourceBefore.data().payloadStorage.base.manifest.bodyId,
          ),
        )
        .get()
    ).exists,
    true,
  );
  await admin.doc('books/book').update({ authorId: f.uid });
  const other = await fieldUploadFixture(admin, {
    bookId: 'early-book',
    uploadId: 'early-fenced-field',
  });
  const closed = await other.factory().cancelBookLoreFieldUpload(other.uid, {
    uploadId: other.uploadId,
    startHash: other.startHash,
    operationId: 'early-cancel',
  });
  assert.equal(closed.progress.phase, 'cancelled');
  assert.equal(
    (await other.factory().startBookLoreFieldUpload(other.uid, other.intent)).phase,
    'cancelled',
  );
  assert.equal(
    (await admin.doc(resourcePayloadBodyPath(other.bookId, other.prepared.manifest.bodyId)).get())
      .exists,
    false,
  );
});
