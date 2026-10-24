// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  bookLoreJournalSession,
  listBookLoreJournals,
} from '../services/bookLoreJournalSession.ts';
const state = vi.hoisted(() => ({
  auth: { currentUser: null },
  appCheck: { app: 'verified' },
  getToken: vi.fn(),
  idToken: vi.fn(),
  fetch: vi.fn(),
  create: vi.fn(),
  open: vi.fn(),
  list: vi.fn(),
}));
vi.mock('@/shared/lib', () => ({
  auth: state.auth,
  get appCheck() {
    return state.appCheck;
  },
}));
vi.mock('firebase/app-check', () => ({ getToken: state.getToken }));
vi.mock('../services/bookLoreJournal.ts', () => ({
  createBookLoreJournal: (...args) => state.create(...args),
  openBookLoreJournal: (...args) => state.open(...args),
}));
vi.mock('../services/bookLoreJournalDb.ts', () => ({
  listJournalHeads: (...args) => state.list(...args),
}));
const raw = Uint8Array.from({ length: 32 }, (_, n) => n + 1),
  base64 = Buffer.from(raw).toString('base64'),
  identity = {
    schemaVersion: 1,
    uid: 'author',
    writeId: 'draft',
    bookId: 'book',
    loreId: 'entity',
    sourceToken: 'a'.repeat(64),
    intentHash: 'b'.repeat(64),
    requestHash: 'c'.repeat(64),
    jobToken: 'd'.repeat(64),
    keyId: bytesToHex(sha256(raw)),
  };
const data = () => {
  const { uid, ...rest } = identity;
  void uid;
  return { ...rest, phase: 'reserved', algorithm: 'AES-GCM', keyBase64: base64 };
};
const response = (body = { data: data() }, ok = true, type = 'application/json') => ({
  ok,
  headers: new Headers({ 'Content-Type': type }),
  json: async () => body,
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('fetch', state.fetch);
  state.auth.currentUser = { uid: 'author', getIdToken: state.idToken };
  state.appCheck = { app: 'verified' };
  state.idToken.mockResolvedValue('fixture-auth');
  state.getToken.mockResolvedValue({ token: 'fixture-app' });
  state.fetch.mockResolvedValue(response());
  state.create.mockImplementation(async (_i, options) => ({ readDraft: () => options.getKey() }));
  state.open.mockImplementation(async (_i, options) => ({ readDraft: () => options.getKey() }));
  state.list.mockResolvedValue({ items: [], next: null });
});
afterEach(() => vi.unstubAllGlobals());
it('uses fresh Auth/App Check HTTP and imports a nonextractable key without exposing the raw secret', async () => {
  const journal = await bookLoreJournalSession(identity).open(),
    grant = await journal.readDraft();
  expect(state.idToken).toHaveBeenCalledTimes(1);
  expect(state.getToken).toHaveBeenCalledWith(state.appCheck);
  expect(state.fetch).toHaveBeenCalledWith(
    '/api/book-lore/recovery-key',
    expect.objectContaining({
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        Authorization: 'Bearer fixture-auth',
        'X-Firebase-AppCheck': 'fixture-app',
      },
      body: JSON.stringify({
        writeId: 'draft',
        requestHash: identity.requestHash,
        jobToken: identity.jobToken,
      }),
    }),
  );
  expect(grant.identity).toEqual(identity);
  expect(grant.key.extractable).toBe(false);
  expect(grant.key.algorithm).toEqual({ name: 'AES-GCM', length: 256 });
  expect(grant.key.usages).toEqual(['encrypt', 'decrypt']);
  expect('keyBase64' in grant).toBe(false);
  await journal.readDraft();
  expect(state.fetch).toHaveBeenCalledTimes(2);
});
it.each([null, { uid: 'other' }])(
  'refuses another or absent account before storage (%j)',
  (actor) => {
    state.auth.currentUser = actor;
    expect(() => bookLoreJournalSession(identity)).toThrow('conta');
    expect(state.open).not.toHaveBeenCalled();
    expect(state.fetch).not.toHaveBeenCalled();
  },
);
it('does not obtain the key when App Check is unavailable', async () => {
  state.appCheck = null;
  const journal = await bookLoreJournalSession(identity).create();
  await expect(journal.readDraft()).rejects.toThrow('verificação');
  expect(state.fetch).not.toHaveBeenCalled();
});
it.each(['account', 'scope'])(
  'refuses a changed %s after the ID-token wait before further network',
  async (kind) => {
    let resolve,
      current = true;
    state.idToken.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const journal = await bookLoreJournalSession(identity, () => current).open(),
      pending = journal.readDraft();
    const rejected = expect(pending).rejects.toThrow('contexto mudou');
    if (kind === 'account') state.auth.currentUser = { uid: 'author', getIdToken: state.idToken };
    else current = false;
    resolve('fixture-auth');
    await rejected;
    expect(state.getToken).not.toHaveBeenCalled();
    expect(state.fetch).not.toHaveBeenCalled();
  },
);
for (const [label, mutate] of [
  ['scope', (v) => ({ ...v, sourceToken: 'f'.repeat(64) })],
  ['key fingerprint', (v) => ({ ...v, keyBase64: Buffer.alloc(32, 3).toString('base64') })],
  ['phase', (v) => ({ ...v, phase: 'revoked' })],
  ['unknown credential', (v) => ({ ...v, apiKey: 'PRIVATE' })],
  ['short key', (v) => ({ ...v, keyBase64: 'AA==' })],
])
  it('rejects ' + label + ' without returning a CryptoKey', async () => {
    state.fetch.mockResolvedValue(response({ data: mutate(data()) }));
    const journal = await bookLoreJournalSession(identity).open();
    await expect(journal.readDraft()).rejects.toThrow();
  });
it('sanitizes failed or non-JSON responses and never tries another URL', async () => {
  for (const r of [
    response({ error: { message: 'PRIVATE' } }, false),
    response('PRIVATE', true, 'text/html'),
    {
      ...response(),
      json: async () => {
        throw Error('PRIVATE');
      },
    },
  ]) {
    state.fetch.mockResolvedValue(r);
    const journal = await bookLoreJournalSession(identity).open();
    await expect(journal.readDraft()).rejects.toThrow(/cópia protegida|incompleta/);
  }
  expect(state.fetch.mock.calls.every((c) => c[0] === '/api/book-lore/recovery-key')).toBe(true);
});
it('drops a late JSON key response after account replacement', async () => {
  let resolve;
  state.fetch.mockResolvedValue({
    ...response(),
    json: () =>
      new Promise((r) => {
        resolve = r;
      }),
  });
  const journal = await bookLoreJournalSession(identity).open(),
    pending = journal.readDraft(),
    rejected = expect(pending).rejects.toThrow('contexto mudou');
  await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
  state.auth.currentUser = { uid: 'author', getIdToken: state.idToken };
  resolve({ data: data() });
  await rejected;
});
it('discovers only captured UID metadata without a key, and rejects a late account switch', async () => {
  state.appCheck = null;
  expect(await listBookLoreJournals('after', 2)).toEqual({ items: [], next: null });
  expect(state.list).toHaveBeenCalledWith('author', 'after', 2);
  expect(state.fetch).not.toHaveBeenCalled();
  let resolve;
  state.list.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const pending = listBookLoreJournals(),
    rejected = expect(pending).rejects.toThrow('contexto mudou');
  state.auth.currentUser = null;
  resolve({ items: [], next: null });
  await rejected;
});
