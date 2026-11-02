import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureDeletionDb } from './helpers/adventureDeletionDb.mjs';
import { createDeletionChat } from './helpers/adventureDeletionChatFixture.mjs';
import { createStudioService } from '../src/studio.mjs';
import { createAdventureDeletionService } from '../src/adventureDeletion.mjs';
import { createWorkProgressService } from '../src/workProgress.mjs';
import { adventureImageUseKey } from '../src/adventureBlockImages.mjs';
import { digest } from '../src/workProgressContracts.mjs';
import {
  archiveCleanupFixture,
  finishArchiveCleanup,
} from './helpers/adventureRestoreArchiveCleanupFixture.mjs';

const uid = 'author',
  id = 'final-adventure-project-0001';
const step = (p) => ({
  deletionId: p.deletionId,
  deletionToken: p.deletionToken,
  operationId: 'final-adventure-step-' + String(p.checkpoint).padStart(8, '0'),
  expectedCheckpoint: p.checkpoint,
});
const jobPath = (p) => 'users/' + uid + '/adventureDeletions/' + p.deletionId;
const reservationPath = (p) => 'adventureDeletionReservations/' + p.adventureId;
const stored = (f, p) => f.records.get(jobPath(p));
async function start(f, adventureId = id) {
  const api = createAdventureDeletionService({ db: f.db, assets: f.assets, now: () => 9000 }),
    s = await api.getAdventureDeletionSource(uid, { adventureId }),
    input = {
      adventureId,
      adventureToken: s.adventureToken,
      sourceToken: s.sourceToken,
      expectedRevision: s.revision,
      operationId: 'final-adventure-start-0001',
    };
  const started = await api.startAdventureDeletion(uid, input);
  return { ...f, api, input, started, p: started.progress };
}
async function fixture(chat = false, beforeStart = async () => {}) {
  const f = adventureDeletionDb(),
    studio = createStudioService({ db: f.db, now: () => 1000 });
  const conversation = chat ? await createDeletionChat(f.db, { prefix: 'final-chat' }) : null;
  if (!chat)
    await studio.createAdventure(uid, {
      operationId: id,
      title: 'Own final adventure',
      synopsis: 'PRIVATE_SYNOPSIS',
    });
  await beforeStart(f);
  return start({ ...f, studio, conversation }, conversation?.target.id ?? id);
}
async function drive(f, p, done) {
  for (let n = 0; !done(p); n++) {
    assert.ok(n < 1500, 'bounded units must converge');
    p = (await f.api.advanceAdventureDeletion(uid, step(p))).progress;
  }
  return p;
}
const terminal = (f, p = f.p) =>
  drive(f, p, (v) => v.phase === 'verify' && stored(f, v).part === 4);
const finish = (f, p = f.p) => drive(f, p, (v) => v.complete);

