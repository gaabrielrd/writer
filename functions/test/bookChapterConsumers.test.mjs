import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { chapterConsumersFixture } from './helpers/bookChapterConsumersFixture.mjs';
import { createBookChapterCleanupHandler } from '../src/bookChapterCleanup.mjs';
import { createBookBackupReadService } from '../src/bookBackupRead.mjs';
import { createBookBackupResourceService } from '../src/bookBackupResourceRead.mjs';
import { countVisibleWords } from '../src/visibleWordCount.mjs';
const A = '\ufeff' + 'ação 🌙\n'.repeat(50000),
  B = '<p>' + 'y'.repeat(650000) + '</p>',
  chapter = 'books/book/chapters/chapter',
  receipt = 'users/author/chapterChats/book/chapters/chapter/receipts/consumer-accept01';
async function fixture(content = A) {
  const f = adventureImportDb({ nativeUpdates: true }),
    api = await chapterConsumersFixture(f.db);
  await api.save(content, 'consumer-save-initial01');
  let counted;
  do {
    counted = await api.api.prepareWorkWordCount('author', {
      target: api.target,
      operationId: 'consumer-count-setup01',
      limit: 25,
    });
  } while (!counted.complete);
  return {
    ...f,
    ...api,
    body: 'books/book/bookTextBodies/' + f.records.get(chapter).contentStorage.bodyId,
  };
}
const request = (f, sourceHash, extra = {}) => ({
  requestId: 'consumer-accept01',
  messageId: 'message',
  expectedHash: sourceHash,
  sourceHash,
  after: B,
  ...extra,
});
async function collect(f, path = f.body) {
  const snapshot = await f.db.doc(path).get(),
    data = snapshot.data(),
    e = {
      params: { bookId: 'book', bodyId: path.split('/').at(-1) },
      data: { after: { ...snapshot, data: () => structuredClone(data) } },
    },
    handler = createBookChapterCleanupHandler({ db: f.db });
  for (let i = 0; i < 5; i++) if ((await handler(e))?.complete) return;
  assert.fail('Cleanup did not finish');
}
test('chat applies complete external content with ledger, body pins, credit and receipt atomically; replay never writes again', async () => {
  const f = await fixture(),
    sourceHash = await f.seedSuggestion(),
    op = request(f, sourceHash),
    result = await f.apply(op);
  assert.equal(result.content, B);
  assert.equal(result.credits, 4);
  assert.equal((await f.source()).content, B);
  assert.equal(f.records.get('books/book').wordCount, countVisibleWords(B));
  assert.equal(f.records.get('books/book/workProgress/current').wordCount, countVisibleWords(B));
  assert.equal(f.records.get(f.body).pins, 0);
  const current = 'books/book/bookTextBodies/' + f.records.get(chapter).contentStorage.bodyId;
  assert.equal(f.records.get(current).pins, 1);
  assert.equal(f.records.get(receipt).result.content, B);
  const before = structuredClone([...f.records]);
  assert.deepEqual(await f.apply(op), result);
  assert.deepEqual([...f.records], before);
  await collect(f);
  assert.equal(f.records.has(f.body), false);
  assert.equal((await f.source()).content, B);
  await f.save('Later author text', 'consumer-save-later01');
  const later = structuredClone([...f.records]);
  assert.deepEqual(await f.apply(op), result);
  assert.equal((await f.source()).content, 'Later author text');
  assert.deepEqual([...f.records], later);
});
test('BYOK application is free and preserves an existing version pin while replacing the chapter generation', async () => {
  const f = await fixture(),
    { version } = await f.capture('consumer-keep-version01'),
    hash = await f.seedSuggestion('byok');
  await f.apply(request(f, hash));
  assert.equal(f.records.get('users/author').credits, 5);
  assert.equal(f.records.get(f.body).pins, 1);
  assert.equal(await f.readVersion(version.id), A);
});
for (const mode of ['stale', 'corrupt', 'credits', 'deleting', 'foreign', 'oversize', 'unsafe'])
  test(
    'chat rejects ' + mode + ' without text, references, billing or receipt changes',
    async () => {
      const f = await fixture(),
        hash = await f.seedSuggestion(),
        op = request(f, hash);
      if (mode === 'stale') op.expectedHash = f.hash('other');
      if (mode === 'corrupt') f.records.delete(f.body + '/chunks/000000000000000');
      if (mode === 'credits') f.records.get('users/author').credits = 0;
      if (mode === 'deleting') f.records.get(chapter).deleting = true;
      if (mode === 'foreign') f.records.get('books/book').authorId = 'other';
      if (mode === 'oversize') op.after = 'x'.repeat(800001);
      if (mode === 'unsafe') op.after = '<script>bad</script>';
      const before = structuredClone([...f.records]);
      await assert.rejects(() => f.apply(op));
      assert.deepEqual([...f.records], before);
    },
  );
