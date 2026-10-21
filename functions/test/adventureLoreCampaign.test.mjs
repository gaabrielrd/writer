import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { adoptionFixture, entity as variantEntity } from './helpers/campaignAdoption.mjs';
import { uid, adventureId, target, op, comparisonRows } from './helpers/campaignComparison.mjs';
import { createAdventureLoreService } from '../src/adventureLore.mjs';
import { createCampaignBaseReadService } from '../src/campaignBaseRead.mjs';
import { createCampaignSessionsService } from '../src/campaignSessions.mjs';
import { createCampaignSessionReferencesService } from '../src/campaignSessionReferences.mjs';
import { basePath, baseSourceKey } from '../src/campaignBaseContracts.mjs';
const entity = (extra = {}) => ({
  name: 'Heroína local',
  aliases: ['Vigia'],
  category: 'character',
  summary: 'Resumo local',
  details: '  Texto particular 🐉\n',
  structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
  relations: [],
  isPublic: false,
  ...extra,
});
const localId = op('local-lore'),
  otherId = op('local-unreferenced');
const reference = { kind: 'adventure', scopeId: adventureId, entityId: localId };
const localKey = baseSourceKey({ kind: 'adventure-lore', adventureId, id: localId });
async function fixture() {
  const f = studioDb(),
    local = createAdventureLoreService({ db: f.db });
  let localScope;
  const setup = await adoptionFixture(f.db, async (x) => {
    const first = await local.listAdventureLore(uid, { adventureId, scope: 'adventure' });
    localScope = { adventureId, adventureToken: first.adventureToken };
    await local.saveAdventureLore(uid, {
      ...localScope,
      entityId: otherId,
      operationId: otherId,
      expectedRevision: 0,
      expectedCollectionRevision: 0,
      entity: entity({ name: 'Não referenciada' }),
    });
    await local.saveAdventureLore(uid, {
      ...localScope,
      entityId: localId,
      operationId: localId,
      expectedRevision: 0,
      expectedCollectionRevision: 1,
      entity: entity({
        relations: [
          {
            targetEntityId: 'adventure:' + adventureId + ':' + otherId,
            relationType: 'Conhece',
            description: 'Privado',
          },
        ],
      }),
    });
    const scene = await x.scenes.getScene(uid, { target, sceneId: x.scene.id });
    await x.scenes.setSceneReference(uid, {
      target,
      sceneId: scene.id,
      expectedRevision: scene.revision,
      operationId: op('local-scene-ref'),
      reference,
    });
    const arc = await x.narrative.getNarrativeItem(uid, {
      target,
      source: { kind: 'arc', id: x.arc.item.id },
    });
    await x.narrative.setNarrativeReference(uid, {
      target,
      source: { kind: 'arc', id: arc.id },
      expectedRevision: arc.revision,
      operationId: op('local-arc-ref'),
      reference: { kind: 'lore', reference },
    });
  });
  return { ...f, ...setup, local, localScope };
}
test('local author references, options and captured graph use exact discriminated source keys without traversing relations', async () => {
  const f = await fixture(),
    reader = createCampaignBaseReadService({ db: f.db, assets: f.assets });
  const page = await reader.listCampaignBaseItems(uid, { campaignId: f.campaign.id, kind: 'lore' });
  assert.equal(page.items.length, 2);
  assert.ok(page.items.some((r) => r.sourceKey === localKey));
  const otherKey = baseSourceKey({ kind: 'adventure-lore', adventureId, id: otherId });
  assert.equal(
    page.items.some((r) => r.sourceKey === otherKey),
    false,
  );
  const p = basePath(uid, f.campaign.activeBaseId),
    stored = f.records.get(p + '/items/' + localKey);
  assert.deepEqual(stored.origin, { kind: 'adventure-lore', adventureId, id: localId });
  assert.equal(stored.kind, 'lore');
  assert.equal(stored.structured.isPublic, false);
  const own = await reader.readCampaignBaseItem(uid, {
    campaignId: f.campaign.id,
    sourceKey: localKey,
  });
  assert.equal(own.item.structured.relations.length, 0);
  assert.ok(own.chunks.some((c) => c.content === '  Texto particular 🐉\n'));
  const options = await f.narrative.listNarrativeLoreOptions(uid, {
    target,
    scope: 'adventure',
    limit: 1,
  });
  assert.ok(options.nextCursor);
  assert.equal(options.items.length, 1);
  assert.equal(
    (await f.scenes.listSceneReferences(uid, { target, sceneId: f.scene.id })).items.some(
      (r) => r.reference.kind === 'adventure' && r.available,
    ),
    true,
  );
  const source = baseSourceKey({ adventureId, kind: 'scene', id: f.scene.id });
  const refs = await reader.listCampaignBaseReferences(uid, {
    campaignId: f.campaign.id,
    sourceKey: source,
  });
  assert.ok(refs.items.some((r) => r.targetKey === localKey && r.available));
  // A lore-only edit invalidates author and frozen-base continuation before any new body.
  await f.local.saveAdventureLore(uid, {
    ...f.localScope,
    entityId: localId,
    operationId: op('local-edit'),
    expectedRevision: 1,
    expectedCollectionRevision: 2,
    entity: entity({ details: 'Texto atualizado' }),
  });
  await assert.rejects(
    f.narrative.listNarrativeLoreOptions(uid, {
      target,
      scope: 'adventure',
      limit: 1,
      cursor: options.nextCursor,
    }),
    { code: 'failed-precondition' },
  );
  const after = await reader.getCampaignBase(uid, { campaignId: f.campaign.id });
  assert.notEqual(after.projectionToken, own.projectionToken);
});
test('local C2 variant and S2 material remain authorized when global universe disappears; deleting local source suppresses all derived names and keys', async () => {
  const f = await fixture(),
    saved = await f.save(
      'local-variant',
      0,
      variantEntity({ name: 'Mesa local', details: 'Minhas consequências' }),
      localKey,
    );
  const sessions = createCampaignSessionsService({ db: f.db });
  const scope = {
    campaignId: f.campaign.id,
    campaignToken: f.campaignToken,
    sessionId: op('local-session'),
    expectedSessionRevision: 1,
  };
  await sessions.saveCampaignSession(uid, {
    campaignId: scope.campaignId,
    campaignToken: scope.campaignToken,
    sessionId: scope.sessionId,
    operationId: scope.sessionId,
    expectedRevision: 0,
    title: 'Sessão',
    summary: 'Texto S1 independente',
    scheduledDate: null,
    status: 'planned',
  });
  const s2 = createCampaignSessionReferencesService({ db: f.db });
  let p = await s2.listCampaignSessionReferences(uid, { ...scope, view: 'references' });
  await s2.addCampaignSessionReference(uid, {
    ...scope,
    referenceId: op('local-link'),
    operationId: op('local-link'),
    expectedReferenceCollectionRevision: 0,
    sourceContext: p.sourceContext,
    target: { kind: 'lore', sourceKey: localKey },
  });
  f.records.delete('universes/world');
  assert.equal(
    (await f.lore.getCampaignLore(uid, { ...f.scope(), sourceKey: localKey })).item.entity.details,
    saved.result.item.entity.details,
  );
  p = await s2.listCampaignSessionReferences(uid, { ...scope, view: 'references' });
  assert.equal(p.items[0].available, true);
  const read = {
    ...scope,
    referenceId: op('local-link'),
    expectedRevision: 1,
    expectedReferenceCollectionRevision: 1,
    sourceContext: p.sourceContext,
  };
  assert.equal(
    (await s2.readCampaignSessionLoreReference(uid, read)).material.entity.details,
    'Minhas consequências',
  );
  await f.local.deleteAdventureLore(uid, {
    ...f.localScope,
    entityId: localId,
    operationId: op('delete-local'),
    expectedRevision: 1,
    expectedCollectionRevision: 2,
  });
  const lost = await s2.listCampaignSessionReferences(uid, { ...scope, view: 'references' });
  assert.equal(lost.items[0].available, false);
  assert.equal(JSON.stringify(lost).includes('Mesa local'), false);
  assert.equal(
    (await f.lore.getCampaignLore(uid, { ...f.scope(), sourceKey: localKey })).item,
    null,
  );
  assert.equal(
    (
      await sessions.getCampaignSession(uid, {
        campaignId: scope.campaignId,
        campaignToken: scope.campaignToken,
        sessionId: scope.sessionId,
      })
    ).session.summary,
    'Texto S1 independente',
  );
});
test('C3 local candidate and retained legacy preserve the same origin/hash and frozen variant after explicit adoption', async () => {
  const f = await fixture(),
    saved = await f.save('local-keep', 0, variantEntity({ name: 'Variante particular' }), localKey);
  // Remove explicit local references from both sources; relation text never recreates them.
  const scene = await f.scenes.getScene(uid, { target, sceneId: f.scene.id });
  await f.scenes.setSceneReference(uid, {
    target,
    sceneId: scene.id,
    expectedRevision: scene.revision,
    operationId: op('remove-local-scene'),
    reference,
    remove: true,
  });
  const arc = await f.narrative.getNarrativeItem(uid, {
    target,
    source: { kind: 'arc', id: f.arc.item.id },
  });
  await f.narrative.setNarrativeReference(uid, {
    target,
    source: { kind: 'arc', id: arc.id },
    expectedRevision: arc.revision,
    operationId: op('remove-local-arc'),
    reference: { kind: 'lore', reference },
    remove: true,
  });
  const candidate = await f.candidate('local-candidate');
  const rows = await comparisonRows(f, candidate, 'items', { kind: 'lore' });
  assert.equal(rows.find((r) => r.key === localKey).change, 'removed');
  let p = (await f.start(candidate, 'local-adoption')).result.progress;
  const decisions = await f.adoptions.listCampaignAdoptionDecisions(uid, {
    adoptionId: p.adoptionId,
  });
  assert.ok(decisions.items.some((r) => r.sourceKey === localKey && r.required));
  p = (
    await f.step('decideCampaignAdoption', p, {
      sourceKey: localKey,
      expectedRevision: 1,
      choice: 'keep-local',
    })
  ).progress;
  p = await f.finish(p);
  const adopted = await f.adoptions.activateCampaignAdoption(uid, {
    adoptionId: p.adoptionId,
    operationId: op('local-adopt'),
    expectedCheckpoint: p.checkpoint,
  });
  assert.equal(adopted.progress.state, 'adopted');
  f.campaign = f.acceptCampaign(f.records.get('campaigns/' + f.campaign.id));
  const local = await f.lore.getCampaignLore(uid, { ...f.scope(), sourceKey: localKey });
  assert.equal(local.item.legacy, true);
  assert.equal(local.item.entity.details, saved.result.item.entity.details);
  f.records.delete('universes/world');
  assert.equal(
    (await f.lore.getCampaignLore(uid, { ...f.scope(), sourceKey: localKey })).item.legacy,
    true,
  );
  const base = f.records.get(basePath(uid, f.campaign.activeBaseId));
  const legacy = f.records.get(basePath(uid, candidate.currentBaseId) + '/items/' + localKey);
  assert.deepEqual(legacy.origin, { kind: 'adventure-lore', adventureId, id: localId });
  assert.equal(base.id, candidate.candidateBaseId);
});

