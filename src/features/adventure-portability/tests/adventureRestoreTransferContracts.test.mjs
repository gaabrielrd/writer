// @vitest-environment node
import { it, expect } from 'vitest';
import {
  requestHash,
  startInput,
  targetId,
} from '../../../../functions/src/adventureRestoreContracts.mjs';
import {
  readAdventureRestoreStartIntent,
  readAdventureRestoreSourceDescriptor,
  adventureRestoreStartRequest,
  adventureRestoreStartFingerprint,
  expectedAdventureRestoreTarget,
  adventureRestoreChunkOperationId,
  readAdventureRestoreChunkRequest,
} from '../services/adventureRestoreTransferContracts.ts';
import {
  readAdventureRestoreStartOutcome,
  readAdventureRestoreTransferJob,
  readAdventureRestoreTransferPage,
} from '../services/adventureRestoreTransferJob.ts';
import {
  createAdventureRestoreBootstrapRecord,
  readAdventureRestoreBootstrapRecord,
} from '../services/adventureRestoreBootstrapStore.ts';
import { harness, uploadHarness } from './adventureTransferHarness.mjs';
it('fingerprint/target match the real server domain and preserve canonical source metadata', async () => {
  const f = harness(),
    intent = readAdventureRestoreStartIntent(
      { schemaVersion: 1, ownerId: f.uid, ...f.input },
      f.uid,
    );
  const hash = requestHash('startAdventureRestore', startInput(f.input));
  expect(adventureRestoreStartFingerprint(intent)).toBe(hash);
  expect(expectedAdventureRestoreTarget(intent)).toBe(targetId(f.uid, f.id, hash));
  const native = await f.remote.start(adventureRestoreStartRequest(intent)),
    outcome = readAdventureRestoreStartOutcome(native, intent);
  expect(outcome.progress.adventureId).toBe(expectedAdventureRestoreTarget(intent));
  expect(outcome.progress).not.toHaveProperty('keyId');
  expect(outcome.progress).not.toHaveProperty('keyBase64');
});
it.each([
  { format: 'writer-book-archive' },
  { format: 'writer-book-backup' },
  { version: 2 },
  { byteLength: 15 },
  { byteLength: Infinity },
  { byteLength: 0xffffffff * 65536 + 1 },
  { sha256: 'A'.repeat(64) },
  { filename: 'PRIVATE_NAME' },
])('invalid descriptor %j is refused', (patch) => {
  const f = harness();
  expect(() => readAdventureRestoreSourceDescriptor({ ...f.input.source, ...patch })).toThrow();
});
it('bootstrap codec freezes nested metadata and rejects foreign, changed, or plaintext records', () => {
  const f = harness(),
    intent = readAdventureRestoreStartIntent(
      { schemaVersion: 1, ownerId: f.uid, ...f.input },
      f.uid,
    ),
    record = createAdventureRestoreBootstrapRecord(intent);
  expect(Object.isFrozen(record.intent.source)).toBe(true);
  for (const patch of [
    { stamp: 'invalid' },
    { schemaVersion: 2 },
    { file: 'PRIVATE_FILE' },
    { intent: { ...intent, ownerId: 'other' } },
    { intent: { ...intent, source: { ...intent.source, keyBase64: 'NEVER' } } },
  ]) {
    expect(() =>
      readAdventureRestoreBootstrapRecord({ ...record, ...patch }, f.uid, f.id),
    ).toThrow();
  }
  expect(() => readAdventureRestoreBootstrapRecord(record, 'other', f.id)).toThrow();
  expect(() =>
    readAdventureRestoreBootstrapRecord(record, f.uid, 'another-operation-0001'),
  ).toThrow();
});
it('chunk operation is bound to incarnation and independent of whether a keyId is already known', async () => {
  const f = await uploadHarness(),
    a = adventureRestoreChunkOperationId(f.identity, 0);
  expect(a.length).toBeLessThanOrEqual(80);
  expect(adventureRestoreChunkOperationId({ ...f.identity, keyId: 'c'.repeat(64) }, 0)).toBe(a);
  expect(adventureRestoreChunkOperationId({ ...f.identity, jobToken: 'c'.repeat(64) }, 0)).not.toBe(
    a,
  );
  expect(adventureRestoreChunkOperationId(f.identity, 1)).not.toBe(a);
});
it('native jobs and pages reject foreign targets, counters, revisions and duplicate entries', async () => {
  const f = harness(),
    native = await f.remote.start(f.input),
    p = native.progress;
  for (const patch of [
    { adventureId: 'other-adventure-0001' },
    { source: { ...p.source, sha256: 'd'.repeat(64) } },
    { uploadedChunks: 3 },
    { uploadedBytes: 1 },
    { checkedBytes: 1 },
    { updatedAt: -1 },
    { reviewHash: 'd'.repeat(64) },
    { ownerId: 'other' },
  ]) {
    expect(() => readAdventureRestoreTransferJob({ ...p, ...patch }, f.uid)).toThrow();
  }
  expect(
    readAdventureRestoreTransferPage({ schemaVersion: 1, items: [p], nextCursor: null }, f.uid)
      .items,
  ).toHaveLength(1);
  expect(() =>
    readAdventureRestoreTransferPage({ schemaVersion: 1, items: [p, p], nextCursor: null }, f.uid),
  ).toThrow();
});
it('chunk codec accepts canonical bytes only and never trusts a mismatched digest', async () => {
  const f = await uploadHarness(),
    bytes = f.bytes.subarray(0, 65536);
  const input = {
    restoreId: f.identity.restoreId,
    jobToken: f.identity.jobToken,
    operationId: adventureRestoreChunkOperationId(f.identity, 0),
    expectedCheckpoint: 0,
    index: 0,
    chunkHash: f.input.source.sha256,
    chunkBase64: bytes.toString('base64'),
  };
  const { createHash } = await import('node:crypto');
  input.chunkHash = createHash('sha256').update(bytes).digest('hex');
  expect(readAdventureRestoreChunkRequest(input)).toEqual(input);
  for (const patch of [
    { chunkHash: 'd'.repeat(64) },
    { chunkBase64: 'AA=A' },
    { expectedCheckpoint: 1 },
    { index: -1 },
    { privateText: 'NEVER' },
    { chunkBase64: Buffer.alloc(65537).toString('base64') },
  ]) {
    expect(() => readAdventureRestoreChunkRequest({ ...input, ...patch })).toThrow();
  }
});
