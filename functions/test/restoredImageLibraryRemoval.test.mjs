import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createBookRestoreCoverStorage } from '../src/bookRestoreCoverStorage.mjs';
import { createImageLibraryService, libraryImage } from '../src/imageLibrary.mjs';
import { bookRestoreStorageBucket } from './helpers/bookRestoreStorageBucket.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
const bytes = Buffer.from('89504e470d0a1a0a00000000', 'hex'),
  uid = 'author',
  c = {
    ownerId: uid,
    restoreId: 'library-restore-0001',
    jobToken: 'a'.repeat(64),
    imageId: 'restore-' + 'b'.repeat(64),
    contentHash: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.length,
  },
  path = 'book-covers/' + uid + '/' + c.imageId + '.png',
  row = 'users/' + uid + '/imageLibrary/' + c.imageId;
async function setup({ pending = false, delayed = false } = {}) {
  const f = adventureImportDb({ nativeUpdates: true }),
    storage = bookRestoreStorageBucket(),
    adapter = createBookRestoreCoverStorage(storage.bucket),
    calls = [];
  const doc = f.db.doc.bind(f.db);
  f.db.doc = (p) => {
    const ref = doc(p);
    ref.update = (patch) => f.db.runTransaction((tx) => tx.update(ref, patch));
    return ref;
  };
  let enter,
    release,
    once = true,
    late = null;
  if (delayed) {
    const entered = new Promise((r) => (enter = r)),
      gate = new Promise((r) => (release = r));
    storage.hooks.beforeSave = async (_path, data) => {
      if (data.length && once) {
        once = false;
        enter();
        await gate;
      }
    };
    late = adapter.stage(c, bytes);
    await entered;
  }
  const proof = await adapter.stage(c, bytes),
    active = pending ? null : await adapter.accept(c, proof),
    value = {
      ...libraryImage(
        c.imageId,
        { title: 'Own image', coverUrl: active?.url ?? null, path, acceptedAt: 1000 },
        1000,
      ),
      state: pending ? 'preparing' : 'active',
      restoreOrigin: {
        schemaVersion: 1,
        restoreId: c.restoreId,
        jobToken: c.jobToken,
        activationOperationId: 'original-activation-0001',
        bookId: 'restore-' + 'c'.repeat(64),
      },
      restoreStorage: {
        schemaVersion: 1,
        contentHash: c.contentHash,
        byteLength: bytes.length,
        proof,
        ...(active ? { publishedProof: active.proof } : {}),
      },
    },
    assets = {
      async remove(p) {
        calls.push('legacy-remove');
        return storage.bucket().file(p).delete({ ignoreNotFound: true });
      },
      async retireRestoreImage(...args) {
        calls.push('retire');
        return adapter.retire(...args);
      },
    };
  await f.db.runTransaction((tx) => tx.create(f.db.doc(row), value));
  const library = createImageLibraryService({ db: f.db, assets, now: () => 2000 });
  return { ...f, storage, adapter, assets, library, proof, calls, late, release };
}
test('actual library removal prevents a delayed duplicate from recreating the accepted image', async () => {
  const f = await setup({ delayed: true });
  let result;
  try {
    result = await f.library.remove(uid, { id: c.imageId });
  } finally {
    f.release();
  }
  await assert.rejects(() => f.late);
  assert.deepEqual(result, { deleted: true });
  assert.equal(f.records.get(row).state, 'deleted');
  assert.deepEqual(f.calls, ['retire']);
  assert.equal(f.storage.version(path).bytes.length, 0);
  assert.equal(f.storage.version(path).metadata.metadata.restoreState, 'retired');
  assert.equal(f.storage.versions.get(path).size, 1);
  const marker = f.storage.current.get(path);
  await f.library.remove(uid, { id: c.imageId });
  assert.equal(f.storage.current.get(path), marker);
  assert.equal(f.records.get(row).state, 'deleted');
});
test('pending detached restoration uses the same retirement path without needing a published URL', async () => {
  const f = await setup({ pending: true });
  await f.library.remove(uid, { id: c.imageId });
  assert.equal(f.records.get(row).state, 'deleted');
  assert.equal(f.storage.version(path).bytes.length, 0);
  assert.equal(f.storage.version(path).metadata.metadata.accepted, 'false');
});
test('missing retirement adapter cannot fall back to legacy deletion or claim the restored image', async () => {
  const f = await setup(),
    before = structuredClone([...f.records]),
    at = f.storage.events.length,
    library = createImageLibraryService({ db: f.db, assets: { remove: f.assets.remove } });
  await assert.rejects(() => library.remove(uid, { id: c.imageId }));
  assert.deepEqual([...f.records], before);
  assert.equal(f.storage.events.length, at);
  assert.deepEqual(f.calls, []);
});
test('lost external ACK leaves a resumable deleting record and never removes the permanent marker', async () => {
  const f = await setup();
  let once = true;
  f.storage.hooks.afterSave = (_path, v) => {
    if (!v.bytes.length && once) {
      once = false;
      throw Error('lost retiring ACK');
    }
  };
  await assert.rejects(() => f.library.remove(uid, { id: c.imageId }), /lost retiring ACK/);
  assert.equal(f.records.get(row).state, 'deleting');
  const marker = f.storage.current.get(path);
  await f.library.remove(uid, { id: c.imageId });
  assert.equal(f.records.get(row).state, 'deleted');
  assert.equal(f.storage.current.get(path), marker);
  assert.equal(f.storage.versions.get(path).size, 1);
});
test('Firestore finalization rollback preserves the marker and the next removal finalizes the original library record', async () => {
  const f = await setup(),
    run = f.db.runTransaction.bind(f.db),
    error = Error('final rollback');
  let once = true;
  f.db.runTransaction = (cb) =>
    run((tx) =>
      cb({
        ...tx,
        update(ref, patch) {
          if (ref.path === row && patch.state === 'deleted' && once) {
            once = false;
            throw error;
          }
          return tx.update(ref, patch);
        },
      }),
    );
  await assert.rejects(
    () => f.library.remove(uid, { id: c.imageId }),
    (e) => e === error,
  );
  assert.equal(f.records.get(row).state, 'deleting');
  const marker = f.storage.current.get(path);
  await f.library.remove(uid, { id: c.imageId });
  assert.equal(f.records.get(row).state, 'deleted');
  assert.equal(f.storage.current.get(path), marker);
});
test('concurrent removers confirm the same deleted incarnation without replacing the marker', async () => {
  const f = await setup(),
    answers = await Promise.all([
      f.library.remove(uid, { id: c.imageId }),
      f.library.remove(uid, { id: c.imageId }),
    ]);
  assert.deepEqual(answers, [{ deleted: true }, { deleted: true }]);
  assert.equal(f.records.get(row).state, 'deleted');
  assert.equal(f.storage.versions.get(path).size, 1);
});
test('library record recreated while Storage is retiring is preserved and cannot be marked deleted', async () => {
  const f = await setup(),
    retire = f.assets.retireRestoreImage;
  let replacement;
  f.assets.retireRestoreImage = async (...args) => {
    const result = await retire(...args),
      value = f.records.get(row);
    replacement = { ...value, name: 'Replacement' };
    await f.db.runTransaction((tx) => tx.delete(f.db.doc(row)));
    await f.db.runTransaction((tx) => tx.create(f.db.doc(row), replacement));
    return result;
  };
  await assert.rejects(() => f.library.remove(uid, { id: c.imageId }));
  assert.deepEqual(f.records.get(row), replacement);
  assert.equal(f.storage.version(path).bytes.length, 0);
});
test('uses with an inconsistent zero counter block restored removal before either store changes', async () => {
  const f = await setup();
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc(row + '/uses/foreign'), { bookId: 'foreign' }),
  );
  const before = structuredClone([...f.records]),
    at = f.storage.events.length;
  await assert.rejects(() => f.library.remove(uid, { id: c.imageId }));
  assert.deepEqual([...f.records], before);
  assert.equal(f.storage.events.length, at);
});
test('malformed restore provenance cannot downgrade into raw deletion even if request supplies replacement context', async () => {
  for (const patch of [
    { restoreStorage: null },
    { restoreOrigin: null },
    { path: 'book-covers/other/copied.png' },
    { restoreStorage: { schemaVersion: 1, proof: { generation: '1', metageneration: '1' } } },
  ]) {
    const f = await setup();
    await f.db.runTransaction((tx) => tx.update(f.db.doc(row), patch));
    const before = structuredClone([...f.records]),
      at = f.storage.events.length;
    await assert.rejects(() => f.library.remove(uid, { id: c.imageId, context: c }));
    assert.deepEqual([...f.records], before);
    assert.equal(f.storage.events.length, at);
    assert.deepEqual(f.calls, []);
  }
});
test('legacy and generated images without restoration metadata retain their normal removal path', async () => {
  const f = await setup();
  const id = 'generated-image-0001',
    p = 'book-covers/' + uid + '/' + id + '.png',
    ref = f.db.doc('users/' + uid + '/imageLibrary/' + id);
  f.storage.put(p, bytes, { contentType: 'image/png', metadata: { accepted: 'true' } });
  await f.db.runTransaction((tx) =>
    tx.create(ref, libraryImage(id, { title: 'Legacy', coverUrl: 'Own URL', path: p }, 1000)),
  );
  await f.library.remove(uid, { id });
  assert.equal(f.records.get(ref.path).state, 'deleted');
  assert.equal(f.storage.current.has(p), false);
  assert.deepEqual(f.calls, ['legacy-remove']);
  await f.library.remove(uid, { id });
  assert.deepEqual(f.calls, ['legacy-remove']);
});
