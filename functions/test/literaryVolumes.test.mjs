import { createLiteraryIntegrationService } from '../src/literaryIntegration.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { workScope } from '../src/workProgressContracts.mjs';
import { createLiteraryPlanningService } from '../src/literaryPlanning.mjs';
import { captureLiteraryAIContext } from '../src/literaryAIContext.mjs';
import { createLiteraryAIService } from '../src/literaryAI.mjs';
import {
  captureLiteraryWritingSnapshot,
  literaryWritingIsCurrent,
  authorizeLiteraryWritingManifest,
} from '../src/literaryWritingContext.mjs';
import {
  normalizeLiteraryGenerationDependencies,
  captureLiteraryGenerationDependencies,
} from '../src/literaryGenerationDependencies.mjs';
import { createLiteraryImpactLinks } from '../src/literaryImpactLinks.mjs';
import { createLiteraryImpactSourceVerifier } from '../src/literaryImpactVerification.mjs';
import { literaryVolumeUnitId, readLiteraryVolumeUnitId } from '../src/literaryVolumeProtocol.mjs';
import { createScenesService } from '../src/scenes.mjs';
const target = { kind: 'book', id: 'book' };
function fixture() {
  const f = studioDb();
  f.records.set('books/book', {
    authorId: 'author',
    title: 'Volume atual',
    createdAt: 1,
    updatedAt: 10,
    status: 'draft',
    hasLiteraryResources: true,
    wordCount: 3,
  });
  f.records.set('books/book/chapters/same', {
    bookId: 'book',
    title: 'Capítulo local',
    order: 1,
    content: '<p>Texto local preservado.</p>',
    updatedAt: 10,
  });
  f.records.set('users/author', { credits: 7 });
  for (const id of ['volume-a', 'volume-b']) {
    f.records.set('books/' + id, {
      authorId: 'author',
      title: id === 'volume-a' ? 'O primeiro porto' : 'O segundo porto',
      createdAt: 1,
      updatedAt: 10,
      status: 'draft',
      wordCount: 5,
    });
    f.records.set('books/' + id + '/chapters/same', {
      bookId: id,
      title: 'A carta',
      order: 1,
      content: '<p>' + id + ' confirmou a entrega.</p>',
      updatedAt: 10,
    });
  }
  const planning = createLiteraryPlanningService({ db: f.db, now: () => 100 });
  const c = workScope(f.db, 'author', { target }, []);
  const refs = (bookId = 'volume-a', kind = 'chapter', extra = {}) =>
    planning.listLiteraryReferences('author', {
      target,
      kind: 'volumeUnit',
      sourceBookId: bookId,
      unitKind: kind,
      purpose: 'source',
      ...extra,
    });
  const draft = (references) => ({
    kind: 'seriesBridge',
    title: 'Passagem entre volumes',
    status: 'working',
    fields: { inherited: 'A entrega foi confirmada.', reserved: 'A irmã permanece uma reserva.' },
    references,
  });
  const save = (references) =>
    planning.saveLiteraryPlan('author', {
      target,
      id: 'bridge',
      operationId: 'volume-save-bridge-0001',
      expectedRevision: 0,
      plan: draft(references),
    });
  const context = (references) =>
    f.db.runTransaction((tx) =>
      captureLiteraryAIContext(tx, c, {
        plan: draft(references),
        sourcePlanIds: [],
        expectedRevision: 0,
      }),
    );
  return { ...f, planning, c, refs, draft, save, context };
}
test('owned source books and their units paginate without including another author or a deleting/current volume', async () => {
  const f = fixture();
  for (let index = 0; index < 57; index++)
    f.records.set('books/owned-' + String(index).padStart(3, '0'), {
      authorId: 'author',
      title: 'Volume ' + index,
    });
  f.records.set('books/foreign', { authorId: 'other', title: 'PRIVATE FOREIGN TITLE' });
  f.records.set('books/deleting', { authorId: 'author', title: 'Removed', deleting: true });
  const seen = [];
  let afterId = null;
  do {
    const page = await f.planning.listLiteraryVolumeBooks('author', { target, afterId, limit: 10 });
    seen.push(...page.items);
    afterId = page.nextAfterId;
  } while (afterId !== null);
  assert.equal(seen.length, 59);
  assert.equal(new Set(seen.map((x) => x.id)).size, 59);
  assert.equal(
    seen.some((x) => ['book', 'foreign', 'deleting'].includes(x.id)),
    false,
  );
  await assert.rejects(f.refs('foreign'), { code: 'not-found' });
  await assert.rejects(f.refs('volume-a', 'chapter', { purpose: 'subject' }), {
    code: 'invalid-argument',
  });
  await assert.rejects(f.refs('book'), { code: 'invalid-argument' });
  await assert.rejects(f.planning.listLiteraryVolumeBooks('other', { target }), {
    code: 'not-found',
  });
  for (let index = 0; index < 27; index++)
    f.records.set('books/volume-a/chapters/unit-' + index, {
      bookId: 'volume-a',
      title: 'Unidade ' + index,
      updatedAt: 10,
    });
  const page = await f.refs('volume-a', 'chapter', { limit: 10 });
  assert.equal(page.items.length, 10);
  assert.ok(page.nextAfterId);
  assert.equal(
    (await f.refs('volume-a', 'chapter', { limit: 10, afterId: page.nextAfterId })).items.length,
    10,
  );
});
test('cross-volume homonyms remain distinct, survive reordering, and the AI sees the exact selected native prose without replacing the local manuscript', async () => {
  const f = fixture();
  const a = (await f.refs()).items[0],
    b = (await f.refs('volume-b')).items[0];
  assert.notEqual(a.reference.id, b.reference.id);
  assert.deepEqual(readLiteraryVolumeUnitId(a.reference.id), {
    bookId: 'volume-a',
    kind: 'chapter',
    id: 'same',
  });
  const original = f.records.get('books/book/chapters/same').content;
  await f.save([a.reference, b.reference]);
  const snapshot = await f.context([a.reference, b.reference]);
  const documents = snapshot.documents.filter((x) => x.id.startsWith('volume-unit:'));
  assert.equal(documents.length, 2);
  assert.notEqual(documents[0].id, documents[1].id);
  assert.ok(documents.some((x) => x.text.includes('volume-a confirmou')));
  assert.ok(documents.some((x) => x.text.includes('volume-b confirmou')));
  assert.equal(snapshot.coverage.wholeBook, false);
  const dependencies = captureLiteraryGenerationDependencies(snapshot.proof);
  assert.deepEqual(normalizeLiteraryGenerationDependencies(dependencies), dependencies);
  assert.equal(f.records.get('books/book/chapters/same').content, original);
  assert.equal(f.records.get('users/author').credits, 7);
  await f.db.runTransaction(async (tx) =>
    tx.update(f.db.doc('books/volume-a/chapters/same'), { order: 7, updatedAt: 20 }),
  );
  const current = await f.planning.getLiteraryPlan('author', { target, id: 'bridge' });
  assert.equal(current.sources[0].available, true);
  assert.equal(current.sources[0].changed, true);
  assert.equal(current.sources[0].currentReference.id, a.reference.id);
  assert.equal(current.plan.references[0].revision, 10);
});
test('a source book recreated under the same ID, revoked owner, or deleted unit cannot lend its labels or body to the old reference', async () => {
  for (const mutation of ['recreated-book', 'revoked-owner', 'removed-unit', 'recreated-unit']) {
    const f = fixture(),
      ref = (await f.refs()).items[0].reference;
    await f.save([ref]);
    if (mutation === 'recreated-book') {
      const row = { ...f.records.get('books/volume-a') };
      await f.db.runTransaction(async (tx) => tx.delete(f.db.doc('books/volume-a')));
      await f.db.runTransaction(async (tx) => tx.create(f.db.doc('books/volume-a'), row));
    } else if (mutation === 'revoked-owner')
      await f.db.runTransaction(async (tx) =>
        tx.update(f.db.doc('books/volume-a'), { authorId: 'other' }),
      );
    else {
      const row = { ...f.records.get('books/volume-a/chapters/same') };
      await f.db.runTransaction(async (tx) => tx.delete(f.db.doc('books/volume-a/chapters/same')));
      if (mutation === 'recreated-unit')
        await f.db.runTransaction(async (tx) =>
          tx.create(f.db.doc('books/volume-a/chapters/same'), row),
        );
    }
    const view = (await f.planning.getLiteraryPlan('author', { target, id: 'bridge' })).sources[0];
    assert.equal(view.available, false, mutation);
    assert.equal(view.label, null);
    assert.equal(view.currentReference, null);
    await assert.rejects(f.context([ref]), { code: 'failed-precondition' });
  }
});
test('writing snapshots preserve source-book origin and invalidate when a volume unit changes or access is revoked', async () => {
  const f = fixture(),
    ref = (await f.refs()).items[0].reference;
  await f.save([ref]);
  const capture = () =>
    f.db.runTransaction((tx) =>
      captureLiteraryWritingSnapshot(
        tx,
        f.c,
        { kind: 'chapter', id: 'same' },
        { planIds: ['bridge'] },
      ),
    );
  const snapshot = await capture();
  assert.equal(snapshot.manifest.references[0].reference.scopeId, 'volume-a');
  assert.ok(snapshot.documents.some((x) => x.text.includes('volume-a confirmou')));
  assert.equal(
    await f.db.runTransaction((tx) => literaryWritingIsCurrent(tx, f.c, snapshot.manifest)),
    true,
  );
  await f.db.runTransaction(async (tx) =>
    tx.update(f.db.doc('books/volume-a/chapters/same'), {
      content: '<p>Uma alteração no volume anterior.</p>',
      updatedAt: 20,
    }),
  );
  assert.equal(
    await f.db.runTransaction((tx) => literaryWritingIsCurrent(tx, f.c, snapshot.manifest)),
    false,
  );
  await f.db.runTransaction(async (tx) =>
    tx.update(f.db.doc('books/volume-a'), { authorId: 'other' }),
  );
  await assert.rejects(
    f.db.runTransaction((tx) => authorizeLiteraryWritingManifest(tx, f.c, snapshot.manifest)),
    { code: 'permission-denied' },
  );
});
test('impact keeps the source unit in its own volume and verifies the captured proof without treating metadata as a manuscript read', async () => {
  const f = fixture(),
    ref = (await f.refs()).items[0].reference;
  const snapshot = await f.context([ref]);
  const graph = createLiteraryImpactLinks({ bookId: 'book' });
  const edge = graph
    .generation({
      id: 'generation',
      dependencies: captureLiteraryGenerationDependencies(snapshot.proof),
    })
    .find((x) => x.from.scopeId === 'volume-a');
  assert.equal(edge.from.kind, 'chapter');
  assert.equal(edge.from.id, 'same');
  const verify = () =>
    f.db.runTransaction(async (tx) =>
      (await createLiteraryImpactSourceVerifier(tx, f.c, { bookId: 'book' }))(edge),
    );
  const result = await verify();
  assert.equal(result.status, 'current');
  assert.equal(result.manuscriptRead, false);
  await f.db.runTransaction(async (tx) =>
    tx.update(f.db.doc('books/volume-a'), { authorId: 'other' }),
  );
  assert.equal((await verify()).status, 'unavailable');
});
test('a composed source chapter requires its native scenes, rather than substituting a saved conversion body', async () => {
  const f = fixture(),
    scenes = createScenesService({ db: f.db, now: () => 100 });
  const group = await scenes.createSceneGroup('author', {
    target: { kind: 'book', id: 'volume-a' },
    operationId: 'volume-scene-group-0001',
    title: 'Capítulo composto',
  });
  const created = await scenes.createScene('author', {
    target: { kind: 'book', id: 'volume-a' },
    parentId: group.id,
    operationId: 'volume-native-scene-0001',
    title: 'A assinatura',
    content: '<p>Texto canônico da assinatura.</p>',
  });
  const chapter = (await f.refs()).items.find(
    (x) => readLiteraryVolumeUnitId(x.reference.id).id === group.id,
  );
  await assert.rejects(f.context([chapter.reference]), { code: 'failed-precondition' });
  const scene = (await f.refs('volume-a', 'scene')).items.find(
    (x) => readLiteraryVolumeUnitId(x.reference.id).id === created.scene.id,
  );
  assert.ok(
    (await f.context([scene.reference])).documents.some((x) =>
      x.text.includes('Texto canônico da assinatura.'),
    ),
  );
});
test('cross-volume identifiers reject inconsistent scope, subject role and unsupported domains before generation', async () => {
  const f = fixture(),
    ref = (await f.refs()).items[0].reference;
  for (const bad of [
    { ...ref, scopeId: 'volume-b' },
    { ...ref, purpose: 'subject' },
    { ...ref, id: '["volume-a","localLore","secret"]' },
    { ...ref, id: '["volume-a","chapter","../private"]' },
    { ...ref, id: 'x'.repeat(20001) },
  ])
    await assert.rejects(f.save([bad]), { code: 'invalid-argument' });
  assert.equal(f.records.has('books/book/literaryPlans/bridge'), false);
  assert.equal(literaryVolumeUnitId({ bookId: 'volume-a', kind: 'chapter', id: 'same' }), ref.id);
});
test('revoking a source volume while the provider is pending prevents exposing or accepting the late proposal', async () => {
  const f = fixture(),
    ref = (await f.refs()).items[0].reference;
  let release, entered;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const api = createLiteraryAIService({
    db: f.db,
    now: () => 100,
    generator: async () => {
      entered();
      return pending;
    },
  });
  const input = {
    target,
    operationId: 'volume-held-proposal-0001',
    mode: 'audit',
    expectedRevision: 0,
    sourcePlanIds: [],
    instruction: 'Confronte as fontes.',
    plan: f.draft([ref]),
  };
  const running = api.startLiteraryProposal('author', input);
  await started;
  await f.db.runTransaction(async (tx) =>
    tx.update(f.db.doc('books/volume-a'), { authorId: 'other' }),
  );
  release({
    plan: { title: 'Passagem entre volumes', fields: {} },
    rationale: 'Conferir.',
    findings: [],
  });
  const result = await running;
  assert.equal(f.records.get('books/book/literaryGenerations/' + input.operationId).state, 'stale');
  assert.equal((await api.startLiteraryProposal('author', input)).state, 'stale');
  assert.notEqual(result.state, 'done');
  assert.equal('result' in result, false);
  const current = await api.getLiteraryProposal('author', {
    target,
    operationId: input.operationId,
  });
  assert.notEqual(current.state, 'done');
  assert.equal('result' in current, false);
  assert.equal(f.records.get('users/author').credits, 7);
});

