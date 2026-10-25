// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import { createBookLoreReadClient } from '../services/bookLoreReadClient.ts';
import { createBookLoreReadService } from '../../../../functions/src/bookLoreRead.mjs';
import { adventureImportDb } from '../../../../functions/test/helpers/adventureImportDb.mjs';
import { seedBookLoreGeneration } from '../../../../functions/test/helpers/bookLoreGenerationFixture.mjs';
import {
  fieldUploadFixture,
  uploadAll,
  sealAll,
} from '../../../../functions/test/helpers/bookLoreFieldUploadFixture.mjs';
import { openSealedBookLoreFieldUpload } from '../../../../functions/src/bookLoreFieldUploadProofs.mjs';
const sha = (x) => createHash('sha256').update(x).digest('hex');
afterEach(() => vi.unstubAllGlobals());
async function fixture(options) {
  vi.stubGlobal('crypto', webcrypto);
  const f = adventureImportDb({ nativeUpdates: true }),
    seed = await seedBookLoreGeneration(f.db, options),
    server = createBookLoreReadService({ db: f.db });
  let intercept,
    active = 0,
    peak = 0,
    current = true;
  const call = vi.fn(async (name, input) => {
    active++;
    peak = Math.max(peak, active);
    try {
      const result = await server[name](seed.uid, input);
      return intercept ? await intercept(name, input, result) : result;
    } finally {
      active--;
    }
  });
  return {
    ...f,
    seed,
    call,
    server,
    client: createBookLoreReadClient(call, () => {
      if (!current) throw Error('context changed');
    }),
    intercept: (fn) => {
      intercept = fn;
    },
    revoke: () => {
      current = false;
    },
    peak: () => peak,
  };
}
it('assembles unchanged large base and a new field above 8 MiB/128 parts without editing, normalizing or dropping them', async () => {
  const old = '\ufeff' + '🌙'.repeat(2300000),
    name = '  ' + 'N'.repeat(9 * 1024 * 1024),
    f = await fixture({
      baseData: {
        name: 'old',
        category: 'character',
        details: old,
        summary: 'remove me',
        aliases: ['', 'same', 'same'],
        isPublic: true,
      },
      fields: { name, summary: null, isPublic: false },
    }),
    before = await f.db.runTransaction((tx) => tx.get(f.db.doc(f.seed.path))),
    result = await f.client.get('book', 'entity');
  expect(sha(result.data.name)).toBe(sha(name));
  expect(sha(result.data.details)).toBe(sha(old));
  expect(result.data.aliases).toEqual(['', 'same', 'same']);
  expect(result.data.isPublic).toBe(false);
  expect(Object.hasOwn(result.data, 'summary')).toBe(false);
  expect(result.data.createdAt).toBe(1000);
  expect(result.data.updatedAt).toBe(2000);
  expect(f.peak()).toBeLessThanOrEqual(4);
  const after = await f.db.runTransaction((tx) => tx.get(f.db.doc(f.seed.path)));
  expect([after.updateTime.seconds, after.updateTime.nanoseconds]).toEqual([
    before.updateTime.seconds,
    before.updateTime.nanoseconds,
  ]);
  expect(after.data()).toEqual(before.data());
}, 20000);
it('assembles a field-only generation and preserves missing createdAt, empty values and duplicates', async () => {
  const f = await fixture({
      noBase: true,
      fields: {
        name: '',
        category: 'other',
        details: '',
        aliases: ['', 'x', 'x'],
        structuredDetails: { notes: '' },
        isPublic: false,
      },
      relations: [],
    }),
    result = await f.client.get('book', 'entity');
  expect(result).toEqual({
    id: 'entity',
    data: {
      name: '',
      category: 'other',
      details: '',
      aliases: ['', 'x', 'x'],
      structuredDetails: { notes: '' },
      isPublic: false,
      updatedAt: 2000,
      relations: [],
    },
  });
  expect(f.call.mock.calls.some(([n, i]) => n === 'readBookLorePart' && i.section === 'base')).toBe(
    false,
  );
});
it('reads retained relations independently of the new root generation, including every old page', async () => {
  const relations = Array.from({ length: 130 }, (_, i) => ({
      targetEntityId: 'target',
      relationType: String(i),
    })),
    f = await fixture({ baseData: { name: 'old', category: 'other', relations } }),
    result = await f.client.list('book');
  expect(result[0].data.relations).toEqual(relations);
});
it('assembles new relation pages including a page larger than a native document', async () => {
  const relations = Array.from({ length: 65 }, () => ({
      targetEntityId: 'target',
      relationType: 'r',
      description: '🌙'.repeat(5000),
    })),
    f = await fixture({ relations }),
    result = await f.client.get('book', 'entity');
  expect(result.data.relations).toEqual(relations);
});
it('reads a genuinely streamed and sealed upload through the real v2 reader and TS client using only an explicit head harness', async () => {
  vi.stubGlobal('crypto', webcrypto);
  const f = adventureImportDb({ nativeUpdates: true }),
    upload = await fieldUploadFixture(f.db, {
      inline: false,
      value: '\ufeff' + '🌙'.repeat(50000),
    }),
    p = await sealAll(upload, await uploadAll(upload)),
    opening = await f.db.runTransaction((tx) =>
      openSealedBookLoreFieldUpload(tx, upload.c, {
        startHash: upload.startHash,
        jobToken: p.jobToken,
      }),
    ),
    ref = f.db.doc('books/book/lore/entity'),
    previous = (await f.db.runTransaction((tx) => tx.get(ref))).data().payloadStorage;
  // Reader harness only: no product adoption, clock, lease transition or activation is claimed.
  await f.db.runTransaction(async (tx) =>
    tx.set(ref, {
      bookId: 'book',
      createdAt: 1000,
      updatedAt: 2000,
      payloadStorage: {
        schemaVersion: 2,
        generationId: sha('read-harness'),
        base: previous.base,
        fields: { details: opening.pointer },
        dates: { createdAt: 1000, updatedAt: 2000 },
        relations: {
          ...previous.relations,
          generationId: previous.generationId,
          sealBirth: previous.sealBirth,
        },
        sealBirth: opening.pointer.expectedBirth,
      },
    }),
  );
  const server = createBookLoreReadService({ db: f.db }),
    client = createBookLoreReadClient(
      (name, input) => server[name]('author', input),
      () => {},
    ),
    result = await client.get('book', 'entity');
  expect(result.data.details).toBe(upload.value);
  expect(result.data.name).toBe('Original');
  expect(f.records.get(upload.c.path).phase).toBe('sealed');
});
const invalidHeaders = {
  'unknown field': (r) => {
    r.fields.relations = null;
  },
  'physical pointer': (r) => {
    r.fields.name.bodyId = sha('hidden');
  },
  'required removal': (r) => {
    r.fields.name = null;
  },
  'field-only missing required': (r) => {
    r.base = null;
    delete r.fields.category;
  },
  'bad field manifest': (r) => {
    r.fields.name.chunkCount++;
  },
  'unknown date': (r) => {
    r.dates.sealBirth = { seconds: 1, nanoseconds: 0 };
  },
  'bad date': (r) => {
    r.dates.updatedAt = Number.MAX_SAFE_INTEGER;
  },
  'inline v2': (r) => {
    r.mode = 'inline';
    r.relations = null;
  },
  'v1 with v2 fields': (r) => {
    r.schemaVersion = 1;
  },
  'missing dates': (r) => {
    delete r.dates;
  },
};
it.each(Object.entries(invalidHeaders))(
  'refuses malformed v2 transport: %s',
  async (_name, change) => {
    const f = await fixture();
    f.intercept((name, _input, result) => {
      if (name === 'getBookLoreRead') change(result);
      return result;
    });
    await expect(f.client.get('book', 'entity')).rejects.toThrow('conferir');
    expect(f.call.mock.calls.filter(([n]) => n === 'readBookLorePart')).toHaveLength(0);
  },
);
it.each(['field', 'index', 'manifest', 'bytes', 'extra'])(
  'refuses a mismatched field response: %s',
  async (mode) => {
    const f = await fixture();
    f.intercept((name, input, result) => {
      if (name === 'readBookLorePart' && input.section === 'field') {
        if (mode === 'field') result.field = 'details';
        if (mode === 'index') result.index = 1;
        if (mode === 'manifest') result.manifest.contentHash = sha('wrong');
        if (mode === 'bytes')
          result.chunkBase64 = Buffer.from(JSON.stringify('Changed')).toString('base64');
        if (mode === 'extra') result.partSealBirth = { seconds: 1, nanoseconds: 0 };
      }
      return result;
    });
    await expect(f.client.get('book', 'entity')).rejects.toThrow('conferir');
  },
);
it.each(['fields', 'dates', 'base', 'readToken'])(
  'rechecks the final v2 header and rejects changed %s',
  async (mode) => {
    const f = await fixture();
    let headers = 0;
    f.intercept((name, _input, result) => {
      if (name === 'getBookLoreRead' && ++headers === 2) {
        if (mode === 'fields') result.fields.summary = result.fields.name;
        if (mode === 'dates') result.dates.updatedAt++;
        if (mode === 'base') result.base.contentHash = sha('other');
        if (mode === 'readToken') result.readToken = sha('changed');
      }
      return result;
    });
    await expect(f.client.get('book', 'entity')).rejects.toThrow('conferir');
  },
);
it('rejects invalid domain in a replaced base field rather than hiding it under a tombstone', async () => {
  const f = await fixture({
    baseData: { name: 'N', category: 'other', summary: 33 },
    fields: { summary: null },
  });
  await expect(f.client.get('book', 'entity')).rejects.toThrow('conferir');
});
it.each([
  { isPublic: 'yes' },
  { category: 'invalid' },
  { aliases: [33] },
  { structuredDetails: { unknown: 'x' } },
])('validates complete domain for field overrides %j', async (fields) => {
  const f = await fixture({ fields });
  await expect(f.client.get('book', 'entity')).rejects.toThrow('conferir');
});
it('revocation after the first new-field part prevents any partial fiche', async () => {
  const f = await fixture({ fields: { details: 'x'.repeat(400000) } });
  let reads = 0;
  f.intercept(async (name, input, result) => {
    if (name === 'readBookLorePart' && input.section === 'field' && ++reads === 1)
      await f.db.runTransaction(async (tx) =>
        tx.update(f.db.doc(f.seed.bookPath), { authorId: 'other' }),
      );
    return result;
  });
  await expect(f.client.get('book', 'entity')).rejects.toThrow('indisponível');
  expect(reads).toBe(1);
});
it('drains concurrent field parts after a failure before a refresh can start', async () => {
  const f = await fixture({ fields: { details: 'x'.repeat(400000) } }),
    releases = [];
  let finished = false;
  f.intercept((name, input, result) => {
    if (name !== 'readBookLorePart' || input.section !== 'field' || input.index === 0)
      return result;
    if (input.index === 1) throw Error('field failed');
    return new Promise((resolve) => releases.push(() => resolve(result)));
  });
  const result = f.client.get('book', 'entity').finally(() => {
      finished = true;
    }),
    failed = expect(result).rejects.toThrow('field failed');
  await vi.waitFor(() => expect(releases).toHaveLength(3));
  expect(finished).toBe(false);
  expect(f.peak()).toBe(4);
  releases.forEach((release) => release());
  await failed;
});
it('drops a late field response when the captured session changes', async () => {
  const f = await fixture();
  f.intercept((name, input, result) => {
    if (name === 'readBookLorePart' && input.section === 'field') f.revoke();
    return result;
  });
  await expect(f.client.get('book', 'entity')).rejects.toThrow('context changed');
});

for (const portableDates of [
  {},
  { createdAt: 0 },
  { updatedAt: 0 },
  { createdAt: 1, updatedAt: 2 },
])
  it(
    'preserves portable date presence independently of physical generation timestamps ' +
      JSON.stringify(portableDates),
    async () => {
      const f = await fixture({
          noBase: true,
          fields: { name: '', category: 'other', summary: '' },
          relations: [],
          dates: { createdAt: 1000, updatedAt: 2000 },
          transform: (storage) => ({ ...storage, portableDates }),
        }),
        value = await f.client.get('book', 'entity'),
        head = (await f.db.doc(f.seed.path).get()).data();
      expect(value.data).toEqual({
        name: '',
        category: 'other',
        summary: '',
        relations: [],
        ...portableDates,
      });
      expect(head.createdAt).toBe(1000);
      expect(head.updatedAt).toBe(2000);
      const parts = [];
      await f.client.writePortable('book', 'entity', async (_, bytes) => {
        parts.push(Buffer.from(bytes));
      });
      expect(JSON.parse(Buffer.concat(parts).toString()).data).toEqual(value.data);
    },
  );
