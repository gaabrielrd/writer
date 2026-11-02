// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { webcrypto, createHash } from 'node:crypto';
import {
  prepareJournalJSON,
  sealJournalFrame,
  openJournalFrame,
  journalGrant,
} from '../services/bookLoreJournalCrypto.ts';
import { bookLoreJSONParts } from '../services/bookLoreWritePayload.ts';
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());
const identity = {
  schemaVersion: 1,
  uid: 'author',
  writeId: 'draft',
  bookId: 'book',
  loreId: 'entity',
  sourceToken: 'a'.repeat(64),
  intentHash: 'b'.repeat(64),
  requestHash: 'c'.repeat(64),
  jobToken: 'd'.repeat(64),
  keyId: 'e'.repeat(64),
};
async function key(extractable = false) {
  return crypto.subtle.importKey('raw', new Uint8Array(32).fill(7), 'AES-GCM', extractable, [
    'encrypt',
    'decrypt',
  ]);
}
it('streams literal JSON with bounded escaping/encoding and an independent aggregate SHA', async () => {
  const value = { text: '\ufeff🌙\r\n"\\'.repeat(20000), aliases: ['', 'same', 'same'] },
    expected = Buffer.from(JSON.stringify(value)),
    sha = createHash('sha256').update(expected).digest('hex');
  const encode = TextEncoder.prototype.encode,
    max = [];
  const spy = vi.spyOn(TextEncoder.prototype, 'encode').mockImplementation(function (text) {
    max.push(text.length);
    return encode.call(this, text);
  });
  const prepared = await prepareJournalJSON(value, { yieldControl: async () => {} });
  const parts = [...bookLoreJSONParts(prepared.value, {})];
  spy.mockRestore();
  expect(Math.max(...max)).toBeLessThanOrEqual(65536);
  expect(parts.every((p) => p.length <= 65536)).toBe(true);
  expect(Buffer.concat(parts.map((p) => Buffer.from(p)))).toEqual(expected);
  expect(prepared.manifest).toEqual({
    byteLength: expected.length,
    chunkCount: parts.length,
    contentHash: sha,
  });
});
for (const [name, change] of [
  ['identity', (v) => ({ ...v, identity: { ...identity, bookId: 'other' } })],
  ['section', (v) => ({ ...v, section: 'production' })],
  ['generation', (v) => ({ ...v, blob: { ...v.blob, generation: 'other' } })],
  ['index', (v) => ({ ...v, index: 1 })],
])
  it('AAD binds ' + name + ' even when the same AES key is used', async () => {
    const secret = await key(),
      blob = { generation: 'gen', byteLength: 3, chunkCount: 1, written: 1, complete: true },
      frame = await sealJournalFrame(secret, identity, 'draft', blob, 0, new Uint8Array([1, 2, 3])),
      args = change({ identity, section: 'draft', blob, index: 0 });
    expect([...(await openJournalFrame(secret, identity, 'draft', blob, 0, frame))]).toEqual([
      1, 2, 3,
    ]);
    await expect(
      openJournalFrame(secret, args.identity, args.section, args.blob, args.index, frame),
    ).rejects.toThrow();
  });
it('rejects extractable/wrong-scope grants and unsafe values without invoking getters', async () => {
  expect(() =>
    journalGrant({ identity: { ...identity, uid: 'other' }, key: {} }, identity),
  ).toThrow();
  const extractable = await key(true);
  expect(() => journalGrant({ identity, key: extractable }, identity)).toThrow();
  let calls = 0;
  const raw = {
    get text() {
      calls++;
      return 'PRIVATE';
    },
  };
  await expect(prepareJournalJSON(raw)).rejects.toThrow();
  expect(calls).toBe(0);
  await expect(
    prepareJournalJSON({ text: 'x'.repeat(262145) }, { yieldControl: async () => {} }, 262144),
  ).rejects.toThrow();
});
