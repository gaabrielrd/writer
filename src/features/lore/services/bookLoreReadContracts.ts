import { bookContentId } from '../../../../functions/src/bookBackupSchema.mjs';

export interface LoreReadManifest {
  schemaVersion: 1;
  contentHash: string;
  byteLength: number;
  chunkCount: number;
}
export const loreReadFields = [
  'name',
  'category',
  'summary',
  'details',
  'aliases',
  'structuredDetails',
  'isPublic',
] as const;
export type LoreReadField = (typeof loreReadFields)[number];
interface LoreReadIdentity {
  bookId: string;
  id: string;
  readToken: string;
}
type LoreRelations = { present: boolean; count: number; pages: number };
export type LoreReadHeader = LoreReadIdentity &
  (
    | {
        schemaVersion: 1;
        mode: 'inline' | 'payload';
        base: LoreReadManifest;
        relations: null | LoreRelations;
      }
    | {
        schemaVersion: 2;
        mode: 'payload';
        base: LoreReadManifest | null;
        relations: LoreRelations;
        fields: Partial<Record<LoreReadField, LoreReadManifest | null>>;
        dates: Partial<Record<'createdAt' | 'updatedAt', number>>;
      }
  );
export interface LoreReadItem {
  id: string;
  readToken: string;
}
export interface LoreReadList {
  schemaVersion: 1;
  bookId: string;
  listToken: string;
  items: LoreReadItem[];
  nextCursor: string | null;
}
export type LoreReadCall = (method: string, data: unknown) => Promise<unknown>;
export type LoreReadGuard = () => void;
export const invalidLoreRead = () =>
  new Error('Não foi possível conferir o lore completo. Reabra o compêndio.');
export function readObject(
  value: unknown,
  keys: string[],
  optional: string[] = [],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidLoreRead();
  const object = value as Record<string, unknown>;
  if (
    keys.some((key) => !Object.hasOwn(object, key)) ||
    Object.keys(object).some((key) => !keys.includes(key) && !optional.includes(key))
  )
    throw invalidLoreRead();
  return object;
}
export function readId(value: unknown): string {
  try {
    return bookContentId(value);
  } catch {
    throw invalidLoreRead();
  }
}
export function readHash(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw invalidLoreRead();
  return value;
}
export function readCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw invalidLoreRead();
  return value;
}
export function readManifest(value: unknown): LoreReadManifest {
  const r = readObject(value, ['schemaVersion', 'contentHash', 'byteLength', 'chunkCount']);
  const byteLength = readCount(r.byteLength),
    chunkCount = readCount(r.chunkCount);
  if (r.schemaVersion !== 1 || byteLength < 1 || chunkCount !== Math.ceil(byteLength / 65536))
    throw invalidLoreRead();
  return { schemaVersion: 1, contentHash: readHash(r.contentHash), byteLength, chunkCount };
}
export function readHeader(
  value: unknown,
  bookId: string,
  id: string,
  token?: string,
): LoreReadHeader {
  const version = readObject(
    value,
    [],
    ['schemaVersion', 'bookId', 'id', 'readToken', 'mode', 'base', 'relations', 'fields', 'dates'],
  ).schemaVersion;
  const r = readObject(value, [
    'schemaVersion',
    'bookId',
    'id',
    'readToken',
    'mode',
    'base',
    'relations',
    ...(version === 2 ? ['fields', 'dates'] : []),
  ]);
  const readToken = readHash(r.readToken);
  if (
    ![1, 2].includes(r.schemaVersion as number) ||
    r.bookId !== bookId ||
    r.id !== id ||
    (token !== undefined && readToken !== token) ||
    (r.mode !== 'inline' && r.mode !== 'payload')
  )
    throw invalidLoreRead();
  let relations: LoreReadHeader['relations'] = null;
  if (r.mode === 'payload') {
    const rel = readObject(r.relations, ['present', 'count', 'pages']),
      count = readCount(rel.count),
      pages = readCount(rel.pages);
    if (
      typeof rel.present !== 'boolean' ||
      (!rel.present && count !== 0) ||
      pages !== Math.ceil(count / 64)
    )
      throw invalidLoreRead();
    relations = { present: rel.present, count, pages };
  } else if (r.relations !== null) throw invalidLoreRead();
  if (r.schemaVersion === 2) {
    if (r.mode !== 'payload' || relations === null) throw invalidLoreRead();
    const rawFields = readObject(r.fields, [], [...loreReadFields]),
      fields: Partial<Record<LoreReadField, LoreReadManifest | null>> = {};
    for (const field of loreReadFields) {
      if (!Object.hasOwn(rawFields, field)) continue;
      const value = rawFields[field];
      if (value === null && (field === 'name' || field === 'category')) throw invalidLoreRead();
      fields[field] = value === null ? null : readManifest(value);
    }
    if (r.base === null && (!fields.name || !fields.category)) throw invalidLoreRead();
    const d = readObject(r.dates, [], ['createdAt', 'updatedAt']),
      dates: Partial<Record<'createdAt' | 'updatedAt', number>> = {};
    for (const key of ['createdAt', 'updatedAt'] as const)
      if (Object.hasOwn(d, key)) dates[key] = readCount(d[key]);
    if (Object.values(dates).some((value) => !Number.isFinite(new Date(value).getTime())))
      throw invalidLoreRead();
    return {
      schemaVersion: 2,
      bookId,
      id,
      readToken,
      mode: 'payload',
      base: r.base === null ? null : readManifest(r.base),
      relations,
      fields,
      dates,
    };
  }
  return {
    schemaVersion: 1,
    bookId,
    id,
    readToken,
    mode: r.mode,
    base: readManifest(r.base),
    relations,
  };
}
export function readList(value: unknown, bookId: string, token?: string): LoreReadList {
  const r = readObject(value, ['schemaVersion', 'bookId', 'listToken', 'items', 'nextCursor']),
    listToken = readHash(r.listToken);
  if (
    r.schemaVersion !== 1 ||
    r.bookId !== bookId ||
    (token !== undefined && listToken !== token) ||
    !Array.isArray(r.items) ||
    r.items.length > 50 ||
    !(
      r.nextCursor === null ||
      (typeof r.nextCursor === 'string' && /^[A-Za-z0-9_-]{1,10000}$/.test(r.nextCursor))
    ) ||
    (r.nextCursor !== null && r.items.length === 0)
  )
    throw invalidLoreRead();
  const items = r.items.map((value) => {
    const item = readObject(value, ['id', 'readToken']);
    return { id: readId(item.id), readToken: readHash(item.readToken) };
  });
  return { schemaVersion: 1, bookId, listToken, items, nextCursor: r.nextCursor };
}
