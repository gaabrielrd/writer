import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import { BOOK_RESTORE_METHODS, jobShape } from '../src/bookRestoreUploadContracts.mjs';
import { digest } from '../src/sceneContracts.mjs';
import { projectBookBackupPersona } from '../src/bookBackupPersonas.mjs';
import {
  readAvailablePersonaMetadata,
  readPersonaRestoreBatchProof,
} from '../src/personaAvailability.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  readyRestorePersonaLibrary,
  finishRestorePersonaLibrary,
} from './helpers/bookRestorePersonaLibraryFixture.mjs';
import { personasRestoreFixture } from './helpers/bookRestorePersonasFixture.mjs';
import { draftRestoreFixture } from './helpers/bookRestoreDraftFixture.mjs';
import { record } from './helpers/bookContentFixture.mjs';
import {
  legacyMutation as mutation,
  cleanupLegacyRestore,
} from './helpers/bookLegacyRestoreFixture.mjs';
const uid = 'author',
  id = 'persona-library-0001',
  root = 'users/' + uid + '/bookRestores/' + id;
function setup() {
  const f = adventureImportDb({ nativeUpdates: true }),
    factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 });
  return { ...f, factory, api: factory() };
}
const batchPath = (p) => 'users/' + uid + '/aiPersonaRestoreBatches/' + p.bookId;
const origin = (p) => ({ schemaVersion: 1, bookId: p.bookId, restoreId: id, jobToken: p.jobToken });
const copyRows = (f) =>
  [...f.records].filter(
    ([path, v]) =>
      path.startsWith('users/' + uid + '/aiPersonas/') && v.restoreOrigin?.restoreId === id,
  );
const step = (f, p, op = 'library-install-0001') =>
  f.api.advanceBookRestorePersonaLibrary(uid, mutation(id, p, op));
