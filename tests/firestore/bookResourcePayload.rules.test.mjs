import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  seedResourcePayload,
  payloadInput,
} from '../../functions/test/helpers/bookResourcePayloadFixture.mjs';
import {
  openBookResourcePayload,
  readBookResourcePayload,
  readBookResourcePayloadPart,
} from '../../functions/src/bookResourcePayloadRead.mjs';
import { chunkId } from '../../functions/src/bookRestoreUploadContracts.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-resource-payload';
const sha = (value) => createHash('sha256').update(value).digest('hex');
let admin;
before(() => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(host ?? ''))
    throw new Error('Dedicated loopback emulator required.');
  admin = new Firestore({ projectId, host, ssl: false, universeDomain: 'googleapis.com' });
});
beforeEach(async () => {
  await admin.recursiveDelete(admin.collection('books'));
});
after(async () => {
  await admin?.terminate();
});
test('SDK seals a payload beyond 8 MiB and 128 parts, reads one page independently and restores its exact logical JSON', async (t) => {
  const input = payloadInput({
      name: 'literal 🌙',
      aliases: ['', 'same', 'same'],
      category: 'other',
      details: '\ufeff' + '🌙'.repeat(2300000),
      relations: [],
      empty: '',
      missing: null,
    }),
    seeded = await seedResourcePayload(admin, input);
  assert.ok(seeded.prepared.manifest.chunkCount > 128);
  const rawHeader = await admin.doc(seeded.path).get();
  assert.ok(rawHeader.createTime.isEqual(rawHeader.updateTime));
  const calls = [];
  const page = await admin.runTransaction(async (tx) => {
    const observed = {
        get(ref) {
          calls.push(ref.path);
          return tx.get(ref);
        },
      },
      opened = await openBookResourcePayload(observed, admin, seeded.opening);
    return readBookResourcePayloadPart(observed, admin, opened, 83);
  });
  assert.equal(page.length, 65536);
  assert.deepEqual(calls, [seeded.path, seeded.path + '/chunks/' + chunkId(83)]);
  const value = await admin.runTransaction(async (tx) =>
    readBookResourcePayload(tx, admin, seeded.opening),
  );
  assert.equal(sha(JSON.stringify(value)), sha(JSON.stringify(input.value)));
  assert.equal(value.details.length, input.value.details.length);
  assert.deepEqual(value.aliases, input.value.aliases);
  assert.equal(Object.hasOwn(value, 'absent'), false);
  assert.ok(Buffer.byteLength(JSON.stringify(rawHeader.data())) < 1000);
  t.diagnostic(
    seeded.prepared.manifest.chunkCount + ' native parts; random page = exactly 2 document reads',
  );
});
test('SDK rejects identical part/header recreations and value ABA through native identity, preserving foreign generations', async () => {
  const input = payloadInput({ text: 'x'.repeat(200000) }),
    seeded = await seedResourcePayload(admin, input),
    ref = admin.doc(seeded.path + '/chunks/' + chunkId(0)),
    original = await ref.get();
  await ref.delete();
  await ref.create(original.data());
  const recreated = await ref.get();
  assert.equal(original.createTime.isEqual(recreated.createTime), false);
  await assert.rejects(() =>
    admin.runTransaction(async (tx) => readBookResourcePayload(tx, admin, seeded.opening)),
  );
  assert.equal((await ref.get()).createTime.isEqual(recreated.createTime), true);
  const next = await seedResourcePayload(admin, { ...input, operationId: 'resource-payload-op02' }),
    body = admin.doc(next.path),
    previous = await body.get();
  await body.delete();
  await body.create(previous.data());
  await assert.rejects(() =>
    admin.runTransaction(async (tx) => openBookResourcePayload(tx, admin, next.opening)),
  );
  const third = await seedResourcePayload(admin, {
      ...input,
      operationId: 'resource-payload-op03',
    }),
    thirdBody = admin.doc(third.path);
  const thirdBirth = await thirdBody.get();
  await thirdBody.update({ createdAt: 1001 });
  await thirdBody.update({ createdAt: 1000 });
  assert.equal((await thirdBody.get()).updateTime.isEqual(thirdBirth.updateTime), false);
  await assert.rejects(() =>
    admin.runTransaction(async (tx) => openBookResourcePayload(tx, admin, third.opening)),
  );
  assert.equal((await ref.get()).createTime.isEqual(recreated.createTime), true);
});
