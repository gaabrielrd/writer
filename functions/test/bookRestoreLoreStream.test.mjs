import test from 'node:test';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import { finishRestoreResources } from './helpers/bookRestoreResourcesFixture.mjs';
import assert from 'node:assert/strict';
import { ready, finish, logical, uid, id } from './helpers/bookRestoreLoreStreamFixture.mjs';
import { indexedLoreData } from './helpers/bookLoreContentFixture.mjs';
import {
  legacyMutation as mutation,
  cleanupLegacyRestore,
} from './helpers/bookLegacyRestoreFixture.mjs';

test('advanceLore materializes a field-only large generation with exact values and logical missing dates', async () => {
  const data = indexedLoreData({ count: 0 });
  data.details = '\ufeff' + 'large literal 🌙'.repeat(40000);
  delete data.createdAt;
  delete data.updatedAt;
  delete data.summary;
  delete data.relations;
  const f = await ready(data),
    p = await finish(f),
    result = await logical(f, p);
  assert.equal(result.native.payloadStorage.schemaVersion, 2);
  assert.deepEqual(result.native.payloadStorage.portableDates, {});
  assert.deepEqual(result.opened.dates, {});
  assert.deepEqual(result.data, data);
  assert.equal(result.native.updatedAt, p.preparation.timestamp);
  assert.equal(p.preparation.loreCount, 1);
  assert.equal(p.preparation.loreRelationCount, 0);
  assert.equal(p.preparation.lorePayload, null);
});
test('advanceLore materializes all native pages including a description above 8 MiB and preserves date zero', async () => {
  const data = indexedLoreData({ count: 130 });
  data.relations[63].description = '\ufeff' + 'PRIVATE_GENERATION_PROSE🌙'.repeat(350000);
  const f = await ready(data),
    p = await finish(f),
    result = await logical(f, p),
    expected = structuredClone(data);
  expected.relations = [];
  for (const value of data.relations)
    expected.relations.push(await f.mapper.mapLoreRelation(value, async () => false));
  assert.deepEqual(result.data, expected);
  assert.equal(result.native.payloadStorage.relations.pages, 3);
  assert.equal(result.data.createdAt, 0);
  assert.equal(result.data.updatedAt, 2);
  assert.equal(p.preparation.loreRelationCount, 130);
  assert.equal(
    [...f.records.values()].filter(
      (v) =>
        v.schemaVersion === 2 &&
        v.generationId === result.native.payloadStorage.generationId &&
        Object.hasOwn(v, 'offset'),
    ).length,
    3,
  );
});
test('stream initialization and operation replay do not duplicate generation controls or counters', async () => {
  const data = indexedLoreData({ count: 65 });
  data.details = 'x'.repeat(600000);
  const f = await ready(data),
    request = mutation(id, f.p, id + '-init-0001'),
    first = await f.factory().advanceBookRestoreLore(uid, request),
    before = structuredClone([...f.records]);
  assert.equal(first.progress.preparation.lorePayload.streamed, true);
  assert.deepEqual(await f.factory().advanceBookRestoreLore(uid, request), first);
  assert.deepEqual([...f.records], before);
  const p = await finish(f, first.progress);
  assert.equal(p.preparation.loreCount, 1);
  assert.equal(p.preparation.loreRelationCount, 65);
});
test('cancellation during generation drains bodies, fragments, controls and fields through production cleanup', async () => {
  const data = indexedLoreData({ count: 65 });
  data.details = 'x'.repeat(600000);
  const f = await ready(data);
  let p = f.p;
  for (let i = 0; i < 20; i++)
    p = (await f.factory().advanceBookRestoreLore(uid, mutation(id, p, id + '-partial-' + i)))
      .progress;
  assert.ok([...f.records.values()].some((v) => v.stageKind === 'restore-lore-generation'));
  const done = await cleanupLegacyRestore(f.factory(), uid, id, p, {
    limit: 3,
    prefix: id + '-cleanup-',
  });
  assert.equal(done.state, 'cancelled');
  assert.equal(
    [...f.records.keys()].some((path) => path.startsWith('books/' + p.bookId + '/')),
    false,
  );
});

test('a streamed job resumes even when the coordinated option for new jobs is disabled', async () => {
  const data = indexedLoreData({ count: 65 });
  data.details = 'x'.repeat(600000);
  const f = await ready(data),
    first = await f.factory().advanceBookRestoreLore(uid, mutation(id, f.p, id + '-start-0001'));
  f.factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 });
  const p = await finish(f, first.progress),
    result = await logical(f, p);
  assert.equal(p.preparation.loreCount, 1);
  assert.equal(result.native.payloadStorage.schemaVersion, 2);
  await assert.rejects(() =>
    f.factory().advanceBookRestoreLore(uid, {
      ...mutation(id, p, id + '-client-mode'),
      indexedLoreBodies: true,
    }),
  );
});
test('the Resources passage uses indexed metadata for a large generated lore item', async () => {
  const data = indexedLoreData({ count: 130 });
  data.details = '\ufeff' + 'large 🌙'.repeat(1000000);
  const f = await ready(data),
    p = await finish(f),
    next = await finishRestoreResources(f.factory, uid, id, p);
  assert.equal(next.preparation.phase, 'resource-counts');
  assert.equal(next.preparation.resourceCounts.lore, 1);
  assert.equal(f.records.has('books/' + p.bookId), false);
});
