// @vitest-environment node
import { it, expect } from 'vitest';
import { streamAdventureArchive } from '../index';
import { inventoryFixture } from './adventureInventoryFixture.mjs';
import {
  transferFixture,
  upload,
  verify,
  cleanup,
  mutation,
} from '../../../../functions/test/helpers/adventureRestoreTransferFixture.mjs';
import { createAdventureRestoreTransferService } from '../../../../functions/src/adventureRestoreTransfer.mjs';
import { createAdventureRestoreStore } from '../../../../functions/src/adventureRestoreStore.mjs';
import { createAdventureContentHash } from '../../../../functions/src/adventureContentHash.mjs';
import { validateAdventureBackupContent } from '../../../../functions/src/adventureBackupContent.mjs';
import { requestHash, digest } from '../../../../functions/src/adventureRestoreContracts.mjs';
async function nativeBytes(count = 1) {
  const f = await inventoryFixture(count),
    parts = [];
  for await (const part of streamAdventureArchive(f.id, f.scanApi, { guard: () => {} }))
    parts.push(part);
  return { bytes: Buffer.concat(parts), id: f.id };
}
async function ready(bytes) {
  const f = transferFixture(bytes);
  return { f, p: await verify(f, await upload(f), 16) };
}
const req = (p) => mutation(p, 'persistent-validate-' + String(p.checkpoint).padStart(8, '0'));
async function advance(f, p) {
  return (
    await createAdventureRestoreTransferService({
      db: f.db,
      now: () => 2000,
    }).advanceAdventureRestoreValidation(f.uid, req(p))
  ).progress;
}
async function finish(f, p) {
  let n = 0;
  while (['bytes-verified', 'validating'].includes(p.state)) {
    if (++n > 5000) throw Error('unbounded');
    p = await advance(f, p);
  }
  return p;
}
it('validates native content through a new coordinator every step and matches the independent reader without activating a project', async () => {
  const native = await nativeBytes(53),
    { f, p } = await ready(native.bytes),
    result = await finish(f, p),
    entries = new Map(),
    independent = await validateAdventureBackupContent(
      { size: native.bytes.length, read: async (o, n) => native.bytes.subarray(o, o + n) },
      {
        hash: await createAdventureContentHash(),
        index: {
          get: async (k) => entries.get(JSON.stringify(k)),
          add: async (k, v) => entries.set(JSON.stringify(k), v),
        },
      },
    );
  expect(result.state).toBe('content-verified');
  expect(result.validation.summary).toEqual({
    sourceAdventureId: native.id,
    totals: independent.totals,
    warnings: independent.warnings,
  });
  expect(result.validation.recheckedChunks).toBe(result.checkedChunks);
  expect(f.records.get('adventures/' + result.adventureId)).not.toHaveProperty('ownerId');
  expect(JSON.stringify(result)).not.toMatch(
    /PRIVATE_|stateJSON|snapshot|hashState|birthOperationId/,
  );
  const statePaths = [...f.records.keys()].filter((k) =>
    k.startsWith(f.path + '/validationState/'),
  );
  expect(statePaths).toEqual([f.path + '/validationState/current']);
  expect(f.records.get(f.path).validation.indexEntries).toBe(
    [...f.records.keys()].filter((k) => k.startsWith(f.path + '/validationIndex/')).length,
  );
  const cancelled = await cleanup(f, result, 50);
  expect(cancelled.state).toBe('cancelled');
  expect([...f.records.keys()].filter((k) => k.startsWith(f.path + '/'))).toEqual([]);
}, 60000);
it('same operation replay and two workers preserve one checkpoint and historic progress is current', async () => {
  const { bytes } = await nativeBytes(),
    { f, p } = await ready(bytes),
    input = req(p);
  const results = await Promise.all([
    f.api.advanceAdventureRestoreValidation(f.uid, input),
    f.api.advanceAdventureRestoreValidation(f.uid, input),
  ]);
  expect(results[0]).toEqual(results[1]);
  const later = await advance(f, results[0].progress),
    replay = await f.api.advanceAdventureRestoreValidation(f.uid, input);
  expect(replay.receipt).toEqual(results[0].receipt);
  expect(replay.progress).toEqual(later);
  expect(f.records.get(f.path).checkpoint).toBe(p.checkpoint + 2);
});
it('rejects actual invalid bytes with a closed typed result and cleans a rejection before any snapshot', async () => {
  const { f, p } = await ready(Buffer.alloc(128, 65)),
    result = await advance(f, p);
  expect(result.state).toBe('content-rejected');
  expect(result.validation.failure).toBe('invalid-format');
  expect(f.records.get(f.path).validation.stateCreated).toBe(false);
  expect((await cleanup(f, result)).state).toBe('cancelled');
});
it('storage and I/O faults never become content rejection; exact retry is possible', async () => {
  const { bytes } = await nativeBytes(),
    { f, p } = await ready(bytes),
    run = f.db.runTransaction.bind(f.db);
  let calls = 0;
  f.db.runTransaction = (cb) => {
    if (++calls === 2) return Promise.reject(Error('read unavailable'));
    return run(cb);
  };
  await expect(advance(f, p)).rejects.toThrow('read unavailable');
  expect(f.records.get(f.path).state).toBe('bytes-verified');
  f.db.runTransaction = run;
  expect((await advance(f, p)).state).toBe('validating');
});
it('recreated or modified current state is rejected before parsing and does not reset the machine', async () => {
  const { bytes } = await nativeBytes();
  for (const mode of ['changed', 'recreated']) {
    const { f, p } = await ready(bytes),
      next = await advance(f, p),
      path = f.path + '/validationState/current';
    if (mode === 'changed') {
      f.records.get(path).stateJSON = '{}';
    } else f.metadata.set(path, { createdAt: 3000, updatedAt: 3000 });
    await expect(advance(f, next)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(f.records.get(f.path).checkpoint).toBe(next.checkpoint);
  }
});
it('legacy jobs refuse orphan validation namespaces rather than adopting or certifying cleanup', async () => {
  const { bytes } = await nativeBytes();
  for (const name of ['validationIndex', 'validationItems', 'validationState']) {
    const { f, p } = await ready(bytes);
    f.records.set(f.path + '/' + name + '/orphan', { schemaVersion: 1 });
    await expect(advance(f, p)).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(cleanup(f, p, 50)).rejects.toMatchObject({ code: 'failed-precondition' });
  }
});
it('cancellation winning while preparing a step prevents all stale state and index writes', async () => {
  const { bytes } = await nativeBytes(),
    { f, p } = await ready(bytes),
    run = f.db.runTransaction.bind(f.db);
  let calls = 0,
    cancelled;
  f.db.runTransaction = async (cb) => {
    if (++calls === 2) {
      f.db.runTransaction = run;
      cancelled = (
        await f.api.cancelAdventureRestore(f.uid, mutation(p, 'validation-cancel-race-0001'))
      ).progress;
    }
    return run(cb);
  };
  await expect(advance(f, p)).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(f.records.get(f.path).state).toBe('cancelling');
  expect(f.records.has(f.path + '/validationState/current')).toBe(false);
  expect((await cleanup(f, cancelled)).state).toBe('cancelled');
});
it('read-only progress and resolver never echo private fields from a tampered receipt', async () => {
  const { bytes } = await nativeBytes(),
    { f, p } = await ready(bytes),
    input = req(p);
  const accepted = await f.api.advanceAdventureRestoreValidation(f.uid, input),
    path = 'users/' + f.uid + '/adventureRestoreOperations/' + input.operationId;
  f.records.get(path).receipt.validation.stateJSON = 'PRIVATE_PROSE';
  await expect(
    f.api.getAdventureRestore(f.uid, { restoreId: p.restoreId, jobToken: p.jobToken }),
  ).rejects.toBeDefined();
  await expect(
    f.api.resolveAdventureRestoreOperation(f.uid, {
      restoreId: p.restoreId,
      jobToken: p.jobToken,
      operationId: input.operationId,
      requestHash: requestHash('advanceAdventureRestoreValidation', input),
    }),
  ).rejects.toBeDefined();
  expect(accepted.progress.validation).not.toHaveProperty('stateJSON');
});
it('immutable index and item effects are accounted for and an altered index blocks its next use', async () => {
  const { bytes } = await nativeBytes(),
    { f, p } = await ready(bytes);
  let current = p;
  while (!f.records.get(f.path).validation?.indexEntries) current = await advance(f, current);
  const path = [...f.records.keys()].find(
    (k) => k.startsWith(f.path + '/validationIndex/') && f.records.get(k).key[0] === 'root',
  );
  expect(path).toBeDefined();
  f.records.get(path).valueJSON = '{}';
  const store = createAdventureRestoreStore({ db: f.db });
  await expect(
    f.db.runTransaction(async (tx) => {
      const loaded = await store.load(tx, f.uid, f.id, p.jobToken);
      return store.artifact(tx, loaded, 'validationIndex', await tx.get(f.db.doc(path)));
    }),
  ).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(f.records.get(f.path).validation.snapshot.hash).toMatch(/^[a-f0-9]{64}$/);
  expect(digest(f.records.get(f.path + '/validationState/current'))).toBe(
    f.records.get(f.path).validation.snapshot.hash,
  );
});

it('rechecks all chunks and proof membership in bounded batches before granting only content verification', async () => {
  const { imageDataFixture } = await import('./adventureImageFixture.mjs'),
    source = await imageDataFixture(1, true, 1200000),
    parts = [];
  for await (const part of streamAdventureArchive(source.id, source.scanApi, { guard: () => {} }))
    parts.push(part);
  const { f, p } = await ready(Buffer.concat(parts));
  expect(p.checkedChunks).toBeGreaterThan(16);
  let current = p;
  while (current.validation?.phase !== 'recheck') current = await advance(f, current);
  const statePath = f.path + '/validationState/current',
    stateBefore = structuredClone(f.records.get(statePath));
  const first = await advance(f, current);
  expect(first.state).toBe('validating');
  expect(first.validation.recheckedChunks).toBe(16);
  expect(f.records.get(statePath)).toEqual(stateBefore);
  let result = first;
  while (result.state === 'validating') {
    const prior = result;
    result = await advance(f, prior);
    expect(
      result.validation.recheckedChunks - prior.validation.recheckedChunks,
    ).toBeLessThanOrEqual(16);
  }
  expect(result.state).toBe('content-verified');
  expect(result.validation.recheckedChunks).toBe(p.checkedChunks);
  expect(result.validation.summary.totals.imageAssets).toBe(2);
  expect(result.validation.summary.totals.imageBytes).toBe(2400000);
  expect(f.records.get(statePath)).toEqual(stateBefore);
  expect((await cleanup(f, result, 50)).state).toBe('cancelled');
}, 60000);
it('extra proof membership after valid semantic EOF prevents the final certificate', async () => {
  const { bytes } = await nativeBytes(),
    { f, p } = await ready(bytes);
  let current = p;
  while (current.validation?.phase !== 'recheck') current = await advance(f, current);
  f.records.set(f.path + '/integrityProofs/zz-extra', { index: current.checkedChunks });
  await expect(advance(f, current)).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(f.records.get(f.path).state).toBe('validating');
  expect(f.records.get(f.path).validation.recheckedChunks).toBe(0);
});
it('missing expected indexed item cannot be certified as cleaned even if all remaining documents are valid', async () => {
  const { bytes } = await nativeBytes(),
    { f, p } = await ready(bytes);
  let current = p;
  while (!f.records.get(f.path).validation?.items) current = await advance(f, current);
  const path = [...f.records.keys()].find((k) => k.startsWith(f.path + '/validationItems/'));
  f.records.delete(path);
  await expect(cleanup(f, current, 50)).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(f.records.get(f.path).state).toBe('cancelling');
});

it('resolves an exact operation committed by a rival while its own source read is delayed', async () => {
  const { bytes } = await nativeBytes(),
    { f, p } = await ready(bytes);
  let release, entered;
  const gate = new Promise((resolve) => {
      release = resolve;
    }),
    waiting = new Promise((resolve) => {
      entered = resolve;
    });
  let calls = 0;
  const db = {
    ...f.db,
    async runTransaction(cb) {
      if (++calls === 2) {
        entered();
        await gate;
      }
      return f.db.runTransaction(cb);
    },
  };
  const slow = createAdventureRestoreTransferService({ db }).advanceAdventureRestoreValidation(
    f.uid,
    req(p),
  );
  await waiting;
  const winner = await f.api.advanceAdventureRestoreValidation(f.uid, req(p));
  release();
  expect(await slow).toEqual(winner);
  expect(f.records.get(f.path).checkpoint).toBe(p.checkpoint + 1);
});
