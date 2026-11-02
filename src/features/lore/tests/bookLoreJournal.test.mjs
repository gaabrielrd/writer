// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { prepareBookLoreEditOperation } from '../services/bookLoreEditOperation.ts';
import { createBookLoreJournal, openBookLoreJournal } from '../services/bookLoreJournal.ts';
import { listJournalHeads } from '../services/bookLoreJournalDb.ts';
import { journalWire } from '../services/bookLoreJournalContracts.ts';
import { installLoreJournalHarness } from './bookLoreJournalHarness.mjs';
let h;
beforeEach(() => {
  h = installLoreJournalHarness();
});
afterEach(() => vi.unstubAllGlobals());
async function fixture({
  writeId = 'local-journal',
  text = ' PRIVATE_DRAFT_🌙\r\n ',
  uid = 'author',
} = {}) {
  const input = {
    uid,
    writeId,
    source: {
      bookId: 'book',
      id: 'entity',
      sourceToken: 'a'.repeat(64),
      data: {
        name: 'Original',
        category: 'character',
        aliases: ['', 'same', 'same'],
        details: '\ufeff unchanged ',
      },
    },
    changes: [{ field: 'summary', value: text }],
  };
  const op = await prepareBookLoreEditOperation(
    input,
    {
      call() {
        throw Error('unexpected RPC');
      },
    },
    { yieldControl: async () => {} },
  );
  const raw = crypto.getRandomValues(new Uint8Array(32)),
    identity = {
      schemaVersion: 1,
      uid,
      writeId,
      bookId: 'book',
      loreId: 'entity',
      sourceToken: input.source.sourceToken,
      intentHash: op.snapshot().intentHash,
      requestHash: 'b'.repeat(64),
      jobToken: 'c'.repeat(64),
      keyId: bytesToHex(sha256(raw)),
    },
    key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  let allowed = true,
    current = true,
    gets = 0;
  const options = {
    guard() {
      if (!current) throw Error('context changed');
    },
    async getKey() {
      gets++;
      if (!allowed) throw Error('origin revoked');
      return { identity, key };
    },
    yieldControl: async () => {},
  };
  return {
    input,
    identity,
    options,
    key,
    raw,
    setAllowed: (v) => {
      allowed = v;
    },
    setCurrent: (v) => {
      current = v;
    },
    gets: () => gets,
  };
}
const append = (f) => ({
  method: 'appendBookLoreFieldUpload',
  input: {
    uploadId: 'lore-field-' + 'd'.repeat(64),
    startHash: 'e'.repeat(64),
    jobToken: 'f'.repeat(64),
    operationId: 'append-unit',
    expectedRevision: 0,
    index: 0,
    chunkBase64: btoa('PRIVATE CHUNK'),
    proof: [],
  },
});
const cleanup = (f) => ({
  method: 'cancelBookLoreFieldUpload',
  input: {
    uploadId: 'lore-field-' + 'd'.repeat(64),
    startHash: 'e'.repeat(64),
    jobToken: 'f'.repeat(64),
    operationId: 'cancel-unit',
  },
});
async function ready(f) {
  const j = await createBookLoreJournal(f.identity, f.options);
  await j.writeDraft(f.input);
  return j;
}
it('stores only ciphertext/operational metadata and restores literals after opening a new handle', async () => {
  const f = await fixture(),
    j = await ready(f);
  const records = JSON.stringify(h.rows());
  expect(records).not.toContain('PRIVATE_DRAFT');
  expect(records).not.toContain('unchanged');
  expect(records).not.toContain('contentHash');
  expect(records).not.toContain(btoa(String.fromCharCode(...f.raw)));
  expect(h.rows().every((r) => !Object.values(r.value).includes(f.key))).toBe(true);
  const other = await openBookLoreJournal(f.identity, f.options);
  expect(await other.readDraft()).toEqual(f.input);
  expect(f.gets()).toBeGreaterThan(1);
  await expect(j.requestCancel()).rejects.toThrow();
});
it('preserves a full request before the port is called and retries it exactly after a lost response', async () => {
  const f = await fixture(),
    j = await ready(f),
    wire = append(f),
    calls = [];
  const port = {
    async call(method, input) {
      calls.push({ method, input: structuredClone(input) });
      expect((await j.inspect()).production.state).toBe('pending');
      throw Error('lost reply');
    },
  };
  await expect(j.send(port, wire)).rejects.toThrow('lost reply');
  const recovered = await openBookLoreJournal(f.identity, f.options),
    pending = await recovered.readPending('production');
  expect(pending.wire).toEqual(wire);
  await recovered.send(
    {
      async call(method, input) {
        calls.push({ method, input: structuredClone(input) });
        return { accepted: true };
      },
    },
    pending.wire,
  );
  expect(calls[1]).toEqual(calls[0]);
  expect((await recovered.inspect()).production.state).toBe('pending');
});
it('confirmed requests remain readable but cannot be silently reactivated by send', async () => {
  const f = await fixture(),
    j = await ready(f),
    wire = append(f),
    unit = await j.stagePending(wire);
  await j.confirmPending('production', unit.requestHash);
  await expect(j.send({ call: vi.fn() }, wire)).rejects.toThrow();
  expect((await j.readPending('production')).wire).toEqual(wire);
});
it('does not replace an uncertain request or allow changed bytes under the same control fingerprint', async () => {
  const f = await fixture(),
    j = await ready(f),
    wire = append(f);
  await j.stagePending(wire);
  const before = structuredClone(h.rows());
  await expect(
    j.stagePending({ ...wire, input: { ...wire.input, chunkBase64: btoa('DIFFERENT') } }),
  ).rejects.toThrow();
  await expect(
    j.stagePending({ ...wire, input: { ...wire.input, operationId: 'different' } }),
  ).rejects.toThrow();
  expect(h.rows()).toEqual(before);
});
it('monotonic cancel blocks production and preserves cleanup/get without an available key', async () => {
  const f = await fixture(),
    j = await ready(f),
    wire = append(f);
  await j.stagePending(wire);
  await j.requestCancel();
  f.setAllowed(false);
  await expect(j.readDraft()).rejects.toThrow('origin revoked');
  const reopened = await openBookLoreJournal(f.identity, f.options),
    calls = [];
  await reopened.send(
    {
      async call(method, input) {
        calls.push({ method, input });
        return { cancelled: true };
      },
    },
    cleanup(f),
  );
  expect(calls[0]).toEqual(cleanup(f));
  expect((await reopened.readPending('cleanup')).wire).toEqual(cleanup(f));
  const get = {
    method: 'getBookLoreEditReservation',
    input: { editId: 'lore-edit-' + 'd'.repeat(64), startHash: 'e'.repeat(64) },
  };
  await reopened.stagePending(get);
  expect((await reopened.readPending('diagnostic')).wire).toEqual(get);
  await expect(reopened.send({ call: vi.fn() }, wire)).rejects.toThrow();
});
it('revocation is checked before decrypt even when a prior handle encrypted successfully', async () => {
  const f = await fixture(),
    j = await ready(f),
    spy = vi.spyOn(crypto.subtle, 'decrypt');
  f.setAllowed(false);
  await expect(j.readDraft()).rejects.toThrow('origin revoked');
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
});
it('a changed account/context during the key wait exposes no data and creates no frame', async () => {
  const f = await fixture(),
    j = await createBookLoreJournal(f.identity, f.options);
  const original = f.options.getKey;
  f.options.getKey = async () => {
    const grant = await original();
    f.setCurrent(false);
    return grant;
  };
  await expect(j.writeDraft(f.input)).rejects.toThrow('context changed');
  expect(h.rows().filter((r) => r.store === 'frames')).toHaveLength(0);
});
it('waits for oncomplete and retains atomic state on a failed frame/header commit', async () => {
  const f = await fixture();
  h.hold();
  let done = false;
  const pending = createBookLoreJournal(f.identity, f.options).then((j) => {
    done = true;
    return j;
  });
  await vi.waitFor(() => expect(h.held()).toBe(1));
  expect(done).toBe(false);
  expect(h.rows()).toHaveLength(0);
  h.release();
  const j = await pending;
  const before = structuredClone(h.rows());
  h.abortNext();
  await expect(j.writeDraft(f.input)).rejects.toThrow();
  expect(h.rows()).toEqual(before);
  await j.writeDraft(f.input);
  expect(await j.readDraft()).toEqual(f.input);
});
it('partial writes remain discoverable and resume only the identical input', async () => {
  const f = await fixture({ text: 'x'.repeat(150000) }),
    j = await createBookLoreJournal(f.identity, f.options);
  h.abortAt(h.commits() + 3);
  await expect(j.writeDraft(f.input)).rejects.toThrow();
  const head = (await listJournalHeads(f.identity.uid)).items[0];
  expect(head.draft.complete).toBe(false);
  expect(head.draft.written).toBe(1);
  const other = await openBookLoreJournal(f.identity, f.options);
  await expect(other.readDraft()).rejects.toThrow();
  await other.writeDraft(f.input);
  expect(await other.readDraft()).toEqual(f.input);
});
it('tampered or missing frames, nonce, identity and manifest are rejected without discarding records', async () => {
  const f = await fixture(),
    j = await ready(f),
    rows = h.stores.get('frames'),
    entries = [...rows.entries()];
  for (const mode of ['cipher', 'nonce', 'missing']) {
    const before = structuredClone([...rows]);
    const [key, row] = entries.find(([, r]) => r.k.at(-1) === 0);
    if (mode === 'missing') rows.delete(key);
    else {
      const changed = structuredClone(row);
      new Uint8Array(changed.value[mode === 'nonce' ? 'nonce' : 'ciphertext'])[0] ^= 1;
      rows.set(key, changed);
    }
    await expect(j.readDraft()).rejects.toThrow();
    rows.clear();
    for (const [k, v] of before) rows.set(k, v);
  }
  await expect(
    openBookLoreJournal({ ...f.identity, keyId: '0'.repeat(64) }, f.options),
  ).rejects.toThrow();
  expect(await j.readDraft()).toEqual(f.input);
});
it('discovery is limited, paginated and isolated by UID and old tabs cannot overwrite', async () => {
  const f = await fixture(),
    j = await ready(f),
    other = await fixture({ uid: 'other' });
  await ready(other);
  for (const writeId of ['second', 'third']) {
    const x = await fixture({ writeId });
    await ready(x);
  }
  const page = await listJournalHeads('author', undefined, 2);
  expect(page.items).toHaveLength(2);
  expect(page.next).not.toBeNull();
  expect((await listJournalHeads('author', page.next, 2)).items).toHaveLength(1);
  expect(page.items.every((h) => h.identity.uid === 'author')).toBe(true);
  const newer = await openBookLoreJournal(f.identity, f.options);
  await expect(j.requestCancel()).rejects.toThrow();
  await newer.requestCancel();
  expect((await newer.inspect()).cancelRequested).toBe(true);
});
it('closed wire refuses credential fields, inherited methods and unknown nested manifest data', async () => {
  const f = await fixture();
  for (const wire of [
    { method: 'constructor', input: {} },
    { ...append(f), input: { ...append(f).input, apiKey: 'PRIVATE' } },
    {
      method: 'startBookLoreFieldUpload',
      input: {
        bookId: 'book',
        loreId: 'entity',
        uploadId: 'lore-field-' + 'd'.repeat(64),
        sourceToken: f.identity.sourceToken,
        target: { field: 'summary' },
        manifest: { apiKey: 'PRIVATE' },
      },
    },
  ])
    expect(() => journalWire(wire, f.identity)).toThrow();
});
it('literal input remains frozen before awaits and a mismatched intent cannot be sealed', async () => {
  const f = await fixture(),
    j = await createBookLoreJournal(f.identity, f.options),
    original = structuredClone(f.input);
  const pending = j.writeDraft(f.input);
  f.input.changes[0].value = 'MUTATED';
  await pending;
  expect(await j.readDraft()).toEqual(original);
  const x = await fixture({ writeId: 'wrong-intent' }),
    wrong = await createBookLoreJournal({ ...x.identity, intentHash: '0'.repeat(64) }, x.options);
  await expect(wrong.writeDraft(x.input)).rejects.toThrow();
  expect((await wrong.inspect()).draft).toBeNull();
});
it('unsupported secure storage refuses to write without localStorage/plaintext fallback', async () => {
  const f = await fixture();
  vi.stubGlobal('navigator', {});
  await expect(createBookLoreJournal(f.identity, f.options)).rejects.toThrow();
  expect(h.rows()).toHaveLength(0);
});

