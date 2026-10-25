import test from 'node:test';
import assert from 'node:assert/strict';
import { streamBodyFixture } from './helpers/bookRestoreStreamBodyFixture.mjs';
import { prepareBookResourcePayload } from '../src/bookResourcePayload.mjs';
import {
  openBookResourcePayload,
  readBookResourcePayloadPart,
} from '../src/bookResourcePayloadRead.mjs';
import { digest } from '../src/sceneContracts.mjs';
import { bornEqual, chunkId } from '../src/bookRestoreUploadContracts.mjs';
import { cleanupLegacyRestore } from './helpers/bookLegacyRestoreFixture.mjs';
for (const chunks of [1, 2, 3, 5, 6, 9])
  test(
    'incremental native body matches the existing codec at ' +
      chunks +
      ' chunks, including odd tree padding',
    async () => {
      const value = 'x'.repeat(chunks * 65536 - 2),
        f = await streamBodyFixture(value),
        result = await f.finish((r) => {
          assert.ok(r.writes.length <= 4);
          assert.equal(JSON.stringify(r.progress).includes('x'.repeat(200)), false);
        }),
        expected = prepareBookResourcePayload({
          uid: f.uid,
          bookId: f.view.bookId,
          resource: { kind: 'lore', parentId: null, id: f.input.entityId },
          operationId: digest([
            'restore-lore-stream',
            f.input.generationOperationId,
            f.input.target,
          ]),
          timestamp: f.input.timestamp,
          value,
        });
      assert.deepEqual(result.pointer.manifest, expected.manifest);
      assert.equal(f.records.has('books/' + f.view.bookId), false);
      for (let index = 0; index < chunks; index++)
        await f.db.runTransaction(async (tx) => {
          const opening = await openBookResourcePayload(tx, f.db, {
              uid: f.uid,
              bookId: f.view.bookId,
              resource: { kind: 'lore', parentId: null, id: f.input.entityId },
              ...result.pointer,
            }),
            bytes = await readBookResourcePayloadPart(tx, f.db, opening, index);
          assert.deepEqual(Buffer.from(bytes), expected.part(index).bytes);
          const snapshot = await tx.get(
            f.db.doc(
              'books/' +
                f.view.bookId +
                '/bookResourceChunks/' +
                expected.manifest.bodyId +
                ':' +
                chunkId(index),
            ),
          );
          assert.equal(bornEqual(snapshot, { createTime: snapshot.updateTime }), true);
          assert.deepEqual(snapshot.data().proof, expected.part(index).proof);
        });
    },
  );
test('a body above 8 MiB and 128 parts is materialized with bounded checkpoints, fragments and native parts', async () => {
  const value = '\ufeff' + 'PRIVATE_STREAM_BODY🌙'.repeat(450000),
    f = await streamBodyFixture(value);
  let maximum = 0,
    stages = 0;
  const result = await f.finish((r) => {
    maximum = Math.max(maximum, Buffer.byteLength(JSON.stringify(r.progress)));
    assert.ok(r.writes.length <= 4);
    for (const write of r.writes)
      if (write.kind === 'payload-chunk') {
        const bytes = write.value.bytes;
        assert.ok(bytes.length <= (write.value.stageKind?.endsWith('/fragment') ? 81920 : 65536));
      }
    if (r.progress.phase === 'stage') stages++;
  });
  assert.ok(result.pointer.manifest.chunkCount > 128 && stages > 128);
  assert.ok(maximum <= 24576);
  const expected = prepareBookResourcePayload({
    uid: f.uid,
    bookId: f.view.bookId,
    resource: { kind: 'lore', parentId: null, id: f.input.entityId },
    operationId: digest(['restore-lore-stream', f.input.generationOperationId, f.input.target]),
    timestamp: f.input.timestamp,
    value,
  });
  assert.deepEqual(result.pointer.manifest, expected.manifest);
  assert.equal(f.records.has('books/' + f.view.bookId), false);
});
for (const phase of ['stage', 'pack', 'tree', 'emit', 'verify', 'header', 'pointer', 'done'])
  test('cancel and real cleanup remove every inventoried body stage at ' + phase, async () => {
    const f = await streamBodyFixture('x'.repeat(140000));
    for (let i = 0; i < 1000; i++) {
      const r = await f.step();
      if (r.progress.phase === phase) break;
      assert.ok(i < 999);
    }
    const progress = await cleanupLegacyRestore(f.factory(), f.uid, f.id, f.view, {
      limit: 2,
      prefix: f.id + '-cleanup-',
    });
    assert.equal(progress.state, 'cancelled');
    assert.equal(
      [...f.records.keys()].some((p) => p.startsWith('books/' + f.view.bookId + '/')),
      false,
    );
    assert.equal(
      [...f.records.keys()].some((p) => p.startsWith(f.path + '/materializationArtifacts/')),
      false,
    );
  });

