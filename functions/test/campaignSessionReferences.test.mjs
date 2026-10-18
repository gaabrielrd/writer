import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import {
  seedLoreRecords,
  uid,
  campaignId,
  campaignPath,
  basePath,
  baseId,
  adventureId,
  key,
  op,
  header,
  entity,
  seal,
} from './helpers/campaignLore.mjs';
import { createCampaignSessionsService } from '../src/campaignSessions.mjs';
import { createCampaignSessionReferencesService } from '../src/campaignSessionReferences.mjs';
import { createCampaignLoreService } from '../src/campaignLore.mjs';
import { createCampaignVariantRecoveryService } from '../src/campaignVariantRecovery.mjs';
import { digest } from '../src/campaignBaseContracts.mjs';

const reason = (name) => (error) => error.details?.reason === name;
async function fixture() {
  const f = studioDb();
  for (const [path, value] of seedLoreRecords()) f.records.set(path, value);
  const reads = [],
    wrappedDb = {
      ...f.db,
      runTransaction: (fn) =>
        f.db.runTransaction((tx) =>
          fn({
            ...tx,
            get: (ref) => {
              if (ref.path) reads.push(ref.path);
              return tx.get(ref);
            },
          }),
        ),
    };
  const sessions = createCampaignSessionsService({ db: wrappedDb, now: () => 100 }),
    initial = await sessions.listCampaignSessions(uid, { campaignId });
  const input = {
    campaignId,
    campaignToken: initial.campaignToken,
    sessionId: op('session'),
    operationId: op('session'),
    expectedRevision: 0,
    title: 'Encontro',
    summary: 'Preparação própria 🐉',
    scheduledDate: null,
    status: 'planned',
  };
  await sessions.saveCampaignSession(uid, input);
  const api = createCampaignSessionReferencesService({ db: wrappedDb, now: () => 200 }),
    scope = {
      campaignId,
      campaignToken: initial.campaignToken,
      sessionId: input.sessionId,
      expectedSessionRevision: 1,
    };
  const list = (extra) =>
    api.listCampaignSessionReferences(uid, { ...scope, view: 'references', ...extra });
  const source = (await list()).sourceContext;
  return { ...f, queries: f.reads, reads, api, sessions, input, scope, source, list };
}
const addInput = (f, name, revision = 0, sourceKey = key('a')) => ({
  ...f.scope,
  referenceId: op(name),
  operationId: op(name),
  expectedReferenceCollectionRevision: revision,
  sourceContext: f.source,
  target: { kind: 'lore', sourceKey },
});
const add = (f, name, revision, sourceKey) =>
  f.api.addCampaignSessionReference(uid, addInput(f, name, revision, sourceKey));
const removeInput = (f, referenceId, revision = 1, collection = 1, name = 'remove') => ({
  ...f.scope,
  referenceId,
  operationId: op(name),
  expectedRevision: revision,
  expectedReferenceCollectionRevision: collection,
});
const readInput = (f, referenceId, collection = 1) => ({
  ...f.scope,
  referenceId,
  expectedRevision: 1,
  expectedReferenceCollectionRevision: collection,
  sourceContext: f.source,
});
const read = (f, referenceId, collection) =>
  f.api.readCampaignSessionLoreReference(uid, readInput(f, referenceId, collection));
const noBodies = (f) =>
  assert.equal(
    f.reads.some((p) => p.includes('/bodies/') || p.includes('/loreVariantBodies/')),
    false,
  );

