import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { BookRestoreIdentity } from '../model/bookRestorePreparation';
import type { BookRestoreSourceDescriptor } from '../model/bookRestoreTransfer';
import { createBookBackupBlobSource } from './backupBlobSource';
import { fingerprintBookBackup } from './fingerprintBookBackup';
import {
  bookRestoreChunkOperationId,
  readBookRestoreSourceDescriptor,
} from './bookRestoreTransferContracts';
import {
  readBookRestoreIdentity,
  restorePreparationCheck as check,
} from './bookRestorePreparationContracts';
import {
  getBookRestoreRecoveryGrant,
  readBookRestoreRecoveryContext,
  type BookRestoreRecoveryGrant,
  type BookRestoreRecoveryContext,
} from './bookRestoreRecoveryKey';
import {
  bookRestoreTransferApi,
  type BookRestoreTransferApi,
} from './bookRestoreTransferCallables';
import { readBookRestoreTransferJob, type BookRestoreTransferJob } from './bookRestoreTransferJob';
type ChunkInput = Parameters<BookRestoreTransferApi['append']>[0];
export type BookRestoreUploadStep =
  | { kind: 'confirmed'; index: number; progress: BookRestoreTransferJob }
  | { kind: 'paused'; progress: BookRestoreTransferJob };
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
function base64(bytes: Uint8Array) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
export function createBookRestoreUploadDriver(options: {
  identity: BookRestoreIdentity;
  source: BookRestoreSourceDescriptor;
  reviewHash: string;
  file: Blob;
  check: () => void;
  api?: BookRestoreTransferApi;
  authorize?: (
    context: BookRestoreRecoveryContext,
    guard: () => void,
  ) => Promise<BookRestoreRecoveryGrant>;
}) {
  const identity = Object.freeze(readBookRestoreIdentity(options.identity)),
    descriptor = readBookRestoreSourceDescriptor(options.source),
    {
      check: guard,
      api = bookRestoreTransferApi,
      authorize = getBookRestoreRecoveryGrant,
      reviewHash,
    } = options,
    original = createBookBackupBlobSource(options.file),
    read = original.read.bind(original),
    size = original.size;
  check(
    typeof reviewHash === 'string' &&
      /^[a-f0-9]{64}$/.test(reviewHash) &&
      size === descriptor.byteLength,
  );
  const source = Object.freeze({
    size,
    async read(offset: number, length: number) {
      guard();
      const bytes = await read(offset, length);
      guard();
      check(bytes.byteLength === length);
      return bytes;
    },
  });
  let running = false,
    verified = false,
    pending: ChunkInput | null = null;
  function job(raw: unknown) {
    const value = readBookRestoreTransferJob(raw, identity.ownerId, identity);
    check(
      value.bookId === identity.bookId &&
        value.reviewHash === reviewHash &&
        JSON.stringify(value.source) === JSON.stringify(descriptor),
    );
    return value;
  }
  async function current() {
    guard();
    const raw = await api.get({ restoreId: identity.restoreId, jobToken: identity.jobToken });
    guard();
    return job(raw);
  }
  async function confirm(input: ChunkInput): Promise<BookRestoreUploadStep> {
    guard();
    const raw = await api.append(input);
    guard();
    check(
      object(raw) && raw.schemaVersion === 1 && raw.kind === 'confirmed' && object(raw.receipt),
    );
    const r = raw.receipt,
      last = input.index + 1 === Math.ceil(size / 65536);
    check(
      r.schemaVersion === 1 &&
        r.operationId === input.operationId &&
        r.action === 'appendBookRestoreChunk' &&
        r.expectedCheckpoint === input.expectedCheckpoint &&
        r.checkpoint === input.index + 1 &&
        r.sequence === input.index &&
        r.uploadedChunks === input.index + 1 &&
        r.cleanedChunks === 0 &&
        r.uploadedBytes === Math.min(size, (input.index + 1) * 65536) &&
        r.state === (last ? 'uploaded' : 'uploading'),
    );
    const progress = job(raw.progress);
    check(progress.checkpoint >= r.checkpoint && progress.uploadedChunks >= r.uploadedChunks);
    guard();
    pending = null;
    return { kind: 'confirmed', index: input.index, progress };
  }
  return {
    async step(): Promise<BookRestoreUploadStep> {
      guard();
      check(!running);
      running = true;
      try {
        if (pending) return await confirm(pending);
        let progress = await current();
        guard();
        if (progress.state !== 'uploading') return { kind: 'paused', progress };
        if (!verified) {
          const fingerprint = await fingerprintBookBackup(source);
          guard();
          check(fingerprint.byteLength === size && fingerprint.sha256 === descriptor.sha256);
          verified = true;
        }
        if (!progress.recoveryReady) {
          const context = readBookRestoreRecoveryContext(progress),
            grant = await authorize(context, guard);
          guard();
          check(JSON.stringify(readBookRestoreRecoveryContext(grant)) === JSON.stringify(context));
          progress = await current();
          guard();
          if (progress.state !== 'uploading') return { kind: 'paused', progress };
          check(progress.recoveryReady);
        }
        const index = progress.uploadedChunks,
          offset = index * 65536,
          bytes = await source.read(offset, Math.min(65536, size - offset));
        guard();
        pending = Object.freeze({
          restoreId: identity.restoreId,
          jobToken: identity.jobToken,
          operationId: bookRestoreChunkOperationId(identity, index),
          expectedCheckpoint: index,
          index,
          chunkHash: bytesToHex(sha256(bytes)),
          chunkBase64: base64(bytes),
        });
        return await confirm(pending);
      } finally {
        running = false;
      }
    },
  };
}