test('receipt failure rolls back new body, released pin, ledger, paid flag and credit together', async () => {
  const f = await fixture(),
    hash = await f.seedSuggestion(),
    op = request(f, hash),
    before = structuredClone([...f.records]),
    run = f.db.runTransaction.bind(f.db);
  let interrupt = true;
  f.db.runTransaction = (callback) =>
    run((tx) =>
      callback({
        ...tx,
        set: (ref, ...args) => {
          if (interrupt && ref.path === receipt) throw new Error('receipt-interrupted');
          return tx.set(ref, ...args);
        },
      }),
    );
  await assert.rejects(() => f.apply(op), /receipt-interrupted/);
  assert.deepEqual([...f.records], before);
  interrupt = false;
  await f.apply(op);
  assert.equal(f.records.get('users/author').credits, 4);
  assert.equal(f.records.get(f.body).pins, 0);
});
test('conversion copies all logical text, clears physical pointer, preserves frozen source after collection and keeps composition canonical', async () => {
  const f = await fixture(),
    detail = await f.scenes.getSceneGroup('author', { target: f.target, parentId: 'chapter' });
  assert.equal(detail.legacy.content, A);
  assert.equal(detail.legacy.hash, f.hash(A));
  const op = await f.conversion('consumer-convert-main01'),
    result = await f.scenes.convertChapterToScenes('author', op),
    id = result.scene.id;
  assert.equal(f.records.get('books/book/scenes/' + id + '/body/current').content, A);
  assert.equal(f.records.get(chapter).content, A);
  assert.equal(f.records.get(chapter).contentStorage, null);
  const source = f.records.get('books/book/sceneSources/chapter');
  assert.equal(source.original.content, A);
  assert.equal('contentStorage' in source.original, false);
  assert.equal(source.hash, f.hash(A));
  assert.equal(f.records.get(f.body).pins, 0);
  assert.equal(f.records.get('books/book').wordCount, countVisibleWords(A));
  assert.equal(f.records.get('books/book/workProgress/current').wordCount, countVisibleWords(A));
  await collect(f);
  assert.equal(f.records.has(f.body), false);
  assert.equal(
    (await f.scenes.getSceneGroup('author', { target: f.target, parentId: 'chapter' })).legacy,
    null,
  );
  await f.scenes.updateScene('author', {
    target: f.target,
    sceneId: id,
    operationId: 'consumer-edit-scene01',
    expectedRevision: 1,
    patch: { content: 'Scene edit' },
  });
  const group = await f.scenes.getSceneGroup('author', { target: f.target, parentId: 'chapter' }),
    assembly = await f.scenes.readSceneAssembly('author', {
      target: f.target,
      parentId: 'chapter',
      expectedAssemblyRevision: group.group.assemblyRevision,
      limit: 1,
    });
  assert.equal(assembly.items[0].content, 'Scene edit');
  const sources = await f.scenes.listSceneSources('author', {
    target: f.target,
    expectedProjectRevision: assembly.projectRevision,
    limit: 1,
  });
  assert.equal(sources.items[0].content, A);
  assert.equal('contentStorage' in sources.items[0].original, false);
  const backup = createBookBackupReadService({ db: f.db }),
    resources = createBookBackupResourceService({ db: f.db }),
    start = await backup.getBookBackupSource('author', { bookId: 'book' }),
    scope = { bookId: 'book', kind: 'scene-source', sourceToken: start.sourceToken },
    item = (await resources.listBookBackupResources('author', { ...scope, limit: 1 })).items[0],
    parts = [];
  let count;
  for (let index = 0; count === undefined || index < count; index++) {
    const p = await resources.readBookBackupResource('author', { ...scope, ...item, index });
    count = p.chunkCount;
    parts.push(Buffer.from(p.chunkBase64, 'base64'));
  }
  const decoded = JSON.parse(Buffer.concat(parts).toString('utf8'));
  assert.equal(decoded.data.original.content, A);
  assert.equal('contentStorage' in decoded.data.original, false);
  const before = structuredClone([...f.records]);
  await f.scenes.convertChapterToScenes('author', op);
  assert.deepEqual([...f.records], before);
});
test('conversion releases only chapter pin and manual chapter versions remain readable without flattening scenes', async () => {
  const f = await fixture(),
    { version } = await f.capture('consumer-convert-version01');
  await f.scenes.convertChapterToScenes('author', await f.conversion('consumer-convert-keep01'));
  assert.equal(f.records.get(f.body).pins, 1);
  assert.equal(await f.readVersion(version.id), A);
});
for (const mode of ['over-budget', 'escaped-envelope', 'stale', 'missing-body'])
  test(
    'conversion ' + mode + ' refuses the entire transaction without truncating legacy text',
    async () => {
      const content =
          mode === 'over-budget'
            ? 'x'.repeat(800001)
            : mode === 'escaped-envelope'
              ? '\n'.repeat(600000)
              : A,
        f = await fixture(content),
        op = await f.conversion('consumer-convert-reject01');
      if (mode === 'stale') op.expectedSourceVersion = f.hash('old');
      if (mode === 'missing-body') f.records.delete(f.body + '/chunks/000000000000000');
      const before = structuredClone([...f.records]);
      await assert.rejects(() => f.scenes.convertChapterToScenes('author', op));
      assert.deepEqual([...f.records], before);
      assert.equal(f.records.get(chapter).content, null);
    },
  );
