import test from 'node:test';
import assert from 'node:assert/strict';
import { historyDraftAdventureArchive } from './helpers/adventureRestoreHistoryDraftFixture.mjs';
import { historyAdventureArchive } from './helpers/adventureRestoreHistoryArchiveFixture.mjs';
import { historyReady, historyFinish } from './helpers/adventureRestoreHistoryFixture.mjs';
import { mutation, cleanup } from './helpers/adventureRestoreTransferFixture.mjs';
import { readHistoryVersion, readHistoryChunk } from '../src/workHistoryContracts.mjs';
import { adventureStageArtifactId } from '../src/adventureRestoreArtifacts.mjs';
import { digest } from '../src/sceneContracts.mjs';
async function ready(content = null) {
  const bytes =
    content === null
      ? await historyAdventureArchive()
      : await historyDraftAdventureArchive({ draftContent: content });
  const { f, p } = await historyReady(bytes);
  return { f, p: await historyFinish(f, p) };
}
const input = (p) => mutation(p, 'draft-finalize-' + String(p.checkpoint).padStart(8, '0'));
const finalize = async (f, p) =>
  (await f.api.finalizeAdventureRestoreDraft(f.uid, input(p))).progress;
const root = (p) => 'adventures/' + p.adventureId;
for (const [name, content, expected] of [
  ['empty', '', 0],
  ['equal to saved', '<p>PRIVATE_CORPO 🌙</p>', 1],
  ['word across parts', 'a'.repeat(65535) + 'b', 1],
  ['HTML across parts', '<p>visível</p><script>' + 'x'.repeat(65536) + '</script><p>fim</p>', 2],
  [
    'Markdown across parts',
    '# Título\n\n' + 'a'.repeat(65522) + '[liga](https://example.com)\n\nfim',
    3,
  ],
  ['BOM', '\uFEFFum dois 🌙', 2],
])
  test(
    'recovers ' + name + ' draft as one native version with global visible word count',
    async () => {
      const { f, p } = await ready(content),
        before = new Map(
          [...f.records].filter(
            ([k]) => k.startsWith(root(p) + '/') && k.endsWith('/body/current'),
          ),
        ),
        d = structuredClone(f.records.get(f.path + '/preparedRoot/recovered-draft')),
        end = await finalize(f, p),
        context = { target: { kind: 'adventure', id: p.adventureId }, path: root(p) };
      assert.equal(end.staging.phase, 'draft-ready');
      assert.equal(end.staging.draftOutcome, 'version');
      assert.equal(end.staging.draftWordCount, expected);
      assert.equal(end.staging.itemIndex, p.staging.itemIndex);
      const data = await f.db.runTransaction(async (tx) => {
        const version = await readHistoryVersion(tx, f.db, context, d.versionId),
          parts = [];
        for (let n = 0; n < version.chunkCount; n++)
          parts.push((await readHistoryChunk(tx, f.db, context, version, n)).content);
        return { version, content: parts.join('') };
      });
      assert.equal(data.content, content);
      assert.equal(data.version.wordCount, expected);
      assert.equal(data.version.reason, 'manual');
      assert.equal(data.version.label, 'Rascunho recuperado do backup');
      assert.equal(data.version.createdAt, d.savedAt);
      assert.equal(data.version.contentHash, digest(content));
      assert.equal(Object.hasOwn(data.version, 'draft'), false);
      assert.equal(f.records.get(f.path + '/preparedRoot/recovered-draft').state, 'finalized');
      assert.equal(
        f.records.get(f.path + '/preparedRoot/current').value.historyRevision,
        p.staging.historyVersions + 1,
      );
      assert.equal(
        [...f.records.keys()].filter((k) => k.startsWith(root(p) + '/workVersions/')).length,
        p.staging.historyVersions + 1,
      );
      for (const [k, v] of before) assert.deepEqual(f.records.get(k), v);
      assert.equal(f.records.get(root(p)).ownerId, undefined);
      assert.doesNotMatch(JSON.stringify(end), /PRIVATE_|sourceToken|contentHash/);
      const cancelled = await cleanup(f, end, 50);
      assert.equal(cancelled.staging.cleanedArtifacts, end.staging.artifactCount);
    },
  );
