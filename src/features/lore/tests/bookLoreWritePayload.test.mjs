// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { prepareBookLoreWritePayload } from '../services/bookLoreWritePayload.ts';
import {
  prepareBookResourcePayload,
  verifyBookResourcePayloadPart,
} from '../../../../functions/src/bookResourcePayload.mjs';
import { fieldUploadOperationId } from '../../../../functions/src/bookLoreFieldUploadContracts.mjs';
import {
  createBookLoreFieldValidation,
  advanceBookLoreFieldValidation,
  finishBookLoreFieldValidation,
} from '../../../../functions/src/bookLoreFieldValidation.mjs';
const options = { yieldControl: async () => {} };
const input = (value, target = { field: 'details' }) => ({
  uid: 'author',
  bookId: 'book',
  loreId: 'entity',
  uploadId: 'browser-upload',
  target,
  value,
});
for (const [target, value] of [
  [{ field: 'details' }, ''],
  [{ field: 'details' }, '\ufeffExact 🌙\r\n\t"\\ \u0000 e\u0301'],
  [{ field: 'isPublic' }, false],
  [{ field: 'aliases' }, ['', 'same', 'same', '🌙']],
  [{ field: 'structuredDetails' }, { notes: '', appearance: '\ufeffLiteral' }],
  [
    { field: 'relations', page: 1, count: 2 },
    [
      { targetEntityId: 'universe:world:target', relationType: '', description: '\ufeff' },
      { targetEntityId: 'target', relationType: 'same' },
    ],
  ],
  [{ field: 'details' }, 'a'.repeat(65534) + '🌙' + '\\"\n'.repeat(12000)],
  [{ field: 'details' }, 'a'.repeat(4095) + '🌙' + 'x'.repeat(4095) + '🌙'],
])
  it(
    'exact server manifest, proofs, JSON and domain for ' +
      JSON.stringify(target) +
      ' length ' +
      JSON.stringify(value).length,
    async () => {
      const request = input(value, target),
        p = await prepareBookLoreWritePayload(request, options),
        operationId = fieldUploadOperationId(
          request.uid,
          request.bookId,
          request.loreId,
          request.uploadId,
          target,
        ),
        server = prepareBookResourcePayload({
          ...request,
          resource: { kind: 'lore', parentId: null, id: request.loreId },
          operationId,
          timestamp: 1000,
        });
      expect(p.operationId).toBe(operationId);
      expect(p.manifest).toEqual(server.manifest);
      let validation = createBookLoreFieldValidation(
        target.field === 'relations' ? { field: 'relations', count: target.count } : target,
      );
      const all = [];
      for await (const part of p.parts()) {
        const bytes = Buffer.from(part.chunkBase64, 'base64');
        expect(bytes.length).toBeLessThanOrEqual(65536);
        const expected = server.part(part.index);
        expect(bytes).toEqual(expected.bytes);
        expect(part.proof).toEqual(expected.proof);
        expect(
          verifyBookResourcePayloadPart(server.manifest, {
            index: part.index,
            bytes,
            proof: part.proof,
          }),
        ).toEqual(bytes);
        validation = advanceBookLoreFieldValidation(validation, bytes);
        all.push(bytes);
      }
      expect(finishBookLoreFieldValidation(validation).byteLength).toBe(p.manifest.byteLength);
      expect(JSON.parse(Buffer.concat(all).toString('utf8'))).toEqual(value);
    },
  );
it('changed text above 8 MiB produces more than 128 parts with the exact server hash and resumable sequential output', async () => {
  const request = input('\ufeff' + 'x'.repeat(9 * 1024 * 1024) + '🌙'),
    p = await prepareBookLoreWritePayload(request, options),
    server = prepareBookResourcePayload({
      ...request,
      resource: { kind: 'lore', parentId: null, id: request.loreId },
      operationId: p.operationId,
      timestamp: 1,
    });
  expect(p.manifest.chunkCount).toBeGreaterThan(128);
  expect(p.manifest).toEqual(server.manifest);
  let count = 0;
  for await (const part of p.parts(128)) {
    expect(part.chunkBase64).toBe(server.part(part.index).bytes.toString('base64'));
    expect(part.proof).toEqual(server.part(part.index).proof);
    count++;
  }
  expect(count).toBe(p.manifest.chunkCount - 128);
}, 20000);
it('freezes values synchronously before the first await and exposes no mutable editor references', async () => {
  const value = ['original'],
    promise = prepareBookLoreWritePayload(input(value, { field: 'aliases' }), options);
  value[0] = 'later';
  const p = await promise,
    parts = [];
  for await (const part of p.parts()) parts.push(Buffer.from(part.chunkBase64, 'base64'));
  expect(JSON.parse(Buffer.concat(parts).toString('utf8'))).toEqual(['original']);
});
it('abort and account guards prevent preparation and stop before the next outbound part', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    prepareBookLoreWritePayload(input('value'), { signal: controller.signal }),
  ).rejects.toThrow();
  let active = true;
  const p = await prepareBookLoreWritePayload(input('x'.repeat(140000)), {
      ...options,
      guard() {
        if (!active) throw Error('account changed');
      },
    }),
    iterator = p.parts();
  expect((await iterator.next()).value.index).toBe(0);
  active = false;
  await expect(iterator.next()).rejects.toThrow('account changed');
});
it('cancellation during the first pass returns no manifest and no ready upload', async () => {
  const controller = new AbortController(),
    yieldControl = vi.fn(async () => controller.abort());
  await expect(
    prepareBookLoreWritePayload(input('x'.repeat(140000)), {
      signal: controller.signal,
      yieldControl,
    }),
  ).rejects.toThrow();
  expect(yieldControl).toHaveBeenCalledTimes(1);
});
it('parts and proofs returned to a caller do not change retries, and invalid resume offsets fail', async () => {
  const p = await prepareBookLoreWritePayload(input('x'.repeat(140000)), options),
    first = (await p.parts().next()).value;
  first.chunkBase64 = 'changed';
  expect((await p.parts().next()).value.chunkBase64).not.toBe('changed');
  for (const offset of [-1, p.manifest.chunkCount + 1, 0.5])
    await expect(p.parts(offset).next()).rejects.toThrow();
  expect((await p.parts(p.manifest.chunkCount).next()).done).toBe(true);
});

it('bounds escaping and encoding allocations while text contains many escapes and surrogate pairs', async () => {
  const request = input('"\\\n\ufeff🌙'.repeat(100000)),
    stringify = JSON.stringify,
    encode = TextEncoder.prototype.encode;
  let largestString = 0,
    largestEncoding = 0;
  const jsonSpy = vi.spyOn(JSON, 'stringify').mockImplementation((...args) => {
    if (typeof args[0] === 'string') largestString = Math.max(largestString, args[0].length);
    return stringify(...args);
  });
  const encodeSpy = vi.spyOn(TextEncoder.prototype, 'encode').mockImplementation(function (value) {
    largestEncoding = Math.max(largestEncoding, value?.length ?? 0);
    return encode.call(this, value);
  });
  let count = 0;
  try {
    const staged = await prepareBookLoreWritePayload(request, options);
    for await (const part of staged.parts()) {
      expect(Buffer.from(part.chunkBase64, 'base64').length).toBeLessThanOrEqual(65536);
      count++;
    }
  } finally {
    jsonSpy.mockRestore();
    encodeSpy.mockRestore();
  }
  expect(count).toBeGreaterThan(1);
  expect(largestString).toBeLessThanOrEqual(4096);
  expect(largestEncoding).toBeLessThanOrEqual(65536);
});
