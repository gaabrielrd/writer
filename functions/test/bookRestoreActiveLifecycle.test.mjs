import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { readyActivation, activate, uid } from './helpers/bookRestoreActivationFixture.mjs';
import { loreOnlyRecords, loreRecords } from './helpers/bookRestorePreparedLoreFixture.mjs';
import { finishArchive } from './helpers/bookRestoreArchiveFixture.mjs';
import { adoptionFixture, adoptFixture } from './helpers/bookLoreEditAdoptionFixture.mjs';
import {
  creationAdoptionFixture,
  adoptCreation,
} from './helpers/bookLoreCreationAdoptionFixture.mjs';
import { removalFixture, finishRemoval } from './helpers/bookLoreRemovalFixture.mjs';
import {
  bookLoreDeletionFixture,
  markBookDeleting,
  finishBookLoreDeletion,
} from './helpers/bookLoreDeletionFixture.mjs';
import { readBookLoreLogical, createBookLoreLogicalBudget } from '../src/bookLoreLogicalRead.mjs';
import { createBookLoreReadService } from '../src/bookLoreRead.mjs';
import { createBookBackupReadService } from '../src/bookBackupRead.mjs';

async function restored(indexed, large) {
  const base = adventureImportDb({ nativeUpdates: true }),
    id = randomUUID(),
    data = {
      name: '  Own 🌙  ',
      category: 'character',
      details: large ? 'Original 🌙'.repeat(110000) : '\ufeffOwn original',
      aliases: ['', 'same', 'same'],
      structuredDetails: { notes: 'Keep exact' },
      relations: [],
      isPublic: true,
      createdAt: 12,
      updatedAt: 17,
    },
    f = {
      ...base,
      ...(await readyActivation({
        db: base.db,
        id,
        indexedLoreBodies: indexed,
        records: loreOnlyRecords(loreRecords(data)),
      })),
    };
  f.p = (await activate(f)).progress;
  await f.factory().finalizeBookRestoreMedia(uid, {
    restoreId: f.id,
    jobToken: f.p.jobToken,
    operationId: f.id + '-media',
  });
  const archive = (
    await f.factory().getBookRestoreArchiveCleanup(uid, {
      restoreId: f.id,
      jobToken: f.p.jobToken,
    })
  ).progress;
  await finishArchive(f, archive);
  assert.equal(
    [...f.records.keys()].filter((path) => path.startsWith(f.root + '/materializationArtifacts/'))
      .length,
    0,
  );
  f.bookId = f.p.bookId;
  f.loreId = [...f.records.keys()]
    .find((path) => path.startsWith('books/' + f.bookId + '/lore/'))
    .split('/')
    .at(-1);
  return f;
}
const seed = (f, id = f.loreId) => {
  const path = 'books/' + f.bookId + '/lore/' + id;
  return {
    uid,
    bookId: f.bookId,
    id,
    path,
    bookPath: 'books/' + f.bookId,
    storage: f.records.get(path)?.payloadStorage,
  };
};
async function read(f, id = f.loreId) {
  return f.db.runTransaction(async (tx) => {
    const path = 'books/' + f.bookId,
      snapshot = await tx.get(f.db.doc(path + '/lore/' + id));
    return (
      await readBookLoreLogical(
        tx,
        { db: f.db, uid, bookId: f.bookId, path },
        snapshot,
        createBookLoreLogicalBudget({ bytes: 32 * 1024 * 1024, parts: 2048, pages: 64 }),
      )
    ).data;
  });
}
for (const scenario of [
  { name: 'inline', indexed: false, large: false, schema: 0 },
  { name: 'monolithic v1', indexed: false, large: true, schema: 1 },
  { name: 'indexed v2', indexed: true, large: false, schema: 2 },
])
  test(
    'active restored ' +
      scenario.name +
      ' supports normal edit create removal and whole-book deletion after archive cleanup',
    async () => {
      const f = await restored(scenario.indexed, scenario.large),
        before = await read(f),
        head = f.records.get('books/' + f.bookId + '/lore/' + f.loreId),
        other = { authorId: 'other', title: 'Preserve other project', createdAt: 1, updatedAt: 2 };
      assert.equal(head.payloadStorage?.schemaVersion ?? 0, scenario.schema);
      await f.db.runTransaction((tx) => {
        tx.create(f.db.doc('books/unrelated-active-book'), other);
        tx.create(f.db.doc('books/unrelated-active-book/lore/keep'), {
          name: 'Keep unrelated lore',
        });
      });
      const changed = '\ufeffChanged own 🌙\n  exact',
        edit = await adoptionFixture(f.db, {
          uid,
          bookId: f.bookId,
          loreId: f.loreId,
          editId: f.id + '-manual',
          changes: [{ target: { field: 'details' }, value: changed }],
          sourceOptions: { existingSeed: seed(f) },
        });
      await adoptFixture(edit);
      const after = await read(f),
        { details: oldDetails, updatedAt: oldTime, ...kept } = before,
        { details: newDetails, updatedAt: newTime, ...actualKept } = after;
      void oldDetails;
      assert.equal(newDetails, changed);
      assert.deepEqual(actualKept, kept);
      assert.ok(newTime > oldTime);
      const creation = await creationAdoptionFixture(f.db, {
        uid,
        bookId: f.bookId,
        creationId: f.id + '-create',
        editId: f.id + '-new-fields',
      });
      await adoptCreation(creation);
      const created = await read(f, creation.loreId);
      assert.equal(created.name, '\ufeffName 🌙');
      assert.equal(created.category, 'other');
      const removal = await removalFixture(f.db, {
        uid,
        bookId: f.bookId,
        id: creation.loreId,
        existingSeed: seed(f, creation.loreId),
        removalId: f.id + '-remove',
        inspectionId: f.id + '-remove-source',
      });
      await finishRemoval(removal);
      assert.equal(f.records.has('books/' + f.bookId + '/lore/' + creation.loreId), false);
      assert.equal((await read(f)).details, changed);
      const backup = await createBookBackupReadService(f).getBookBackupSource(uid, {
        bookId: f.bookId,
      });
      assert.equal(backup.bookId, f.bookId);
      const deletion = {
        ...f,
        ...bookLoreDeletionFixture(f.db, { uid, bookId: f.bookId, operationId: f.id + '-delete' }),
      };
      await markBookDeleting(deletion);
      await finishBookLoreDeletion(deletion);
      assert.equal(f.records.has('books/' + f.bookId), false);
      const contentFamilies = [
        'lore',
        'bookResourceBodies',
        'bookResourceChunks',
        'bookLoreSegments',
        'bookTextBodies',
        'chapters',
        'scenes',
        'workVersions',
        'workVersionBodies',
      ];
      assert.deepEqual(
        [...f.records.keys()].filter((path) =>
          contentFamilies.some((name) => path.startsWith('books/' + f.bookId + '/' + name + '/')),
        ),
        [],
      );
      assert.deepEqual(f.records.get('books/unrelated-active-book'), other);
      assert.deepEqual(f.records.get('books/unrelated-active-book/lore/keep'), {
        name: 'Keep unrelated lore',
      });
      await assert.rejects(
        createBookLoreReadService(f).getBookLoreRead(uid, { bookId: f.bookId, id: f.loreId }),
        { code: 'not-found' },
      );
      await assert.rejects(
        createBookBackupReadService(f).getBookBackupSource(uid, { bookId: f.bookId }),
        { code: 'not-found' },
      );
      assert.equal(
        (await f.factory().getBookRestore(uid, { restoreId: f.id, jobToken: f.p.jobToken })).state,
        'activated',
      );
    },
  );

