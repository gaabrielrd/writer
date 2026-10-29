import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { imageFixture } from './helpers/campaignBackupImage.mjs';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const reason = (name) => (e) => e.details?.reason === name;
const imageBad = reason('campaign-backup-image-inconsistent');
const storageBad = reason('campaign-backup-image-storage-unavailable');
test('real PNG capture reconstructs pinned bytes with bounded ranges and closed portable output', async () => {
  const f = await imageFixture(),
    before = structuredClone([...f.records]),
    m = await f.get();
  assert.equal(m.contentHash, sha(f.bytes));
  assert.equal(m.byteLength, f.bytes.length);
  assert.ok(m.chunkCount > 1);
  const parts = [];
  for (let index = 0; index < m.chunkCount; index++) {
    const p = await f.chunk(m, index),
      bytes = Buffer.from(p.chunkBase64, 'base64');
    assert.ok(bytes.length <= 65536);
    assert.equal(p.chunkHash, sha(bytes));
    parts.push(bytes);
    assert.deepEqual(
      Object.keys(p).sort(),
      [
        'schemaVersion',
        'campaignId',
        'sourceToken',
        'derivedToken',
        'baseId',
        'id',
        'resourceToken',
        'imageToken',
        'index',
        'byteLength',
        'chunkCount',
        'chunkBase64',
        'chunkHash',
      ].sort(),
    );
  }
  assert.deepEqual(Buffer.concat(parts), f.bytes);
  assert.equal((await f.verify(m)).imageToken, m.imageToken);
  for (const forbidden of [
    'book-covers/',
    'comparison-library-image',
    '12345678901234567890',
    'campaign-base:',
  ])
    assert.equal(JSON.stringify(m).includes(forbidden), false);
  assert.deepEqual([...f.records], before);
  assert.ok(f.controls.events.every((e) => e.generation === f.generation));
  assert.ok(f.controls.streams.every((s) => s.destroyed));
});
test('new latest Storage version cannot replace the frozen generation; missing frozen version never falls back', async () => {
  const f = await imageFixture(),
    newGen = '12345678901234567891';
  f.versions.set(newGen, {
    bytes: Buffer.from('wrong-latest'),
    metadata: { generation: newGen, metageneration: '1', size: '12', contentType: 'image/png' },
  });
  f.controls.latest = newGen;
  const m = await f.get();
  assert.equal(m.contentHash, sha(f.bytes));
  assert.deepEqual(
    Buffer.from((await f.chunk(m)).chunkBase64, 'base64'),
    f.bytes.subarray(0, 65536),
  );
  f.versions.delete(f.generation);
  await assert.rejects(f.get(), storageBad);
  assert.ok(f.controls.events.every((e) => e.generation === f.generation));
});
test('fresh unavailable image is explicit and performs no Storage I/O', async () => {
  const f = await imageFixture();
  await f.remove(f.usePath);
  await f.refreshImage();
  assert.equal(f.imageRef.availability, 'unavailable');
  const result = await f.get();
  assert.equal(result.outcome, 'unavailable');
  assert.deepEqual(
    Object.keys(result).sort(),
    [
      'schemaVersion',
      'campaignId',
      'sourceToken',
      'derivedToken',
      'baseId',
      'id',
      'resourceToken',
      'outcome',
    ].sort(),
  );
  assert.equal(f.controls.events.length, 0);
});
for (const field of ['sourceToken', 'derivedToken', 'resourceToken'])
  test('obsolete ' + field + ' refuses before Storage', async () => {
    const f = await imageFixture();
    await assert.rejects(f.get({ [field]: '0'.repeat(64) }));
    assert.equal(f.controls.events.length, 0);
  });
test('closed inputs, invalid indices and image token reject without range reads', async () => {
  const f = await imageFixture(),
    m = await f.get();
  f.controls.events.length = 0;
  for (const extra of [{ path: f.storagePath }, { id: '../x' }]) await assert.rejects(f.get(extra));
  for (const index of [-1, 0.5, 256, Infinity]) await assert.rejects(f.chunk(m, index));
  await assert.rejects(f.chunk(m, 0, { imageToken: 'invalid' }));
  assert.equal(f.controls.events.length, 0);
  await assert.rejects(f.chunk(m, m.chunkCount));
  assert.equal(
    f.controls.events.some((e) => e.method === 'range'),
    false,
  );
  await assert.rejects(
    f.chunk(m, 0, { imageToken: '0'.repeat(64) }),
    reason('campaign-backup-image-changed'),
  );
  assert.equal(
    f.controls.events.some((e) => e.method === 'range'),
    false,
  );
});
for (const [name, change] of [
  ['library revoked', (f) => f.patch(f.libraryPath, { state: 'deleting' })],
  ['typed use removed', (f) => f.remove(f.usePath)],
  ['pin generation changed', (f) => f.patch(f.imagePath, { generation: '2' })],
  [
    'source adventure revoked',
    (f) => f.patch('adventures/' + f.campaign.adventureId, { deleting: true }),
  ],
  ['campaign deletion', (f) => f.patch('campaigns/' + f.id, { deleting: true })],
  ['active base adoption', (f) => f.patch('campaigns/' + f.id, { activeBaseId: '0'.repeat(64) })],
  [
    'image owner block changed',
    (f) => {
      const b = f.stored('block', (v) => !!v.image);
      return f.patch(f.path + '/items/' + b.sourceKey, { image: { ...b.image, alt: 'changed' } });
    },
  ],
])
  test(name + ' during Storage read suppresses data', async () => {
    const f = await imageFixture(),
      m = await f.get();
    f.controls.hooks.range = () => change(f);
    await assert.rejects(f.chunk(m));
  });