test('terminal observations remove the root and keep one permanent native reservation, job and exact receipts', async () => {
  const f = await fixture(),
    p = await terminal(f),
    request = step(p),
    first = await f.api.advanceAdventureDeletion(uid, request),
    final = first.progress;
  assert.equal(final.complete, true);
  assert.equal(final.state, 'deleted');
  assert.equal(final.phase, 'complete');
  assert.equal(final.deletedDocuments, p.deletedDocuments + 1);
  assert.equal(final.deletionToken, f.p.deletionToken);
  assert.equal(f.records.has('adventures/' + id), false);
  assert.equal(f.records.get(reservationPath(final)).state, 'deleted');
  const jobMeta = f.metadata.get(jobPath(final)),
    reserveMeta = f.metadata.get(reservationPath(final)),
    receiptPath = 'users/' + uid + '/adventureDeletionOperations/' + request.operationId,
    receiptMeta = f.metadata.get(receiptPath);
  assert.equal(reserveMeta.updatedAtNanoseconds, receiptMeta.createdAtNanoseconds);
  assert.equal(jobMeta.updatedAtNanoseconds, receiptMeta.createdAtNanoseconds);
  assert.equal(reserveMeta.createdAtNanoseconds, jobMeta.createdAtNanoseconds);
  assert.equal(
    (await f.api.getAdventureDeletion(uid, { adventureId: id })).deletion.complete,
    true,
  );
  assert.equal((await f.api.listAdventureDeletions(uid)).items[0].complete, true);
  const before = structuredClone(f.records);
  assert.deepEqual(await f.api.advanceAdventureDeletion(uid, request), first);
  const old = await f.api.startAdventureDeletion(uid, f.input);
  assert.deepEqual(old.receipt, f.started.receipt);
  assert.deepEqual(old.progress, final);
  assert.deepEqual(
    await f.api.resolveAdventureDeletionStart(uid, { ...f.input, intent: 'cancel' }),
    old,
  );
  await assert.rejects(
    () => f.api.advanceAdventureDeletion(uid, step(final)),
    (e) => e.details?.reason === 'checkpoint-conflict',
  );
  await assert.rejects(
    () => f.studio.createAdventure(uid, { operationId: id, title: 'Replacement' }),
    (e) => e.details?.reason === 'adventure-deleted',
  );
  assert.equal((await f.api.getAdventureDeletion('other', { adventureId: id })).deletion, null);
  assert.deepEqual(f.records, before);
  assert.ok(
    f.metadataReads.every(
      (r) => !r.fields.some((v) => ['content', 'capture', 'answer'].includes(v)),
    ),
  );
  assert.ok(f.reads.every((r) => r.maximum <= 51));
});

test('a root already absent can finish without counting or recreating a root', async () => {
  const f = await fixture();
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc('adventures/' + id)));
  const p = await terminal(f),
    final = await finish(f, p);
  assert.equal(final.deletedDocuments, p.deletedDocuments);
  assert.equal(f.records.has('adventures/' + id), false);
  assert.equal(
    (await f.api.getAdventureDeletion(uid, { adventureId: id })).deletion.complete,
    true,
  );
});

test('own questions remain readable after the project root and all derived chat bodies are gone', async () => {
  const f = await fixture(true),
    c = f.conversation,
    question = structuredClone(f.records.get(c.questionPath));
  const final = await finish(f);
  assert.equal(final.complete, true);
  assert.equal(f.records.has(c.bodyPath), false);
  assert.deepEqual(f.records.get(c.questionPath), question);
  const turn = await c.conversations.dispatch(uid, {
    action: 'getTurn',
    ...c.turnScope,
    turnId: c.turn.turnId,
  });
  assert.equal(turn.question, '  Own private question\n');
  assert.equal(turn.answer, null);
});

test('known authorship reappearing after the scan reopens children and discards later certificates', async () => {
  const f = await fixture(),
    p = await terminal(f),
    path = 'adventures/' + id + '/scenes/missing-parent/body/current';
  f.records.set(path, { ownerId: uid, adventureId: id, content: 'PRIVATE_REAPPEARED_TEXT' });
  const reopened = (await f.api.advanceAdventureDeletion(uid, step(p))).progress;
  assert.equal(reopened.phase, 'children');
  assert.deepEqual(stored(f, reopened).certified, ['quiescence', 'media', 'images']);
  assert.equal(f.records.has(path), true);
  assert.equal(f.records.has('adventures/' + id), true);
  const final = await finish(f, reopened);
  assert.equal(final.complete, true);
  assert.equal(f.records.has(path), false);
});

test('a late known image use reopens images and preserves the independent library copy', async () => {
  const f = await fixture(),
    p = await terminal(f),
    image = 'users/' + uid + '/imageLibrary/final-library-image-0001',
    resource = { kind: 'scene', id: 'final-scene' },
    use = image + '/uses/' + adventureImageUseKey(id, resource);
  const copy = {
    id: 'final-library-image-0001',
    state: 'active',
    useCount: 1,
    name: 'Independent',
    path: 'own/image.png',
  };
  f.records.set(image, copy);
  f.records.set(use, { kind: 'adventure-block', adventureId: id, resource });
  const reopened = (await f.api.advanceAdventureDeletion(uid, step(p))).progress;
  assert.equal(reopened.phase, 'images');
  assert.deepEqual(stored(f, reopened).certified, ['quiescence', 'media']);
  await finish(f, reopened);
  assert.deepEqual(f.records.get(image), { ...copy, useCount: 0 });
  assert.equal(f.records.has(use), false);
});

