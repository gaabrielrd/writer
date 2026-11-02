import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createCampaignLoreService } from '../src/campaignLore.mjs';
import { createCampaignVariantRecoveryService } from '../src/campaignVariantRecovery.mjs';
import { entityInput, digest, variantChunkId } from '../src/campaignLoreContracts.mjs';
import {
  uid,
  campaignId,
  baseId,
  adventureId,
  universeId,
  basePath,
  campaignPath,
  key,
  op,
  entity,
  seedLoreRecords,
  header,
  seal,
} from './helpers/campaignLore.mjs';
const reason = (name) => (error) => error.details?.reason === name;
async function fixture() {
  const f = studioDb();
  for (const [path, value] of seedLoreRecords()) f.records.set(path, value);
  const api = createCampaignLoreService({ db: f.db, now: () => 100 }),
    recovery = createCampaignVariantRecoveryService({ db: f.db });
  const initial = await api.listCampaignLore(uid, { campaignId, baseId }),
    scope = { campaignId, baseId, campaignToken: initial.campaignToken };
  const prepare = (name, revision = 0, sourceKey = key('a'), relatedSourceKeys = []) =>
    recovery.prepareCampaignLoreVariant(uid, {
      ...header(scope, name, revision, sourceKey),
      relatedSourceKeys,
    });
  const save = async (name, revision = 0, value = entity(), sourceKey = key('a')) => {
    const request = {
      ...header(scope, name, revision, sourceKey),
      relatedSourceKeys: [...new Set(value.relations.map((relation) => relation.targetKey))].sort(),
    };
    const prepared = await recovery.prepareCampaignLoreVariant(uid, request),
      input = { ...request, sealed: seal(prepared, value) };
    return { input, prepared, result: await api.saveCampaignLoreVariant(uid, input) };
  };
  const read = (sourceKey = key('a')) => api.getCampaignLore(uid, { ...scope, sourceKey });
  return { ...f, api, recovery, scope, prepare, save, read };
}
test('whole variants retain exact text, leave base/global/notes untouched and preserve bodyRevision through remove/restore before discard', async () => {
  const f = await fixture(),
    original = structuredClone([...f.records]),
    saved = await f.save('create');
  assert.equal(saved.result.item.entity.details, entity().details);
  assert.equal(saved.result.item.revision, 1);
  assert.equal(saved.result.collectionRevision, 1);
  const manifest = f.records.get(campaignPath + '/loreVariants/' + key('a')).manifest;
  const removed = await f.api.removeCampaignLore(uid, header(f.scope, 'remove', 1));
  assert.equal(removed.item.mode, 'removed');
  assert.equal(removed.item.entity, null);
  assert.equal(removed.item.entityHash, null);
  assert.deepEqual(f.records.get(campaignPath + '/loreVariants/' + key('a')).manifest, manifest);
  const list = await f.api.listCampaignLore(uid, { ...f.scope, view: 'removed' });
  assert.equal(list.items[0].name, entity().name);
  const restored = await f.api.restoreCampaignLore(uid, header(f.scope, 'restore', 2));
  assert.equal(restored.item.mode, 'override');
  assert.equal(restored.item.revision, 3);
  assert.equal(restored.item.entity.details, entity().details);
  const discarded = await f.api.discardCampaignLoreVariant(uid, header(f.scope, 'discard', 3));
  assert.equal(discarded.item.mode, 'base');
  assert.equal(discarded.item.revision, 4);
  assert.equal(discarded.item.entity.name, 'Ficha congelada a');
  assert.equal(
    [...f.records.keys()].some((path) => path.includes('/loreVariantBodies/')),
    false,
  );
  for (const [path, value] of original) assert.deepEqual(f.records.get(path), value);
  await assert.rejects(
    f.api.saveCampaignLoreVariant(uid, saved.input),
    reason('revision-conflict'),
  );
});
test('base removal restores base, incompatible actions do not write and revision never resets after discard', async () => {
  const f = await fixture();
  await assert.rejects(f.api.restoreCampaignLore(uid, header(f.scope, 'invalid')), {
    code: 'failed-precondition',
  });
  await f.api.removeCampaignLore(uid, header(f.scope, 'remove'));
  assert.equal(
    (await f.api.restoreCampaignLore(uid, header(f.scope, 'restore', 1))).item.mode,
    'base',
  );
  await assert.rejects(f.prepare('old-zero'), reason('revision-conflict'));
  const saved = await f.save('new', 2);
  assert.equal(saved.result.item.revision, 3);
});
test('replay keeps the same key after own and later edits, compares own confirmation only, and sealed bytes are immutable', async () => {
  const f = await fixture(),
    first = await f.save('first');
  assert.equal((await f.prepare('first')).key, first.prepared.key);
  await f.save('other', 0, entity({ name: 'Outra ficha' }), key('b'));
  const replay = await f.api.saveCampaignLoreVariant(uid, first.input);
  assert.equal(replay.collectionRevision, 2);
  assert.equal(replay.item.revision, 1);
  await assert.rejects(
    f.api.saveCampaignLoreVariant(uid, { ...first.input, sealed: seal(first.prepared, entity()) }),
    { code: 'invalid-argument' },
  );
  await f.save('later', 1, entity({ details: 'Posterior' }));
  assert.equal((await f.prepare('first')).key, first.prepared.key);
  await assert.rejects(
    f.api.saveCampaignLoreVariant(uid, first.input),
    reason('revision-conflict'),
  );
});
test('racing CAS preserves one complete variant and rejects nonce/AAD/identity tampering before writes', async () => {
  const f = await fixture(),
    a = await f.prepare('a'),
    b = await f.prepare('b');
  const inputs = [a, b].map((prepared) => ({
    ...header(f.scope, prepared.operationId === op('a') ? 'a' : 'b'),
    relatedSourceKeys: [],
    sealed: seal(prepared, entity()),
  }));
  const malformed = structuredClone(inputs[0]);
  malformed.sealed.nonce = Buffer.alloc(12).toString('base64');
  await assert.rejects(f.api.saveCampaignLoreVariant(uid, malformed), { code: 'invalid-argument' });
  const results = await Promise.allSettled(
    inputs.map((input) => f.api.saveCampaignLoreVariant(uid, input)),
  );
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(
    results.find((result) => result.status === 'rejected').reason.details.reason,
    'revision-conflict',
  );
  const c = await f.prepare('aad', 1),
    badAAD = {
      ...header(f.scope, 'aad', 1),
      relatedSourceKeys: [],
      sealed: seal(c, entity(), undefined, Buffer.from('other')),
    };
  await assert.rejects(f.api.saveCampaignLoreVariant(uid, badAAD), { code: 'invalid-argument' });
  assert.equal((await f.read()).item.revision, 1);
});
test('relations use effective captured names, retain multiple types, and revoked/removed targets block keys but do not block projected restore/discard', async () => {
  const f = await fixture(),
    relations = ['friend', 'rival'].map((relationType) => ({
      targetKey: key('b'),
      relationType,
      description: 'Descrição ' + relationType,
    }));
  const first = await f.save('relations', 0, entity({ relations }));
  assert.equal(first.result.item.entity.relations.length, 2);
  assert.equal(first.result.item.entity.relations[0].targetName, 'Ficha congelada b');
  await f.save('rename-target', 0, entity({ name: 'Nome efetivo da mesa' }), key('b'));
  assert.equal((await f.read()).item.entity.relations[0].targetName, 'Nome efetivo da mesa');
  await f.api.removeCampaignLore(uid, header(f.scope, 'remove-target', 1, key('b')));
  assert.deepEqual((await f.read()).item.entity.relations, []);
  await assert.rejects(
    f.recovery.prepareCampaignLoreVariant(uid, {
      ...header(f.scope, 'relations'),
      relatedSourceKeys: [key('b')],
    }),
    { code: 'not-found' },
  );
  await f.api.removeCampaignLore(uid, header(f.scope, 'remove-source', 1));
  assert.equal(
    (await f.api.restoreCampaignLore(uid, header(f.scope, 'restore-source', 2))).item.entity
      .relations.length,
    0,
  );
  assert.equal(
    (await f.api.discardCampaignLoreVariant(uid, header(f.scope, 'discard-source', 3))).item.mode,
    'base',
  );
  const prepared = await f.prepare('mismatch', 4);
  await assert.rejects(
    f.api.saveCampaignLoreVariant(uid, {
      ...header(f.scope, 'mismatch', 4),
      relatedSourceKeys: [],
      sealed: seal(prepared, entity({ relations })),
    }),
    { code: 'invalid-argument' },
  );
});
test('resolve confirm never fabricates receipt, explicit cancellation fences old saves, and cleanup works without origin or root', async () => {
  const f = await fixture(),
    prepared = await f.prepare('pending'),
    headerInput = { ...header(f.scope, 'pending'), action: 'save', relatedSourceKeys: [] };
  await assert.rejects(
    f.recovery.resolveCampaignLoreOperation(uid, { ...headerInput, intent: 'confirm' }),
    reason('operation-unconfirmed'),
  );
  assert.equal(
    f.records.get(`users/${uid}/campaignVariantOperations/${op('pending')}`).state,
    'prepared',
  );
  f.records.delete('adventures/' + adventureId);
  const canceled = await f.recovery.resolveCampaignLoreOperation(uid, {
    ...headerInput,
    intent: 'cancel',
  });
  assert.equal(canceled.state, 'canceled');
  assert.equal(canceled.revision, null);
  assert.equal('key' in canceled, false);
  assert.equal(
    'key' in f.records.get(`users/${uid}/campaignVariantOperations/${op('pending')}`),
    false,
  );
  f.records.delete(campaignPath);
  assert.deepEqual(
    await f.recovery.resolveCampaignLoreOperation(uid, { ...headerInput, intent: 'confirm' }),
    canceled,
  );
  assert.ok(prepared.key);
});
test('committed resolution echoes identity without body or key and closes key after receipt, without requiring origin', async () => {
  const f = await fixture(),
    saved = await f.save('committed');
  f.records.delete('adventures/' + adventureId);
  const input = {
      ...header(f.scope, 'committed'),
      relatedSourceKeys: [],
      action: 'save',
      intent: 'confirm',
    },
    closed = await f.recovery.resolveCampaignLoreOperation(uid, input);
  assert.equal(closed.state, 'committed');
  assert.equal(closed.revision, 1);
  assert.equal(closed.sourceKey, key('a'));
  assert.equal(closed.ownerId, uid);
  assert.equal('key' in closed, false);
  assert.equal('entity' in closed, false);
  assert.deepEqual(await f.recovery.resolveCampaignLoreOperation(uid, input), closed);
  assert.equal(
    'key' in f.records.get(`users/${uid}/campaignVariantOperations/${op('committed')}`),
    false,
  );
  assert.equal(saved.result.item.mode, 'override');
});
test('an operation never received can be explicitly fenced after the root disappears or is recreated, while confirm never writes', async () => {
  const f = await fixture(),
    input = { ...header(f.scope, 'never-received'), relatedSourceKeys: [], action: 'save' };
  f.records.delete(campaignPath);
  await assert.rejects(
    f.recovery.resolveCampaignLoreOperation(uid, { ...input, intent: 'confirm' }),
    reason('operation-unconfirmed'),
  );
  assert.equal(
    f.records.has(`users/${uid}/campaignVariantOperations/${op('never-received')}`),
    false,
  );
  const canceled = await f.recovery.resolveCampaignLoreOperation(uid, {
    ...input,
    intent: 'cancel',
  });
  assert.equal(canceled.state, 'canceled');
  assert.equal(f.records.has(campaignPath), false);
  f.records.set(campaignPath, seedLoreRecords().get(campaignPath));
  assert.deepEqual(
    await f.recovery.resolveCampaignLoreOperation(uid, { ...input, intent: 'cancel' }),
    canceled,
  );
});
test('SDK-equivalent field masks exclude bodies and forbidden gates precede any chunk read', async () => {
  const f = await fixture();
  await f.save('private');
  const reads = [],
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (work) =>
    run((tx) =>
      work(
        new Proxy(tx, {
          get(target, property) {
            if (property !== 'get') return target[property];
            return (ref) => {
              if (ref.path) reads.push(ref.path);
              return target.get(ref);
            };
          },
        }),
      ),
    );
  f.records.delete('universes/world/lore/a');
  assert.equal((await f.read()).item, null);
  await assert.rejects(f.prepare('private'), { code: 'not-found' });
  assert.equal(
    reads.some((path) => path.includes('/loreVariantBodies/') || path.includes('/bodies/')),
    false,
  );
});
test('list scans bounded metadata windows including empty ones and invalidates changed collection/projection/UID scopes', async () => {
  const f = await fixture(),
    sorted = [key('a'), key('b'), key('c')].sort();
  await f.api.removeCampaignLore(uid, header(f.scope, 'remove-first', 0, sorted[0]));
  const first = await f.api.listCampaignLore(uid, { ...f.scope, limit: 1 });
  assert.equal(first.items.length, 0);
  assert.ok(first.nextCursor);
  const next = await f.api.listCampaignLore(uid, {
    ...f.scope,
    limit: 1,
    cursor: first.nextCursor,
  });
  assert.equal(next.items[0].sourceKey, sorted[1]);
  for (const query of f.reads.filter((query) => query.collectionPath === basePath + '/items')) {
    assert.equal(query.maximum <= 51, true);
    assert.ok(query.fields.includes('structured.category'));
    assert.equal(query.fields.includes('fields'), false);
    assert.equal(query.fields.includes('structured'), false);
  }
  await f.api.restoreCampaignLore(uid, header(f.scope, 'restore-first', 1, sorted[0]));
  await assert.rejects(
    f.api.listCampaignLore(uid, { ...f.scope, limit: 1, cursor: first.nextCursor }),
    reason('cursor-invalidated'),
  );
  const page = await f.api.listCampaignLore(uid, { ...f.scope, limit: 1 });
  f.records.get('universes/' + universeId).privacyVersion++;
  await assert.rejects(
    f.api.listCampaignLore(uid, { ...f.scope, cursor: page.nextCursor }),
    reason('cursor-invalidated'),
  );
});
test('authorization rejects source/owner/schema loss before variant/base body reads and exact tokens reject recreated campaign roots', async () => {
  const f = await fixture(),
    first = await f.save('private');
  await assert.rejects(f.api.getCampaignLore('other', { ...f.scope, sourceKey: key('a') }), {
    code: 'not-found',
  });
  f.records.delete('universes/world/lore/a');
  assert.equal((await f.read()).item, null);
  await assert.rejects(f.prepare('private'), { code: 'not-found' });
  f.records.set('universes/world/lore/a', { name: 'Existente' });
  const root = structuredClone(f.records.get(campaignPath));
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(campaignPath)));
  await f.db.runTransaction(async (tx) => tx.create(f.db.doc(campaignPath), root));
  await assert.rejects(f.read(), reason('campaign-changed'));
  await assert.rejects(
    f.api.listCampaignLore(uid, { campaignId, baseId }),
    reason('campaign-changed'),
  );
  assert.equal(first.result.item.entity.name, entity().name);
});
test('entity/descriptor bounds and manifest corruption never truncate or fabricate absent fields; stored metadata agrees with canonical body', async () => {
  const f = await fixture();
  for (const patch of [
    { name: '\ud800' },
    { details: '\ud800' },
    { isPublic: true },
    { aliases: Array(21).fill('alias') },
    { category: 'future' },
    { details: 'x'.repeat(150001) },
  ])
    assert.throws(() => entityInput(entity(patch), key('a')), { code: 'invalid-argument' });
  await assert.rejects(f.prepare('unsorted', 0, key('a'), [key('c'), key('b')].sort().reverse()), {
    code: 'invalid-argument',
  });
  const saved = await f.save(
    'large',
    0,
    entity({
      details: '漢'.repeat(120000),
      structuredDetails: {
        appearance: '🐉'.repeat(50000),
        personality: '',
        history: '',
        notes: '',
      },
    }),
  );
  assert.equal((await f.read()).item.entity.details.length, 120000);
  const overlay = f.records.get(campaignPath + '/loreVariants/' + key('a'));
  overlay.name = 'Metadado divergente';
  await assert.rejects(f.read(), { code: 'failed-precondition' });
  overlay.name = saved.result.item.entity.name;
  const chunkId = variantChunkId(
    { campaignToken: f.scope.campaignToken, base: { id: baseId } },
    key('a'),
    overlay.manifest.bodyRevision,
    0,
  );
  f.records.get(campaignPath + '/loreVariantBodies/' + chunkId).content += 'corruption';
  await assert.rejects(f.read(), { code: 'failed-precondition' });
  const baseItem = f.records.get(basePath + '/items/' + key('b'));
  baseItem.fields = baseItem.fields.filter((field) => field.field !== 'summary');
  await assert.rejects(f.read(key('b')), { code: 'failed-precondition' });
  assert.match(digest('proof'), /^[a-f0-9]{64}$/);
});
