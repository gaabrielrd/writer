import { expect, it, vi } from 'vitest';
import { createBookLoreReadClient } from '../services/bookLoreReadClient';

function fixture(count = 17) {
  const rows = Array.from({ length: count }, (_, n) => ({
    id: 'id-' + n,
    readToken: 'a'.repeat(64),
    name: 'Name ' + n,
    category: 'character',
    aliases: ['', 'literal'],
    summary: 'exact summary',
    isPublic: false,
    relationCount: 3,
  }));
  const call = vi.fn((_method: string, input: unknown): Promise<unknown> => {
    const r = input as Record<string, unknown>;
    const offset = r.cursor ? Number(r.cursor) : 0,
      items = rows.slice(offset, offset + 50);
    return Promise.resolve({
      schemaVersion: r.projection === 'summary' ? 2 : 1,
      bookId: 'book',
      listToken: 'b'.repeat(64),
      items:
        r.projection === 'summary' ? items : items.map(({ id, readToken }) => ({ id, readToken })),
      nextCursor: offset + 50 < count ? String(offset + 50) : null,
    });
  });
  const guard = vi.fn();
  return { rows, call, guard, client: createBookLoreReadClient(call, guard) };
}
it('lists 17 summaries in two calls without fetching any full fiches', async () => {
  const f = fixture(),
    rows = await f.client.listSummaries('book');
  expect(rows).toHaveLength(17);
  expect(rows[0]).toEqual({
    bookId: 'book',
    id: 'id-0',
    sourceToken: 'a'.repeat(64),
    name: 'Name 0',
    category: 'character',
    aliases: ['', 'literal'],
    summary: 'exact summary',
    isPublic: false,
    relationCount: 3,
  });
  expect(f.call.mock.calls.map(([method]) => method)).toEqual([
    'listBookLoreRead',
    'listBookLoreRead',
  ]);
  expect(f.call.mock.calls[0]![1]).toMatchObject({ projection: 'summary', tokenVersion: 2 });
  expect(f.call.mock.calls[1]![1]).toMatchObject({ listToken: 'b'.repeat(64), tokenVersion: 2 });
});
it('pages past 50 items then verifies the whole selection without dropping tokens', async () => {
  const f = fixture(53),
    rows = await f.client.listSummaries('book');
  expect(rows).toHaveLength(53);
  expect(rows.at(-1)?.id).toBe('id-52');
  expect(f.call).toHaveBeenCalledTimes(4);
});
it.each(['name', 'details', 'relationCount', 'category', 'readToken'])(
  'rejects malformed or unexpected summary field %s',
  async (field) => {
    const f = fixture();
    Object.assign(f.rows[0]!, { [field]: field === 'relationCount' ? -1 : null });
    await expect(f.client.listSummaries('book')).rejects.toThrow();
  },
);
it('rejects changed final tokens instead of publishing a partial or stale list', async () => {
  const f = fixture();
  f.call.mockImplementationOnce(() => {
    const result = {
      schemaVersion: 2,
      bookId: 'book',
      listToken: 'b'.repeat(64),
      items: structuredClone(f.rows),
      nextCursor: null,
    };
    f.rows[0]!.readToken = 'c'.repeat(64);
    return Promise.resolve(result);
  });
  await expect(f.client.listSummaries('book')).rejects.toThrow();
});
it('stops after the current request if the actor or book context changes', async () => {
  const f = fixture(53);
  f.guard
    .mockImplementationOnce(() => {})
    .mockImplementation(() => {
      throw Error('changed actor');
    });
  await expect(f.client.listSummaries('book')).rejects.toThrow('changed actor');
  expect(f.call).toHaveBeenCalledTimes(1);
});
