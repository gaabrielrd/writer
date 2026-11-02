import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { campaignBackupLoreDb } from './helpers/campaignBackupLoreDb.mjs';
import {
  backupLoreFixture,
  uid,
  entity,
  heroKey,
  patch,
  remove,
} from './helpers/campaignBackupLore.mjs';
import { createCampaignBackupLoreInventoryService } from '../src/campaignBackupLoreInventory.mjs';
import { variantChunkId } from '../src/campaignLoreContracts.mjs';
import { digest } from '../src/campaignBaseContracts.mjs';
import { loreGuardPath } from '../src/campaignLoreStorage.mjs';
const bad = (e) => e.code === 'failed-precondition';
async function fixture(save = true, value = entity()) {
  const f = await backupLoreFixture(undefined, campaignBackupLoreDb());
  if (save) {
    await f.save('inventory-initial', 0, value);
    await f.refresh();
  }
  f.inventory = createCampaignBackupLoreInventoryService({ db: f.db });
  f.stores = (extra = {}) =>
    f.inventory.listCampaignBackupLoreStores(uid, { ...f.anchor, ...extra });
  f.physical = (store, extra = {}) =>
    f.inventory.listCampaignBackupLoreBodies(uid, {
      ...f.anchor,
      scope: store.scope,
      storeToken: store.storeToken,
      ...extra,
    });
  f.probe = (extra = {}) =>
    f.inventory.probeCampaignBackupLoreBodies(uid, { ...f.anchor, ...extra });
  f.coverage = (ref, extra = {}) =>
    f.inventory.getCampaignBackupLoreBodyCoverage(uid, {
      ...f.anchor,
      id: ref.id,
      variantToken: ref.variantToken,
      ...extra,
    });
  return f;
}
const ref = async (f) => (await f.list()).items.find((v) => v.id === heroKey);
const rawBodies = (f) => [...f.records].filter(([p]) => p.includes('/loreVariantBodies/'));
async function put(f, path, value) {
  await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), value));
}
async function operational(f, id = digest('operational-store'), baseId = f.campaign.activeBaseId) {
  await put(f, f.path + '/loreGenerations/' + id, {
    schemaVersion: 1,
    id,
    ownerId: uid,
    campaignId: f.id,
    campaignToken: f.campaignToken,
    baseId,
    state: 'preparing',
  });
  return id;
}
test('legacy root and empty generations are explicit, metadata-only and read-only', async () => {
  const f = await fixture(false),
    before = structuredClone([...f.records]),
    stores = await f.stores();
  assert.equal(stores.legacy.scope, 'legacy');
  assert.equal(stores.legacy.status, 'active');
  assert.deepEqual(stores.items, []);
  assert.deepEqual((await f.physical(stores.legacy)).items, []);
  assert.deepEqual((await f.probe()).items, []);
  assert.deepEqual([...f.records], before);
});
test('coverage, physical page and cohort probe return identical native tokens', async () => {
  const f = await fixture(),
    stores = await f.stores(),
    p = await f.physical(stores.legacy),
    coverage = await f.coverage(await ref(f)),
    probe = await f.probe();
  assert.equal(coverage.outcome, 'available');
  assert.equal(stores.family, 'stores');
  assert.equal(p.family, 'bodies');
  assert.equal(probe.family, 'probe');
  assert.equal(p.scope, 'legacy');
  assert.equal(p.storeToken, stores.legacy.storeToken);
  assert.deepEqual(coverage.parts, p.items);
  assert.equal(probe.items.length, p.items.length);
  assert.deepEqual(
    probe.items.map(({ id, resourceToken, disposition }) => ({ id, resourceToken, disposition })),
    p.items,
  );
  assert.equal(coverage.scope, 'legacy');
  assert.equal(coverage.storeToken, stores.legacy.storeToken);
  assert.ok(coverage.parts.every((v) => v.disposition === 'referenced'));
});
test('active generation can reference historical legacy bodies without copying them', async () => {
  const f = await fixture();
  await f.adopt();
  const stores = await f.stores();
  assert.equal(stores.legacy.status, 'historical');
  assert.equal(stores.items.length, 1);
  assert.equal(stores.items[0].status, 'active');
  assert.equal((await f.physical(stores.items[0])).items.length, 0);
  assert.equal((await f.physical(stores.legacy)).items[0].disposition, 'referenced');
  assert.equal((await f.coverage(await ref(f))).scope, 'legacy');
});
test('previous ready generation remains a referenced physical store after another adoption', async () => {
  const f = await fixture();
  await f.adopt();
  const previous = f.records.get(f.path).activeLoreGenerationId;
  await f.save('generation-text', 2, entity());
  await f.adopt();
  const stores = await f.stores(),
    old = stores.items.find((v) => v.scope === previous),
    current = stores.items.find((v) => v.status === 'active');
  assert.equal(old.status, 'historical');
  assert.equal((await f.coverage(await ref(f))).scope, previous);
  assert.equal((await f.physical(old)).items[0].disposition, 'referenced');
  assert.equal((await f.physical(current)).items.length, 0);
});
test('discarded retained bytes are operational residue, never promoted by inventory', async () => {
  const f = await fixture();
  await f.removeReferences();
  await f.adopt('discard-local');
  const stores = await f.stores(),
    coverage = await f.coverage(await ref(f));
  assert.equal(coverage.outcome, 'none');
  assert.ok(!('manifest' in coverage));
  const page = await f.physical(stores.legacy);
  assert.ok(page.items.length > 0);
  assert.ok(page.items.every((v) => v.disposition === 'unreferenced'));
});
test('removed override remains physically referenced without restoring its state', async () => {
  const f = await fixture();
  await f.lore.removeCampaignLore(uid, {
    ...f.scope(),
    sourceKey: heroKey,
    expectedRevision: 1,
    operationId: 'inventory-remove-variant',
  });
  await f.refresh();
  const coverage = await f.coverage(await ref(f));
  assert.equal(coverage.outcome, 'available');
  assert.equal((await f.read(await ref(f))).content.mode, 'removed');
});
test('missing declared part is detected by coverage although it vanished from physical pages', async () => {
  const f = await fixture(),
    [path] = rawBodies(f)[0];
  await remove(f, path);
  assert.equal((await f.physical((await f.stores()).legacy)).items.length, 0);
  await assert.rejects(f.coverage(await ref(f)), bad);
});
test('extra body in a bound revision is rejected even in a historical store', async () => {
  const f = await fixture();
  await f.adopt();
  const [, body] = rawBodies(f)[0],
    index = 99,
    id = variantChunkId(
      { campaignToken: f.campaignToken, base: { id: body.baseId } },
      heroKey,
      body.revision,
      index,
    );
  await put(f, f.path + '/loreVariantBodies/' + id, { ...body, index, content: 'NEVER READ' });
  f.metadataReads.length = 0;
  await assert.rejects(f.physical((await f.stores()).legacy), bad);
  assert.ok(f.metadataReads.every((r) => !r.fields.includes('content')));
});
test('body without an active owner in active store is an orphan and refuses', async () => {
  const f = await fixture(),
    [, body] = rawBodies(f)[0],
    sourceKey = digest('unknown-owner'),
    id = variantChunkId(
      { campaignToken: f.campaignToken, base: { id: body.baseId } },
      sourceKey,
      body.revision,
      0,
    );
  await put(f, f.path + '/loreVariantBodies/' + id, { ...body, sourceKey });
  await assert.rejects(f.physical((await f.stores()).legacy), bad);
});
test('cohort probe discovers bodies under a missing generation header', async () => {
  const f = await fixture(),
    [oldPath, body] = rawBodies(f)[0],
    id = digest('missing-parent'),
    path = f.path + '/loreGenerations/' + id + '/loreVariantBodies/' + oldPath.split('/').at(-1);
  await put(f, path, body);
  assert.equal((await f.stores()).items.length, 0);
  await assert.rejects(f.probe(), bad);
});
test('copied cohort token in another campaign path refuses without reading content', async () => {
  const f = await fixture(),
    [oldPath, body] = rawBodies(f)[0],
    path = 'campaigns/foreign/loreVariantBodies/' + oldPath.split('/').at(-1);
  await put(f, path, body);
  f.metadataReads.length = 0;
  await assert.rejects(f.probe(), bad);
  assert.ok(f.metadataReads.every((r) => !r.fields.includes('content')));
});
test('known store catches contradictory cohort metadata excluded by the group filter', async () => {
  const f = await fixture(),
    [p] = rawBodies(f)[0];
  await patch(f, p, { campaignToken: '0'.repeat(64) });
  assert.equal((await f.probe()).items.length, 0);
  await assert.rejects(f.physical((await f.stores()).legacy), bad);
});
test('revoked referenced body stays unavailable with no manifest or textual hashes', async () => {
  const f = await fixture();
  await f.universe.deleteUniverseLore(uid, { universeId: 'world', id: 'hero' });
  await f.refresh();
  f.metadataReads.length = 0;
  const page = await f.physical((await f.stores()).legacy),
    coverage = await f.coverage(await ref(f));
  assert.equal(page.items[0].disposition, 'unavailable');
  assert.equal(coverage.outcome, 'unavailable');
  assert.ok(!('manifest' in coverage));
  assert.ok(
    f.metadataReads.every((r) =>
      r.fields.every((field) => !['name', 'manifest', 'content'].includes(field)),
    ),
  );
});
test('legacy implicit binding is routed by the native manifest rather than current header revision', async () => {
  const f = await fixture();
  await f.lore.removeCampaignLore(uid, {
    ...f.scope(),
    sourceKey: heroKey,
    expectedRevision: 1,
    operationId: 'implicit-remove-variant',
  });
  await patch(f, f.overlayPath() + heroKey, { bodyBinding: null });
  await f.refresh();
  const coverage = await f.coverage(await ref(f));
  assert.equal(coverage.manifest.bodyRevision, 1);
  assert.equal(coverage.parts[0].disposition, 'referenced');
});
test('operational preparing store is explicit and unreferenced bodies are never read', async () => {
  const f = await fixture(),
    id = await operational(f),
    [oldPath, body] = rawBodies(f)[0];
  await put(
    f,
    f.path + '/loreGenerations/' + id + '/loreVariantBodies/' + oldPath.split('/').at(-1),
    body,
  );
  f.metadataReads.length = 0;
  const stores = await f.stores(),
    s = stores.items.find((v) => v.scope === id);
  assert.equal(s.status, 'operational');
  assert.equal((await f.physical(s)).items[0].disposition, 'unreferenced');
  assert.ok(f.metadataReads.every((r) => !r.fields.includes('content')));
});
test('probe cursor uses full references so equal body IDs in different stores are not skipped', async () => {
  const f = await fixture(),
    id = await operational(f),
    [oldPath, body] = rawBodies(f)[0];
  await put(
    f,
    f.path + '/loreGenerations/' + id + '/loreVariantBodies/' + oldPath.split('/').at(-1),
    body,
  );
  const page = await f.probe({ limit: 1 }),
    next = await f.probe({ limit: 1, cursor: page.nextCursor });
  assert.equal(page.items[0].id, next.items[0].id);
  assert.notEqual(page.items[0].path, next.items[0].path);
  assert.equal(next.nextCursor, null);
  const parsed = JSON.parse(Buffer.from(page.nextCursor, 'base64url').toString('utf8'));
  assert.equal(parsed.after, page.items[0].path);
  assert.deepEqual(
    [page.items[0].path, next.items[0].path],
    [page.items[0].path, next.items[0].path].sort(),
  );
});
test('native identical body rewrite invalidates physical page and coverage proofs', async () => {
  const f = await fixture(),
    stores = await f.stores(),
    before = await f.physical(stores.legacy),
    coverage = await f.coverage(await ref(f)),
    [p, body] = rawBodies(f)[0];
  await patch(f, p, { content: body.content });
  const next = await f.coverage(await ref(f));
  assert.notEqual(next.coverageToken, coverage.coverageToken);
  assert.notEqual(next.parts[0].resourceToken, coverage.parts[0].resourceToken);
  await assert.rejects(
    f.physical(stores.legacy, { expectedPageToken: before.pageToken }),
    (e) => e.details?.reason === 'campaign-backup-page-changed',
  );
});
test('stores paginate all headers with lookahead and bind limits and native changes', async () => {
  const f = await fixture();
  for (let index = 0; index < 31; index++) await operational(f, digest('store-' + index));
  const all = [];
  let cursor = null;
  do {
    const p = await f.stores({ limit: 7, cursor });
    all.push(...p.items);
    cursor = p.nextCursor;
  } while (cursor);
  assert.equal(all.length, 31);
  assert.deepEqual(
    all.map((v) => v.scope),
    all.map((v) => v.scope).sort(),
  );
  const first = await f.stores({ limit: 1 });
  await assert.rejects(
    f.stores({ limit: 2, cursor: first.nextCursor }),
    (e) => e.code === 'invalid-argument',
  );
  await patch(f, f.path + '/loreGenerations/' + all[1].scope, { state: 'ready' });
  await assert.rejects(
    f.stores({ limit: 1, expectedPageToken: first.pageToken }),
    (e) => e.details?.reason === 'campaign-backup-page-changed',
  );
});
test('multichunk physical pages and coverage preserve complete ordered coordinates', async () => {
  const f = await fixture(true, entity({ details: '🐉'.repeat(30000) })),
    stores = await f.stores(),
    all = [];
  let cursor = null;
  do {
    const p = await f.physical(stores.legacy, { limit: 1, cursor });
    all.push(...p.items);
    cursor = p.nextCursor;
  } while (cursor);
  const coverage = await f.coverage(await ref(f));
  assert.ok(all.length > 1);
  assert.deepEqual(
    all.map((v) => v.id),
    all.map((v) => v.id).sort(),
  );
  assert.deepEqual(
    [...coverage.parts].sort((a, b) => a.id.localeCompare(b.id)),
    all,
  );
});
test('malformed coordinates and wrong document keys cannot be accepted', async () => {
  for (const update of [{ revision: 0 }, { index: -1 }, { baseId: 'bad' }, { sourceKey: 'bad' }]) {
    const f = await fixture(),
      [p] = rawBodies(f)[0];
    await patch(f, p, update);
    await assert.rejects(f.physical((await f.stores()).legacy), bad);
  }
});
test('metadata-only physical reader and coverage never write or read plaintext', async () => {
  const f = await fixture(),
    before = structuredClone([...f.records]);
  f.metadataReads.length = 0;
  const deny = () => assert.fail('Physical readers cannot write or full-read documents');
  const db = {
      ...f.db,
      runTransaction: (cb) =>
        f.db.runTransaction((tx) =>
          cb({
            ...tx,
            set: deny,
            create: deny,
            update: deny,
            delete: deny,
            get: (q) => {
              assert.ok(q.collectionPath || q.groupName);
              return tx.get(q);
            },
          }),
        ),
    },
    api = createCampaignBackupLoreInventoryService({ db }),
    s = await api.listCampaignBackupLoreStores(uid, f.anchor),
    unit = await ref(f);
  await api.listCampaignBackupLoreBodies(uid, {
    ...f.anchor,
    scope: 'legacy',
    storeToken: s.legacy.storeToken,
  });
  await api.probeCampaignBackupLoreBodies(uid, f.anchor);
  await api.getCampaignBackupLoreBodyCoverage(uid, {
    ...f.anchor,
    id: unit.id,
    variantToken: unit.variantToken,
  });
  assert.ok(
    f.metadataReads.every((r) =>
      r.fields.every((k) => !['name', 'title', 'content', 'details'].includes(k)),
    ),
  );
  assert.deepEqual([...f.records], before);
  assert.ok(f.groupReads.every((r) => r.maximum <= 26 && !r.fields.includes('content')));
});
test('closed inputs, scope tokens and detached requests refuse cross-store calls', async () => {
  const f = await fixture(),
    s = (await f.stores()).legacy;
  for (const extra of [
    { scope: '../x' },
    { path: 'hidden' },
    { limit: 0 },
    { storeToken: '0'.repeat(64) },
  ])
    await assert.rejects(
      f.physical(s, extra),
      (e) => e.code === 'invalid-argument' || e.code === 'failed-precondition',
    );
  const input = { ...f.anchor, scope: 'legacy', storeToken: s.storeToken },
    pending = f.inventory.listCampaignBackupLoreBodies(uid, input);
  input.scope = digest('other-store');
  input.storeToken = '0'.repeat(64);
  assert.equal((await pending).items[0].disposition, 'referenced');
});
test('C4, account, stale source/derived and active adoption precede physical scope', async () => {
  const f = await fixture();
  await assert.rejects(
    f.inventory.listCampaignBackupLoreStores('foreign', f.anchor),
    (e) => e.code === 'not-found',
  );
  await assert.rejects(f.stores({ sourceToken: '0'.repeat(64) }), bad);
  await assert.rejects(f.probe({ derivedToken: '0'.repeat(64) }), bad);
  await put(f, loreGuardPath(uid, f.id, f.campaignToken), {
    schemaVersion: 1,
    ownerId: uid,
    campaignId: f.id,
    campaignToken: f.campaignToken,
    admissionEpoch: 1,
    adoptionId: 'pending',
  });
  await assert.rejects(f.stores(), (e) => e.details?.reason === 'adoption-in-progress');
  await patch(f, f.path, { deleting: true });
  await assert.rejects(
    f.probe(),
    (e) => e.code === 'not-found' || e.code === 'failed-precondition',
  );
});
test('index configuration adds only cohort lookup and preserves collection indexes and content exemption', async () => {
  const config = JSON.parse(
      await readFile(new URL('../../firestore.indexes.json', import.meta.url), 'utf8'),
    ),
    fields = config.fieldOverrides.filter((v) => v.collectionGroup === 'loreVariantBodies');
  assert.deepEqual(fields.find((v) => v.fieldPath === 'content').indexes, []);
  assert.deepEqual(fields.find((v) => v.fieldPath === 'campaignToken').indexes, [
    { order: 'ASCENDING', queryScope: 'COLLECTION' },
    { order: 'DESCENDING', queryScope: 'COLLECTION' },
    { order: 'ASCENDING', queryScope: 'COLLECTION_GROUP' },
  ]);
});

test('historical store rejects a well-formed body whose base differs from its generation header', async () => {
  const f = await fixture(),
    otherBase = digest('different-generation-base'),
    id = await operational(f, digest('other-base-store'), otherBase),
    [path, body] = rawBodies(f)[0];
  await put(
    f,
    f.path + '/loreGenerations/' + id + '/loreVariantBodies/' + path.split('/').at(-1),
    body,
  );
  const store = (await f.stores()).items.find((v) => v.scope === id);
  await assert.rejects(f.physical(store), bad);
});
