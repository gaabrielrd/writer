import test from 'node:test';
import assert from 'node:assert/strict';
import { editorChatFixture, uid } from './helpers/editorChatFixture.mjs';
import { workScope, digest } from '../src/workProgressContracts.mjs';
import { literaryChatContextIndexId } from '../src/literaryChatContextIndex.mjs';
import { readLiteraryImpactBookInventoryPage } from '../src/literaryImpactInventory.mjs';
import { verifyLiteraryImpactInventoryLink } from '../src/literaryImpactRecordVerification.mjs';
import { literaryImpactLinkKey } from '../src/literaryImpactProtocol.mjs';
import {
  captureLiteraryChatLoreDependencies,
  normalizeLiteraryChatLoreDependencies,
} from '../src/literaryChatLoreDependencies.mjs';
const ownLore = {
  name: 'Aria',
  aliases: [],
  category: 'character',
  summary: 'PRIVATE SUMMARY',
  details: 'PRIVATE DETAILS',
  structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
  relations: [],
  isPublic: false,
};
async function fixture(global = false) {
  const f = await editorChatFixture('book');
  if (global) {
    f.records.get(f.path).universeId = 'world';
    f.records.set('universes/world', { authorId: uid, loreVersion: 0, privacyVersion: 0 });
  }
  const lorePath = (global ? 'universes/world' : f.path) + '/lore/entity';
  f.records.set(lorePath, { ...ownLore });
  let ready = (await f.call(f.prepare)).current;
  for (let page = 0; page < 5 && ready.phase !== 'ready'; page++)
    ready = (await f.advance(ready, 'lore-page-' + page)).current;
  assert.equal(ready.phase, 'ready');
  const id = literaryChatContextIndexId(uid, ready.contextId),
    indexPath = f.path + '/literaryChatContexts/' + id,
    c = workScope(f.db, uid, { target: f.target }, []);
  const inventory = () =>
    f.db.runTransaction((tx) =>
      readLiteraryImpactBookInventoryPage(tx, c, {
        bookId: f.target.id,
        collection: 'literaryChatContexts',
        recordId: id,
      }),
    );
  const page = await inventory(),
    item = page.items[0],
    link = item.links.find((value) => value.capture?.scheme === 'native-chat-lore');
  assert.ok(link);
  const verify = () =>
    f.db.runTransaction((tx) =>
      verifyLiteraryImpactInventoryLink(tx, c, {
        bookId: f.target.id,
        collection: 'literaryChatContexts',
        recordId: id,
        recordToken: item.recordToken,
        linkId: digest(literaryImpactLinkKey(link)),
      }),
    );
  return { ...f, c, id, indexPath, lorePath, inventory, verify, link };
}
for (const global of [false, true])
  test(
    'native lore metadata distinguishes edits and births without reading private fields: ' + global,
    async () => {
      const f = await fixture(global),
        index = f.records.get(f.indexPath);
      assert.equal(JSON.stringify(index).includes('PRIVATE'), false);
      assert.equal(index.loreDependencies.length, 1);
      f.events.length = 0;
      const current = await f.verify();
      assert.equal(current.status, 'current');
      assert.equal(current.manuscriptRead, false);
      assert.equal(current.byteIntegrityChecked, false);
      const metadataReads = f.events.filter(
        (event) => event.path === f.lorePath && event.method === 'getAll',
      );
      assert.ok(metadataReads.length > 0);
      assert.ok(
        metadataReads.every(
          (event) =>
            !['name', 'details', 'summary', 'aliases'].some((field) =>
              event.fields?.includes(field),
            ),
        ),
      );
      assert.equal(
        f.events.some((event) => event.path?.includes('editorChatContextBodies')),
        false,
      );
      await f.db.runTransaction(async (tx) => {
        const ref = f.db.doc(f.lorePath);
        await tx.get(ref);
        tx.update(ref, { details: 'Changed private detail' });
      });
      const changed = await f.verify();
      assert.equal(changed.status, 'changed');
      assert.equal(changed.sourceIdentityVerified, true);
      f.metadata.set(f.lorePath, { createdAt: 9999 });
      const recreated = await f.verify();
      assert.equal(recreated.status, 'recreated');
      assert.equal(recreated.sourceIdentityVerified, false);
    },
  );
test('removed, tombstoned and detached native lore cannot be reauthorized by its index', async () => {
  const local = await fixture();
  local.records.set(local.path + '/bookLoreTombstones/entity', { deleted: true });
  assert.equal((await local.verify()).status, 'unavailable');
  const global = await fixture(true);
  global.records.get(global.path).universeId = null;
  assert.equal((await global.verify()).status, 'unavailable');
  global.records.get(global.path).universeId = 'world';
  global.records.get('universes/world').authorId = 'other';
  assert.equal((await global.verify()).status, 'unavailable');
});
test('a legacy index without captured lore versions is explicit and cannot silently certify current sources', async () => {
  const f = await fixture();
  const record = f.records.get(f.indexPath);
  delete record.loreDependencies;
  const item = (await f.inventory()).items[0],
    link = item.links.find((entry) => entry.from.kind === 'localLore');
  assert.equal(link.capture.scheme, 'unknown');
  assert.equal(link.capture.versionToken, null);
  assert.ok(item.issues.includes('native-chat-lore-version-not-recorded'));
});
test('closed lore metadata requires a one-to-one native closure and rejects private fields and forged versions', () => {
  const reference = { kind: 'book', scopeId: 'book', entityId: 'entity' },
    identityToken = 'a'.repeat(64),
    scopeToken = 'b'.repeat(64),
    capturedStamp = { seconds: 1, nanoseconds: 2 },
    closure = {
      leaves: [{ kind: 'lore', reference, scopeToken, entityIdentityToken: identityToken }],
    };
  const captured = captureLiteraryChatLoreDependencies(
    [
      {
        leaf: closure.leaves[0],
        snapshot: {
          identityToken,
          capturedStamp,
          name: 'PRIVATE NAME',
          detailsExcerpt: 'PRIVATE DETAIL',
        },
      },
    ],
    closure,
  );
  assert.equal(JSON.stringify(captured).includes('PRIVATE'), false);
  for (const invalid of [
    [],
    [...captured, ...captured],
    [{ ...captured[0], details: 'PRIVATE' }],
    [{ ...captured[0], versionToken: 'c'.repeat(64) }],
    [{ ...captured[0], identityToken: 'd'.repeat(64) }],
  ])
    assert.throws(() => normalizeLiteraryChatLoreDependencies(invalid, closure));
});
