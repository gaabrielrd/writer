import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  bookRestoreEditorialAddress,
  assertBookRestoreEditorialNamespacesEmpty,
} from '../src/bookRestoreEditorialInventory.mjs';
import { prepareBookRestoreEditorialCleanup } from '../src/bookRestoreEditorialCleanup.mjs';
import {
  prepareBookRestoreArtifacts,
  prepareBookRestoreArtifactsCleanup,
} from '../src/bookRestoreArtifacts.mjs';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import { digest } from '../src/sceneContracts.mjs';
const uid = 'author',
  restoreId = 'editorial-inventory-0001',
  cid = 'c'.repeat(64),
  token = 'a'.repeat(64);
function fixture(version = 15) {
  const f = adventureImportDb({ nativeUpdates: true });
  const loaded = {
    ref: f.db.doc('users/' + uid + '/bookRestores/' + restoreId),
    view: { jobToken: token },
    job: {
      ownerId: uid,
      restoreId,
      bookId: 'editorial-copy-0001',
      cleanupVersion: version,
      checkpoint: 20,
      state: 'content-verified',
      cleanupPhase: 'done',
      preparation: {
        schemaVersion: 13,
        phase: 'activation-ready',
        audit: { phase: 'done' },
        artifactCount: 0,
        cleanedArtifacts: 0,
      },
    },
  };
  async function install(writes, version = loaded.job.cleanupVersion) {
    const created = await f.db.runTransaction(async (tx) => {
      const prepared = await prepareBookRestoreArtifacts(
        tx,
        f.db,
        loaded,
        'editorial-write-0001',
        writes,
        version,
      );
      prepared.commit();
      tx.create(f.db.doc('users/' + uid + '/bookRestoreOperations/editorial-write-0001'), {
        ownerId: uid,
        restoreId,
        jobToken: token,
        receipt: {
          action: 'advanceBookRestoreEditorial',
          operationId: 'editorial-write-0001',
          checkpoint: 1,
        },
      });
      return prepared.created;
    });
    loaded.job.cleanupVersion = version;
    loaded.job.preparation.artifactCount += created;
    loaded.job.state = 'cancelling';
    loaded.job.cleanupPhase = 'editorial';
  }
  async function cleanup(limit = 1, rollback = false) {
    const patch = await f.db.runTransaction(async (tx) => {
      const prepared = await prepareBookRestoreEditorialCleanup(tx, f.db, loaded, limit);
      for (const ref of prepared.remove) tx.delete(ref);
      if (rollback) throw new Error('rollback');
      return prepared.patch;
    });
    loaded.job = { ...loaded.job, ...patch };
    return patch;
  }
  return { ...f, loaded, install, cleanup };
}
const part = (index) => ({
  kind: 'editorial-part',
  id: cid + ':' + String(index).padStart(15, '0'),
  value: { bytes: 'PRIVATE_BODY_' + index },
});
const heads = () => [
  { kind: 'editorial-record', id: cid, value: { bodyId: cid, kind: 'artifact' } },
  { kind: 'editorial-body', id: cid, value: { contentHash: 'd'.repeat(64) } },
  { kind: 'editorial-control', id: 'current', value: { phase: 'preparing' } },
];
test('v15 addresses are closed, typed and unavailable to previous or unknown inventories', () => {
  const f = fixture();
  assert.equal(
    bookRestoreEditorialAddress(f.loaded, 'editorial-record', cid),
    'books/editorial-copy-0001/literaryArchive/' + cid,
  );
  assert.equal(
    bookRestoreEditorialAddress(f.loaded, 'editorial-control', 'current'),
    f.loaded.ref.path + '/preparedEditorial/current',
  );
  for (const version of [1, 14, 16])
    assert.throws(() => bookRestoreEditorialAddress(f.loaded, 'editorial-record', cid, version));
  for (const id of ['../escape', cid + ':0', cid + ':000000000000128'])
    assert.throws(() => bookRestoreEditorialAddress(f.loaded, 'editorial-part', id));
  assert.equal(bookRestoreEditorialAddress(f.loaded, 'chapter', 'chapter'), null);
});
test('upgrading v14 requires the complete base preparation and actual absence of every new namespace', async () => {
  const f = fixture(14);
  await f.install(heads(), 15);
  assert.equal(f.loaded.job.cleanupVersion, 15);
  const unfinished = fixture(14);
  unfinished.loaded.job.preparation.audit.phase = 'scan';
  await assert.rejects(unfinished.install(heads(), 15));
  assert.equal(unfinished.records.size, 0);
  const old = fixture(13);
  await assert.rejects(old.install(heads(), 15));
  assert.equal(old.records.size, 0);
  const foreign = fixture(14);
  foreign.records.set('books/editorial-copy-0001/literaryArchiveBodies/' + cid, { foreign: true });
  const before = structuredClone([...foreign.records]);
  await assert.rejects(foreign.install(heads(), 15));
  assert.deepEqual([...foreign.records], before);
});
test('parts are removed before any header and empty certification consumes a separate unit', async () => {
  const f = fixture();
  await f.install([...heads(), part(0), part(1)]);
  const root = 'books/editorial-copy-0001/';
  f.metadataReads.length = 0;
  await f.cleanup(1);
  assert.equal(f.loaded.job.preparation.cleanedArtifacts, 1);
  assert.equal(f.records.has(root + 'literaryArchive/' + cid), true);
  await f.cleanup(1);
  assert.equal(f.loaded.job.preparation.cleanedArtifacts, 2);
  assert.equal(f.records.has(root + 'literaryArchiveBodies/' + cid), true);
  await f.cleanup(50);
  assert.equal(f.loaded.job.preparation.cleanedArtifacts, 5);
  assert.equal(f.loaded.job.cleanupPhase, 'editorial');
  await f.cleanup(50);
  assert.equal(f.loaded.job.cleanupPhase, 'resource-children');
  assert.equal(f.loaded.job.preparation.artifactCount, 5);
  const metadata = f.metadataReads.filter((row) => row.path.includes('/literaryArchive'));
  assert.ok(metadata.length > 0);
  assert.equal(
    metadata.every((row) => row.fields.length === 0),
    true,
  );
  assert.equal(f.records.has('books/editorial-copy-0001'), false);
});
test('a foreign or unregistered part blocks header removal and never certifies an empty inventory', async () => {
  const f = fixture();
  await f.install(heads());
  f.records.set('books/editorial-copy-0001/literaryArchiveParts/' + cid + ':000000000000000', {
    foreign: true,
  });
  const before = structuredClone([...f.records]);
  await assert.rejects(f.cleanup(50));
  assert.deepEqual([...f.records], before);
});
test('a recreated native part or receipt cannot authorize cancellation of apparently identical data', async () => {
  for (const receipt of [false, true]) {
    const f = fixture();
    await f.install([...heads(), part(0)]);
    const path = receipt
      ? 'users/' + uid + '/bookRestoreOperations/editorial-write-0001'
      : bookRestoreEditorialAddress(f.loaded, 'editorial-part', part(0).id);
    const native = f.metadata.get(path);
    f.metadata.set(path, { ...native, createdAtNanoseconds: native.createdAtNanoseconds + 100 });
    const before = structuredClone([...f.records]);
    await assert.rejects(f.cleanup(50));
    assert.deepEqual([...f.records], before);
  }
});
test('rollback preserves parts, journals and aggregate counters without consuming the unit', async () => {
  const f = fixture();
  await f.install([...heads(), part(0)]);
  const before = structuredClone([...f.records]),
    preparation = structuredClone(f.loaded.job.preparation);
  await assert.rejects(f.cleanup(50, true), /rollback/);
  assert.deepEqual([...f.records], before);
  assert.deepEqual(f.loaded.job.preparation, preparation);
  await f.cleanup(50);
  assert.equal(f.loaded.job.preparation.cleanedArtifacts, 1);
});
test('more than fifty parts use bounded units and preserve another book and operation namespace', async () => {
  const f = fixture();
  await f.install([...heads(), ...Array.from({ length: 55 }, (_, index) => part(index))]);
  const other = 'books/other/literaryArchiveParts/' + cid + ':000000000000000';
  f.records.set(other, { preserved: true });
  const otherOperation = 'users/author/bookRestores/other/preparedEditorial/current';
  f.records.set(otherOperation, { preserved: true });
  await f.cleanup(50);
  assert.equal(f.loaded.job.preparation.cleanedArtifacts, 50);
  assert.equal(f.records.has('books/editorial-copy-0001/literaryArchive/' + cid), true);
  await f.cleanup(50);
  assert.equal(f.loaded.job.preparation.cleanedArtifacts, 55);
  await f.cleanup(50);
  await f.cleanup(50);
  assert.equal(f.loaded.job.cleanupPhase, 'resource-children');
  assert.deepEqual(f.records.get(other), { preserved: true });
  assert.deepEqual(f.records.get(otherOperation), { preserved: true });
});
test('the generic artifact cleaner cannot bypass the dedicated editorial phase', async () => {
  const f = fixture();
  await f.install(heads());
  f.loaded.job.cleanupPhase = 'artifacts';
  await assert.rejects(
    f.db.runTransaction((tx) => prepareBookRestoreArtifactsCleanup(tx, f.db, f.loaded, 50)),
  );
});
test('a foreign journal actor cannot grant cleanup of apparently owned parts', async () => {
  const f = fixture();
  await f.install([...heads(), part(0)]);
  const journal =
    f.loaded.ref.path + '/materializationArtifacts/' + digest(['editorial-part', part(0).id]);
  f.records.set(journal, { ...f.records.get(journal), ownerId: 'other' });
  await assert.rejects(f.cleanup(50));
});
test('empty certification checks physical headers, controls and journals rather than the counters alone', async () => {
  for (const suffix of ['literaryArchive', 'literaryArchiveBodies', 'literaryArchiveParts']) {
    const f = fixture();
    f.records.set('books/editorial-copy-0001/' + suffix + '/' + cid, {});
    await assert.rejects(
      f.db.runTransaction((tx) => assertBookRestoreEditorialNamespacesEmpty(tx, f.db, f.loaded)),
    );
  }
  const f = fixture();
  f.records.set(f.loaded.ref.path + '/preparedEditorial/foreign', {});
  await assert.rejects(
    f.db.runTransaction((tx) => assertBookRestoreEditorialNamespacesEmpty(tx, f.db, f.loaded)),
  );
  const orphan = fixture();
  orphan.records.set(orphan.loaded.ref.path + '/materializationArtifacts/' + cid, {
    kind: 'editorial-record',
  });
  await assert.rejects(
    orphan.db.runTransaction((tx) =>
      assertBookRestoreEditorialNamespacesEmpty(tx, orphan.db, orphan.loaded),
    ),
  );
});
test('v2 source admission remains closed while the new inventory and active projections are incomplete', async () => {
  const f = fixture(),
    api = createBookRestoreUploadService({ db: f.db, now: () => 1000 });
  await assert.rejects(
    api.startBookRestore(uid, {
      operationId: 'editorial-start-0001',
      reviewHash: token,
      source: { format: 'writer-book-archive', version: 2, byteLength: 100, sha256: token },
    }),
  );
  assert.equal(f.records.size, 0);
});

