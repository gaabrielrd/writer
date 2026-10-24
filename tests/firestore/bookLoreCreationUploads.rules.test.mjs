import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  creationUploadFixture,
  creationCleanupControl,
  advanceParent,
  finishCreationUploads,
} from '../../functions/test/helpers/bookLoreCreationUploadFixture.mjs';
import {
  uploadAll,
  sealAll,
  readSealedField,
} from '../../functions/test/helpers/bookLoreFieldUploadFixture.mjs';
import {
  bookLoreDeletionFixture,
  markBookDeleting,
  finishBookLoreDeletion,
} from '../../functions/test/helpers/bookLoreDeletionFixture.mjs';
import {
  resourcePayloadBodyPath,
  resourcePayloadChunkPath,
} from '../../functions/src/bookResourcePayloadPaths.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-creation-field-uploads';
let admin, env;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127[.]0[.]0[.]1:[0-9]+$/.test(address ?? ''))
    throw Error('Dedicated loopback emulator required');
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
const data = async (path) => (await admin.doc(path).get()).data();
async function snapshots(paths) {
  return Promise.all(
    paths.map(async (path) => {
      const s = await admin.doc(path).get();
      return {
        path,
        exists: s.exists,
        value: s.data(),
        birth: s.createTime?.toMillis(),
        update: s.updateTime?.toMillis(),
      };
    }),
  );
}
const parentStep = (f, p) => advanceParent(f.parent, p);

test('SDK creation upload binding, field job and lease are atomic, source has no head and cancel closes writes and private read authority', async () => {
  const f = await creationUploadFixture(admin, { value: '\ufeffliteral 🌙' }),
    sealed = await sealAll(f, await uploadAll(f)),
    job = await admin.doc(f.c.path).get(),
    binding = await admin.doc(f.parent.c.path + '/uploads/' + f.uploadId).get(),
    bindingProof = await admin.doc(f.parent.c.path + '/uploadProofs/' + f.uploadId).get(),
    lease = await admin.doc('books/book/bookResourceLeases/' + f.prepared.manifest.bodyId).get();
  for (const s of [binding, bindingProof, lease])
    assert.equal(s.createTime.isEqual(job.createTime), true);
  assert.equal(job.data().inventoryVersion, 2);
  assert.equal(await readSealedField(f, sealed), f.value);
  assert.equal((await admin.doc('books/book/lore/' + f.loreId).get()).exists, false);
  assert.equal(Object.hasOwn(await data('books/book'), 'localLoreVersion'), false);
  const client = env.authenticatedContext(f.uid).firestore();
  await assertFails(getDoc(doc(client, binding.ref.path)));
  await assertFails(setDoc(doc(client, binding.ref.path), {}));
  await assertFails(
    getDoc(doc(client, resourcePayloadBodyPath('book', f.prepared.manifest.bodyId))),
  );
  const p = await f.parent.cancel('sdk-cancel-creation', f.parentProgress.jobToken),
    request = await admin.doc(f.parent.c.path + '/cancelRequests/current').get(),
    state = await admin.doc(f.parent.c.path + '/cleanup/current').get();
  assert.equal(p.phase, 'cancelling');
  assert.equal(request.createTime.isEqual(state.createTime), true);
  await assert.rejects(() => readSealedField(f, sealed));
  const other = await creationUploadFixture(admin, {
    parent: f.parent,
    uploadId: 'creation-upload-after-cancel',
  });
  await assert.rejects(() => other.factory().startBookLoreFieldUpload(other.uid, other.intent));
  const done = await finishCreationUploads(f.parent, p);
  assert.equal(done.completedUploads, 1);
  assert.equal(
    (await admin.doc(resourcePayloadBodyPath('book', f.prepared.manifest.bodyId)).get()).exists,
    false,
  );
  assert.equal((await admin.doc(f.parent.c.reservationPath).get()).exists, true);
});

