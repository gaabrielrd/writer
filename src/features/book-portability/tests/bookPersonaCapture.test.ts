import { createHash, webcrypto } from 'node:crypto';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type {
  BookPersonaApi,
  BookPersonaScope,
} from '../../../../functions/src/bookBackupPersonas.mjs';
import { DEFAULT_PERSONAS } from '../../../../functions/src/personaProfile.mjs';
import {
  captureBookBackupPersonas,
  verifyBookBackupPersonas,
  type BookBackupRecord,
} from '../index';
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
type Row = {
  kind: BookPersonaScope;
  id: string;
  personaId: string | null;
  token: string;
  body: string;
};
function fixture(total = 2, used = true) {
  const anchor = { schemaVersion: 1 as const, bookId: 'book', sourceToken: 'a'.repeat(64) },
    rows: Row[] = [];
  function put(kind: BookPersonaScope, id: string, personaId: string | null) {
    const profile = {
      ...structuredClone(DEFAULT_PERSONAS[0]!),
      ...(personaId ? { id: personaId } : {}),
      archived: true,
    };
    const body = JSON.stringify({ schemaVersion: 1, scope: kind, ownerId: id, personaId, profile });
    rows.push({ kind, id, personaId, token: digest(kind + id + body), body });
  }
  put('book', 'book', used ? 'custom-used' : null);
  for (let i = 0; i < total; i++)
    put(
      'chapter',
      'chapter-' + String(i).padStart(3, '0'),
      used && i % 2 === 0 ? 'custom-used' : null,
    );
  if (used) put('scene-source', 'chapter-000', DEFAULT_PERSONAS[1]!.id);
  const api: BookPersonaApi = {
    getSource: vi.fn(() => Promise.resolve({ ...anchor })),
    list: vi.fn((input: Parameters<BookPersonaApi['list']>[0]) => {
      const selected = rows
          .filter((row) => row.kind === input.kind)
          .sort((a, b) => Buffer.compare(Buffer.from(a.id), Buffer.from(b.id))),
        start = input.cursor === null ? 0 : Number(input.cursor),
        items = selected.slice(start, start + 50);
      return Promise.resolve({
        ...anchor,
        kind: input.kind,
        items: items.map((row) => ({ id: row.id, personaId: row.personaId, itemToken: row.token })),
        nextCursor: start + 50 < selected.length ? String(start + 50) : null,
      });
    }),
    read: vi.fn((input: Parameters<BookPersonaApi['read']>[0]) => {
      const row = rows.find((row) => row.kind === input.kind && row.id === input.id)!;
      const bytes = Buffer.from(row.body);
      return Promise.resolve({
        ...anchor,
        kind: input.kind,
        id: input.id,
        itemToken: input.itemToken,
        index: input.index,
        chunkCount: 1,
        byteLength: bytes.length,
        contentHash: digest(row.body),
        chunkBase64: bytes.toString('base64'),
      });
    }),
  };
  return { anchor, rows, api, put };
}
function sink() {
  const records: BookBackupRecord[] = [];
  return {
    records,
    write: vi.fn((record: BookBackupRecord) => {
      records.push(record);
      return Promise.resolve();
    }),
  };
}
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());

