import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createStudioService } from '../src/studio.mjs';
import { createAdventureLoreService } from '../src/adventureLore.mjs';
import { mutationInput, adventureLoreRequestHash } from '../src/adventureLoreContracts.mjs';
const uid = 'author',
  adventureId = 'adventure-lore-service',
  path = 'adventures/' + adventureId;
const op = (n) => 'adventure-lore-operation-' + n;
const reason = (r) => (e) => e.details?.reason === r;
const entity = (extra = {}) => ({
  name: '  Minha ficha  ',
  aliases: ['  Alias  '],
  category: 'character',
  summary: ' Resumo ',
  details: '  Prosa 🐉\n',
  structuredDetails: { appearance: '', personality: '', history: '', notes: ' nota ' },
  relations: [],
  isPublic: false,
  ...extra,
});
async function fixture(world = false) {
  const f = studioDb();
  if (world)
    f.records.set('universes/world', {
      authorId: uid,
      deleting: false,
      loreVersion: 0,
      privacyVersion: 0,
      adventureCount: 0,
      updatedAt: 1,
    });
  await createStudioService({ db: f.db, now: () => 100 }).createAdventure(uid, {
    operationId: adventureId,
    title: 'Aventura',
    ...(world ? { universeId: 'world' } : {}),
  });
  const api = createAdventureLoreService({ db: f.db, now: () => 200 });
  const first = await api.listAdventureLore(uid, { adventureId, scope: 'adventure' });
  return { ...f, api, scope: { adventureId, adventureToken: first.adventureToken } };
}
const input = (f, n, col = 0, extra = {}) => ({
  ...f.scope,
  entityId: op(n),
  operationId: op(n),
  expectedRevision: 0,
  expectedCollectionRevision: col,
  entity: entity(),
  ...extra,
});
const list = (f, extra = {}) =>
  f.api.listAdventureLore(uid, { ...f.scope, scope: 'adventure', ...extra });
const get = (f, row, page) =>
  f.api.getAdventureLore(uid, {
    ...f.scope,
    reference: row.reference,
    expectedContextToken: page.contextToken,
    expectedEntityToken: row.entityToken,
  });
