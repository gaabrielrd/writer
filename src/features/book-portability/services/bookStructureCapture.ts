import {
  BOOK_STRUCTURE_LIMITS,
  type BookStructureApi,
  type BookStructureChunk,
  type BookStructureItem,
  type BookStructureKind,
  type BookStructurePage,
  type BookStructureSource,
} from '../../../../functions/src/bookBackupStructure.mjs';
import type { BookBackupRecord } from '../model/backupContainer';
import { bookStructureApi } from './bookStructureCallables';

export interface BookStructureProof {
  source: BookStructureSource;
  digest: string;
  acts: number;
  chapters: number;
}
export class BookStructureCaptureError extends Error {
  readonly code = 'book-backup-invalid-structure';
  constructor() {
    super('Não foi possível conferir a estrutura completa. Faça um novo backup.');
    this.name = 'BookStructureCaptureError';
  }
}
function invalid(): never {
  throw new BookStructureCaptureError();
}
function closed(value: unknown, keys: string[]): value is Record<string, unknown> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key)),
  );
}
function validId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    Boolean(value) &&
    !/[\\/]/.test(value) &&
    !Array.from(value).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) &&
    !['.', '..'].includes(value) &&
    new TextEncoder().encode(value).length <= 1500 &&
    new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      new TextEncoder().encode(value),
    ) === value
  );
}
const validHash = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const validCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;
function source(value: unknown, bookId: string, expected?: string): BookStructureSource {
  if (
    !closed(value, ['schemaVersion', 'bookId', 'sourceToken']) ||
    value.schemaVersion !== 1 ||
    value.bookId !== bookId ||
    !validHash(value.sourceToken) ||
    (expected !== undefined && value.sourceToken !== expected)
  )
    invalid();
  return Object.freeze({ schemaVersion: 1, bookId, sourceToken: value.sourceToken });
}
function matches(value: BookStructureSource, anchor: BookStructureSource) {
  return (
    value.schemaVersion === 1 &&
    value.bookId === anchor.bookId &&
    value.sourceToken === anchor.sourceToken
  );
}
function compareIds(a: string, b: string): number {
  const first = new TextEncoder().encode(a),
    second = new TextEncoder().encode(b);
  for (let i = 0; i < Math.min(first.length, second.length); i++)
    if (first[i] !== second[i]) return first[i]! - second[i]!;
  return first.length - second.length;
}
async function hash(bytes: Uint8Array): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))),
    (value) => value.toString(16).padStart(2, '0'),
  ).join('');
}
const textHash = (text: string) => hash(new TextEncoder().encode(text));
const check = (signal?: AbortSignal) => signal?.throwIfAborted();
function page(
  value: BookStructurePage,
  anchor: BookStructureSource,
  kind: 'act' | 'chapter',
  last: string | null,
) {
  if (
    !closed(value, ['schemaVersion', 'bookId', 'sourceToken', 'kind', 'items', 'nextCursor']) ||
    !matches(value, anchor) ||
    value.kind !== kind ||
    !Array.isArray(value.items) ||
    value.items.length > BOOK_STRUCTURE_LIMITS.pageItems ||
    (value.nextCursor !== null &&
      (typeof value.nextCursor !== 'string' ||
        !value.nextCursor ||
        value.nextCursor.length > 16000 ||
        value.items.length !== BOOK_STRUCTURE_LIMITS.pageItems))
  )
    invalid();
  let previous = last;
  for (const item of value.items) {
    if (
      !closed(item, ['id', 'itemToken']) ||
      !validId(item.id) ||
      !validHash(item.itemToken) ||
      (previous !== null && compareIds(previous, item.id) >= 0)
    )
      invalid();
    previous = item.id;
  }
}
async function scan(
  api: BookStructureApi,
  anchor: BookStructureSource,
  signal?: AbortSignal,
  visit?: (kind: 'act' | 'chapter', item: BookStructureItem) => Promise<void>,
): Promise<Pick<BookStructureProof, 'digest' | 'acts' | 'chapters'>> {
  let digest = await textHash('writer-book-structure-v1'),
    acts = 0,
    chapters = 0;
  check(signal);
  for (const kind of ['act', 'chapter'] as const) {
    let cursor: string | null = null,
      last: string | null = null;
    do {
      check(signal);
      const current = await api.list({
        bookId: anchor.bookId,
        sourceToken: anchor.sourceToken,
        kind,
        cursor,
        limit: BOOK_STRUCTURE_LIMITS.pageItems,
      });
      check(signal);
      page(current, anchor, kind, last);
      if (current.nextCursor !== null && current.nextCursor === cursor) invalid();
      const items = current.items.map((item) => ({ id: item.id, itemToken: item.itemToken }));
      const nextCursor: string | null = current.nextCursor;
      for (const item of items) {
        digest = await textHash(JSON.stringify([digest, kind, item.id, item.itemToken]));
        check(signal);
        if (visit) await visit(kind, item);
        check(signal);
        if (kind === 'act') acts++;
        else chapters++;
        if (!validCount(acts) || !validCount(chapters)) invalid();
        last = item.id;
      }
      cursor = nextCursor;
    } while (cursor !== null);
  }
  return { digest, acts, chapters };
}
function chunkBytes(
  chunk: BookStructureChunk,
  anchor: BookStructureSource,
  kind: BookStructureKind,
  item: BookStructureItem,
  index: number,
  first?: BookStructureChunk,
): Uint8Array {
  if (
    !closed(chunk, [
      'schemaVersion',
      'bookId',
      'sourceToken',
      'kind',
      'id',
      'itemToken',
      'index',
      'chunkCount',
      'byteLength',
      'contentHash',
      'chunkBase64',
    ]) ||
    !matches(chunk, anchor) ||
    chunk.kind !== kind ||
    chunk.id !== item.id ||
    chunk.itemToken !== item.itemToken ||
    chunk.index !== index ||
    !validCount(chunk.byteLength) ||
    chunk.byteLength < 1 ||
    chunk.byteLength > BOOK_STRUCTURE_LIMITS.itemBytes ||
    chunk.chunkCount !== Math.ceil(chunk.byteLength / BOOK_STRUCTURE_LIMITS.chunkBytes) ||
    index >= chunk.chunkCount ||
    !validHash(chunk.contentHash) ||
    typeof chunk.chunkBase64 !== 'string' ||
    chunk.chunkBase64.length > 4 * Math.ceil(BOOK_STRUCTURE_LIMITS.chunkBytes / 3) ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(chunk.chunkBase64) ||
    (first &&
      (chunk.byteLength !== first.byteLength ||
        chunk.chunkCount !== first.chunkCount ||
        chunk.contentHash !== first.contentHash))
  )
    invalid();
  const binary = atob(chunk.chunkBase64);
  if (btoa(binary) !== chunk.chunkBase64) invalid();
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (
    bytes.length !==
    Math.min(
      BOOK_STRUCTURE_LIMITS.chunkBytes,
      chunk.byteLength - index * BOOK_STRUCTURE_LIMITS.chunkBytes,
    )
  )
    invalid();
  return bytes;
}
async function writeItem(
  api: BookStructureApi,
  anchor: BookStructureSource,
  kind: BookStructureKind,
  item: BookStructureItem,
  write: (record: BookBackupRecord) => Promise<void>,
  signal?: AbortSignal,
) {
  let first: BookStructureChunk | undefined, body: Uint8Array | undefined;
  for (let index = 0; !first || index < first.chunkCount; index++) {
    check(signal);
    const current = await api.read({
      bookId: anchor.bookId,
      sourceToken: anchor.sourceToken,
      kind,
      ...item,
      index,
    });
    check(signal);
    const bytes = chunkBytes(current, anchor, kind, item, index, first);
    if (!first) {
      first = { ...current };
      body = new Uint8Array(current.byteLength);
    }
    body!.set(bytes, index * BOOK_STRUCTURE_LIMITS.chunkBytes);
  }
  if (!body || !first || (await hash(body)) !== first.contentHash) invalid();
  check(signal);
  try {
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) invalid();
  } catch {
    invalid();
  }
  for (
    let offset = 0, part = 0;
    offset < body.length;
    offset += BOOK_STRUCTURE_LIMITS.chunkBytes, part++
  ) {
    check(signal);
    await write({
      kind: kind === 'book' ? 'book-metadata' : kind,
      id: item.id,
      part,
      payload: body.slice(offset, offset + BOOK_STRUCTURE_LIMITS.chunkBytes),
    });
    check(signal);
  }
}
export interface BookStructureCaptureOptions {
  bookId: string;
  write: (record: BookBackupRecord) => Promise<void>;
  source?: BookStructureSource;
  signal?: AbortSignal;
  api?: BookStructureApi;
}
/** Writes provisional records. Verify this proof after ALL other sections and before the archive seal. */
export async function captureBookBackupStructure(
  options: BookStructureCaptureOptions,
): Promise<BookStructureProof> {
  const { bookId, write, signal, api = bookStructureApi } = options;
  if (!validId(bookId)) invalid();
  const expected =
    options.source !== undefined ? source(options.source, bookId).sourceToken : undefined;
  check(signal);
  const anchor = source(
    await api.getSource({
      bookId,
      ...(expected === undefined ? {} : { expectedSourceToken: expected }),
    }),
    bookId,
    expected,
  );
  check(signal);
  await writeItem(
    api,
    anchor,
    'book',
    { id: bookId, itemToken: anchor.sourceToken },
    write,
    signal,
  );
  const result = await scan(api, anchor, signal, (kind, item) =>
    writeItem(api, anchor, kind, item, write, signal),
  );
  return Object.freeze({ source: anchor, ...result });
}
/** A successful check proves this segment only, never completeness or authorization of a whole archive. */
export async function verifyBookBackupStructure(
  proof: BookStructureProof,
  options: { signal?: AbortSignal; api?: BookStructureApi } = {},
): Promise<void> {
  if (
    !closed(proof, ['source', 'digest', 'acts', 'chapters']) ||
    !validHash(proof.digest) ||
    !validCount(proof.acts) ||
    !validCount(proof.chapters) ||
    !proof.source ||
    !validId(proof.source.bookId)
  )
    invalid();
  const anchor = source(proof.source, proof.source.bookId),
    expected = {
      digest: proof.digest,
      acts: proof.acts,
      chapters: proof.chapters,
    },
    { signal, api = bookStructureApi } = options;
  check(signal);
  const current = await scan(api, anchor, signal);
  if (
    current.digest !== expected.digest ||
    current.acts !== expected.acts ||
    current.chapters !== expected.chapters
  )
    invalid();
  check(signal);
  source(
    await api.getSource({ bookId: anchor.bookId, expectedSourceToken: anchor.sourceToken }),
    anchor.bookId,
    anchor.sourceToken,
  );
  check(signal);
}