test('integration indexes keep the source-volume scope rather than reinterpreting a homonymous local unit', async () => {
  const f = fixture(),
    ref = (await f.refs()).items[0].reference;
  await f.save([ref]);
  const integration = createLiteraryIntegrationService({
    db: f.db,
    now: () => 200,
    generator: async (input) =>
      input.scope.phase === 'synthesis'
        ? { complete: true, report: 'Síntese', findings: [], conclusions: [] }
        : { complete: true, report: 'Leitura', findings: [], matrix: [] },
  });
  const command = { target, jobId: 'volume-integration-index-0001' };
  await integration.startLiteraryIntegration('author', {
    ...command,
    level: 'book',
    planIds: ['bridge'],
    instruction: 'Confronte o estado herdado.',
  });
  let result;
  for (let step = 0; step < 150; step++) {
    result = await integration.advanceLiteraryIntegration('author', command);
    if (result.state === 'done') break;
    assert.ok(!['attention', 'stale', 'canceled'].includes(result.state));
  }
  assert.equal(result.state, 'done');
  const stored = [...f.records.entries()].find(
    ([path, value]) =>
      path.startsWith('books/book/literaryIntegrationSourceLinks/') &&
      value.target.kind === 'volumeUnit',
  )[1];
  assert.equal(stored.target.scopeId, 'volume-a');
  assert.equal(stored.target.id, ref.id);
  const graph = createLiteraryImpactLinks({ bookId: 'book' });
  const edges = graph.integrationSource({ id: 'source', ...stored });
  assert.deepEqual(edges[0].from, {
    kind: 'chapter',
    id: 'same',
    scopeKind: 'book',
    scopeId: 'volume-a',
  });
});
