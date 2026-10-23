import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  prepareBookResourcePayload,
  verifyBookResourcePayloadPart,
} from '../src/bookResourcePayload.mjs';
import {
  resourcePayloadManifest,
  resourcePayloadScope,
} from '../src/bookResourcePayloadContracts.mjs';
import {
  openBookResourcePayload,
  readBookResourcePayload,
  readBookResourcePayloadPart,
  validateBookResourcePayloadSnapshot,
} from '../src/bookResourcePayloadRead.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { payloadInput, seedResourcePayload } from './helpers/bookResourcePayloadFixture.mjs';
import { chunkId } from '../src/bookRestoreUploadContracts.mjs';
const sha = (data) => createHash('sha256').update(data).digest('hex');
const f = () => adventureImportDb({ nativeUpdates: true });
const read = (db, opening) =>
  db.runTransaction(async (tx) => readBookResourcePayload(tx, db, opening));
for (const length of [0, 65536 - 14, 65536, 2 * 65536, 4 * 65536, 8 * 65536])
  test('literal JSON and independently verifiable pages at data length ' + length, async () => {
    const input = payloadInput({
        text: 'x'.repeat(length),
        missingIsAbsent: null,
        empty: [],
        ordered: ['b', 'a'],
        unicode: '\ufeff🌙\r\n\\"\ud800',
      }),
      fixture = f(),
      seeded = await seedResourcePayload(fixture.db, input),
      pages = [];
    for (let index = 0; index < seeded.prepared.manifest.chunkCount; index++) {
      const part = seeded.prepared.part(index);
      pages.push(
        verifyBookResourcePayloadPart(seeded.prepared.manifest, {
          index,
          bytes: part.bytes,
          proof: part.proof,
        }),
      );
    }
    assert.equal(sha(Buffer.concat(pages)), sha(JSON.stringify(input.value)));
    assert.equal(
      JSON.stringify(await read(fixture.db, seeded.opening)),
      JSON.stringify(input.value),
    );
    assert.equal(Object.hasOwn(await read(fixture.db, seeded.opening), 'absent'), false);
  });
