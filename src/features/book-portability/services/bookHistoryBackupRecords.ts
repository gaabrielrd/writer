import type {
  VersionSummary,
  WorkHistoryBackupPart,
  WorkHistoryStreamProof,
} from '@/features/manuscript-history';
import { BookBackupFormatError, type BookBackupRecord } from '../model/backupContainer';

function invalid(): never {
  throw new BookBackupFormatError(
    'invalid-record',
    'O histórico não pertence a este backup de livro.',
  );
}
function header(value: VersionSummary) {
  return {
    id: value.id,
    target: { kind: value.target.kind, id: value.target.id },
    resource: { kind: value.resource.kind, id: value.resource.id },
    createdAt: value.createdAt,
    reason: value.reason,
    label: value.label,
    wordCount: value.wordCount,
    byteLength: value.byteLength,
    contentHash: value.contentHash,
    chunkCount: value.chunkCount,
  };
}
/** Maps a verified history stream; records remain provisional until every section and the M2 seal. */
export async function* bookHistoryBackupRecords(
  bookId: string,
  stream: AsyncGenerator<WorkHistoryBackupPart, WorkHistoryStreamProof | undefined, void>,
): AsyncGenerator<BookBackupRecord, WorkHistoryStreamProof | undefined, void> {
  let complete = false,
    current: VersionSummary | null = null,
    index = 0,
    length = 0,
    versions = 0,
    byteLength = 0,
    chunkCount = 0;
  function finishItem() {
    if (current && (index !== current.chunkCount || length !== current.byteLength)) invalid();
  }
  try {
    for (;;) {
      const next = await stream.next();
      if (next.done) {
        const proof = next.value;
        finishItem();
        if (
          !proof ||
          proof.schemaVersion !== 1 ||
          proof.target.kind !== 'book' ||
          proof.target.id !== bookId ||
          proof.versions !== versions ||
          proof.byteLength !== byteLength ||
          proof.chunkCount !== chunkCount
        )
          invalid();
        const payload = new TextEncoder().encode(
          JSON.stringify({
            schemaVersion: 1,
            versions,
            byteLength,
            chunkCount,
          }),
        );
        yield { kind: 'work-history', id: bookId, part: 0, payload };
        complete = true;
        return proof;
      }
      const event = next.value;
      if (event.type === 'version') {
        finishItem();
        if (
          event.version.target.kind !== 'book' ||
          event.version.target.id !== bookId ||
          !['chapter', 'scene'].includes(event.version.resource.kind)
        )
          invalid();
        current = header(event.version);
        versions++;
        index = 0;
        length = 0;
        yield {
          kind: 'work-version',
          id: current.id,
          part: 0,
          payload: new TextEncoder().encode(JSON.stringify(current)),
        };
      } else {
        if (
          !current ||
          current.id !== event.versionId ||
          event.index !== index ||
          index >= current.chunkCount ||
          event.payload.byteLength > 65536
        )
          invalid();
        length += event.payload.byteLength;
        byteLength += event.payload.byteLength;
        chunkCount++;
        index++;
        if (
          length > current.byteLength ||
          ![versions, byteLength, chunkCount].every(Number.isSafeInteger)
        )
          invalid();
        yield {
          kind: 'work-version-text',
          id: event.versionId,
          part: event.index,
          payload: event.payload,
        };
      }
    }
  } finally {
    if (!complete) await stream.return(undefined);
  }
}
