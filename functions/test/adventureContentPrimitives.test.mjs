import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeAdventureContentJSON as decode,
  advanceAdventureUtf8 as advance,
  createAdventureUtf8State as initial,
  AdventureContentError,
  contentId,
  contentClosed,
} from '../src/adventureContentPrimitives.mjs';
test('portable JSON keeps literal author text while rejecting alternate/unsafe encodings', () => {
  const value = { text: 'PRIVATE_TEXT 🌙\ufeff\u0000', nested: { value: 1 } };
  assert.deepEqual(decode(Buffer.from(JSON.stringify(value))), value);
  for (const text of [
    ' { "value":1 }',
    '{"value":1e400}',
    '{"__proto__":{"secret":true}}',
    '{"text":"\\ud800"}',
    '\ufeff{"value":1}',
  ])
    assert.throws(() => decode(Buffer.from(text)), AdventureContentError);
  assert.throws(() => decode(Buffer.alloc(8 * 1024 * 1024 + 1)), AdventureContentError);
});
test('fixed byte parts survive every Unicode boundary and a JSON checkpoint between parts', () => {
  const bytes = Buffer.from('PRIVATE\ufeffé🌙𐍈\u0000END');
  for (let split = 0; split <= bytes.length; split++) {
    const state = advance(Object.freeze(initial()), bytes.subarray(0, split));
    const checkpoint = JSON.parse(JSON.stringify(state));
    assert.deepEqual(advance(checkpoint, bytes.subarray(split), true), initial());
    assert.deepEqual(state, checkpoint);
  }
});
test('a final incomplete sequence, surrogate, overlong or out-of-range code point is refused', () => {
  for (const bytes of [
    [128],
    [192, 175],
    [237, 160, 128],
    [244, 144, 128, 128],
    [224, 159, 191],
    [240, 143, 191, 191],
    [255],
    [240],
  ])
    assert.throws(() => advance(initial(), Uint8Array.from(bytes), true), AdventureContentError);
  assert.deepEqual(advance(initial(), Uint8Array.from([244, 143, 191, 191]), true), initial());
  const pending = advance(initial(), Uint8Array.from([240, 159]));
  assert.equal(pending.needed, 2);
  assert.throws(() => advance(pending, new Uint8Array(), true), AdventureContentError);
});
test('UTF-8 checkpoints are closed and cannot silently relax continuation constraints', () => {
  for (const state of [
    { ...initial(), extra: true },
    { needed: 1, minimum: 0, maximum: 255 },
    { needed: 0, minimum: 144, maximum: 191 },
    { needed: 4, minimum: 128, maximum: 191 },
  ])
    assert.throws(() => advance(state, new Uint8Array()), AdventureContentError);
});
test('portable identities and closed fields do not accept path traversal or hidden provenance', () => {
  assert.equal(contentId('private-🌙'), true);
  for (const id of ['../id', 'a\\b', '.', String.fromCharCode(0), '\ud800'])
    assert.equal(contentId(id), false);
  assert.equal(contentClosed({ id: 'a' }, ['id'], ['title']), true);
  assert.equal(contentClosed({ id: 'a', sourceToken: 'secret' }, ['id'], ['title']), false);
});