test('recreated adventure rejects old children and a new same-ID entity cannot reauthorize frozen B/C2/C3/S2 material', async () => {
  const f = await fixture(),
    reader = createCampaignBaseReadService({ db: f.db, assets: f.assets });
  await f.save(
    'recreate-variant',
    0,
    variantEntity({ details: 'Variante da raiz anterior' }),
    localKey,
  );
  const candidate = await f.candidate('before-recreate');
  const sessions = createCampaignSessionsService({ db: f.db });
  const scope = {
    campaignId: f.campaign.id,
    campaignToken: f.campaignToken,
    sessionId: op('recreate-session'),
    expectedSessionRevision: 1,
  };
  await sessions.saveCampaignSession(uid, {
    campaignId: scope.campaignId,
    campaignToken: scope.campaignToken,
    sessionId: scope.sessionId,
    operationId: scope.sessionId,
    expectedRevision: 0,
    title: 'Sessão',
    summary: 'Minha preparação',
    scheduledDate: null,
    status: 'planned',
  });
  const s2 = createCampaignSessionReferencesService({ db: f.db });
  const initial = await s2.listCampaignSessionReferences(uid, { ...scope, view: 'references' });
  await s2.addCampaignSessionReference(uid, {
    ...scope,
    referenceId: op('recreate-link'),
    operationId: op('recreate-link'),
    expectedReferenceCollectionRevision: 0,
    sourceContext: initial.sourceContext,
    target: { kind: 'lore', sourceKey: localKey },
  });
  const previousRoot = f.records.get('adventures/' + adventureId);
  await f.db.runTransaction(async (tx) => {
    tx.delete(f.db.doc('adventures/' + adventureId));
    tx.create(f.db.doc('adventures/' + adventureId), previousRoot);
  });
  async function blocked() {
    assert.equal(
      (
        await reader.listCampaignBaseItems(uid, { campaignId: f.campaign.id, kind: 'lore' })
      ).items.some((i) => i.sourceKey === localKey),
      false,
    );
    await assert.rejects(
      reader.readCampaignBaseItem(uid, { campaignId: f.campaign.id, sourceKey: localKey }),
      { code: 'not-found' },
    );
    assert.equal(
      (await f.lore.getCampaignLore(uid, { ...f.scope(), sourceKey: localKey })).item,
      null,
    );
    const rows = await comparisonRows(f, candidate, 'items', { kind: 'lore' });
    const row = rows.find((r) => r.key === localKey);
    assert.equal(JSON.stringify(row ?? {}).includes('Heroína local'), false);
    assert.equal(JSON.stringify(row ?? {}).includes('Variante da raiz anterior'), false);
    await assert.rejects(
      f.reader.readCampaignComparisonItem(uid, {
        comparisonId: candidate.comparisonId,
        sourceKey: localKey,
        side: 'current',
      }),
      { code: 'not-found' },
    );
    const links = await s2.listCampaignSessionReferences(uid, { ...scope, view: 'references' });
    assert.equal(links.items[0].available, false);
  }
  await blocked();
  // Simulate replacing the entity under the new root without modifying its frozen item.
  // This is not a supported ID-reuse write; it proves fail-closed against an Admin mutation.
  const bootstrap = await f.local.listAdventureLore(uid, { adventureId, scope: 'universe' });
  const newToken = bootstrap.adventureToken;
  for (const id of [localId, otherId]) {
    for (const collection of ['lore', 'loreBodies']) {
      const p = 'adventures/' + adventureId + '/' + collection + '/' + id;
      f.records.set(p, { ...f.records.get(p), adventureToken: newToken });
    }
  }
  assert.notEqual(newToken, f.localScope.adventureToken);
  await blocked();
});
test('corrupt captured origin, scope, source hash or missing local incarnation fails closed before any frozen prose', async () => {
  const f = await fixture(),
    reader = createCampaignBaseReadService({ db: f.db, assets: f.assets });
  const path = basePath(uid, f.campaign.activeBaseId) + '/items/' + localKey;
  const original = f.records.get(path);
  for (const patch of [
    { origin: { ...original.origin, adventureId: 'another-adventure-long' } },
    { sourceKey: 'a'.repeat(64) },
    { originAdventureToken: undefined },
  ]) {
    f.records.set(path, { ...original, ...patch });
    await assert.rejects(
      reader.readCampaignBaseItem(uid, { campaignId: f.campaign.id, sourceKey: localKey }),
      { code: 'failed-precondition' },
    );
  }
});
