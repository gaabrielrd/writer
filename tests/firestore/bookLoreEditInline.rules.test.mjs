import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  compilationFixture,
  advanceCompilation,
  finishCompilation,
  openCompilation,
} from '../../functions/test/helpers/bookLoreEditCompilationFixture.mjs';
import {
  cancelEditReservation,
  drainEditReservation,
} from '../../functions/test/helpers/bookLoreEditReservationFixture.mjs';
import { readBookResourcePayload } from '../../functions/src/bookResourcePayloadRead.mjs';
import { createBookLoreFieldUploadService } from '../../functions/src/bookLoreFieldUpload.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-lore-edit-inline';
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
const parent = async (f) => (await admin.doc(f.c.path).get()).data();
async function until(f, predicate, p = f.progress) {
  for (let i = 0; i < 1000; i++) {
    const j = await parent(f),
      work = j.compilation?.inlineWork,
      child = work
        ? (
            await admin.doc('users/' + f.uid + '/bookLoreFieldUploads/' + work.uploadId).get()
          ).data()
        : null;
    if (predicate(j, child)) return p;
    p = (await advanceCompilation(f, p)).progress;
  }
  throw Error('Inline stage did not arrive');
}
test('SDK inline controls expand past 16 parts and become a private ready generation with literal fields and relation pages', async () => {
  const text = '\u0001'.repeat(200000),
    data = {
      name: ' N 🌙 ',
      category: 'other',
      details: text,
      aliases: ['', 'same', 'same'],
      isPublic: false,
      createdAt: 100,
      updatedAt: 101,
      relations: Array.from({ length: 65 }, (_, i) => ({
        targetEntityId: 't' + i,
        relationType: 'r',
      })),
    },
    f = await compilationFixture(admin, {
      mode: 'inline',
      changes: [],
      removals: ['summary'],
      sourceOptions: { data },
    }),
    source = await admin.doc(f.source.seed.path).get(),
    book = await admin.doc(f.source.seed.bookPath).get(),
    done = await finishCompilation(f),
    { storage } = await openCompilation(f);
  assert.equal(storage.base, null);
  assert.ok(storage.fields.details.manifest.chunkCount > 16);
  const literal = await admin.runTransaction((tx) =>
    readBookResourcePayload(tx, admin, {
      uid: f.uid,
      bookId: f.bookId,
      resource: { kind: 'lore', parentId: null, id: f.loreId },
      ...storage.fields.details,
    }),
  );
  assert.equal(literal, text);
  assert.equal(done.compilation.totalPages, 2);
  assert.equal(done.reservedCount, 7);
  assert.equal(
    (await admin.doc(f.source.seed.path).get()).updateTime.isEqual(source.updateTime),
    true,
  );
  assert.equal(
    (await admin.doc(f.source.seed.bookPath).get()).updateTime.isEqual(book.updateTime),
    true,
  );
  const slots = await admin.collection(f.c.path + '/slots').get(),
    client = env.authenticatedContext(f.uid).firestore();
  for (const slot of slots.docs) {
    assert.ok(slot.data().materialized);
    assert.equal(JSON.stringify(slot.data()).includes(' N '), false);
    const path = 'users/' + f.uid + '/bookLoreFieldUploads/' + slot.data().upload.uploadId;
    assert.equal((await admin.doc(path).get()).data().materialization.editId, f.editId);
    await assertFails(getDoc(doc(client, path)));
  }
  await assertFails(setDoc(doc(client, f.c.path + '/slots/forged'), { forged: true }));
  const cancelled = await drainEditReservation(f, (await cancelEditReservation(f, done)).progress);
  assert.equal(cancelled.phase, 'cancelled');
  assert.equal(cancelled.releasedCount, 7);
  assert.equal(
    (await admin.doc(f.source.seed.path).get()).updateTime.isEqual(source.updateTime),
    true,
  );
});
test('SDK append rollback keeps managed child, lease and parent intact, then cancel cleans unreserved bytes after source removal', async () => {
  const f = await compilationFixture(admin, {
      mode: 'inline',
      changes: [],
      removals: ['summary'],
      sourceOptions: { data: { name: 'N', category: 'other', details: 'x'.repeat(100000) } },
    }),
    p = await until(
      f,
      (j, c) => j.compilation?.inlineWork?.target.field === 'details' && c?.phase === 'uploading',
    ),
    j = await parent(f),
    work = j.compilation.inlineWork,
    childPath = 'users/' + f.uid + '/bookLoreFieldUploads/' + work.uploadId,
    field = (await admin.doc(childPath).get()).data(),
    leasePath = 'books/' + f.bookId + '/bookResourceLeases/' + field.context.manifest.bodyId,
    before = await Promise.all(
      [f.c.path, childPath, leasePath].map((path) => admin.doc(path).get()),
    ),
    run = admin.runTransaction.bind(admin);
  admin.runTransaction = (fn) =>
    run((tx) =>
      fn(
        new Proxy(tx, {
          get(target, key) {
            if (key === 'update')
              return (ref, ...args) => {
                target.update(ref, ...args);
                if (ref.path === f.c.path) throw Error('injected inline rollback');
                return target;
              };
            const value = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        }),
      ),
    );
  try {
    await assert.rejects(() => advanceCompilation(f, p), /injected inline rollback/);
  } finally {
    admin.runTransaction = run;
  }
  for (const snapshot of before) {
    const next = await snapshot.ref.get();
    assert.deepEqual(next.data(), snapshot.data());
    assert.equal(next.updateTime.isEqual(snapshot.updateTime), true);
  }
  const advanced = (await advanceCompilation(f, p)).progress,
    view = await createBookLoreFieldUploadService({ db: admin }).getBookLoreFieldUpload(f.uid, {
      uploadId: work.uploadId,
      startHash: work.startHash,
    });
  assert.equal(view.nextIndex, 1);
  await admin.doc(f.source.seed.bookPath).delete();
  await assert.rejects(() => advanceCompilation(f, advanced));
  const done = await drainEditReservation(f, (await cancelEditReservation(f, advanced)).progress);
  assert.equal(done.phase, 'cancelled');
  assert.equal(done.reservedCount, 2);
  assert.equal(done.releasedCount, 2);
  assert.equal((await admin.doc(childPath).get()).data().phase, 'cancelled');
  assert.equal((await admin.doc(childPath + '/state/current').get()).exists, false);
  const chunks = await admin
    .collection('books/' + f.bookId + '/bookResourceChunks')
    .where('bodyId', '==', field.context.manifest.bodyId)
    .get();
  assert.equal(chunks.size, 0);
  assert.equal((await parent(f)).compilation.inlineWork, null);
});
test('SDK a recreated managed child or lease cannot resume its parent materialization', async () => {
  for (const artifact of ['child', 'lease']) {
    const f = await compilationFixture(admin, {
        mode: 'inline',
        bookId: 'native-' + artifact,
        editId: 'edit-' + artifact,
        changes: [],
        removals: ['summary'],
        sourceOptions: { data: { name: 'N', category: 'other' } },
      }),
      p = await until(f, (j) => !!j.compilation?.inlineWork),
      j = await parent(f),
      work = j.compilation.inlineWork,
      childPath = 'users/' + f.uid + '/bookLoreFieldUploads/' + work.uploadId,
      field = (await admin.doc(childPath).get()).data(),
      ref = admin.doc(
        artifact === 'child'
          ? childPath
          : 'books/' + f.bookId + '/bookResourceLeases/' + field.context.manifest.bodyId,
      ),
      value = (await ref.get()).data();
    await ref.delete();
    await ref.create(value);
    await assert.rejects(() => advanceCompilation(f, p));
    assert.equal((await ref.get()).exists, true);
  }
});
