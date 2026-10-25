import test from 'node:test';
import assert from 'node:assert/strict';
import { readyActivation, activate, uid } from './helpers/bookRestoreActivationFixture.mjs';
import { createBookLoreReadService } from '../src/bookLoreRead.mjs';
import { createBookBackupReadService } from '../src/bookBackupRead.mjs';
import {
  readPersonaRestoreBatchProof,
  readAvailablePersonaMetadata,
} from '../src/personaAvailability.mjs';
import { legacyMutation as mutation } from './helpers/bookLegacyRestoreFixture.mjs';
import { requestHash, jobShape, BOOK_RESTORE_METHODS } from '../src/bookRestoreUploadContracts.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { universeRestoreFixture } from './helpers/bookRestoreUniverseFixture.mjs';
import { born } from '../src/bookRestoreUploadContracts.mjs';
import { fullAuditRecords } from './helpers/bookRestoreAuditFixture.mjs';
import sharp from 'sharp';
import { coverRestoreFixture } from './helpers/bookRestoreCoverFixture.mjs';
import { bookRestoreStorageBucket } from './helpers/bookRestoreStorageBucket.mjs';
import { createBookRestoreCoverStorage } from '../src/bookRestoreCoverStorage.mjs';
import { record } from './helpers/bookContentFixture.mjs';
import { loreOnlyRecords, loreRecords } from './helpers/bookRestorePreparedLoreFixture.mjs';
import { readActiveLibraryImage } from '../src/imageLibrary.mjs';

test('activation creates a private native book, enables counts and normal lore/backup readers in one commit', async () => {
  const f = await readyActivation(),
    before = structuredClone([...f.records].filter(([k]) => k.startsWith('books/'))),
    answer = await activate(f),
    book = f.records.get('books/' + f.p.bookId);
  assert.equal(answer.progress.state, 'activated');
  assert.equal(answer.receipt.action, 'activateBookRestore');
  assert.equal(answer.progress.activation.mediaState, 'none');
  assert.equal(answer.progress.recoveryReady, false);
  assert.equal(book.authorId, uid);
  assert.equal(book.title, 'Lore roundtrip');
  assert.equal(book.status, 'draft');
  assert.equal(book.hasLoreResources, true);
  assert.equal(book.hasProgressResources, true);
  assert.equal(book.hasSceneResources, true);
  assert.equal(book.hasNarrativeResources, true);
  assert.equal(book.localLoreVersion, 0);
  assert.equal(book.historyRevision, 0);
  assert.equal(book.wordCount, f.p.preparation.wordCount);
  assert.equal(f.records.has('deletedBooks/' + f.p.bookId), false);
  assert.equal(f.records.has('bookRestoreReservations/' + f.p.bookId), true);
  assert.equal(f.records.has('users/' + uid + '/bookRestoreRecoveryKeys/' + f.id), false);
  const controlPath = 'books/' + f.p.bookId + '/workProgress/current',
    batchPath = 'users/' + uid + '/aiPersonaRestoreBatches/' + f.p.bookId;
  assert.equal(f.records.get(controlPath).countReady, true);
  assert.equal(f.records.get(controlPath).phase, 'done');
  assert.equal(f.records.get(batchPath).state, 'active');
  assert.equal(f.records.get(batchPath).lastOperationId, f.request.operationId);
  for (const [path, value] of before)
    if (path !== controlPath) assert.deepEqual(f.records.get(path), value);
  const commit = f.commits.findLast((writes) =>
    writes.some((w) => w.path === 'books/' + f.p.bookId),
  );
  assert.ok(commit.some((w) => w.path === controlPath));
  assert.ok(commit.some((w) => w.path === batchPath));
  assert.ok(commit.some((w) => w.path === f.root));
  assert.ok(
    commit.some(
      (w) => w.path === 'users/' + uid + '/bookRestoreOperations/' + f.request.operationId,
    ),
  );
  assert.ok(commit.some((w) => w.path === 'deletedBooks/' + f.p.bookId && w.method === 'delete'));
  const read = createBookLoreReadService({ db: f.db }),
    listed = await read.listBookLoreRead(uid, { bookId: f.p.bookId, tokenVersion: 2, limit: 1 }),
    head = await read.getBookLoreRead(uid, {
      bookId: f.p.bookId,
      id: listed.items[0].id,
      readToken: listed.items[0].readToken,
    });
  assert.equal(head.schemaVersion, 2);
  const part = await read.readBookLorePart(uid, {
    bookId: f.p.bookId,
    id: head.id,
    readToken: head.readToken,
    section: 'field',
    field: 'name',
    page: 0,
    index: 0,
  });
  assert.equal(Buffer.from(part.chunkBase64, 'base64').toString('utf8'), JSON.stringify('N'));
  const source = await createBookBackupReadService({ db: f.db }).getBookBackupSource(uid, {
    bookId: f.p.bookId,
  });
  assert.match(source.sourceToken, /^[a-f0-9]{64}$/);
  const batch = await f.db.runTransaction((tx) =>
    readPersonaRestoreBatchProof(
      tx,
      f.db,
      uid,
      {
        schemaVersion: 1,
        bookId: f.p.bookId,
        restoreId: f.id,
        jobToken: f.p.jobToken,
      },
      'active',
    ),
  );
  assert.ok(batch);
  assert.equal(BOOK_RESTORE_METHODS.includes('activateBookRestore'), false);
});

