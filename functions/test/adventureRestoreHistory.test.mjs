import test from 'node:test';
import assert from 'node:assert/strict';
import { historyAdventureArchive } from './helpers/adventureRestoreHistoryArchiveFixture.mjs';
import { emptyAdventureArchive } from './helpers/adventureRestoreArchiveFixture.mjs';
import {
  historyReady,
  historyStep,
  historyFinish,
  historyRequest,
} from './helpers/adventureRestoreHistoryFixture.mjs';
import { cleanup, mutation } from './helpers/adventureRestoreTransferFixture.mjs';
import { reblockAdventureHistoryText } from '../src/adventureRestoreHistoryText.mjs';
import { adventureStageArtifactId } from '../src/adventureRestoreArtifacts.mjs';
import { readHistoryVersion, readHistoryChunk } from '../src/workHistoryContracts.mjs';
const root = (p) => 'adventures/' + p.adventureId;
async function pending(f, p) {
  while (!p.staging.historyPending) p = await historyStep(f, p);
  return p;
}
test('fixed byte frames are rebuilt as complete native UTF-8, keeping historical-only scenes absent', async () => {
  const { f, p } = await historyReady(await historyAdventureArchive()),
    end = await historyFinish(f, p),
    path = root(p),
    versions = [...f.records.keys()].filter((k) => k.startsWith(path + '/workVersions/'));
  assert.equal(versions.length, 1);
  const id = versions[0].split('/').at(-1),
    context = { target: { kind: 'adventure', id: p.adventureId }, path };
  const data = await f.db.runTransaction(async (tx) => {
    const header = await readHistoryVersion(tx, f.db, context, id),
      parts = [];
    for (let i = 0; i < header.chunkCount; i++)
      parts.push((await readHistoryChunk(tx, f.db, context, header, i)).content);
    return { header, parts };
  });
  assert.deepEqual(
    data.parts.map((v) => Buffer.byteLength(v)),
    [65535, 4],
  );
  assert.equal(data.parts.join(''), 'a'.repeat(65535) + '🌙');
  assert.equal(data.header.reason, 'manual');
  assert.equal(data.header.createdAt, 1000);
  assert.equal(data.header.wordCount, 1);
  assert.equal(end.staging.historySourceRecords, 3);
  assert.equal(end.staging.historyVersions, 1);
  assert.equal(end.staging.historyBytes, 65539);
  assert.equal(end.staging.historyBodies, 2);
  assert.equal(f.records.get(f.path + '/preparedRoot/current').value.historyRevision, 1);
  assert.deepEqual(f.records.get(f.path + '/preparedRoot/universe-candidate').origin, {
    kind: 'none',
  });
  assert.equal(
    f.records.get(f.path + '/preparedRoot/universe-candidate').pendingAuthorization,
    true,
  );
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith(path + '/scenes/')),
    false,
  );
  assert.equal(f.records.get(path).ownerId, undefined);
  assert.doesNotMatch(JSON.stringify(end), /tailBase64|rawCheckpoint|history-only|contentHash/);
  assert.equal((await cleanup(f, end, 50)).state, 'cancelled');
  assert.deepEqual(
    [...f.records.keys()].filter((k) => k.startsWith(path + '/') || k.startsWith(f.path + '/')),
    [],
  );
});
test('native version manifest is created only after the last verified text frame and progress survives a reload', async () => {
  const { f, p } = await historyReady(await historyAdventureArchive()),
    at = await pending(f, p),
    first = await historyStep(f, at);
  assert.equal(first.staging.historyPending, true);
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith(root(p) + '/workVersions/')),
    false,
  );
  const reloaded = await f.api.getAdventureRestore(f.uid, {
    restoreId: p.restoreId,
    jobToken: p.jobToken,
  });
  assert.equal(reloaded.checkpoint, first.checkpoint);
  const last = await historyStep(f, reloaded);
  assert.equal(last.staging.historyPending, false);
  assert.equal(last.staging.historyVersions, 1);
  assert.equal(
    [...f.records.keys()].filter((k) => k.startsWith(root(p) + '/workVersions/')).length,
    1,
  );
});
test('empty history and draft sections stay explicit and do not allocate text state or versions', async () => {
  const { f, p } = await historyReady(await emptyAdventureArchive()),
    end = await historyFinish(f, p);
  assert.deepEqual(
    [
      end.staging.historyVersions,
      end.staging.historyBodies,
      end.staging.drafts,
      end.staging.draftBodies,
    ],
    [0, 0, 0, 0],
  );
  assert.equal(f.records.has(f.path + '/preparedRoot/text-state'), false);
  assert.equal(f.records.has(f.path + '/preparedRoot/recovered-draft'), false);
  assert.equal((await cleanup(f, end, 2)).state, 'cancelled');
});
test('same raw operation and competing checkpoints are idempotent, preserving the confirmed UTF-8 prefix', async () => {
  const { f, p } = await historyReady(await historyAdventureArchive()),
    at = await pending(f, p),
    input = historyRequest(at),
    pair = await Promise.all([
      f.api.advanceAdventureRestoreHistory(f.uid, input),
      f.api.advanceAdventureRestoreHistory(f.uid, input),
    ]);
  assert.deepEqual(pair[0], pair[1]);
  const next = pair[0].progress,
    race = await Promise.allSettled([
      historyStep(f, next),
      f.api.advanceAdventureRestoreHistory(f.uid, {
        ...historyRequest(next),
        operationId: 'history-competitor-0001',
      }),
    ]);
  assert.equal(race.filter((v) => v.status === 'fulfilled').length, 1);
  const replay = await f.api.advanceAdventureRestoreHistory(f.uid, input);
  assert.equal(replay.progress.checkpoint, at.checkpoint + 2);
  assert.deepEqual(replay.receipt, pair[0].receipt);
});
test('a failed raw commit rolls back chunks, private prefix and receipt before exact retry', async () => {
  const { f, p } = await historyReady(await historyAdventureArchive()),
    at = await pending(f, p),
    run = f.db.runTransaction.bind(f.db),
    before = structuredClone([...f.records]);
  f.db.runTransaction = (cb) =>
    run((tx) =>
      cb({
        ...tx,
        update(ref, value) {
          if (ref.path === f.path) throw Error('history commit unavailable');
          return tx.update(ref, value);
        },
      }),
    );
  await assert.rejects(() => historyStep(f, at), /history commit unavailable/);
  assert.deepEqual([...f.records], before);
  f.db.runTransaction = run;
  assert.equal((await historyStep(f, at)).staging.historyBodies, 1);
});
test('changed private prefix, missing prefix and recreated journal never resume raw content or certify cleanup', async () => {
  for (const mode of ['changed', 'missing', 'journal']) {
    const { f, p } = await historyReady(await historyAdventureArchive()),
      at = await pending(f, p),
      target = f.path + '/preparedRoot/text-state';
    if (mode === 'changed')
      await f.db.runTransaction((tx) =>
        tx.update(f.db.doc(target), { tailBase64: 'Rk9SRUlHTg==' }),
      );
    else if (mode === 'missing') await f.db.runTransaction((tx) => tx.delete(f.db.doc(target)));
    else
      f.metadata.set(
        f.path +
          '/stagingArtifacts/' +
          adventureStageArtifactId({ scope: 'job', path: ['preparedRoot', 'text-state'] }),
        { createdAt: 9999, updatedAt: 9999 },
      );
    await assert.rejects(() => historyStep(f, at));
    assert.equal(f.records.get(f.path).checkpoint, at.checkpoint);
    await assert.rejects(() => cleanup(f, at, 50));
    assert.equal(f.records.get(f.path).state, 'cancelling');
  }
});
test('cancellation winning raw preparation fences every new native chunk', async () => {
  const { f, p } = await historyReady(await historyAdventureArchive()),
    at = await pending(f, p),
    run = f.db.runTransaction.bind(f.db);
  let calls = 0,
    cancelled;
  f.db.runTransaction = async (cb) => {
    if (++calls === 2) {
      f.db.runTransaction = run;
      cancelled = (
        await f.api.cancelAdventureRestore(f.uid, mutation(at, 'history-cancel-race-0001'))
      ).progress;
    }
    return run(cb);
  };
  await assert.rejects(() => historyStep(f, at));
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith(root(p) + '/workVersionBodies/')),
    false,
  );
  assert.equal((await cleanup(f, cancelled, 5)).state, 'cancelled');
});
test('streaming native reblocking preserves arbitrary Unicode and BOM with bounded tails, empty text and legal part counts', () => {
  for (const content of [
    '',
    '\uFEFF' + 'a'.repeat(65532) + '🌙',
    '<p>' + 'à 🌙 ação '.repeat(60000) + '</p>',
  ]) {
    const bytes = Buffer.from(content),
      chunks = [];
    let tail = '';
    for (let at = 0; at < Math.max(1, bytes.length); at += 65536) {
      const result = reblockAdventureHistoryText(
        tail,
        bytes.subarray(at, at + 65536),
        at + 65536 >= bytes.length,
        chunks.length,
      );
      chunks.push(...result.chunks);
      tail = result.tailBase64;
      assert.ok(Buffer.from(tail, 'base64').length < 65536);
      assert.ok(result.chunks.length <= 2);
    }
    assert.equal(tail, '');
    assert.equal(chunks.join(''), content);
    assert.ok(chunks.length <= Math.max(1, Math.ceil(bytes.length / 65533)));
    assert.ok(chunks.every((v) => Buffer.byteLength(v) <= 65536 && v.isWellFormed()));
  }
});

