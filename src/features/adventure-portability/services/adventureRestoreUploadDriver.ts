import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  readAdventureRestoreRecoveryRequest,
  recoveryCheck as check,
  type AdventureRestoreRecoveryIdentity,
} from './adventureRestoreRecoveryContracts';
import {
  readAdventureRestoreSourceDescriptor,
  adventureRestoreChunkOperationId,
  type AdventureRestoreSourceDescriptor,
  type AdventureRestoreChunkRequest,
} from './adventureRestoreTransferContracts';
import {
  createAdventureRestoreTransferApi,
  type AdventureRestoreTransferApi,
} from './adventureRestoreTransferCallables';
import {
  readAdventureRestoreTransferJob,
  type AdventureRestoreTransferJob,
} from './adventureRestoreTransferJob';
export type AdventureRestoreUploadStep =
  | { kind: 'confirmed'; index: number; progress: AdventureRestoreTransferJob }
  | { kind: 'paused'; progress: AdventureRestoreTransferJob };
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const fileMismatch = () =>
  Object.assign(
    new Error('O arquivo selecionado não corresponde à preparação. Selecione o arquivo original.'),
    { code: 'adventure-restore-file-mismatch' },
  );
const encode = (bytes: Uint8Array) => {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
};
export function createAdventureRestoreUploadDriver(options: {
  identity: AdventureRestoreRecoveryIdentity;
  source: AdventureRestoreSourceDescriptor;
  file: Blob;
  check: () => void;
  api?: AdventureRestoreTransferApi;
}) {
  const identity = readAdventureRestoreRecoveryRequest(options.identity),
    descriptor = readAdventureRestoreSourceDescriptor(options.source),
    { check: guard, api = createAdventureRestoreTransferApi(identity.ownerId, guard) } = options;
  // A native snapshot also accepts cross-realm Blobs and does not trust overridden slice/size.
  const original = Blob.prototype.slice.call(options.file, 0),
    size = original.size;
  if (size !== descriptor.byteLength) throw fileMismatch();
  let running = false,
    verified = false,
    pending: AdventureRestoreChunkRequest | null = null;
  async function read(offset: number, length: number) {
    guard();
    const bytes = new Uint8Array(await original.slice(offset, offset + length).arrayBuffer());
    try {
      guard();
      check(bytes.byteLength === length);
      return bytes;
    } catch (error) {
      bytes.fill(0);
      throw error;
    }
  }
  async function fingerprint() {
    const hash = sha256.create();
    try {
      for (let offset = 0; offset < size;) {
        const length = Math.min(65536, size - offset),
          bytes = await read(offset, length);
        try {
          guard();
          hash.update(bytes);
        } finally {
          bytes.fill(0);
        }
        offset += length;
      }
      guard();
      if (bytesToHex(hash.digest()) !== descriptor.sha256) throw fileMismatch();
      verified = true;
    } finally {
      hash.destroy();
    }
  }
  function job(raw: unknown) {
    const value = readAdventureRestoreTransferJob(raw, identity.ownerId, {
      restoreId: identity.restoreId,
      jobToken: identity.jobToken,
    });
    check(
      value.adventureId === identity.adventureId &&
        value.reviewHash === identity.reviewHash &&
        JSON.stringify(value.source) === JSON.stringify(descriptor),
    );
    return value;
  }
  async function confirm(input: AdventureRestoreChunkRequest): Promise<AdventureRestoreUploadStep> {
    guard();
    const raw = await api.append(input);
    guard();
    check(
      record(raw) && raw.schemaVersion === 1 && raw.kind === 'confirmed' && record(raw.receipt),
    );
    const r = raw.receipt,
      last = input.index + 1 === Math.ceil(size / 65536);
    check(
      r.schemaVersion === 1 &&
        r.action === 'appendAdventureRestoreChunk' &&
        r.operationId === input.operationId &&
        r.expectedCheckpoint === input.expectedCheckpoint &&
        r.checkpoint === input.expectedCheckpoint + 1 &&
        r.sequence === input.index &&
        r.uploadedChunks === input.index + 1 &&
        r.uploadedBytes === Math.min(size, (input.index + 1) * 65536) &&
        r.state === (last ? 'uploaded' : 'uploading') &&
        r.cleanupPhase === 'chunks' &&
        r.integrityFailure === null &&
        ['checkedChunks', 'checkedBytes', 'cleanedChunks', 'cleanedProofs', 'cleanedStates'].every(
          (k) => r[k] === 0,
        ) &&
        !Object.hasOwn(r, 'validation') &&
        !Object.hasOwn(r, 'staging') &&
        !Object.hasOwn(r, 'activation'),
    );
    const progress = job(raw.progress);
    check(
      progress.checkpoint > input.expectedCheckpoint && progress.uploadedChunks >= input.index + 1,
    );
    guard();
    pending = null;
    return { kind: 'confirmed', index: input.index, progress };
  }
  return {
    async step(): Promise<AdventureRestoreUploadStep> {
      guard();
      check(!running);
      running = true;
      try {
        if (pending) return await confirm(pending);
        const raw = await api.get({ restoreId: identity.restoreId, jobToken: identity.jobToken });
        guard();
        const progress = job(raw);
        if (progress.state !== 'uploading') return { kind: 'paused', progress };
        if (!verified) await fingerprint();
        guard();
        const index = progress.uploadedChunks,
          offset = index * 65536,
          bytes = await read(offset, Math.min(65536, size - offset));
        try {
          guard();
          pending = Object.freeze({
            restoreId: identity.restoreId,
            jobToken: identity.jobToken,
            operationId: adventureRestoreChunkOperationId(identity, index),
            expectedCheckpoint: index,
            index,
            chunkHash: bytesToHex(sha256(bytes)),
            chunkBase64: encode(bytes),
          });
        } finally {
          bytes.fill(0);
        }
        return await confirm(pending);
      } finally {
        running = false;
      }
    },
  };
}
