import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createBookLoreReadService } from '../src/bookLoreRead.mjs';
import { openBookLoreRecord, readBookLoreRecordPart } from '../src/bookLoreStorageRead.mjs';
import { loreGenerationStorage } from '../src/bookLoreGenerationContracts.mjs';
import { resourcePayloadChunkPath } from '../src/bookResourcePayloadPaths.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { seedBookLoreRead } from './helpers/bookLoreReadFixture.mjs';
import {
  seedBookLoreGeneration,
  readGenerationSection,
} from './helpers/bookLoreGenerationFixture.mjs';
const setup = () => {
  const f = adventureImportDb({ nativeUpdates: true });
  return { ...f, api: createBookLoreReadService({ db: f.db }) };
};
const scope = (s) => ({ bookId: s.bookId, id: s.id });
const req = (s, v, field = 'name') => ({
  ...scope(s),
  readToken: v.readToken,
  section: 'field',
  field,
  page: 0,
  index: 0,
});
const sha = (x) => createHash('sha256').update(x).digest('hex');
test('v2 transport exposes flat field manifests, explicit removal and dates without physical origins', async () => {
  const f = setup(),
    s = await seedBookLoreGeneration(f.db),
    view = await f.api.getBookLoreRead(s.uid, scope(s));
  assert.equal(view.schemaVersion, 2);
  assert.equal(view.mode, 'payload');
  assert.equal(view.fields.summary, null);
  assert.equal(Object.hasOwn(view.fields, 'details'), false);
  assert.deepEqual(view.dates, { createdAt: 1000, updatedAt: 2000 });
  for (const key of [
    'bodyId',
    'merkleRoot',
    'expectedBirth',
    'partSealBirth',
    'generationId',
    'sealBirth',
  ])
    assert.equal(JSON.stringify(view).includes(key), false, key);
  assert.equal(await readGenerationSection(f.api, s, view), 'Renamed');
  assert.equal(await readGenerationSection(f.api, s, view, 'field', 'isPublic'), false);
  const base = await readGenerationSection(f.api, s, view, 'base');
  assert.equal(base.details, 'untouched');
  assert.equal(base.summary, 'before');
  assert.equal(f.commits.at(-1).length, 0);
});
test('one large field above 8 MiB/128 parts is read independently from an unchanged base', async () => {
  const f = setup(),
    value = '\ufeff' + '🌙'.repeat(2300000),
    s = await seedBookLoreGeneration(f.db, { fields: { details: value } }),
    v = await f.api.getBookLoreRead(s.uid, scope(s));
  assert.ok(v.fields.details.chunkCount > 128);
  const paths = [],
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        get(ref) {
          paths.push(ref.path);
          return tx.get(ref);
        },
        getAll(ref, ...args) {
          paths.push(ref.path);
          return tx.getAll(ref, ...args);
        },
      }),
    );
  const actual = await readGenerationSection(f.api, s, v, 'field', 'details');
  assert.equal(sha(actual), sha(value));
  const chunkReads = paths.filter((path) => path.includes('/bookResourceChunks/'));
  assert.equal(chunkReads.length, v.fields.details.chunkCount);
  assert.ok(chunkReads.every((path) => path.includes(s.bodies.details.prepared.manifest.bodyId)));
});
test('a generation without base needs explicit required fields and supports absent createdAt', async () => {
  const f = setup(),
    s = await seedBookLoreGeneration(f.db, {
      noBase: true,
      fields: { name: '', category: 'other', aliases: [], details: '' },
    }),
    v = await f.api.getBookLoreRead(s.uid, scope(s));
  assert.equal(v.base, null);
  assert.deepEqual(v.dates, { updatedAt: 2000 });
  assert.equal(await readGenerationSection(f.api, s, v), '');
  await assert.rejects(() =>
    f.api.readBookLorePart(s.uid, { ...req(s, v), section: 'base', field: undefined }),
  );
});
test('relation pages may retain their previous independent generation and native seal', async () => {
  const f = setup(),
    values = Array.from({ length: 130 }, (_, i) => ({
      targetEntityId: 'target',
      relationType: 'r' + i,
    })),
    s = await seedBookLoreGeneration(f.db, {
      baseData: { name: 'N', category: 'other', relations: values },
    }),
    v = await f.api.getBookLoreRead(s.uid, scope(s)),
    all = [];
  assert.notEqual(s.storage.generationId, s.storage.relations.generationId);
  for (let page = 0; page < 3; page++)
    all.push(...(await readGenerationSection(f.api, s, v, 'relations', undefined, page)));
  assert.deepEqual(all, values);
});
test('new relation pages use native part cutoffs, including a page larger than a document', async () => {
  const f = setup(),
    values = Array.from({ length: 65 }, () => ({
      targetEntityId: 'target',
      relationType: 'knows',
      description: '🌙'.repeat(5000),
    })),
    s = await seedBookLoreGeneration(f.db, { relations: values }),
    v = await f.api.getBookLoreRead(s.uid, scope(s));
  const first = await readGenerationSection(f.api, s, v, 'relations', undefined, 0),
    last = await readGenerationSection(f.api, s, v, 'relations', undefined, 1);
  assert.deepEqual([...first, ...last], values);
  assert.ok(s.newSegments[0].body.prepared.manifest.byteLength > 1024 * 1024);
});
for (const kind of ['field-header', 'field-chunk', 'relation-segment', 'relation-chunk'])
  test('native recreation is rejected for ' + kind, async () => {
    const f = setup(),
      s = await seedBookLoreGeneration(f.db, {
        relations: [{ targetEntityId: 't', relationType: 'r' }],
      }),
      v = await f.api.getBookLoreRead(s.uid, scope(s));
    const path =
      kind === 'field-header'
        ? s.bodies.name.path
        : kind === 'field-chunk'
          ? resourcePayloadChunkPath(s.bookId, s.bodies.name.prepared.manifest.bodyId, 0)
          : kind === 'relation-segment'
            ? s.newSegments[0].path
            : resourcePayloadChunkPath(s.bookId, s.newSegments[0].body.prepared.manifest.bodyId, 0);
    const snapshot = await f.db.runTransaction((tx) => tx.get(f.db.doc(path))),
      value = snapshot.data();
    await f.db.runTransaction(async (tx) => {
      tx.delete(f.db.doc(path));
    });
    await f.db.runTransaction(async (tx) => {
      tx.create(f.db.doc(path), value);
    });
    await assert.rejects(() =>
      f.api.readBookLorePart(
        s.uid,
        kind.startsWith('field')
          ? req(s, v)
          : { ...scope(s), readToken: v.readToken, section: 'relations', page: 0, index: 0 },
      ),
    );
  });