test('draft bodies are staged under an exclusive recovered-version identity while saved text stays unchanged', async () => {
  const { historyDraftAdventureArchive } =
    await import('./helpers/adventureRestoreHistoryDraftFixture.mjs');
  for (const content of ['', 'PRIVATE_DRAFT 🌙'.repeat(5000)]) {
    const { f, p } = await historyReady(
        await historyDraftAdventureArchive({ draftContent: content }),
      ),
      rootPath = root(p),
      saved = [...f.records].find(
        ([k]) => k.startsWith(rootPath + '/scenes/') && k.endsWith('/body/current'),
      );
    const before = structuredClone(saved[1]),
      end = await historyFinish(f, p),
      d = f.records.get(f.path + '/preparedRoot/recovered-draft'),
      parts = [...f.records]
        .filter(
          ([k, v]) => k.startsWith(rootPath + '/workVersionBodies/') && v.versionId === d.versionId,
        )
        .map(([, v]) => v)
        .sort((a, b) => a.index - b.index);
    assert.equal(parts.map((v) => v.content).join(''), content);
    assert.equal(d.state, 'pending-finalization');
    assert.equal(end.staging.drafts, 1);
    assert.equal(end.staging.draftBytes, Buffer.byteLength(content));
    assert.equal(f.records.has(rootPath + '/workVersions/' + d.versionId), false);
    assert.deepEqual(f.records.get(saved[0]), before);
    assert.equal((await cleanup(f, end, 50)).state, 'cancelled');
  }
});