test('a synthetic internal payload beyond 8 MiB and 128 pages remains readable with a constant header', async () => {
  const fixture = f(),
    input = payloadInput({ name: 'x'.repeat(9 * 1024 * 1024), aliases: [], relations: [] }),
    seeded = await seedResourcePayload(fixture.db, input);
  assert.ok(seeded.prepared.manifest.chunkCount > 128);
  assert.ok(Buffer.byteLength(JSON.stringify(seeded.prepared.header)) < 1000);
  const value = await read(fixture.db, seeded.opening);
  assert.equal(sha(value.name), sha(input.value.name));
  assert.equal(value.name.length, input.value.name.length);
});
test('one random page reads only the header and that part, no catalogue or complete object', async () => {
  const fixture = f(),
    seeded = await seedResourcePayload(fixture.db, payloadInput({ text: '😀'.repeat(200000) }));
  const reads = [];
  await fixture.db.runTransaction(async (tx) => {
    const observed = {
      get(ref) {
        reads.push(ref.path);
        return tx.get(ref);
      },
    };
    const opened = await openBookResourcePayload(observed, fixture.db, seeded.opening);
    const part = await readBookResourcePayloadPart(observed, fixture.db, opened, 7);
    assert.equal(part.length, 65536);
  });
  assert.deepEqual(reads, [seeded.path, seeded.path + '/chunks/' + chunkId(7)]);
});
test('partial outputs and input mutations cannot change an already prepared generation', () => {
  const input = payloadInput({ text: 'x'.repeat(180000) }),
    prepared = prepareBookResourcePayload(input),
    part = prepared.part(0),
    expected = sha(part.bytes);
  input.value.text = 'changed';
  part.bytes.fill(0);
  part.proof[0] = '0'.repeat(64);
  assert.equal(sha(prepared.part(0).bytes), expected);
  assert.ok(Object.isFrozen(prepared.manifest));
  assert.ok(Object.isFrozen(prepared.header.resource));
});
test('generation separates book, owner, resource, operation and content while a retry is deterministic', () => {
  const input = payloadInput(),
    first = prepareBookResourcePayload(input);
  assert.equal(first.manifest.bodyId, prepareBookResourcePayload(input).manifest.bodyId);
  for (const patch of [
    { uid: 'other' },
    { bookId: 'other' },
    { resource: { ...input.resource, id: 'other' } },
    { operationId: 'resource-payload-op02' },
    { value: { ...input.value, name: 'changed' } },
  ])
    assert.notEqual(
      first.manifest.bodyId,
      prepareBookResourcePayload({ ...input, ...patch }).manifest.bodyId,
    );
});
test('closed manifests, scoped resources and safe page indices reject before part reads', async () => {
  const fixture = f(),
    seeded = await seedResourcePayload(fixture.db);
  const manifest = seeded.prepared.manifest;
  for (const bad of [
    { ...manifest, extra: true },
    { ...manifest, schemaVersion: 2 },
    { ...manifest, chunkCount: 2 },
    { ...manifest, byteLength: 0 },
    { ...manifest, byteLength: Number.MAX_SAFE_INTEGER + 1 },
    { ...manifest, merkleRoot: 'wrong' },
    { ...manifest, bodyId: 'wrong' },
  ])
    assert.throws(() => resourcePayloadManifest(bad));
  for (const resource of [
    { ...seeded.opening.resource, extra: true },
    { ...seeded.opening.resource, kind: 'unknown' },
    { ...seeded.opening.resource, parentId: 'unexpected' },
    { kind: 'scene-body', id: 'current', parentId: null },
    { kind: 'book', id: 'other', parentId: null },
  ])
    assert.throws(() => resourcePayloadScope({ ...seeded.opening, resource }));
  await fixture.db.runTransaction(async (tx) => {
    const opened = await openBookResourcePayload(tx, fixture.db, seeded.opening),
      before = fixture.reads.length;
    for (const index of [-1, 1, 1.5, NaN, Number.MAX_SAFE_INTEGER])
      await assert.rejects(() => readBookResourcePayloadPart(tx, fixture.db, opened, index));
    assert.equal(fixture.reads.length, before);
  });
});
test('all schema child scopes require their parent and preserve it in the header', () => {
  for (const kind of ['scene-body', 'scene-planning', 'scene-reference', 'milestone']) {
    const input = { ...payloadInput(), resource: { kind, parentId: 'parent', id: 'current' } };
    assert.equal(prepareBookResourcePayload(input).header.resource.parentId, 'parent');
  }
});
test('non-JSON values, sparse arrays, prototypes, accessors and hidden toJSON are refused without executing code', () => {
  let calls = 0;
  const getter = {};
  Object.defineProperty(getter, 'text', {
    enumerable: true,
    get() {
      calls++;
      return 'bad';
    },
  });
  const array = ['x'];
  Object.defineProperty(array, 'toJSON', {
    value() {
      calls++;
      return ['bad'];
    },
  });
  const sparse = new Array(2),
    cyclic = {};
  cyclic.self = cyclic;
  const inherited = ['x'];
  Object.setPrototypeOf(inherited, {
    toJSON() {
      calls++;
      return ['bad'];
    },
  });
  const symbol = { [Symbol('hidden')]: 'bad' };
  for (const value of [
    undefined,
    NaN,
    Infinity,
    1n,
    new Date(),
    Object.create(null),
    { x: undefined },
    sparse,
    cyclic,
    getter,
    array,
    inherited,
    symbol,
  ])
    assert.throws(() => prepareBookResourcePayload({ ...payloadInput(), value }));
  assert.equal(calls, 0);
});
for (const change of [
  'bytes',
  'index',
  'proof',
  'extra-proof',
  'missing-proof',
  'length',
  'other-generation',
])
  test('Merkle page refuses ' + change, () => {
    const a = prepareBookResourcePayload(payloadInput({ text: 'a'.repeat(190000) })),
      b = prepareBookResourcePayload(payloadInput({ text: 'b'.repeat(190000) })),
      part = a.part(0),
      value = { index: part.index, bytes: part.bytes, proof: part.proof };
    if (change === 'bytes') value.bytes[3] ^= 1;
    if (change === 'index') value.index = 1;
    if (change === 'proof') value.proof[0] = '0'.repeat(64);
    if (change === 'extra-proof') value.proof.push('0'.repeat(64));
    if (change === 'missing-proof') value.proof.pop();
    if (change === 'length') value.bytes = value.bytes.subarray(1);
    if (change === 'other-generation') value.proof = b.part(0).proof;
    assert.throws(() => verifyBookResourcePayloadPart(a.manifest, value));
  });
