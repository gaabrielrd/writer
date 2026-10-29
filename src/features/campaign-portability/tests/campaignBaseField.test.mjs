import { it, expect } from 'vitest';
import { streamCampaignBaseField as stream, CampaignBaseCaptureError } from '../index';
import {
  baseFixture,
  logical,
  row,
} from '../../../../functions/test/helpers/campaignBackupBase.mjs';
import { baseTextFields, baseBodyKey } from '../../../../functions/src/campaignBaseContracts.mjs';

const options = { guard: () => {} };
const defer = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
async function fixture(text = '\ufeff  ' + '🐉á'.repeat(15000) + ' \n') {
  const f = await baseFixture(),
    scene = f.stored('scene'),
    plan = baseTextFields(scene.sourceKey, { content: text });
  await f.db.runTransaction(async (tx) => {
    tx.update(f.db.doc(f.path + '/items/' + scene.sourceKey), { fields: plan.fields });
    for (const body of plan.bodies)
      tx.set(
        f.db.doc(f.path + '/bodies/' + baseBodyKey(body.sourceKey, body.field, body.index)),
        body,
      );
  });
  const r = await row(f, scene),
    header = await logical(f, r);
  f.ref = {
    ...f.anchor,
    baseId: f.baseId,
    id: r.id,
    itemToken: r.itemToken,
    field: 'content',
    manifest: header.fields[0],
  };
  f.calls = [];
  f.port = {
    async call(method, input) {
      expect(method).toBe('readCampaignBackupBaseText');
      expect(Object.isFrozen(input)).toBe(true);
      f.calls.push(input);
      return f.text(r, 'content', { ...input, campaignId: input.campaignId });
    },
  };
  f.expectedText = text;
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
it('streams real frozen Unicode fields and returns only field-byte proof on natural completion', async () => {
  const f = await fixture(),
    before = structuredClone([...f.records]),
    r = await collect(stream(f.ref, f.port, options));
  expect(Buffer.concat(r.parts.map((p) => p.payload)).toString('utf8')).toBe(f.expectedText);
  expect(r.parts.length).toBeGreaterThan(1);
  expect(r.proof).toEqual({
    validation: 'frozen-field-bytes-only',
    bytes: f.ref.manifest.bytes,
    sha256: f.ref.manifest.sha256,
    chunkCount: r.parts.length,
  });
  expect([...f.records]).toEqual(before);
});
it.each(['', '\ufeff', '  \n🐉 '])('preserves empty/BOM/literal text %j', async (text) => {
  const f = await fixture(text),
    r = await collect(stream(f.ref, f.port, options));
  expect(Buffer.concat(r.parts.map((p) => p.payload)).toString('utf8')).toBe(text);
  expect(r.parts.length).toBe(1);
});
it('copies ref, manifest, method and guards before awaits', async () => {
  const f = await fixture(),
    r = stream(f.ref, f.port, options);
  f.ref.manifest.sha256 = '0'.repeat(64);
  f.ref.field = 'details';
  f.port.call = () => {
    throw Error('late');
  };
  expect((await collect(r)).proof.validation).toBe('frozen-field-bytes-only');
});
it.each([
  (r) => ({ ...r, baseId: '0'.repeat(64) }),
  (r) => ({ ...r, derivedToken: '0'.repeat(64) }),
  (r) => ({ ...r, id: '0'.repeat(64) }),
  (r) => ({ ...r, field: 'details' }),
  (r) => ({ ...r, index: r.index + 1 }),
  (r) => ({ ...r, bodyToken: 'bad' }),
  (r) => ({ ...r, fieldBytes: r.fieldBytes + 1 }),
  (r) => ({ ...r, fieldChunkCount: r.fieldChunkCount + 1 }),
  (r) => ({ ...r, fieldHash: '0'.repeat(64) }),
  (r) => ({ ...r, chunkBase64: r.chunkBase64 + '\n' }),
  (r) => ({ ...r, byteLength: r.byteLength + 1 }),
  (r) => ({ ...r, privatePath: 'hidden' }),
])('rejects malformed or crossed envelopes', async (map) => {
  const f = await fixture(),
    call = f.port.call.bind(f.port),
    api = { call: async (...args) => map(await call(...args)) };
  await expect(collect(stream(f.ref, api, options))).rejects.toBeInstanceOf(
    CampaignBaseCaptureError,
  );
});
it('rejects altered multichunk text before the final chunk can be yielded', async () => {
  const f = await fixture(),
    call = f.port.call.bind(f.port);
  let altered = false;
  const api = {
    call: async (...args) => {
      const r = await call(...args);
      if (!altered) {
        const b = Buffer.from(r.chunkBase64, 'base64');
        b[3] = 65;
        r.chunkBase64 = b.toString('base64');
        altered = true;
      }
      return r;
    },
  };
  const r = stream(f.ref, api, options);
  await expect(r.next()).resolves.toMatchObject({ done: false });
  await expect(r.next()).rejects.toBeInstanceOf(CampaignBaseCaptureError);
});
it('rejects total byte mismatch even when all per-part sizes are valid', async () => {
  const f = await fixture(),
    call = f.port.call.bind(f.port);
  f.ref.manifest.bytes++;
  const api = {
    call: async (...args) => {
      const r = await call(...args);
      return { ...r, fieldBytes: r.fieldBytes + 1 };
    },
  };
  await expect(collect(stream(f.ref, api, options))).rejects.toBeInstanceOf(
    CampaignBaseCaptureError,
  );
});
it('return immediately closes a pending RPC and drops its late content', async () => {
  const f = await fixture(),
    started = defer(),
    late = defer(),
    call = f.port.call.bind(f.port);
  const r = stream(
      f.ref,
      {
        call: async (...args) => {
          const response = await call(...args);
          started.resolve();
          await late.promise;
          return response;
        },
      },
      options,
    ),
    pending = r.next();
  await started.promise;
  await expect(r.return()).resolves.toEqual({ done: true, value: undefined });
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  late.resolve();
  expect(f.calls.length).toBe(1);
});
it('abort interrupts pending RPC without a proof', async () => {
  const f = await fixture(),
    started = defer(),
    late = defer(),
    controller = new AbortController();
  const r = stream(
      f.ref,
      {
        call: async () => {
          started.resolve();
          return late.promise;
        },
      },
      { ...options, signal: controller.signal },
    ),
    pending = r.next();
  await started.promise;
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  late.resolve({});
});
it('account change after delivery prevents the next part and completion', async () => {
  const f = await fixture();
  let active = true;
  const r = stream(f.ref, f.port, {
    guard: () => {
      if (!active) throw Error('account-changed');
    },
  });
  expect((await r.next()).done).toBe(false);
  active = false;
  await expect(r.next()).rejects.toThrow('account-changed');
  expect(f.calls.length).toBe(1);
});
it('does not prefetch additional parts while the consumer is paused', async () => {
  const f = await fixture(),
    r = stream(f.ref, f.port, options);
  expect((await r.next()).done).toBe(false);
  await Promise.resolve();
  expect(f.calls.length).toBe(1);
  await r.return();
});
it.each([
  (r) => ({ ...r, path: 'private' }),
  (r) => ({ ...r, field: 'unknown' }),
  (r) => ({ ...r, manifest: { ...r.manifest, bytes: -1 } }),
  (r) => ({ ...r, manifest: { ...r.manifest, chunkCount: 0 } }),
  (r) => ({ ...r, manifest: { ...r.manifest, bodySourceKey: 'bad' } }),
  (r) => ({ ...r, manifest: { ...r.manifest, field: 'details' } }),
])('validates closed request before calling API', async (map) => {
  const f = await fixture();
  expect(() => stream(map(f.ref), f.port, options)).toThrow(CampaignBaseCaptureError);
  expect(f.calls).toEqual([]);
});
