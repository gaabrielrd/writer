// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { createBookLoreReadClient } from '../services/bookLoreReadClient.ts';
import { createBookLoreReadService } from '../../../../functions/src/bookLoreRead.mjs';
import { adventureImportDb } from '../../../../functions/test/helpers/adventureImportDb.mjs';
import { seedBookLoreRead } from '../../../../functions/test/helpers/bookLoreReadFixture.mjs';

afterEach(() => vi.unstubAllGlobals());
const plain = { name: 'Literal 🌙', category: 'other', details: '\ufeff' + '字'.repeat(60000) };
async function fixture(options) {
  vi.stubGlobal('crypto', webcrypto);
  const f = adventureImportDb({ nativeUpdates: true }),
    seed = await seedBookLoreRead(f.db, { data: plain }),
    api = createBookLoreReadService({ db: f.db }),
    call = vi.fn((name, input) => api[name]('author', input)),
    client = createBookLoreReadClient(call, () => {}, options);
  return { ...f, seed, api, call, client };
}
const clock = (f) =>
  f.db.runTransaction(async (tx) => tx.update(f.db.doc('books/book'), { localLoreVersion: 1 }));
const scope = { bookId: 'book', id: 'entity' };

it('default client preserves the legacy wire and does not request independent tokens', async () => {
  const f = await fixture();
  await f.client.capture('book', 'entity');
  expect(f.call.mock.calls.every(([, input]) => !Object.hasOwn(input, 'tokenVersion'))).toBe(true);
});

it('independent capture survives a sibling mutation during assembly and preserves complete literal bytes', async () => {
  const f = await fixture({ tokenVersion: 2 });
  let changed = false;
  f.call.mockImplementation(async (name, input) => {
    const result = await f.api[name]('author', input);
    if (name === 'readBookLorePart' && !changed) {
      changed = true;
      await clock(f);
    }
    return result;
  });
  const captured = await f.client.capture('book', 'entity');
  expect(captured.data.details).toBe(plain.details);
  const headers = f.call.mock.calls.filter(([name]) => name === 'getBookLoreRead');
  expect(headers[0][1]).toEqual({ ...scope, tokenVersion: 2 });
  expect(headers.at(-1)[1]).toEqual({ ...scope, readToken: captured.sourceToken });
  expect((await f.client.metadata('book', 'entity', captured.sourceToken)).readToken).toBe(
    captured.sourceToken,
  );
});

it('an independent client honors a pinned v1 source and never negotiates a new token after conflict', async () => {
  const f = await fixture({ tokenVersion: 2 }),
    old = await f.api.getBookLoreRead('author', scope);
  expect((await f.client.capture('book', 'entity', old.readToken)).sourceToken).toBe(old.readToken);
  await clock(f);
  await expect(f.client.capture('book', 'entity', old.readToken)).rejects.toThrow();
  const headers = f.call.mock.calls.filter(([name]) => name === 'getBookLoreRead');
  expect(
    headers.every(
      ([, input]) => input.readToken === old.readToken && !Object.hasOwn(input, 'tokenVersion'),
    ),
  ).toBe(true);
});

it('a default client can resume the exact independent token without changing the original expectation', async () => {
  const f = await fixture(),
    original = await f.api.getBookLoreRead('author', { ...scope, tokenVersion: 2 });
  await clock(f);
  expect((await f.client.capture('book', 'entity', original.readToken)).sourceToken).toBe(
    original.readToken,
  );
  expect(f.call.mock.calls.every(([, input]) => !Object.hasOwn(input, 'tokenVersion'))).toBe(true);
});

it('independent listing keeps both global collection verification passes and has no fifty-fiche ceiling', async () => {
  const f = await fixture({ tokenVersion: 2 });
  for (let i = 0; i < 52; i++)
    await seedBookLoreRead(f.db, {
      id: 'other-' + String(i).padStart(3, '0'),
      inline: true,
      data: { name: '', category: 'other' },
    });
  const rows = await f.client.list('book'),
    lists = f.call.mock.calls.filter(([name]) => name === 'listBookLoreRead');
  expect(rows).toHaveLength(53);
  expect(new Set(rows.map((r) => r.id)).size).toBe(53);
  expect(lists).toHaveLength(4);
  expect(lists.every(([, input]) => input.tokenVersion === 2 && input.limit === 50)).toBe(true);
});

it('independent fiche reads never turn a changed collection into a successful partial list', async () => {
  const f = await fixture({ tokenVersion: 2 });
  let changed = false;
  f.call.mockImplementation(async (name, input) => {
    const result = await f.api[name]('author', input);
    if (name === 'readBookLorePart' && !changed) {
      changed = true;
      await clock(f);
    }
    return result;
  });
  await expect(f.client.list('book')).rejects.toThrow();
  expect(f.call.mock.calls.filter(([name]) => name === 'getBookLoreRead')).toHaveLength(2);
  expect(f.call.mock.calls.filter(([name]) => name === 'listBookLoreRead')).toHaveLength(2);
});

for (const change of ['head', 'authorization'])
  it(
    'independent capture refuses ' + change + ' during assembly without returning partial prose',
    async () => {
      const f = await fixture({ tokenVersion: 2 });
      let changed = false;
      f.call.mockImplementation(async (name, input) => {
        const result = await f.api[name]('author', input);
        if (name === 'readBookLorePart' && !changed) {
          changed = true;
          await f.db.runTransaction(async (tx) =>
            tx.update(
              f.db.doc(change === 'head' ? f.seed.path : 'books/book'),
              change === 'head' ? { name: 'Changed' } : { authorId: 'other' },
            ),
          );
        }
        return result;
      });
      await expect(f.client.capture('book', 'entity')).rejects.toThrow();
    },
  );

it('invalid or unknown client negotiation options fail before the transport runs', () => {
  const call = vi.fn();
  for (const options of [
    { tokenVersion: 0 },
    { tokenVersion: '2' },
    { tokenVersion: 3 },
    { tokenVersion: null },
    { unsafe: true },
    null,
  ])
    expect(() => createBookLoreReadClient(call, () => {}, options)).toThrow();
  expect(call).not.toHaveBeenCalled();
});
