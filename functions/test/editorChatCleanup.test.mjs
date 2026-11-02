import test from 'node:test';
import assert from 'node:assert/strict';
import { editorChatFixture, uid, reason } from './helpers/editorChatFixture.mjs';

test('context cleanup works after source removal, stays bounded and strips own titles at terminal', async () => {
  const f = await editorChatFixture(),
    prepared = (await f.call(f.prepare)).current;
  const ready = (await f.advance(prepared)).current;
  f.records.delete(f.path);
  f.events.length = 0;
  const deletion = await f.mutate({
    action: 'deleteContext',
    ...f.scope,
    contextId: ready.contextId,
    contextToken: ready.contextToken,
    operationId: 'delete',
  });
  assert.equal(deletion.current.phase, 'context-body');
  const request = {
    action: 'advanceCleanup',
    cleanupId: deletion.current.cleanupId,
    cleanupToken: deletion.current.cleanupToken,
    expectedRevision: deletion.current.revision,
    operationId: 'clean',
  };
  f.events.length = 0;
  const deleted = await f.mutate(request);
  assert.equal(deleted.current.state, 'deleted');
  assert.equal(deleted.current.deletedDocuments, 1);
  assert.equal(
    f.events.some((e) => e.path?.includes('editorChatContextBodies') && e.method === 'get'),
    false,
  );
  assert.ok(
    f.events.filter((e) => ['set', 'update', 'delete', 'create'].includes(e.method)).length <= 50,
  );
  const tomb = f.records.get(`users/${uid}/editorChatContexts/${ready.contextId}`);
  assert.equal(tomb.source, null);
  assert.equal(tomb.proofCoverage, null);
  assert.equal(tomb.closureManifest, null);
  assert.equal(JSON.stringify(tomb).includes('Aventura'), false);
  assert.equal(f.records.has(`users/${uid}/editorChatContextBodies/${ready.contextId}`), false);
  assert.equal(
    (
      await f.call({
        action: 'getCleanup',
        cleanupId: deleted.current.cleanupId,
        cleanupToken: deleted.current.cleanupToken,
      })
    ).revision,
    2,
  );
  const replay = await f.mutate(request);
  assert.deepEqual(replay, { receipt: deleted.receipt, current: null });
  await assert.rejects(f.mutate({ ...request, operationId: 'stale' }), reason('revision-conflict'));
});

test('unknown cancel fences a late delete and cleanup cannot use another UID or token', async () => {
  const f = await editorChatFixture(),
    prepared = (await f.call(f.prepare)).current;
  const deleted = await f.mutate({
    action: 'deleteContext',
    ...f.scope,
    contextId: prepared.contextId,
    contextToken: prepared.contextToken,
    operationId: 'delete',
  });
  const get = {
    action: 'getCleanup',
    cleanupId: deleted.current.cleanupId,
    cleanupToken: deleted.current.cleanupToken,
  };
  await assert.rejects(f.call(get, 'other'), reason('context-unavailable'));
  await assert.rejects(
    f.call({ ...get, cleanupToken: '0'.repeat(64) }),
    reason('identity-changed'),
  );
  await assert.rejects(
    f.mutate({
      action: 'deleteContext',
      ...f.scope,
      contextId: prepared.contextId,
      contextToken: prepared.contextToken,
      operationId: 'second-delete',
    }),
    reason('context-unavailable'),
  );
});
