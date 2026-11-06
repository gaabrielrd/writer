import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { workScope, workProject } from '../../functions/src/workProgressContracts.mjs';
import {
  writeLiteraryBackupProcess,
  readLiteraryBackupFence,
} from '../../functions/src/literaryBackupFence.mjs';
const { Firestore } = createRequire(new URL('../../functions/package.json', import.meta.url))(
  'firebase-admin/firestore',
);
const projectId = 'demo-writer-literary-backup-fence',
  target = { kind: 'book', id: 'book' },
  clockPath = 'books/book/literaryBackupControls/current';
let environment, admin;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? '')) throw Error('Use somente o emulador demo local.');
  const [host, port] = address.split(':');
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await admin.doc('books/book').create({
    authorId: 'author',
    title: 'Livro',
    status: 'draft',
    createdAt: 10,
    updatedAt: 10,
    wordCount: 0,
  });
});
after(async () => {
  await admin?.terminate();
  await environment?.cleanup();
});
const context = () => workScope(admin, 'author', { target }, []);
const read = (expected) =>
  admin.runTransaction((tx) => readLiteraryBackupFence(tx, context(), expected));
async function write(id, method = 'create', value = { state: 'running' }, precondition) {
  const c = context(),
    ref = admin.doc('books/book/literaryDraftJobs/' + id);
  await admin.runTransaction(
    async (tx) => {
      await workProject(tx, c);
      writeLiteraryBackupProcess(
        tx,
        c,
        'draft',
        method,
        ref,
        value,
        ...(precondition ? [precondition] : []),
      );
    },
    { maxAttempts: 1 },
  );
}
test('native header and private marker share the same commit while root identity remains unchanged', async () => {
  const before = await admin.doc('books/book').get(),
    absent = await read();
  await write('native-one');
  const [job, clock, root] = await admin.getAll(
    admin.doc('books/book/literaryDraftJobs/native-one'),
    admin.doc(clockPath),
    before.ref,
  );
  assert.ok(job.createTime.isEqual(clock.createTime));
  assert.ok(job.updateTime.isEqual(clock.updateTime));
  assert.ok(root.updateTime.isEqual(before.updateTime));
  assert.deepEqual(root.data(), before.data());
  const current = await read();
  assert.notEqual(current.token, absent.token);
  assert.equal(current.coverage, 'editorial-saved-records-v1');
  assert.deepEqual(await read(current.token), current);
  assert.ok((await admin.doc(clockPath).get()).updateTime.isEqual(clock.updateTime));
});
test('two concurrent explicit writers keep both headers and invalidate the old observation', async () => {
  const before = await read();
  await Promise.all([write('concurrent-a'), write('concurrent-b')]);
  const [a, b, clock] = await admin.getAll(
    admin.doc('books/book/literaryDraftJobs/concurrent-a'),
    admin.doc('books/book/literaryDraftJobs/concurrent-b'),
    admin.doc(clockPath),
  );
  assert.equal(a.exists, true);
  assert.equal(b.exists, true);
  assert.ok(clock.updateTime.isEqual(a.updateTime) || clock.updateTime.isEqual(b.updateTime));
  await assert.rejects(
    read(before.token),
    (error) => error.details?.reason === 'book-backup-source-changed',
  );
});
test('a failed native precondition rolls back the marker together with its source write', async () => {
  await write('precondition');
  const old = await admin.doc('books/book/literaryDraftJobs/precondition').get();
  await write('precondition', 'update', { state: 'newer' });
  const before = await read(),
    clock = await admin.doc(clockPath).get();
  await assert.rejects(
    write('precondition', 'update', { state: 'forged' }, { lastUpdateTime: old.updateTime }),
  );
  assert.equal((await old.ref.get()).data().state, 'newer');
  assert.ok((await admin.doc(clockPath).get()).updateTime.isEqual(clock.updateTime));
  assert.deepEqual(await read(), before);
});
test('aborted writes leave no marker and the native reader reauthorizes a changed owner', async () => {
  const c = context(),
    before = await read();
  await assert.rejects(
    admin.runTransaction(
      async (tx) => {
        await workProject(tx, c);
        writeLiteraryBackupProcess(
          tx,
          c,
          'draft',
          'create',
          admin.doc('books/book/literaryDraftJobs/aborted'),
          { state: 'running' },
        );
        throw Error('abort');
      },
      { maxAttempts: 1 },
    ),
    /abort/,
  );
  assert.equal((await admin.doc(clockPath).get()).exists, false);
  assert.equal((await admin.doc('books/book/literaryDraftJobs/aborted').get()).exists, false);
  assert.deepEqual(await read(), before);
  await admin.doc('books/book').update({ authorId: 'other' });
  await assert.rejects(read(before.token));
});
