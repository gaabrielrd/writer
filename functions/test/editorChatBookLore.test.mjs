import test from 'node:test';
import assert from 'node:assert/strict';
import { editorChatFixture, reason } from './helpers/editorChatFixture.mjs';
import { editorChatConversationFixture } from './helpers/editorChatConversationFixture.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { seedBookLoreRead } from './helpers/bookLoreReadFixture.mjs';
import { seedBookLoreGeneration } from './helpers/bookLoreGenerationFixture.mjs';
import {
  creationAdoptionFixture,
  adoptCreation,
} from './helpers/bookLoreCreationAdoptionFixture.mjs';
import { resourcePayloadChunkPath } from '../src/bookResourcePayloadPaths.mjs';
const data = () => ({
  name: 'Aria',
  category: 'character',
  summary: '🌙'.repeat(100),
  details: '\ufeff' + '🌙'.repeat(1200),
  aliases: Array.from({ length: 25 }, (_, i) => (i < 2 ? '' : 'same')),
  isPublic: false,
});
async function fixture(mode = 'v1', extra = {}) {
  const f = await editorChatFixture('book', false, adventureImportDb({ nativeUpdates: true }));
  let seed,
    id = 'aria';
  if (mode === 'created') {
    const creation = await creationAdoptionFixture(f.db, {
      bookId: f.target.id,
      changes: Object.entries(data()).map(([field, value]) => ({ target: { field }, value })),
    });
    await adoptCreation(creation);
    seed = creation.source.seed;
    id = creation.loreId;
  } else if (mode === 'v2') {
    seed = await seedBookLoreGeneration(f.db, {
      bookId: f.target.id,
      id,
      noBase: true,
      fields: { ...data(), ...extra },
    });
  } else
    seed = await seedBookLoreRead(f.db, {
      bookId: f.target.id,
      id,
      inline: mode === 'inline',
      data: { ...data(), ...extra },
    });
  return { ...f, seed, id, head: f.path + '/lore/' + id };
}
const ready = async (f) => (await f.advance((await f.call(f.prepare)).current)).current;
const chunks = (f) =>
  f.events.filter((e) => e.method === 'get' && e.path?.includes('/bookResourceChunks/'));
const derived = (f) =>
  f.events.filter((e) => e.method === 'get' && e.path?.includes('/editorChatContextBodies/'));
for (const mode of ['inline', 'v1', 'v2', 'created'])
  test(
    'logical ' + mode + ' reaches matcher and frozen snapshot with exact omissions',
    async () => {
      const f = await fixture(mode),
        current = await ready(f);
      assert.equal(current.phase, 'ready');
      assert.equal(current.includedEntityCount, 1);
      const frozen = (await f.inspect(current)).frozen;
      const lore = frozen.lore[0];
      assert.equal(lore.name, 'Aria');
      assert.equal(lore.summary, '🌙'.repeat(70));
      assert.equal(lore.detailsExcerpt, '\ufeff' + '🌙'.repeat(999));
      assert.equal(lore.detailsTruncated, true);
      assert.equal(lore.aliasesOmitted, 5);
      assert.deepEqual(lore.aliases, data().aliases.slice(0, 20));
      f.events.length = 0;
      assert.deepEqual((await f.inspect(current)).frozen, frozen);
      assert.equal(chunks(f).length, 0);
    },
  );
test('native generation edits preserve frozen context; freshness uses head stamp without fetching prose', async () => {
  const f = await fixture('v2'),
    current = await ready(f),
    original = (await f.inspect(current)).frozen;
  const stamp = f.metadata.get(f.head);
  f.metadata.set(f.head, { ...stamp, updatedAtNanoseconds: stamp.updatedAtNanoseconds + 100 });
  f.records.get(f.path).localLoreVersion = (f.records.get(f.path).localLoreVersion ?? 0) + 1;
  const bodyId = f.seed.bodies.details.prepared.manifest.bodyId;
  f.records.get(resourcePayloadChunkPath(f.target.id, bodyId, 0)).bytes = 'AAAA';
  f.events.length = 0;
  const view = await f.inspect(current);
  assert.equal(view.freshness, 'stale');
  assert.deepEqual(view.frozen, original);
  assert.equal(chunks(f).length, 0);
});
for (const change of ['deleted', 'tombstone', 'owner', 'recreated', 'reservation'])
  test(change + ' revokes a native frozen origin before the derived body', async () => {
    const f = await fixture('v2'),
      current = await ready(f);
    if (change === 'deleted') f.records.get(f.head).deleted = true;
    if (change === 'tombstone')
      f.records.set(f.path + '/bookLoreTombstones/' + f.id, { removed: true });
    if (change === 'owner') f.records.get(f.head).ownerId = 'other';
    if (change === 'reservation')
      f.records.set(f.path + '/bookLoreReservations/' + f.id, { ownerId: 'other' });
    if (change === 'recreated')
      f.metadata.set(f.head, { createdAt: 1000, createdAtNanoseconds: 999999 });
    f.events.length = 0;
    await assert.rejects(f.inspect(current), reason('provenance-revoked'));
    assert.equal(chunks(f).length, 0);
    assert.equal(derived(f).length, 0);
  });