for (const change of [
  'owner',
  'book',
  'resource',
  'missing-header',
  'header-recreated',
  'part-recreated',
  'part-updated',
  'header-updated',
  'missing-part',
  'part-scope',
  'missing-birth',
])
  test('native reader refuses ' + change, async () => {
    const fixture = f(),
      seeded = await seedResourcePayload(fixture.db, payloadInput({ text: 'x'.repeat(180000) })),
      opening = structuredClone(seeded.opening),
      partPath = seeded.path + '/chunks/' + chunkId(0);
    if (change === 'owner') opening.uid = 'other';
    if (change === 'book') opening.bookId = 'other';
    if (change === 'resource') opening.resource.id = 'other';
    if (change === 'missing-birth') delete opening.expectedBirth;
    if (change === 'missing-header')
      await fixture.db.runTransaction(async (tx) => {
        tx.delete(fixture.db.doc(seeded.path));
      });
    if (change === 'header-recreated' || change === 'part-recreated') {
      const path = change === 'header-recreated' ? seeded.path : partPath,
        value = structuredClone(fixture.records.get(path));
      await fixture.db.runTransaction(async (tx) => {
        tx.delete(fixture.db.doc(path));
      });
      await fixture.db.runTransaction(async (tx) => {
        tx.create(fixture.db.doc(path), value);
      });
    }
    if (change === 'header-updated') {
      await fixture.db.runTransaction(async (tx) => {
        tx.update(fixture.db.doc(seeded.path), { createdAt: 1001 });
      });
      await fixture.db.runTransaction(async (tx) => {
        tx.update(fixture.db.doc(seeded.path), { createdAt: 1000 });
      });
    }
    if (change === 'part-updated') {
      await fixture.db.runTransaction(async (tx) => {
        tx.update(fixture.db.doc(partPath), { index: 1 });
      });
      await fixture.db.runTransaction(async (tx) => {
        tx.update(fixture.db.doc(partPath), { index: 0 });
      });
    }
    if (change === 'part-scope') fixture.records.get(partPath).ownerId = 'other';
    if (change === 'missing-part')
      await fixture.db.runTransaction(async (tx) => {
        tx.delete(fixture.db.doc(partPath));
      });
    await assert.rejects(() => read(fixture.db, opening));
  });
test('pure native validation refuses snapshots from another document before bytes are used', async () => {
  const fixture = f(),
    seeded = await seedResourcePayload(fixture.db);
  await fixture.db.runTransaction(async (tx) => {
    const opened = await openBookResourcePayload(tx, fixture.db, seeded.opening),
      source = await tx.get(fixture.db.doc(seeded.path + '/chunks/' + chunkId(0)));
    assert.throws(() =>
      validateBookResourcePayloadSnapshot(opened, 0, {
        ...source,
        ref: { path: seeded.path + '/chunks/foreign' },
      }),
    );
  });
});
test('complete reader additionally checks the integral SHA beyond per-page proofs', async () => {
  const fixture = f(),
    seeded = await seedResourcePayload(fixture.db),
    value = fixture.records.get(seeded.path);
  value.contentHash = '0'.repeat(64);
  await assert.rejects(() =>
    read(fixture.db, {
      ...seeded.opening,
      manifest: { ...seeded.opening.manifest, contentHash: value.contentHash },
    }),
  );
});

