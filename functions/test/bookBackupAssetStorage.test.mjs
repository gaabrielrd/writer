import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { createBookBackupAssetStorage } from '../src/bookBackupAssetStorage.mjs';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function fixture(bytes = Buffer.alloc(140000, 7)) {
  const calls = [],
    streams = [],
    controls = { overshoot: false, truncate: false, fail: false, invalid: false };
  const api = createBookBackupAssetStorage(() => ({
    file(path, options) {
      calls.push({ path, options });
      return {
        async getMetadata() {
          return [
            {
              generation: '12',
              metageneration: '3',
              size: String(bytes.length),
              contentType: 'image/png',
              metadata: { accepted: 'true', firebaseStorageDownloadTokens: 'DO NOT COPY' },
            },
          ];
        },
        createReadStream(settings) {
          calls.push({ settings });
          let selected =
            settings.start === undefined ? bytes : bytes.subarray(settings.start, settings.end + 1);
          if (controls.overshoot) selected = Buffer.concat([selected, Buffer.alloc(1)]);
          if (controls.truncate) selected = selected.subarray(1);
          const stream = Readable.from(
            (async function* () {
              if (controls.fail) throw new Error('lost stream');
              if (controls.invalid) {
                yield 'invalid';
                return;
              }
              for (let start = 0; start < selected.length; start += 4093)
                yield selected.subarray(start, start + 4093);
            })(),
          );
          streams.push(stream);
          return stream;
        },
      };
    },
  }));
  return { api, calls, streams, controls, bytes };
}
test('full image hash consumes a CRC32C stream with pinned generation and exact bounded prefix', async () => {
  const f = fixture(),
    result = await f.api.hashGeneration('own/path', '12', f.bytes.length);
  assert.deepEqual(result, {
    byteLength: f.bytes.length,
    contentHash: hash(f.bytes),
    signature: f.bytes.subarray(0, 8).toString('hex'),
  });
  assert.deepEqual(f.calls[0], { path: 'own/path', options: { generation: '12' } });
  assert.deepEqual(f.calls[1].settings, { decompress: false, validation: 'crc32c' });
  assert.equal(f.streams[0].destroyed, true);
});
test('metadata strips download token and range is inclusive, pinned, uncompressed and at most 64 KiB', async () => {
  const f = fixture(),
    metadata = await f.api.metadata('own/path');
  assert.deepEqual(metadata, {
    generation: '12',
    metageneration: '3',
    size: f.bytes.length,
    contentType: 'image/png',
    accepted: true,
  });
  const bytes = await f.api.readRange('own/path', '12', 65536, 131071);
  assert.deepEqual(bytes, f.bytes.subarray(65536, 131072));
  assert.deepEqual(f.calls.at(-1).settings, {
    start: 65536,
    end: 131071,
    decompress: false,
    validation: false,
  });
  assert.equal(f.streams[0].destroyed, true);
});
test('range overshoot/truncation/non-buffer/failure destroys stream instead of returning partial or whole image', async () => {
  for (const issue of ['overshoot', 'truncate', 'invalid', 'fail']) {
    const f = fixture();
    f.controls[issue] = true;
    await assert.rejects(f.api.readRange('own/path', '12', 0, 65535));
    assert.equal(f.streams[0].destroyed, true);
  }
});
test('invalid range/budget and oversized full stream fail without uncontrolled accumulation', async () => {
  const f = fixture();
  await assert.rejects(f.api.readRange('own/path', '12', -1, 1));
  await assert.rejects(f.api.readRange('own/path', '12', 0, 65536));
  await assert.rejects(f.api.hashGeneration('own/path', '12', 16 * 1024 * 1024 + 1));
  assert.equal(f.calls.length, 0);
  await assert.rejects(f.api.hashGeneration('own/path', '12', 100));
  assert.equal(f.streams[0].destroyed, true);
});
