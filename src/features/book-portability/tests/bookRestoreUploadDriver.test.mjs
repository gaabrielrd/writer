// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { webcrypto, createHash } from 'node:crypto';
import { File } from 'node:buffer';
import { createBookRestoreUploadDriver } from '../services/bookRestoreUploadDriver.ts';
import { bookRestoreChunkOperationId } from '../services/bookRestoreTransferContracts.ts';
import { adventureImportDb } from '../../../../functions/test/helpers/adventureImportDb.mjs';
import { createBookRestoreUploadService } from '../../../../functions/src/bookRestoreUpload.mjs';
import { invokeBookRestoreCallable } from '../../../../functions/src/bookRestoreCallable.mjs';
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());
async function fixture(bytes = new Uint8Array(2 * 65536 + 3).fill(65)) {
  const base = adventureImportDb({ nativeUpdates: true }),
    ownerId = 'author',
    id = 'upload-driver-0001',
    source = {
      format: 'writer-book-archive',
      version: 1,
      byteLength: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    },
    reviewHash = 'b'.repeat(64),
    factory = () => createBookRestoreUploadService({ db: base.db, now: () => 1000 }),
    started = await factory().startBookRestore(ownerId, { operationId: id, source, reviewHash }),
    p = started.progress,
    identity = { ownerId, restoreId: id, bookId: p.bookId, jobToken: p.jobToken },
    f = {
      ...base,
      factory,
      id,
      p,
      identity,
      source,
      reviewHash,
      file: new File([bytes], 'backup.writer'),
      calls: [],
      keys: 0,
      alive: true,
      bytes,
    };
  const call = async (method, input) =>
    JSON.parse(JSON.stringify(await invokeBookRestoreCallable(factory(), method, ownerId, input)));
  f.api = {
    start: (input) => call('startBookRestore', input),
    get: (input) => call('getBookRestore', input),
    resolveStart: (input) => call('resolveBookRestoreStart', input),
    append: async (input) => {
      f.calls.push(structuredClone(input));
      return call('appendBookRestoreChunk', input);
    },
  };
  f.authorize = async (context, guard) => {
    f.keys++;
    guard();
    const raw = await factory().getBookRestoreRecoveryKey(ownerId, {
      restoreId: id,
      jobToken: p.jobToken,
      reviewHash,
      expectedKeyId: context.keyId,
    });
    const bytes = Buffer.from(raw.keyBase64, 'base64');
    try {
      return {
        ...context,
        key: await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']),
      };
    } finally {
      bytes.fill(0);
    }
  };
  f.guard = () => {
    if (!f.alive) throw Error('Inactive');
  };
  f.make = (extra) =>
    createBookRestoreUploadDriver({
      identity,
      source,
      reviewHash,
      file: f.file,
      api: f.api,
      authorize: f.authorize,
      check: f.guard,
      ...extra,
    });
  return f;
}
it('real append uses original index checkpoints after key creation, exact bounded bytes and deterministic operation IDs', async () => {
  const f = await fixture(),
    driver = f.make(),
    total = Math.ceil(f.bytes.length / 65536);
  for (let index = 0; index < total; index++) {
    const step = await driver.step();
    expect(step.kind).toBe('confirmed');
    expect(step.index).toBe(index);
    expect(step.progress.uploadedChunks).toBe(index + 1);
    const request = f.calls.at(-1);
    expect(request.expectedCheckpoint).toBe(index);
    expect(request.operationId).toBe(bookRestoreChunkOperationId(f.identity, index));
    expect(Buffer.from(request.chunkBase64, 'base64')).toEqual(
      Buffer.from(f.bytes.subarray(index * 65536, (index + 1) * 65536)),
    );
    expect(request.chunkBase64.length).toBeLessThanOrEqual(4 * Math.ceil(65536 / 3));
  }
  expect(f.keys).toBe(1);
  const again = await driver.step();
  expect(again.kind).toBe('paused');
  expect(again.progress.state).toBe('uploaded');
  expect(f.calls).toHaveLength(total);
  expect(f.records.has('books/' + f.p.bookId)).toBe(false);
  const verified = await f.factory().advanceBookRestoreIntegrity('author', {
    restoreId: f.id,
    jobToken: f.p.jobToken,
    operationId: 'upload-verify-sha-0001',
    expectedCheckpoint: total,
    limit: 16,
  });
  expect(verified.progress.state).toBe('bytes-verified');
});
it('lost append response retains the same input in memory and confirms it before selecting another chunk', async () => {
  const f = await fixture(),
    append = f.api.append;
  let lost = false;
  f.api.append = async (input) => {
    const answer = await append(input);
    if (!lost) {
      lost = true;
      throw Error('Lost after commit');
    }
    return answer;
  };
  const driver = f.make();
  await expect(driver.step()).rejects.toThrow('Lost after commit');
  const first = structuredClone(f.calls[0]),
    result = await driver.step();
  expect(result.index).toBe(0);
  expect(f.calls[1]).toEqual(first);
  expect(result.progress.uploadedChunks).toBe(1);
  expect(f.records.has('books/' + f.p.bookId)).toBe(false);
});
it('a new driver rehashes the same file and resumes from an authoritative committed prefix without duplicate bytes', async () => {
  const f = await fixture(),
    append = f.api.append;
  f.api.append = async (input) => {
    await append(input);
    throw Error('Lost');
  };
  await expect(f.make().step()).rejects.toThrow('Lost');
  f.api.append = append;
  const result = await f.make().step();
  expect(result.index).toBe(1);
  expect(result.progress.uploadedChunks).toBe(2);
  expect(f.calls[0].index).toBe(0);
  expect(f.calls[1].index).toBe(1);
});
it('two delayed copies of the same original chunk confirm one real append using the same fingerprint', async () => {
  const f = await fixture(),
    append = f.api.append;
  let release, entered;
  const waiting = new Promise((resolve) => {
    entered = resolve;
  });
  let hold = true;
  f.api.append = async (input) => {
    if (hold) {
      hold = false;
      entered();
      await new Promise((resolve) => {
        release = resolve;
      });
    }
    return append(input);
  };
  const first = f.make().step();
  await waiting;
  const second = await f.make().step();
  release();
  const delayed = await first;
  expect(second.index).toBe(0);
  expect(delayed.index).toBe(0);
  expect(f.calls).toHaveLength(2);
  expect(f.calls[0]).toEqual(f.calls[1]);
  expect((await f.factory().getBookRestore('author', { restoreId: f.id })).uploadedChunks).toBe(1);
});
it('wrong size/hash, source scope or review cannot request a key or send file bytes', async () => {
  const f = await fixture(),
    wrong = new Uint8Array(f.bytes);
  wrong[0] ^= 1;
  await expect(f.make({ file: new File([wrong], 'wrong.writer') }).step()).rejects.toThrow();
  expect(f.keys).toBe(0);
  expect(f.calls).toHaveLength(0);
  expect(() => f.make({ file: new File([wrong.subarray(1)], 'short.writer') })).toThrow();
  await expect(f.make({ reviewHash: 'c'.repeat(64) }).step()).rejects.toThrow();
  await expect(f.make({ identity: { ...f.identity, bookId: 'other' } }).step()).rejects.toThrow();
  expect(f.keys).toBe(0);
  expect(f.calls).toHaveLength(0);
});
it('an altered append receipt cannot clear the in-memory request or select a later chunk', async () => {
  const f = await fixture(),
    append = f.api.append;
  let bad = true;
  f.api.append = async (input) => {
    const result = await append(input);
    if (bad) result.receipt.sequence = 9;
    return result;
  };
  const driver = f.make();
  await expect(driver.step()).rejects.toThrow();
  bad = false;
  const result = await driver.step();
  expect(result.index).toBe(0);
  expect(f.calls[0]).toEqual(f.calls[1]);
});
it('account invalidation after the native append commit cannot publish progress; a new authorized driver resumes the prefix', async () => {
  const f = await fixture(),
    append = f.api.append;
  f.api.append = async (input) => {
    const result = await append(input);
    f.alive = false;
    return result;
  };
  await expect(f.make().step()).rejects.toThrow('Inactive');
  f.alive = true;
  f.api.append = append;
  const next = await f.make().step();
  expect(next.index).toBe(1);
  expect(next.progress.uploadedChunks).toBe(2);
});
it('cancellation while an append is waiting prevents the late append from materializing bytes', async () => {
  const f = await fixture(),
    append = f.api.append;
  let release, entered;
  const waiting = new Promise((resolve) => {
    entered = resolve;
  });
  f.api.append = async (input) => {
    entered();
    await new Promise((resolve) => {
      release = resolve;
    });
    return append(input);
  };
  const delayed = f.make().step();
  await waiting;
  await f.factory().cancelBookRestore('author', {
    restoreId: f.id,
    jobToken: f.p.jobToken,
    operationId: 'upload-cancel-request-0001',
    expectedCheckpoint: 0,
  });
  release();
  await expect(delayed).rejects.toThrow();
  f.api.append = append;
  const result = await f.make().step();
  expect(result.kind).toBe('paused');
  expect(result.progress.state).toBe('cancelling');
  expect(result.progress.uploadedChunks).toBe(0);
  expect(f.records.has('books/' + f.p.bookId)).toBe(false);
});
