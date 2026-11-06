import { callBookBackup } from './bookStructureCallables';

const MAX_BYTES = 8 * 1024 * 1024;
const PART_BYTES = 65536;
export interface EditorialHistoryItem {
  id: string;
  recordKind: string;
  artifact: {
    kind: string;
    revision: number | null;
    availability: string;
    role: string | null;
  } | null;
  byteLength: number;
  chunkCount: number;
  contentHash: string;
}
export interface EditorialHistoryPage {
  items: EditorialHistoryItem[];
  next: string | null;
}
type Guard = () => void;

function check(value: unknown): asserts value {
  if (!value) throw new Error('Não foi possível conferir o registro original. Consulte novamente.');
}
function object(raw: unknown, keys: string[]): Record<string, unknown> {
  check(raw && typeof raw === 'object' && !Array.isArray(raw));
  const value = raw as Record<string, unknown>;
  check(
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)),
  );
  return value;
}
function hash(raw: unknown): asserts raw is string {
  check(typeof raw === 'string' && /^[a-f0-9]{64}$/.test(raw));
}
function item(raw: unknown): EditorialHistoryItem {
  const value = object(raw, [
    'id',
    'recordKind',
    'artifact',
    'byteLength',
    'chunkCount',
    'contentHash',
  ]);
  hash(value.id);
  hash(value.contentHash);
  check(
    ['book-editorial-artifact', 'book-editorial-link', 'book-editorial'].includes(
      String(value.recordKind),
    ),
  );
  check(
    Number.isSafeInteger(value.byteLength) &&
      Number(value.byteLength) > 0 &&
      Number(value.byteLength) <= MAX_BYTES,
  );
  check(value.chunkCount === Math.ceil(Number(value.byteLength) / PART_BYTES));
  if (value.artifact !== null) {
    const artifact = object(value.artifact, ['kind', 'revision', 'availability', 'role']);
    check(
      [
        'contract',
        'plan',
        'document',
        'decision',
        'evidence',
        'report',
        'checkpoint',
        'prose',
      ].includes(String(artifact.kind)) &&
        ['included', 'unavailable'].includes(String(artifact.availability)),
    );
    check(
      artifact.revision === null ||
        (Number.isSafeInteger(artifact.revision) && Number(artifact.revision) >= 0),
    );
    check(
      artifact.role === null ||
        (typeof artifact.role === 'string' &&
          [
            'architecture',
            'series',
            'preparation',
            'progress',
            'readerGuide',
            'publicationManifest',
          ].includes(artifact.role)),
    );
  }
  check((value.recordKind === 'book-editorial-artifact') === (value.artifact !== null));
  return value as unknown as EditorialHistoryItem;
}
async function invoke(name: string, input: unknown, guard: Guard): Promise<unknown> {
  guard();
  const result = await callBookBackup(name, input);
  guard();
  return result;
}
async function digest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const result = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function header(bookId: string, id: string, guard: Guard) {
  const value = object(await invoke('getBookEditorialHistory', { bookId, id }, guard), [
    'schemaVersion',
    'bookId',
    'id',
    'recordKind',
    'artifact',
    'byteLength',
    'chunkCount',
    'contentHash',
    'readToken',
  ]);
  check(value.schemaVersion === 1 && value.bookId === bookId && value.id === id);
  hash(value.readToken);
  const metadata = item({
    id: value.id,
    recordKind: value.recordKind,
    artifact: value.artifact,
    byteLength: value.byteLength,
    chunkCount: value.chunkCount,
    contentHash: value.contentHash,
  });
  return { ...metadata, readToken: value.readToken };
}
export async function listEditorialHistory(
  bookId: string,
  after: string | null,
  guard: Guard,
): Promise<EditorialHistoryPage> {
  const value = object(
    await invoke('listBookEditorialHistory', { bookId, after, limit: 25 }, guard),
    ['schemaVersion', 'bookId', 'items', 'next'],
  );
  check(
    value.schemaVersion === 1 &&
      value.bookId === bookId &&
      Array.isArray(value.items) &&
      value.items.length <= 25,
  );
  check(
    value.next === null ||
      (typeof value.next === 'string' && value.next.length > 0 && value.next.length <= 4096),
  );
  const items = value.items.map(item);
  check(new Set(items.map((row) => row.id)).size === items.length);
  return { items, next: value.next };
}
/** Private, bounded read: verify every part, the aggregate and a fresh authorization before exposing content. */
export async function readEditorialHistory(
  bookId: string,
  id: string,
  guard: Guard,
): Promise<string> {
  const source = await header(bookId, id, guard);
  const bytes = new Uint8Array(source.byteLength);
  let offset = 0;
  for (let index = 0; index < source.chunkCount; index++) {
    const part = object(
      await invoke(
        'readBookEditorialHistoryPart',
        { bookId, id, readToken: source.readToken, index },
        guard,
      ),
      ['schemaVersion', 'bookId', 'index', 'byteLength', 'chunkBase64', 'contentHash', 'done'],
    );
    const length = Math.min(PART_BYTES, source.byteLength - offset);
    check(
      part.schemaVersion === 1 &&
        part.bookId === bookId &&
        part.index === index &&
        part.byteLength === length,
    );
    check(
      part.done === (index + 1 === source.chunkCount) &&
        typeof part.chunkBase64 === 'string' &&
        part.chunkBase64.length <= 87384,
    );
    hash(part.contentHash);
    const decoded = atob(part.chunkBase64);
    check(decoded.length === length && btoa(decoded) === part.chunkBase64);
    const chunk = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
    check((await digest(chunk)) === part.contentHash);
    guard();
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  check(offset === source.byteLength && (await digest(bytes)) === source.contentHash);
  guard();
  const current = await header(bookId, id, guard);
  check(current.readToken === source.readToken && current.contentHash === source.contentHash);
  guard();
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
}
