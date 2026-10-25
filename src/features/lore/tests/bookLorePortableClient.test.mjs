// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createBookLoreReadClient } from '../services/bookLoreReadClient';
import {
  createBookPortableLoreItemIndex,
  advanceBookPortableLoreItemIndex,
  finishBookPortableLoreItemIndex,
} from '../../../../functions/src/bookPortableLoreItemIndex.mjs';
import { adventureImportDb } from '../../../../functions/test/helpers/adventureImportDb.mjs';
import { seedBookLoreRead } from '../../../../functions/test/helpers/bookLoreReadFixture.mjs';
import { seedBookLoreGeneration } from '../../../../functions/test/helpers/bookLoreGenerationFixture.mjs';
import {
  creationAdoptionFixture,
  adoptCreation,
} from '../../../../functions/test/helpers/bookLoreCreationAdoptionFixture.mjs';
import { createBookLoreReadService } from '../../../../functions/src/bookLoreRead.mjs';
import { resourcePayloadChunkPath } from '../../../../functions/src/bookResourcePayloadPaths.mjs';
const hash = (b) => createHash('sha256').update(b).digest('hex');
const value = () => ({
  name: ' \ufeff🌙 " exact ',
  category: 'character',
  aliases: ['', 'same', 'same'],
  summary: ' literal ',
  details: 'PRIVATE_PORTABLE_TEXT\u0000\n🌙',
  structuredDetails: { notes: '\ufeff notes' },
  isPublic: false,
});
async function fixture(mode = 'v1', options = {}) {
  const f = adventureImportDb({ nativeUpdates: true }),
    data = { ...value(), ...options.data };
  let seed,
    id = options.id ?? 'entity',
    expected;
  if (mode === 'created') {
    const creation = await creationAdoptionFixture(f.db, {
      changes: Object.entries(data).map(([field, value]) => ({ target: { field }, value })),
    });
    await adoptCreation(creation);
    id = creation.loreId;
    seed = creation.source.seed;
    expected = { ...data, ...f.records.get(seed.path).payloadStorage.dates };
  } else if (mode === 'v2') {
    const { relations, ...fields } = data;
    seed = await seedBookLoreGeneration(f.db, {
      id,
      noBase: options.noBase ?? true,
      fields,
      ...(relations === undefined ? {} : { relations }),
      ...options.generation,
    });
    const base = options.noBase === false ? { ...options.generation?.baseData } : {};
    delete base.bookId;
    delete base.createdAt;
    delete base.updatedAt;
    for (const [k, v] of Object.entries(fields)) {
      if (v === null) delete base[k];
      else base[k] = v;
    }
    expected = {
      ...base,
      ...seed.storage.dates,
      ...(relations === undefined ? {} : { relations }),
    };
  } else {
    seed = await seedBookLoreRead(f.db, { id, inline: mode === 'inline', data });
    expected = mode === 'inline' ? data : { ...data, createdAt: 1000, updatedAt: 1000 };
  }
  const api = createBookLoreReadService({ db: f.db }),
    call = vi.fn((method, input) => api[method]('author', input));
  let active = true;
  const guard = () => {
      if (!active) throw Error('Context changed');
    },
    client = createBookLoreReadClient(call, guard, { tokenVersion: 2 });
  return {
    ...f,
    seed,
    id,
    expected,
    call,
    client,
    guard,
    api,
    revoke: () => {
      active = false;
    },
  };
}
async function capture(f, options = {}) {
  const parts = [],
    write =
      options.write ??
      (async (part, bytes) => {
        expect(part).toBe(parts.length);
        parts.push(Buffer.from(bytes));
      }),
    proof = await f.client.writePortable('book', f.id, write, options.signal),
    bytes = Buffer.concat(parts);
  return { proof, parts, bytes, decoded: JSON.parse(bytes.toString('utf8')) };
}
const reads = (f) => f.call.mock.calls.filter(([m]) => m === 'readBookLorePart');
function consistent(f, r) {
  expect(r.decoded).toEqual({
    schemaVersion: 1,
    kind: 'lore',
    parentId: null,
    id: f.id,
    data: f.expected,
  });
  expect(r.proof.contentHash).toBe(hash(r.bytes));
  expect(r.proof.byteLength).toBe(r.bytes.length);
  expect(r.proof.chunkCount).toBe(r.parts.length);
  const data = r.bytes.subarray(r.proof.dataOffset, r.proof.dataOffset + r.proof.dataByteLength);
  expect(r.proof.dataHash).toBe(hash(data));
  expect(JSON.parse(data.toString())).toEqual(f.expected);
  for (const [field, span] of Object.entries(r.proof.index.ranges))
    expect(
      JSON.parse(data.subarray(span.offset, span.offset + span.byteLength).toString()),
    ).toEqual(f.expected[field]);
  expect(r.parts.slice(0, -1).every((p) => p.length === 65536)).toBe(true);
  expect(r.parts.at(-1).length).toBeGreaterThan(0);
  expect(r.parts.at(-1).length).toBeLessThanOrEqual(65536);
  expect(JSON.stringify(r.proof)).not.toContain('PRIVATE_PORTABLE_TEXT');
  expect(Object.isFrozen(r.proof)).toBe(true);
  expect(Object.isFrozen(r.proof.source)).toBe(true);
  let state = createBookPortableLoreItemIndex();
  const references = [];
  for (const part of r.parts) {
    for (let at = 0; at < part.length;) {
      const step = advanceBookPortableLoreItemIndex(state, part.subarray(at), 17);
      expect(step.consumed).toBeGreaterThan(0);
      expect(step.references.length).toBeLessThanOrEqual(17);
      references.push(...step.references);
      state = JSON.parse(JSON.stringify(step.state));
      at += step.consumed;
    }
  }
  expect(finishBookPortableLoreItemIndex(state)).toEqual({
    schemaVersion: 1,
    kind: 'lore',
    parentId: null,
    id: f.id,
    byteLength: r.proof.byteLength,
    dataOffset: r.proof.dataOffset,
    dataByteLength: r.proof.dataByteLength,
    index: r.proof.index,
  });
  expect(references).toEqual(
    (f.expected.relations ?? []).map((r, index) => ({
      index,
      targetEntityId: r.targetEntityId,
    })),
  );
}
it.each(['inline', 'v1', 'v2', 'created'])(
  'production C1 → portable JSON for %s preserves the closed logical source',
  async (mode) => {
    const f = await fixture(mode),
      before = structuredClone([...f.records]),
      r = await capture(f);
    consistent(f, r);
    const count = reads(f).length;
    await f.client.verifyPortable(r.proof);
    expect(reads(f).length).toBe(count);
    expect([...f.records]).toEqual(before);
    expect(f.call.mock.calls[0]).toEqual([
      'getBookLoreRead',
      { bookId: 'book', id: f.id, tokenVersion: 1 },
    ]);
  },
);
it.each(['v1', 'v2'])(
  '%s larger than 8 MiB/128 parts reads each physical unit once with linear I/O',
  async (mode) => {
    const f = await fixture(mode, {
        data: { details: '\ufeff' + 'PRIVATE_PORTABLE_TEXT🌙'.repeat(400000) },
      }),
      r = await capture(f);
    consistent(f, r);
    expect(r.bytes.length).toBeGreaterThan(8 * 1024 * 1024);
    expect(r.parts.length).toBeGreaterThan(128);
    const units = reads(f).map(([, input]) =>
      JSON.stringify([input.section, input.field, input.page, input.index]),
    );
    expect(new Set(units).size).toBe(units.length);
    if (mode === 'v1') expect(units.length).toBe(f.seed.base.prepared.manifest.chunkCount);
    else
      expect(units.length).toBe(
        Object.values(f.seed.bodies).reduce((n, b) => n + b.prepared.manifest.chunkCount, 0),
      );
    expect(JSON.stringify(r.proof).length).toBeLessThan(6000);
  },
);
it('v2 overlays remove optionals and source dates without copying replaced base prose', async () => {
  const baseData = {
      name: 'old',
      category: 'other',
      aliases: ['old'],
      summary: 'PRIVATE_OLD_SUMMARY',
      details: 'PRIVATE_OLD_DETAILS'.repeat(100000),
      isPublic: true,
    },
    f = await fixture('v2', {
      noBase: false,
      data: { summary: null, aliases: null, details: '' },
      generation: { baseData, dates: { updatedAt: 2222 } },
    }),
    r = await capture(f);
  consistent(f, r);
  expect(r.decoded.data).not.toHaveProperty('createdAt');
  expect(r.decoded.data).not.toHaveProperty('summary');
  expect(r.decoded.data).not.toHaveProperty('aliases');
  expect(r.bytes.includes(Buffer.from('PRIVATE_OLD'))).toBe(false);
  expect(reads(f).filter(([, i]) => i.section === 'base')).toHaveLength(
    f.seed.base.prepared.manifest.chunkCount,
  );
});
it.each(['v1', 'v2'])(
  '%s paged relations preserve 130 entries, duplicates and a large description',
  async (mode) => {
    const relations = Array.from({ length: 130 }, (_, i) => ({
        targetEntityId: i % 2 ? 'universe:world:external' : 'same',
        relationType: '',
        description: i === 64 ? '\ufeff🌙'.repeat(19000) : '',
      })),
      f = await fixture(mode, { data: { relations } }),
      r = await capture(f);
    consistent(f, r);
    expect(r.proof.index.relations).toEqual({ present: true, count: 130 });
    const units = reads(f).filter(([, i]) => i.section === 'relations');
    expect(new Set(units.map(([, i]) => i.page)).size).toBe(3);
    expect(new Set(units.map(([, i]) => i.page + ':' + i.index)).size).toBe(units.length);
  },
);
it.each([undefined, []])('relation presence is preserved for %j', async (relations) => {
  const f = await fixture('v1', { data: relations === undefined ? {} : { relations } }),
    r = await capture(f);
  consistent(f, r);
  expect(Object.hasOwn(r.decoded.data, 'relations')).toBe(relations !== undefined);
  expect(reads(f).some(([, i]) => i.section === 'relations')).toBe(false);
});
it('field names and aliases are literal private backup data, without publication trim or limits', async () => {
  const f = await fixture('v2', {
      data: {
        name: ' '.repeat(9000000) + '\ufeff Name ',
        aliases: Array.from({ length: 1500 }, (_, i) => (i % 2 ? '' : 'same')),
      },
    }),
    r = await capture(f);
  consistent(f, r);
  expect(r.decoded.data.name).toBe(f.expected.name);
  expect(r.proof.index.isPublic).toEqual({ present: true, value: false });
});
it('caller backpressure stops the next native read until the pending part is consumed', async () => {
  const f = await fixture('v1', { data: { details: 'x'.repeat(500000) } });
  let release, started;
  const gate = new Promise((r) => {
      release = r;
    }),
    entered = new Promise((r) => {
      started = r;
    });
  let first = true;
  const pending = f.client.writePortable('book', f.id, async () => {
    if (first) {
      first = false;
      started();
      await gate;
    }
  });
  await entered;
  const before = f.call.mock.calls.length;
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect(f.call.mock.calls.length).toBe(before);
  release();
  expect((await pending).chunkCount).toBeGreaterThan(2);
});
it.each(['account', 'abort', 'writer'])(
  '%s during a pending output never returns a completion proof or reads another body unit',
  async (reason) => {
    const f = await fixture('v1', { data: { details: 'x'.repeat(500000) } }),
      controller = new AbortController();
    let release, started;
    const gate = new Promise((r) => {
        release = r;
      }),
      entered = new Promise((r) => {
        started = r;
      });
    let first = true;
    const pending = f.client.writePortable(
        'book',
        f.id,
        async () => {
          if (first) {
            first = false;
            started();
            await gate;
            if (reason === 'writer') throw Error('Sink failed');
          }
        },
        controller.signal,
      ),
      rejected = expect(pending).rejects.toThrow();
    await entered;
    const before = f.call.mock.calls.length;
    if (reason === 'account') f.revoke();
    else if (reason === 'abort') controller.abort();
    release();
    await rejected;
    expect(f.call.mock.calls.length).toBe(before);
  },
);
it('a late native byte response after abort is discarded before writing any output part', async () => {
  const f = await fixture('v1'),
    controller = new AbortController(),
    run = f.call.getMockImplementation(),
    writer = vi.fn();
  f.call.mockImplementation(async (method, input) => {
    const result = await run(method, input);
    if (method === 'readBookLorePart') controller.abort();
    return result;
  });
  await expect(f.client.writePortable('book', f.id, writer, controller.signal)).rejects.toThrow();
  expect(writer).not.toHaveBeenCalled();
});
it('corruption after a valid large prefix cannot produce a proof even when JSON remains valid', async () => {
  const f = await fixture('v1', { data: { details: 'x'.repeat(200000) } }),
    run = f.call.getMockImplementation(),
    writer = vi.fn();
  f.call.mockImplementation(async (method, input) => {
    const result = await run(method, input);
    if (method === 'readBookLorePart' && input.index === 2) {
      const bytes = Buffer.from(result.chunkBase64, 'base64');
      bytes[100] = 121;
      return { ...result, chunkBase64: bytes.toString('base64') };
    }
    return result;
  });
  await expect(f.client.writePortable('book', f.id, writer)).rejects.toThrow();
  expect(writer).toHaveBeenCalled(); // Provisional bytes never imply a successful seal.
});
it.each(['clock', 'head', 'tombstone', 'book-birth'])(
  '%s changed after output invalidates the original source before completion',
  async (mutation) => {
    const f = await fixture('v1');
    await expect(
      f.client.writePortable('book', f.id, async () => {
        await f.db.runTransaction((tx) => {
          if (mutation === 'clock') tx.update(f.db.doc('books/book'), { localLoreVersion: 1 });
          if (mutation === 'head') tx.update(f.db.doc(f.seed.path), { updatedAt: 2222 });
          if (mutation === 'tombstone')
            tx.create(f.db.doc('books/book/bookLoreTombstones/' + f.id), { schemaVersion: 1 });
          if (mutation === 'book-birth') {
            const p = f.records.get('books/book');
            tx.delete(f.db.doc('books/book'));
            tx.create(f.db.doc('books/book'), p);
          }
        });
      }),
    ).rejects.toThrow();
  },
);
it('native source recreation or an unavailable tail is not replaced with empty lore', async () => {
  const f = await fixture('v1', { data: { details: 'x'.repeat(90000) } }),
    path = resourcePayloadChunkPath('book', f.seed.base.prepared.manifest.bodyId, 1);
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
  await expect(capture(f)).rejects.toThrow();
});
it('metadata revalidation refuses the captured collection clock without downloading prose', async () => {
  const f = await fixture('v2'),
    r = await capture(f),
    count = reads(f).length;
  await f.db.runTransaction((tx) => tx.update(f.db.doc('books/book'), { localLoreVersion: 1 }));
  await expect(f.client.verifyPortable(r.proof)).rejects.toThrow();
  expect(reads(f).length).toBe(count);
});

