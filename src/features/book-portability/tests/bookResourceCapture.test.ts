import { createHash, webcrypto } from 'node:crypto';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type {
  BookResourceApi,
  BookResourceKind,
} from '../../../../functions/src/bookBackupResources.mjs';
import { BOOK_RESOURCE_KINDS } from '../../../../functions/src/bookBackupResources.mjs';
import {
  captureBookBackupResources,
  verifyBookBackupResources,
  type BookBackupRecord,
} from '../index';
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
function fixture(count = 2) {
  const anchor = { schemaVersion: 1 as const, bookId: 'book', sourceToken: 'a'.repeat(64) };
  const rows = new Map<
    string,
    { kind: BookResourceKind; parentId: string | null; id: string; token: string; body: string }
  >();
  function put(
    kind: BookResourceKind,
    parentId: string | null,
    id: string,
    data: Record<string, unknown>,
  ) {
    const body = JSON.stringify({ schemaVersion: 1, kind, parentId, id, data });
    rows.set(JSON.stringify([kind, parentId, id]), {
      kind,
      parentId,
      id,
      body,
      token: digest(body),
    });
  }
  for (let i = 0; i < count; i++) {
    const id = 'scene-' + String(i).padStart(3, '0');
    put('scene', null, id, {
      parentId: 'missing-chapter',
      archived: i === 0,
      rankA: 'a',
      rankB: 'b',
      title: id,
    });
    put('scene-body', id, 'current', {
      content: i ? 'ação 🌙' : '',
      hash: digest(i ? 'ação 🌙' : ''),
    });
  }
  if (count) {
    put('lore', null, 'entity', {
      name: 'Ana',
      details: 'Own lore',
      relations: [{ targetEntityId: 'universe:gone:missing', relationType: 'knows' }],
    });
    put('scene-control', null, 'unassigned', { rankSlot: 'B' });
    put('scene-planning', 'scene-000', 'current', {
      objective: 'Objetivo',
      conflict: 'Conflito',
      pointOfView: 'Ana',
    });
    for (const parentId of ['scene-000', ...(count > 1 ? ['scene-001'] : [])])
      put('scene-reference', parentId, 'same-ref', {
        kind: 'universe',
        scopeId: 'gone',
        entityId: 'missing',
      });
    put('scene-source', null, 'old-chapter', {
      hash: digest('original'),
      original: { content: 'original', createdAt: 1 },
    });
    put('arc', null, 'arc', {
      title: 'Arco',
      rankA: 'a',
      rankB: 'b',
      initialState: 'Início',
      objective: 'Meta',
      plannedOutcome: 'Fim',
    });
    put('milestone', 'arc', 'milestone', {
      arcId: 'arc',
      title: 'Marco',
      notes: 'Notas',
      rankA: 'a',
    });
    put('event', null, 'event', {
      title: 'Evento',
      description: 'Descrição',
      dateLabel: '3º dia do inverno',
      rankA: 'a',
    });
    put('narrative-control', null, 'control', { rankSlot: 'B', resource: { kind: 'arc' } });
    put('narrative-link', null, 'link', {
      source: { kind: 'arc', id: 'arc' },
      reference: {
        kind: 'lore',
        reference: { kind: 'universe', scopeId: 'gone', entityId: 'missing' },
      },
    });
  }
  const api: BookResourceApi = {
    getSource: vi.fn(() => Promise.resolve({ ...anchor })),
    list: vi.fn((input: Parameters<BookResourceApi['list']>[0]) => {
      const items = [...rows.values()]
        .filter((row) => row.kind === input.kind && row.parentId === input.parentId)
        .sort((a, b) => Buffer.compare(Buffer.from(a.id), Buffer.from(b.id)));
      const start = input.cursor === null ? 0 : Number(input.cursor);
      return Promise.resolve({
        ...anchor,
        kind: input.kind,
        parentId: input.parentId,
        items: items
          .slice(start, start + input.limit)
          .map((row) => ({ id: row.id, itemToken: row.token })),
        nextCursor: items.length > start + input.limit ? String(start + input.limit) : null,
      });
    }),
    read: vi.fn((input: Parameters<BookResourceApi['read']>[0]) => {
      const row = rows.get(JSON.stringify([input.kind, input.parentId, input.id]))!;
      const bytes = Buffer.from(row.body);
      return Promise.resolve({
        ...anchor,
        kind: input.kind,
        parentId: input.parentId,
        id: input.id,
        itemToken: input.itemToken,
        index: input.index,
        chunkCount: Math.ceil(bytes.length / 65536),
        byteLength: bytes.length,
        contentHash: digest(row.body),
        chunkBase64: bytes
          .subarray(input.index * 65536, (input.index + 1) * 65536)
          .toString('base64'),
      });
    }),
  };
  return { anchor, api, rows, put };
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
function envelopes(records: BookBackupRecord[]) {
  const ids = [
    ...new Set(records.filter((row) => row.kind !== 'book-resources').map((row) => row.id)),
  ];
  return ids.map(
    (id) =>
      JSON.parse(
        Buffer.concat(
          records.filter((row) => row.id === id).map((row) => Buffer.from(row.payload)),
        ).toString('utf8'),
      ) as {
        kind: BookResourceKind;
        parentId: string | null;
        id: string;
        data: Record<string, unknown>;
      },
  );
}
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it('captures all twelve types, archived/orphaned scenes, active ordering and colliding reference IDs with bounded pages', async () => {
  const f = fixture(57),
    out = sink();
  const proof = await captureBookBackupResources({ bookId: 'book', api: f.api, write: out.write });
  const data = envelopes(out.records);
  expect(proof.counts.scene).toBe(57);
  expect(proof.counts['scene-body']).toBe(57);
  expect(data.find((row) => row.kind === 'scene' && row.id === 'scene-000')?.data).toMatchObject({
    archived: true,
    parentId: 'missing-chapter',
  });
  expect(data.find((row) => row.kind === 'scene-control')?.data.rankSlot).toBe('B');
  expect(data.find((row) => row.kind === 'event')?.data.dateLabel).toBe('3º dia do inverno');
  expect(new Set(data.map((row) => row.kind))).toEqual(new Set(BOOK_RESOURCE_KINDS));
  const refs = out.records.filter((row) => row.kind === 'book-scene-reference');
  expect(refs).toHaveLength(2);
  expect(refs[0]!.id).not.toBe(refs[1]!.id);
  expect(refs.every((row) => /^[a-f0-9]{64}$/.test(row.id))).toBe(true);
  const count = vi.mocked(f.api.read).mock.calls.length;
  await verifyBookBackupResources(proof, { api: f.api });
  expect(f.api.read).toHaveBeenCalledTimes(count);
  expect(f.api.getSource).toHaveBeenLastCalledWith({
    bookId: 'book',
    expectedSourceToken: f.anchor.sourceToken,
  });
  expect(out.records.at(-1)?.kind).toBe('book-resources');
  expect(new TextDecoder().decode(out.records.at(-1)!.payload)).not.toContain(f.anchor.sourceToken);
});
it('large scene body is assembled exactly and emitted in 64 KiB parts, preserving BOM and Unicode', async () => {
  const f = fixture(1),
    out = sink(),
    text = '\ufeffação 🌙\u0000'.repeat(35000);
  f.put('scene-body', 'scene-000', 'current', { content: text, hash: digest(text) });
  await captureBookBackupResources({ bookId: 'book', api: f.api, write: out.write });
  expect(envelopes(out.records).find((row) => row.kind === 'scene-body')?.data.content).toBe(text);
  expect(out.records.every((record) => record.payload.length <= 65536)).toBe(true);
  expect(out.records.filter((row) => row.kind === 'book-scene-body').length).toBeGreaterThan(4);
});
it.each(['scene', 'scene-body', 'scene-planning', 'scene-reference', 'milestone'] as const)(
  'final scan rejects changed %s even with root token unchanged',
  async (kind) => {
    const f = fixture(),
      out = sink();
    const proof = await captureBookBackupResources({
      bookId: 'book',
      api: f.api,
      write: out.write,
    });
    const row = [...f.rows.values()].find((row) => row.kind === kind)!;
    row.token = digest('changed');
    await expect(verifyBookBackupResources(proof, { api: f.api })).rejects.toThrow(
      'estrutura completa',
    );
  },
);
it('missing required body, unexpected singleton ID and repeated child scopes cannot be accepted as empty prose', async () => {
  for (const issue of ['missing', 'id']) {
    const f = fixture(1),
      out = sink();
    const bodyKey = JSON.stringify(['scene-body', 'scene-000', 'current']);
    const row = f.rows.get(bodyKey)!;
    f.rows.delete(bodyKey);
    if (issue === 'id') f.put('scene-body', 'scene-000', 'other', { content: '' });
    await expect(
      captureBookBackupResources({ bookId: 'book', api: f.api, write: out.write }),
    ).rejects.toThrow('estrutura completa');
    expect(out.records.some((row) => row.kind === 'book-resources')).toBe(false);
    expect(row.id).toBe('current');
  }
});
it('valid transport hash cannot conceal an envelope for another parent', async () => {
  const f = fixture(1),
    out = sink(),
    row = f.rows.get(JSON.stringify(['scene-body', 'scene-000', 'current']))!;
  const data: unknown = JSON.parse(row.body);
  row.body = JSON.stringify({ ...(data as Record<string, unknown>), parentId: 'other' });
  await expect(
    captureBookBackupResources({ bookId: 'book', api: f.api, write: out.write }),
  ).rejects.toThrow('estrutura completa');
  expect(out.records.some((row) => row.kind === 'book-scene-body')).toBe(false);
});
it('sink backpressure and abort after a write stop further reads without retry or index', async () => {
  const f = fixture(),
    controller = new AbortController();
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    writing = new Promise<void>((resolve) => {
      entered = resolve;
    });
  const write = vi.fn(async () => {
    entered();
    await gate;
    controller.abort();
  });
  const pending = captureBookBackupResources({
    bookId: 'book',
    api: f.api,
    write,
    signal: controller.signal,
  });
  await writing;
  expect(f.api.list).toHaveBeenCalledTimes(1);
  expect(f.api.read).toHaveBeenCalledTimes(1);
  release();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(f.api.list).toHaveBeenCalledTimes(1);
  expect(f.api.read).toHaveBeenCalledTimes(1);
});
it('empty resource catalogue still needs final authorization and has explicit zero counts', async () => {
  const f = fixture(0),
    out = sink();
  const proof = await captureBookBackupResources({ bookId: 'book', api: f.api, write: out.write });
  expect(out.records).toHaveLength(1);
  expect(Object.values(proof.counts).every((value) => value === 0)).toBe(true);
  f.anchor.sourceToken = 'b'.repeat(64);
  await expect(verifyBookBackupResources(proof, { api: f.api })).rejects.toThrow(
    'estrutura completa',
  );
});

it('malformed singleton rows and proof counts fail before further I/O', async () => {
  const f = fixture(),
    out = sink();
  vi.mocked(f.api.list).mockImplementation((input) => {
    const response: unknown = {
      ...f.anchor,
      kind: input.kind,
      parentId: input.parentId,
      items: [null],
      nextCursor: null,
    };
    return Promise.resolve(response as Awaited<ReturnType<BookResourceApi['list']>>);
  });
  await expect(
    captureBookBackupResources({ bookId: 'book', api: f.api, write: out.write }),
  ).rejects.toThrow('estrutura completa');
  expect(f.api.read).not.toHaveBeenCalled();
  const empty = fixture(0),
    proof = await captureBookBackupResources({ bookId: 'book', api: empty.api, write: out.write });
  const calls = vi.mocked(empty.api.list).mock.calls.length;
  for (const counts of [null, undefined, {}, { ...proof.counts, extra: 1 }]) {
    const bad: unknown = { ...proof, counts };
    await expect(
      verifyBookBackupResources(bad as typeof proof, { api: empty.api }),
    ).rejects.toThrow('estrutura completa');
  }
  expect(empty.api.list).toHaveBeenCalledTimes(calls);
});