test('reference lifecycle stores only IDs, resolves frozen projected lore and never mutates session or original', async () => {
  const f = await fixture(),
    sessionBefore = structuredClone(f.records.get(campaignPath + '/sessions/' + f.scope.sessionId)),
    original = structuredClone(f.records.get(basePath + '/items/' + key('a')));
  const input = addInput(f, 'first'),
    outcome = await f.api.addCampaignSessionReference(uid, input);
  assert.equal(outcome.kind, 'confirmed');
  assert.equal(outcome.receipt.revision, 1);
  assert.equal(outcome.receipt.referenceCollectionRevision, 1);
  assert.deepEqual(await f.api.addCampaignSessionReference(uid, input), outcome);
  const row = (await f.list()).items[0];
  assert.equal(row.target.name, 'Ficha congelada a');
  assert.equal(row.target.sourceKey, key('a'));
  const result = await read(f, input.referenceId);
  assert.equal(result.referenceId, input.referenceId);
  assert.equal(result.referenceRevision, 1);
  assert.equal(result.material.entity.summary, 'Resumo congelado a');
  assert.equal(result.material.entity.details, 'Texto congelado a');
  assert.equal('entityHash' in result.material, false);
  assert.equal('anchor' in result.material, false);
  assert.equal(JSON.stringify(result).includes('Nome vivo'), false);
  const stored = f.records.get(campaignPath + '/sessionReferences/' + input.referenceId),
    receipt = f.records.get(`users/${uid}/campaignSessionReferenceOperations/${input.operationId}`);
  for (const value of [stored, receipt])
    for (const forbidden of [
      'Ficha congelada',
      'Resumo congelado',
      'Texto congelado',
      'projectionToken',
      'bodyBinding',
      'anchor',
    ])
      assert.equal(JSON.stringify(value).includes(forbidden), false);
  assert.deepEqual(f.records.get(campaignPath + '/sessions/' + f.scope.sessionId), sessionBefore);
  assert.deepEqual(f.records.get(basePath + '/items/' + key('a')), original);
  const removed = await f.api.removeCampaignSessionReference(
    uid,
    removeInput(f, input.referenceId),
  );
  assert.equal(removed.receipt.revision, 2);
  assert.equal(removed.receipt.referenceCollectionRevision, 2);
  assert.equal(
    'target' in f.records.get(campaignPath + '/sessionReferences/' + input.referenceId),
    false,
  );
  assert.deepEqual((await f.list()).items, []);
  assert.equal((await f.api.addCampaignSessionReference(uid, input)).kind, 'confirmed');
  assert.equal((await add(f, 'again', 2)).receipt.revision, 1);
});

test('duplicate and competing operations use bounded query and collection CAS, not a second link', async () => {
  const f = await fixture();
  const results = await Promise.allSettled([add(f, 'race-a'), add(f, 'race-b')]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    results.find((r) => r.status === 'rejected').reason.details.reason,
    'revision-conflict',
  );
  await assert.rejects(add(f, 'duplicate', 1), reason('reference-already-linked'));
  assert.equal((await f.list()).items.length, 1);
  const queries = f.queries.filter((q) => q.collectionPath === campaignPath + '/sessionReferences');
  assert.ok(queries.some((q) => q.maximum === 1 && q.count === 1));
  assert.ok(queries.every((q) => q.maximum <= 51 && Array.isArray(q.fields)));
  assert.ok(queries.every((q) => !q.fields.includes('content') && !q.fields.includes('summary')));
});

test('historical receipts and cancellation fences need only own campaign, even after session removal or missing session', async () => {
  const f = await fixture(),
    request = addInput(f, 'historical'),
    result = await f.api.addCampaignSessionReference(uid, request);
  await f.sessions.deleteCampaignSession(uid, {
    campaignId,
    campaignToken: f.scope.campaignToken,
    sessionId: f.scope.sessionId,
    operationId: op('delete-session'),
    expectedRevision: 1,
  });
  f.records.delete('adventures/' + adventureId);
  f.reads.length = 0;
  assert.deepEqual(await f.api.addCampaignSessionReference(uid, request), result);
  assert.deepEqual(
    await f.api.resolveCampaignSessionReferenceOperation(uid, {
      action: 'add',
      request,
      intent: 'cancel',
    }),
    result,
  );
  assert.equal(
    f.reads.some(
      (p) =>
        p.includes('/campaignBases/') || p.includes('/sessions/') || p.startsWith('universes/'),
    ),
    false,
  );
  const unknown = { ...addInput(f, 'never-received'), sessionId: op('never-existing-session') };
  const canceled = await f.api.resolveCampaignSessionReferenceOperation(uid, {
    action: 'add',
    request: unknown,
    intent: 'cancel',
  });
  assert.equal(canceled.kind, 'canceled');
  assert.deepEqual(canceled.request, unknown);
  assert.deepEqual(await f.api.addCampaignSessionReference(uid, unknown), canceled);
  assert.deepEqual(
    await f.api.resolveCampaignSessionReferenceOperation(uid, {
      action: 'add',
      request: unknown,
      intent: 'cancel',
    }),
    canceled,
  );
  const fence = f.records.get(`users/${uid}/campaignSessionReferenceFences/${unknown.operationId}`);
  assert.equal('request' in fence, false);
  assert.equal('sourceContext' in fence, false);
  assert.equal('target' in fence, false);
  await assert.rejects(
    f.api.addCampaignSessionReference(uid, {
      ...unknown,
      target: { kind: 'lore', sourceKey: key('b') },
    }),
    { code: 'invalid-argument' },
  );
});