test('activation replay and operation resolution remain historical after edits and deletion; cancel and cleanup cannot touch the book', async () => {
  const f = await readyActivation(),
    first = await activate(f);
  assert.deepEqual(await activate(f), first);
  const progress = await f
    .factory()
    .getBookRestore(uid, { restoreId: f.id, jobToken: f.p.jobToken });
  assert.deepEqual(progress, first.progress);
  for (const action of [
    'cancelBookRestore',
    'advanceBookRestoreCleanup',
    'advanceBookRestoreAudit',
    'advanceBookRestoreSourceIndexes',
  ])
    await assert.rejects(() =>
      f.factory()[action](uid, {
        ...mutation(f.id, progress, f.id + '-forbidden-' + action),
        ...(action === 'advanceBookRestoreCleanup' ? { limit: 5 } : {}),
      }),
    );
  await f.db.runTransaction((tx) =>
    tx.update(f.db.doc('books/' + f.p.bookId), { title: 'Edited own title' }),
  );
  assert.deepEqual(await activate(f), first);
  await f.db.runTransaction((tx) => {
    tx.delete(f.db.doc('books/' + f.p.bookId));
    tx.create(f.db.doc('deletedBooks/' + f.p.bookId), { ownerId: uid, kind: 'normal-deletion' });
  });
  const replay = await activate(f);
  assert.deepEqual(replay, first);
  const resolved = await f.factory().resolveBookRestoreOperation(uid, {
    restoreId: f.id,
    jobToken: f.p.jobToken,
    operationId: f.request.operationId,
    requestHash: requestHash('activateBookRestore', f.request),
  });
  assert.deepEqual(resolved, first);
  assert.equal(f.records.has('books/' + f.p.bookId), false);
  const job = f.records.get(f.root),
    restarted = await f
      .factory()
      .startBookRestore(uid, { operationId: f.id, source: job.source, reviewHash: job.reviewHash });
  assert.equal(restarted.progress.state, 'activated');
  assert.equal(restarted.receipt.action, 'startBookRestore');
  assert.equal(f.records.has('books/' + f.p.bookId), false);
  await assert.rejects(() =>
    createBookLoreReadService({ db: f.db }).listBookLoreRead(uid, { bookId: f.p.bookId }),
  );
  const list = await f.factory().listBookRestores(uid, { limit: 10 });
  assert.equal(list.items[0].state, 'activated');
});

test('restored shared profiles become available together with their book binding and preserve exact content', async () => {
  const f = await readyActivation({ records: universeRestoreFixture() }),
    profiles = [...f.records].filter(([k]) => k.startsWith('users/' + uid + '/aiPersonas/'));
  assert.ok(profiles.length > 0);
  for (const [path] of profiles)
    assert.equal(
      await f.db.runTransaction((tx) =>
        readAvailablePersonaMetadata(tx, f.db, uid, path.split('/').at(-1)),
      ),
      null,
    );
  await activate(f);
  for (const [path, before] of profiles) {
    assert.deepEqual(f.records.get(path), before);
    assert.ok(
      await f.db.runTransaction((tx) =>
        readAvailablePersonaMetadata(tx, f.db, uid, path.split('/').at(-1)),
      ),
    );
  }
  const book = f.records.get('books/' + f.p.bookId);
  assert.ok(profiles.some(([, p]) => p.id === book.personaId));
  await f.db.runTransaction((tx) => tx.delete(f.db.doc('books/' + f.p.bookId)));
  for (const [path] of profiles)
    assert.ok(
      await f.db.runTransaction((tx) =>
        readAvailablePersonaMetadata(tx, f.db, uid, path.split('/').at(-1)),
      ),
    );
});

