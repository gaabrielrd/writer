import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readyArchive,
  archiveStep,
  finishArchive,
  archiveRequest,
  uid,
} from './helpers/bookRestoreArchiveFixture.mjs';
import { BOOK_RESTORE_ARCHIVE_NAMES } from '../src/bookRestoreArchiveContracts.mjs';
import { fullAuditRecords } from './helpers/bookRestoreAuditFixture.mjs';
import { readyLegacyArchive } from './helpers/bookRestoreArchiveLegacyFixture.mjs';
import { createBookLoreReadService } from '../src/bookLoreRead.mjs';
import { readAvailablePersonaMetadata } from '../src/personaAvailability.mjs';
import { mediaState, readyMedia, finishMedia } from './helpers/bookRestoreMediaFixture.mjs';
test('archive cleanup removes all known private preparation and source namespaces with bounded metadata, exact totals and no writes to live content or activation proofs', async () => {
  const f = await readyArchive(),
    original = [...f.records].filter(
      ([path]) =>
        path.startsWith('books/') ||
        path.includes('/aiPersonas/') ||
        path.includes('/aiPersonaRestoreBatches/') ||
        path.includes('/imageLibrary/') ||
        path.includes('/bookRestoreOperations/') ||
        path.includes('/bookRestoreMediaOperations/') ||
        path === 'bookRestoreReservations/' + f.p.bookId ||
        path === f.root ||
        path === f.root + '/activationMedia/current',
    ),
    before = structuredClone(original),
    start = f.commits.length,
    readStart = f.reads.length,
    storage = f.storage.events.length;
  const p = await finishArchive(f);
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
  assert.equal(p.removed.states, 1);
  assert.ok(p.removed.privateArtifacts > 0);
  for (const [path, value] of before) assert.deepEqual(f.records.get(path), value, path);
  for (const name of BOOK_RESTORE_ARCHIVE_NAMES)
    assert.equal(
      [...f.records.keys()].some((path) => path.startsWith(f.root + '/' + name + '/')),
      false,
      name,
    );
  for (const writes of f.commits.slice(start)) {
    assert.ok(writes.length <= 18);
    for (const write of writes)
      assert.ok(
        write.path.startsWith(f.root + '/') ||
          write.path.startsWith('users/' + uid + '/bookRestoreArchiveOperations/'),
        write.path,
      );
  }
  assert.ok(f.reads.slice(readStart).every((q) => q.maximum <= 8));
  assert.ok(Buffer.byteLength(JSON.stringify(p)) < 4096);
  assert.equal(f.storage.events.length, storage);
  assert.deepEqual(await f.factory().activateBookRestore(uid, f.request), f.activation);
  assert.deepEqual((await mediaState(f)).media, f.mediaDone.media);
  const lore = createBookLoreReadService({ db: f.db }),
    rows = await lore.listBookLoreRead(uid, { bookId: f.p.bookId, limit: 1 }),
    head = await lore.getBookLoreRead(uid, {
      bookId: f.p.bookId,
      id: rows.items[0].id,
      readToken: rows.items[0].readToken,
    });
  assert.ok(head);
  for (const [path] of before.filter(([path]) => path.includes('/aiPersonas/')))
    assert.ok(
      await f.db.runTransaction((tx) =>
        readAvailablePersonaMetadata(tx, f.db, uid, path.split('/').at(-1)),
      ),
    );
});
test('cleanup resumes by fresh service, replays old receipts with current progress and returns done without extra writes', async () => {
  const f = await readyArchive({ none: true }),
    first = await archiveStep(f),
    p = await finishArchive(f, first.progress),
    before = structuredClone([...f.records]);
  const replay = await archiveStep(f);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.deepEqual(replay.progress, p);
  assert.deepEqual(
    await f.factory().getBookRestoreArchiveCleanup(uid, {
      restoreId: f.id,
      jobToken: f.p.jobToken,
    }),
    { schemaVersion: 1, progress: p },
  );
  const later = await archiveStep(f, p, f.id + '-already-done');
  assert.equal(later.kind, 'already-complete');
  assert.deepEqual([...f.records], before);
});