test('session tombstone and stale revision gate all material/candidate pages before origin or body reads', async () => {
  const f = await fixture(),
    request = addInput(f, 'linked');
  await f.api.addCampaignSessionReference(uid, request);
  await f.sessions.deleteCampaignSession(uid, {
    campaignId,
    campaignToken: f.scope.campaignToken,
    sessionId: f.scope.sessionId,
    operationId: op('deleted'),
    expectedRevision: 1,
  });
  f.reads.length = 0;
  for (const call of [
    () => f.list(),
    () =>
      f.api.listCampaignSessionReferences(uid, {
        ...f.scope,
        view: 'candidates',
        sourceContext: f.source,
      }),
    () => read(f, request.referenceId),
    () => add(f, 'new', 1),
    () => f.api.removeCampaignSessionReference(uid, removeInput(f, request.referenceId)),
  ])
    await assert.rejects(call(), reason('session-unavailable'));
  assert.equal(
    f.reads.some(
      (p) =>
        p.includes('/campaignBases/') || p.startsWith('adventures/') || p.startsWith('universes/'),
    ),
    false,
  );
  noBodies(f);
});

test('revoked targets expose no old name, remain removable and never invalidate own text; changed source fails before body', async () => {
  const f = await fixture(),
    request = addInput(f, 'target');
  await f.api.addCampaignSessionReference(uid, request);
  f.records.get('universes/world').privacyVersion++;
  f.records.delete('universes/world/lore/a');
  f.reads.length = 0;
  await assert.rejects(read(f, request.referenceId), reason('source-context-changed'));
  noBodies(f);
  const page = await f.list();
  assert.deepEqual(page.items[0], {
    id: request.referenceId,
    revision: 1,
    createdAt: 200,
    updatedAt: 200,
    available: false,
  });
  const current = await f.api.readCampaignSessionLoreReference(uid, {
    ...readInput(f, request.referenceId),
    sourceContext: page.sourceContext,
  });
  assert.equal(current.material, null);
  assert.equal(current.referenceId, request.referenceId);
  noBodies(f);
  assert.equal(
    (await f.api.removeCampaignSessionReference(uid, removeInput(f, request.referenceId))).kind,
    'confirmed',
  );
  const own = await f.sessions.getCampaignSession(uid, {
    campaignId,
    campaignToken: f.scope.campaignToken,
    sessionId: f.scope.sessionId,
  });
  assert.equal(own.session.summary, 'Preparação própria 🐉');
});

test('root source absence returns null without broad catches; existing wrong schema/owner still fails while world null permits context', async () => {
  const f = await fixture(),
    request = addInput(f, 'source');
  await f.api.addCampaignSessionReference(uid, request);
  const adventure = structuredClone(f.records.get('adventures/' + adventureId));
  for (const patch of [
    { schemaVersion: 2, deleting: true },
    { ownerId: 'other', deleting: true },
  ]) {
    f.records.set('adventures/' + adventureId, { ...adventure, ...patch });
    await assert.rejects(f.list(), { code: 'failed-precondition' });
  }
  f.records.set('adventures/' + adventureId, { ...adventure, deleting: true });
  f.reads.length = 0;
  const page = await f.list();
  assert.equal(page.sourceContext, null);
  assert.equal(page.items[0].available, false);
  assert.equal((await read(f, request.referenceId)).material, null);
  assert.deepEqual(
    (
      await f.api.listCampaignSessionReferences(uid, {
        ...f.scope,
        view: 'candidates',
        sourceContext: f.source,
      })
    ).items,
    [],
  );
  noBodies(f);
  f.records.set('adventures/' + adventureId, adventure);
  f.records.delete('universes/world');
  assert.ok((await f.list()).sourceContext);
  const root = f.records.get(campaignPath);
  f.records.set(campaignPath, { ...root, provenance: { kind: 'independent' }, activeBaseId: null });
  assert.equal((await f.list()).sourceContext, null);
});

test('effective override and whole authorized relations use same C2 projector without entityHash', async () => {
  const f = await fixture(),
    lore = createCampaignLoreService({ db: f.db }),
    recovery = createCampaignVariantRecoveryService({ db: f.db });
  const loreScope = { campaignId, campaignToken: f.scope.campaignToken, baseId },
    h = header(loreScope, 'variant', 0, key('a')),
    value = entity({
      name: 'Nome da variante',
      relations: [{ targetKey: key('b'), relationType: 'amigo', description: 'Relação própria' }],
    });
  h.relatedSourceKeys = [key('b')];
  const prepared = await recovery.prepareCampaignLoreVariant(uid, h);
  await lore.saveCampaignLoreVariant(uid, { ...h, sealed: seal(prepared, value) });
  f.source = (await f.list()).sourceContext;
  const request = addInput(f, 'variant-link');
  await f.api.addCampaignSessionReference(uid, request);
  const material = (await read(f, request.referenceId)).material;
  assert.equal(material.mode, 'override');
  assert.equal(material.entity.name, 'Nome da variante');
  assert.equal(material.entity.relations[0].targetName, 'Ficha congelada b');
  assert.equal('entityHash' in material, false);
  assert.equal('key' in material, false);
});