test('a foreign native body cannot be adopted by the historical assembler or removed by cancellation', async () => {
  const { f, p } = await historyReady(await historyAdventureArchive()),
    at = await pending(f, p),
    state = f.records.get(f.path + '/preparedRoot/text-state');
  const { digest } = await import('../src/sceneContracts.mjs'),
    path = root(p) + '/workVersionBodies/' + digest({ versionId: state.versionId, index: 0 });
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), { content: 'FOREIGN' }));
  await assert.rejects(() => historyStep(f, at));
  assert.equal(f.records.get(f.path).checkpoint, at.checkpoint);
  await assert.rejects(() => cleanup(f, at, 50));
  assert.equal(f.records.get(path).content, 'FOREIGN');
});
test('automatic callback retry preserves source/native counts exactly once', async () => {
  const { f, p } = await historyReady(await historyAdventureArchive()),
    at = await pending(f, p),
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
              throw Error('RETRY_HISTORY');
            }
            return tx.update(ref, v);
          },
        }),
      );
    } catch (e) {
      if (e.message !== 'RETRY_HISTORY') throw e;
      return run(cb);
    }
  };
  const next = await historyStep(f, at);
  assert.equal(retried, true);
  assert.equal(next.checkpoint, at.checkpoint + 1);
  assert.equal(next.staging.textFrames, 1);
  assert.equal(next.staging.historyBodies, 1);
  assert.equal(next.staging.historyBytes, 65536);
});
test('history metadata and inputs remain closed across phases and malformed private text states are rejected', async () => {
  const { f, p } = await historyReady(await historyAdventureArchive()),
    prior = structuredClone(f.records.get(f.path).staging);
  f.records.get(f.path).staging.historyVersions = 0;
  await assert.rejects(
    () => f.api.getAdventureRestore(f.uid, { restoreId: p.restoreId, jobToken: p.jobToken }),
    { code: 'failed-precondition' },
  );
  f.records.get(f.path).staging = prior;
  await assert.rejects(
    () =>
      f.api.advanceAdventureRestoreHistory(f.uid, { ...historyRequest(p), rawCheckpoint: null }),
    { code: 'invalid-argument' },
  );
  await pending(f, p);
  const record = f.records.get(f.path),
    valid = structuredClone(record.staging);
  for (const patch of [
    { historyVersions: 999 },
    { historyUnits: 0 },
    { historyPending: false },
    { historyStartIndex: 0 },
  ]) {
    record.staging = { ...valid, ...patch };
    await assert.rejects(
      () => f.api.getAdventureRestore(f.uid, { restoreId: p.restoreId, jobToken: p.jobToken }),
      { code: 'failed-precondition' },
    );
  }
  record.staging = valid;
  const { validAdventureTextState } = await import('../src/adventureRestoreHistoryMeta.mjs'),
    state = f.records.get(f.path + '/preparedRoot/text-state');
  assert.equal(validAdventureTextState(state), true);
  for (const patch of [
    { header: null },
    { tailBase64: '@@@' },
    { rawCheckpoint: { done: false } },
    { done: true },
    { kind: 'book' },
  ])
    assert.equal(Boolean(validAdventureTextState({ ...state, ...patch })), false);
});
test('more than fifty raw frames resume with bounded state and cleanup pages', async () => {
  const content = 'a'.repeat(65535) + '🌙' + 'ação 🌙 '.repeat(400000),
    { f, p } = await historyReady(await historyAdventureArchive({ content })),
    end = await historyFinish(f, p);
  assert.ok(end.staging.textFrames > 50);
  assert.ok(
    Buffer.byteLength(JSON.stringify(f.records.get(f.path + '/preparedRoot/text-state'))) < 100000,
  );
  assert.equal(end.staging.historyBytes, Buffer.byteLength(content));
  const values = [...f.records]
    .filter(([k]) => k.startsWith(root(p) + '/workVersionBodies/'))
    .map(([, v]) => v)
    .sort((a, b) => a.index - b.index);
  assert.equal(values.map((v) => v.content).join(''), content);
  assert.equal((await cleanup(f, end, 7)).staging.cleanedArtifacts, end.staging.artifactCount);
});
