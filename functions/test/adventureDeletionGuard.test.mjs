import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { createStudioService } from '../src/studio.mjs';
import {
  readAdventureDeletionReservation,
  assertAdventureNotDeleted,
  assertAdventureControlNotDeleted,
  isAdventureDeletionError,
  adventureReservationPath,
} from '../src/adventureDeletionGuard.mjs';
const id = 'adventure-deletion-guard-0001',
  uid = 'author',
  path = adventureReservationPath(id);
const value = (state) => ({
  schemaVersion: 1,
  ownerId: uid,
  adventureId: id,
  adventureToken: 'a'.repeat(64),
  deletionId: 'deletion-operation-0001',
  state,
  createdAt: 1000,
  updatedAt: 1001,
});
async function reserved(state = 'deleting') {
  const f = adventureImportDb({ nativeUpdates: true });
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value(state)));
  return f;
}
test('absence does not reserve or write an identifier', async () => {
  const f = adventureImportDb({ nativeUpdates: true }),
    before = structuredClone(f.records);
  await f.db.runTransaction(async (tx) => {
    assert.equal((await readAdventureDeletionReservation(tx, f.db, id)).record, null);
    await assertAdventureNotDeleted(tx, f.db, uid, id);
  });
  assert.deepEqual(f.records, before);
});
for (const state of ['deleting', 'deleted'])
  test(
    'permanent ' + state + ' reservation blocks Studio creation and exact prior creation replay',
    async () => {
      const f = adventureImportDb({ nativeUpdates: true }),
        api = createStudioService({ db: f.db, now: () => 1000 });
      const request = { operationId: id, title: 'Aventura privada' };
      await api.createAdventure(uid, request);
      await f.db.runTransaction((tx) => {
        tx.create(f.db.doc(path), value(state));
        tx.delete(f.db.doc('adventures/' + id));
      });
      const before = structuredClone(f.records);
      await assert.rejects(
        () => api.createAdventure(uid, request),
        (e) => isAdventureDeletionError(e) && e.details.reason === 'adventure-' + state,
      );
      assert.deepEqual(f.records, before);
      assert.equal(f.records.has('adventures/' + id), false);
    },
  );
test('another account cannot learn owner, deletion identity or reason', async () => {
  const f = await reserved();
  await f.db.runTransaction(async (tx) => {
    await assert.rejects(
      () => assertAdventureNotDeleted(tx, f.db, 'other', id),
      (e) => e.code === 'not-found' && !e.details && !e.message.includes('deletion-operation'),
    );
  });
});
test('metadata projection does not return private or unknown payload fields', async () => {
  const f = await reserved();
  f.records.get(path).secretText = 'NEVER_READ_BODY';
  const record = await f.db.runTransaction((tx) => readAdventureDeletionReservation(tx, f.db, id));
  assert.equal(JSON.stringify(record.record).includes('NEVER_READ_BODY'), false);
  assert.ok(f.metadataReads.some((r) => r.path === path && !r.fields.includes('secretText')));
});
for (const patch of [
  { schemaVersion: 2 },
  { adventureId: 'another' },
  { ownerId: '' },
  { adventureToken: 'bad' },
  { deletionId: '../bad' },
  { state: 'available' },
  { createdAt: -1 },
  { updatedAt: 999 },
  { updatedAt: NaN },
])
  test(
    'invalid reservation refuses access and creation without overwriting metadata ' +
      JSON.stringify(patch),
    async () => {
      const f = await reserved();
      Object.assign(f.records.get(path), patch);
      const before = structuredClone(f.records);
      await assert.rejects(
        () => f.db.runTransaction((tx) => assertAdventureNotDeleted(tx, f.db, uid, id)),
        { code: 'failed-precondition' },
      );
      await assert.rejects(() =>
        createStudioService({ db: f.db }).createAdventure(uid, { operationId: id, title: 'Wrong' }),
      );
      assert.deepEqual(f.records, before);
    },
  );
