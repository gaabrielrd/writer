import { afterEach, expect, it, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import { createBookLoreReadClient } from '../services/bookLoreReadClient';

const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
type Input = Record<string, unknown>;
type RecordValue = {
  mode?: 'inline' | 'payload';
  data: Input;
  raw?: string;
  relations?: unknown[];
};
const token = (id: string) => sha('token-' + id);
const basic = () => ({
  name: 'Exact 🌙',
  category: 'character',
  aliases: ['', 'same', 'same'],
  summary: ' literal ',
  details: '\ufeffPrivate 🌙',
  structuredDetails: { notes: '' },
});
function fixture(records: Record<string, RecordValue> = { entity: { data: basic() } }) {
  vi.stubGlobal('crypto', webcrypto);
  const listToken = sha('list'),
    entries = new Map(
      Object.entries(records).map(([id, entry]) => {
        const mode = entry.mode ?? 'payload',
          { relations, ...fields } = entry.data;
        const allRelations = entry.relations ?? relations;
        const base =
          entry.raw ??
          JSON.stringify(
            mode === 'inline'
              ? entry.data
              : { ...fields, bookId: 'book', createdAt: 1, updatedAt: 1 },
          );
        const bodies = [
          Buffer.from(base),
          ...(Array.isArray(allRelations)
            ? Array.from({ length: Math.ceil(allRelations.length / 64) }, (_, page) =>
                Buffer.from(JSON.stringify(allRelations.slice(page * 64, (page + 1) * 64))),
              )
            : []),
        ];
        const manifest = (bytes: Buffer) => ({
          schemaVersion: 1,
          byteLength: bytes.length,
          chunkCount: Math.ceil(bytes.length / 65536),
          contentHash: sha(bytes),
        });
        return [id, { mode, allRelations, bodies, manifest }];
      }),
    );
  let intercept: ((method: string, input: Input, result: unknown) => unknown) | undefined;
  let active = 0,
    peak = 0;
  const call = vi.fn(async (method: string, input: unknown): Promise<unknown> => {
    active++;
    peak = Math.max(peak, active);
    try {
      await Promise.resolve();
      const r = input as Input,
        id = r.id as string,
        entry = entries.get(id);
      let result: unknown;
      if (method === 'listBookLoreRead') {
        const after = r.cursor
            ? Number(Buffer.from(r.cursor as string, 'base64url').toString('utf8'))
            : 0,
          ids = [...entries.keys()].sort(),
          selected = ids.slice(after, after + 50);
        result = {
          schemaVersion: 1,
          bookId: 'book',
          listToken,
          items: selected.map((id) => ({ id, readToken: token(id) })),
          nextCursor:
            after + 50 < ids.length ? Buffer.from(String(after + 50)).toString('base64url') : null,
        };
      } else if (method === 'getBookLoreRead') {
        result = entry
          ? {
              schemaVersion: 1,
              bookId: 'book',
              id,
              readToken: token(id),
              mode: entry.mode,
              base: entry.manifest(entry.bodies[0]!),
              relations:
                entry.mode === 'inline'
                  ? null
                  : {
                      present: entry.allRelations !== undefined,
                      count: (entry.allRelations as unknown[] | undefined)?.length ?? 0,
                      pages: Math.ceil(
                        ((entry.allRelations as unknown[] | undefined)?.length ?? 0) / 64,
                      ),
                    },
            }
          : null;
      } else if (method === 'readBookLorePart' && entry) {
        const page = r.page as number,
          index = r.index as number,
          body = entry.bodies[r.section === 'base' ? 0 : page + 1]!;
        result = {
          schemaVersion: 1,
          bookId: 'book',
          id,
          readToken: token(id),
          section: r.section,
          page,
          index,
          manifest: entry.manifest(body),
          offset: r.section === 'base' ? null : page * 64,
          count:
            r.section === 'base'
              ? null
              : Math.min(64, (entry.allRelations as unknown[]).length - page * 64),
          chunkBase64: body.subarray(index * 65536, (index + 1) * 65536).toString('base64'),
        };
      } else throw new Error('Unexpected fixture call');
      return intercept ? await intercept(method, r, result) : result;
    } finally {
      active--;
    }
  });
  let current = true;
  const guard = vi.fn(() => {
    if (!current) throw new Error('Context changed');
  });
  return {
    call,
    guard,
    client: createBookLoreReadClient(call, guard),
    entries,
    intercept: (fn: NonNullable<typeof intercept>) => {
      intercept = fn;
    },
    revoke: () => {
      current = false;
    },
    peak: () => peak,
  };
}
afterEach(() => vi.unstubAllGlobals());

it('hydrates literal Unicode above 8 MiB/128 parts, duplicates, optional fields and all relation pages with bounded concurrency', async () => {
  const data = {
    ...basic(),
    details: '\ufeff' + String.fromCodePoint(0x1f319).repeat(2300000),
    relations: Array.from({ length: 130 }, (_, i) => ({
      targetEntityId: i % 2 ? 'universe:world:target' : 'target',
      relationType: 'knows',
      ...(i % 3 ? {} : { description: '🌙'.repeat(3000) }),
    })),
  };
  const f = fixture({ entity: { data } }),
    result = await f.client.get('book', 'entity');
  expect(result?.data).toEqual({ ...data, createdAt: 1, updatedAt: 1 });
  expect(sha(result?.data.details as string)).toBe(sha(data.details));
  expect(f.call.mock.calls.filter(([name]) => name === 'readBookLorePart').length).toBeGreaterThan(
    128,
  );
  expect(f.peak()).toBe(4);
  expect(f.call.mock.calls.at(-1)).toEqual([
    'getBookLoreRead',
    { bookId: 'book', id: 'entity', readToken: token('entity') },
  ]);
});
it.each(['inline', 'payload'] as const)(
  'preserves missing versus empty fields/relations in %s',
  async (mode) => {
    for (const present of [false, true]) {
      const f = fixture({
        entity: {
          mode,
          data: {
            name: '',
            category: 'other',
            ...(present ? { relations: [], aliases: [], structuredDetails: {} } : {}),
          },
        },
      });
      const value = (await f.client.get('book', 'entity'))!.data;
      expect(Object.hasOwn(value, 'relations')).toBe(present);
      expect(Object.hasOwn(value, 'aliases')).toBe(present);
      expect(Object.hasOwn(value, 'summary')).toBe(false);
      expect(Object.hasOwn(value, 'createdAt')).toBe(mode === 'payload');
      if (present) expect(value.relations).toEqual([]);
    }
  },
);
it('returns null only for an unpinned missing entity', async () => {
  const f = fixture();
  expect(await f.client.get('book', 'missing')).toBeNull();
  await expect(f.client.get('book', 'missing', token('missing'))).rejects.toThrow('conferir');
});
it.each([
  ['schemaVersion', 2],
  ['bookId', 'other'],
  ['id', 'other'],
  ['readToken', 'bad'],
  ['mode', 'unknown'],
  ['mode', { toString: () => 'inline' }],
  ['relations', { present: false, count: 1, pages: 1 }],
  ['base', { schemaVersion: 1, contentHash: 'f'.repeat(64), byteLength: 1, chunkCount: 0 }],
  ['extra', true],
])('rejects a malformed or cross-scope header %s', async (field, value) => {
  const f = fixture();
  f.intercept((method, _input, result) =>
    method === 'getBookLoreRead' ? { ...(result as Input), [field]: value } : result,
  );
  await expect(f.client.get('book', 'entity')).rejects.toThrow('conferir');
});
it.each([
  ['bookId', 'other'],
  ['id', 'other'],
  ['readToken', 'a'.repeat(64)],
  ['section', 'relations'],
  ['page', 1],
  ['index', 1],
  ['offset', 0],
  ['count', 0],
  ['chunkBase64', '?'],
  ['chunkBase64', 'eA'],
  ['manifest', { schemaVersion: 1, byteLength: 5, chunkCount: 1, contentHash: 'a'.repeat(64) }],
  ['extra', true],
])('rejects a malformed/mixed part %s', async (field, value) => {
  const f = fixture();
  f.intercept((method, _input, result) =>
    method === 'readBookLorePart' ? { ...(result as Input), [field]: value } : result,
  );
  await expect(f.client.get('book', 'entity')).rejects.toThrow('conferir');
});
it('checks the complete SHA, not only base64 shape and part lengths', async () => {
  const f = fixture();
  f.intercept((method, _input, result) => {
    if (method !== 'readBookLorePart') return result;
    const value = result as Input,
      bytes = Buffer.from(value.chunkBase64 as string, 'base64');
    bytes[0] = 0;
    return { ...value, chunkBase64: bytes.toString('base64') };
  });
  await expect(f.client.get('book', 'entity')).rejects.toThrow('conferir');
});
it.each([
  '{"name":"A","name":"B","category":"other"}',
  '{"name":"A","category":"other","payloadStorage":{}}',
  '{"name":"A","category":"other","aliases":[1]}',
  '{"name":"A","category":"other","relations":[{"targetEntityId":"bad/path","relationType":"x"}]}',
  '{"name":"A","category":"other","structuredDetails":{"secret":"x"}}',
])('rejects noncanonical JSON or invalid domain despite matching SHA (%s)', async (raw) => {
  const f = fixture({ entity: { mode: 'inline', data: {}, raw } });
  await expect(f.client.get('book', 'entity')).rejects.toThrow('conferir');
});
it('rejects invalid UTF-8 even with matching SHA and byte length', async () => {
  const f = fixture({ entity: { mode: 'inline', data: {} } }),
    entry = f.entries.get('entity')!;
  entry.bodies[0] = Buffer.from([0xc3, 0x28]);
  await expect(f.client.get('book', 'entity')).rejects.toThrow('conferir');
});
it.each(['bookId', 'relations'])(
  'rejects payload base scope or inline relation smuggling (%s)',
  async (field) => {
    const base = {
      name: 'A',
      category: 'other',
      bookId: 'book',
      createdAt: 1,
      updatedAt: 1,
      [field]: field === 'bookId' ? 'other' : [],
    };
    const f = fixture({ entity: { data: {}, raw: JSON.stringify(base) } });
    await expect(f.client.get('book', 'entity')).rejects.toThrow('conferir');
  },
);
it('rejects a relation page whose JSON count differs from its authenticated descriptor', async () => {
  const f = fixture({
    entity: {
      data: basic(),
      relations: Array.from({ length: 65 }, () => ({ targetEntityId: 'x', relationType: 'knows' })),
    },
  });
  f.entries.get('entity')!.bodies[1] = Buffer.from('[]');
  await expect(f.client.get('book', 'entity')).rejects.toThrow('conferir');
});
it('reconfirms the complete header after all bytes instead of accepting a changed descriptor under the same token', async () => {
  const f = fixture();
  let headers = 0;
  f.intercept((method, _input, result) =>
    method === 'getBookLoreRead' && ++headers === 2
      ? { ...(result as Input), relations: { present: true, count: 0, pages: 0 } }
      : result,
  );
  await expect(f.client.get('book', 'entity')).rejects.toThrow('conferir');
});
it.each(['getBookLoreRead', 'readBookLorePart'])(
  'rejects a response that arrives after context revocation during %s',
  async (method) => {
    const f = fixture();
    f.intercept((name, _input, result) => {
      if (name === method) f.revoke();
      return result;
    });
    await expect(f.client.get('book', 'entity')).rejects.toThrow('Context changed');
  },
);
it('guards before any call and refuses to restart a canceled operation', async () => {
  const f = fixture();
  f.revoke();
  await expect(f.client.get('book', 'entity')).rejects.toThrow('Context changed');
  await expect(f.client.list('book')).rejects.toThrow('Context changed');
  expect(f.call).not.toHaveBeenCalled();
});
it('invalid scope fails without a network request', async () => {
  const f = fixture();
  await expect(f.client.get('../bad', 'entity')).rejects.toThrow('conferir');
  expect(f.call).not.toHaveBeenCalled();
});
it('loads all IDs across pages, includes nameless physical payloads, and finally rechecks IDs and tokens', async () => {
  const records = Object.fromEntries(
    Array.from({ length: 138 }, (_, i) => [
      'e' + String(i).padStart(3, '0'),
      { data: { name: 'n' + i, category: 'other' } },
    ]),
  );
  const f = fixture(records),
    values = await f.client.list('book');
  expect(values).toHaveLength(138);
  expect(values[137]!.id).toBe('e137');
  expect(f.call.mock.calls.filter(([method]) => method === 'listBookLoreRead')).toHaveLength(6);
  expect(f.call.mock.calls.filter(([method]) => method === 'getBookLoreRead')).toHaveLength(276);
});
it('reauthorizes an empty collection before returning it', async () => {
  const f = fixture({});
  expect(await f.client.list('book')).toEqual([]);
  expect(f.call).toHaveBeenCalledTimes(2);
});
it.each(['id', 'readToken', 'listToken'])(
  'never returns a partial or mixed collection when final %s changes',
  async (field) => {
    const f = fixture();
    let lists = 0;
    f.intercept((method, _input, result) => {
      if (method !== 'listBookLoreRead' || ++lists !== 2) return result;
      const r = result as Input;
      return field === 'listToken'
        ? { ...r, listToken: sha('changed') }
        : {
            ...r,
            items: [
              {
                id: 'entity',
                readToken: token('entity'),
                [field]: field === 'id' ? 'other' : sha('new'),
              },
            ],
          };
    });
    await expect(f.client.list('book')).rejects.toThrow('conferir');
  },
);
it.each(['duplicate', 'cursor-cycle', 'empty-cursor', 'wrong-scope'])(
  'rejects invalid pagination %s',
  async (mode) => {
    const f = fixture();
    f.intercept((method, _input, result) => {
      if (method !== 'listBookLoreRead') return result;
      const r = result as Input;
      if (mode === 'duplicate')
        return { ...r, items: [...(r.items as unknown[]), ...(r.items as unknown[])] };
      if (mode === 'empty-cursor') return { ...r, items: [], nextCursor: 'MQ' };
      if (mode === 'wrong-scope') return { ...r, bookId: 'other' };
      return {
        ...r,
        items: [{ id: Math.random().toString(36), readToken: token('entity') }],
        nextCursor: 'MQ',
      };
    });
    await expect(f.client.list('book')).rejects.toThrow('conferir');
  },
);
it('propagates a server error without treating unavailable lore as empty or retrying forever', async () => {
  const f = fixture();
  f.intercept(() => {
    throw new Error('Unavailable');
  });
  await expect(f.client.list('book')).rejects.toThrow('Unavailable');
  expect(f.call).toHaveBeenCalledTimes(1);
});

it('drains every in-flight part after a failure before the operation can finish or refresh', async () => {
  const f = fixture({ entity: { data: { ...basic(), details: 'x'.repeat(400000) } } });
  const releases: (() => void)[] = [];
  f.intercept((method, input, result) => {
    if (method !== 'readBookLorePart' || input.index === 0) return result;
    if (input.index === 1) throw new Error('part failed');
    return new Promise((resolve) => releases.push(() => resolve(result)));
  });
  let finished = false;
  const result = f.client.get('book', 'entity').finally(() => {
    finished = true;
  });
  const rejected = expect(result).rejects.toThrow('part failed');
  await vi.waitFor(() => expect(releases).toHaveLength(3));
  expect(finished).toBe(false);
  expect(f.peak()).toBe(4);
  releases.forEach((release) => release());
  await rejected;
  expect(f.call.mock.calls.filter(([method]) => method === 'readBookLorePart')).toHaveLength(5);
});

it('capture retains the reconfirmed readToken and raw immutable presences for an edit', async () => {
  const f = fixture({
      entity: { mode: 'inline', data: { name: '  🌙 ', category: 'other', relations: [] } },
    }),
    captured = await f.client.capture('book', 'entity');
  expect(captured).toEqual({
    bookId: 'book',
    id: 'entity',
    sourceToken: token('entity'),
    data: { name: '  🌙 ', category: 'other', relations: [] },
  });
  expect(Object.isFrozen(captured)).toBe(true);
  expect(Object.isFrozen(captured!.data.relations)).toBe(true);
  expect(Object.hasOwn(captured!.data, 'details')).toBe(false);
  expect(f.call.mock.calls.at(-1)).toEqual([
    'getBookLoreRead',
    { bookId: 'book', id: 'entity', readToken: token('entity') },
  ]);
});
it('capture never returns an observed CAS when final reconfirmation changes', async () => {
  const f = fixture();
  let headers = 0;
  f.intercept((method, _input, result) =>
    method === 'getBookLoreRead' && ++headers === 2
      ? { ...(result as Record<string, unknown>), readToken: 'b'.repeat(64) }
      : result,
  );
  await expect(f.client.capture('book', 'entity')).rejects.toThrow();
});
it('capture respects account revocation while assembling source bytes', async () => {
  const f = fixture();
  f.intercept((method, _input, result) => {
    if (method === 'readBookLorePart') f.revoke();
    return result;
  });
  await expect(f.client.capture('book', 'entity')).rejects.toThrow('Context changed');
});

it('captureList keeps each original immutable C1 token and absent fields after whole-list verification', async () => {
  const f = fixture({
    first: { mode: 'inline', data: { name: '  literal ', category: 'other' } },
    second: { mode: 'payload', data: { ...basic(), relations: [] } },
  });
  const values = await f.client.captureList('book');
  expect(values.map((v) => [v.id, v.sourceToken])).toEqual([
    ['first', token('first')],
    ['second', token('second')],
  ]);
  expect(values[0]!.data).toEqual({ name: '  literal ', category: 'other' });
  expect(Object.isFrozen(values)).toBe(true);
  expect(Object.isFrozen(values[1]!.data)).toBe(true);
  expect(f.call.mock.calls.at(-1)?.[0]).toBe('listBookLoreRead');
});
it('captureList cannot return a partial collection after final list changes', async () => {
  const f = fixture();
  let lists = 0;
  f.intercept((method, _input, result) =>
    method === 'listBookLoreRead' && ++lists === 2
      ? { ...(result as Record<string, unknown>), listToken: 'f'.repeat(64) }
      : result,
  );
  await expect(f.client.captureList('book')).rejects.toThrow();
});

it('captures a whole collection proof and revalidates only metadata without downloading its bodies again', async () => {
  const f = fixture({ first: { data: basic() }, second: { data: basic() } });
  const capture = await f.client.captureCollection('book');
  expect(Object.isFrozen(capture)).toBe(true);
  expect(capture.listToken).toBe(sha('list'));
  f.call.mockClear();
  await f.client.verifyCollection(capture);
  expect(f.call.mock.calls.map(([method]) => method)).toEqual([
    'listBookLoreRead',
    'getBookLoreRead',
    'getBookLoreRead',
    'listBookLoreRead',
  ]);
});
it.each(['clock', 'token', 'revoked', 'last-page'])(
  'collection verification rejects %s before publication without a body fallback',
  async (change) => {
    const f = fixture(),
      capture = await f.client.captureCollection('book');
    f.call.mockClear();
    let pages = 0;
    f.intercept((method, _input, result) => {
      if (method === 'getBookLoreRead' && change === 'revoked') throw new Error('Revoked origin');
      if (method === 'getBookLoreRead' && change === 'token')
        return { ...(result as Input), readToken: sha('other') };
      if (
        method === 'listBookLoreRead' &&
        (change === 'clock' || (change === 'last-page' && ++pages === 2))
      )
        return { ...(result as Input), listToken: sha('other-list') };
      return result;
    });
    await expect(f.client.verifyCollection(capture)).rejects.toThrow();
    expect(f.call.mock.calls.some(([name]) => name === 'readBookLorePart')).toBe(false);
  },
);
it('empty collection verification preserves its clock and checks authorization without inventing a source', async () => {
  const f = fixture({}),
    capture = await f.client.captureCollection('book');
  expect(capture.sources).toEqual([]);
  await f.client.verifyCollection(capture);
  f.revoke();
  await expect(f.client.verifyCollection(capture)).rejects.toThrow('Context changed');
});
