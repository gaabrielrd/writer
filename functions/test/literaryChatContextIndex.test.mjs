import test from 'node:test';
import assert from 'node:assert/strict';
import { editorChatFixture, uid } from './helpers/editorChatFixture.mjs';
import {
  literaryChatContextIndexId,
  prepareLiteraryChatContextIndexDeletion,
} from '../src/literaryChatContextIndex.mjs';
import { workScope } from '../src/workProgressContracts.mjs';
import { readLiteraryImpactBookInventoryPage } from '../src/literaryImpactInventory.mjs';
import { verifyLiteraryImpactInventoryLink } from '../src/literaryImpactRecordVerification.mjs';
import { digest } from '../src/workProgressContracts.mjs';
import { literaryImpactLinkKey } from '../src/literaryImpactProtocol.mjs';

async function fixture() {
  const f = await editorChatFixture('book'),
    prepared = (await f.call(f.prepare)).current;
  const before = f.records.get(f.path).literaryDependencyRevision ?? 0;
  const ready = (await f.advance(prepared)).current;
  const id = literaryChatContextIndexId(uid, ready.contextId),
    path = f.path + '/literaryChatContexts/' + id;
  const c = workScope(f.db, uid, { target: f.target }, []);
  const inventory = () =>
    f.db.runTransaction((tx) =>
      readLiteraryImpactBookInventoryPage(tx, c, {
        bookId: f.target.id,
        collection: 'literaryChatContexts',
        recordId: id,
      }),
    );
  return { ...f, ready, before, id, indexPath: path, c, inventory };
}
test('ready capture atomically adds only closed dependency metadata; replay does not tick twice', async () => {
  const f = await fixture(),
    record = f.records.get(f.indexPath);
  assert.equal(f.records.get(f.path).literaryDependencyRevision, f.before + 1);
  assert.equal(record.contextToken, f.ready.contextToken);
  assert.equal(
    record.closureHash,
    f.records.get('users/' + uid + '/editorChatContexts/' + f.ready.contextId).closureHash,
  );
  assert.equal(JSON.stringify(record).includes('Aria'), false);
  assert.equal(JSON.stringify(record).includes('Texto próprio'), false);
  assert.equal(Object.hasOwn(record, 'snapshot'), false);
  assert.equal(Object.hasOwn(record, 'question'), false);
  const prepared = await f.call(f.prepare);
  assert.equal(prepared.current, null);
  assert.equal(f.records.get(f.path).literaryDependencyRevision, f.before + 1);
  f.events.length = 0;
  const page = await f.inventory();
  assert.equal(page.wholeProject, false);
  assert.equal(page.collectionComplete, false);
  const origin = page.items[0].links.find((link) => link.capture?.scheme === 'native-chat-target');
  assert.equal(origin.from.id, f.resource.id);
  assert.equal(origin.to.kind, 'chat');
  assert.equal(
    f.events.some((event) => event.path?.includes('editorChatContextBodies')),
    false,
  );
  const item = page.items[0];
  f.events.length = 0;
  const verified = await f.db.runTransaction((tx) =>
    verifyLiteraryImpactInventoryLink(tx, f.c, {
      bookId: f.target.id,
      collection: 'literaryChatContexts',
      recordId: f.id,
      recordToken: item.recordToken,
      linkId: digest(literaryImpactLinkKey(origin)),
    }),
  );
  assert.equal(verified.status, 'current');
  assert.equal(verified.manuscriptRead, false);
  assert.equal(verified.wholeUnitRead, false);
  assert.equal(verified.editorialReview, false);
  assert.equal(verified.byteIntegrityChecked, false);
  assert.equal(
    f.events.some((event) => event.path?.includes('editorChatContextBodies')),
    false,
  );
});
test('a stale or removed native header cannot be replaced with the sidecar as a grant', async () => {
  const f = await fixture(),
    native = 'users/' + uid + '/editorChatContexts/' + f.ready.contextId;
  const original = f.records.get(native);
  for (const patch of [
    { summary: { ...original.summary, contextToken: 'f'.repeat(64) } },
    { summary: { ...original.summary, phase: 'deleted' } },
    { closureHash: 'e'.repeat(64) },
  ]) {
    f.records.set(native, { ...original, ...patch });
    const item = (await f.inventory()).items[0];
    assert.deepEqual(item.links, []);
    assert.deepEqual(item.issues, ['native-chat-context-unavailable-or-changed']);
  }
  f.records.delete(native);
  assert.deepEqual((await f.inventory()).items[0].links, []);
});
test('delete invalidates dependency census immediately, before native body cleanup', async () => {
  const f = await fixture(),
    before = f.records.get(f.path).literaryDependencyRevision;
  const result = await f.mutate({
    action: 'deleteContext',
    ...f.scope,
    contextId: f.ready.contextId,
    contextToken: f.ready.contextToken,
    operationId: 'delete-indexed-context',
  });
  assert.equal(result.current.phase, 'context-body');
  assert.equal(f.records.has(f.indexPath), false);
  assert.equal(
    f.records.has('users/' + uid + '/editorChatContextBodies/' + f.ready.contextId),
    true,
  );
  assert.equal(f.records.get(f.path).literaryDependencyRevision, before + 1);
});
test('late cleanup keeps a successor incarnation and never mutates a foreign recreated book', async () => {
  const f = await fixture(),
    before = f.records.get(f.path).literaryDependencyRevision;
  await f.db.runTransaction(async (tx) => {
    const plan = await prepareLiteraryChatContextIndexDeletion(tx, f.db, uid, {
      ...f.ready,
      contextToken: 'f'.repeat(64),
    });
    plan.commit();
  });
  assert.equal(f.records.has(f.indexPath), true);
  assert.equal(f.records.get(f.path).literaryDependencyRevision, before);
  f.records.set(f.path, { authorId: 'other', literaryDependencyRevision: 90 });
  await f.db.runTransaction(async (tx) => {
    const plan = await prepareLiteraryChatContextIndexDeletion(tx, f.db, uid, f.ready);
    plan.commit();
  });
  assert.equal(f.records.has(f.indexPath), false);
  assert.deepEqual(f.records.get(f.path), { authorId: 'other', literaryDependencyRevision: 90 });
});
test('adventure context has no book-side index or literary dependency clock', async () => {
  const f = await editorChatFixture('adventure'),
    prepared = (await f.call(f.prepare)).current;
  await f.advance(prepared);
  assert.equal(
    [...f.records.keys()].some((path) => path.includes('/literaryChatContexts/')),
    false,
  );
  assert.equal(Object.hasOwn(f.records.get(f.path), 'literaryDependencyRevision'), false);
});

test('native scene metadata distinguishes current, changed and recreated origins without opening chat bodies', async () => {
  const f = await fixture(),
    item = (await f.inventory()).items[0];
  const link = item.links.find((value) => value.capture?.scheme === 'native-chat-target');
  const verify = () =>
    f.db.runTransaction((tx) =>
      verifyLiteraryImpactInventoryLink(tx, f.c, {
        bookId: f.target.id,
        collection: 'literaryChatContexts',
        recordId: f.id,
        recordToken: item.recordToken,
        linkId: digest(literaryImpactLinkKey(link)),
      }),
    );
  await f.db.runTransaction(async (tx) => {
    const ref = f.db.doc(f.path + '/scenes/' + f.resource.id);
    await tx.get(ref);
    tx.update(ref, { title: 'Novo título' });
  });
  assert.equal((await verify()).status, 'changed');
  f.metadata.set(f.path + '/scenes/' + f.resource.id, { createdAt: 5000 });
  f.events.length = 0;
  const recreated = await verify();
  assert.equal(recreated.status, 'recreated');
  assert.equal(recreated.sourceIdentityVerified, false);
  assert.equal(
    f.events.some((event) => event.path?.includes('editorChatContextBodies')),
    false,
  );
});