test('mixed group deletion drops its pin once, permits metadata recovery after collection and preserves manual versions', async () => {
  for (const keepVersion of [false, true]) {
    const f = await fixture(),
      version = keepVersion ? (await f.capture('consumer-group-keep01')).version : null,
      op = {
        target: f.target,
        operationId: 'consumer-group-delete01',
        groups: [{ id: 'chapter', expectedUpdatedAt: f.records.get(chapter).updatedAt }],
        limit: 1,
      };
    // Stop after the initial atomic revocation, before the cleanup transaction.
    const run = f.db.runTransaction.bind(f.db);
    let calls = 0;
    f.db.runTransaction = (callback) => {
      calls++;
      if (calls === 2) return Promise.reject(new Error('cleanup-interrupted'));
      return run(callback);
    };
    await assert.rejects(() => f.scenes.deleteSceneGroups('author', op), /cleanup-interrupted/);
    f.db.runTransaction = run;
    assert.equal(f.records.get(f.body).pins, keepVersion ? 1 : 0);
    if (!keepVersion) await collect(f);
    const detail = await f.scenes.getSceneGroup('author', {
      target: f.target,
      parentId: 'chapter',
    });
    assert.equal(detail.group.deleting, true);
    assert.equal(detail.legacy, null);
    let done;
    for (let i = 0; i < 10; i++) {
      done = await f.scenes.deleteSceneGroups('author', op);
      if (done.complete) break;
    }
    assert.equal(done.complete, true);
    assert.equal(f.records.has(chapter), false);
    if (keepVersion) {
      assert.equal(f.records.get(f.body).pins, 1);
      assert.equal(await f.readVersion(version.id), A);
    }
  }
});

test('backup of a composed chapter hydrates its external frozen field without changing the canonical mode', async () => {
  const f = await fixture(),
    stored = f.records.get(chapter);
  stored.contentMode = 'scenes';
  stored.assemblyRevision = 3;
  stored.structureRevision = 2;
  const api = createBookBackupReadService({ db: f.db }),
    start = await api.getBookBackupSource('author', { bookId: 'book' }),
    scope = { bookId: 'book', kind: 'chapter', sourceToken: start.sourceToken },
    item = (await api.listBookBackupStructure('author', scope)).items[0],
    parts = [];
  let count;
  for (let index = 0; count === undefined || index < count; index++) {
    const p = await api.readBookBackupStructure('author', { ...scope, ...item, index });
    count = p.chunkCount;
    parts.push(Buffer.from(p.chunkBase64, 'base64'));
  }
  const decoded = JSON.parse(Buffer.concat(parts).toString('utf8'));
  assert.equal(decoded.content, A);
  assert.equal(decoded.contentMode, 'scenes');
  assert.equal('contentStorage' in decoded, false);
  assert.equal(f.records.get(chapter).content, null);
  assert.equal(f.records.get(f.body).pins, 1);
});