for (const change of ['owner', 'clock', 'head', 'book-birth', 'deleting'])
  test('every new field unit reauthorizes ' + change, async () => {
    const f = setup(),
      s = await seedBookLoreGeneration(f.db),
      v = await f.api.getBookLoreRead(s.uid, scope(s));
    if (change === 'book-birth') {
      const old = (await f.db.runTransaction((tx) => tx.get(f.db.doc(s.bookPath)))).data();
      await f.db.runTransaction(async (tx) => {
        tx.delete(f.db.doc(s.bookPath));
      });
      await f.db.runTransaction(async (tx) => {
        tx.create(f.db.doc(s.bookPath), old);
      });
    } else
      await f.db.runTransaction(async (tx) => {
        tx.update(
          f.db.doc(change === 'head' ? s.path : s.bookPath),
          change === 'owner'
            ? { authorId: 'other' }
            : change === 'clock'
              ? { localLoreVersion: 1 }
              : change === 'deleting'
                ? { deleting: true }
                : { updatedAt: 2001 },
        );
      });
    await assert.rejects(() => f.api.readBookLorePart(s.uid, req(s, v)));
  });
const invalid = {
  'unknown field': (x) => {
    x.fields.relations = null;
  },
  'required tombstone': (x) => {
    x.fields.name = null;
  },
  'nested overlay': (x) => {
    x.fields.name = { previous: x.fields.name };
  },
  'missing cutoff': (x) => {
    delete x.fields.name.partSealBirth;
  },
  'future cutoff': (x) => {
    x.fields.name.partSealBirth = { seconds: 9000000000, nanoseconds: 0 };
  },
  'future generation seal': (x) => {
    x.sealBirth = { seconds: 9000000000, nanoseconds: 0 };
  },
  'date not represented in stub': (x) => {
    x.dates.extra = 1000;
  },
  'invalid date': (x) => {
    x.dates.updatedAt = -1;
  },
  'relation presence': (x) => {
    x.relations.present = false;
    x.relations.count = 1;
  },
  'relation page count': (x) => {
    x.relations.pages = 1;
  },
  'relation seal after generation': (x) => {
    x.relations.sealBirth = { seconds: 9000000000, nanoseconds: 0 };
  },
  'no base without required fields': (x) => {
    x.base = null;
    delete x.fields.category;
  },
  'unknown generation version': (x) => {
    x.schemaVersion = 3;
  },
};
for (const [name, edit] of Object.entries(invalid))
  test('invalid flat generation rejects ' + name, async () => {
    const f = setup(),
      s = await seedBookLoreGeneration(f.db, {
        transform: (x) => {
          edit(x);
          return x;
        },
      });
    await assert.rejects(() => f.api.getBookLoreRead(s.uid, scope(s)));
  });
