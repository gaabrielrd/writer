import test from 'node:test';
import assert from 'node:assert/strict';
import { editorChatFixture, uid, hash, reason } from './helpers/editorChatFixture.mjs';

test('observe is read-only and cancel installs a durable original-fingerprint fence', async () => {
  const f = await editorChatFixture();
  const request = {
    action: 'resolveOperation',
    operationId: f.prepare.operationId,
    operationAction: 'prepareContext',
    requestHash: f.prepare.requestHash,
    intent: 'observe',
  };
  const size = f.records.size;
  assert.deepEqual(await f.call(request), { state: 'unknown', receipt: null });
  assert.equal(f.records.size, size);
  const canceled = await f.call({ ...request, intent: 'cancel' });
  assert.equal(canceled.receipt.outcome, 'canceled');
  assert.deepEqual(await f.call(f.prepare), { receipt: canceled.receipt, current: null });
  assert.equal(
    [...f.records.keys()].some((p) => p.includes('editorChatContextBodies')),
    false,
  );
  await assert.rejects(
    f.call({ ...request, requestHash: hash('0') }),
    reason('operation-conflict'),
  );
  const persisted = f.records.get(`users/${uid}/editorChatOperations/${request.operationId}`);
  assert.equal(JSON.stringify(persisted).includes('Aria'), false);
});

test('historical prepare receipt survives source removal and corrupt receipts never leak', async () => {
  const f = await editorChatFixture();
  const first = await f.call(f.prepare);
  f.records.delete(f.path);
  f.events.length = 0;
  assert.deepEqual(await f.call(f.prepare), { receipt: first.receipt, current: null });
  assert.equal(f.events.filter((e) => e.method === 'get').length, 1);
  const stored = f.records.get(`users/${uid}/editorChatOperations/${f.prepare.operationId}`);
  stored.receipt.secret = 'private prose';
  await assert.rejects(f.call(f.prepare), reason('inconsistent'));
});

test('authentication, unknown actions and fingerprints fail before writes', async () => {
  const f = await editorChatFixture(),
    size = f.records.size;
  await assert.rejects(f.call(f.prepare, ''), reason('auth-required'));
  await assert.rejects(f.call({ ...f.prepare, requestHash: hash('0') }), reason('invalid-request'));
  await assert.rejects(f.call({ ...f.prepare, action: 'send' }), reason('invalid-request'));
  assert.equal(f.records.size, size);
});