test('relation fragments with remap growth pack through journalled partial chunks and produce immutable final parts', async () => {
  const value = Array.from({ length: 64 }, (_, i) => ({
      targetEntityId: 'entity',
      relationType: '',
      ...(i === 63 ? { description: '\ufeff' + 'literal 🌙'.repeat(30000) } : {}),
    })),
    f = await streamBodyFixture(value, { field: 'relations' }),
    result = await f.finish(),
    expected = prepareBookResourcePayload({
      uid: f.uid,
      bookId: f.view.bookId,
      resource: { kind: 'lore', parentId: null, id: f.input.entityId },
      operationId: digest(['restore-lore-stream', f.input.generationOperationId, f.input.target]),
      timestamp: f.input.timestamp,
      value: value.map((v) => ({ ...v, targetEntityId: f.input.entityId })),
    }),
    packed = [...f.records].filter(([, v]) => v.stageKind?.endsWith('/packed'));
  assert.deepEqual(result.pointer.manifest, expected.manifest);
  assert.ok(
    packed.some(
      ([path]) =>
        f.metadata.get(path).createdAtNanoseconds !== f.metadata.get(path).updatedAtNanoseconds,
    ),
  );
  for (let i = 0; i < expected.manifest.chunkCount; i++) {
    const native = f.records.get(
      'books/' +
        f.view.bookId +
        '/bookResourceChunks/' +
        expected.manifest.bodyId +
        ':' +
        chunkId(i),
    );
    assert.deepEqual(Buffer.from(native.bytes), expected.part(i).bytes);
    assert.deepEqual(native.proof, expected.part(i).proof);
  }
});
test('unit bytes and cursor are captured before the first asynchronous native read', async () => {
  const value = '\ufeff' + 'literal 🌙'.repeat(20000),
    f = await streamBodyFixture(value),
    first = await f.step({
      duringPrepare(unit) {
        unit.bytes.fill(0);
        unit.cursor.inputOffset = 0;
        unit.cursor.contextToken = 'b'.repeat(64);
      },
    });
  assert.ok(first.progress.cursor.inputOffset > 0);
  const result = await f.finish(),
    expected = prepareBookResourcePayload({
      uid: f.uid,
      bookId: f.view.bookId,
      resource: { kind: 'lore', parentId: null, id: f.input.entityId },
      operationId: digest(['restore-lore-stream', f.input.generationOperationId, f.input.target]),
      timestamp: f.input.timestamp,
      value,
    });
  assert.deepEqual(result.pointer.manifest, expected.manifest);
});
test('changed fragment bytes cannot pass the packing SHA barrier or create a final header', async () => {
  const f = await streamBodyFixture('literal value');
  await f.step({
    mutate(unit) {
      unit.bytes[0] ^= 1;
    },
  });
  await assert.rejects(() => f.finish());
  assert.equal((await f.state()).phase, 'pack');
  assert.equal(
    [...f.records.values()].some((v) => v.merkleRoot && v.resource?.id === f.input.entityId),
    false,
  );
  const cleaned = await cleanupLegacyRestore(f.factory(), f.uid, f.id, f.view, {
    prefix: f.id + '-corrupt-cleanup-',
  });
  assert.equal(cleaned.state, 'cancelled');
});
for (const mode of ['control', 'fragment', 'packed', 'node', 'part', 'header', 'receipt'])
  test(
    'recreated ' + mode + ' is rejected and never deleted as an owned original artifact',
    async () => {
      const f = await streamBodyFixture('x'.repeat(180000)),
        phase = {
          control: 'stage',
          fragment: 'pack',
          packed: 'tree',
          node: 'tree',
          part: 'verify',
          header: 'pointer',
          receipt: 'stage',
        }[mode];
      let last;
      for (let i = 0; i < 1000; i++) {
        last = await f.step();
        if (last.progress.phase === phase) break;
        assert.ok(i < 999);
      }
      const entries = [...f.records].filter(([path]) =>
          path.startsWith('books/' + f.view.bookId + '/'),
        ),
        entry = entries.find(([, v]) =>
          mode === 'part'
            ? v.bodyId === last.progress.manifest.bodyId && v.index === 0
            : mode === 'header'
              ? v.bodyId === last.progress.manifest.bodyId && v.chunkCount
              : mode === 'node'
                ? v.stageKind?.endsWith('/node') && v.level === 0 && v.index === 0
                : v.stageKind?.endsWith('/' + (mode === 'receipt' ? 'control' : mode)) &&
                  ((mode !== 'fragment' && mode !== 'packed') || v.index === 0),
        );
      assert.ok(entry, mode);
      let path = entry[0];
      if (mode === 'receipt') {
        const journal = [...f.records.values()].find(
          (v) => v.kind === 'payload-body' && v.id === path.split('/').at(-1),
        );
        path = 'users/' + f.uid + '/bookRestoreOperations/' + journal.createdByOperationId;
      }
      const value = structuredClone(f.records.get(path));
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
      await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
      await assert.rejects(() => f.finish());
      assert.equal(f.records.has('books/' + f.view.bookId), false);
      await assert.rejects(() =>
        cleanupLegacyRestore(f.factory(), f.uid, f.id, f.view, { prefix: f.id + '-aba-cleanup-' }),
      );
      assert.deepEqual(f.records.get(path), value);
    },
  );

test('zero-output target fragments do not issue unchanged partial writes or lose their native progress', async () => {
  const value = [{ targetEntityId: 'entity', relationType: '' }],
    f = await streamBodyFixture(value, { field: 'relations', fragmentLimit: 1 });
  let zero = 0;
  const result = await f.finish((r) => {
      for (const write of r.writes)
        if (write.value.stageKind?.endsWith('/fragment') && write.value.bytes.length === 0) zero++;
    }),
    expected = prepareBookResourcePayload({
      uid: f.uid,
      bookId: f.view.bookId,
      resource: { kind: 'lore', parentId: null, id: f.input.entityId },
      operationId: digest(['restore-lore-stream', f.input.generationOperationId, f.input.target]),
      timestamp: f.input.timestamp,
      value: [{ ...value[0], targetEntityId: f.input.entityId }],
    });
  assert.ok(zero > 0);
  assert.deepEqual(result.pointer.manifest, expected.manifest);
});