async function untilPhase(f, phase) {
  let p = f.archiveProgress;
  for (let n = 0; n < 10000 && p.phase !== phase; n++)
    p = (await archiveStep(f, p, f.id + '-seek-' + n)).progress;
  assert.equal(p.phase, phase);
  return p;
}
async function refusesWithoutAdvancing(f, p) {
  for (let n = 0; n < 10000; n++) {
    const before = structuredClone([...f.records]);
    try {
      p = (await archiveStep(f, p, f.id + '-refuse-' + n)).progress;
    } catch (error) {
      assert.deepEqual([...f.records], before);
      return { error, progress: p };
    }
    if (p.phase === 'done') assert.fail('Expected refusal before completion');
  }
  assert.fail('Refusal not reached');
}
async function recreate(f, path) {
  const value = structuredClone(f.records.get(path));
  assert.ok(value, path);
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
  return value;
}
test('cleanup waits for media and rejects foreign identity, injected cursor and stale revisions without deleting anything', async () => {
  const f = await readyMedia(),
    input = { restoreId: f.id, jobToken: f.p.jobToken };
  assert.equal(
    (await f.factory().getBookRestoreArchiveCleanup(uid, input)).progress.phase,
    'waiting-for-media',
  );
  await assert.rejects(() =>
    f.factory().advanceBookRestoreArchiveCleanup(uid, {
      ...input,
      operationId: f.id + '-early',
      expectedRevision: 0,
    }),
  );
  await finishMedia(f);
  f.archiveProgress = (await f.factory().getBookRestoreArchiveCleanup(uid, input)).progress;
  const before = structuredClone([...f.records]);
  for (const [actor, patch] of [
    ['other', {}],
    [uid, { jobToken: 'a'.repeat(64) }],
    [uid, { after: 'forged' }],
    [uid, { expectedRevision: 1 }],
    [uid, { expectedCheckpoint: 0 }],
  ])
    await assert.rejects(() =>
      f.factory().advanceBookRestoreArchiveCleanup(actor, {
        ...archiveRequest(f, f.archiveProgress),
        ...patch,
      }),
    );
  assert.deepEqual([...f.records], before);
  const first = await archiveStep(f),
    after = structuredClone([...f.records]);
  await assert.rejects(() => archiveStep(f, f.archiveProgress, f.id + '-stale'));
  await assert.rejects(() =>
    archiveStep(f, first.progress, archiveRequest(f, f.archiveProgress).operationId),
  );
  assert.deepEqual([...f.records], after);
});
for (const kind of ['control', 'first', 'last'])
  test('a recreated cleanup ' + kind + ' is refused and preserves source data', async () => {
    const f = await readyArchive(),
      a = await archiveStep(f),
      b = await archiveStep(f, a.progress),
      path =
        kind === 'control'
          ? f.root + '/archiveCleanup/current'
          : 'users/' +
            uid +
            '/bookRestoreArchiveOperations/' +
            (kind === 'first' ? a.progress.firstOperationId : b.progress.lastOperationId);
    await recreate(f, path);
    const before = structuredClone([...f.records]);
    await assert.rejects(() => archiveStep(f, b.progress));
    await assert.rejects(() =>
      f.factory().getBookRestoreArchiveCleanup(uid, { restoreId: f.id, jobToken: f.p.jobToken }),
    );
    assert.deepEqual([...f.records], before);
  });
for (const kind of ['journal', 'receipt', 'private-target'])
  test(
    'a recreated ' + kind + ' in preparation is protected by original native provenance',
    async () => {
      const f = await readyArchive();
      let p = f.archiveProgress,
        path;
      const all = () =>
        [...f.records.keys()]
          .filter((k) => k.startsWith(f.root + '/materializationArtifacts/'))
          .sort();
      if (kind === 'private-target') {
        const journal = all().find((k) => f.records.get(k).kind === 'cover-definition');
        while (
          !all()
            .filter((k) => p.after === null || k.split('/').at(-1) > p.after)
            .slice(0, 8)
            .includes(journal)
        )
          p = (await archiveStep(f, p)).progress;
        path = f.root + '/preparedCovers/current';
      } else {
        const journal = all()[0];
        path =
          kind === 'journal'
            ? journal
            : 'users/' +
              uid +
              '/bookRestoreOperations/' +
              f.records.get(journal).createdByOperationId;
      }
      await recreate(f, path);
      const before = structuredClone([...f.records]);
      await assert.rejects(() => archiveStep(f, p));
      assert.deepEqual([...f.records], before);
    },
  );
for (const kind of ['chunk', 'proof', 'index', 'item', 'state'])
  test('a recreated original ' + kind + ' cannot be erased as archive data', async () => {
    const f = await readyArchive(),
      phase = ['chunk', 'proof'].includes(kind)
        ? 'operations'
        : kind === 'index'
          ? 'validation-index'
          : kind === 'item'
            ? 'validation-items'
            : 'validation-state',
      p = await untilPhase(f, phase),
      name = {
        chunk: 'chunks',
        proof: 'integrityProofs',
        index: 'validationIndex',
        item: 'validationItems',
        state: 'validationState',
      }[kind],
      path = [...f.records.keys()].filter((k) => k.startsWith(f.root + '/' + name + '/')).sort()[0],
      value = await recreate(f, path);
    await refusesWithoutAdvancing(f, p);
    assert.deepEqual(f.records.get(path), value);
  });