test('full large preparation activates without rewriting scene sources, body chunks, lore or versions', async () => {
  const f = await readyActivation({ records: fullAuditRecords() }),
    before = structuredClone(
      [...f.records].filter(([k]) => k.startsWith('books/') && !k.includes('/workProgress/')),
    );
  const result = await activate(f);
  assert.equal(result.progress.state, 'activated');
  for (const [path, value] of before) assert.deepEqual(f.records.get(path), value);
  assert.equal(f.records.get('books/' + f.p.bookId).wordCount, f.p.preparation.wordCount);
});

async function worldActivation() {
  const base = adventureImportDb({ nativeUpdates: true });
  await base.db.runTransaction((tx) =>
    tx.create(base.db.doc('universes/world'), {
      authorId: uid,
      bookCount: 0,
      name: 'Global title must stay global',
      updatedAt: 1,
    }),
  );
  const origin = {
    kind: 'reference',
    id: 'world',
    created: born(await base.db.doc('universes/world').get()),
  };
  return {
    ...base,
    ...(await readyActivation({ db: base.db, records: universeRestoreFixture(origin) })),
  };
}
async function coveredActivation(hook) {
  const holder = { f: null },
    base = adventureImportDb({ nativeUpdates: true }),
    storage = bookRestoreStorageBucket(),
    assets = createBookRestoreCoverStorage(storage.bucket),
    png = await sharp({ create: { width: 3, height: 4, channels: 4, background: '#123456' } })
      .png()
      .toBuffer(),
    f = {
      ...base,
      ...(await readyActivation({
        db: base.db,
        records: coverRestoreFixture({ bytes: png }),
        restoreAssets: {
          ...assets,
          async verify(...args) {
            const value = await assets.verify(...args);
            if (holder.f && hook) await hook(holder.f);
            return value;
          },
        },
      })),
    };
  holder.f = f;
  return { ...f, storage };
}
test('activation requires original account, job token, checkpoint and exact review with closed input', async () => {
  const f = await readyActivation(),
    before = structuredClone([...f.records]);
  for (const [actor, patch] of [
    ['other', {}],
    [uid, { jobToken: 'a'.repeat(64) }],
    [uid, { expectedCheckpoint: f.p.checkpoint - 1 }],
    [uid, { reviewToken: 'a'.repeat(64) }],
    [uid, { authorId: 'other' }],
    [uid, { bookId: 'forged' }],
    [uid, { operationId: f.p.preparation.audit.sealOperationId }],
  ])
    await assert.rejects(() => f.factory().activateBookRestore(actor, { ...f.request, ...patch }));
  assert.deepEqual([...f.records], before);
  const answer = await activate(f);
  await assert.rejects(() =>
    f.factory().activateBookRestore(uid, {
      ...f.request,
      operationId: f.id + '-second-activation',
      expectedCheckpoint: answer.progress.checkpoint,
    }),
  );
});
test('universe access change invalidates confirmation and only a newly reviewed explicit choice can activate unlinked', async () => {
  const f = await worldActivation();
  await f.db.runTransaction((tx) => tx.update(f.db.doc('universes/world'), { authorId: 'other' }));
  await assert.rejects(() => activate(f));
  assert.equal(f.records.has('books/' + f.p.bookId), false);
  assert.equal(f.records.get('universes/world').bookCount, 0);
  const reviewed = await f
    .factory()
    .getBookRestoreActivationReview(uid, { restoreId: f.id, jobToken: f.p.jobToken });
  assert.equal(reviewed.summary.universe.observed, 'unavailable');
  f.request.reviewToken = reviewed.reviewToken;
  await activate(f);
  assert.equal(f.records.get('books/' + f.p.bookId).universeId, null);
  assert.equal(f.records.get('universes/world').bookCount, 0);
});
test('strict universe link counter or preexisting foreign use blocks the whole activation', async () => {
  for (const foreignUse of [false, true]) {
    const f = await worldActivation();
    if (foreignUse)
      await f.db.runTransaction((tx) =>
        tx.create(f.db.doc('universes/world/books/' + f.p.bookId), { bookId: f.p.bookId }),
      );
    else
      await f.db.runTransaction((tx) => tx.update(f.db.doc('universes/world'), { bookCount: -1 }));
    const before = structuredClone([...f.records]);
    await assert.rejects(() => activate(f));
    assert.deepEqual([...f.records], before);
    assert.equal(f.records.has('books/' + f.p.bookId), false);
  }
});
for (const dependency of ['seal', 'reservation', 'root'])
  test(
    'activation preserves foreign or recreated ' + dependency + ' instead of adopting it',
    async () => {
      const f = await readyActivation();
      const path =
        dependency === 'seal'
          ? 'users/' + uid + '/bookRestoreOperations/' + f.p.preparation.audit.sealOperationId
          : dependency === 'reservation'
            ? 'bookRestoreReservations/' + f.p.bookId
            : 'books/' + f.p.bookId;
      const value =
        dependency === 'root' ? { authorId: 'foreign' } : structuredClone(f.records.get(path));
      if (dependency !== 'root') await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
      await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
      const before = structuredClone([...f.records]);
      await assert.rejects(() => activate(f));
      assert.deepEqual([...f.records], before);
    },
  );
