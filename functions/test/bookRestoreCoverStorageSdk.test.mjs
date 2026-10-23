import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { Storage, CRC32C } from '@google-cloud/storage';
import { createBookRestoreCoverStorage } from '../src/bookRestoreCoverStorage.mjs';

async function wire(t) {
  const current = new Map(),
    versions = new Map(),
    requests = [],
    hooks = {};
  let sequence = 9007199254741000n;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1'),
      qs = Object.fromEntries(url.searchParams),
      method = req.method;
    requests.push({ method, qs });
    const send = (code, value) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    const failure = (code) =>
      send(code, {
        error: {
          code,
          message: 'contract ' + code,
          errors: [{ reason: code === 412 ? 'conditionNotMet' : 'notFound' }],
        },
      });
    try {
      if (method === 'POST') {
        const chunks = [];
        let total = 0;
        for await (const chunk of req) {
          total += chunk.length;
          if (total > 65536) throw new Error('Oversized contract request');
          chunks.push(chunk);
        }
        const body = Buffer.concat(chunks),
          boundary = /boundary="?([^";]+)"?/.exec(req.headers['content-type'])?.[1];
        if (!boundary) throw new Error('Missing multipart boundary');
        const delimiter = Buffer.from('\r\n--' + boundary),
          a = body.indexOf('\r\n\r\n') + 4,
          b = body.indexOf(delimiter, a),
          d = body.indexOf('\r\n\r\n', b + delimiter.length) + 4,
          e = body.indexOf(delimiter, d);
        if (a < 4 || b < a || d < 4 || e < d) throw new Error('Invalid multipart framing');
        const metadata = JSON.parse(body.subarray(a, b).toString('utf8')),
          bytes = body.subarray(d, e),
          name = qs.name;
        await hooks.beforeCommit?.(bytes, qs);
        const prior = current.get(name);
        if (
          qs.ifGenerationMatch !== undefined &&
          (qs.ifGenerationMatch === '0'
            ? prior !== undefined
            : prior?.generation !== qs.ifGenerationMatch)
        )
          return failure(412);
        if (
          qs.ifMetagenerationMatch !== undefined &&
          prior?.metageneration !== qs.ifMetagenerationMatch
        )
          return failure(412);
        const checksum = new CRC32C();
        checksum.update(bytes);
        const value = {
            ...metadata,
            name,
            bucket: 'demo-restore-wire',
            generation: String(++sequence),
            metageneration: '1',
            size: String(bytes.length),
            crc32c: checksum.toString(),
          },
          v = { ...value, bytes: Buffer.from(bytes) };
        if (!versions.has(name)) versions.set(name, new Map());
        versions.get(name).set(value.generation, v);
        current.set(name, v);
        return send(200, value);
      }
      const match = /\/o\/(.+)$/.exec(url.pathname);
      if (!match) return failure(404);
      const name = decodeURIComponent(match[1]),
        v = qs.generation ? versions.get(name)?.get(qs.generation) : current.get(name);
      if (!v) return failure(404);
      if (qs.ifGenerationMatch !== undefined && v.generation !== qs.ifGenerationMatch)
        return failure(412);
      if (method === 'DELETE') {
        versions.get(name).delete(v.generation);
        if (current.get(name)?.generation === v.generation) current.delete(name);
        res.writeHead(204);
        return res.end();
      }
      if (method !== 'GET') return failure(405);
      if (qs.alt === 'media') {
        res.writeHead(200, {
          'Content-Type': v.contentType,
          'Content-Length': v.bytes.length,
          'x-goog-hash': 'crc32c=' + v.crc32c,
          'x-goog-generation': v.generation,
          'x-goog-metageneration': v.metageneration,
        });
        return res.end(v.bytes);
      }
      const metadata = { ...v };
      delete metadata.bytes;
      return send(200, metadata);
    } catch (error) {
      send(500, { error: { code: 500, message: error.message } });
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const client = new Storage({
    projectId: 'demo-restore-wire',
    apiEndpoint: 'http://127.0.0.1:' + server.address().port,
    useAuthWithCustomEndpoint: false,
    retryOptions: { autoRetry: false, maxRetries: 0 },
  });
  const bucket = client.bucket('demo-restore-wire');
  return { current, versions, requests, hooks, api: createBookRestoreCoverStorage(() => bucket) };
}
const bytes = Buffer.from('SDK wire exact private bytes'),
  c = {
    ownerId: 'author',
    restoreId: 'sdk-wire-restore01',
    jobToken: 'a'.repeat(64),
    imageId: 'restore-' + 'b'.repeat(64),
    contentHash: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.length,
  },
  path = 'book-covers/' + c.ownerId + '/' + c.imageId + '.png';

test('real GCS SDK sends exact create, read and version-delete preconditions without rounding generation', async (t) => {
  const f = await wire(t),
    proof = await f.api.stage(c, bytes);
  assert.ok(BigInt(proof.generation) > BigInt(Number.MAX_SAFE_INTEGER));
  assert.deepEqual(await f.api.stage(c, bytes), proof);
  const fence = await f.api.fence(c, proof);
  assert.equal(f.current.get(path).bytes.length, 0);
  assert.equal(f.versions.get(path).size, 1);
  assert.equal(f.current.get(path).generation, fence.generation);
  const writes = f.requests.filter((r) => r.method === 'POST'),
    read = f.requests.find((r) => r.qs.alt === 'media'),
    deletion = f.requests.find((r) => r.method === 'DELETE');
  assert.equal(writes.length, 2);
  assert.equal(writes[0].qs.ifGenerationMatch, '0');
  assert.equal(writes[1].qs.ifGenerationMatch, proof.generation);
  assert.equal(writes[1].qs.ifMetagenerationMatch, proof.metageneration);
  assert.equal(read.qs.generation, proof.generation);
  assert.equal(deletion.qs.generation, proof.generation);
  assert.equal(deletion.qs.ifGenerationMatch, proof.generation);
  await assert.rejects(() => f.api.stage(c, bytes));
  assert.equal(f.current.get(path).bytes.length, 0);
});
test('real SDK receives HTTP 412 when a delayed create reaches Storage after the cancellation fence', async (t) => {
  const f = await wire(t);
  let enter, release;
  const entered = new Promise((r) => (enter = r)),
    gate = new Promise((r) => (release = r));
  f.hooks.beforeCommit = async (data) => {
    if (data.length) {
      enter();
      await gate;
    }
  };
  const pending = f.api.stage(c, bytes);
  await entered;
  try {
    await f.api.fence(c);
  } finally {
    release();
  }
  await assert.rejects(() => pending);
  assert.equal(f.current.get(path).bytes.length, 0);
  assert.equal(f.versions.get(path).size, 1);
  assert.equal(f.requests.filter((r) => r.method === 'POST').length, 2);
});