test('missing original source data blocks the exact total instead of inventing a cleaned chunk', async () => {
  const f = await readyArchive(),
    p = await untilPhase(f, 'operations'),
    path = [...f.records.keys()].find((k) => k.startsWith(f.root + '/chunks/'));
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
  const refused = await refusesWithoutAdvancing(f, p);
  assert.notEqual(refused.progress.phase, 'done');
  assert.ok(refused.progress.removed.chunks < f.p.uploadedChunks);
});
test('an unjournaled private orphan is preserved and prevents final empty certification', async () => {
  const f = await readyArchive(),
    path = f.root + '/preparedCovers/foreign',
    value = { ownerId: 'foreign', keep: 'other content' };
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
  await refusesWithoutAdvancing(f, f.archiveProgress);
  assert.deepEqual(f.records.get(path), value);
});
test('live edits and root deletion do not make archive journals authorize deleting live book or library data', async () => {
  const f = await readyArchive();
  await f.db.runTransaction((tx) => {
    tx.update(f.db.doc('books/' + f.p.bookId + '/workProgress/current'), {
      revision: 100,
      wordCount: 200,
    });
    tx.delete(f.db.doc('books/' + f.p.bookId));
    tx.create(f.db.doc('deletedBooks/' + f.p.bookId), { kind: 'normal-deletion' });
  });
  const filter = () =>
      [...f.records].filter(
        ([p]) =>
          p.startsWith('books/') || p.includes('/imageLibrary/') || p.includes('/aiPersonas/'),
      ),
    before = structuredClone(filter());
  assert.equal((await finishArchive(f)).phase, 'done');
  assert.deepEqual(filter(), before);
  assert.equal(f.records.has('books/' + f.p.bookId), false);
});
test('rollback and automatic callback retry delete one page and preserve exact counters', async () => {
  const f = await readyArchive(),
    before = structuredClone([...f.records]),
    run = f.db.runTransaction.bind(f.db),
    failure = Error('simulated archive write failure');
  let inject = true,
    automatic = false;
  f.db.runTransaction = async (operation) => {
    try {
      return await run((tx) => {
        const create = tx.create.bind(tx);
        tx.create = (ref, ...args) => {
          if (inject && ref.path === f.root + '/archiveCleanup/current') throw failure;
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
    () => archiveStep(f),
    (e) => e === failure,
  );
  assert.deepEqual([...f.records], before);
  automatic = true;
  const first = await archiveStep(f);
  assert.equal(first.progress.revision, 1);
  assert.ok(first.progress.removed.journals <= 8);
  assert.deepEqual(await archiveStep(f), first);
  assert.equal(
    f.commits.filter((ws) => ws.some((w) => w.path === f.root + '/archiveCleanup/current')).length,
    1,
  );
});
test('loss of the commit response is resolved by the same operation without deleting the next page', async () => {
  const f = await readyArchive(),
    run = f.db.runTransaction.bind(f.db);
  let lose = true;
  f.db.runTransaction = async (operation) => {
    const result = await run(operation);
    if (lose && f.records.has(f.root + '/archiveCleanup/current')) {
      lose = false;
      throw Error('response lost');
    }
    return result;
  };
  await assert.rejects(() => archiveStep(f), /response lost/);
  const before = structuredClone([...f.records]),
    answer = await archiveStep(f);
  assert.equal(answer.progress.revision, 1);
  assert.deepEqual([...f.records], before);
});
test('foreign original-operation metadata cannot be used to erase a target', async () => {
  const f = await readyArchive(),
    p = await untilPhase(f, 'operations'),
    original = [...f.records].find(
      ([k, v]) =>
        k.includes('/bookRestoreOperations/') && v.receipt.action === 'appendBookRestoreChunk',
    ),
    path = 'users/' + uid + '/bookRestoreOperations/foreign-extra-op01',
    value = structuredClone(original[1]);
  value.receipt.operationId = 'foreign-extra-op01';
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
  await refusesWithoutAdvancing(f, p);
  assert.deepEqual(f.records.get(path), value);
});

test('large indexed lore and scene-source preparation cleans every original receipt while preserving live bodies', async () => {
  const f = await readyArchive({ records: fullAuditRecords() }),
    before = structuredClone(
      [...f.records].filter(([p]) => p.startsWith('books/') || p.includes('/aiPersonas/')),
    );
  const progress = await finishArchive(f);
  assert.equal(progress.phase, 'done');
  assert.equal(progress.scannedOperations, f.p.checkpoint + 1);
  assert.deepEqual(
    [...f.records].filter(([p]) => p.startsWith('books/') || p.includes('/aiPersonas/')),
    before,
  );
});

for (const version of [1, 2, 3, 4, 5, 6])
  test(
    'legacy JSON v' +
      version +
      ' activates and removes its original source without touching normalized live data',
    async () => {
      const f = await readyLegacyArchive(version),
        before = structuredClone(
          [...f.records].filter(
            ([p]) =>
              p.startsWith('books/') ||
              p.includes('/aiPersonas/') ||
              p.includes('/aiPersonaRestoreBatches/'),
          ),
        );
      const p = await finishArchive(f);
      assert.equal(p.phase, 'done');
      assert.equal(p.removed.bytes, f.p.uploadedBytes);
      assert.equal(p.removed.items, f.p.validation.items);
      assert.deepEqual(
        [...f.records].filter(
          ([p]) =>
            p.startsWith('books/') ||
            p.includes('/aiPersonas/') ||
            p.includes('/aiPersonaRestoreBatches/'),
        ),
        before,
      );
    },
  );
