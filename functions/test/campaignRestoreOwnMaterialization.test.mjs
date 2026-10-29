import test from 'node:test';
import assert from 'node:assert/strict';
import {
  uid,
  ownRid,
  ownMut as mut,
  richOwnCampaign,
  prepareOwnRestore,
  finishOwnMaterialization as finish,
} from './helpers/campaignOwnMaterialization.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { createCampaignRestoreTransferService } from '../src/campaignRestoreTransfer.mjs';
import { createCampaignNotesService } from '../src/campaignNotes.mjs';
import { createCampaignSessionsService } from '../src/campaignSessions.mjs';
import { createCampaignPreparationService } from '../src/campaignPreparation.mjs';
import { createCampaignSessionReferencesService } from '../src/campaignSessionReferences.mjs';
import { createWorkProgressService } from '../src/workProgress.mjs';
import { OWN_TARGET_FIELDS, ownRestoredId } from '../src/campaignRestoreOwnFormat.mjs';
const root = 'users/' + uid + '/campaignRestores/' + ownRid;
let cached;
async function fixture(original) {
  cached ??= richOwnCampaign();
  const shared = original ?? (await cached),
    source = { ...shared, keys: shared.keys.map((k) => ({ ...k })) },
    f = adventureImportDb({ nativeUpdates: true });
  return { ...f, ...(await prepareOwnRestore(f.db, source)), original: source };
}
const get = (f, p) =>
  f.api.getCampaignRestoreOwnProject(uid, { restoreId: p.restoreId, jobToken: p.jobToken });
const mapping = (p, family, original) =>
  ownRestoredId({ uid, rid: p.restoreId, token: p.jobToken }, family, original);
