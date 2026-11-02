import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createAdventureContentHash } from '../src/adventureContentHash.mjs';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
test('independent streams interleave on one engine without sharing prefixes or destroying another digest', async () => {
  const hash = await createAdventureContentHash(),
    first = hash.create(),
    second = hash.create();
  first.update(Buffer.from('PRIVATE_A'));
  second.update(Buffer.from('PRIVATE_B'));
  first.update(Buffer.from('🌙'));
  assert.equal(first.digest(), sha('PRIVATE_A🌙'));
  second.update(Buffer.from('é'));
  assert.equal(second.digest(), sha('PRIVATE_Bé'));
  first.destroy();
  second.destroy();
  const empty = hash.create();
  assert.equal(empty.digest(), sha(''));
  empty.destroy();
});
test('a bounded JSON checkpoint resumes in a new engine across fixed binary parts', async () => {
  const factory = await createAdventureContentHash(),
    body = Buffer.concat([Buffer.alloc(65535, 97), Buffer.from('🌙'), Buffer.alloc(65533, 98)]);
  const first = factory.create();
  first.update(body.subarray(0, 65536));
  const saved = JSON.parse(JSON.stringify(first.save()));
  assert.ok(JSON.stringify(saved).length < 4096);
  first.destroy();
  const nextFactory = await createAdventureContentHash(),
    resumed = nextFactory.create(saved);
  resumed.update(body.subarray(65536));
  assert.equal(resumed.digest(), sha(body));
  resumed.destroy();
});
test('unknown/corrupt states and continuations after completion fail rather than create an empty hash', async () => {
  const hash = await createAdventureContentHash(),
    one = hash.create(),
    saved = one.save();
  one.destroy();
  for (const value of [
    { ...saved, algorithm: 'other' },
    { ...saved, state: '!bad' },
    { ...saved, extra: true },
    { ...saved, state: '' },
    { ...saved, state: Buffer.alloc(Buffer.from(saved.state, 'base64').length).toString('base64') },
  ])
    assert.throws(() => hash.create(value));
  assert.throws(() => one.update(Buffer.from('late')));
  assert.throws(() => one.save());
});
