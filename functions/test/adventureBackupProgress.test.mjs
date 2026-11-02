import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudioService } from '../src/studio.mjs';
import { createWorkProgressService } from '../src/workProgress.mjs';
import { createAdventureBackupSourceService } from '../src/adventureBackupSource.mjs';
import { createAdventureBackupResourceService } from '../src/adventureBackupResourceRead.mjs';
import { serializeAdventureBackupResource } from '../src/adventureBackupResources.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';

const uid = 'author',
  id = 'adventure-progress-backup-0001',
  path = 'adventures/' + id,
  target = { kind: 'adventure', id },
  firstId = 'preparation-checklist-0001',
  controlPath = path + '/workProgress/current',
  itemPath = path + '/workChecklist/' + firstId;
async function fixture(count = 1, goal = true) {
  const f = adventureImportDb({ nativeUpdates: true });
  await createStudioService({ db: f.db, now: () => 1000 }).createAdventure(uid, {
    operationId: id,
    title: 'PRIVATE_ROOT',
  });
  const progress = createWorkProgressService({ db: f.db, now: () => 1200 });
  if (goal)
    await progress.updateWorkProgress(uid, {
      target,
      operationId: 'preparation-goal-0001',
      expectedRevision: 0,
      patch: { wordGoal: 65000, editorialState: 'review' },
    });
  for (let n = 1; n <= count; n++)
    await progress.createWorkChecklistItem(uid, {
      target,
      operationId: 'preparation-checklist-' + String(n).padStart(4, '0'),
      title: 'PRIVATE_TASK_' + n,
    });
  const pin = await createAdventureBackupSourceService(f).getAdventureBackupSource(uid, {
    adventureId: id,
  });
  return { ...f, progress, pin, api: createAdventureBackupResourceService(f) };
}
const list = (f, kind, extra = {}, actor = uid) =>
  f.api.listAdventureBackupResources(actor, {
    adventureId: id,
    sourceToken: f.pin.sourceToken,
    kind,
    ...extra,
  });
const request = (f, kind, row) => ({
  adventureId: id,
  sourceToken: f.pin.sourceToken,
  kind,
  id: row.id,
  itemToken: row.itemToken,
  index: 0,
});
async function read(f, kind, row) {
  row ??= (await list(f, kind)).items[0];
  const r = await f.api.readAdventureBackupResource(uid, request(f, kind, row));
  assert.equal(r.chunkCount, 1);
  return JSON.parse(Buffer.from(r.chunkBase64, 'base64').toString()).data;
}
const update = (f, p, patch) => f.db.runTransaction((tx) => tx.update(f.db.doc(p), patch));

test('real project goals and preparation mutations capture only choices and current tasks without account lookups or writes', async () => {
  const f = await fixture(3);
  await f.progress.updateWorkChecklistItem(uid, {
    target,
    id: firstId,
    operationId: 'preparation-complete-0001',
    expectedRevision: 1,
    patch: { title: 'PRIVATE_RENAMED 🌙', completed: true },
  });
  await f.progress.deleteWorkChecklistItem(uid, {
    target,
    id: 'preparation-checklist-0003',
    operationId: 'preparation-delete-0001',
    expectedRevision: 1,
  });
  f.pin = await createAdventureBackupSourceService(f).getAdventureBackupSource(uid, {
    adventureId: id,
  });
  const before = structuredClone([...f.records]),
    start = f.commits.length;
  f.reads.length = 0;
  f.metadataReads.length = 0;
  const page = await list(f, 'checklist');
  assert.equal(page.items.length, 2);
  assert.equal(JSON.stringify(page).includes('PRIVATE_'), false);
  assert.ok(f.reads.every((r) => !r.fields.includes('title')));
  assert.ok(f.metadataReads.every((r) => !r.path.startsWith('users/')));
  assert.deepEqual(await read(f, 'progress'), {
    editorialState: 'review',
    wordGoal: 65000,
    updatedAt: 1200,
  });
  const task = await read(
    f,
    'checklist',
    page.items.find((r) => r.id === firstId),
  );
  assert.deepEqual(task, {
    title: 'PRIVATE_RENAMED 🌙',
    completed: true,
    createdAt: 1200,
    updatedAt: 1201,
  });
  assert.ok(f.metadataReads.every((r) => !r.path.startsWith('users/')));
  assert.deepEqual([...f.records], before);
  assert.ok(f.commits.slice(start).every((w) => w.length === 0));
});

test('fifty-three physical preparation tasks paginate without filtering pending or completed', async () => {
  const f = await fixture(53),
    a = await list(f, 'checklist', { limit: 50 }),
    b = await list(f, 'checklist', { limit: 50, cursor: a.nextCursor });
  assert.equal(a.items.length, 50);
  assert.equal(b.items.length, 3);
  assert.equal(b.nextCursor, null);
  assert.equal(new Set([...a.items, ...b.items].map((r) => r.id)).size, 53);
});

