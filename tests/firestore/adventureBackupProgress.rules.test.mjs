import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { createStudioService } from '../../functions/src/studio.mjs';
import { createAdventureBackupSourceService } from '../../functions/src/adventureBackupSource.mjs';
import { createAdventureBackupResourceService } from '../../functions/src/adventureBackupResourceRead.mjs';
import { createWorkProgressService } from '../../functions/src/workProgress.mjs';
import { digest } from '../../functions/src/workProgressContracts.mjs';

const { Firestore } = createRequire(new URL('../../functions/package.json', import.meta.url))(
  'firebase-admin/firestore',
);
const projectId = 'demo-writer-adventure-progress',
  uid = 'author',
  id = 'adventure-backup-sdk-0001',
  path = 'adventures/' + id;
let env, admin;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? '')) throw Error('Use only the local demo emulator.');
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

test('SDK adventure project choices and checklist keep native masks, current tasks and absent control semantics', async () => {
  await createStudioService({ db: admin, now: () => 1000 }).createAdventure(uid, {
    operationId: id,
    title: 'PRIVATE_ROOT',
  });
  const target = { kind: 'adventure', id },
    progress = createWorkProgressService({ db: admin, now: () => 1200 }),
    source = createAdventureBackupSourceService({ db: admin });
  let pin = await source.getAdventureBackupSource(uid, { adventureId: id });
  const port = {
      doc: (p) => {
        assert.equal(p.startsWith('users/'), false);
        return admin.doc(p);
      },
      collection: (p) => admin.collection(p),
      runTransaction: (op) =>
        admin.runTransaction((tx) =>
          op({
            async getAll(ref, options) {
              const snapshots = await tx.getAll(ref, options);
              for (const snapshot of snapshots)
                if (snapshot.exists && !options.fieldMask.includes('title'))
                  assert.equal(Object.hasOwn(snapshot.data(), 'title'), false);
              return snapshots;
            },
            async get(query) {
              const page = await tx.get(query);
              for (const snapshot of page.docs)
                assert.equal(Object.hasOwn(snapshot.data(), 'title'), false);
              return page;
            },
          }),
        ),
    },
    api = createAdventureBackupResourceService({ db: port });
  const list = (kind, extra = {}) =>
      api.listAdventureBackupResources(uid, {
        adventureId: id,
        sourceToken: pin.sourceToken,
        kind,
        ...extra,
      }),
    request = (kind, row) => ({
      adventureId: id,
      sourceToken: pin.sourceToken,
      kind,
      id: row.id,
      itemToken: row.itemToken,
      index: 0,
    });
  const absent = (await list('progress')).items[0],
    absentInput = request('progress', absent);
  assert.equal(absent.present, false);
  const absentRead = await api.readAdventureBackupResource(uid, absentInput);
  assert.equal(JSON.parse(Buffer.from(absentRead.chunkBase64, 'base64').toString()).present, false);
  await progress.updateWorkProgress(uid, {
    target,
    operationId: 'sdk-backup-goal-0001',
    expectedRevision: 0,
    patch: { editorialState: 'review', wordGoal: 60000 },
  });
  await assert.rejects(api.readAdventureBackupResource(uid, absentInput), {
    code: 'failed-precondition',
  });
  for (let n = 1; n <= 53; n++)
    await progress.createWorkChecklistItem(uid, {
      target,
      operationId: 'sdk-preparation-task-' + String(n).padStart(4, '0'),
      title: 'PRIVATE_TASK_' + n,
    });
  const taskId = 'sdk-preparation-task-0001',
    taskPath = path + '/workChecklist/' + taskId;
  await progress.updateWorkChecklistItem(uid, {
    target,
    id: taskId,
    operationId: 'sdk-complete-task-0001',
    expectedRevision: 1,
    patch: { title: 'PRIVATE_RENAMED 🌙', completed: true },
  });
  await progress.deleteWorkChecklistItem(uid, {
    target,
    id: 'sdk-preparation-task-0053',
    operationId: 'sdk-remove-task-0001',
    expectedRevision: 1,
  });
  pin = await source.getAdventureBackupSource(uid, { adventureId: id });
  const a = await list('checklist', { limit: 50 }),
    b = await list('checklist', { limit: 50, cursor: a.nextCursor });
  assert.equal(a.items.length, 50);
  assert.equal(b.items.length, 2);
  assert.equal(b.nextCursor, null);
  assert.equal(JSON.stringify([a, b]).includes('PRIVATE_'), false);
  const row = a.items.find((r) => r.id === taskId),
    before = await admin.doc(taskPath).get(),
    taskRead = await api.readAdventureBackupResource(uid, request('checklist', row)),
    task = JSON.parse(Buffer.from(taskRead.chunkBase64, 'base64').toString()).data;
  assert.equal(task.title, 'PRIVATE_RENAMED 🌙');
  assert.equal(task.completed, true);
  assert.equal(Object.hasOwn(task, 'revision'), false);
  assert.equal(
    digest(Buffer.from(taskRead.chunkBase64, 'base64').toString()),
    taskRead.contentHash,
  );
  const choiceRow = (await list('progress')).items[0],
    choiceRead = await api.readAdventureBackupResource(uid, request('progress', choiceRow));
  assert.deepEqual(JSON.parse(Buffer.from(choiceRead.chunkBase64, 'base64').toString()).data, {
    editorialState: 'review',
    wordGoal: 60000,
    updatedAt: 1200,
  });
  assert.ok((await admin.doc(taskPath).get()).updateTime.isEqual(before.updateTime));
  await admin.doc(taskPath).delete();
  await admin.doc(taskPath).create(before.data());
  await assert.rejects(api.readAdventureBackupResource(uid, request('checklist', row)), {
    code: 'failed-precondition',
  });
  await assert.rejects(api.readAdventureBackupResource('other', request('progress', choiceRow)), {
    code: 'not-found',
  });
  await assertFails(getDoc(doc(env.authenticatedContext('other').firestore(), taskPath)));
  await assertFails(
    setDoc(doc(env.authenticatedContext(uid).firestore(), taskPath), { title: 'bypass' }),
  );
});