test('SDK large creation fields cross 128 parts and cancel in metadata batches with the header last', async () => {
  const f = await creationUploadFixture(admin, { value: '🌙'.repeat(2300000) }),
    sealed = await sealAll(f, await uploadAll(f)),
    count = f.prepared.manifest.chunkCount,
    header = resourcePayloadBodyPath('book', f.prepared.manifest.bodyId);
  assert.ok(count > 128);
  assert.equal(sealed.prepared, true);
  let p = await f.parent.cancel(),
    before = count,
    removed = 0;
  for (let i = 0; i < 1000 && p.phase !== 'cancelled'; i++) {
    p = (await parentStep(f, p)).progress;
    const current = (
      await admin
        .collection('books/book/bookResourceChunks')
        .select()
        .limit(count + 1)
        .get()
    ).size;
    assert.ok(before - current >= 0 && before - current <= 16);
    if (current) assert.equal((await admin.doc(header).get()).exists, true);
    removed += before - current;
    before = current;
  }
  assert.equal(p.phase, 'cancelled');
  assert.equal(removed, count);
  assert.equal((await admin.doc(header).get()).exists, false);
  assert.equal((await admin.doc('books/book').get()).exists, true);
  assert.equal((await admin.doc('books/book/lore/' + f.loreId).get()).exists, false);
});

test('SDK rollback, concurrent retry and whole-book takeover keep child bytes and parent checkpoints coupled', async () => {
  const f = await creationUploadFixture(admin, { value: 'x'.repeat(200000) });
  await uploadAll(f);
  let p = await f.parent.cancel();
  p = (await parentStep(f, p)).progress;
  const part = resourcePayloadChunkPath('book', f.prepared.manifest.bodyId, 0),
    paths = [
      part,
      f.c.path,
      'books/book/bookResourceLeases/' + f.prepared.manifest.bodyId,
      f.parent.c.path + '/cleanup/current',
    ],
    before = await snapshots(paths),
    run = admin.runTransaction.bind(admin);
  admin.runTransaction = (fn) =>
    run((tx) =>
      fn(
        new Proxy(tx, {
          get(target, key) {
            if (key === 'update')
              return (ref, ...args) => {
                const result = target.update(ref, ...args);
                if (ref.path === f.parent.c.path + '/cleanup/current')
                  throw Error('injected native creation parent failure');
                return result;
              };
            const value = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        }),
      ),
    );
  try {
    await assert.rejects(() => parentStep(f, p), /injected native creation parent failure/);
  } finally {
    admin.runTransaction = run;
  }
  assert.deepEqual(await snapshots(paths), before);
  const r = creationCleanupControl(f.parent, p),
    api = f.parent.factory(),
    [a, b] = await Promise.all([
      api.advanceBookLoreCreationCleanup(f.uid, r),
      api.advanceBookLoreCreationCleanup(f.uid, r),
    ]);
  assert.deepEqual(a.receipt, b.receipt);
  assert.equal(a.progress.cleanupRevision, p.cleanupRevision + 1);
  const book = bookLoreDeletionFixture(admin);
  await markBookDeleting(book);
  await finishBookLoreDeletion(book);
  assert.equal((await admin.doc('books/book').get()).exists, false);
  assert.equal(
    (await admin.collection('books/book/bookResourceChunks').select().limit(1).get()).empty,
    true,
  );
  const done = await f.parent.get(),
    old = await api.advanceBookLoreCreationCleanup(f.uid, r);
  assert.equal(done.phase, 'cancelled');
  assert.equal(done.completedUploads, 1);
  assert.deepEqual(old.receipt, a.receipt);
  assert.deepEqual(old.progress, done);
  assert.deepEqual(await f.parent.start(), done);
});

test('SDK recreated bindings or parts remain preserved and cannot be cleaned by the original creation', async () => {
  for (const artifact of ['binding', 'part']) {
    const f = await creationUploadFixture(admin, {
      creationId: 'native-recreated-' + artifact,
      uploadId: 'creation-upload-' + artifact,
    });
    await sealAll(f, await uploadAll(f));
    const path =
        artifact === 'binding'
          ? f.parent.c.path + '/uploads/' + f.uploadId
          : resourcePayloadChunkPath('book', f.prepared.manifest.bodyId, 0),
      ref = admin.doc(path),
      before = await ref.get(),
      value = before.data();
    await ref.delete();
    await ref.create(value);
    assert.equal((await ref.get()).createTime.isEqual(before.createTime), false);
    await assert.rejects(() => finishCreationUploads(f.parent));
    assert.deepEqual((await ref.get()).data(), value);
    assert.equal(
      (await admin.doc(resourcePayloadBodyPath('book', f.prepared.manifest.bodyId)).get()).exists,
      true,
    );
  }
});