test('late canonical activity reopens only activity and increments the account revision once', async () => {
  const target = { kind: 'adventure', id },
    f = await fixture(false, async (database) => {
      const progress = createWorkProgressService({ db: database.db, now: () => 7000 });
      await progress.recordWorkActivity(uid, {
        target,
        resource: { kind: 'project' },
        operationId: 'final-before-activity',
        expectedActivityRevision: 0,
      });
    });
  const rowPath = 'users/' + uid + '/workActivity/' + digest(target),
    row = structuredClone(f.records.get(rowPath)),
    p = await terminal(f),
    statePath = 'users/' + uid + '/workActivityState/current',
    state = structuredClone(f.records.get(statePath));
  f.records.set(rowPath, row);
  const reopened = (await f.api.advanceAdventureDeletion(uid, step(p))).progress;
  assert.equal(reopened.phase, 'activity');
  await finish(f, reopened);
  assert.deepEqual(f.records.get(statePath), { ...state, revision: state.revision + 1 });
  assert.equal(f.records.has(rowPath), false);
});

test('a contradictory body scope discovered at final verification reopens controls and then refuses attribution', async () => {
  const f = await fixture(),
    c = await createDeletionChat(f.db, { prefix: 'neighbor-final-ready', withTurn: false }),
    original = structuredClone(f.records.get(c.contextBodyPath));
  const p = await terminal(f);
  // Declared malformed storage fixture: target metadata is insufficient without its original receipt.
  original.frozen.source.target = { kind: 'adventure', id };
  const ownToken = f.records.get(jobPath(p)).sourceBirth;
  const { editorChatProjectToken } = await import('../src/editorChatContracts.mjs');
  original.frozen.source.projectToken = await editorChatProjectToken({
    ownerId: uid,
    target: { kind: 'adventure', id },
    createdAt: ownToken,
  });
  f.records.set(c.contextBodyPath, original);
  const reopened = (await f.api.advanceAdventureDeletion(uid, step(p))).progress;
  assert.equal(reopened.phase, 'controls');
  assert.equal(reopened.complete, false);
  const before = structuredClone(f.records);
  // Its real parent belongs to another project; preserve it rather than adopting by body metadata.
  await assert.rejects(() => finish(f, reopened), { code: 'failed-precondition' });
  assert.equal(f.records.has('adventures/' + id), true);
  assert.deepEqual(f.records.get(c.contextBodyPath), before.get(c.contextBodyPath));
});

for (const which of ['adventureImportRecoveryKeys', 'adventureRestoreRecoveryKeys'])
  test(
    'a reappeared ' + which + ' prevents final removal without loading its private value',
    async () => {
      const f = await fixture(),
        p = await terminal(f),
        path = 'users/' + uid + '/' + which + '/unexpected-key';
      f.records.set(path, { adventureId: id, secret: 'DO_NOT_READ_OR_REMOVE' });
      const before = structuredClone(f.records);
      await assert.rejects(() => f.api.advanceAdventureDeletion(uid, step(p)), {
        code: 'failed-precondition',
      });
      assert.deepEqual(f.records, before);
    },
  );