test('existing empty reservation fails closed rather than becoming an available identifier', async () => {
  const f = adventureImportDb({ nativeUpdates: true });
  f.records.set(path, {});
  await assert.rejects(
    () => f.db.runTransaction((tx) => assertAdventureNotDeleted(tx, f.db, uid, id)),
    { code: 'failed-precondition' },
  );
});
test('job routing inspects only owned control metadata before checking the reservation', async () => {
  const f = await reserved(),
    control = 'users/' + uid + '/adventureRestores/restore-control-0001';
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc(control), { ownerId: uid, adventureId: id, privateBody: 'DO_NOT_RETURN' }),
  );
  await assert.rejects(
    () =>
      f.db.runTransaction((tx) =>
        assertAdventureControlNotDeleted(tx, f.db, uid, f.db.doc(control)),
      ),
    (e) => isAdventureDeletionError(e),
  );
  f.records.get(control).ownerId = 'other';
  await f.db.runTransaction((tx) =>
    assertAdventureControlNotDeleted(tx, f.db, uid, f.db.doc(control)),
  );
  const reads = f.metadataReads.filter((r) => r.path === control);
  assert.ok(reads.length >= 2);
  assert.ok(reads.every((r) => r.fields.every((k) => ['ownerId', 'adventureId'].includes(k))));
});

test('a root reappearing behind a permanent reservation cannot reopen text, history, lore, backup or context', async () => {
  const { editorChatFixture } = await import('./helpers/editorChatFixture.mjs');
  const { createScenesService } = await import('../src/scenes.mjs');
  const { createWorkHistoryService } = await import('../src/workHistory.mjs');
  const { createAdventureLoreService } = await import('../src/adventureLore.mjs');
  const { createAdventureBackupSourceService } = await import('../src/adventureBackupSource.mjs');
  const { readEditorChatProject } = await import('../src/editorChatContextRead.mjs');
  const f = await editorChatFixture('adventure', false, adventureImportDb({ nativeUpdates: true }));
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc(adventureReservationPath(f.target.id)), {
      ...value('deleted'),
      adventureId: f.target.id,
    }),
  );
  const before = structuredClone(f.records);
  for (const call of [
    () =>
      createScenesService({ db: f.db }).getScene(uid, { target: f.target, sceneId: f.resource.id }),
    () => createWorkHistoryService({ db: f.db }).getWorkVersionSource(uid, f.scope),
    () =>
      createAdventureLoreService({ db: f.db }).listAdventureLore(uid, {
        adventureId: f.target.id,
        scope: 'adventure',
      }),
    () =>
      createAdventureBackupSourceService({ db: f.db }).getAdventureBackupSource(uid, {
        adventureId: f.target.id,
      }),
    () => f.db.runTransaction((tx) => readEditorChatProject(tx, f.db, uid, f.target)),
  ])
    await assert.rejects(call, (e) => isAdventureDeletionError(e));
  assert.deepEqual(f.records, before);
});

