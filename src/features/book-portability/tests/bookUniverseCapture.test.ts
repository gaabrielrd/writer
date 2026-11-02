import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import type {
  BookUniverseApi,
  BookUniverseOrigin,
} from '../../../../functions/src/bookBackupUniverse.mjs';
import {
  captureBookBackupUniverse,
  verifyBookBackupUniverse,
  type BookBackupRecord,
} from '../index';
function fixture(
  origin: BookUniverseOrigin = {
    kind: 'reference',
    id: 'world',
    created: { seconds: 12, nanoseconds: 345 },
  },
) {
  const anchor = { schemaVersion: 1 as const, bookId: 'book', sourceToken: 'a'.repeat(64) };
  const state = {
    origin,
    universeToken: createHash('sha256').update(JSON.stringify(origin)).digest('hex'),
  };
  const api: BookUniverseApi = {
    getSource: vi.fn(() => Promise.resolve({ ...anchor })),
    read: vi.fn(() =>
      Promise.resolve({
        ...anchor,
        origin: structuredClone(state.origin),
        universeToken: state.universeToken,
      }),
    ),
  };
  const records: BookBackupRecord[] = [];
  const write = vi.fn((record: BookBackupRecord) => {
    records.push(record);
    return Promise.resolve();
  });
  return { anchor, state, api, records, write };
}
it('captures exact native origin once without private token, source UID, global bodies or grants', async () => {
  const f = fixture();
  const proof = await captureBookBackupUniverse({ bookId: 'book', api: f.api, write: f.write });
  await verifyBookBackupUniverse(proof, { api: f.api });
  expect(f.records).toHaveLength(1);
  expect(f.records[0]).toMatchObject({ kind: 'book-universe', id: 'book', part: 0 });
  expect(JSON.parse(new TextDecoder().decode(f.records[0]!.payload))).toEqual({
    schemaVersion: 1,
    origin: f.state.origin,
  });
  expect(new TextDecoder().decode(f.records[0]!.payload)).not.toContain(f.state.universeToken);
  expect(new TextDecoder().decode(f.records[0]!.payload)).not.toContain(f.anchor.sourceToken);
  expect(f.api.read).toHaveBeenLastCalledWith({
    bookId: 'book',
    sourceToken: f.anchor.sourceToken,
    expectedUniverseToken: f.state.universeToken,
  });
  expect(Object.isFrozen(proof)).toBe(true);
  expect(Object.isFrozen(proof.origin)).toBe(true);
  expect(proof.origin.kind === 'reference' && Object.isFrozen(proof.origin.created)).toBe(true);
});
it.each([{ kind: 'none' }, { kind: 'unavailable', id: 'world' }] as const)(
  'captures $kind without fabricating origin identity',
  async (origin) => {
    const f = fixture(origin),
      proof = await captureBookBackupUniverse({ bookId: 'book', api: f.api, write: f.write });
    expect(proof.origin).toEqual(origin);
    await verifyBookBackupUniverse(proof, { api: f.api });
    expect(new TextDecoder().decode(f.records[0]!.payload)).not.toContain('created');
  },
);
it('malformed descriptor/extra private fields or a mismatched source fail before writing', async () => {
  const good = fixture().state.origin;
  for (const origin of [
    null,
    {},
    { kind: 'none', id: 'world' },
    { kind: 'unavailable', id: 'world', name: 'Secret' },
    { ...good, ownerId: 'secret' },
    { kind: 'reference', id: 'world', created: { seconds: 1, nanoseconds: 1e9 } },
    { kind: 'reference', id: '../world', created: { seconds: 1, nanoseconds: 0 } },
  ]) {
    const f = fixture();
    vi.mocked(f.api.read).mockResolvedValue({
      ...f.anchor,
      origin,
      universeToken: f.state.universeToken,
    } as Awaited<ReturnType<BookUniverseApi['read']>>);
    await expect(
      captureBookBackupUniverse({ bookId: 'book', api: f.api, write: f.write }),
    ).rejects.toThrow('estrutura completa');
    expect(f.write).not.toHaveBeenCalled();
  }
  const f = fixture();
  vi.mocked(f.api.read).mockResolvedValue({
    ...f.anchor,
    sourceToken: 'b'.repeat(64),
    origin: good,
    universeToken: f.state.universeToken,
  });
  await expect(
    captureBookBackupUniverse({ bookId: 'book', api: f.api, write: f.write }),
  ).rejects.toThrow('estrutura completa');
  expect(f.write).not.toHaveBeenCalled();
});
it('changed token or changed descriptor with same token cannot validate the old proof', async () => {
  for (const change of ['token', 'origin']) {
    const f = fixture(),
      proof = await captureBookBackupUniverse({ bookId: 'book', api: f.api, write: f.write });
    if (change === 'token') f.state.universeToken = 'b'.repeat(64);
    else f.state.origin = { kind: 'unavailable', id: 'world' };
    await expect(verifyBookBackupUniverse(proof, { api: f.api })).rejects.toThrow(
      'estrutura completa',
    );
  }
});
it('proof and requested source are validated before remote I/O', async () => {
  const f = fixture(),
    proof = await captureBookBackupUniverse({ bookId: 'book', api: f.api, write: f.write }),
    calls = vi.mocked(f.api.read).mock.calls.length;
  for (const value of [
    { ...proof, universeToken: 'bad' },
    { ...proof, origin: { kind: 'future' } },
    { ...proof, extra: true },
    { ...proof, source: null },
  ]) {
    await expect(verifyBookBackupUniverse(value as typeof proof, { api: f.api })).rejects.toThrow(
      'estrutura completa',
    );
  }
  expect(f.api.read).toHaveBeenCalledTimes(calls);
  await expect(
    captureBookBackupUniverse({
      bookId: 'book',
      source: { ...f.anchor, bookId: 'other' },
      api: f.api,
      write: f.write,
    }),
  ).rejects.toThrow('estrutura completa');
});
it('sink is awaited and abort after writing prevents successful proof return', async () => {
  const f = fixture(),
    controller = new AbortController();
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    writing = new Promise<void>((resolve) => {
      entered = resolve;
    });
  const pending = captureBookBackupUniverse({
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
  expect(f.api.read).toHaveBeenCalledTimes(1);
  release();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(f.api.read).toHaveBeenCalledTimes(1);
});
it('transport failure propagates once and an aborted start performs no I/O', async () => {
  const f = fixture(),
    error = new Error('lost response'),
    controller = new AbortController();
  controller.abort();
  await expect(
    captureBookBackupUniverse({
      bookId: 'book',
      api: f.api,
      signal: controller.signal,
      write: f.write,
    }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(f.api.getSource).not.toHaveBeenCalled();
  vi.mocked(f.api.read).mockRejectedValueOnce(error);
  await expect(
    captureBookBackupUniverse({ bookId: 'book', api: f.api, write: f.write }),
  ).rejects.toBe(error);
  expect(f.api.read).toHaveBeenCalledTimes(1);
  expect(f.write).not.toHaveBeenCalled();
});