test('cover activation creates one pending library record and use atomically without exposing Storage', async () => {
  const f = await coveredActivation(),
    at = f.storage.events.length,
    answer = await activate(f),
    imageId = f.p.preparation.cover.imageId,
    path = 'users/' + uid + '/imageLibrary/' + imageId,
    image = f.records.get(path),
    writes = f.commits.findLast((ws) => ws.some((w) => w.path === 'books/' + f.p.bookId));
  assert.equal(answer.progress.activation.mediaState, 'pending');
  assert.equal(image.state, 'preparing');
  assert.equal(image.url, null);
  assert.equal(image.useCount, 1);
  await assert.rejects(() =>
    f.db.runTransaction((tx) => readActiveLibraryImage(tx, f.db, uid, imageId)),
  );
  assert.deepEqual(f.records.get(path + '/uses/' + f.p.bookId), { bookId: f.p.bookId });
  assert.ok(writes.some((w) => w.path === path));
  assert.ok(writes.some((w) => w.path === path + '/uses/' + f.p.bookId));
  assert.equal(f.storage.version(image.path).metadata.metadata.accepted, 'false');
  assert.ok(f.storage.events.slice(at).every((e) => e.method === 'head'));
  const records = structuredClone([...f.records]);
  assert.deepEqual(await activate(f), answer);
  assert.deepEqual([...f.records], records);
});
for (const orphan of [false, true])
  test(
    'an existing ' +
      (orphan ? 'orphan use' : 'library image') +
      ' is preserved and blocks cover activation',
    async () => {
      const f = await coveredActivation(),
        image = 'users/' + uid + '/imageLibrary/' + f.p.preparation.cover.imageId,
        path = orphan ? image + '/uses/foreign-book' : image;
      await f.db.runTransaction((tx) => tx.create(f.db.doc(path), { owner: 'foreign' }));
      const before = structuredClone([...f.records]);
      await assert.rejects(() => activate(f));
      assert.deepEqual([...f.records], before);
      assert.equal(f.records.has('books/' + f.p.bookId), false);
    },
  );