test('reserved adventures disappear from Studio detail and bounded catalog without being removed from storage', async () => {
  const f = adventureImportDb({ nativeUpdates: true }),
    studio = createStudioService({ db: f.db, now: () => 1000 });
  await studio.createAdventure(uid, { operationId: id, title: 'Private adventure' });
  await studio.createAdventure(uid, {
    operationId: 'available-adventure-0001',
    title: 'Available',
  });
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value('deleting')));
  assert.equal(await studio.getAdventure(uid, { id }), null);
  const pages = await studio.listStudioProjects(uid, { kind: 'adventure', limit: 50 });
  assert.deepEqual(
    pages.items.map((v) => v.id),
    ['available-adventure-0001'],
  );
  assert.ok(f.records.has('adventures/' + id));
});
test('permanent reservation denies the imported adventure identity before creating job, key or staged content', async () => {
  const { createAdventureImportService } = await import('../src/adventureImport.mjs');
  const c = await import('../src/adventureImportContracts.mjs');
  const f = adventureImportDb({ nativeUpdates: true }),
    operationId = 'deletion-import-gate-0001',
    targetId = c.adventureImportIds(uid, operationId).adventureId;
  const section = c.adventureImportSection({ title: 'Part', content: 'Own text' }),
    base = {
      operationId,
      project: { title: 'Import', synopsis: '', universeId: null },
      source: { mediaType: 'application/pdf', sha256: 'a'.repeat(64), byteLength: 100 },
      sectionCount: 1,
      totalBodyBytes: section.bodyBytes,
    };
  const request = {
    ...base,
    reviewHash: c.adventureImportReviewHash(
      base,
      c.adventureImportChain(c.adventureImportSeed, 0, section),
    ),
  };
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc(adventureReservationPath(targetId)), {
      ...value('deleted'),
      adventureId: targetId,
    }),
  );
  const before = structuredClone(f.records);
  await assert.rejects(
    () => createAdventureImportService({ db: f.db }).startAdventureImport(uid, request),
    isAdventureDeletionError,
  );
  assert.deepEqual(f.records, before);
});
test('permanent reservation denies a new restore target before creating recovery key or private job', async () => {
  const { transferFixture } = await import('./helpers/adventureRestoreTransferFixture.mjs');
  const { targetId, requestHash } = await import('../src/adventureRestoreContracts.mjs');
  const f = transferFixture(),
    adventureId = targetId(
      f.uid,
      f.input.operationId,
      requestHash('startAdventureRestore', f.input),
    );
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc(adventureReservationPath(adventureId)), {
      ...value('deleted'),
      adventureId,
    }),
  );
  const before = structuredClone(f.records);
  await assert.rejects(() => f.api.startAdventureRestore(f.uid, f.input), isAdventureDeletionError);
  assert.deepEqual(f.records, before);
});
test('permanent reservation denies a ready restore activation without publishing its private root or media', async () => {
  const { activationFixture, activationRequest } =
    await import('./helpers/adventureRestoreActivationFixture.mjs');
  const { f, p } = await activationFixture(),
    { request } = await activationRequest(f, p);
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc(adventureReservationPath(p.adventureId)), {
      ...value('deleting'),
      adventureId: p.adventureId,
    }),
  );
  const before = structuredClone(f.records);
  await assert.rejects(
    () => f.api.activateAdventureRestore(f.uid, request),
    isAdventureDeletionError,
  );
  assert.deepEqual(f.records, before);
  assert.equal(f.records.get('adventures/' + p.adventureId).ownerId, undefined);
});
test('derived campaign readers close the reserved source while own notes remain available', async () => {
  const data = await import('./helpers/campaignLore.mjs');
  const { studioDb } = await import('./helpers/studioDb.mjs');
  const { readCampaignBase, readCaptureOrigin } = await import('../src/campaignBaseContracts.mjs');
  const { createCampaignNotesService } = await import('../src/campaignNotes.mjs');
  const f = studioDb();
  for (const [path, v] of data.seedLoreRecords()) f.records.set(path, v);
  const notes = createCampaignNotesService({ db: f.db, now: () => 1000 });
  const initial = await notes.listCampaignNotes(data.uid, { campaignId: data.campaignId });
  await notes.saveCampaignNote(data.uid, {
    campaignId: data.campaignId,
    campaignToken: initial.campaignToken,
    noteId: 'own-note-deletion-0001',
    operationId: 'own-note-deletion-0001',
    expectedRevision: 0,
    title: 'Own note',
    content: 'Own campaign text',
  });
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc(adventureReservationPath(data.adventureId)), {
      ...value('deleting'),
      ownerId: data.uid,
      adventureId: data.adventureId,
    }),
  );
  assert.equal(
    await f.db.runTransaction((tx) => readCaptureOrigin(tx, f.db, data.uid, data.adventureId)),
    null,
  );
  assert.equal(
    await f.db.runTransaction((tx) =>
      readCampaignBase(tx, f.db, data.uid, data.campaignId, { optionalSource: true }),
    ),
    null,
  );
  await assert.rejects(
    () => f.db.runTransaction((tx) => readCampaignBase(tx, f.db, data.uid, data.campaignId)),
    { code: 'not-found' },
  );
  const page = await notes.listCampaignNotes(data.uid, { campaignId: data.campaignId });
  assert.equal(page.items[0].title, 'Own note');
  const note = await notes.getCampaignNote(data.uid, {
    campaignId: data.campaignId,
    campaignToken: page.campaignToken,
    noteId: page.items[0].id,
  });
  assert.equal(note.note.content, 'Own campaign text');
});