test('cancellation closes creation of editorial records before any late bytes or journal can be written', async () => {
  const f = fixture();
  await f.install([...heads(), part(0)]);
  const before = structuredClone([...f.records]);
  await assert.rejects(
    f.db.runTransaction((tx) =>
      prepareBookRestoreArtifacts(tx, f.db, f.loaded, 'editorial-late-write-0001', [part(1)]),
    ),
  );
  assert.deepEqual([...f.records], before);
});

test('editable contract, plan, versions and review addresses are closed to v15 and cannot escape the new book', () => {
  const f = fixture(),
    plan = 'restore-' + cid;
  for (const [kind, id, suffix] of [
    ['editorial-contract', 'current', 'literaryProduction/current'],
    ['editorial-contract-version', '1', 'literaryContractVersions/1'],
    ['editorial-plan', plan, 'literaryPlans/' + plan],
    ['editorial-plan-version', cid, 'literaryPlanVersions/' + cid],
    ['editorial-review', 'contract', 'literaryRestoreReviews/contract'],
  ]) {
    assert.equal(
      bookRestoreEditorialAddress(f.loaded, kind, id),
      'books/editorial-copy-0001/' + suffix,
    );
    assert.throws(() => bookRestoreEditorialAddress(f.loaded, kind, id, 14));
    assert.throws(() => bookRestoreEditorialAddress(f.loaded, kind, '../other'));
  }
});
