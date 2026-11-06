import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createLiteraryProgressService } from '../src/literaryProgress.mjs';
import { createLiteraryProductionService } from '../src/literaryProduction.mjs';
const uid = 'author',
  target = { kind: 'book', id: 'book' };
function fixture() {
  const f = studioDb();
  f.records.set('books/book', { authorId: uid, updatedAt: 1 });
  f.records.set('books/book/literaryPlans/brief', {
    revision: 2,
    updatedAt: 10,
    plan: {
      kind: 'chapterBrief',
      title: 'A carta',
      status: 'approved',
      fields: { private: 'PRIVATE PLAN BODY' },
    },
  });
  const api = createLiteraryProgressService({ db: f.db, now: () => 1000 }),
    production = createLiteraryProductionService({ db: f.db }),
    detail = () => api.getLiteraryProgressArtifact(uid, { target, stage: 'planning', id: 'brief' });
  return { ...f, api, production, detail };
}
const input = (detail, operationId = 'progress-operation-001') => ({
  target,
  stage: 'planning',
  id: 'brief',
  sourceToken: detail.artifact.sourceToken,
  expectedRevision: detail.note.revision,
  operationId,
  notes: { blockers: ['Aguardar decisão do autor.'], nextStep: 'Conferir a transformação final.' },
});
test('progress pages read artifact metadata, keep stages distinct and do not certify review or publication', async () => {
  const f = fixture();
  f.records.set('books/book/literaryMilestones/revised', {
    kind: 'revised',
    chapterId: 'chapter',
    state: 'done',
    planned: 2,
    captured: 2,
    verified: 2,
    wordCount: 3000,
    body: 'PRIVATE MANUSCRIPT',
  });
  const planning = await f.api.listLiteraryProgressArtifacts(uid, { target, stage: 'planning' }),
    versions = await f.api.listLiteraryProgressArtifacts(uid, { target, stage: 'versions' });
  assert.equal(planning.items[0].state, 'approved');
  assert.equal(versions.items[0].kind, 'revised');
  assert.equal(versions.items[0].state, 'done');
  assert.equal(versions.items[0].qualityCertified, false);
  assert.equal(versions.items[0].publicationCertified, false);
  assert.equal(versions.wholeBookComplete, false);
  assert.equal(versions.sourceCurrentness, 'not-rechecked');
  assert.equal(JSON.stringify([planning, versions]).includes('PRIVATE'), false);
});
test('canonical next step and blockers save with CAS, immutable versions and a recoverable receipt', async () => {
  const f = fixture(),
    detail = await f.detail(),
    request = input(detail),
    saved = await f.api.saveLiteraryProgressNote(uid, request);
  assert.equal(saved.revision, 1);
  assert.deepEqual(saved.blockers, request.notes.blockers);
  const current = await f.detail();
  assert.equal(current.note.nextStep, request.notes.nextStep);
  const receipt = await f.production.getLiteraryOperation(uid, {
    target,
    operationId: request.operationId,
  });
  assert.equal(receipt.state, 'confirmed');
  assert.equal(receipt.kind, 'progress');
  assert.equal(receipt.id, detail.artifact.noteId);
  const snapshot = structuredClone([...f.records]);
  assert.deepEqual(await f.api.saveLiteraryProgressNote(uid, request), saved);
  assert.deepEqual([...f.records], snapshot);
  const list = await f.api.listLiteraryProgressArtifacts(uid, { target, stage: 'planning' });
  assert.equal(list.items[0].note.blockerCount, 1);
  assert.equal(JSON.stringify(list).includes(request.notes.nextStep), false);
});
test('source change and another saved note reject stale drafts without silent rebase or lost blockers', async () => {
  const f = fixture(),
    detail = await f.detail();
  await f.api.saveLiteraryProgressNote(uid, input(detail));
  const before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.saveLiteraryProgressNote(uid, input(detail, 'progress-operation-002')),
    { code: 'failed-precondition' },
  );
  assert.deepEqual([...f.records], before);
  f.metadata.set('books/book/literaryPlans/brief', { updatedAt: 5000 });
  const changed = await f.detail();
  assert.equal(changed.note.artifactChanged, true);
  await assert.rejects(
    f.api.saveLiteraryProgressNote(uid, {
      ...input(changed, 'progress-operation-003'),
      sourceToken: detail.artifact.sourceToken,
    }),
    { code: 'failed-precondition' },
  );
  const saved = await f.api.saveLiteraryProgressNote(uid, input(changed, 'progress-operation-004'));
  assert.equal(saved.revision, 2);
  assert.equal((await f.detail()).note.artifactChanged, false);
});
test('native artifact recreation starts another checkpoint; old book receipts cannot cross book recreation', async () => {
  const f = fixture(),
    first = await f.detail(),
    request = input(first);
  await f.api.saveLiteraryProgressNote(uid, request);
  f.metadata.set('books/book/literaryPlans/brief', { createdAt: 9999 });
  const recreated = await f.detail();
  assert.notEqual(recreated.artifact.noteId, first.artifact.noteId);
  assert.equal(recreated.note.revision, 0);
  assert.deepEqual(recreated.note.blockers, []);
  f.metadata.set('books/book', { createdAt: 99999 });
  await assert.rejects(f.api.saveLiteraryProgressNote(uid, request), {
    code: 'failed-precondition',
  });
  await assert.rejects(
    f.production.getLiteraryOperation(uid, { target, operationId: request.operationId }),
    { code: 'failed-precondition' },
  );
});
test('pagination is bounded and unsupported stages, foreign projects and oversized notes fail before writing', async () => {
  const f = fixture();
  for (let i = 0; i < 25; i++)
    f.records.set('books/book/literaryPlans/plan-' + String(i).padStart(2, '0'), {
      revision: 1,
      plan: { kind: 'chapterBrief', status: 'working' },
    });
  const first = await f.api.listLiteraryProgressArtifacts(uid, { target, stage: 'planning' });
  assert.equal(first.items.length, 12);
  assert.ok(first.nextAfterId);
  const next = await f.api.listLiteraryProgressArtifacts(uid, {
    target,
    stage: 'planning',
    afterId: first.nextAfterId,
  });
  assert.equal(next.items.length, 12);
  assert.notEqual(first.items[0].id, next.items[0].id);
  await assert.rejects(
    f.api.listLiteraryProgressArtifacts('other', { target, stage: 'planning' }),
    { code: 'not-found' },
  );
  await assert.rejects(f.api.listLiteraryProgressArtifacts(uid, { target, stage: 'published' }), {
    code: 'invalid-argument',
  });
  const detail = await f.detail(),
    before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.saveLiteraryProgressNote(uid, {
      ...input(detail),
      notes: { blockers: [], nextStep: 'x'.repeat(4001) },
    }),
    { code: 'invalid-argument' },
  );
  assert.deepEqual([...f.records], before);
});