test('pending restore chunks and keys cannot resume behind a permanent deletion reservation', async () => {
  const { transferFixture, chunkRequest } =
    await import('./helpers/adventureRestoreTransferFixture.mjs');
  const f = transferFixture(),
    started = await f.api.startAdventureRestore(f.uid, f.input),
    p = started.progress;
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc(adventureReservationPath(p.adventureId)), {
      ...value('deleted'),
      adventureId: p.adventureId,
    }),
  );
  const before = structuredClone(f.records);
  await assert.rejects(
    () => f.api.appendAdventureRestoreChunk(f.uid, chunkRequest(p, f.bytes, 0)),
    isAdventureDeletionError,
  );
  await assert.rejects(
    () =>
      f.api.getAdventureRestoreRecoveryKey(f.uid, {
        restoreId: p.restoreId,
        jobToken: p.jobToken,
        reviewHash: f.input.reviewHash,
      }),
    isAdventureDeletionError,
  );
  assert.deepEqual(f.records, before);
});

test('import upload and recovery key are denied while cancellation and bounded cleanup remain possible', async () => {
  const { createAdventureImportService } = await import('../src/adventureImport.mjs');
  const c = await import('../src/adventureImportContracts.mjs');
  const f = adventureImportDb({ nativeUpdates: true }),
    api = createAdventureImportService({ db: f.db, now: () => 1000 });
  const section = c.adventureImportSection({ title: 'Part', content: 'Own text' });
  const base = {
    operationId: 'import-delete-resume-0001',
    project: { title: 'Import', synopsis: '', universeId: null },
    source: { mediaType: 'application/pdf', sha256: 'a'.repeat(64), byteLength: 100 },
    sectionCount: 1,
    totalBodyBytes: section.bodyBytes,
  };
  const request = {
    ...base,
    reviewHash: c.adventureImportReviewHash(
      base,
      c.adventureImportChain(c.adventureImportSeed, 0, section),
    ),
  };
  let p = (await api.startAdventureImport(uid, request)).progress;
  await api.getAdventureImportRecoveryKey(uid, {
    importId: p.importId,
    jobToken: p.jobToken,
    reviewHash: p.reviewHash,
  });
  p = await api.getAdventureImport(uid, { importId: p.importId });
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc(adventureReservationPath(p.adventureId)), {
      ...value('deleting'),
      adventureId: p.adventureId,
    }),
  );
  const before = structuredClone(f.records);
  await assert.rejects(
    () =>
      api.appendAdventureImportSection(uid, {
        importId: p.importId,
        jobToken: p.jobToken,
        operationId: 'import-deleted-append-0001',
        expectedCheckpoint: p.checkpoint,
        index: 0,
        section: { title: 'Part', content: 'Own text' },
      }),
    isAdventureDeletionError,
  );
  await assert.rejects(
    () =>
      api.getAdventureImportRecoveryKey(uid, {
        importId: p.importId,
        jobToken: p.jobToken,
        reviewHash: p.reviewHash,
      }),
    isAdventureDeletionError,
  );
  assert.deepEqual(f.records, before);
  p = (
    await api.cancelAdventureImport(uid, {
      importId: p.importId,
      jobToken: p.jobToken,
      operationId: 'import-deleted-cancel-0001',
      expectedCheckpoint: p.checkpoint,
    })
  ).progress;
  for (let n = 0; p.state !== 'deleted'; n++) {
    assert.ok(n < 10);
    p = (
      await api.advanceAdventureImport(uid, {
        importId: p.importId,
        jobToken: p.jobToken,
        operationId: 'import-deleted-cleanup-' + n,
        expectedCheckpoint: p.checkpoint,
      })
    ).progress;
  }
  assert.equal(p.state, 'deleted');
  assert.ok(f.records.has(adventureReservationPath(p.adventureId)));
  assert.equal(f.records.has('adventures/' + p.adventureId), false);
});

