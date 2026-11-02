import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBookRestoreLoreTransform as create,
  advanceBookRestoreLoreTransform as advance,
  BOOK_RESTORE_LORE_FRAGMENT_BYTES,
} from '../src/bookRestoreLoreTransform.mjs';
const native = 'restore-' + 'a'.repeat(64),
  map = async (id) => (id.startsWith('universe:') ? id : native);
async function project(bytes, { size = 65536, mapper = map } = {}) {
  let state = create(),
    offset = 0,
    maximum = 0,
    refs = 0,
    pauses = 0;
  const output = [];
  while (offset < bytes.length) {
    const before = structuredClone(state),
      result = await advance(state, bytes.subarray(offset, offset + size), mapper);
    assert.deepEqual(state, before);
    assert.ok(result.consumed > 0 && result.consumed <= size);
    assert.ok(result.references <= 64);
    assert.ok(result.bytes.length <= BOOK_RESTORE_LORE_FRAGMENT_BYTES);
    output.push(result.bytes);
    refs += result.references;
    if (result.consumed < Math.min(size, bytes.length - offset)) pauses++;
    offset += result.consumed;
    state = JSON.parse(JSON.stringify(result.state));
    const serialized = JSON.stringify(state);
    maximum = Math.max(maximum, Buffer.byteLength(serialized));
    assert.equal(serialized.includes('PRIVATE_PROSE'), false);
  }
  assert.equal(state.parser.mode, 'done');
  assert.equal(state.targets, refs);
  return { bytes: Buffer.concat(output), maximum, refs, pauses, state };
}
const values = [
  {
    description: 'PRIVATE_PROSE \ufeff🌙 "local"\\\n',
    targetEntityId: 'lo"cal🌙',
    relationType: '',
  },
  { targetEntityId: 'universe:world:outside', relationType: 'PRIVATE_PROSE local' },
  { relationType: '', description: '', targetEntityId: 'local' },
];
for (const size of [1, 2, 3, 7, 65536])
  test(
    'target-only projection preserves canonical literal bytes across chunks of ' + size,
    async () => {
      const input = Buffer.from(JSON.stringify(values)),
        result = await project(input, { size }),
        expected = values.map((v) => ({
          ...v,
          targetEntityId: v.targetEntityId.startsWith('universe:') ? v.targetEntityId : native,
        }));
      assert.deepEqual(result.bytes, Buffer.from(JSON.stringify(expected)));
      assert.equal(result.refs, values.length);
      assert.ok(result.maximum < 16384);
    },
  );