test('retained legacy from another universe remains resolvable when current universe disappears', async () => {
  const f = await fixture(),
    oldId = digest('old-base-for-session'),
    oldPath = `users/${uid}/campaignBases/${oldId}`;
  for (const [path, value] of [...f.records])
    if (path === basePath || path.startsWith(basePath + '/'))
      f.records.set(path.replace(basePath, oldPath), {
        ...structuredClone(value),
        ...(path === basePath ? { id: oldId } : {}),
      });
  f.records.get(basePath).universeId = 'missing-current-world';
  f.records.delete(basePath + '/items/' + key('a'));
  f.records.set(campaignPath + '/loreVariants/' + key('a'), {
    schemaVersion: 1,
    ownerId: uid,
    campaignId,
    campaignToken: f.scope.campaignToken,
    baseId,
    sourceKey: key('a'),
    revision: 1,
    mode: 'base',
    participation: 'legacy',
    retainedLegacy: true,
    anchor: { capturedBaseId: oldId, sourceKey: key('a') },
    name: 'Ficha congelada a',
    category: 'character',
    manifest: null,
    bodyBinding: null,
    createdAt: 1,
    updatedAt: 1,
  });
  f.records.set(campaignPath + '/loreVariantState/current', {
    schemaVersion: 1,
    ownerId: uid,
    campaignId,
    campaignToken: f.scope.campaignToken,
    baseId,
    revision: 1,
  });
  f.source = (await f.list()).sourceContext;
  assert.ok(f.source);
  const candidates = await f.api.listCampaignSessionReferences(uid, {
    ...f.scope,
    view: 'candidates',
    sourceContext: f.source,
  });
  assert.equal(candidates.items.length, 1);
  assert.equal(candidates.items[0].legacy, true);
  await add(f, 'legacy');
  assert.equal((await read(f, op('legacy'))).material.entity.details, 'Texto congelado a');
  assert.equal((await read(f, op('legacy'))).material.legacy, true);
});

test('both views have bounded metadata-only pagination and closed actor/session/source scoped cursors', async () => {
  const f = await fixture();
  await add(f, 'a', 0, key('a'));
  await add(f, 'b', 1, key('b'));
  await add(f, 'c', 2, key('c'));
  f.reads.length = 0;
  const first = await f.list({ limit: 1 }),
    next = await f.list({ limit: 1, cursor: first.nextCursor }),
    last = await f.list({ limit: 1, cursor: next.nextCursor });
  assert.equal(new Set([first.items[0].id, next.items[0].id, last.items[0].id]).size, 3);
  assert.equal(last.nextCursor, null);
  const candidate = await f.api.listCampaignSessionReferences(uid, {
    ...f.scope,
    view: 'candidates',
    sourceContext: f.source,
    limit: 1,
  });
  assert.equal(candidate.items.length, 1);
  assert.ok(candidate.nextCursor);
  noBodies(f);
  const raw = JSON.parse(Buffer.from(first.nextCursor, 'base64url'));
  const tamper = (patch) => Buffer.from(JSON.stringify({ ...raw, ...patch })).toString('base64url');
  for (const cursor of [
    '!',
    Buffer.from('{}').toString('base64url'),
    tamper({ date: -1 }),
    tamper({ key: 'short' }),
    tamper({ extra: true }),
  ])
    await assert.rejects(f.list({ cursor }), { code: 'invalid-argument' });
  await assert.rejects(
    f.list({ cursor: tamper({ scope: { ...raw.scope, ownerId: 'other' } }) }),
    reason('cursor-invalidated'),
  );
  await assert.rejects(f.list({ cursor: candidate.nextCursor }), { code: 'invalid-argument' });
  f.records.delete('adventures/' + adventureId);
  await assert.rejects(f.list({ cursor: first.nextCursor }), reason('cursor-invalidated'));
});