test('an activated restore can acknowledge its old receipt but cannot disclose its old recovery key', async () => {
  const { activationFixture, activationRequest } =
    await import('./helpers/adventureRestoreActivationFixture.mjs');
  const { f, p } = await activationFixture(),
    { request } = await activationRequest(f, p);
  const first = await f.api.activateAdventureRestore(f.uid, request);
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc(adventureReservationPath(p.adventureId)), {
      ...value('deleted'),
      adventureId: p.adventureId,
    }),
  );
  const before = structuredClone(f.records);
  const replay = await f.api.activateAdventureRestore(f.uid, request);
  assert.deepEqual(replay, first);
  await assert.rejects(
    () =>
      f.api.getAdventureRestoreRecoveryKey(f.uid, {
        restoreId: p.restoreId,
        jobToken: p.jobToken,
        reviewHash: f.input.reviewHash,
      }),
    isAdventureDeletionError,
  );
  assert.deepEqual(f.records, before);
});

test('comparison and generation context cannot reopen a source whose root is still present behind the reservation', async () => {
  const data = await import('./helpers/campaignLore.mjs'),
    { studioDb } = await import('./helpers/studioDb.mjs');
  const { observeCampaign, generationContext } =
    await import('../src/campaignComparisonContracts.mjs');
  const f = studioDb();
  for (const [path, v] of data.seedLoreRecords()) f.records.set(path, v);
  assert.equal(
    (await f.db.runTransaction((tx) => observeCampaign(tx, f.db, data.uid, data.campaignId)))
      .available,
    true,
  );
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc(adventureReservationPath(data.adventureId)), {
      ...value('deleted'),
      ownerId: data.uid,
      adventureId: data.adventureId,
    }),
  );
  const observed = await f.db.runTransaction((tx) =>
    observeCampaign(tx, f.db, data.uid, data.campaignId),
  );
  assert.deepEqual(observed, { available: false, reason: 'source-unavailable' });
  await assert.rejects(
    () =>
      f.db.runTransaction((tx) =>
        generationContext(tx, f.db, data.uid, data.campaignId, f.records.get(data.basePath)),
      ),
    isAdventureDeletionError,
  );
});

for (const racing of [false, true])
  test(
    'reserved adventure cannot publish restored image metadata' +
      (racing ? ' after a held Storage acceptance' : ' before Storage I/O'),
    async () => {
      const { mediaFixture, mediaRequest } =
        await import('./helpers/adventureRestoreMediaFixture.mjs');
      const { f, p, media } = await mediaFixture(),
        request = mediaRequest(p, media);
      const reserve = () =>
        f.db.runTransaction((tx) =>
          tx.create(f.db.doc(adventureReservationPath(p.adventureId)), {
            ...value('deleting'),
            adventureId: p.adventureId,
          }),
        );
      let pending, release;
      if (racing) {
        let entered;
        const paused = new Promise((resolve) => {
          entered = resolve;
        });
        const held = new Promise((resolve) => {
            release = resolve;
          }),
          accept = f.assets.accept;
        f.assets.accept = async (...args) => {
          entered();
          await held;
          return accept(...args);
        };
        pending = f.api.advanceAdventureRestoreMedia(f.uid, request);
        await paused;
      }
      await reserve();
      const before = structuredClone(f.records),
        io = f.storage.events.length;
      if (racing) release();
      else pending = f.api.advanceAdventureRestoreMedia(f.uid, request);
      await assert.rejects(() => pending, isAdventureDeletionError);
      assert.deepEqual(f.records, before);
      if (!racing) assert.equal(f.storage.events.length, io);
      const image = [...f.records].find(
        ([path]) => path.startsWith('users/' + uid + '/imageLibrary/') && !path.includes('/uses/'),
      )?.[1];
      assert.equal(image.state, 'preparing');
      assert.equal(image.url, null);
    },
  );

