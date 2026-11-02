// @vitest-environment node
import { it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { imageDataFixture } from './adventureImageFixture.mjs';
import {
  streamAdventureImageData as stream,
  verifyAdventureImageData as verify,
  AdventureImageError,
} from '../index';
const options = { guard: () => {} };
const hash = (b) => createHash('sha256').update(b).digest('hex');
async function collect(iterator) {
  const records = [];
  for (;;) {
    const n = await iterator.next();
    if (n.done) return { records, proof: n.value };
    records.push(n.value);
  }
}
const json = (r) => JSON.parse(Buffer.from(r.payload));
it('preserves independent main/additional grants and identical PNG bytes without private storage metadata', async () => {
  const f = await imageDataFixture(),
    c = await collect(stream(f.id, f.scanApi, options));
  const bindings = c.records.filter((r) => r.kind === 'adventure-image-binding').map(json);
  expect(bindings.map((v) => v.resource.kind)).toEqual(['scene', 'block']);
  expect(bindings.map((v) => v.image.alt)).toEqual(['  PRIVATE_ALT 🌙  ', '  PRIVATE_ALT 🌙  ']);
  expect(bindings[0].image.assetId).not.toBe(bindings[1].image.assetId);
  const images = c.records.filter((r) => r.kind === 'adventure-image').map(json);
  for (const v of images) {
    const parts = c.records.filter((r) => r.kind === 'adventure-image-bytes' && r.id === v.assetId);
    expect(parts.map((p) => p.part)).toEqual([0, 1, 2]);
    expect(parts.map((p) => p.payload.length)).toEqual([65536, 65536, 8936]);
    expect(Buffer.concat(parts.map((p) => p.payload))).toEqual(f.bytes);
    expect(v.contentHash).toBe(hash(f.bytes));
    expect(v.name).toBe('PRIVATE_PNG 🌙');
    expect(v.imageId).toBe(f.imageId);
  }
  const all = JSON.stringify(c.records.filter((r) => r.kind !== 'adventure-image-bytes').map(json));
  for (const secret of [
    'DO_NOT_COPY',
    'book-covers',
    'bindingToken',
    'imageToken',
    'sourceToken',
    'generation',
    'ownerId',
  ])
    expect(all).not.toContain(secret);
  expect(c.proof).toMatchObject({
    validation: 'images-data-only',
    bindings: 2,
    assets: 2,
    bytes: f.bytes.length * 2,
  });
  expect(json(c.records.at(-1))).toMatchObject({ bindings: 2, assets: 2, digest: c.proof.digest });
  const before = f.io.filter((r) => r[0] === 'range').length;
  await verify(c.proof, f.scanApi, options);
  expect(f.io.filter((r) => r[0] === 'range')).toHaveLength(before);
});
it('explicitly preserves every absent binding and paginates 53 scenes', async () => {
  const f = await imageDataFixture(53, false),
    c = await collect(stream(f.id, f.scanApi, options));
  expect(c.proof).toMatchObject({ bindings: 54, assets: 0, bytes: 0 });
  expect(
    c.records
      .filter((r) => r.kind === 'adventure-image-binding')
      .every((r) => json(r).image === null),
  ).toBe(true);
  expect(
    f.calls.filter(
      (r) => r.method === 'listAdventureBackupImageBindings' && r.input.kind === 'scene',
    ),
  ).toHaveLength(2);
  expect(f.io).toHaveLength(0);
  await verify(c.proof, f.scanApi, options);
});
it('preserves the minimum eight-byte PNG and the maximum 16MiB without changing range boundaries', async () => {
  for (const size of [8, 16 * 1024 * 1024]) {
    const f = await imageDataFixture(1, true, size);
    let count = 0,
      proof;
    const output = stream(f.id, f.scanApi, options);
    for (;;) {
      const n = await output.next();
      if (n.done) {
        proof = n.value;
        break;
      }
      if (n.value.kind === 'adventure-image-bytes') {
        count++;
        expect(n.value.payload.length).toBeLessThanOrEqual(65536);
      }
    }
    expect(count).toBe(Math.ceil(size / 65536) * 2);
    expect(proof.bytes).toBe(size * 2);
  }
}, 30000);
for (const [name, mutate] of [
  ['source', (v) => ({ ...v, sourceToken: '0'.repeat(64) })],
  ['ordinal', (v) => ({ ...v, index: 2 })],
  ['token', (v) => ({ ...v, imageToken: '0'.repeat(64) })],
  ['extra', (v) => ({ ...v, url: 'DO_NOT_COPY' })],
  ['hash', (v) => ({ ...v, chunkHash: '0'.repeat(64) })],
  ['base64', (v) => ({ ...v, chunkBase64: '!invalid' })],
])
  it('rejects changed image chunk ' + name, async () => {
    const f = await imageDataFixture();
    f.intercept(async (method, input, run) => {
      const value = await run();
      return method === 'readAdventureBackupImageChunk' ? mutate(value) : value;
    });
    await expect(collect(stream(f.id, f.scanApi, options))).rejects.toBeInstanceOf(
      AdventureImageError,
    );
  });
it('rejects a false whole-image SHA even when every part SHA is valid', async () => {
  const f = await imageDataFixture();
  f.intercept(async (method, input, run) => {
    const v = await run();
    return method === 'getAdventureBackupImage' && v.image.kind === 'library'
      ? { ...v, image: { ...v.image, contentHash: '0'.repeat(64) } }
      : v;
  });
  await expect(collect(stream(f.id, f.scanApi, options))).rejects.toBeInstanceOf(
    AdventureImageError,
  );
});
it('the second pass detects a new Storage generation with unchanged content and root clock', async () => {
  const f = await imageDataFixture(),
    c = await collect(stream(f.id, f.scanApi, options));
  f.meta.generation = '13';
  await expect(verify(c.proof, f.scanApi, options)).rejects.toBeInstanceOf(AdventureImageError);
});
it('the second pass detects a library metadata change without changing the project', async () => {
  const f = await imageDataFixture(),
    c = await collect(stream(f.id, f.scanApi, options));
  await f.db.runTransaction((tx) =>
    tx.update(f.db.doc('users/author/imageLibrary/' + f.imageId), { name: 'CHANGED' }),
  );
  await expect(verify(c.proof, f.scanApi, options)).rejects.toBeInstanceOf(AdventureImageError);
});
it('a binding revoked between ranges fails before completing the section', async () => {
  const f = await imageDataFixture();
  f.hook.range = async () => {
    f.hook.range = null;
    const resource = { kind: 'scene', id: f.sceneId };
    await f.blocks.setAdventureBlockImage('author', {
      adventureId: f.id,
      resource,
      operationId: 'image-file-revoke-0001',
      expectedRevision: f.records.get(f.path + '/scenes/' + f.sceneId).revision,
      image: null,
    });
  };
  await expect(collect(stream(f.id, f.scanApi, options))).rejects.toBeTruthy();
});
it('range I/O failure does not finish a proof and a new capture can retry', async () => {
  const f = await imageDataFixture();
  f.hook.range = () => {
    throw new Error('range offline');
  };
  await expect(collect(stream(f.id, f.scanApi, options))).rejects.toBeTruthy();
  f.hook.range = null;
  expect((await collect(stream(f.id, f.scanApi, options))).proof.assets).toBe(2);
});
it('return closes while the API response is held and discards the late response', async () => {
  const f = await imageDataFixture();
  let enter, release;
  const entered = new Promise((r) => {
    enter = r;
  });
  const held = new Promise((r) => {
    release = r;
  });
  f.intercept(async (method, input, run) => {
    if (method === 'readAdventureBackupImageChunk') {
      enter();
      await held;
    }
    return run();
  });
  const output = stream(f.id, f.scanApi, options);
  await output.next();
  await output.next();
  const pending = output.next();
  await entered;
  expect(await output.return(undefined)).toEqual({ done: true, value: undefined });
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  const calls = f.calls.length;
  release();
  await Promise.resolve();
  expect(f.calls).toHaveLength(calls);
});
it('account changes stop before the next read and source/options are frozen before consumption', async () => {
  const f = await imageDataFixture();
  let active = true;
  const opts = {
    guard: () => {
      if (!active) throw new Error('actor changed');
    },
  };
  const output = stream(f.id, f.scanApi, opts);
  opts.guard = () => {};
  await output.next();
  const before = f.calls.length;
  active = false;
  await expect(output.next()).rejects.toThrow('actor changed');
  expect(f.calls).toHaveLength(before);
});

it('the final pass detects a replaced member even when the total number of bindings stays equal', async () => {
  const f = await imageDataFixture(3, false);
  let second = false;
  f.intercept(async (method, input, run) => {
    const result = await run();
    return method === 'listAdventureBackupImageBindings' && input.kind === 'scene'
      ? { ...result, items: second ? result.items.slice(1) : result.items.slice(0, 2) }
      : result;
  });
  const c = await collect(stream(f.id, f.scanApi, options));
  second = true;
  await expect(verify(c.proof, f.scanApi, options)).rejects.toBeInstanceOf(AdventureImageError);
});
it('a recreated root cannot reuse the captured proof, even with the same logical fields', async () => {
  const f = await imageDataFixture(),
    c = await collect(stream(f.id, f.scanApi, options));
  const data = structuredClone(f.records.get(f.path));
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(f.path)));
  await f.db.runTransaction((tx) => tx.create(f.db.doc(f.path), data));
  await expect(verify(c.proof, f.scanApi, options)).rejects.toBeTruthy();
});
it('metadata page rows are captured before awaiting an image read', async () => {
  const f = await imageDataFixture(2, false);
  let page;
  f.intercept(async (method, input, run) => {
    const value = await run();
    if (method === 'listAdventureBackupImageBindings' && input.kind === 'scene') page = value;
    if (method === 'getAdventureBackupImage' && input.kind === 'scene' && page?.items.length > 1)
      page.items[1].id = 'late-mutated-id';
    return value;
  });
  const c = await collect(stream(f.id, f.scanApi, options));
  expect(c.proof.bindings).toBe(3);
  expect(
    c.records
      .filter((r) => r.kind === 'adventure-image-binding')
      .map(json)
      .some((v) => v.resource.id === 'late-mutated-id'),
  ).toBe(false);
});
it('image and core proofs share one source and agree on the complete binding inventory', async () => {
  const { streamAdventureCoreData, verifyAdventureBackupInventory } = await import('../index');
  const f = await imageDataFixture(),
    core = await collect(streamAdventureCoreData(f.id, f.scanApi, options));
  const c = await collect(
    stream(f.id, f.scanApi, { ...options, source: core.proof.inventory.source }),
  );
  expect(c.proof.bindings).toBe(core.proof.inventory.counts.images);
  await verify(c.proof, f.scanApi, options);
  await verifyAdventureBackupInventory(core.proof.inventory, f.scanApi, options);
});
