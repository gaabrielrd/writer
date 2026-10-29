import { it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { streamCampaignImage as stream, CampaignImageCaptureError } from '../index';
import { imageFixture, uid } from '../../../../functions/test/helpers/campaignBackupImage.mjs';
const options = { guard: () => {} };
const sha = (b) => createHash('sha256').update(b).digest('hex');
const defer = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
async function fixture() {
  const f = await imageFixture();
  f.calls = [];
  f.port = {
    async call(method, input) {
      expect(Object.isFrozen(input)).toBe(true);
      f.calls.push({ method, input });
      return f.imageService[method](uid, input);
    },
  };
  return f;
}
async function collect(iterator) {
  const parts = [];
  for (;;) {
    const next = await iterator.next();
    if (next.done) return { parts, proof: next.value };
    parts.push(next.value);
  }
}
it('public stream captures real PNG and returns only frozen image proof after final native verification', async () => {
  const f = await fixture(),
    r = await collect(stream(f.reference, f.port, options));
  expect(Buffer.concat(r.parts.map((p) => p.payload))).toEqual(f.bytes);
  expect(r.proof).toEqual({
    validation: 'frozen-image-bytes-only',
    reference: f.reference,
    byteLength: f.bytes.length,
    chunkCount: r.parts.length,
    contentHash: sha(f.bytes),
  });
  expect(f.calls.at(-1).method).toBe('verifyCampaignBackupImage');
  expect(
    f.calls.every(
      (c) => !('baseId' in c.input) && !('path' in c.input) && !('contentHash' in c.input),
    ),
  ).toBe(true);
  expect(Object.isFrozen(r.proof.reference)).toBe(true);
});
it('unavailable image returns distinct proof with no byte reads', async () => {
  const f = await fixture();
  await f.remove(f.usePath);
  await f.refreshImage();
  const r = await collect(stream(f.reference, f.port, options));
  expect(r.parts).toEqual([]);
  expect(r.proof).toEqual({ validation: 'image-unavailable', reference: f.reference });
  expect(f.calls.map((c) => c.method)).toEqual(['getCampaignBackupImage']);
  expect(f.controls.events).toEqual([]);
});
it('captures ref, API, signal and guard before asynchronous work', async () => {
  const f = await fixture(),
    expected = { ...f.reference },
    opt = { guard: () => {} },
    r = stream(f.reference, f.port, opt);
  f.reference.id = '0'.repeat(64);
  f.port.call = () => {
    throw new Error('late');
  };
  opt.guard = () => {
    throw new Error('late');
  };
  expect((await collect(r)).proof.reference).toEqual(expected);
});
it('one-slot consumption prevents range prefetch and early return skips final verification', async () => {
  const f = await fixture(),
    r = stream(f.reference, f.port, options);
  expect((await r.next()).done).toBe(false);
  await Promise.resolve();
  await Promise.resolve();
  expect(f.calls.map((c) => c.method)).toEqual([
    'getCampaignBackupImage',
    'readCampaignBackupImageChunk',
  ]);
  expect(await r.return()).toEqual({ done: true, value: undefined });
  expect(f.calls.some((c) => c.method === 'verifyCampaignBackupImage')).toBe(false);
});
it.each([
  ['schema', (r) => ({ ...r, schemaVersion: 2 })],
  ['crossed campaign', (r) => ({ ...r, campaignId: 'other' })],
  ['crossed base', (r) => ({ ...r, baseId: '0'.repeat(64) })],
  ['crossed item', (r) => ({ ...r, id: '0'.repeat(64) })],
  ['crossed token', (r) => ({ ...r, resourceToken: '0'.repeat(64) })],
  ['extra path', (r) => ({ ...r, path: 'private' })],
  ['bad type', (r) => ({ ...r, contentType: 'image/jpeg' })],
  ['bad size', (r) => ({ ...r, byteLength: 16 * 1024 * 1024 + 1 })],
  ['short size', (r) => ({ ...r, byteLength: 7 })],
  ['bad count', (r) => ({ ...r, chunkCount: r.chunkCount + 1 })],
  ['bad hash', (r) => ({ ...r, contentHash: 'x' })],
])('rejects malformed image manifest: %s', async (_name, map) => {
  const f = await fixture(),
    call = f.port.call.bind(f.port),
    api = {
      call: async (...args) => {
        const response = await call(...args);
        return args[0] === 'getCampaignBackupImage' ? map(response) : response;
      },
    };
  await expect(collect(stream(f.reference, api, options))).rejects.toBeInstanceOf(
    CampaignImageCaptureError,
  );
  expect(f.calls.length).toBe(1);
});
it.each([
  ['base', (r) => ({ ...r, baseId: '0'.repeat(64) })],
  ['imageToken', (r) => ({ ...r, imageToken: '0'.repeat(64) })],
  ['index', (r) => ({ ...r, index: 1 })],
  ['size', (r) => ({ ...r, byteLength: r.byteLength + 1 })],
  ['count', (r) => ({ ...r, chunkCount: r.chunkCount + 1 })],
  ['hash', (r) => ({ ...r, chunkHash: '0'.repeat(64) })],
  ['base64 whitespace', (r) => ({ ...r, chunkBase64: r.chunkBase64 + '\n' })],
  ['oversized base64', (r) => ({ ...r, chunkBase64: 'A'.repeat(87388) })],
  ['short base64', (r) => ({ ...r, chunkBase64: 'AAAA' })],
  ['extra field', (r) => ({ ...r, url: 'private' })],
])('rejects malformed or crossed image part: %s', async (_name, map) => {
  const f = await fixture(),
    call = f.port.call.bind(f.port),
    api = {
      call: async (...args) => {
        const response = await call(...args);
        return args[0] === 'readCampaignBackupImageChunk' ? map(response) : response;
      },
    };
  await expect(collect(stream(f.reference, api, options))).rejects.toBeInstanceOf(
    CampaignImageCaptureError,
  );
});
it('rejects noncanonical padding bits even if base64 decoding returns expected bytes', async () => {
  const f = await fixture(),
    call = f.port.call.bind(f.port);
  const api = {
    call: async (...args) => {
      const r = await call(...args);
      if (args[0] === 'readCampaignBackupImageChunk' && args[1].index === 0) {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
          index = r.chunkBase64.length - 3;
        r.chunkBase64 =
          r.chunkBase64.slice(0, index) +
          alphabet[alphabet.indexOf(r.chunkBase64[index]) + 1] +
          r.chunkBase64.slice(index + 1);
      }
      return r;
    },
  };
  await expect(collect(stream(f.reference, api, options))).rejects.toBeInstanceOf(
    CampaignImageCaptureError,
  );
});
it.each(['signature', 'whole hash'])(
  'rejects self-consistent chunk corruption: %s',
  async (mode) => {
    const f = await fixture(),
      call = f.port.call.bind(f.port);
    const api = {
      call: async (...args) => {
        const r = await call(...args);
        if (args[0] === 'readCampaignBackupImageChunk' && args[1].index === 0) {
          const b = Buffer.from(r.chunkBase64, 'base64');
          b[mode === 'signature' ? 0 : 100] ^= 1;
          r.chunkBase64 = b.toString('base64');
          r.chunkHash = sha(b);
        }
        return r;
      },
    };
    const r = stream(f.reference, api, options);
    if (mode === 'whole hash') expect((await r.next()).done).toBe(false);
    await expect(r.next()).rejects.toBeInstanceOf(CampaignImageCaptureError);
    expect(f.calls.some((c) => c.method === 'verifyCampaignBackupImage')).toBe(false);
  },
);
it('final verification failure withholds proof even after all provisional bytes were delivered', async () => {
  const f = await fixture(),
    r = stream(f.reference, f.port, options);
  let delivered = 0;
  for (let index = 0; index < Math.ceil(f.bytes.length / 65536); index++) {
    const part = await r.next();
    expect(part.done).toBe(false);
    delivered += part.value.payload.length;
  }
  expect(delivered).toBe(f.bytes.length);
  await f.remove(f.usePath);
  await expect(r.next()).rejects.toBeDefined();
});
it('rejects crossed final verification envelope', async () => {
  const f = await fixture(),
    call = f.port.call.bind(f.port),
    api = {
      call: async (...args) => {
        const r = await call(...args);
        return args[0] === 'verifyCampaignBackupImage' ? { ...r, imageToken: '0'.repeat(64) } : r;
      },
    };
  await expect(collect(stream(f.reference, api, options))).rejects.toBeInstanceOf(
    CampaignImageCaptureError,
  );
});
it('guard change while a part is pending suppresses late bytes', async () => {
  const f = await fixture(),
    started = defer(),
    late = defer(),
    call = f.port.call.bind(f.port);
  let account = true;
  const api = {
    call: async (...args) => {
      const r = await call(...args);
      if (args[0] === 'readCampaignBackupImageChunk') {
        started.resolve();
        await late.promise;
      }
      return r;
    },
  };
  const r = stream(f.reference, api, {
      guard: () => {
        if (!account) throw new Error('account changed');
      },
    }),
    pending = r.next();
  await started.promise;
  account = false;
  late.resolve();
  await expect(pending).rejects.toThrow('account changed');
});
for (const method of [
  'getCampaignBackupImage',
  'readCampaignBackupImageChunk',
  'verifyCampaignBackupImage',
])
  for (const mode of ['return', 'abort'])
    it(
      mode + ' interrupts pending ' + method + ' and drops late response without proof',
      async () => {
        const f = await fixture(),
          started = defer(),
          late = defer(),
          call = f.port.call.bind(f.port),
          controller = new AbortController();
        const api = {
          call: async (...args) => {
            const r = await call(...args);
            if (args[0] === method) {
              started.resolve();
              await late.promise;
            }
            return r;
          },
        };
        const r = stream(f.reference, api, { ...options, signal: controller.signal });
        if (method === 'verifyCampaignBackupImage')
          for (let index = 0; index < Math.ceil(f.bytes.length / 65536); index++) await r.next();
        const pending = r.next();
        await started.promise;
        if (mode === 'return') expect(await r.return()).toEqual({ done: true, value: undefined });
        else controller.abort();
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        const count = f.calls.length;
        late.resolve();
        await Promise.resolve();
        await Promise.resolve();
        expect(f.calls.length).toBe(count);
      },
    );
it('rejects unsafe references synchronously before any API call', async () => {
  const f = await fixture();
  for (const ref of [
    { ...f.reference, path: 'x' },
    { ...f.reference, id: '../x' },
    { ...f.reference, campaignId: '../x' },
  ])
    expect(() => stream(ref, f.port, options)).toThrow(CampaignImageCaptureError);
  expect(f.calls).toEqual([]);
});