it('Unicode and quoted source IDs use byte offsets without altering the JSON envelope', async () => {
  const f = await fixture('inline', { id: 'entity🌙"' }),
    r = await capture(f);
  consistent(f, r);
  expect(r.decoded.id).toBe('entity🌙"');
});

it('a hashed override cannot inject extra members into the portable object', async () => {
  const f = await fixture('v2', { data: { isPublic: null } }),
    run = f.call.getMockImplementation(),
    bytes = Buffer.from('"Injected","isPublic":true'),
    manifest = {
      schemaVersion: 1,
      byteLength: bytes.length,
      chunkCount: 1,
      contentHash: hash(bytes),
    };
  f.call.mockImplementation(async (method, input) => {
    const result = structuredClone(await run(method, input));
    if (method === 'getBookLoreRead') result.fields.name = manifest;
    if (method === 'readBookLorePart' && input.field === 'name') {
      result.manifest = manifest;
      result.chunkBase64 = bytes.toString('base64');
    }
    return result;
  });
  await expect(capture(f)).rejects.toThrow();
});

it('portable metadata always pins token v1 even in an editor v2 session and never reads prose', async () => {
  const f = await fixture('v2'),
    result = await capture(f);
  f.call.mockClear();
  const current = await f.client.portableMetadata('book', f.id);
  expect(current).toEqual(result.proof.source);
  expect(f.call.mock.calls).toEqual([
    ['getBookLoreRead', { bookId: 'book', id: f.id, tokenVersion: 1 }],
  ]);
  const controller = new AbortController();
  controller.abort();
  f.call.mockClear();
  await expect(f.client.portableMetadata('book', f.id, controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(f.call).not.toHaveBeenCalled();
});