test('concurrent cancellation during final Storage verification wins before any book is activated', async () => {
  let enabled = false;
  const f = await coveredActivation(async (f) => {
    if (enabled)
      await f.factory().cancelBookRestore(uid, mutation(f.id, f.p, f.id + '-cover-cancel'));
  });
  enabled = true;
  await assert.rejects(() => activate(f));
  assert.equal(f.records.has('books/' + f.p.bookId), false);
  assert.equal(f.records.get(f.root).state, 'cancelling');
  assert.equal(
    f.records.get('users/' + uid + '/aiPersonaRestoreBatches/' + f.p.bookId).state,
    'preparing',
  );
});
test('atomic write failure rolls back every effect and callback retry creates only one activation', async () => {
  const f = await worldActivation(),
    before = structuredClone([...f.records]),
    run = f.db.runTransaction.bind(f.db),
    failure = Error('simulated write failure');
  let inject = true,
    automatic = false;
  f.db.runTransaction = async (operation) => {
    try {
      return await run((tx) => {
        const update = tx.update.bind(tx);
        tx.update = (ref, ...args) => {
          if (inject && ref.path === f.root) throw failure;
          return update(ref, ...args);
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
    () => activate(f),
    (e) => e === failure,
  );
  assert.deepEqual([...f.records], before);
  automatic = true;
  const answer = await activate(f);
  assert.equal(answer.progress.checkpoint, f.p.checkpoint + 1);
  assert.equal(f.records.get('universes/world').bookCount, 1);
  assert.deepEqual(await activate(f), answer);
  assert.equal(
    f.commits.filter((ws) =>
      ws.some((w) => w.method === 'create' && w.path === 'books/' + f.p.bookId),
    ).length,
    1,
  );
});
for (const dependency of ['job', 'receipt', 'reservation'])
  test(
    'historical confirmation rejects recreated ' + dependency + ' without touching the active book',
    async () => {
      const f = await readyActivation();
      await activate(f);
      const path =
          dependency === 'job'
            ? f.root
            : dependency === 'receipt'
              ? 'users/' + uid + '/bookRestoreOperations/' + f.request.operationId
              : 'bookRestoreReservations/' + f.p.bookId,
        value = structuredClone(f.records.get(path)),
        book = structuredClone(f.records.get('books/' + f.p.bookId));
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
      await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
      await assert.rejects(() => activate(f));
      await assert.rejects(() =>
        f.factory().getBookRestore(uid, { restoreId: f.id, jobToken: f.p.jobToken }),
      );
      assert.deepEqual(f.records.get('books/' + f.p.bookId), book);
    },
  );
test('activation preserves the complete literal title and metadata instead of the bounded review preview', async () => {
  const title = '🌙 Literal ' + 'x'.repeat(1000),
    genre = '  Fantasy  ',
    synopsis = '\ufeffOriginal\n  synopsis',
    records = universeRestoreFixture().map((r) => {
      if (r.kind !== 'book-metadata') return r;
      const value = JSON.parse(new TextDecoder().decode(r.payload));
      Object.assign(value.book, { title, genre, synopsis });
      return record(r.kind, r.id, value);
    }),
    f = await readyActivation({ records });
  assert.equal(f.review.summary.titleTruncated, true);
  await activate(f);
  const book = f.records.get('books/' + f.p.bookId);
  assert.equal(book.title, title);
  assert.equal(book.genre, genre);
  assert.equal(book.synopsis, synopsis);
});
test('activated job descriptor rejects inconsistent checkpoint, media, time, extra fields and recovery grants', async () => {
  const f = await readyActivation();
  await activate(f);
  const original = f.records.get(f.root);
  for (const change of [
    (j) => {
      j.activation.sourceCheckpoint--;
    },
    (j) => {
      j.activation.mediaState = 'pending';
    },
    (j) => {
      j.activation.activatedAt++;
    },
    (j) => {
      j.activation.extra = true;
    },
    (j) => {
      j.recoveryReady = true;
    },
    (j) => {
      j.activation.operationId = '../forged';
    },
    (j) => {
      j.activation.reviewToken = 'bad';
    },
    (j) => {
      j.preparation.cleanedArtifacts = 1;
    },
  ]) {
    const job = structuredClone(original);
    change(job);
    assert.throws(() => jobShape(uid, f.id, job));
  }
});
test('activation never reopens the prepared lore port or recovery key after the book is activated', async () => {
  const f = await readyActivation();
  await activate(f);
  await assert.rejects(() =>
    f.factory().openPreparedBookRestoreLore(uid, { restoreId: f.id, jobToken: f.p.jobToken }),
  );
  await assert.rejects(() =>
    f.factory().getBookRestoreRecoveryKey(uid, {
      restoreId: f.id,
      jobToken: f.p.jobToken,
      reviewHash: f.records.get(f.root).reviewHash,
    }),
  );
});

test('activation preserves a monolithic legacy payload and the normal active-book reader opens its literal content', async () => {
  const f = await readyActivation({
      indexedLoreBodies: false,
      records: loreOnlyRecords(
        loreRecords({
          name: 'Old',
          category: 'other',
          details: 'x'.repeat(530000),
        }),
      ),
    }),
    read = createBookLoreReadService({ db: f.db });
  await activate(f);
  const listed = await read.listBookLoreRead(uid, { bookId: f.p.bookId }),
    head = await read.getBookLoreRead(uid, {
      bookId: f.p.bookId,
      id: listed.items[0].id,
      readToken: listed.items[0].readToken,
    });
  assert.equal(head.schemaVersion, 1);
  assert.equal(head.mode, 'payload');
  assert.ok(head.base.byteLength > 530000);
  const chunks = [];
  for (let index = 0; index < head.base.chunkCount; index++) {
    const part = await read.readBookLorePart(uid, {
      bookId: f.p.bookId,
      id: head.id,
      readToken: head.readToken,
      section: 'base',
      page: 0,
      index,
    });
    chunks.push(Buffer.from(part.chunkBase64, 'base64'));
  }
  const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  assert.equal(data.details, 'x'.repeat(530000));
  assert.equal(data.name, 'Old');
});
