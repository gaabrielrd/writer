import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { workScope } from '../src/workProgressContracts.mjs';
import {
  prepareLiteraryLegacyChatIndex,
  prepareLiteraryLegacyChatIndexCleanup,
  literaryLegacyChatIndexId,
} from '../src/literaryLegacyChatIndex.mjs';
import { readLiteraryImpactBookInventoryPage } from '../src/literaryImpactInventory.mjs';
const uid = 'author',
  data = { bookId: 'book', chapterId: 'chapter', conversationId: 'conversation' },
  base = 'users/author/chapterChats/book/chapters/chapter/conversations/conversation',
  id = literaryLegacyChatIndexId(uid, data, 'message'),
  path = 'books/book/literaryLegacyChatMessages/' + id;
const manifest = (revision = 1) => ({
  version: 1,
  target: { kind: 'book', id: 'book' },
  resource: { kind: 'chapter', id: 'chapter' },
  bookToken: 'a'.repeat(64),
  selection: 'explicit',
  contractRevision: revision,
  planIds: ['brief'],
  plans: [{ id: 'brief', identityToken: 'b'.repeat(64), revision }],
  references: [],
});
function fixture() {
  const f = studioDb();
  f.records.set('books/book', { authorId: uid, updatedAt: 1 });
  f.records.set('books/book/chapters/chapter', { bookId: 'book' });
  f.records.set(base, { busy: 'message', deleting: false, draft: 'PRIVATE DRAFT' });
  const header = {
    id: 'message',
    role: 'assistant',
    state: 'running',
    messageInstance: 'instance',
    generationAttempt: 'attempt',
    text: 'PRIVATE ANSWER',
    context: {
      text: 'PRIVATE SELECTION',
      persona: { instruction: 'PRIVATE PERSONA' },
      lore: [{ description: 'PRIVATE LORE' }],
      writing: { version: 1, manifest: manifest(), instruction: 'PRIVATE GUIDE' },
    },
  };
  const save = async (value = header) =>
    f.db.runTransaction(async (tx) => {
      const pending = await prepareLiteraryLegacyChatIndex(tx, f.db, uid, data, value);
      pending.commit();
      tx.set(f.db.doc(base + '/messages/message'), value);
    });
  const c = workScope(f.db, uid, { target: { kind: 'book', id: 'book' } }, []),
    read = () =>
      f.db.runTransaction((tx) =>
        readLiteraryImpactBookInventoryPage(tx, c, {
          bookId: 'book',
          collection: 'literaryLegacyChatMessages',
        }),
      );
  return { ...f, header, save, read };
}
test('native claim and history capture index only closed provenance, not private inputs or output', async () => {
  const f = fixture();
  await f.save();
  let item = (await f.read()).items[0];
  assert.ok(item.issues.includes('legacy-chat-history-capture-pending'));
  assert.ok(item.issues.includes('legacy-chat-noncanonical-inputs-unversioned'));
  assert.equal(JSON.stringify(f.records.get(path)).includes('PRIVATE'), false);
  assert.equal(JSON.stringify(item).includes('PRIVATE'), false);
  const historical = manifest(2);
  await f.save({
    ...f.header,
    history: [{ role: 'assistant', text: 'PRIVATE HISTORY' }],
    historyOrigins: [historical, historical],
  });
  const stored = f.records.get(path);
  assert.equal(stored.historyState, 'captured');
  assert.equal(stored.historyManifests.length, 1);
  item = (await f.read()).items[0];
  assert.equal(item.issues.includes('legacy-chat-history-capture-pending'), false);
  const plans = item.links.filter((link) => link.from.kind === 'plan');
  assert.deepEqual(plans.map((link) => link.capture.revision).sort(), [1, 2]);
  assert.ok(item.links.some((link) => link.from.kind === 'chapter' && link.relation === 'subject'));
  assert.equal(item.sourceIdentitiesVerified, false);
});
test('native recreation, same request replacement and changed manifests cannot masquerade as indexed origins', async () => {
  for (const change of ['conversation', 'chapter', 'book', 'attempt', 'instance', 'manifest']) {
    const f = fixture();
    await f.save({ ...f.header, history: [] });
    if (['conversation', 'chapter', 'book'].includes(change)) {
      const target =
        change === 'conversation'
          ? base
          : change === 'chapter'
            ? 'books/book/chapters/chapter'
            : 'books/book';
      f.metadata.set(target, { createdAt: 99999 });
    } else {
      const native = f.records.get(base + '/messages/message');
      if (change === 'manifest') native.context.writing.manifest = manifest(3);
      else native[change === 'attempt' ? 'generationAttempt' : 'messageInstance'] = 'replacement';
    }
    const item = (await f.read()).items[0];
    assert.equal(item.links.length, 0);
    assert.ok(item.issues.length > 0);
  }
});
test('a new native attempt replaces its index and never adopts the previous attempt metadata', async () => {
  const f = fixture();
  await f.save();
  const before = f.records.get(path);
  await f.save({
    ...f.header,
    generationAttempt: 'next-attempt',
    context: { writing: { version: 1, manifest: manifest(4) } },
    history: [],
  });
  const after = f.records.get(path);
  assert.equal(after.messageInstance, before.messageInstance);
  assert.equal(after.generationAttempt, 'next-attempt');
  assert.equal(after.manifest.contractRevision, 4);
  assert.equal(
    (await f.read()).items[0].links.some((link) => link.capture?.revision === 1),
    false,
  );
});
test('paged native deletion removes only matching message provenance in the same transaction', async () => {
  for (const replace of [false, true]) {
    const f = fixture();
    await f.save();
    const indexed = f.records.get(path);
    if (replace) indexed.generationAttempt = 'foreign-attempt';
    const job = { scopeToken: indexed.scopeToken, conversationToken: indexed.conversationToken };
    await f.db.runTransaction(async (tx) => {
      const page = await tx.get(
        f.db
          .collection(base + '/messages')
          .limit(20)
          .select('role', 'messageInstance', 'generationAttempt'),
      );
      const cleanup = await prepareLiteraryLegacyChatIndexCleanup(
        tx,
        f.db,
        uid,
        data,
        job,
        page.docs,
      );
      assert.equal(cleanup.count, replace ? 0 : 1);
      cleanup.commit();
      page.docs.forEach((row) => tx.delete(row.ref));
    });
    assert.equal(f.records.has(path), replace);
    assert.equal(f.records.has(base + '/messages/message'), false);
  }
});
test('foreign actor cannot index a chapter and the inventory never reads message plaintext', async () => {
  const f = fixture();
  await f.save({ ...f.header, history: [] });
  await f.read();
  for (const read of f.reads.filter((entry) => entry.collectionPath === base + '/messages'))
    assert.ok(
      read.fields.every((field) => !['text', 'suggestion', 'context', 'history'].includes(field)),
    );
  await assert.rejects(
    f.db.runTransaction((tx) => prepareLiteraryLegacyChatIndex(tx, f.db, 'other', data, f.header)),
    { code: 'permission-denied' },
  );
});