function releaseFixture(f, p, draft) {
  // Test-only release to exercise ordinary consumers; production activation stays absent.
  f.records.set('campaigns/' + p.campaignId, {
    ...draft.project,
    ownerId: uid,
    schemaVersion: 1,
    revision: 1,
    provenance: { kind: 'independent' },
    activeBaseId: null,
    universeId: null,
    hasProgressResources: draft.hasProgressResources,
  });
}
test('rich own data resumes per frame and ordinary readers preserve remapped text, states, controls and later mutations', async () => {
  const f = await fixture();
  let p = f.p;
  for (let n = 0; p.ownMaterialization?.phase !== 'ready' && n < 10000; n++) {
    p = (
      await f.api.advanceCampaignRestoreOwnMaterialization(
        uid,
        mut(p, 'own-one-frame-step-' + p.checkpoint, { limit: 1 }),
      )
    ).progress;
    if (n === 10)
      f.api = createCampaignRestoreTransferService({
        db: f.db,
        keys: f.original.keys,
        now: () => 7000,
      });
  }
  const draft = await get(f, p),
    path = 'campaigns/' + p.campaignId;
  assert.equal(f.records.get(path).ownerId, undefined);
  assert.doesNotMatch(JSON.stringify(p), /PRIVATE|payload|project|content/);
  assert.equal(
    f.records.has(path + '/notes/' + mapping(p, 'note', f.original.deletedNoteId)),
    false,
  );
  releaseFixture(f, p, draft);
  const scope = { campaignId: p.campaignId, campaignToken: draft.campaignToken },
    notes = createCampaignNotesService({ db: f.db }),
    sessions = createCampaignSessionsService({ db: f.db }),
    prep = createCampaignPreparationService({ db: f.db }),
    refs = createCampaignSessionReferencesService({ db: f.db }),
    noteId = mapping(p, 'note', f.original.noteId),
    sessionId = mapping(p, 'session', f.original.sessionId);
  const note = await notes.getCampaignNote(uid, { ...scope, noteId });
  assert.equal(
    note.note.content,
    f.original.records.get(f.original.path + '/notes/' + f.original.noteId).content,
  );
  const session = await sessions.getCampaignSession(uid, { ...scope, sessionId });
  assert.equal(session.session.status, 'completed');
  assert.equal(session.session.scheduledDate, '2026-10-30');
  assert.equal(session.session.summary, '  \ufeff Preparação 🐉\n  ');
  const itemId = mapping(p, 'preparation-item', f.original.itemId);
  const item = await prep.getCampaignPreparationItem(uid, {
    ...scope,
    itemId,
    expectedRevision: 1,
  });
  assert.deepEqual(
    item.item.body,
    f.original.records.get(f.original.path + '/preparationBodies/' + f.original.itemId).body,
  );
  const links = await prep.listCampaignSessionPreparationLinks(uid, {
    ...scope,
    sessionId,
    expectedSessionRevision: 1,
  });
  assert.equal(links.items.length, 2);
  assert.deepEqual(
    links.items.map((l) => l.target.id).sort(),
    [itemId, mapping(p, 'preparation-item', f.original.questId)].sort(),
  );
  const linked = await refs.listCampaignSessionReferences(uid, {
    ...scope,
    view: 'references',
    kind: 'scene',
    sessionId,
    expectedSessionRevision: 1,
  });
  assert.equal(linked.items.length, 1);
  const progress = await createWorkProgressService({ db: f.db }).getWorkProgress(uid, {
    target: { kind: 'campaign', id: p.campaignId },
  });
  assert.deepEqual(progress.checklist, { total: 1, completed: 1 });
  await notes.saveCampaignNote(uid, {
    ...scope,
    noteId,
    operationId: 'own-normal-note-update',
    expectedRevision: 1,
    title: note.note.title,
    content: 'NOVA NOTA 🐉',
  });
  const oldNext = f.records.get(path + '/sessionState/current').nextOrder,
    newSessionId = 'own-normal-added-session';
  await sessions.saveCampaignSession(uid, {
    ...scope,
    sessionId: newSessionId,
    operationId: newSessionId,
    expectedRevision: 0,
    title: 'Nova sessão',
    summary: '',
    status: 'planned',
    scheduledDate: null,
  });
  assert.equal(f.records.get(path + '/sessions/' + newSessionId).order, oldNext);
});
test('large escaped DTO over 2 MiB preserves the full native preparation body without growing the checkpoint', async () => {
  const original = await richOwnCampaign({ large: true }),
    f = await fixture(original),
    p = await finish(f, undefined, 25);
  const id = mapping(p, 'preparation-item', original.itemId),
    body = f.records.get('campaigns/' + p.campaignId + '/preparationBodies/' + id).body;
  assert.deepEqual(body, {
    text: original.largeText,
    condition: original.largeText,
    recipient: original.largeText,
  });
  assert.ok(
    Buffer.from(f.records.get(root).ownMaterialization.payload.data, 'base64').length < 32768,
  );
});
test('empty own project reconstructs zero controls and absent progress without enabling the root', async () => {
  const f = await fixture(await richOwnCampaign({ empty: true })),
    p = await finish(f),
    draft = await get(f, p);
  assert.equal(draft.hasProgressResources, false);
  assert.equal(f.records.get('campaigns/' + p.campaignId + '/sessionState/current').nextOrder, 1);
  assert.equal(f.records.has('campaigns/' + p.campaignId + '/workProgress/current'), false);
  assert.equal(f.records.get('campaigns/' + p.campaignId).ownerId, undefined);
});
test('two restores in the same account keep separate native IDs and remap each parent inside its own table', async () => {
  const f = await fixture(),
    a = await finish(f),
    second = await prepareOwnRestore(f.db, f.original, 'campaign-own-materialize-0002');
  const b = await finish({ ...f, api: second.api, p: second.p });
  assert.notEqual(a.campaignId, b.campaignId);
  assert.notEqual(
    mapping(a, 'session', f.original.sessionId),
    mapping(b, 'session', f.original.sessionId),
  );
  for (const p of [a, b]) {
    const links = [...f.records]
      .filter(([path]) =>
        path.startsWith('campaigns/' + p.campaignId + '/sessionPreparationLinks/'),
      )
      .map(([, v]) => v);
    assert.equal(links.length, 2);
    assert.ok(links.every((l) => l.sessionId === mapping(p, 'session', f.original.sessionId)));
  }
});
test('cancel removes all own targets before indexes/chunks without reading text, and exact receipts survive', async () => {
  const f = await fixture(),
    p = await finish(f),
    req = mut(p, 'own-cancel-operation'),
    cancelled = await f.api.cancelCampaignRestore(uid, req);
  assert.equal(f.records.get(root).ownMaterialization.payload, null);
  const run = f.db.runTransaction.bind(f.db);
  let nativeReads = 0;
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        getAll: async (ref, options) => {
          if (ref.path.startsWith('campaigns/' + p.campaignId + '/')) {
            nativeReads++;
            assert.ok(
              options.fieldMask.every(
                (k) => !['content', 'summary', 'body', 'title', 'target'].includes(k),
              ),
            );
          }
          return tx.getAll(ref, options);
        },
      }),
    );
  let next = cancelled.progress;
  for (let n = 0; next.state !== 'cancelled' && n < 1000; n++)
    next = (
      await f.api.advanceCampaignRestoreCleanup(
        uid,
        mut(next, 'own-cleanup-step-' + next.checkpoint, { limit: 3 }),
      )
    ).progress;
  assert.equal(next.state, 'cancelled');
  assert.ok(nativeReads > 0);
  for (const collection of Object.keys(OWN_TARGET_FIELDS))
    assert.ok(
      ![...f.records.keys()].some((path) =>
        path.startsWith('campaigns/' + p.campaignId + '/' + collection + '/'),
      ),
    );
  assert.ok(![...f.records.keys()].some((path) => path.startsWith(root + '/ownWrites/')));
  assert.deepEqual((await f.api.cancelCampaignRestore(uid, req)).receipt, cancelled.receipt);
});