for (const stage of ['metadata', 'hash', 'range'])
  test('reauthorizes after ' + stage + ' I/O, including provider failure', async () => {
    for (const failed of [false, true]) {
      const f = await imageFixture(),
        m = stage === 'range' ? await f.get() : null;
      f.controls.hooks[stage] = async () => {
        await f.remove(f.usePath);
        if (failed) throw new Error('private-provider-url');
      };
      await assert.rejects(
        m ? f.chunk(m) : f.get(),
        (e) => e.details?.reason === 'campaign-backup-base-item-changed',
      );
    }
  });
test('metageneration mutation after full hash or range invalidates the observation', async () => {
  for (const stage of ['hash', 'range']) {
    const f = await imageFixture(),
      m = stage === 'range' ? await f.get() : null;
    f.controls.hooks[stage] = () => {
      f.versions.get(f.generation).metadata.metageneration = '2';
    };
    await assert.rejects(m ? f.chunk(m) : f.get(), reason('campaign-backup-image-changed'));
  }
});
test('invalid pinned metadata refuses before reading bytes', async () => {
  for (const patch of [
    { generation: '2' },
    { metageneration: '1e3' },
    { size: '7' },
    { size: String(16 * 1024 * 1024 + 1) },
    { size: '9000' },
    { contentType: 'image/jpeg' },
  ]) {
    const f = await imageFixture();
    Object.assign(f.versions.get(f.generation).metadata, patch);
    await assert.rejects(f.get(), imageBad);
    assert.equal(
      f.controls.events.some((e) => e.method !== 'metadata'),
      false,
    );
  }
});
test('wrong PNG signature or truncated full read cannot produce a manifest', async () => {
  for (const mode of ['prefix', 'truncated', 'oversize']) {
    const f = await imageFixture();
    f.controls.transform = (data, method) =>
      method !== 'hash'
        ? data
        : mode === 'prefix'
          ? Buffer.alloc(data.length)
          : mode === 'truncated'
            ? data.subarray(0, -1)
            : Buffer.concat([data, Buffer.from('x')]);
    await assert.rejects(f.get(), mode === 'oversize' ? storageBad : imageBad);
    assert.ok(f.controls.streams.every((s) => s.destroyed));
  }
});
test('short and oversized ranges are rejected and streams are destroyed', async () => {
  for (const oversized of [false, true]) {
    const f = await imageFixture(),
      m = await f.get();
    f.controls.transform = (data, method) =>
      method !== 'range'
        ? data
        : oversized
          ? Buffer.concat([data, Buffer.from('x')])
          : data.subarray(0, -1);
    await assert.rejects(f.chunk(m), storageBad);
    assert.ok(f.controls.streams.every((s) => s.destroyed));
  }
});
test('provider errors are sanitized and verification checks current metadata and authorization', async () => {
  const f = await imageFixture(),
    m = await f.get();
  f.controls.hooks.range = () => {
    throw new Error('private-provider-url/' + f.storagePath);
  };
  await assert.rejects(
    f.chunk(m),
    (e) =>
      storageBad(e) &&
      !JSON.stringify(e).includes(f.storagePath) &&
      !e.message.includes('provider'),
  );
  delete f.controls.hooks.range;
  f.versions.get(f.generation).metadata.metageneration = '3';
  await assert.rejects(f.verify(m), reason('campaign-backup-image-changed'));
});

test('wrong account cannot read an image; requests are detached before pending I/O', async () => {
  const f = await imageFixture();
  await assert.rejects(f.imageService.getCampaignBackupImage('other', f.request));
  assert.equal(f.controls.events.length, 0);
  let release, started;
  const blocked = new Promise((r) => {
      release = r;
    }),
    ready = new Promise((r) => {
      started = r;
    });
  f.controls.hooks.metadata = async () => {
    started();
    await blocked;
  };
  const input = { ...f.request },
    pending = f.imageService.getCampaignBackupImage('author', input);
  await ready;
  input.id = '0'.repeat(64);
  input.resourceToken = '0'.repeat(64);
  release();
  assert.equal((await pending).contentHash, sha(f.bytes));
});
