import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createLiteraryAutocompleteService } from '../src/literaryAutocomplete.mjs';
import { createLiteraryProseService } from '../src/literaryProse.mjs';
import { createScenesService } from '../src/scenes.mjs';
import { workScope, digest } from '../src/workProgressContracts.mjs';
import { literaryApplicationIndexId } from '../src/literaryApplicationIndex.mjs';
import { readLiteraryImpactBookInventoryPage } from '../src/literaryImpactInventory.mjs';
import { verifyLiteraryImpactInventoryLink } from '../src/literaryImpactRecordVerification.mjs';
import { literaryImpactLinkKey } from '../src/literaryImpactProtocol.mjs';
const target = { kind: 'book', id: 'book' },
  before = '<p>Uma carta chegou.</p>',
  after = '<p>Uma carta chegou. Ela abriu.</p>';
async function fixture(kind = 'autocomplete') {
  const f = studioDb();
  f.records.set('books/book', {
    authorId: 'author',
    title: 'PRIVATE BOOK TITLE',
    createdAt: 1,
    updatedAt: 100,
    wordCount: 3,
  });
  f.records.set('users/author', { credits: 5 });
  let api, resource, proposal;
  if (kind === 'autocomplete') {
    f.records.set('books/book/chapters/chapter', {
      bookId: 'book',
      title: 'PRIVATE CHAPTER TITLE',
      content: before,
      wordCount: 3,
      createdAt: 1,
      updatedAt: 100,
    });
    api = createLiteraryAutocompleteService({
      db: f.db,
      now: () => 300,
      generator: async () => ({ text: 'Ela abriu.' }),
    });
    await api.prepareLiteraryAutocomplete('author', {
      target,
      requestId: 'literary-request-0001',
      chapterId: 'chapter',
      beforeHash: digest(before),
      textBeforeCursor: 'Uma carta chegou.',
    });
    resource = { kind: 'chapter', id: 'chapter' };
    proposal = {
      target,
      requestId: 'literary-request-0001',
      operationId: 'literary-accept-0001',
      after,
    };
  } else {
    const scenes = createScenesService({ db: f.db, now: () => 200 });
    const chapter = await scenes.createSceneGroup('author', {
      target,
      operationId: 'make-chapter-000001',
      title: 'PRIVATE CHAPTER',
    });
    const scene = await scenes.createScene('author', {
      target,
      operationId: 'make-scene-000001',
      parentId: chapter.id,
      title: 'PRIVATE SCENE',
      content: before,
    });
    api = createLiteraryProseService({
      db: f.db,
      now: () => 300,
      generator: async () => ({
        text: 'Ela decidiu sair.',
        complete: true,
        rationale: 'Mudança local.',
        findings: [],
      }),
    });
    const info = await api.getLiteraryProseSourceInfo('author', {
      target,
      chapterId: chapter.id,
      sceneId: scene.scene.id,
    });
    await api.startLiteraryProse('author', {
      target,
      requestId: 'literary-request-0001',
      chapterId: chapter.id,
      sceneId: scene.scene.id,
      mode: 'reviseScene',
      segment: 0,
      instruction: 'PRIVATE INSTRUCTION',
      expectedSourceToken: info.sourceToken,
    });
    resource = { kind: 'scene', id: scene.scene.id };
    proposal = { target, requestId: 'literary-request-0001', operationId: 'literary-accept-0001' };
  }
  const c = workScope(f.db, 'author', { target }, []),
    indexId = literaryApplicationIndexId(c, kind, 'literary-accept-0001'),
    indexPath = 'books/book/literaryApplications/' + indexId;
  const apply = () =>
    api[kind === 'prose' ? 'applyLiteraryProse' : 'applyLiteraryAutocomplete']('author', proposal);
  const inventory = () =>
    f.db.runTransaction((tx) =>
      readLiteraryImpactBookInventoryPage(tx, c, {
        bookId: 'book',
        collection: 'literaryApplications',
        recordId: indexId,
      }),
    );
  const verify = (item, link) =>
    f.db.runTransaction((tx) =>
      verifyLiteraryImpactInventoryLink(tx, c, {
        bookId: 'book',
        collection: 'literaryApplications',
        recordId: indexId,
        recordToken: item.recordToken,
        linkId: digest(literaryImpactLinkKey(link)),
      }),
    );
  return { ...f, c, api, kind, resource, apply, inventory, verify, indexId, indexPath };
}
for (const kind of ['prose', 'autocomplete'])
  test(
    'accepted ' +
      kind +
      ' creates a private historical association with native receipt and one debit',
    async () => {
      const f = await fixture(kind),
        receipt = await f.apply(),
        clock = f.records.get('books/book').literaryDependencyRevision;
      assert.equal(f.records.get('users/author').credits, 4);
      const index = f.records.get(f.indexPath);
      assert.equal(index.source.kind, kind);
      assert.equal(index.destination.kind, f.resource.kind);
      assert.equal(index.historical, true);
      assert.equal(JSON.stringify(index).includes('PRIVATE'), false);
      assert.equal(JSON.stringify(index).includes('Ela decidiu sair.'), false);
      assert.deepEqual(await f.apply(), receipt);
      assert.equal(f.records.get('users/author').credits, 4);
      assert.equal(f.records.get('books/book').literaryDependencyRevision, clock);
      const item = (await f.inventory()).items[0],
        link = item.links.find((value) => value.capture?.scheme === 'application-source');
      assert.equal(link.relation, 'target');
      assert.equal(link.to.id, f.resource.id);
      const proof = await f.verify(item, link);
      assert.equal(proof.status, 'current');
      assert.equal(proof.historicalApplication, true);
      assert.equal(proof.currentManuscriptEquivalence, 'not-checked');
      assert.equal(proof.byteIntegrityChecked, false);
    },
  );