for (const boundary of ['root', 'reservation', 'job', 'receipt'])
  test(
    'terminal rollback at ' + boundary + ' retains the original root and reservation until retry',
    async () => {
      const f = await fixture(),
        p = await terminal(f),
        run = f.db.runTransaction.bind(f.db),
        before = structuredClone(f.records);
      let failed = false;
      f.db.runTransaction = (callback) =>
        run((tx) =>
          callback(
            new Proxy(tx, {
              get(target, method) {
                if (!['delete', 'update', 'set', 'create'].includes(method)) return target[method];
                return (ref, ...args) => {
                  const match =
                    boundary === 'root'
                      ? ref.path === 'adventures/' + id
                      : boundary === 'reservation'
                        ? ref.path === reservationPath(p)
                        : boundary === 'job'
                          ? ref.path === jobPath(p)
                          : ref.path.includes('/adventureDeletionOperations/');
                  if (match) {
                    failed = true;
                    throw Error('Terminal rollback');
                  }
                  return target[method](ref, ...args);
                };
              },
            }),
          ),
        );
      await assert.rejects(() => f.api.advanceAdventureDeletion(uid, step(p)), /Terminal rollback/);
      assert.equal(failed, true);
      assert.deepEqual(f.records, before);
      f.db.runTransaction = run;
      assert.equal((await finish(f, p)).complete, true);
    },
  );

test('lost terminal acknowledgement is recovered with the exact receipt and no repeated root count', async () => {
  const f = await fixture(),
    p = await terminal(f),
    request = step(p),
    run = f.db.runTransaction.bind(f.db);
  let lose = true;
  f.db.runTransaction = async (callback) => {
    const result = await run(callback);
    if (lose) {
      lose = false;
      throw Error('Terminal ACK lost');
    }
    return result;
  };
  await assert.rejects(() => f.api.advanceAdventureDeletion(uid, request), /Terminal ACK lost/);
  const before = structuredClone(f.records),
    recovered = await f.api.advanceAdventureDeletion(uid, request);
  assert.equal(recovered.progress.complete, true);
  assert.equal(recovered.progress.deletedDocuments, p.deletedDocuments + 1);
  assert.deepEqual(f.records, before);
});

for (const kind of ['job', 'reservation', 'receipt', 'root', 'reservation-update'])
  test(
    'terminal native proof refuses copied or recreated ' + kind + ' metadata without changing it',
    async () => {
      const f = await fixture(),
        p = await finish(f),
        paths = {
          job: jobPath(p),
          reservation: reservationPath(p),
          receipt: 'users/' + uid + '/adventureDeletionOperations/' + stored(f, p).lastOperationId,
          root: 'adventures/' + id,
          'reservation-update': reservationPath(p),
        },
        path = paths[kind];
      if (kind === 'root')
        await f.db.runTransaction(async (tx) =>
          tx.create(f.db.doc(path), {
            schemaVersion: 1,
            ownerId: uid,
            revision: 1,
            title: 'Recreated',
          }),
        );
      else {
        const copy = structuredClone(f.records.get(path));
        if (kind !== 'reservation-update')
          await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(path)));
        await f.db.runTransaction(async (tx) => tx.set(f.db.doc(path), copy));
      }
      const before = structuredClone(f.records);
      await assert.rejects(() => f.api.getAdventureDeletion(uid, { adventureId: id }), {
        code: 'failed-precondition',
      });
      assert.deepEqual(f.records, before);
      assert.equal(await f.api.getAdventureDeletionSource(uid, { adventureId: id }), null);
    },
  );

test('the original restore job, receipts and activated library copies survive complete project removal', async () => {
  const { f, p: source, progress } = await archiveCleanupFixture();
  await finishArchiveCleanup(f, source, progress);
  adventureDeletionDb(f);
  const image = [...f.records].find(
      ([path]) => path.startsWith('users/' + uid + '/imageLibrary/') && !path.includes('/uses/'),
    ),
    original = structuredClone(image[1]),
    restoreJob = structuredClone(f.records.get(f.path));
  const flow = await start(f, source.adventureId),
    final = await finish(flow);
  assert.equal(final.complete, true);
  assert.equal(f.records.has('adventures/' + source.adventureId), false);
  assert.deepEqual(f.records.get(image[0]), { ...original, useCount: 0 });
  assert.deepEqual(f.records.get(f.path), restoreJob);
  assert.equal(
    (await flow.api.getAdventureDeletion(uid, { adventureId: source.adventureId })).deletion
      .complete,
    true,
  );
});