const globalEntity = (extra = {}) => ({
  ...entity({ name: 'Global', isPublic: true }),
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});
test('private exact prose, metadata-only lists/receipts, monotonic clocks and historical create never resurrect deleted IDs', async () => {
  const f = await fixture(),
    r = input(f, 'first'),
    saved = await f.api.saveAdventureLore(uid, r);
  assert.deepEqual(saved.receipt, {
    operationId: r.operationId,
    action: 'save',
    entityId: r.entityId,
    expectedRevision: 0,
    revision: 1,
    collectionRevision: 1,
  });
  assert.equal(JSON.stringify(saved).includes('Prosa'), false);
  const p = await list(f),
    row = p.items[0];
  assert.equal(row.relationCount, 0);
  assert.equal(row.name, 'Minha ficha');
  assert.equal('relations' in row, false);
  assert.equal('details' in row, false);
  const got = await get(f, row, p);
  assert.equal(got.item.details, r.entity.details);
  assert.deepEqual(got.item.structuredDetails, r.entity.structuredDetails);
  assert.equal(f.records.get(path).loreVersion, 1);
  assert.equal(f.records.get('users/author/campaignAuthorization/current').epoch, 1);
  await f.api.deleteAdventureLore(uid, {
    ...f.scope,
    entityId: r.entityId,
    operationId: op('delete'),
    expectedRevision: 1,
    expectedCollectionRevision: 1,
  });
  assert.deepEqual(await f.api.saveAdventureLore(uid, r), saved);
  assert.deepEqual((await list(f)).items, []);
  assert.equal(f.records.has(path + '/loreBodies/' + r.entityId), false);
  const tomb = f.records.get(path + '/lore/' + r.entityId);
  assert.equal(tomb.deleted, true);
  for (const k of ['name', 'summary', 'aliases', 'relationCount']) assert.equal(k in tomb, false);
  await assert.rejects(
    f.api.saveAdventureLore(
      uid,
      input(f, 'recreate', 2, { entityId: r.entityId, expectedRevision: 2 }),
    ),
    { code: 'not-found' },
  );
  assert.equal(f.records.get('users/author/campaignAuthorization/current').epoch, 2);
});
test('cancel fence wins late save, receipts win resolver, request hashes and descriptors cannot be reused', async () => {
  const f = await fixture(),
    raw = input(f, 'canceled'),
    r = mutationInput(uid, raw, 'save');
  const resolve = {
    ...f.scope,
    entityId: r.entityId,
    operationId: r.operationId,
    expectedRevision: 0,
    expectedCollectionRevision: 0,
    action: 'save',
    requestHash: adventureLoreRequestHash('save', r),
    intent: 'cancel',
  };
  const result = await f.api.resolveAdventureLoreOperation(uid, resolve);
  assert.equal(result.kind, 'canceled');
  assert.deepEqual(await f.api.saveAdventureLore(uid, raw), result);
  assert.equal(f.records.has(path + '/lore/' + r.entityId), false);
  assert.equal('requestHash' in result, false);
  await assert.rejects(
    f.api.resolveAdventureLoreOperation(uid, { ...resolve, requestHash: 'b'.repeat(64) }),
    { code: 'invalid-argument' },
  );
  const savedRaw = input(f, 'saved'),
    saved = await f.api.saveAdventureLore(uid, savedRaw);
  const savedR = mutationInput(uid, savedRaw, 'save');
  assert.deepEqual(
    await f.api.resolveAdventureLoreOperation(uid, {
      ...resolve,
      entityId: savedR.entityId,
      operationId: savedR.operationId,
      requestHash: adventureLoreRequestHash('save', savedR),
    }),
    saved,
  );
  await assert.rejects(
    f.api.saveAdventureLore(uid, { ...savedRaw, entity: entity({ details: 'Outro' }) }),
    { code: 'invalid-argument' },
  );
});
test('two collection CAS writers have one winner, stale item revision cannot overwrite and errors preserve records', async () => {
  const f = await fixture();
  const results = await Promise.allSettled([
    f.api.saveAdventureLore(uid, input(f, 'a')),
    f.api.saveAdventureLore(uid, input(f, 'b')),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    results.find((r) => r.status === 'rejected').reason.details.reason,
    'revision-conflict',
  );
  const row = (await list(f)).items[0],
    before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.saveAdventureLore(
      uid,
      input(f, 'edit', 1, { entityId: row.reference.entityId, expectedRevision: 0 }),
    ),
    { code: 'invalid-argument' },
  );
  await assert.rejects(
    f.api.saveAdventureLore(
      uid,
      input(f, 'edit', 0, { entityId: row.reference.entityId, expectedRevision: 1 }),
    ),
    reason('revision-conflict'),
  );
  assert.deepEqual([...f.records], before);
});
test('bounded pages use one context and invalidate after local mutation, association or isolated authorization bump', async () => {
  const f = await fixture();
  for (let n = 0; n < 27; n++)
    await f.api.saveAdventureLore(
      uid,
      input(f, 'page-' + String(n).padStart(2, '0'), n, {
        entity: entity({ name: 'N' + String(n).padStart(2, '0') }),
      }),
    );
  const p = await list(f);
  assert.equal(p.items.length, 25);
  assert.ok(p.nextCursor);
  const p2 = await list(f, { cursor: p.nextCursor });
  assert.equal(p2.items.length, 2);
  assert.equal(p2.nextCursor, null);
  assert.equal(p.contextToken, p2.contextToken);
  assert.ok(f.reads.every((r) => r.maximum <= 51));
  f.records.set('users/author/campaignAuthorization/current', {
    ...f.records.get('users/author/campaignAuthorization/current'),
    epoch: 100,
  });
  await assert.rejects(list(f, { cursor: p.nextCursor }), reason('cursor-invalidated'));
  await assert.rejects(get(f, p.items[0], p), reason('cursor-invalidated'));
  const current = await list(f);
  f.records.set(path, { ...f.records.get(path), universeId: 'world' });
  await assert.rejects(get(f, current.items[0], current), reason('cursor-invalidated'));
  assert.equal((await list(f)).items.length, 25);
});
test('global pagination keeps old missing deleted fields; empty scanned windows continue and contextual get is exact', async () => {
  const f = await fixture(true);
  for (let n = 0; n < 27; n++)
    f.records.set(
      'universes/world/lore/g' + n,
      globalEntity({
        name: 'G' + String(n).padStart(2, '0'),
        ...(n < 25 ? { deleting: true } : {}),
      }),
    );
  const p = await list(f, { scope: 'universe' });
  assert.deepEqual(p.items, []);
  assert.ok(p.nextCursor);
  const p2 = await list(f, { scope: 'universe', cursor: p.nextCursor });
  assert.equal(p2.items.length, 2);
  assert.equal('revision' in p2.items[0], false);
  const got = await get(f, p2.items[0], p2);
  assert.equal(got.item.details, entity().details);
  f.records.set('universes/world/lore/g25', globalEntity({ name: 'G25', isPublic: 'yes' }));
  await assert.rejects(
    list(f, { scope: 'universe', cursor: p.nextCursor }),
    reason('lore-inconsistent'),
  );
});
test('global relations only authorize current context; local relations retain exact unavailable descriptor multiplicity after unlink', async () => {
  const f = await fixture(true);
  f.records.set(
    'universes/world/lore/global',
    globalEntity({
      relations: [
        {
          targetEntityId: 'universe:old-world:hidden',
          relationType: 'antiga',
          description: 'própria',
        },
        { targetEntityId: 'universe:world:target', relationType: 'atual', description: 'própria2' },
      ],
    }),
  );
  f.records.set('universes/world/lore/target', globalEntity({ name: 'Alvo' }));
  const gp = await list(f, { scope: 'universe' }),
    g = gp.items.find((v) => v.reference.entityId === 'global');
  assert.deepEqual(
    (await get(f, g, gp)).item.relations.map((r) => r.available),
    [false, true],
  );
  const rel = {
    targetEntityId: 'universe:world:global',
    relationType: 'Conhece',
    description: '  Texto próprio  ',
  };
  const r = input(f, 'relation', 0, { entity: entity({ relations: [rel, rel] }) });
  await f.api.saveAdventureLore(uid, r);
  f.records.set(path, { ...f.records.get(path), universeId: null });
  const p = await list(f),
    item = await get(f, p.items[0], p);
  assert.equal(item.item.relationCount, 2);
  assert.deepEqual(item.item.relations, [
    { ...rel, available: false },
    { ...rel, available: false },
  ]);
  const edit = input(f, 'own-edit', 1, {
    entityId: r.entityId,
    expectedRevision: 1,
    entity: entity({ details: 'Nova prosa', relations: [rel, rel] }),
  });
  await f.api.saveAdventureLore(uid, edit);
  await assert.rejects(
    f.api.saveAdventureLore(uid, {
      ...edit,
      operationId: op('duplicate'),
      expectedRevision: 2,
      expectedCollectionRevision: 2,
      entity: entity({ relations: [rel, rel, rel] }),
    }),
    { code: 'permission-denied' },
  );
  await assert.rejects(
    f.api.saveAdventureLore(uid, {
      ...edit,
      operationId: op('changed'),
      expectedRevision: 2,
      expectedCollectionRevision: 2,
      entity: entity({ relations: [{ ...rel, description: 'Alterado' }] }),
    }),
    { code: 'permission-denied' },
  );
  await f.api.saveAdventureLore(uid, {
    ...edit,
    operationId: op('remove-rel'),
    expectedRevision: 2,
    expectedCollectionRevision: 2,
    entity: entity(),
  });
  assert.equal((await list(f, { scope: 'universe' })).items.length, 0);
});
test('foreign adventure relation cannot be retained from a corrupted old body and self relations fail', async () => {
  const f = await fixture(),
    r = input(f, 'foreign');
  await f.api.saveAdventureLore(uid, r);
  const foreign = {
    targetEntityId: 'adventure:foreign-adventure-id:foreign-entity-long',
    relationType: 'tipo',
    description: 'própria',
  };
  const meta = f.records.get(path + '/lore/' + r.entityId);
  f.records.set(path + '/lore/' + r.entityId, { ...meta, relationCount: 1 });
  const body = f.records.get(path + '/loreBodies/' + r.entityId);
  f.records.set(path + '/loreBodies/' + r.entityId, { ...body, relations: [foreign] });
  await assert.rejects(
    f.api.saveAdventureLore(
      uid,
      input(f, 'foreign-retain', 1, {
        entityId: r.entityId,
        expectedRevision: 1,
        entity: entity({ relations: [foreign] }),
      }),
    ),
    { code: 'permission-denied' },
  );
  const self = { ...foreign, targetEntityId: 'adventure:' + adventureId + ':' + r.entityId };
  await assert.rejects(
    f.api.saveAdventureLore(
      uid,
      input(f, 'self', 1, {
        entityId: r.entityId,
        expectedRevision: 1,
        entity: entity({ relations: [self] }),
      }),
    ),
    { code: 'invalid-argument' },
  );
});
test('owner/token/root gates precede body reads, empty loreVersion cannot mask existing data and malformed bodies fail closed', async () => {
  const f = await fixture(),
    r = input(f, 'gate');
  await f.api.saveAdventureLore(uid, r);
  const p = await list(f),
    request = {
      ...f.scope,
      reference: p.items[0].reference,
      expectedContextToken: p.contextToken,
      expectedEntityToken: p.items[0].entityToken,
    };
  const reads = [];
  const original = f.db.runTransaction;
  f.db.runTransaction = (operation) =>
    original((tx) =>
      operation({
        ...tx,
        get: async (ref) => {
          reads.push(ref.path);
          return tx.get(ref);
        },
      }),
    );
  await assert.rejects(f.api.getAdventureLore('intruder', request), { code: 'not-found' });
  await assert.rejects(
    f.api.getAdventureLore(uid, { ...request, adventureToken: 'b'.repeat(64) }),
    reason('adventure-changed'),
  );
  assert.equal(
    reads.some((p) => p?.includes('/loreBodies/')),
    false,
  );
  const root = f.records.get(path);
  f.records.set(path, { ...root, deleting: true });
  await assert.rejects(f.api.getAdventureLore(uid, request), { code: 'not-found' });
  f.records.set(path, { ...root, loreVersion: undefined });
  await assert.rejects(list(f), reason('lore-inconsistent'));
  f.records.set(path, root);
  const b = f.records.get(path + '/loreBodies/' + r.entityId);
  f.records.set(path + '/loreBodies/' + r.entityId, { ...b, revision: 2 });
  await assert.rejects(get(f, p.items[0], p), reason('lore-inconsistent'));
  f.records.set(path + '/loreBodies/' + r.entityId, b);
  await f.db.runTransaction(async (tx) => {
    tx.delete(f.db.doc(path));
    tx.create(f.db.doc(path), root);
  });
  await assert.rejects(list(f), reason('adventure-changed'));
});
test('overflow revisions and invalid monotonic timestamps do not mutate root or receipt', async () => {
  const f = await fixture();
  f.records.set(path, { ...f.records.get(path), loreVersion: Number.MAX_SAFE_INTEGER });
  const before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.saveAdventureLore(uid, input(f, 'overflow', Number.MAX_SAFE_INTEGER)),
    reason('lore-inconsistent'),
  );
  assert.deepEqual([...f.records], before);
  f.records.set(path, { ...f.records.get(path), loreVersion: 0, updatedAt: 8640000000000000 });
  await assert.rejects(
    f.api.saveAdventureLore(uid, input(f, 'bad-date')),
    reason('lore-inconsistent'),
  );
});
