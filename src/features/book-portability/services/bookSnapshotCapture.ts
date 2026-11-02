import {
  BOOK_STRUCTURE_LIMITS,
  type BookStructureChunk,
  type BookStructureSource,
} from '../../../../functions/src/bookBackupStructure.mjs';
export class BookStructureCaptureError extends Error {
  readonly code = 'book-backup-invalid-structure';
  constructor() {
    super('Não foi possível conferir a estrutura completa. Faça um novo backup.');
    this.name = 'BookStructureCaptureError';
  }
}
export function invalid(): never {
  throw new BookStructureCaptureError();
}
export function closed(value: unknown, keys: string[]): value is Record<string, unknown> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key)),
  );
}
export function validId(value: unknown): value is string {
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
export const validHash = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const validCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;
export function source(value: unknown, bookId: string, expected?: string): BookStructureSource {
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
export function matches(value: BookStructureSource, anchor: BookStructureSource) {
  return (
    value.schemaVersion === 1 &&
    value.bookId === anchor.bookId &&
    value.sourceToken === anchor.sourceToken
  );
}
export function compareIds(a: string, b: string): number {
  const first = new TextEncoder().encode(a),
    second = new TextEncoder().encode(b);
  for (let i = 0; i < Math.min(first.length, second.length); i++)
    if (first[i] !== second[i]) return first[i]! - second[i]!;
  return first.length - second.length;
}
export async function hash(bytes: Uint8Array): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))),
    (value) => value.toString(16).padStart(2, '0'),
  ).join('');
}
export const textHash = (text: string) => hash(new TextEncoder().encode(text));
export const check = (signal?: AbortSignal) => signal?.throwIfAborted();

export interface BookSnapshotItem {
  kind: string;
  id: string;
  itemToken: string;
  parentId?: string | null;
}
export type BookSnapshotChunk = Omit<BookStructureChunk, 'kind'> & {
  kind: string;
  parentId?: string | null;
};
function chunkBytes(
  chunk: BookSnapshotChunk,
  anchor: BookStructureSource,
  item: BookSnapshotItem,
  index: number,
  first?: BookSnapshotChunk,
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
      ...(item.parentId === undefined ? [] : ['parentId']),
    ]) ||
    !matches(chunk, anchor) ||
    chunk.kind !== item.kind ||
    chunk.id !== item.id ||
    chunk.parentId !== item.parentId ||
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
export async function writeSnapshotItem(
  anchor: BookStructureSource,
  item: BookSnapshotItem,
  read: (index: number) => Promise<BookSnapshotChunk>,
  write: (part: number, payload: Uint8Array) => Promise<void>,
  signal?: AbortSignal,
  validate?: (value: unknown) => boolean,
): Promise<void> {
  let first: BookSnapshotChunk | undefined, body: Uint8Array | undefined;
  for (let index = 0; !first || index < first.chunkCount; index++) {
    check(signal);
    const current = await read(index);
    check(signal);
    const bytes = chunkBytes(current, anchor, item, index, first);
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
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      (validate && !validate(parsed))
    )
      invalid();
  } catch {
    invalid();
  }
  for (
    let offset = 0, part = 0;
    offset < body.length;
    offset += BOOK_STRUCTURE_LIMITS.chunkBytes, part++
  ) {
    check(signal);
    await write(part, body.slice(offset, offset + BOOK_STRUCTURE_LIMITS.chunkBytes));
    check(signal);
  }
}