test('single-leaf wire format has a fixed independent SHA-256 vector', () => {
  const p = prepareBookResourcePayload(payloadInput({}));
  assert.equal(
    p.manifest.merkleRoot,
    '16927ea2c382b3116b9f8e2aa76fbe2909e28b8c25ed2bf085a6bc1057bec9e3',
  );
  assert.equal(p.manifest.contentHash, sha('{}'));
  assert.deepEqual(p.part(0).proof, []);
  assert.equal(p.part(0).bytes.toString('utf8'), '{}');
});
for (const [name, bytes] of [
  ['invalid UTF-8', Buffer.from([255])],
  ['JSON with leading BOM', Buffer.from('\ufeff{}')],
  ['noncanonical JSON', Buffer.from('{} ')],
  ['invalid JSON', Buffer.from('{')],
])
  test('complete reader refuses authenticated ' + name, async () => {
    const fixture = f(),
      input = payloadInput(),
      prepared = prepareBookResourcePayload(input),
      prefix = Buffer.alloc(17);
    prefix.writeBigUInt64BE(BigInt(bytes.length), 9);
    const manifest = {
        ...prepared.manifest,
        byteLength: bytes.length,
        chunkCount: 1,
        contentHash: sha(bytes),
        merkleRoot: sha(Buffer.concat([prefix, bytes])),
      },
      path = 'books/' + input.bookId + '/bookResourceBodies/' + manifest.bodyId,
      part = { ...prepared.part(0), bytes, proof: [] };
    await fixture.db.runTransaction(async (tx) => {
      tx.create(fixture.db.doc(path + '/chunks/' + chunkId(0)), part);
    });
    await fixture.db.runTransaction(async (tx) => {
      tx.create(fixture.db.doc(path), { ...prepared.header, ...manifest });
    });
    const snapshot = await fixture.db.runTransaction(async (tx) => tx.get(fixture.db.doc(path)));
    await assert.rejects(() =>
      read(fixture.db, {
        uid: input.uid,
        bookId: input.bookId,
        resource: input.resource,
        manifest,
        expectedBirth: {
          seconds: snapshot.createTime.seconds,
          nanoseconds: snapshot.createTime.nanoseconds,
        },
      }),
    );
  });
test('pointer birth is closed, mandatory and exact to the nanosecond', async () => {
  const fixture = f(),
    seeded = await seedResourcePayload(fixture.db);
  for (const expectedBirth of [
    undefined,
    { ...seeded.opening.expectedBirth, extra: true },
    { ...seeded.opening.expectedBirth, nanoseconds: seeded.opening.expectedBirth.nanoseconds + 1 },
    { seconds: -1, nanoseconds: 0 },
    { seconds: 1, nanoseconds: 1e9 },
  ])
    await assert.rejects(() => read(fixture.db, { ...seeded.opening, expectedBirth }));
});
test('resource singletons cannot be opened under an arbitrary child identifier', () => {
  for (const kind of ['scene-control', 'scene-body', 'scene-planning']) {
    const resource = { kind, id: 'other', parentId: kind === 'scene-control' ? null : 'parent' };
    assert.throws(() => resourcePayloadScope({ ...payloadInput(), resource }));
  }
});

test('an opening cannot be reused across transactions or reconstructed as a DTO', async () => {
  const fixture = f(),
    seeded = await seedResourcePayload(fixture.db);
  const opened = await fixture.db.runTransaction(async (tx) =>
    openBookResourcePayload(tx, fixture.db, seeded.opening),
  );
  await fixture.db.runTransaction(async (tx) => {
    const reads = [],
      observed = {
        get(ref) {
          reads.push(ref.path);
          return tx.get(ref);
        },
      };
    await assert.rejects(() => readBookResourcePayloadPart(observed, fixture.db, opened, 0));
    await assert.rejects(() => readBookResourcePayloadPart(observed, fixture.db, { ...opened }, 0));
    assert.equal(reads.length, 0);
  });
});
