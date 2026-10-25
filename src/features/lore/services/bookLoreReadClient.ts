import { freezeBookLoreEditSource, type BookLoreEditSource } from './bookLoreWritePlan';
import { validateBookBackupJSONItem } from '../../../../functions/src/bookBackupSchema.mjs';
import {
  invalidLoreRead,
  readId,
  readHash,
  readObject,
  readManifest,
  readHeader,
  readList,
  loreReadFields,
  type LoreReadField,
  type LoreReadCall,
  type LoreReadGuard,
  type LoreReadHeader,
  type LoreReadManifest,
  type LoreReadItem,
} from './bookLoreReadContracts';

export interface CompleteBookLore {
  id: string;
  data: Record<string, unknown>;
}
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function validateData(id: string, bookId: string, data: Record<string, unknown>) {
  try {
    validateBookBackupJSONItem(
      'book-lore',
      { schemaVersion: 1, kind: 'lore', parentId: null, id, data },
      bookId,
    );
  } catch {
    throw invalidLoreRead();
  }
}
/** In-memory authorized transport. No persistent cache and no partial collection result. */
export function createBookLoreReadClient(call: LoreReadCall, guard: LoreReadGuard) {
  const rpc = async (method: string, input: unknown) => {
    guard();
    const result = await call(method, input);
    guard();
    return result;
  };
  async function header(bookId: string, id: string, readToken?: string) {
    const value = await rpc('getBookLoreRead', {
      bookId,
      id,
      ...(readToken === undefined ? {} : { readToken }),
    });
    if (value === null && readToken === undefined) return null;
    return readHeader(value, bookId, id, readToken);
  }
  async function section(
    view: LoreReadHeader,
    kind: 'base' | 'relations' | 'field',
    page: number,
    field?: LoreReadField,
  ) {
    let manifest: LoreReadManifest | undefined =
      kind === 'base'
        ? (view.base ?? undefined)
        : kind === 'field' && view.schemaVersion === 2 && field
          ? (view.fields[field] ?? undefined)
          : undefined;
    const offset = kind === 'relations' ? page * 64 : null;
    const count = kind === 'relations' ? Math.min(64, view.relations!.count - page * 64) : null;
    const part = async (index: number) => {
      const raw = await rpc('readBookLorePart', {
        bookId: view.bookId,
        id: view.id,
        readToken: view.readToken,
        section: kind,
        ...(kind === 'field' ? { field } : {}),
        page,
        index,
      });
      const r = readObject(raw, [
        'schemaVersion',
        'bookId',
        'id',
        'readToken',
        'section',
        'page',
        'index',
        'manifest',
        'offset',
        'count',
        'chunkBase64',
        ...(kind === 'field' ? ['field'] : []),
      ]);
      const actual = readManifest(r.manifest);
      if (
        r.schemaVersion !== 1 ||
        r.bookId !== view.bookId ||
        r.id !== view.id ||
        r.readToken !== view.readToken ||
        r.section !== kind ||
        (kind === 'field' && r.field !== field) ||
        r.page !== page ||
        r.index !== index ||
        r.offset !== offset ||
        r.count !== count ||
        (manifest !== undefined && !equal(actual, manifest)) ||
        typeof r.chunkBase64 !== 'string' ||
        r.chunkBase64.length > 87384
      )
        throw invalidLoreRead();
      manifest ??= actual;
      let binary: string;
      try {
        binary = atob(r.chunkBase64);
        if (btoa(binary) !== r.chunkBase64) throw invalidLoreRead();
      } catch {
        throw invalidLoreRead();
      }
      if (binary.length !== Math.min(65536, manifest.byteLength - index * 65536))
        throw invalidLoreRead();
      return Uint8Array.from(binary, (c) => c.charCodeAt(0));
    };
    const first = await part(0);
    // Allocation follows the authenticated descriptor; platform failures never become empty lore.
    const expected = manifest!;
    const bytes = new Uint8Array(expected.byteLength);
    bytes.set(first);
    for (let start = 1; start < expected.chunkCount; start += 4) {
      const indexes = Array.from(
        { length: Math.min(4, expected.chunkCount - start) },
        (_, n) => start + n,
      );
      const settled = await Promise.allSettled(indexes.map(part));
      guard();
      const parts = settled.map((result) => {
        if (result.status === 'rejected') throw result.reason;
        return result.value;
      });
      parts.forEach((value, n) => bytes.set(value, indexes[n]! * 65536));
    }
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    guard();
    if (hash !== expected.contentHash) throw invalidLoreRead();
    let data: unknown;
    try {
      const json = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      data = JSON.parse(json);
      if (JSON.stringify(data) !== json) throw invalidLoreRead();
    } catch {
      throw invalidLoreRead();
    }
    return data;
  }
  async function capture(
    bookId: string,
    id: string,
    readToken?: string,
  ): Promise<BookLoreEditSource | null> {
    readId(bookId);
    readId(id);
    guard();
    const view = await header(bookId, id, readToken);
    if (!view) return null;
    const raw = view.base === null ? null : await section(view, 'base', 0);
    let data: Record<string, unknown>;
    if (view.mode === 'payload') {
      const base =
        raw === null && view.schemaVersion === 2
          ? null
          : readObject(
              raw,
              ['bookId', 'name', 'category', 'createdAt', 'updatedAt'],
              ['aliases', 'summary', 'details', 'isPublic', 'structuredDetails'],
            );
      if (base && base.bookId !== bookId) throw invalidLoreRead();
      data = base ? { ...base } : {};
      delete data.bookId;
      if (view.schemaVersion === 2) {
        if (base) validateData(id, bookId, data);
        for (const field of loreReadFields) {
          if (!Object.hasOwn(view.fields, field)) continue;
          if (view.fields[field] === null) delete data[field];
          else {
            const value = await section(view, 'field', 0, field);
            validateData(id, bookId, { name: '', category: 'other', [field]: value });
            data[field] = value;
          }
        }
        delete data.createdAt;
        delete data.updatedAt;
        Object.assign(data, view.dates);
      }
      const rel = view.relations!;
      if (rel.present) {
        const relations: unknown[] = [];
        for (let page = 0; page < rel.pages; page++) {
          const values = await section(view, 'relations', page),
            count = Math.min(64, rel.count - page * 64);
          if (!Array.isArray(values) || values.length !== count) throw invalidLoreRead();
          for (const value of values) relations.push(value);
        }
        if (relations.length !== rel.count) throw invalidLoreRead();
        data.relations = relations;
      }
    } else {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw invalidLoreRead();
      data = raw as Record<string, unknown>;
    }
    validateData(id, bookId, data);
    const final = await header(bookId, id, view.readToken);
    if (!equal(final, view)) throw invalidLoreRead();
    guard();
    return freezeBookLoreEditSource({ bookId, id, sourceToken: view.readToken, data });
  }
  async function get(
    bookId: string,
    id: string,
    readToken?: string,
  ): Promise<CompleteBookLore | null> {
    const source = await capture(bookId, id, readToken);
    return source ? { id: source.id, data: structuredClone(source.data) } : null;
  }
  async function ids(bookId: string, expectedToken?: string) {
    const items: LoreReadItem[] = [],
      seen = new Set<string>(),
      cursors = new Set<string>();
    let listToken = expectedToken,
      cursor: string | null = null;
    do {
      const page = readList(
        await rpc('listBookLoreRead', {
          bookId,
          limit: 50,
          ...(listToken === undefined ? {} : { listToken }),
          ...(cursor === null ? {} : { cursor }),
        }),
        bookId,
        listToken,
      );
      listToken = page.listToken;
      for (const item of page.items) {
        if (seen.has(item.id)) throw invalidLoreRead();
        seen.add(item.id);
        items.push(item);
      }
      cursor = page.nextCursor;
      if (cursor !== null) {
        if (cursors.has(cursor)) throw invalidLoreRead();
        cursors.add(cursor);
      }
    } while (cursor !== null);
    return { listToken: listToken, items };
  }
  async function list(bookId: string): Promise<CompleteBookLore[]> {
    readId(bookId);
    guard();
    const initial = await ids(bookId),
      result: CompleteBookLore[] = [];
    for (const item of initial.items) {
      const entity = await get(bookId, item.id, item.readToken);
      if (!entity) throw invalidLoreRead();
      result.push(entity);
    }
    const final = await ids(bookId, initial.listToken);
    if (!equal(final, initial)) throw invalidLoreRead();
    guard();
    return result;
  }
  async function metadata(bookId: string, id: string, readToken?: string) {
    readId(bookId);
    readId(id);
    if (readToken !== undefined) readHash(readToken);
    guard();
    return header(bookId, id, readToken);
  }
  return { get, list, capture, metadata };
}
