import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { studioDb } from './helpers/studioDb.mjs';
import { prepareLiteraryImpactCaptureFixture } from './helpers/literaryImpactCaptureFixture.mjs';
import { createBookEditorialCaptureService } from '../src/bookEditorialCapture.mjs';
import { createBookEditorialRemapper } from '../src/bookEditorialRemap.mjs';
import { bookEditorialArtifactReferences } from '../src/bookEditorialProtocol.mjs';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const collections = {
  'impact-control': 'Controls',
  'impact-graph': 'Jobs',
  'impact-node': 'Nodes',
  'impact-link': 'Links',
  'impact-visit': 'Visits',
  'impact-witness': 'Witnesses',
  'impact-check': 'Checks',
};
async function fixture(options) {
  const f = studioDb({ sharedBirth: true }),
    reads = [],
    masks = [];
  f.records.set('books/book', {
    authorId: 'author',
    title: 'PRIVATE_CACHED_BOOK_TITLE',
    status: 'draft',
    createdAt: 1,
    updatedAt: 10,
    wordCount: 0,
  });
  f.records.set('users/author', { credits: 10 });
  f.records.set('books/book/chapters/chapter', {
    bookId: 'book',
    ownerId: 'author',
    title: 'PRIVATE_CACHED_CHAPTER_TITLE',
    order: 0,
    contentMode: 'legacy',
    content: '<p>PRIVATE_BODY</p>',
    updatedAt: 10,
  });
  const native = await prepareLiteraryImpactCaptureFixture(f.db, {
    ...options,
    sourceChapterId: 'chapter',
  });
  const db = {
    ...f.db,
    runTransaction: (callback) =>
      f.db.runTransaction((tx) =>
        callback({
          ...tx,
          get: (resource) => {
            if (resource.path) reads.push(resource.path);
            return tx.get(resource);
          },
          getAll: (...args) => {
            for (const ref of args)
              if (ref.path) masks.push({ path: ref.path, fields: args.at(-1).fieldMask });
            return tx.getAll(...args);
          },
        }),
      ),
  };
  const api = createBookEditorialCaptureService({ db });
  async function wire(family, id) {
    const source = await api.getBookEditorialCaptureSource('author', { bookId: 'book' });
    const base = {
      bookId: 'book',
      bookSourceToken: source.bookSourceToken,
      editorialSourceToken: source.editorialSourceToken,
    };
    let cursor;
    for (let step = 0; step < 100; step++) {
      const page = await api.listBookEditorialCaptureRecords('author', {
        ...base,
        family,
        limit: 50,
        ...(cursor ? { cursor } : {}),
      });
      assert.equal(JSON.stringify(page).includes('PRIVATE'), false);
      const item = page.items.find((item) => item.id === id);
      if (item) return { ...base, family, ...item };
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    assert.fail('Registro esperado não encontrado.');
  }
  const rows = (family) =>
    [...f.records]
      .filter(([path]) => path.startsWith('books/book/literaryImpact' + collections[family] + '/'))
      .map(([path, value]) => ({ path, id: path.split('/').at(-1), value }));
  return {
    ...f,
    ...native,
    api,
    wire,
    rows,
    reads,
    masks,
    controlPath: 'books/book/literaryImpactControls/' + native.jobId,
  };
}
async function read(f, family, id) {
  const wire = await f.wire(family, id),
    first = await f.api.readBookEditorialCaptureRecord('author', { ...wire, index: 0 });
  assert.equal(first.chunkCount, 1);
  const bytes = Buffer.from(first.chunkBase64, 'base64');
  assert.equal(hash(bytes), first.contentHash);
  await f.api.verifyBookEditorialCaptureRecord('author', {
    ...wire,
    projectionToken: first.projectionToken,
  });
  return { artifacts: JSON.parse(bytes.toString('utf8')).artifacts, first, wire };
}

test('native impact control preserves own source intent and historical counts without certifying semantics or publication', async () => {
  const f = await fixture(),
    before = structuredClone([...f.records]),
    value = await read(f, 'impact-control', f.jobId);
  assert.equal(value.artifacts[0].content.controlsDisabled, true);
  assert.equal(value.artifacts[0].content.process, 'impact');
  assert.equal(value.artifacts[0].content.counters.steps, f.records.get(f.controlPath).steps);
  assert.ok(value.artifacts[1].content.sections.some((row) => row.text.includes('não certifica')));
  assert.deepEqual([...f.records], before);
});

test('complete native topology retains directional links and propagation witnesses by portable references', async () => {
  const f = await fixture(),
    artifacts = [];
  for (const family of Object.keys(collections))
    for (const row of f.rows(family)) artifacts.push(...(await read(f, family, row.id)).artifacts);
  const ids = new Set(artifacts.map((item) => item.id));
  assert.equal(ids.size, artifacts.length);
  assert.ok(f.rows('impact-link').length > 0);
  assert.ok(f.rows('impact-witness').length > 0);
  for (const item of artifacts)
    for (const ref of bookEditorialArtifactReferences(item, 'book'))
      if (ref.kind === 'artifact' && ref.state === 'recorded')
        assert.ok(ids.has(ref.id), 'Toda associação conferida deve ter seu artefato.');
  const serialized = JSON.stringify(artifacts);
  assert.equal(serialized.includes('PRIVATE_'), false);
});

test('graph counts and checks keep technical scope without creating manuscript quotations', async () => {
  const f = await fixture(),
    graph = await read(f, 'impact-graph', f.jobId);
  assert.equal(graph.artifacts[0].content.controlsDisabled, true);
  assert.ok(graph.artifacts[1].content.sections.some((row) => row.label === 'nodes'));
  const row = f.rows('impact-check')[0];
  assert.ok(row);
  const checked = await read(f, 'impact-check', row.id);
  assert.equal(checked.artifacts[0].content.claimedCoverage.scope, 'registered-dependencies');
  assert.deepEqual(checked.artifacts[0].content.findings, []);
  assert.equal(
    checked.artifacts.some((item) => item.kind === 'evidence'),
    false,
  );
});

test('wrong UID is checked before selecting control intent, census or graph payload', async () => {
  const f = await fixture({ finish: false });
  f.records.set(f.controlPath, { ...f.records.get(f.controlPath), uid: 'other' });
  f.masks.length = 0;
  const value = await read(f, 'impact-control', f.jobId);
  assert.equal(value.artifacts[0].availability.state, 'unavailable');
  assert.equal(
    f.masks
      .filter((row) => row.path === f.controlPath)
      .some((row) => row.fields.includes('intent') || row.fields.includes('census')),
    false,
  );
});

test('changed native registry closes derived rows before node/check bodies are selected while own intent remains', async () => {
  const f = await fixture(),
    node = f.rows('impact-node')[0];
  f.records.set(f.controlPath, { ...f.records.get(f.controlPath), registryToken: 'f'.repeat(64) });
  f.masks.length = 0;
  const value = await read(f, 'impact-node', node.id);
  assert.equal(value.artifacts[0].availability.state, 'unavailable');
  assert.equal(
    f.masks.filter((row) => row.path === node.path).some((row) => row.fields.includes('node')),
    false,
  );
  const control = await read(f, 'impact-control', f.jobId);
  assert.equal(control.artifacts[0].availability.state, 'included');
});

test('recreated graph closes derived topology even if source fence and stored fields match', async () => {
  const f = await fixture(),
    node = f.rows('impact-node')[0];
  f.metadata.set('books/book/literaryImpactJobs/' + f.jobId, {
    createdAt: 99999,
    updatedAt: 100000,
  });
  assert.equal(
    (await read(f, 'impact-node', node.id)).artifacts[0].availability.state,
    'unavailable',
  );
});

test('recreated control or root cannot authorize retained graph rows', async () => {
  const f = await fixture({ finish: false });
  f.metadata.set(f.controlPath, { createdAt: 99999, updatedAt: 100000 });
  assert.equal(
    (await read(f, 'impact-control', f.jobId)).artifacts[0].availability.state,
    'unavailable',
  );
  f.metadata.delete(f.controlPath);
  f.metadata.set('books/book', { createdAt: 99999, updatedAt: 100000 });
  assert.equal(
    (await read(f, 'impact-control', f.jobId)).artifacts[0].availability.state,
    'unavailable',
  );
});

test('invalid native topology keys cannot become apparently valid portable graph records', async () => {
  const f = await fixture(),
    node = f.rows('impact-node')[0];
  f.records.set(node.path, { ...node.value, nodeKey: 'different-key' });
  await assert.rejects(read(f, 'impact-node', node.id), { code: 'failed-precondition' });
});

test('witness preserves the same source across both visits instead of accepting an unrelated origin', async () => {
  const f = await fixture(),
    row = f.rows('impact-witness')[0];
  assert.ok(row);
  f.records.set(row.path, { ...row.value, sourceKey: 'f'.repeat(64) });
  await assert.rejects(read(f, 'impact-witness', row.id), { code: 'failed-precondition' });
});

test('native operational proof fields and private labels never appear in portable records', async () => {
  const f = await fixture(),
    node = f.rows('impact-node')[0],
    checked = f.rows('impact-check')[0];
  const value = [
    ...(await read(f, 'impact-control', f.jobId)).artifacts,
    ...(await read(f, 'impact-node', node.id)).artifacts,
    ...(await read(f, 'impact-check', checked.id)).artifacts,
  ];
  const serialized = JSON.stringify(value);
  for (const key of [
    'uid',
    'controlBirth',
    'graphBirth',
    'bookBirth',
    'sourceFence',
    'scopeToken',
    'originToken',
    'proofHash',
    'recordToken',
    'registryToken',
    'cursor',
    'startFingerprint',
  ])
    assert.equal(serialized.includes('"' + key + '"'), false);
  assert.equal(serialized.includes('PRIVATE_'), false);
});

test('final reauthorization rejects a changed actor after initial metadata capture', async () => {
  const f = await fixture({ finish: false }),
    value = await read(f, 'impact-control', f.jobId);
  f.records.set('books/book', { ...f.records.get('books/book'), authorId: 'other' });
  await assert.rejects(
    f.api.verifyBookEditorialCaptureRecord('author', {
      ...value.wire,
      projectionToken: value.first.projectionToken,
    }),
  );
});

test('remapped graph is private history with disabled execution and no implied source grants', async () => {
  const f = await fixture({ finish: false }),
    value = await read(f, 'impact-control', f.jobId);
  const map = createBookEditorialRemapper({
    sourceBookId: 'book',
    bookId: 'copy',
    hashBytes: hash,
    mapResource: (kind, id) => 'copy-' + kind + '-' + id,
  });
  const restored = map.artifact(value.artifacts[0]);
  assert.equal(restored.restoration.execution, 'disabled');
  assert.equal(restored.restoration.publication, 'private');
  assert.equal(restored.record.content.controlsDisabled, true);
  assert.equal(restored.record.content.nextAction, null);
});