test('date presence/value mismatch between the head and descriptor fails before bytes', async () => {
  const f = setup(),
    s = await seedBookLoreGeneration(f.db);
  await f.db.runTransaction(async (tx) => {
    tx.update(f.db.doc(s.path), { createdAt: 5 });
  });
  await assert.rejects(() => f.api.getBookLoreRead(s.uid, scope(s)));
});
test('invalid field coordinates and cross-section injection fail without any bytes', async () => {
  const f = setup(),
    s = await seedBookLoreGeneration(f.db),
    v = await f.api.getBookLoreRead(s.uid, scope(s));
  for (const patch of [
    { field: 'relations' },
    { field: 'summary' },
    { field: 'details' },
    { page: 1 },
    { index: 999 },
    { section: 'base' },
    { section: 'relations' },
    { section: 'field', field: undefined },
  ])
    await assert.rejects(() => f.api.readBookLorePart(s.uid, { ...req(s, v), ...patch }));
});
test('a native opening cannot be copied or moved to another transaction', async () => {
  const f = setup(),
    s = await seedBookLoreGeneration(f.db),
    c = { db: f.db, uid: s.uid, bookId: s.bookId, path: s.bookPath };
  let opening;
  await f.db.runTransaction(async (tx) => {
    opening = await openBookLoreRecord(tx, c, await tx.get(f.db.doc(s.path)));
    await assert.rejects(() => readBookLoreRecordPart(tx, { ...opening }, 'field', 0, 0, 'name'));
  });
  await assert.rejects(() =>
    f.db.runTransaction((tx) => readBookLoreRecordPart(tx, opening, 'field', 0, 0, 'name')),
  );
});
test('v1 descriptor validation remains closed against v2 injection', async () => {
  const f = setup(),
    s = await seedBookLoreGeneration(f.db);
  assert.throws(() => loreGenerationStorage({ ...s.storage, schemaVersion: 1 }));
});

test('v2 field and relation units use constant native reads and exactly one requested chunk', async () => {
  const f = setup(),
    s = await seedBookLoreGeneration(f.db, {
      relations: [{ targetEntityId: 't', relationType: 'r' }],
    }),
    v = await f.api.getBookLoreRead(s.uid, scope(s)),
    paths = [],
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        get(ref) {
          paths.push(ref.path);
          return tx.get(ref);
        },
        getAll(ref, ...args) {
          paths.push(ref.path);
          return tx.getAll(ref, ...args);
        },
      }),
    );
  for (const [section, expected] of [
    ['field', 6],
    ['relations', 7],
  ]) {
    paths.length = 0;
    const result = await f.api.readBookLorePart(s.uid, {
      ...scope(s),
      readToken: v.readToken,
      section,
      page: 0,
      index: 0,
      ...(section === 'field' ? { field: 'name' } : {}),
    });
    assert.equal(paths.length, expected);
    assert.equal(
      paths.filter((p) => p === 'books/' + s.bookId + '/bookLoreTombstones/' + s.id).length,
      1,
    );
    assert.equal(paths.filter((p) => p.includes('/bookResourceChunks/')).length, 1);
    assert.ok(Buffer.from(result.chunkBase64, 'base64').length <= 65536);
  }
});
test('field-only units do not open an unrelated base or another field body', async () => {
  const f = setup(),
    s = await seedBookLoreGeneration(f.db, {
      noBase: true,
      fields: { name: 'N', category: 'other', details: 'D' },
    }),
    v = await f.api.getBookLoreRead(s.uid, scope(s)),
    paths = [],
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        get(ref) {
          paths.push(ref.path);
          return tx.get(ref);
        },
        getAll(ref, ...args) {
          paths.push(ref.path);
          return tx.getAll(ref, ...args);
        },
      }),
    );
  await f.api.readBookLorePart(s.uid, req(s, v));
  assert.equal(paths.length, 5);
  assert.equal(
    paths.filter((p) => p === 'books/' + s.bookId + '/bookLoreTombstones/' + s.id).length,
    1,
  );
  const bodies = paths.filter((p) => p.includes('/bookResourceBodies/'));
  assert.deepEqual(bodies, [s.bodies.name.path]);
});
test('a v2-only relation segment cannot be injected into a v1 root generation', async () => {
  const f = setup(),
    s = await seedBookLoreRead(f.db, {
      data: {
        name: 'N',
        category: 'other',
        relations: [{ targetEntityId: 't', relationType: 'r' }],
      },
      segmentTransform: (x) => ({
        ...x,
        schemaVersion: 2,
        payload: { ...x.payload, partSealBirth: x.payload.expectedBirth },
      }),
    }),
    v = await f.api.getBookLoreRead(s.uid, scope(s));
  await assert.rejects(() => readGenerationSection(f.api, s, v, 'relations', undefined, 0));
});
