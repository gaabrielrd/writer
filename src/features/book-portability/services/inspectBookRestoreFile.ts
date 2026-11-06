import {
  BOOK_RESTORE_REVIEW_POLICIES,
  type BookRestoreLocalReview,
  type InspectedBookRestore,
} from '../model/bookRestoreReview';
import { BookBackupFormatError, type BookBackupByteSource } from '../model/backupContainer';
import { createBookBackupBlobSource } from './backupBlobSource';
import { inspectBookBackupContent } from './inspectBookBackupContent';
import { inspectLegacyBookBackup } from './inspectLegacyBookBackup';
import { fingerprintBookBackup } from './fingerprintBookBackup';
import {
  bookRestoreMetadataHash,
  readBookRestoreSourceDescriptor,
} from './bookRestoreTransferContracts';
import { restorePreparationCheck } from './bookRestorePreparationContracts';
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export async function inspectBookRestoreFile(
  file: Blob,
  options: {
    check: () => void;
    signal?: AbortSignal;
    onStage?: (stage: 'inspect' | 'hash') => void;
  },
): Promise<InspectedBookRestore> {
  const { check, signal, onStage } = options;
  const guard = () => {
    check();
    signal?.throwIfAborted();
  };
  guard();
  const original = createBookBackupBlobSource(file),
    size = original.size,
    read = original.read.bind(original);
  restorePreparationCheck(Number.isSafeInteger(size) && size > 0);
  const source: BookBackupByteSource = Object.freeze({
    size,
    async read(offset: number, length: number) {
      guard();
      const bytes = await read(offset, length);
      guard();
      restorePreparationCheck(bytes.byteLength === length);
      return bytes;
    },
  });
  onStage?.('inspect');
  guard();
  const magic = 'WRITER-BOOK\n',
    header = await source.read(0, Math.min(magic.length, size));
  guard();
  const native = new TextDecoder().decode(header) === magic,
    report = native
      ? await inspectBookBackupContent(source, { signal })
      : await inspectLegacyBookBackup(source, { signal });
  guard();
  if (report.validation === 'content-only' && report.envelope.manifest.version === 2)
    throw new BookBackupFormatError(
      'unsupported-version',
      'A restauração do processo editorial ainda não está disponível.',
    );
  onStage?.('hash');
  guard();
  const fingerprint = await fingerprintBookBackup(source, { signal });
  guard();
  restorePreparationCheck(fingerprint.byteLength === size);
  const legacy = report.validation === 'legacy-content-only' ? report : null,
    current = report.validation === 'content-only' ? report : null;
  const sourceBookId = legacy?.source.bookId ?? current?.envelope.manifest.bookId;
  restorePreparationCheck(typeof sourceBookId === 'string' && sourceBookId.length > 0);
  const descriptor = readBookRestoreSourceDescriptor({
    format: legacy ? 'writer-book-backup' : 'writer-book-archive',
    version: legacy ? legacy.source.version : current?.envelope.manifest.version,
    byteLength: size,
    sha256: fingerprint.sha256,
  });
  const review: BookRestoreLocalReview = freeze({
    schemaVersion: 1,
    source: descriptor,
    sourceBookId,
    totals: structuredClone(report.totals),
    warnings: structuredClone(report.warnings),
    legacy: legacy
      ? {
          availability: structuredClone(legacy.source.availability),
          legacyWarnings: structuredClone(legacy.legacyWarnings),
          ignoredGlobalEntries: legacy.source.ignoredGlobalEntries,
          publicationDiscarded: legacy.source.publicationDiscarded,
        }
      : null,
    policies: BOOK_RESTORE_REVIEW_POLICIES,
  });
  guard();
  return Object.freeze({ review, reviewHash: bookRestoreMetadataHash(review) });
}