test('missing progress is explicit and null goal, zero date and empty task stay literal', async () => {
  const f = await fixture(0, false),
    row = (await list(f, 'progress')).items[0];
  assert.equal(row.present, false);
  assert.deepEqual(await read(f, 'progress', row), {});
  await f.progress.updateWorkProgress(uid, {
    target,
    operationId: 'empty-goal-create-0001',
    expectedRevision: 0,
    patch: { wordGoal: null },
  });
  await assert.rejects(f.api.readAdventureBackupResource(uid, request(f, 'progress', row)), {
    code: 'failed-precondition',
  });
  f.pin = await createAdventureBackupSourceService(f).getAdventureBackupSource(uid, {
    adventureId: id,
  });
  assert.equal((await read(f, 'progress')).wordGoal, null);
  const codec = serializeAdventureBackupResource('checklist', null, firstId, {
    title: '',
    completed: false,
    createdAt: 0,
  });
  assert.deepEqual(JSON.parse(codec.json).data, { title: '', completed: false, createdAt: 0 });
});

test('derived counts, jobs and user preference/activity state do not enter or block preservation', async () => {
  const f = await fixture();
  await update(f, controlPath, {
    checklistTotal: -9,
    checklistCompleted: -20,
    countReady: false,
    wordCount: -40,
    operationId: 'DO_NOT_COPY',
    cursor: { content: 'DO_NOT_COPY' },
    phase: 'DO_NOT_COPY',
  });
  f.records.set('users/' + uid + '/workPreferences/current', { timeZone: 'DO_NOT_COPY' });
  f.records.set('users/' + uid + '/workActivityState/current', { content: 'DO_NOT_COPY' });
  f.pin = await createAdventureBackupSourceService(f).getAdventureBackupSource(uid, {
    adventureId: id,
  });
  const choice = await read(f, 'progress'),
    task = await read(f, 'checklist');
  assert.equal(JSON.stringify([choice, task]).includes('DO_NOT_COPY'), false);
  assert.equal(choice.wordGoal, 65000);
  assert.equal(task.title, 'PRIVATE_TASK_1');
});

for (const [kind, p] of [
  ['progress', controlPath],
  ['checklist', itemPath],
])
  for (const mutation of ['change', 'recreate'])
    test(kind + ' cannot continue a native token after ' + mutation, async () => {
      const f = await fixture(),
        row = (await list(f, kind)).items[0],
        value = structuredClone(f.records.get(p));
      if (mutation === 'change') await update(f, p, { ignoredMetadata: 1 });
      else {
        await f.db.runTransaction((tx) => tx.delete(f.db.doc(p)));
        await f.db.runTransaction((tx) => tx.create(f.db.doc(p), value));
      }
      await assert.rejects(f.api.readAdventureBackupResource(uid, request(f, kind, row)), {
        code: 'failed-precondition',
      });
    });

for (const patch of [
  { ownerId: 'other' },
  { schemaVersion: 2 },
  { deleting: true },
  { rebalancing: true },
  { bodyStorage: null },
])
  test(
    'checklist metadata refuses unsupported authority/state ' + JSON.stringify(patch),
    async () => {
      const f = await fixture();
      await update(f, itemPath, patch);
      await assert.rejects(list(f, 'checklist'));
    },
  );

for (const [kind, value] of [
  ['progress', { wordGoal: 0 }],
  ['progress', { wordGoal: 1.5 }],
  ['progress', { wordGoal: Infinity }],
  ['progress', { editorialState: 'published' }],
  ['checklist', { title: 'Task', completed: 'yes' }],
  ['checklist', { title: '\ud800', completed: false }],
  ['checklist', { title: 'Task' }],
])
  test('codec refuses invalid project choice ' + JSON.stringify(value), () => {
    assert.throws(
      () =>
        serializeAdventureBackupResource(
          kind,
          null,
          kind === 'progress' ? 'current' : firstId,
          value,
        ),
      TypeError,
    );
  });

test('both project families reauthorize account and never accept a parent or alternate singleton', async () => {
  const f = await fixture(),
    row = (await list(f, 'progress')).items[0];
  for (const actor of [null, 'other']) {
    await assert.rejects(list(f, 'checklist', {}, actor), {
      code: actor ? 'not-found' : 'unauthenticated',
    });
    await assert.rejects(f.api.readAdventureBackupResource(actor, request(f, 'progress', row)), {
      code: actor ? 'not-found' : 'unauthenticated',
    });
  }
  await assert.rejects(list(f, 'checklist', { parentId: firstId }), { code: 'invalid-argument' });
  await assert.rejects(
    f.api.readAdventureBackupResource(uid, { ...request(f, 'progress', row), id: 'other' }),
    { code: 'invalid-argument' },
  );
});