async function beforeFirstNote(f) {
  let p = f.p;
  while ((p.ownMaterialization?.processed ?? 0) < 3)
    p = (
      await f.api.advanceCampaignRestoreOwnMaterialization(
        uid,
        mut(p, 'own-before-native-' + p.checkpoint, { limit: 25 }),
      )
    ).progress;
  assert.equal(p.ownMaterialization.written, 0);
  return p;
}
for (const point of [0, 1, 2, 3, 4])
  test(
    'native own write rollback ' + point + ' keeps job, journal and targets atomic',
    async () => {
      const f = await fixture(),
        p = await beforeFirstNote(f),
        before = structuredClone([...f.records]),
        run = f.db.runTransaction.bind(f.db),
        request = mut(p, 'own-rollback-native-operation', { limit: 25 });
      f.db.runTransaction = (fn) =>
        run((tx) => {
          let n = 0;
          const wrapped = { ...tx };
          for (const method of ['create', 'set'])
            wrapped[method] = (ref, ...args) => {
              const result = tx[method](ref, ...args);
              if (n++ === point) throw Error('own-rollback');
              return result;
            };
          return fn(wrapped);
        });
      await assert.rejects(
        f.api.advanceCampaignRestoreOwnMaterialization(uid, request),
        /own-rollback/,
      );
      assert.deepEqual([...f.records], before);
      f.db.runTransaction = run;
      const result = await f.api.advanceCampaignRestoreOwnMaterialization(uid, request);
      assert.equal(result.progress.ownMaterialization.written, 1);
      assert.deepEqual(
        (await f.api.advanceCampaignRestoreOwnMaterialization(uid, request)).receipt,
        result.receipt,
      );
    },
  );
