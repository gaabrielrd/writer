import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { AdventureContentReport } from '../../../../functions/src/adventureBackupContent.mjs';
import { inspectAdventureBackupContent } from './inspectAdventureBackupContent';
import { recoveryCheck as check } from './adventureRestoreRecoveryContracts';
import {
  adventureRestoreMetadataHash,
  readAdventureRestoreSourceDescriptor,
  type AdventureRestoreSourceDescriptor,
} from './adventureRestoreTransferContracts';
export const ADVENTURE_RESTORE_REVIEW_POLICIES = Object.freeze({
  destination: 'new-private-copy',
  universe: 'relink-original-if-authorized',
  draft: 'saved-text-with-draft-version',
  history: 'all-recorded',
  media: 'embedded-own-bytes',
} as const);
export type AdventureRestoreLocalReview = Readonly<{
  schemaVersion: 1;
  source: AdventureRestoreSourceDescriptor;
  sourceAdventureId: string;
  totals: AdventureContentReport['totals'];
  warnings: AdventureContentReport['warnings'];
  policies: typeof ADVENTURE_RESTORE_REVIEW_POLICIES;
}>;
export type InspectedAdventureRestore = Readonly<{
  review: AdventureRestoreLocalReview;
  reviewHash: string;
}>;
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
/** Inspect a native immutable snapshot; no filename, prose or file bytes become resume metadata. */
export async function inspectAdventureRestoreFile(
  file: Blob,
  options: {
    check: () => void;
    signal?: AbortSignal;
    onStage?: (stage: 'inspect' | 'hash') => void;
  },
): Promise<InspectedAdventureRestore> {
  const { check: active, signal, onStage } = options,
    guard = () => {
      active();
      signal?.throwIfAborted();
    };
  guard();
  const snapshot: Blob = Blob.prototype.slice.call(file, 0),
    size = snapshot.size;
  check(Number.isSafeInteger(size) && size >= 16);
  const source = Object.freeze({
    size,
    async read(offset: number, length: number) {
      guard();
      check(
        Number.isSafeInteger(offset) &&
          Number.isSafeInteger(length) &&
          offset >= 0 &&
          length >= 0 &&
          Number.isSafeInteger(offset + length) &&
          offset + length <= size,
      );
      const bytes = new Uint8Array(await snapshot.slice(offset, offset + length).arrayBuffer());
      try {
        guard();
        check(bytes.byteLength === length);
        return bytes;
      } catch (error) {
        bytes.fill(0);
        throw error;
      }
    },
  });
  onStage?.('inspect');
  guard();
  const report = await inspectAdventureBackupContent(source, { signal });
  guard();
  check(report.validation === 'content-only' && report.version === 1);
  onStage?.('hash');
  guard();
  const hash = sha256.create();
  let digest: string;
  try {
    for (let offset = 0; offset < size;) {
      guard();
      const length = Math.min(65536, size - offset),
        bytes = await source.read(offset, length);
      try {
        guard();
        hash.update(bytes);
      } finally {
        bytes.fill(0);
      }
      offset += length;
    }
    guard();
    digest = bytesToHex(hash.digest());
  } finally {
    hash.destroy();
  }
  const descriptor = readAdventureRestoreSourceDescriptor({
    format: 'writer-adventure-archive',
    version: 1,
    byteLength: size,
    sha256: digest,
  });
  const review: AdventureRestoreLocalReview = freeze({
    schemaVersion: 1,
    source: descriptor,
    sourceAdventureId: report.envelope.manifest.adventureId,
    totals: structuredClone(report.totals),
    warnings: structuredClone(report.warnings),
    policies: ADVENTURE_RESTORE_REVIEW_POLICIES,
  });
  guard();
  return Object.freeze({ review, reviewHash: adventureRestoreMetadataHash(review) });
}