test('a reserved adventure is skipped by resume lists without hiding the other private projects', async () => {
  const { workFixture, book, adventure, operation } = await import('./workProgressFixtures.mjs');
  const f = workFixture();
  await f.api.recordWorkActivity(uid, {
    target: book,
    resource: { kind: 'project' },
    operationId: operation(900),
    expectedActivityRevision: 0,
  });
  await f.api.recordWorkActivity(uid, {
    target: adventure,
    resource: { kind: 'project' },
    operationId: operation(901),
    expectedActivityRevision: 1,
  });
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc(adventureReservationPath(adventure.id)), {
      ...value('deleting'),
      adventureId: adventure.id,
    }),
  );
  const result = await f.api.listWorkResume(uid, { limit: 50 });
  assert.deepEqual(
    result.items.map((item) => item.target),
    [book],
  );
  assert.equal(await f.api.resolveWorkResume(uid, { target: adventure }), null);
  assert.ok(f.records.has('adventures/' + adventure.id));
});

test('source reservation hides old derived chat answers before any turn-body read and preserves the own question', async () => {
  const { editorChatConversationFixture } =
    await import('./helpers/editorChatConversationFixture.mjs');
  const f = await editorChatConversationFixture({
    kind: 'adventure',
    database: adventureImportDb({ nativeUpdates: true }),
  });
  await f.seedTurn('private-turn');
  assert.equal((await f.get('private-turn')).presentation, 'available');
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc(adventureReservationPath(f.target.id)), {
      ...value('deleting'),
      adventureId: f.target.id,
    }),
  );
  f.events.length = 0;
  const result = await f.get('private-turn');
  assert.equal(result.question, 'Pergunta private-turn');
  assert.equal(result.presentation, 'blocked');
  assert.equal(result.answer, null);
  assert.equal(
    f.events.filter((e) => e.method === 'get' && e.path?.includes('/turnBodies/')).length,
    0,
  );
});

test('reserved source hides a real pending scene job and rejects a queued rebalance before resuming its writes', async () => {
  const { createScenesService } = await import('../src/scenes.mjs');
  const f = adventureImportDb({ nativeUpdates: true }),
    studio = createStudioService({ db: f.db, now: () => 1000 }),
    api = createScenesService({ db: f.db, now: () => 1001 }),
    target = { kind: 'adventure', id };
  await studio.createAdventure(uid, { operationId: id, title: 'Own project' });
  const group = await api.createSceneGroup(uid, {
    target,
    operationId: 'deletion-scene-group-0001',
    title: 'Part',
  });
  await api.createScene(uid, {
    target,
    parentId: group.id,
    operationId: 'deletion-scene-create-0001',
    title: 'Scene',
    content: 'Own text',
  });
  const request = {
    target,
    parentId: group.id,
    operationId: 'deletion-scene-rebalance-0001',
    limit: 1,
  };
  await api.rebalanceSceneRanks(uid, request);
  assert.equal(
    (await api.getSceneJob(uid, { target, operationId: request.operationId })).kind,
    'rebalance',
  );
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value('deleting')));
  const before = structuredClone(f.records);
  assert.equal(await api.getSceneJob(uid, { target, operationId: request.operationId }), null);
  await assert.rejects(() => api.rebalanceSceneRanks(uid, request), isAdventureDeletionError);
  assert.deepEqual(f.records, before);
});
