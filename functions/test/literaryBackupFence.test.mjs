import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { workScope, workProject } from '../src/workProgressContracts.mjs';
import {
  touchLiteraryBackupWrite,
  readLiteraryBackupFence,
  writeLiteraryBackupProcess,
} from '../src/literaryBackupFence.mjs';
const path = 'books/book/literaryBackupControls/current',
  target = { kind: 'book', id: 'book' };
function fixture() {
  const f = studioDb();
  f.records.set('books/book', { authorId: 'author', title: 'Livro', updatedAt: 10, wordCount: 0 });
  const c = workScope(f.db, 'author', { target }, []);
  return { ...f, c };
}
const read = (f, expected) =>
  f.db.runTransaction((tx) => readLiteraryBackupFence(tx, f.c, expected));
const touch = (f) =>
  f.db.runTransaction(async (tx) => {
    await workProject(tx, f.c);
    touchLiteraryBackupWrite(tx, f.c);
  });

test('an absent marker stays explicit under the compiled root-and-marker writer contract', async () => {
  const f = fixture(),
    value = await read(f);
  assert.equal(value.clock, 'absent');
  assert.equal(value.coverage, 'editorial-saved-records-v1');
  assert.deepEqual(value.families, [
    'workflow',
    'sequence',
    'draft',
    'review',
    'milestone',
    'integration',
    'publication',
    'prose',
    'impact',
    'impactControl',
    'generation',
  ]);
  assert.match(value.token, /^[a-f0-9]{64}$/);
  assert.equal(f.records.has(path), false);
  assert.deepEqual(await read(f, value.token), value);
});
test('explicit header writes change only a private marker, leaving semantic root fields and credits untouched', async () => {
  const f = fixture(),
    root = structuredClone(f.records.get('books/book'));
  f.records.set('users/author', { credits: 8 });
  const before = await read(f);
  await touch(f);
  const after = await read(f);
  assert.notEqual(after.token, before.token);
  assert.equal(after.clock, 'recorded');
  assert.deepEqual(f.records.get('books/book'), root);
  assert.deepEqual(f.records.get('users/author'), { credits: 8 });
  assert.deepEqual(Object.keys(f.records.get(path)).sort(), ['schemaVersion', 'writeId']);
  await assert.rejects(
    read(f, before.token),
    (error) => error.details?.reason === 'book-backup-source-changed',
  );
});
test('identical callback inputs still make separate committed writes distinguishable', async () => {
  const f = fixture();
  await touch(f);
  const first = await read(f),
    nonce = f.records.get(path).writeId;
  await touch(f);
  assert.notEqual(f.records.get(path).writeId, nonce);
  assert.notEqual((await read(f)).token, first.token);
});
test('an aborted transaction does not leave a marker or change the accepted source', async () => {
  const f = fixture(),
    before = await read(f);
  await assert.rejects(
    f.db.runTransaction(async (tx) => {
      await workProject(tx, f.c);
      touchLiteraryBackupWrite(tx, f.c);
      throw Error('abort');
    }),
    /abort/,
  );
  assert.equal(f.records.has(path), false);
  assert.deepEqual(await read(f), before);
});
test('fence reads reauthorize the owner even when an old token is supplied', async () => {
  const f = fixture(),
    before = await read(f);
  f.records.set('books/book', { authorId: 'other', updatedAt: 10 });
  await assert.rejects(read(f, before.token));
  assert.equal(f.records.has(path), false);
});
test('a malformed native marker is rejected instead of being treated as an absent clock', async () => {
  for (const value of [
    { schemaVersion: 2, writeId: 'bad' },
    { schemaVersion: 1, writeId: 'bad' },
    { schemaVersion: 1, writeId: '00000000-0000-4000-8000-000000000000', token: 'forged' },
  ]) {
    const f = fixture();
    f.records.set(path, value);
    await assert.rejects(read(f));
  }
});
test('a different book remains outside the explicitly touched workflow scope', async () => {
  const f = fixture();
  f.records.set('books/other', { authorId: 'author', updatedAt: 10 });
  const c = workScope(f.db, 'author', { target: { kind: 'book', id: 'other' } }, []),
    before = await f.db.runTransaction((tx) => readLiteraryBackupFence(tx, c));
  await touch(f);
  assert.deepEqual(await f.db.runTransaction((tx) => readLiteraryBackupFence(tx, c)), before);
});
test('root changes invalidate the same observation independently of the private marker', async () => {
  const f = fixture();
  await touch(f);
  const before = await read(f);
  await f.db.runTransaction(async (tx) => {
    await tx.get(f.c.ref);
    tx.update(f.c.ref, { updatedAt: 11 });
  });
  await assert.rejects(read(f, before.token));
});