test('native expiration can remove a proposal while its closed dependency metadata remains traceable', async () => {
  const f = await fixture();
  await f.apply();
  f.records.delete('books/book/literaryAutocompleteRequests/literary-request-0001');
  const item = (await f.inventory()).items[0],
    link = item.links.find((value) => value.capture?.scheme === 'application-source');
  const proof = await f.verify(item, link);
  assert.equal(proof.status, 'preserved');
  assert.equal(proof.liveSourceAvailable, false);
  assert.equal(proof.sourceRepresentation, 'preserved-metadata');
  assert.equal(proof.manuscriptRead, false);
  assert.ok(item.links.some((value) => value.from.kind === 'personaBinding'));
  assert.ok(item.links.some((value) => value.capture?.scheme === 'content-hash'));
  assert.equal(JSON.stringify(item).includes(after), false);
});
test('an edit after acceptance is not equated to the accepted proposal; a recreated destination is excluded', async () => {
  const f = await fixture();
  await f.apply();
  await f.db.runTransaction(async (tx) => {
    const ref = f.db.doc('books/book/chapters/chapter');
    await tx.get(ref);
    tx.update(ref, { content: '<p>New manuscript.</p>' });
  });
  const item = (await f.inventory()).items[0],
    link = item.links.find((value) => value.capture?.scheme === 'application-source');
  const proof = await f.verify(item, link);
  assert.equal(proof.status, 'current');
  assert.equal(proof.currentManuscriptEquivalence, 'not-checked');
  f.metadata.set('books/book/chapters/chapter', { createdAt: 9999 });
  const recreated = (await f.inventory()).items[0];
  assert.deepEqual(recreated.links, []);
  assert.deepEqual(recreated.issues, ['application-destination-unavailable-or-recreated']);
});
test('receipt tampering or recreation of the source cannot be confirmed through the historical pointer', async () => {
  const f = await fixture();
  await f.apply();
  const item = (await f.inventory()).items[0],
    link = item.links.find((value) => value.capture?.scheme === 'application-source');
  f.metadata.set('books/book/literaryAutocompleteRequests/literary-request-0001', {
    createdAt: 9999,
  });
  assert.equal((await f.verify(item, link)).status, 'recreated');
  f.records.get('books/book/literaryAutocompleteApplications/literary-accept-0001').afterHash =
    'f'.repeat(64);
  assert.deepEqual((await f.inventory()).items[0].links, []);
});
test('index collision aborts before manuscript, credits, or confirmation are changed', async () => {
  const f = await fixture();
  f.records.set(f.indexPath, { unknown: true });
  await assert.rejects(f.apply(), { code: 'already-exists' });
  assert.equal(f.records.get('users/author').credits, 5);
  assert.equal(f.records.get('books/book/chapters/chapter').content, before);
  assert.equal(
    f.records.has('books/book/literaryAutocompleteApplications/literary-accept-0001'),
    false,
  );
  assert.equal(
    f.records.get('books/book/literaryAutocompleteRequests/literary-request-0001').state,
    'ready',
  );
});
test('cancel receipt changes the topology clock once and never creates an accepted edge', async () => {
  const f = await fixture(),
    beforeClock = f.records.get('books/book').literaryDependencyRevision;
  const input = { target, requestId: 'literary-request-0001', operationId: 'cancel-accept-000001' };
  await f.api.abandonLiteraryAutocompleteApplication('author', input);
  assert.equal(f.records.get('books/book').literaryDependencyRevision, beforeClock + 1);
  await f.api.abandonLiteraryAutocompleteApplication('author', input);
  assert.equal(f.records.get('books/book').literaryDependencyRevision, beforeClock + 1);
  assert.equal(
    [...f.records.keys()].some((key) => key.startsWith('books/book/literaryApplications/')),
    false,
  );
});