test('candidate scanning crosses empty unauthorized windows and metadata masks exclude large relationship prose', async () => {
  const f = await fixture(),
    keys = ['a', 'b', 'c'].map(key).sort();
  const first = f.records.get(basePath + '/items/' + keys[0]);
  f.records.delete('universes/world/lore/' + first.origin.id);
  for (const sourceKey of keys) {
    const item = f.records.get(basePath + '/items/' + sourceKey);
    item.structured.relations = Array.from({ length: 50 }, () => ({
      description: '🐉'.repeat(2000),
    }));
    item.structured.aliases = ['secreto não necessário'];
  }
  f.reads.length = 0;
  const query = { ...f.scope, view: 'candidates', sourceContext: f.source, limit: 1 };
  const empty = await f.api.listCampaignSessionReferences(uid, query);
  assert.deepEqual(empty.items, []);
  assert.ok(empty.nextCursor);
  const second = await f.api.listCampaignSessionReferences(uid, {
    ...query,
    cursor: empty.nextCursor,
  });
  const third = await f.api.listCampaignSessionReferences(uid, {
    ...query,
    cursor: second.nextCursor,
  });
  assert.equal(second.items[0].sourceKey, keys[1]);
  assert.equal(third.items[0].sourceKey, keys[2]);
  assert.equal(third.nextCursor, null);
  noBodies(f);
  assert.equal(
    f.reads.some((p) => p.includes('/items/')),
    false,
  );
  const itemMasks = f.metadataReads.filter((r) => r.path.includes('/items/'));
  assert.ok(
    itemMasks.every(
      (r) =>
        !r.fields.includes('structured') &&
        !r.fields.includes('structured.relations') &&
        !r.fields.includes('structured.aliases'),
    ),
  );
  const itemQueries = f.queries.filter((q) => q.collectionPath === basePath + '/items');
  assert.equal(itemQueries.length, 3);
  assert.ok(itemQueries.every((q) => q.maximum === 2 && !q.fields.includes('structured')));
});

test('missing control includes tombstones; closed inputs, receipt corruption, overflow and C4 fail without partial writes', async () => {
  const f = await fixture(),
    request = addInput(f, 'control');
  await f.api.addCampaignSessionReference(uid, request);
  const receiptPath = `users/${uid}/campaignSessionReferenceOperations/${request.operationId}`,
    stored = structuredClone(f.records.get(receiptPath));
  f.records.set(receiptPath, { ...stored, receipt: { ...stored.receipt, revision: 2 } });
  await assert.rejects(
    f.api.addCampaignSessionReference(uid, request),
    reason('reference-inconsistent'),
  );
  f.records.set(receiptPath, stored);
  await assert.rejects(
    f.api.listCampaignSessionReferences('other', { ...f.scope, view: 'references' }),
    { code: 'not-found' },
  );
  await assert.rejects(
    f.api.addCampaignSessionReference(uid, {
      ...request,
      target: { ...request.target, name: 'forged' },
    }),
    { code: 'invalid-argument' },
  );
  await assert.rejects(
    f.api.listCampaignSessionReferences(uid, {
      ...f.scope,
      view: 'references',
      sourceContext: f.source,
    }),
    { code: 'invalid-argument' },
  );
  await assert.rejects(
    f.api.listCampaignSessionReferences(uid, { ...f.scope, view: 'candidates' }),
    { code: 'invalid-argument' },
  );
  await f.api.removeCampaignSessionReference(uid, removeInput(f, request.referenceId));
  f.records.delete(campaignPath + '/sessionReferenceState/' + f.scope.sessionId);
  await assert.rejects(f.list(), reason('reference-inconsistent'));
  f.records.set(campaignPath + '/sessionReferenceState/' + f.scope.sessionId, {
    schemaVersion: 1,
    ownerId: uid,
    campaignId,
    campaignToken: f.scope.campaignToken,
    sessionId: f.scope.sessionId,
    revision: Number.MAX_SAFE_INTEGER,
  });
  const before = structuredClone([...f.records]);
  await assert.rejects(
    add(f, 'overflow', Number.MAX_SAFE_INTEGER),
    reason('reference-inconsistent'),
  );
  assert.deepEqual([...f.records], before);
  f.records.set('campaignDeletionReservations/' + campaignId, {
    schemaVersion: 1,
    ownerId: uid,
    campaignId,
    campaignToken: f.scope.campaignToken,
    deletionId: op('deletion'),
    state: 'deleting',
    createdAt: 1,
    updatedAt: 1,
  });
  await assert.rejects(
    f.api.addCampaignSessionReference(uid, request),
    reason('campaign-deleting'),
  );
  await assert.rejects(
    f.api.resolveCampaignSessionReferenceOperation(uid, {
      action: 'add',
      request,
      intent: 'cancel',
    }),
    reason('campaign-deleting'),
  );
});