it('revalidates after decryption before exposing draft or pending bytes', async () => {
  const f = await fixture(),
    j = await ready(f);
  const original = crypto.subtle.decrypt.bind(crypto.subtle);
  const spy = vi.spyOn(crypto.subtle, 'decrypt').mockImplementation((...args) => {
    const result = original(...args);
    f.setAllowed(false);
    return result;
  });
  await expect(j.readDraft()).rejects.toThrow('origin revoked');
  spy.mockRestore();
  expect((await j.inspect()).draft.complete).toBe(true);
});

it('recovers a complete draft after its final local seal commit failed, without the input heap', async () => {
  const f = await fixture(),
    j = await createBookLoreJournal(f.identity, f.options);
  h.abortAt(h.commits() + 3);
  await expect(j.writeDraft(f.input)).rejects.toThrow();
  const partial = await j.inspect();
  expect(partial.draft.written).toBe(partial.draft.chunkCount);
  expect(partial.draft.complete).toBe(false);
  const recovered = await openBookLoreJournal(f.identity, f.options);
  expect(await recovered.readDraft()).toEqual(f.input);
  expect((await recovered.inspect()).draft.complete).toBe(true);
});
it('recovers a fully written unsealed RPC and seals it locally before explicit sending', async () => {
  const f = await fixture(),
    j = await ready(f),
    wire = append(f);
  h.abortAt(h.commits() + 3);
  await expect(j.stagePending(wire)).rejects.toThrow();
  const partial = (await j.inspect()).production;
  expect(partial.state).toBe('sealing');
  expect(partial.blob.written).toBe(partial.blob.chunkCount);
  const recovered = await openBookLoreJournal(f.identity, f.options);
  const pending = await recovered.readPending('production');
  expect(pending.wire).toEqual(wire);
  expect(pending.unit.state).toBe('pending');
  const call = vi.fn(async () => ({ accepted: true }));
  expect(call).not.toHaveBeenCalled();
  await recovered.send({ call }, pending.wire);
  expect(call).toHaveBeenCalledExactlyOnceWith(wire.method, wire.input);
});
