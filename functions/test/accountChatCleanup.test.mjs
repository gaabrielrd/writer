import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountChatCleanupTrigger } from '../src/accountChatCleanup.mjs';

function fixture() {
  const records = new Set([
    'users/deleted/chapterChats/book/messages/one',
    'users/deleted/chapterChatLimits/book',
    'users/deleted/preferences/theme',
    'users/other/chapterChats/book/messages/one',
    'users/other/chapterChatLimits/book',
  ]);
  let fail = false;
  const db = {
    collection: (path) => path,
    async recursiveDelete(path) {
      if (fail && path.endsWith('/chapterChatLimits')) throw new Error('unavailable');
      for (const key of records) if (key.startsWith(path + '/')) records.delete(key);
    },
  };
  return {
    records,
    trigger: createAccountChatCleanupTrigger({ db }),
    failLimits: (value) => {
      fail = value;
    },
  };
}
const event = { data: { uid: 'deleted' }, id: 'account-deleted' };

test('account deletion cleans only the affected chats and limits, including repeated delivery', async () => {
  const f = fixture();
  await f.trigger.run(event);
  await f.trigger.run(event);
  assert.deepEqual([...f.records].sort(), [
    'users/deleted/preferences/theme',
    'users/other/chapterChatLimits/book',
    'users/other/chapterChats/book/messages/one',
  ]);
});

test('a partial cleanup failure propagates and retry completes the remaining cleanup', async () => {
  const f = fixture();
  f.failLimits(true);
  await assert.rejects(f.trigger.run(event), /unavailable/);
  assert.ok(f.records.has('users/deleted/chapterChatLimits/book'));
  f.failLimits(false);
  await f.trigger.run(event);
  assert.ok(!f.records.has('users/deleted/chapterChatLimits/book'));
  assert.ok(f.records.has('users/other/chapterChatLimits/book'));
});

test('account cleanup uses a retryable second generation deletion event', () => {
  const { trigger } = fixture();
  assert.equal(trigger.__endpoint.platform, 'gcfv2');
  assert.equal(trigger.__endpoint.eventTrigger.eventType, 'google.firebase.auth.user.v2.deleted');
  assert.equal(trigger.__endpoint.eventTrigger.retry, true);
  assert.equal(trigger.__endpoint.timeoutSeconds, 540);
  assert.equal(trigger.__endpoint.availableMemoryMb, 512);
});

test('a tenant account cannot clean chats belonging to a default-project user with the same uid', async () => {
  const f = fixture();
  const before = [...f.records];
  await f.trigger.run({ ...event, tenantId: 'unrelated-tenant' });
  assert.deepEqual([...f.records], before);
});