test('every split position, including quotes/UTF-8, can resume with no leaked target prefix', async () => {
  const bytes = Buffer.from(JSON.stringify(values)),
    expected = (await project(bytes)).bytes;
  for (let split = 1; split < bytes.length; split++) {
    const first = await advance(create(), bytes.subarray(0, split), map),
      second = await advance(JSON.parse(JSON.stringify(first.state)), bytes.subarray(split), map);
    assert.equal(first.consumed, split);
    assert.equal(second.done, true);
    assert.deepEqual(Buffer.concat([first.bytes, second.bytes]), expected);
  }
});
test('dense arrays stop at 64 targets with exact consumption and no loss or duplicate', async () => {
  const original = Array.from({ length: 2000 }, (_, index) => ({
      targetEntityId: String(index),
      relationType: '',
    })),
    seen = [],
    result = await project(Buffer.from(JSON.stringify(original)), {
      mapper: async (target, index) => {
        seen.push([target, index]);
        return native;
      },
    });
  assert.equal(result.refs, 2000);
  assert.ok(result.pauses > 0);
  assert.deepEqual(
    seen,
    original.map((v, index) => [v.targetEntityId, index]),
  );
  assert.deepEqual(
    JSON.parse(result.bytes),
    original.map((v) => ({ ...v, targetEntityId: native })),
  );
});
test('a description above 8 MiB is copied once in bounded units without prose in checkpoints', async () => {
  const description = 'PRIVATE_PROSE \ufeff🌙 "x"\\\n'.repeat(400000),
    original = [{ description, targetEntityId: 'local', relationType: '' }],
    input = Buffer.from(JSON.stringify(original)),
    result = await project(input);
  assert.ok(input.length > 8 * 1024 * 1024);
  assert.deepEqual(
    result.bytes,
    Buffer.from(JSON.stringify([{ ...original[0], targetEntityId: native }])),
  );
  assert.ok(result.maximum < 16384);
});
test('maximal quoted qualified identity finishing in the next unit respects the 80 KiB output bound', async () => {
  const target = 'universe:' + '"'.repeat(1500) + ':' + '"'.repeat(1500),
    original = [
      { targetEntityId: target, relationType: '' },
      ...Array.from({ length: 64 }, () => ({ targetEntityId: 'x', relationType: '' })),
    ],
    bytes = Buffer.from(JSON.stringify(original)),
    split = bytes.indexOf(Buffer.from('universe:')) + 4000,
    first = await advance(create(), bytes.subarray(0, split), map),
    second = await advance(first.state, bytes.subarray(split), map),
    third = await advance(second.state, bytes.subarray(split + second.consumed), map);
  assert.equal(first.references, 0);
  assert.equal(Buffer.from(first.bytes).includes(Buffer.from('universe:')), false);
  assert.ok(second.bytes.length <= BOOK_RESTORE_LORE_FRAGMENT_BYTES);
  assert.equal(third.done, true);
  assert.deepEqual(
    Buffer.concat([first.bytes, second.bytes, third.bytes]),
    Buffer.from(
      JSON.stringify(original.map((v, i) => ({ ...v, targetEntityId: i ? native : target }))),
    ),
  );
});
test('invalid input, checkpoint, target and mapper output fail before returning projected bytes', async () => {
  for (const bytes of [
    Buffer.from('[{"targetEntityId":"../bad","relationType":""}]'),
    Buffer.from('[{"targetEntityId":"x","targetEntityId":"y","relationType":""}]'),
    Buffer.from('[{"targetEntityId":"x","relationType":null}]'),
    Buffer.alloc(65537),
    [],
  ])
    await assert.rejects(() => advance(create(), bytes, map));
  for (const value of [null, { ...create(), extra: true }, { ...create(), targets: -1 }])
    await assert.rejects(() => advance(value, new Uint8Array(), map));
  const bytes = Buffer.from('[{"targetEntityId":"x","relationType":""}]');
  for (const value of [null, 'arbitrary-replacement', 'restore-' + 'b'.repeat(63)])
    await assert.rejects(() => advance(create(), bytes, async () => value));
});
test('an asynchronous lookup failure leaves the source and checkpoint reusable for a retry', async () => {
  const bytes = Buffer.from(JSON.stringify(values)),
    original = Buffer.from(bytes),
    state = create(),
    before = structuredClone(state),
    failure = Error('lookup unavailable');
  await assert.rejects(
    () =>
      advance(state, bytes, async () => {
        throw failure;
      }),
    (e) => e === failure,
  );
  assert.deepEqual(bytes, original);
  assert.deepEqual(state, before);
  assert.deepEqual(
    (await advance(state, bytes, map)).bytes,
    new Uint8Array((await project(bytes)).bytes),
  );
});
test('caller mutation during async mapping cannot change already captured source bytes or checkpoint', async () => {
  const input = Buffer.from(JSON.stringify(values)),
    expected = (await project(input)).bytes,
    state = create(),
    result = await advance(state, input, async (target) => {
      input.fill(0);
      state.targets = 999;
      state.parser.mode = 'done';
      return map(target);
    });
  assert.deepEqual(Buffer.from(result.bytes), expected);
  assert.equal(result.state.targets, 3);
});
