import { validateBookBackupJSONItem } from '../../../../functions/src/bookBackupSchema.mjs';
import {
  invalidLoreRead,
  readId,
  readObject,
  readManifest,
  readHeader,
  readList,
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
  async function section(view: LoreReadHeader, kind: 'base' | 'relations', page: number) {
    let manifest: LoreReadManifest | undefined = kind === 'base' ? view.base : undefined;
    const offset = kind === 'base' ? null : page * 64;
    const count = kind === 'base' ? null : Math.min(64, view.relations!.count - page * 64);
    const part = async (index: number) => {
      const raw = await rpc('readBookLorePart', {
        bookId: view.bookId,
        id: view.id,
        readToken: view.readToken,
        section: kind,
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
      ]);
      const actual = readManifest(r.manifest);
      if (
        r.schemaVersion !== 1 ||
        r.bookId !== view.bookId ||
        r.id !== view.id ||
        r.readToken !== view.readToken ||
        r.section !== kind ||
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
  async function get(
    bookId: string,
    id: string,
    readToken?: string,
  ): Promise<CompleteBookLore | null> {
    readId(bookId);
    readId(id);
    guard();
    const view = await header(bookId, id, readToken);
    if (!view) return null;
    const raw = await section(view, 'base', 0);
    let data: Record<string, unknown>;
    if (view.mode === 'payload') {
      const base = readObject(
        raw,
        ['bookId', 'name', 'category', 'createdAt', 'updatedAt'],
        ['aliases', 'summary', 'details', 'isPublic', 'structuredDetails'],
      );
      if (base.bookId !== bookId) throw invalidLoreRead();
      data = { ...base };
      delete data.bookId;
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
    try {
      validateBookBackupJSONItem(
        'book-lore',
        { schemaVersion: 1, kind: 'lore', parentId: null, id, data },
        bookId,
      );
    } catch {
      throw invalidLoreRead();
    }
    const final = await header(bookId, id, view.readToken);
    if (!equal(final, view)) throw invalidLoreRead();
    guard();
    return { id, data };
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
  return { get, list };
}