test('no draft advances explicitly without adding a version or changing the private root', async () => {
  const { f, p } = await ready(),
    before = structuredClone(f.records.get(f.path + '/preparedRoot/current')),
    end = await finalize(f, p);
  assert.equal(end.staging.draftOutcome, 'none');
  assert.equal(end.staging.draftWordCount, null);
  assert.equal(end.staging.artifactCount, p.staging.artifactCount);
  assert.deepEqual(f.records.get(f.path + '/preparedRoot/current'), before);
  assert.equal(f.records.has(f.path + '/preparedRoot/recovered-draft'), false);
  assert.equal((await cleanup(f, end, 50)).state, 'cancelled');
});
test('same operation and competing checkpoint create the recovered native manifest once', async () => {
  const { f, p } = await ready('um dois'),
    request = input(p),
    pair = await Promise.all([
      f.api.finalizeAdventureRestoreDraft(f.uid, request),
      f.api.finalizeAdventureRestoreDraft(f.uid, request),
    ]);
  assert.deepEqual(pair[0], pair[1]);
  assert.equal(pair[0].progress.staging.draftWordCount, 2);
  const replay = await f.api.finalizeAdventureRestoreDraft(f.uid, request);
  assert.deepEqual(replay, pair[0]);
  await assert.rejects(() =>
    f.api.finalizeAdventureRestoreDraft(f.uid, {
      ...request,
      operationId: 'draft-finalize-competitor-0001',
    }),
  );
  assert.equal(
    [...f.records.keys()].filter((k) => k.startsWith(root(p) + '/workVersions/')).length,
    p.staging.historyVersions + 1,
  );
});
test('failed final commit rolls back native header, descriptor, history revision and receipt, then exact retry succeeds', async () => {
  const { f, p } = await ready('um dois'),
    before = structuredClone([...f.records]),
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (cb) =>
    run((tx) =>
      cb({
        ...tx,
        update(ref, v) {
          if (ref.path === f.path) throw Error('draft finalize unavailable');
          return tx.update(ref, v);
        },
      }),
    );
  await assert.rejects(() => finalize(f, p), /draft finalize unavailable/);
  assert.deepEqual([...f.records], before);
  f.db.runTransaction = run;
  assert.equal((await finalize(f, p)).staging.draftWordCount, 2);
});
test('missing, changed, recreated part journals and foreign manifests are refused without adoption or cleanup certification', async () => {
  for (const mode of ['missing', 'changed', 'journal', 'foreign']) {
    const { f, p } = await ready('um dois'),
      d = f.records.get(f.path + '/preparedRoot/recovered-draft'),
      address = {
        scope: 'adventure',
        path: ['workVersionBodies', digest({ versionId: d.versionId, index: 0 })],
      },
      body = root(p) + '/' + address.path.join('/');
    if (mode === 'missing') await f.db.runTransaction((tx) => tx.delete(f.db.doc(body)));
    else if (mode === 'changed')
      await f.db.runTransaction((tx) => tx.update(f.db.doc(body), { content: 'FOREIGN' }));
    else if (mode === 'journal')
      f.metadata.set(f.path + '/stagingArtifacts/' + adventureStageArtifactId(address), {
        createdAt: 9999,
        updatedAt: 9999,
      });
    else
      await f.db.runTransaction((tx) =>
        tx.create(f.db.doc(root(p) + '/workVersions/' + d.versionId), { content: 'FOREIGN' }),
      );
    await assert.rejects(() => finalize(f, p));
    assert.equal(f.records.get(f.path).checkpoint, p.checkpoint);
    await assert.rejects(() => cleanup(f, p, 50));
    assert.equal(f.records.get(f.path).state, 'cancelling');
  }
});
test('a native part changed after counting is rejected by final metadata recheck', async () => {
  const { f, p } = await ready('um dois'),
    d = f.records.get(f.path + '/preparedRoot/recovered-draft'),
    body = root(p) + '/workVersionBodies/' + digest({ versionId: d.versionId, index: 0 }),
    request = input(p),
    run = f.db.runTransaction.bind(f.db);
  let reads = 0;
  f.db.runTransaction = (cb) =>
    run((tx) =>
      cb({
        ...tx,
        get: async (ref) => {
          const result = await tx.get(ref);
          if (
            ref.path === 'users/' + f.uid + '/adventureRestoreOperations/' + request.operationId &&
            ++reads === 2
          ) {
            f.records.get(body).content = 'FOREIGN_AFTER_COUNT';
            f.metadata.set(body, { ...f.metadata.get(body), updatedAt: 8888 });
          }
          return result;
        },
      }),
    );
  await assert.rejects(() => finalize(f, p));
  assert.equal(f.records.get(body).content, 'FOREIGN_AFTER_COUNT');
  assert.equal(f.records.has(root(p) + '/workVersions/' + d.versionId), false);
});
test('cancellation during preparation never creates the recovered manifest', async () => {
  const { f, p } = await ready('um dois'),
    run = f.db.runTransaction.bind(f.db);
  let calls = 0,
    cancelled;
  f.db.runTransaction = async (cb) => {
    if (++calls === 2) {
      f.db.runTransaction = run;
      cancelled = (
        await f.api.cancelAdventureRestore(f.uid, mutation(p, 'draft-finalize-cancel-0001'))
      ).progress;
    }
    return run(cb);
  };
  await assert.rejects(() => finalize(f, p));
  assert.equal((await cleanup(f, cancelled, 50)).state, 'cancelled');
});
test('automatic callback retry preserves a single version and history revision', async () => {
  const { f, p } = await ready('um dois'),
    run = f.db.runTransaction.bind(f.db);
  let retried = false;
  f.db.runTransaction = async (cb) => {
    try {
      return await run((tx) =>
        cb({
          ...tx,
          update(ref, v) {
            if (ref.path === f.path && !retried) {
              retried = true;
              throw Error('RETRY_DRAFT_FINALIZE');
            }
            return tx.update(ref, v);
          },
        }),
      );
    } catch (e) {
      if (e.message !== 'RETRY_DRAFT_FINALIZE') throw e;
      return run(cb);
    }
  };
  const next = await finalize(f, p);
  assert.equal(retried, true);
  assert.equal(next.staging.draftWordCount, 2);
  assert.equal(
    f.records.get(f.path + '/preparedRoot/current').value.historyRevision,
    p.staging.historyVersions + 1,
  );
});
test('finalization inputs and phase-specific metadata reject client counts or hidden outcomes', async () => {
  const { f, p } = await ready('um dois');
  await assert.rejects(
    () => f.api.finalizeAdventureRestoreDraft(f.uid, { ...input(p), wordCount: 0 }),
    { code: 'invalid-argument' },
  );
  f.records.get(f.path).staging.draftWordCount = 0;
  await assert.rejects(
    () => f.api.getAdventureRestore(f.uid, { restoreId: p.restoreId, jobToken: p.jobToken }),
    { code: 'failed-precondition' },
  );
  delete f.records.get(f.path).staging.draftWordCount;
  const end = await finalize(f, p),
    record = f.records.get(f.path),
    prior = structuredClone(record.staging);
  for (const patch of [
    { draftWordCount: null },
    { draftOutcome: 'none' },
    { draftWordCount: -1 },
  ]) {
    record.staging = { ...prior, ...patch };
    await assert.rejects(
      () => f.api.getAdventureRestore(f.uid, { restoreId: p.restoreId, jobToken: p.jobToken }),
      { code: 'failed-precondition' },
    );
  }
  record.staging = prior;
  assert.equal(
    (await f.api.getAdventureRestore(f.uid, { restoreId: p.restoreId, jobToken: p.jobToken }))
      .checkpoint,
    end.checkpoint,
  );
});