test('large unrelated native details stay unfetched during name scanning', async () => {
  const f = await fixture('v2');
  const unrelated = await seedBookLoreGeneration(f.db, {
    bookId: f.target.id,
    id: 'unrelated',
    noBase: true,
    fields: { name: 'Another', category: 'other', details: 'x'.repeat(9000000) },
  });
  f.events.length = 0;
  const current = await ready(f);
  assert.equal(current.includedEntityCount, 1);
  const id = unrelated.bodies.details.prepared.manifest.bodyId;
  assert.equal(
    f.events.some((e) => e.path?.includes(id)),
    false,
  );
});
test('retention complexity fails atomically and does not truncate the matcher catalog', async () => {
  const f = await fixture('v2', { aliases: Array(230000).fill('') });
  const prepared = (await f.call(f.prepare)).current,
    before = structuredClone([...f.records]);
  await assert.rejects(f.advance(prepared), reason('context-too-complex'));
  assert.deepEqual([...f.records], before);
});
test('corrupted trailing source rejects an entire advance without context or receipt writes', async () => {
  const f = await fixture('v1', { details: 'Aria ' + 'x'.repeat(150000) });
  const manifest = f.seed.base.prepared.manifest;
  f.records.get(
    resourcePayloadChunkPath(f.target.id, manifest.bodyId, manifest.chunkCount - 1),
  ).bytes = 'AAAA';
  const prepared = (await f.call(f.prepare)).current,
    before = structuredClone([...f.records]);
  await assert.rejects(f.advance(prepared), reason('inconsistent'));
  assert.deepEqual([...f.records], before);
});
test('base above 8 MiB completes a real context with a bounded literal snapshot', async () => {
  const f = await fixture('v1', { details: '\ufeff' + '🌙'.repeat(2300000) });
  const current = await ready(f),
    lore = (await f.inspect(current)).frozen.lore[0];
  assert.equal(lore.detailsExcerpt, '\ufeff' + '🌙'.repeat(999));
  assert.equal(lore.detailsTruncated, true);
  assert.ok(f.seed.base.prepared.manifest.chunkCount > 128);
});

async function conversationFixture() {
  return editorChatConversationFixture({
    database: adventureImportDb({ nativeUpdates: true }),
    async setup(f) {
      await seedBookLoreGeneration(f.db, {
        bookId: f.target.id,
        id: 'aria',
        noBase: true,
        fields: data(),
      });
    },
  });
}
test('native chat answer remains frozen and stale without reopening any current lore body', async () => {
  const f = await conversationFixture();
  await f.seedTurn('native');
  const first = await f.get('native');
  assert.equal(first.presentation, 'available');
  const head = f.path + '/lore/aria',
    stamp = f.metadata.get(head);
  f.metadata.set(head, { ...stamp, updatedAtNanoseconds: stamp.updatedAtNanoseconds + 100 });
  f.records.get(f.path).localLoreVersion = (f.records.get(f.path).localLoreVersion ?? 0) + 1;
  f.events.length = 0;
  const view = await f.get('native');
  assert.equal(view.answer.freshness, 'stale');
  assert.deepEqual(view.answer.context, first.answer.context);
  assert.equal(chunks(f).length, 0);
});
test('native chat hides revoked answer, keeps own question and requires the same restored origin', async () => {
  const f = await conversationFixture();
  await f.seedTurn('native');
  const marker = f.path + '/bookLoreTombstones/aria';
  f.records.set(marker, { removed: true });
  f.events.length = 0;
  const blocked = await f.get('native');
  assert.equal(blocked.presentation, 'blocked');
  assert.equal(blocked.question, 'Pergunta native');
  assert.equal(blocked.answer, null);
  assert.equal(
    f.events.some((e) => e.method === 'get' && e.path?.includes('/turnBodies/')),
    false,
  );
  assert.equal(chunks(f).length, 0);
  f.records.delete(marker);
  assert.equal((await f.get('native')).presentation, 'available');
  f.metadata.set(f.path + '/lore/aria', { createdAt: 1000, createdAtNanoseconds: 999999 });
  f.events.length = 0;
  assert.equal((await f.get('native')).presentation, 'blocked');
  assert.equal(
    f.events.some((e) => e.method === 'get' && e.path?.includes('/turnBodies/')),
    false,
  );
});