test('concurrent own writers publish one native unit and historical replay survives cancellation', async () => {
  const f = await fixture(),
    p = await beforeFirstNote(f),
    requests = [
      mut(p, 'own-concurrent-first-operation', { limit: 25 }),
      mut(p, 'own-concurrent-second-operation', { limit: 25 }),
    ],
    results = await Promise.allSettled(
      requests.map((q) => f.api.advanceCampaignRestoreOwnMaterialization(uid, q)),
    );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    results.find((r) => r.status === 'rejected').reason.details.reason,
    'checkpoint-conflict',
  );
  const winner = results.findIndex((r) => r.status === 'fulfilled'),
    first = results[winner].value;
  const done = await finish(f, first.progress);
  await f.api.cancelCampaignRestore(uid, mut(done, 'own-after-ready-cancel-operation'));
  assert.deepEqual(
    (await f.api.advanceCampaignRestoreOwnMaterialization(uid, requests[winner])).receipt,
    first.receipt,
  );
});
test('cancel while a frame read is held prevents late own prose or journals', async () => {
  const f = await fixture(),
    p = await beforeFirstNote(f),
    open = f.api.openCampaignRestoreSource.bind(f.api);
  let entered,
    release,
    blocked = false;
  const arrival = new Promise((r) => (entered = r)),
    gate = new Promise((r) => (release = r));
  f.api.openCampaignRestoreSource = async (...args) => {
    const source = await open(...args);
    return {
      ...source,
      read: async (...readArgs) => {
        const bytes = await source.read(...readArgs);
        if (!blocked) {
          blocked = true;
          entered();
          await gate;
        }
        return bytes;
      },
    };
  };
  const pending = f.api
    .advanceCampaignRestoreOwnMaterialization(
      uid,
      mut(p, 'own-held-native-operation', { limit: 25 }),
    )
    .then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
  await arrival;
  await f.api.cancelCampaignRestore(uid, mut(p, 'own-held-native-cancel-operation'));
  release();
  assert.ok((await pending).error);
  assert.equal(f.records.get(root).ownMaterialization.written, 0);
  assert.equal(f.records.get(root).ownMaterialization.payload, null);
  assert.ok(![...f.records.keys()].some((path) => path.startsWith(root + '/ownWrites/')));
});
test('issuance revocation during frame I/O refuses the native write without advancing', async () => {
  const f = await fixture(),
    p = await beforeFirstNote(f),
    open = f.api.openCampaignRestoreSource.bind(f.api),
    before = structuredClone([...f.records]);
  f.api.openCampaignRestoreSource = async (...args) => {
    const source = await open(...args);
    return {
      ...source,
      read: async (...readArgs) => {
        const bytes = await source.read(...readArgs);
        f.original.keys[0].state = 'revoked';
        return bytes;
      },
    };
  };
  await assert.rejects(
    f.api.advanceCampaignRestoreOwnMaterialization(
      uid,
      mut(p, 'own-revoked-frame-operation', { limit: 25 }),
    ),
    (e) => e.details?.reason === 'campaign-backup-invalid-attestation',
  );
  assert.deepEqual([...f.records], before);
});
for (const mode of ['target-recreated', 'target-updated', 'journal-recreated', 'journal-foreign'])
  test('own audit refuses ' + mode + ' and preserves every private record', async () => {
    const f = await fixture();
    let p = f.p;
    while (p.ownMaterialization?.phase !== 'audit')
      p = (
        await f.api.advanceCampaignRestoreOwnMaterialization(
          uid,
          mut(p, 'own-until-audit-' + p.checkpoint, { limit: 25 }),
        )
      ).progress;
    const journalPath = root + '/ownWrites/000000000000000',
      journal = f.records.get(journalPath),
      t = journal.targets[0],
      path = 'campaigns/' + p.campaignId + '/' + t.collection + '/' + t.id;
    if (mode === 'journal-foreign') f.records.get(journalPath).jobToken = 'f'.repeat(64);
    else {
      const targetPath = mode === 'journal-recreated' ? journalPath : path,
        m = f.metadata.get(targetPath);
      f.metadata.set(targetPath, {
        ...m,
        ...(mode === 'target-updated'
          ? {}
          : { createdAtNanoseconds: m.createdAtNanoseconds + 50000 }),
        updatedAt: 1000,
        updatedAtNanoseconds: m.createdAtNanoseconds + 50000,
      });
    }
    const before = structuredClone([...f.records]);
    await assert.rejects(
      f.api.advanceCampaignRestoreOwnMaterialization(
        uid,
        mut(p, 'own-invalid-audit-operation', { limit: 25 }),
      ),
    );
    assert.deepEqual([...f.records], before);
    const cancelled = await f.api.cancelCampaignRestore(
        uid,
        mut(p, 'own-invalid-cancel-operation'),
      ),
      beforeCleanup = structuredClone([...f.records]);
    await assert.rejects(
      f.api.advanceCampaignRestoreCleanup(
        uid,
        mut(cancelled.progress, 'own-invalid-cleanup-operation', { limit: 25 }),
      ),
    );
    assert.deepEqual([...f.records], beforeCleanup);
  });
test('unregistered own targets block initial materialization and final cleanup without reading or deleting them', async () => {
  const f = await fixture(),
    path = 'campaigns/' + f.p.campaignId + '/preparationBodies/foreign';
  f.records.set(path, { ownerId: 'other', body: { text: 'FOREIGN PROSE' } });
  const before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.advanceCampaignRestoreOwnMaterialization(
      uid,
      mut(f.p, 'own-foreign-first-operation', { limit: 25 }),
    ),
  );
  assert.deepEqual([...f.records], before);
  const cancelled = await f.api.cancelCampaignRestore(
      uid,
      mut(f.p, 'own-foreign-cancel-operation'),
    ),
    after = structuredClone([...f.records]);
  await assert.rejects(
    f.api.advanceCampaignRestoreCleanup(
      uid,
      mut(cancelled.progress, 'own-foreign-cleanup-operation', { limit: 25 }),
    ),
  );
  assert.deepEqual([...f.records], after);
  assert.equal(f.records.get(path).body.text, 'FOREIGN PROSE');
});
test('invalid client paths/cursors, foreign accounts and C4 cannot start materialization', async () => {
  const f = await fixture();
  for (const extra of [
    { limit: 0 },
    { limit: 26 },
    { limit: 1, cursor: 0 },
    { limit: 1, targetPath: 'campaigns/foreign' },
  ])
    await assert.rejects(
      f.api.advanceCampaignRestoreOwnMaterialization(
        uid,
        mut(f.p, 'own-invalid-client-operation', extra),
      ),
    );
  await assert.rejects(
    f.api.advanceCampaignRestoreOwnMaterialization(
      'other',
      mut(f.p, 'own-foreign-user-operation', { limit: 1 }),
    ),
    (e) => e.code === 'not-found',
  );
  f.records.set('campaignDeletionReservations/' + f.p.campaignId, { ownerId: uid });
  await assert.rejects(
    f.api.advanceCampaignRestoreOwnMaterialization(
      uid,
      mut(f.p, 'own-c4-blocked-operation', { limit: 1 }),
    ),
  );
});
