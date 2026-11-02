import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { Storage } from '@google-cloud/storage';
import { createBookBackupAssetStorage } from '../src/bookBackupAssetStorage.mjs';
test('real Storage SDK sends exact unsafe decimal generation for metadata, hash and ranges', async (t) => {
  const generation = '12345678901234567890',
    bytes = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(140000, 31)]),
    requests = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    requests.push({
      generation: url.searchParams.get('generation'),
      condition: url.searchParams.get('ifGenerationMatch'),
      media: url.searchParams.get('alt') === 'media',
      range: request.headers.range ?? null,
    });
    if (url.searchParams.get('alt') === 'media') {
      const match = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range ?? ''),
        start = match ? Number(match[1]) : 0,
        end = match ? Number(match[2]) : bytes.length - 1,
        selected = bytes.subarray(start, end + 1);
      response.writeHead(match ? 206 : 200, {
        'content-type': 'image/png',
        'content-length': selected.length,
        'x-goog-generation': generation,
        'x-goog-metageneration': '1',
        'x-goog-hash': 'crc32c=' + crc,
        ...(match ? { 'content-range': 'bytes ' + start + '-' + end + '/' + bytes.length } : {}),
      });
      response.end(selected);
      return;
    }
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({
        generation,
        metageneration: '1',
        size: String(bytes.length),
        contentType: 'image/png',
        crc32c: crc,
        metadata: { accepted: 'false' },
      }),
    );
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const client = new Storage({
      projectId: 'writer-storage-fixture',
      apiEndpoint: 'http://127.0.0.1:' + server.address().port,
      useAuthWithCustomEndpoint: false,
      retryOptions: { autoRetry: false },
    }),
    validator = client.crc32cGenerator();
  validator.update(bytes);
  const crc = validator.toString(),
    streams = [];
  const adapter = createBookBackupAssetStorage(() => ({
      file(...args) {
        const file = client.bucket('writer-test-bucket').file(...args),
          read = file.createReadStream.bind(file);
        file.createReadStream = (...options) => {
          const stream = read(...options);
          streams.push(stream);
          return stream;
        };
        return file;
      },
    })),
    metadata = await adapter.metadata('own/path.png', generation);
  assert.equal(metadata.generation, generation);
  const hashed = await adapter.hashGeneration('own/path.png', generation, bytes.length);
  assert.equal(hashed.contentHash, createHash('sha256').update(bytes).digest('hex'));
  const part = await adapter.readRange('own/path.png', generation, 65536, 131071);
  assert.deepEqual(part, bytes.subarray(65536, 131072));
  assert.equal(streams.length, 2);
  assert.ok(streams.every((stream) => stream.destroyed));
  assert.ok(requests.length >= 3);
  assert.ok(requests.some((r) => r.media && r.range === null));
  assert.ok(requests.some((r) => r.range === 'bytes=65536-131071'));
  for (const request of requests) {
    assert.equal(request.generation, generation);
    if (!request.media) assert.equal(request.condition, generation);
  }
});

test('invalid decimal identities reject before constructing a Storage file', async () => {
  const { pinnedStorageFile } = await import('../src/pinnedStorageFile.mjs');
  const bucket = () => {
    assert.fail('Invalid identity cannot touch Storage');
  };
  for (const value of [null, undefined, 12, '1e3', '-1', '1.5', ''])
    assert.throws(() => pinnedStorageFile(bucket, 'x', value), TypeError);
  for (const value of [12, '-1', ''])
    assert.throws(() => pinnedStorageFile(bucket, 'x', '12', value), TypeError);
});