function withoutPersonas() {
  const records = draftRestoreFixture({ none: true }).filter((r) => r.kind !== 'book-persona');
  return records.map((r) => {
    if (!['book-metadata', 'chapter', 'book-personas', 'book-scene-source'].includes(r.kind))
      return r;
    const value = JSON.parse(new TextDecoder().decode(r.payload));
    if (r.kind === 'book-metadata') delete value.book.personaId;
    if (r.kind === 'chapter') delete value.personaComplement;
    if (r.kind === 'book-scene-source') delete value.data.original.personaComplement;
    if (r.kind === 'book-personas')
      for (const scope of Object.keys(value.bindings)) value.bindings[scope] = 0;
    return record(r.kind, r.id, value);
  });
}
test('installs exact unique snapshots including archived and draft-only profiles without exposing a book or active batch', async () => {
  const f = setup(),
    initial = await readyRestorePersonaLibrary(f.factory, uid, id),
    definitions = new Map(
      [...f.records]
        .filter(([path]) => path.startsWith(root + '/preparedPersonas/'))
        .map(([, v]) => [v.profile.id, v.profile]),
    ),
    p = await finishRestorePersonaLibrary(f.factory, uid, id, initial),
    copies = copyRows(f),
    batch = f.records.get(batchPath(p));
  assert.equal(copies.length, definitions.size);
  assert.equal(copies.length, 3);
  for (const [, value] of copies) {
    const { restoreOrigin, ...profile } = value;
    assert.deepEqual(restoreOrigin, origin(p));
    assert.deepEqual(profile, definitions.get(profile.id));
    assert.equal(
      await f.db.runTransaction((tx) => readAvailablePersonaMetadata(tx, f.db, uid, profile.id)),
      null,
    );
  }
  assert.equal(
    copies.some(([, p]) => p.archived),
    true,
  );
  assert.ok(copies.some(([, p]) => p.instructions.startsWith('\ufeff  Draft exact')));
  assert.equal(batch.state, 'preparing');
  assert.equal(batch.profileCount, copies.length);
  assert.equal(f.records.get(root).cleanupVersion, 14);
  assert.equal(p.preparation.schemaVersion, 11);
  assert.equal(p.preparation.personaLibrary.installed, 3);
  assert.equal(p.preparation.itemIndex, initial.preparation.itemIndex);
  assert.equal(f.records.has('books/' + p.bookId), false);
  assert.equal(f.records.get('books/' + p.bookId + '/workProgress/current').countReady, false);
  assert.equal(BOOK_RESTORE_METHODS.includes('advanceBookRestorePersonaLibrary'), true);
});
test('one unit atomically creates one profile, journal, native batch and receipt', async () => {
  const f = setup(),
    initial = await readyRestorePersonaLibrary(f.factory, uid, id),
    result = await step(f, initial),
    p = result.progress,
    copies = copyRows(f),
    batch = f.records.get(batchPath(p)),
    journal = [...f.records].find(
      ([path, v]) =>
        path.startsWith(root + '/materializationArtifacts/') &&
        v.kind === 'persona-library-profile',
    );
  assert.equal(copies.length, 1);
  assert.equal(p.preparation.personaLibrary.installed, 1);
  assert.equal(p.preparation.artifactCount, initial.preparation.artifactCount + 1);
  assert.equal(batch.profileCount, 1);
  assert.equal(batch.createdByOperationId, result.receipt.operationId);
  assert.equal(journal[1].id, copies[0][1].id);
  assert.equal(f.commits.at(-1).length, 5);
});
test('same-operation replay and different-operation CAS never duplicate profiles or the batch counter', async () => {
  const f = setup(),
    p = await readyRestorePersonaLibrary(f.factory, uid, id),
    request = mutation(id, p, 'library-twin-request01'),
    twins = await Promise.all([
      f.api.advanceBookRestorePersonaLibrary(uid, request),
      f.factory().advanceBookRestorePersonaLibrary(uid, request),
    ]);
  assert.deepEqual(twins[0], twins[1]);
  assert.equal(copyRows(f).length, 1);
  const current = twins[0].progress,
    a = mutation(id, current, 'library-race-one01'),
    b = mutation(id, current, 'library-race-two01'),
    results = await Promise.allSettled([
      f.api.advanceBookRestorePersonaLibrary(uid, a),
      f.factory().advanceBookRestorePersonaLibrary(uid, b),
    ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(copyRows(f).length, 2);
  assert.equal(f.records.get(batchPath(p)).profileCount, 2);
});
test('failed commit and automatic transaction retry leave no partial batch and count only one copy', async () => {
  const f = setup(),
    p = await readyRestorePersonaLibrary(f.factory, uid, id),
    run = f.db.runTransaction.bind(f.db),
    before = structuredClone([...f.records]),
    failure = new Error('global profile write failed');
  let inject = true,
    automatic = false;
  f.db.runTransaction = async (operation) => {
    try {
      return await run(async (tx) => {
        const create = tx.create;
        tx.create = (ref, ...args) => {
          if (inject && ref.path.startsWith('users/' + uid + '/aiPersonas/')) throw failure;
          return create(ref, ...args);
        };
        return operation(tx);
      });
    } catch (error) {
      if (error === failure && automatic) {
        inject = false;
        return run(operation);
      }
      throw error;
    }
  };
  await assert.rejects(
    () => step(f, p),
    (e) => e === failure,
  );
  assert.deepEqual([...f.records], before);
  automatic = true;
  const done = (await step(f, p)).progress;
  assert.equal(done.preparation.personaLibrary.installed, 1);
  assert.equal(copyRows(f).length, 1);
});
for (const family of ['batch', 'profile', 'journal'])
  test(
    'foreign ' + family + ' blocks inventory migration without adoption or deletion',
    async () => {
      const f = setup(),
        p = await readyRestorePersonaLibrary(f.factory, uid, id);
      const path =
        family === 'batch'
          ? batchPath(p)
          : family === 'profile'
            ? 'users/' + uid + '/aiPersonas/custom-' + 'f'.repeat(64)
            : root +
              '/materializationArtifacts/' +
              digest(['persona-library-profile', 'custom-' + 'f'.repeat(64)]);
      f.records.set(
        path,
        family === 'profile'
          ? { keep: true, restoreOrigin: origin(p) }
          : family === 'journal'
            ? { kind: 'persona-library-profile', keep: true }
            : { keep: true },
      );
      const before = structuredClone([...f.records]);
      await assert.rejects(() => step(f, p));
      assert.deepEqual([...f.records], before);
      assert.equal(f.records.get(root).cleanupVersion, 13);
    },
  );
test('even an identical existing library ID is preserved rather than reused or overwritten', async () => {
  const f = setup(),
    p = await readyRestorePersonaLibrary(f.factory, uid, id),
    definition = [...f.records]
      .filter(([path]) => path.startsWith(root + '/preparedPersonas/'))
      .map(([, v]) => v.profile)
      .sort((a, b) => a.id.localeCompare(b.id))[0],
    path = 'users/' + uid + '/aiPersonas/' + definition.id;
  await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), definition));
  const before = structuredClone([...f.records]);
  await assert.rejects(() => step(f, p));
  assert.deepEqual([...f.records], before);
  assert.equal(f.records.has(batchPath(p)), false);
});
test('partial cancellation revokes the batch before media/artifacts and preserves original library plus permanent metadata', async () => {
  const f = setup(),
    initial = await readyRestorePersonaLibrary(f.factory, uid, id),
    request = mutation(id, initial, 'library-partial-op01'),
    installed = await f.api.advanceBookRestorePersonaLibrary(uid, request),
    p = installed.progress,
    keep = 'users/' + uid + '/aiPersonas/custom-current';
  const ownProfile = copyRows(f)[0][1],
    preserved = new Map([
      [keep, { keep: true }],
      ['users/other/aiPersonas/' + ownProfile.id, structuredClone(ownProfile)],
      [
        'users/' + uid + '/aiPersonas/custom-' + 'e'.repeat(64),
        {
          ...ownProfile,
          id: 'custom-' + 'e'.repeat(64),
          restoreOrigin: {
            ...origin(p),
            bookId: 'restore-' + 'e'.repeat(64),
            restoreId: 'other-restore-job01',
          },
        },
      ],
    ]);
  for (const [path, value] of preserved) f.records.set(path, value);
  let current = (await f.api.cancelBookRestore(uid, mutation(id, p, 'library-partial-cancel01')))
    .progress;
  assert.equal(current.integrity.cleanupPhase, 'persona-library');
  current = (
    await f.api.advanceBookRestoreCleanup(uid, {
      ...mutation(id, current, 'library-revoke-first01'),
      limit: 1,
    })
  ).progress;
  assert.equal(f.records.get(batchPath(p)).state, 'cancelled');
  assert.equal(copyRows(f).length, 1);
  assert.equal(current.integrity.cleanupPhase, 'cover-storage');
  assert.equal(current.preparation.personaLibrary.revoked, true);
  f.metadataReads.length = 0;
  const done = await cleanupLegacyRestore(f.api, uid, id, current, { limit: 5 });
  assert.equal(done.state, 'cancelled');
  assert.equal(copyRows(f).length, 0);
  for (const [path, value] of preserved) assert.deepEqual(f.records.get(path), value);
  assert.equal(f.records.get(batchPath(p)).state, 'cancelled');
  assert.ok(
    await f.db.runTransaction((tx) =>
      readPersonaRestoreBatchProof(tx, f.db, uid, origin(p), 'cancelled'),
    ),
  );
  assert.ok(
    f.metadataReads
      .filter((r) => r.path.startsWith('users/' + uid + '/aiPersonas/'))
      .every((r) => r.fields.length === 0),
  );
  assert.deepEqual(
    (await f.api.advanceBookRestorePersonaLibrary(uid, request)).receipt,
    installed.receipt,
  );
  assert.equal(copyRows(f).length, 0);
});
test('zero profiles installs an empty pending batch and still follows cancellation protocol', async () => {
  const f = setup(),
    initial = await readyRestorePersonaLibrary(f.factory, uid, id, withoutPersonas()),
    p = (await step(f, initial)).progress;
  assert.equal(p.preparation.phase, 'resources-finalize');
  assert.equal(p.preparation.personaLibrary.installed, 0);
  assert.equal(f.records.get(batchPath(p)).profileCount, 0);
  assert.equal(copyRows(f).length, 0);
  const done = await cleanupLegacyRestore(f.api, uid, id, p, { limit: 5 });
  assert.equal(done.state, 'cancelled');
  assert.equal(f.records.get(batchPath(p)).state, 'cancelled');
});
test('recreated global profile is preserved and cannot be deleted through its old journal', async () => {
  const f = setup(),
    initial = await readyRestorePersonaLibrary(f.factory, uid, id),
    p = (await step(f, initial)).progress,
    [path, value] = copyRows(f)[0];
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(path)));
  await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), value));
  await assert.rejects(() => cleanupLegacyRestore(f.api, uid, id, p, { limit: 5 }));
  assert.deepEqual(f.records.get(path), value);
  assert.equal(f.records.get(batchPath(p)).state, 'cancelled');
});
test('recreated batch cannot authorize another install or revocation, preserving the new incarnation', async () => {
  const f = setup(),
    initial = await readyRestorePersonaLibrary(f.factory, uid, id),
    p = (await step(f, initial)).progress,
    path = batchPath(p),
    value = structuredClone(f.records.get(path));
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(path)));
  await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), value));
  const before = structuredClone([...f.records]);
  await assert.rejects(() => step(f, p, 'library-after-recreate01'));
  assert.deepEqual([...f.records], before);
  const cancelling = (
    await f.api.cancelBookRestore(uid, mutation(id, p, 'library-recreated-cancel01'))
  ).progress;
  await assert.rejects(() =>
    f.api.advanceBookRestoreCleanup(uid, {
      ...mutation(id, cancelling, 'library-recreated-clean01'),
      limit: 5,
    }),
  );
  assert.deepEqual(f.records.get(path), value);
  assert.equal(copyRows(f).length, 1);
});
test('missing prepared definition cannot complete the exact validated profile total', async () => {
  const f = setup(),
    initial = await readyRestorePersonaLibrary(f.factory, uid, id),
    path = [...f.records.keys()]
      .filter((path) => path.startsWith(root + '/preparedPersonas/'))
      .sort()[0];
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(path)));
  await assert.rejects(() => finishRestorePersonaLibrary(f.factory, uid, id, initial));
  assert.equal(f.records.get(root).preparation.phase, 'personas-integrate');
  assert.equal(f.records.has('books/' + initial.bookId), false);
});
test('closed progress, early completion and counter corruption fail without granting availability', async () => {
  const f = setup(),
    initial = await readyRestorePersonaLibrary(f.factory, uid, id),
    p = (await step(f, initial)).progress,
    job = f.records.get(root);
  assert.equal(p.preparation.personaLibrary.installed, 1);
  for (const change of [
    (v) => (v.personaLibrary.after = null),
    (v) => (v.personaLibrary.path = 'outside'),
    (v) => (v.personaLibrary.revoked = true),
    (v) => (v.personaLibrary.installed = Number.MAX_SAFE_INTEGER),
    (v) => (v.phase = 'resources-finalize'),
  ]) {
    const value = structuredClone(job);
    change(value.preparation);
    assert.throws(() => jobShape(uid, id, value));
  }
});
test('portable profile rejects malformed Unicode and unsafe revisions rather than relying on lossy native conversion', () => {
  const { shared } = personasRestoreFixture();
  for (const change of [
    (v) => (v.name = String.fromCharCode(0xd800)),
    (v) => (v.instructions = String.fromCharCode(0xdc00)),
    (v) => (v.traits[0].low = String.fromCharCode(0xd800)),
    (v) => (v.revision = Number.MAX_SAFE_INTEGER + 1),
  ]) {
    const value = structuredClone(shared);
    change(value);
    assert.throws(() => projectBookBackupPersona(value));
  }
  assert.equal(projectBookBackupPersona(shared).instructions, shared.instructions);
});
