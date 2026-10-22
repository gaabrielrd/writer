import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type {
  VersionTarget,
  VersionSummary,
  WorkHistoryBackupSource,
  WorkHistoryBackupStreamApi,
  WorkHistoryBackupPart,
  WorkHistoryStreamProof,
} from '../model/workHistory';
import {
  backupSource,
  backupSummary,
  closedBackupValue,
  invalidBackup,
  summaryIdentity,
  validBackupId,
} from '../model/historyBackupContracts';

const CHUNK_BYTES = 65536;
const PAGE_CHUNKS = 4;
export interface WorkHistoryStreamOptions {
  api?: WorkHistoryBackupStreamApi;
  signal?: AbortSignal;
  isCurrent?: () => boolean;
  source?: WorkHistoryBackupSource;
}
const defaultApi: WorkHistoryBackupStreamApi = {
  getSource: async (input) =>
    (await import('./workHistoryCallables')).getWorkHistoryBackupSource(input),
  list: async (input) => (await import('./workHistoryCallables')).listWorkVersions(input),
  read: async (input) => (await import('./workHistoryCallables')).readWorkVersion(input),
};
function check(options: WorkHistoryStreamOptions) {
  options.signal?.throwIfAborted();
  if (options.isCurrent && !options.isCurrent())
    throw new DOMException('A captura não pertence mais à sessão atual.', 'AbortError');
}
function targetCopy(value: VersionTarget): VersionTarget {
  if (
    !closedBackupValue(value, ['kind', 'id']) ||
    !['book', 'adventure'].includes(value.kind) ||
    !validBackupId(value.id) ||
    new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      new TextEncoder().encode(value.id),
    ) !== value.id
  )
    invalidBackup();
  return Object.freeze({ kind: value.kind, id: value.id });
}
function sourceCopy(value: unknown): WorkHistoryBackupSource {
  return Object.freeze({ ...backupSource(value) });
}
function sameSource(a: WorkHistoryBackupSource, b: WorkHistoryBackupSource) {
  return a.sourceToken === b.sourceToken && a.historyRevision === b.historyRevision;
}
function summaryCopy(value: unknown, target: VersionTarget): VersionSummary {
  const item = backupSummary(value, target);
  if (
    item.chunkCount < Math.max(1, Math.ceil(item.byteLength / CHUNK_BYTES)) ||
    item.chunkCount > Math.max(1, Math.ceil(item.byteLength / (CHUNK_BYTES - 3))) ||
    new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      new TextEncoder().encode(item.id),
    ) !== item.id
  )
    invalidBackup();
  return Object.freeze({
    ...item,
    target: Object.freeze({ ...item.target }),
    resource: Object.freeze({ ...item.resource }),
  });
}
function compareIds(a: string, b: string): number {
  const first = new TextEncoder().encode(a),
    second = new TextEncoder().encode(b);
  for (let i = 0; i < Math.min(first.length, second.length); i++)
    if (first[i] !== second[i]) return first[i]! - second[i]!;
  return first.length - second.length;
}
function nextCursor(value: unknown, current: string | null): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !value || value.length > 12000 || value === current)
    invalidBackup();
  return value;
}
function add(total: number, value: number): number {
  const result = total + value;
  if (!Number.isSafeInteger(result) || result < 0) invalidBackup();
  return result;
}
/** Provisional until this generator finishes and every source is revalidated before the archive seal. */
export async function* streamWorkHistoryBackup(
  requested: VersionTarget,
  requestedOptions: WorkHistoryStreamOptions = {},
): AsyncGenerator<WorkHistoryBackupPart, WorkHistoryStreamProof | undefined, void> {
  const target = targetCopy(requested),
    options = { ...requestedOptions },
    api = options.api ?? defaultApi;
  check(options);
  const expected = options.source === undefined ? undefined : sourceCopy(options.source);
  const source = sourceCopy(await api.getSource({ target }));
  check(options);
  if (expected && !sameSource(source, expected)) invalidBackup();
  let cursor: string | null = null,
    lastId: string | null = null,
    versions = 0,
    byteLength = 0,
    chunkCount = 0;
  do {
    check(options);
    const page = await api.list({
      target,
      cursor,
      limit: 50,
      order: 'id',
      expectedHistoryToken: source.sourceToken,
    });
    check(options);
    if (
      !closedBackupValue(page, ['items', 'nextCursor']) ||
      !Array.isArray(page.items) ||
      page.items.length > 50
    )
      invalidBackup();
    const next: string | null = nextCursor(page.nextCursor, cursor);
    if (next !== null && page.items.length !== 50) invalidBackup();
    // Copy one bounded page before yielding control to the consumer.
    const items = page.items.map((item: unknown) => summaryCopy(item, target));
    for (const summary of items) {
      if (lastId !== null && compareIds(lastId, summary.id) >= 0) invalidBackup();
      lastId = summary.id;
      yield { type: 'version', version: summary };
      check(options);
      const hash = sha256.create();
      try {
        let bodyCursor: string | null = null,
          index = 0,
          length = 0;
        do {
          check(options);
          const body = await api.read({
            target,
            versionId: summary.id,
            cursor: bodyCursor,
            limit: PAGE_CHUNKS,
            expectedHistoryToken: source.sourceToken,
          });
          check(options);
          if (
            !closedBackupValue(body, ['version', 'chunks', 'nextCursor']) ||
            summaryIdentity(summaryCopy(body.version, target)) !== summaryIdentity(summary) ||
            !Array.isArray(body.chunks) ||
            !body.chunks.length ||
            body.chunks.length > PAGE_CHUNKS
          )
            invalidBackup();
          const after: string | null = nextCursor(body.nextCursor, bodyCursor);
          if (after !== null && body.chunks.length !== PAGE_CHUNKS) invalidBackup();
          const chunks = body.chunks.map((chunk: unknown) => {
            if (
              !closedBackupValue(chunk, ['index', 'content']) ||
              !Number.isSafeInteger(chunk.index) ||
              typeof chunk.content !== 'string'
            )
              invalidBackup();
            return { index: chunk.index as number, content: chunk.content };
          });
          for (const chunk of chunks) {
            if (chunk.index !== index || index >= summary.chunkCount) invalidBackup();
            const payload = new TextEncoder().encode(chunk.content);
            if (
              payload.length > CHUNK_BYTES ||
              new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(payload) !==
                chunk.content
            )
              invalidBackup();
            length = add(length, payload.length);
            if (length > summary.byteLength) invalidBackup();
            hash.update(payload);
            yield { type: 'text', versionId: summary.id, index, payload };
            check(options);
            index++;
          }
          if ((after === null) !== (index === summary.chunkCount)) invalidBackup();
          bodyCursor = after;
        } while (bodyCursor !== null);
        if (length !== summary.byteLength || bytesToHex(hash.digest()) !== summary.contentHash)
          invalidBackup();
        versions = add(versions, 1);
        byteLength = add(byteLength, length);
        chunkCount = add(chunkCount, index);
      } finally {
        hash.destroy();
      }
    }
    cursor = next;
  } while (cursor !== null);
  check(options);
  const final = sourceCopy(await api.getSource({ target }));
  check(options);
  if (!sameSource(source, final)) invalidBackup();
  return Object.freeze({ schemaVersion: 1, target, source, versions, byteLength, chunkCount });
}
/** Reauthorize after other sections; this proof does not validate a whole book or grant file access. */
export async function verifyWorkHistoryBackupStream(
  proof: WorkHistoryStreamProof,
  requestedOptions: WorkHistoryStreamOptions = {},
): Promise<void> {
  if (
    !closedBackupValue(proof, [
      'schemaVersion',
      'target',
      'source',
      'versions',
      'byteLength',
      'chunkCount',
    ]) ||
    proof.schemaVersion !== 1 ||
    ![proof.versions, proof.byteLength, proof.chunkCount].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    ) ||
    proof.chunkCount < proof.versions ||
    (!proof.versions && (proof.byteLength || proof.chunkCount))
  )
    invalidBackup();
  const target = targetCopy(proof.target),
    source = sourceCopy(proof.source),
    options = { ...requestedOptions },
    api = options.api ?? defaultApi;
  check(options);
  const current = sourceCopy(await api.getSource({ target }));
  check(options);
  if (!sameSource(source, current)) invalidBackup();
}