it('captures per-binding profiles, archived/preset snapshots and counts without private proof or unused library', async () => {
  const f = fixture(),
    out = sink();
  const proof = await captureBookBackupPersonas({ bookId: 'book', api: f.api, write: out.write });
  await verifyBookBackupPersonas(proof, { api: f.api });
  expect(proof.owners).toEqual({ book: 1, chapter: 2, 'scene-source': 1 });
  expect(proof.bindings).toEqual({ book: 1, chapter: 1, 'scene-source': 1 });
  const records = out.records.filter((row) => row.kind === 'book-persona');
  expect(records).toHaveLength(3);
  expect(new Set(records.map((row) => row.id)).size).toBe(3);
  const values = records.map(
    (row) => JSON.parse(new TextDecoder().decode(row.payload)) as Record<string, unknown>,
  );
  expect(values[0]?.personaId).toBe('custom-used');
  expect((values[0]?.profile as Record<string, unknown>).archived).toBe(true);
  expect(values[2]?.scope).toBe('scene-source');
  expect(values[2]?.ownerId).toBe('chapter-000');
  expect(JSON.stringify(values)).not.toContain(f.anchor.sourceToken);
  expect(JSON.stringify(values)).not.toContain('itemToken');
  expect(out.records.at(-1)?.kind).toBe('book-personas');
});
it('more than 100 owners are traversed without truncation or dedupe-dependent loss', async () => {
  const f = fixture(107),
    out = sink();
  const proof = await captureBookBackupPersonas({ bookId: 'book', api: f.api, write: out.write });
  expect(proof.owners.chapter).toBe(107);
  expect(proof.bindings.chapter).toBe(54);
  expect(
    vi.mocked(f.api.list).mock.calls.filter(([input]) => input.kind === 'chapter'),
  ).toHaveLength(3);
  expect(out.records.filter((row) => row.kind === 'book-persona')).toHaveLength(56);
  await verifyBookBackupPersonas(proof, { api: f.api });
});
it('absent bindings produce explicit owner totals and no profile reads', async () => {
  const f = fixture(4, false),
    out = sink();
  const proof = await captureBookBackupPersonas({ bookId: 'book', api: f.api, write: out.write });
  expect(proof.bindings).toEqual({ book: 0, chapter: 0, 'scene-source': 0 });
  expect(proof.owners).toEqual({ book: 1, chapter: 4, 'scene-source': 0 });
  expect(out.records).toHaveLength(1);
  expect(f.api.read).not.toHaveBeenCalled();
});
it.each(['profile', 'binding', 'new-owner', 'removed-owner'] as const)(
  'final proof rejects %s changes while source stays unchanged',
  async (issue) => {
    const f = fixture(),
      out = sink();
    const proof = await captureBookBackupPersonas({ bookId: 'book', api: f.api, write: out.write });
    if (issue === 'profile') f.rows[0]!.token = digest('new native');
    if (issue === 'binding') {
      f.rows[2]!.personaId = 'custom-used';
      f.rows[2]!.token = digest('new binding');
    }
    if (issue === 'new-owner') f.put('chapter', 'new-owner', null);
    if (issue === 'removed-owner') f.rows.splice(1, 1);
    await expect(verifyBookBackupPersonas(proof, { api: f.api })).rejects.toThrow(
      'estrutura completa',
    );
  },
);
it('strict page shape/order/book singleton and foreign scopes fail before profile reads', async () => {
  for (const issue of ['null', 'singleton', 'scope', 'extra', 'cursor']) {
    const f = fixture(),
      out = sink(),
      original = f.api.list;
    f.api.list = vi.fn(async (input: Parameters<BookPersonaApi['list']>[0]) => {
      const page = await original(input);
      const invalid: unknown =
        issue === 'null'
          ? { ...page, items: [null] }
          : issue === 'singleton'
            ? { ...page, items: [] }
            : issue === 'scope'
              ? { ...page, kind: 'chapter' }
              : issue === 'extra'
                ? { ...page, path: 'other' }
                : { ...page, nextCursor: 'again' };
      return invalid as Awaited<ReturnType<BookPersonaApi['list']>>;
    });
    await expect(
      captureBookBackupPersonas({ bookId: 'book', api: f.api, write: out.write }),
    ).rejects.toThrow('estrutura completa');
    expect(f.api.read).not.toHaveBeenCalled();
  }
});
it('hash and envelope binding/profile whitelists reject corruption without final index', async () => {
  for (const issue of ['hash', 'owner', 'profile', 'extra', 'trait']) {
    const f = fixture(),
      out = sink(),
      row = f.rows[0]!;
    if (issue === 'hash') {
      const original = f.api.read;
      f.api.read = vi.fn(async (input: Parameters<BookPersonaApi['read']>[0]) => ({
        ...(await original(input)),
        contentHash: '0'.repeat(64),
      }));
    } else {
      const value = JSON.parse(row.body) as {
        ownerId: string;
        profile: Record<string, unknown> & { traits: Record<string, unknown>[] };
      };
      if (issue === 'owner') value.ownerId = 'other';
      if (issue === 'profile') value.profile.id = 'custom-other';
      if (issue === 'extra') value.profile.apiKey = 'DO NOT COPY';
      if (issue === 'trait') value.profile.traits[0]!.key = 'DO NOT COPY';
      row.body = JSON.stringify(value);
    }
    await expect(
      captureBookBackupPersonas({ bookId: 'book', api: f.api, write: out.write }),
    ).rejects.toThrow('estrutura completa');
    expect(out.records.some((row) => row.kind === 'book-personas')).toBe(false);
  }
});
it('sink pressure and abort prevent another request or index', async () => {
  const f = fixture(),
    controller = new AbortController();
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    writing = new Promise<void>((resolve) => {
      entered = resolve;
    });
  const pending = captureBookBackupPersonas({
    bookId: 'book',
    api: f.api,
    signal: controller.signal,
    write: async () => {
      entered();
      await gate;
      controller.abort();
    },
  });
  await writing;
  expect(f.api.list).toHaveBeenCalledTimes(1);
  expect(f.api.read).toHaveBeenCalledTimes(1);
  release();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(f.api.list).toHaveBeenCalledTimes(1);
  expect(f.api.read).toHaveBeenCalledTimes(1);
});
it('malformed proof counts fail before I/O and source reauthorization is required', async () => {
  const f = fixture(0, false),
    out = sink(),
    proof = await captureBookBackupPersonas({ bookId: 'book', api: f.api, write: out.write });
  const calls = vi.mocked(f.api.list).mock.calls.length;
  for (const invalid of [null, undefined, {}, { ...proof.owners, extra: 1 }]) {
    await expect(
      verifyBookBackupPersonas({ ...proof, owners: invalid } as typeof proof, { api: f.api }),
    ).rejects.toThrow('estrutura completa');
  }
  expect(f.api.list).toHaveBeenCalledTimes(calls);
  f.anchor.sourceToken = 'b'.repeat(64);
  await expect(verifyBookBackupPersonas(proof, { api: f.api })).rejects.toThrow(
    'estrutura completa',
  );
});
it('transport and sink errors propagate without retry and aborted start has no I/O', async () => {
  const f = fixture(),
    failure = new Error('lost response'),
    controller = new AbortController();
  controller.abort();
  await expect(
    captureBookBackupPersonas({
      bookId: 'book',
      api: f.api,
      signal: controller.signal,
      write: sink().write,
    }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(f.api.getSource).not.toHaveBeenCalled();
  vi.mocked(f.api.read).mockRejectedValueOnce(failure);
  await expect(
    captureBookBackupPersonas({ bookId: 'book', api: f.api, write: sink().write }),
  ).rejects.toBe(failure);
  expect(f.api.read).toHaveBeenCalledTimes(1);
  await expect(
    captureBookBackupPersonas({
      bookId: 'book',
      api: fixture().api,
      write: () => Promise.reject(failure),
    }),
  ).rejects.toBe(failure);
});

it('repeated or descending owner IDs fail rather than hiding a binding behind pagination', async () => {
  for (const reversed of [false, true]) {
    const f = fixture(2),
      out = sink(),
      original = f.api.list;
    f.api.list = vi.fn(async (input: Parameters<BookPersonaApi['list']>[0]) => {
      const value = await original(input);
      if (input.kind === 'chapter')
        value.items = reversed ? [...value.items].reverse() : [value.items[0]!, value.items[0]!];
      return value;
    });
    await expect(
      captureBookBackupPersonas({ bookId: 'book', api: f.api, write: out.write }),
    ).rejects.toThrow('estrutura completa');
    expect(out.records.some((record) => record.kind === 'book-personas')).toBe(false);
  }
});