const families = {
  workflow: 'literaryWorkflowJobs',
  sequence: 'literarySequenceJobs',
  draft: 'literaryDraftJobs',
  review: 'literaryReviewJobs',
  milestone: 'literaryMilestones',
  integration: 'literaryIntegrationJobs',
  publication: 'literaryPublications',
  prose: 'literaryProseRequests',
  impact: 'literaryImpactJobs',
  impactControl: 'literaryImpactControls',
  generation: 'literaryGenerations',
};
for (const [family, collection] of Object.entries(families))
  test(
    'explicit ' + family + ' header writes share the native marker without changing the root',
    async () => {
      const f = fixture(),
        ref = f.db.doc('books/book/' + collection + '/original'),
        root = structuredClone(f.records.get('books/book'));
      await f.db.runTransaction(async (tx) => {
        await workProject(tx, f.c);
        writeLiteraryBackupProcess(tx, f.c, family, 'create', ref, { state: 'running' });
      });
      const first = await read(f);
      await f.db.runTransaction(async (tx) => {
        await workProject(tx, f.c);
        writeLiteraryBackupProcess(tx, f.c, family, 'update', ref, { state: 'done' });
      });
      assert.notEqual((await read(f)).token, first.token);
      assert.deepEqual(f.records.get(ref.path), { state: 'done' });
      assert.deepEqual(f.records.get('books/book'), root);
    },
  );
test('explicit writers reject foreign parents, unknown/prototype families and non-header operations before any native write', () => {
  const f = fixture(),
    writes = [],
    tx = {
      create: (...args) => writes.push(args),
      set: (...args) => writes.push(args),
      update: (...args) => writes.push(args),
    };
  for (const [family, method, path] of [
    ['draft', 'create', 'books/other/literaryDraftJobs/id'],
    ['review', 'create', 'books/book/literaryDraftJobs/id'],
    ['review', 'delete', 'books/book/literaryReviewJobs/id'],
    ['unknown', 'set', 'books/book/unknown/id'],
    ['__proto__', 'set', 'books/book/[object Object]/id'],
    ['constructor', 'set', 'books/book/constructor/id'],
    ['draft', 'set', 'books/book/literaryDraftJobs/'],
    ['draft', 'set', 'books/book/literaryDraftJobs/id/children/x'],
  ])
    assert.throws(() =>
      writeLiteraryBackupProcess(tx, f.c, family, method, { path }, { state: 'done' }),
    );
  assert.deepEqual(writes, []);
});
test('native preconditions/options and return values pass unchanged at an explicit write site', () => {
  const f = fixture(),
    ref = f.db.doc('books/book/literaryReviewJobs/job'),
    body = Object.freeze({ state: 'done' }),
    precondition = Object.freeze({ lastUpdateTime: { seconds: 1, nanoseconds: 2 } }),
    calls = [];
  const tx = {
    update(...args) {
      calls.push(['update', ...args]);
      return tx;
    },
    set(...args) {
      calls.push(['set', ...args]);
      return tx;
    },
  };
  assert.equal(
    writeLiteraryBackupProcess(tx, f.c, 'review', 'update', ref, body, precondition),
    tx,
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[0][1], ref);
  assert.equal(calls[0][2], body);
  assert.equal(calls[0][3], precondition);
  assert.equal(calls[1][1].path, path);
});
test('native writer rejection does not enqueue a misleading capture marker', () => {
  const f = fixture(),
    writes = [],
    failure = Error('native precondition');
  const tx = {
    create() {
      throw failure;
    },
    set(...args) {
      writes.push(args);
    },
  };
  assert.throws(
    () =>
      writeLiteraryBackupProcess(
        tx,
        f.c,
        'draft',
        'create',
        f.db.doc('books/book/literaryDraftJobs/job'),
        {},
      ),
    (error) => error === failure,
  );
  assert.deepEqual(writes, []);
});