test('selected runtime restores lore above eight MiB through activation and archive without truncation', async () => {
  const { BOOK_RESTORE_RUNTIME } = await import('../src/bookRestoreRuntime.mjs'),
    { createHash } = await import('node:crypto'),
    base = adventureImportDb({ nativeUpdates: true }),
    id = randomUUID(),
    details = '\ufeff🌙literal\n'.repeat(650000),
    data = {
      name: 'Large runtime',
      category: 'concept',
      details,
      aliases: ['', 'same', 'same'],
      createdAt: 12,
      updatedAt: 17,
      relations: [],
    },
    f = {
      ...base,
      ...(await readyActivation({
        ...BOOK_RESTORE_RUNTIME,
        db: base.db,
        id,
        records: loreOnlyRecords(loreRecords(data)),
      })),
    };
  assert.ok(Buffer.byteLength(details) > 8 * 1024 * 1024);
  f.p = (await activate(f)).progress;
  f.bookId = f.p.bookId;
  f.loreId = [...f.records.keys()]
    .find((path) => path.startsWith('books/' + f.bookId + '/lore/'))
    .split('/')
    .at(-1);
  await f.factory().finalizeBookRestoreMedia(uid, {
    restoreId: f.id,
    jobToken: f.p.jobToken,
    operationId: f.id + '-media',
  });
  await finishArchive(
    f,
    (
      await f
        .factory()
        .getBookRestoreArchiveCleanup(uid, { restoreId: f.id, jobToken: f.p.jobToken })
    ).progress,
  );
  const actual = await read(f),
    hash = (value) => createHash('sha256').update(value).digest('hex');
  assert.equal(hash(actual.details), hash(details));
  assert.equal(actual.createdAt, 12);
  assert.equal(actual.updatedAt, 17);
  assert.deepEqual(actual.aliases, data.aliases);
  assert.equal(
    f.records.get('books/' + f.bookId + '/lore/' + f.loreId).payloadStorage.schemaVersion,
    2,
  );
  assert.equal(f.records.get(f.root).loreMode, 'indexed-v2');
});
