import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import {
  adoptionFixture,
  uid,
  op,
  heroKey,
  entity,
  measuredDb,
} from './helpers/campaignAdoption.mjs';
import { target } from './helpers/campaignComparison.mjs';
import { baseSourceKey } from '../src/campaignBaseContracts.mjs';
import { loreGenerationPath } from '../src/campaignLoreStorage.mjs';
import { createCampaignAdoptionService } from '../src/campaignAdoption.mjs';
const reason = (v) => (e) => e.details?.reason === v;
async function fixture() {
  const data = studioDb();
  return { ...data, ...(await adoptionFixture(data.db)) };
}
test('adoption preserves an immutable old body binding, advances revisions, protects the adopted candidate and writes new text in the new generation', async () => {
  const f = await fixture();
  const saved = await f.save('variant');
  const oldBodies = [...f.records].filter(([p]) => p.includes('/loreVariantBodies/'));
  const candidate = await f.candidate();
  const start = await f.start(candidate);
  let p = start.result.progress;
  const page = await f.adoptions.listCampaignAdoptionDecisions(uid, { adoptionId: p.adoptionId });
  assert.equal(page.items[0].sourceKey, heroKey);
  assert.equal(page.items[0].choice, null);
  p = (
    await f.step('decideCampaignAdoption', p, {
      sourceKey: heroKey,
      expectedRevision: 1,
      choice: 'keep-local',
    })
  ).progress;
  p = await f.finish(p);
  const act = {
    adoptionId: p.adoptionId,
    operationId: op('activate-adoption'),
    expectedCheckpoint: p.checkpoint,
  };
  const adopted = await f.adoptions.activateCampaignAdoption(uid, act);
  assert.equal(adopted.progress.state, 'adopted');
  assert.deepEqual(await f.adoptions.activateCampaignAdoption(uid, act), adopted);
  const root = f.records.get('campaigns/' + f.campaign.id);
  assert.equal(root.activeBaseId, candidate.candidateBaseId);
  assert.equal(root.provenance.baseId, root.activeBaseId);
  assert.equal(root.title, f.campaign.title);
  assert.equal(root.revision, 2);
  f.campaign = f.acceptCampaign(root);
  const read = await f.lore.getCampaignLore(uid, { ...f.scope(), sourceKey: heroKey });
  assert.equal(read.item.entity.details, saved.result.item.entity.details);
  assert.equal(read.item.revision, 2);
  const overlay = f.records.get(
    loreGenerationPath(root.id, root.activeLoreGenerationId) + '/loreVariants/' + heroKey,
  );
  assert.equal(overlay.manifest.bodyRevision, 1);
  assert.equal(overlay.bodyBinding.layout, 'legacy');
  for (const [path, value] of oldBodies) assert.deepEqual(f.records.get(path), value);
  await assert.rejects(
    f.api.cancelCampaignComparison(uid, {
      comparisonId: candidate.comparisonId,
      operationId: op('delete-adopted'),
      expectedCheckpoint: f.records.get(
        'users/' + uid + '/campaignComparisons/' + candidate.comparisonId,
      ).checkpoint,
    }),
    { code: 'failed-precondition' },
  );
  await f.save('new-generation', 2, entity({ details: 'Novo texto' }));
  assert.equal(
    oldBodies.every(([path]) => !f.records.has(path)),
    true,
  );
  assert.equal(
    [...f.records.keys()].some(
      (path) => path.includes('/loreGenerations/') && path.includes('/loreVariantBodies/'),
    ),
    true,
  );
});
test('pending remote operation releases admission before recovery, stale remote resolution is receipted without exposing relationships, and start fences need no root', async () => {
  const f = await fixture();
  await f.save('pending', 0, entity(), heroKey, false);
  const candidate = await f.candidate();
  let p = (await f.start(candidate)).result.progress;
  p = (
    await f.step('decideCampaignAdoption', p, {
      sourceKey: heroKey,
      expectedRevision: 1,
      choice: 'keep-local',
    })
  ).progress;
  p = (await f.step('prepareCampaignAdoption', p)).progress;
  await assert.rejects(
    f.recovery.prepareCampaignLoreVariant(uid, {
      ...f.scope(),
      sourceKey: heroKey,
      expectedRevision: 1,
      operationId: op('blocked'),
      relatedSourceKeys: [],
    }),
    reason('adoption-in-progress'),
  );
  p = (await f.step('advanceCampaignAdoption', p)).progress;
  assert.equal(p.state, 'aborted');
  assert.equal(p.reason, 'pending-operations');
  const list = await f.remote.listCampaignLoreOperations(uid, f.scope());
  assert.equal(list.items.length, 1);
  assert.equal(JSON.stringify(list).includes('relatedSourceKeys'), false);
  assert.equal(JSON.stringify(list).includes('key'), false);
  const request = {
    ...f.scope(),
    operationId: list.items[0].operationId,
    statusToken: list.items[0].statusToken,
    resolutionId: op('remote-confirm'),
    intent: 'confirm',
  };
  const resolved = await f.remote.resolveCampaignLoreRemoteOperation(uid, request);
  assert.equal(resolved.outcome, 'resolved');
  assert.deepEqual(await f.remote.resolveCampaignLoreRemoteOperation(uid, request), resolved);
  const stale = { ...request, resolutionId: op('stale') };
  const rejected = await f.remote.resolveCampaignLoreRemoteOperation(uid, stale);
  assert.equal(rejected.outcome, 'rejected');
  assert.deepEqual(await f.remote.resolveCampaignLoreRemoteOperation(uid, stale), rejected);
  const missing = {
    operationId: op('never'),
    campaignId: f.campaign.id,
    campaignToken: f.campaignToken,
    comparisonId: candidate.comparisonId,
    currentBaseId: f.campaign.activeBaseId,
    candidateBaseId: candidate.candidateBaseId,
    expectedCollectionRevision: 1,
  };
  f.records.delete('campaigns/' + f.campaign.id);
  assert.equal(
    (await f.adoptions.resolveCampaignAdoptionStart(uid, { ...missing, intent: 'cancel' })).kind,
    'canceled',
  );
  assert.equal((await f.adoptions.startCampaignAdoption(uid, missing)).kind, 'canceled');
});
test('an absent referenced entity is retained only by explicit choice, restores through its frozen anchor and reenters without duplicates', async () => {
  const f = await fixture();
  await f.save('local');
  await f.removeReferences();
  const candidate = await f.candidate();
  let p = (await f.start(candidate)).result.progress;
  const row = (await f.adoptions.listCampaignAdoptionDecisions(uid, { adoptionId: p.adoptionId }))
    .items[0];
  assert.equal(row.candidate.present, false);
  await assert.rejects(
    f.step('decideCampaignAdoption', p, {
      sourceKey: heroKey,
      expectedRevision: 1,
      choice: 'use-candidate',
    }),
    { code: 'invalid-argument' },
  );
  p = (
    await f.step('decideCampaignAdoption', p, {
      sourceKey: heroKey,
      expectedRevision: 1,
      choice: 'keep-local',
    })
  ).progress;
  p = await f.finish(p);
  await f.step('activateCampaignAdoption', p);
  f.campaign = f.acceptCampaign(f.records.get('campaigns/' + f.campaign.id));
  const list = await f.lore.listCampaignLore(uid, f.scope());
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].legacy, true);
  const discarded = await f.lore.discardCampaignLoreVariant(uid, {
    ...f.scope(),
    sourceKey: heroKey,
    expectedRevision: 2,
    operationId: op('discard-override'),
  });
  assert.equal(discarded.item.legacy, true);
  assert.equal(discarded.item.entity.name, 'Heroína');
});
test('a normal source edit reauthorizes the same frozen generation; actual revocation aborts and releases only its own fence', async () => {
  const f = await fixture();
  await f.save('local');
  const candidate = await f.candidate();
  let p = (await f.start(candidate)).result.progress;
  p = (
    await f.step('decideCampaignAdoption', p, {
      sourceKey: heroKey,
      expectedRevision: 1,
      choice: 'keep-local',
    })
  ).progress;
  p = await f.finish(p);
  await f.universe.saveUniverseLore(uid, {
    universeId: 'world',
    id: 'hero',
    input: {
      name: 'Nome vivo novo',
      category: 'character',
      summary: 'Novo',
      details: 'Não capturar',
      isPublic: false,
    },
  });
  let answer = await f.step('activateCampaignAdoption', p);
  assert.equal(answer.receipt.outcome, 'reauthorization-required');
  assert.equal(answer.progress.state, 'preparing');
  assert.equal(f.records.get('campaigns/' + f.campaign.id).activeBaseId, f.campaign.activeBaseId);
  p = answer.progress;
  for (let i = 0; i < 10 && p.state === 'preparing'; i++)
    p = (await f.step('advanceCampaignAdoption', p)).progress;
  assert.equal(p.state, 'ready');
  await f.universe.deleteUniverseLore(uid, { universeId: 'world', id: 'hero' });
  answer = await f.step('activateCampaignAdoption', p);
  p = answer.progress;
  assert.equal(answer.receipt.outcome, 'reauthorization-required');
  p = (await f.step('advanceCampaignAdoption', p)).progress;
  assert.equal(p.state, 'aborted');
  assert.equal(p.reason, 'source-unavailable');
  assert.equal(
    [...f.records.keys()].some((path) => path.includes('/loreVariantBodies/')),
    true,
  );
  assert.equal(f.records.get('campaigns/' + f.campaign.id).activeBaseId, f.campaign.activeBaseId);
  const after = await f.recovery.resolveCampaignLoreOperation(uid, {
    ...f.scope(),
    sourceKey: heroKey,
    expectedRevision: 0,
    operationId: op('local'),
    relatedSourceKeys: [],
    action: 'save',
    intent: 'confirm',
  });
  assert.equal(after.state, 'committed');
});
test('discard-local keeps an inactive tombstone and retained bytes; reentry keeps one sourceKey and continues its revision', async () => {
  const f = await fixture();
  await f.save('local');
  await f.removeReferences();
  const candidate = await f.candidate();
  let p = (await f.start(candidate)).result.progress;
  p = (
    await f.step('decideCampaignAdoption', p, {
      sourceKey: heroKey,
      expectedRevision: 1,
      choice: 'discard-local',
    })
  ).progress;
  p = await f.finish(p);
  await f.step('activateCampaignAdoption', p);
  f.campaign = f.acceptCampaign(f.records.get('campaigns/' + f.campaign.id));
  assert.equal((await f.lore.listCampaignLore(uid, f.scope())).items.length, 0);
  const tombstone = f.records.get(
    loreGenerationPath(f.campaign.id, p.loreGenerationId) + '/loreVariants/' + heroKey,
  );
  assert.equal(tombstone.participation, 'inactive');
  assert.equal(tombstone.revision, 2);
  assert.equal(tombstone.manifest, null);
  assert.equal(
    [...f.records.keys()].some((path) => path.includes('/loreVariantBodies/')),
    true,
  );
  const reference = { kind: 'universe', scopeId: 'world', entityId: 'hero' },
    target = { kind: 'adventure', id: f.scene.adventureId ?? 'comparison-adventure-001' };
  const scene = await f.scenes.getScene(uid, { target, sceneId: f.scene.id });
  await f.scenes.setSceneReference(uid, {
    target,
    sceneId: f.scene.id,
    reference,
    expectedRevision: scene.revision,
    operationId: op('reenter-reference'),
  });
  const next = await f.candidate('second');
  p = (await f.start(next, 'second-adoption')).result.progress;
  p = await f.finish(p);
  await f.step('activateCampaignAdoption', p);
  f.campaign = f.acceptCampaign(f.records.get('campaigns/' + f.campaign.id));
  const list = await f.lore.listCampaignLore(uid, f.scope());
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].sourceKey, heroKey);
  assert.equal(list.items[0].revision, 3);
  assert.equal(list.items[0].legacy, false);
  assert.equal(
    (await f.lore.getCampaignLore(uid, { ...f.scope(), sourceKey: heroKey })).item.entity.name,
    'Heroína',
  );
  await assert.rejects(
    f.api.cancelCampaignComparison(uid, {
      comparisonId: candidate.comparisonId,
      operationId: op('delete-older-adopted'),
      expectedCheckpoint: f.records.get(
        'users/' + uid + '/campaignComparisons/' + candidate.comparisonId,
      ).checkpoint,
    }),
    { code: 'failed-precondition' },
  );
});
test('prepared-to-committed racing remote cancel has a definitive receipt and neither closes the key nor needs the origin for a new explicit confirmation', async () => {
  const f = await fixture();
  const header = {
    ...f.scope(),
    sourceKey: heroKey,
    expectedRevision: 0,
    operationId: op('prepared-race'),
    relatedSourceKeys: [],
  };
  const prepared = await f.recovery.prepareCampaignLoreVariant(uid, header);
  const list = await f.remote.listCampaignLoreOperations(uid, f.scope());
  assert.equal(list.items[0].state, 'prepared');
  const input = {
    ...f.scope(),
    operationId: header.operationId,
    statusToken: list.items[0].statusToken,
    resolutionId: op('cancel-stale'),
    intent: 'cancel',
  };
  const { seal } = await import('./helpers/campaignLore.mjs');
  await f.lore.saveCampaignLoreVariant(uid, { ...header, sealed: seal(prepared, entity()) });
  const result = await f.remote.resolveCampaignLoreRemoteOperation(uid, input);
  assert.equal(result.outcome, 'rejected');
  assert.equal(result.reason, 'operation-changed');
  assert.equal(result.state, null);
  assert.equal(
    typeof f.records.get(`users/${uid}/campaignVariantOperations/${header.operationId}`).key,
    'string',
  );
  f.records.delete('campaigns/' + f.campaign.id);
  f.records.delete('adventures/comparison-adventure-001');
  assert.deepEqual(await f.remote.resolveCampaignLoreRemoteOperation(uid, input), result);
  const latest = (await f.remote.listCampaignLoreOperations(uid, f.scope())).items[0];
  assert.equal(latest.state, 'committed');
  const closed = await f.remote.resolveCampaignLoreRemoteOperation(uid, {
    ...input,
    statusToken: latest.statusToken,
    resolutionId: op('confirm-latest'),
    intent: 'confirm',
  });
  assert.equal(closed.state, 'confirmed');
  assert.equal(
    f.records.get(`users/${uid}/campaignVariantOperations/${header.operationId}`).key,
    undefined,
  );
});
test('scope/CAS changes and corrupt physical bindings fail closed, and canceled staging never deletes borrowed chunks', async () => {
  const f = await fixture();
  await f.save('local');
  const candidate = await f.candidate();
  const started = await f.start(candidate);
  let p = started.result.progress;
  await assert.rejects(f.adoptions.startCampaignAdoption('other', started.input), {
    code: 'not-found',
  });
  const chosen = { sourceKey: heroKey, expectedRevision: 1, choice: 'keep-local' };
  p = (await f.step('decideCampaignAdoption', p, chosen)).progress;
  await assert.rejects(
    f.adoptions.decideCampaignAdoption(uid, {
      adoptionId: p.adoptionId,
      operationId: op('new-stale-cas'),
      expectedCheckpoint: 0,
      ...chosen,
    }),
    reason('revision-conflict'),
  );
  p = (await f.step('prepareCampaignAdoption', p)).progress;
  p = (await f.step('advanceCampaignAdoption', p)).progress;
  p = (await f.step('advanceCampaignAdoption', p)).progress;
  const original = [...f.records].filter(([path]) => path.includes('/loreVariantBodies/'));
  for (let i = 0; i < 8 && p.state !== 'deleted'; i++)
    p = (await f.step('cancelCampaignAdoption', p)).progress;
  assert.equal(p.state, 'deleted');
  for (const [path, v] of original) assert.deepEqual(f.records.get(path), v);
  const overlayPath = 'campaigns/' + f.campaign.id + '/loreVariants/' + heroKey;
  f.records.set(overlayPath, {
    ...f.records.get(overlayPath),
    bodyBinding: {
      schemaVersion: 1,
      layout: 'legacy',
      generationId: null,
      baseId: 'f'.repeat(64),
      sourceKey: heroKey,
      bodyRevision: 1,
    },
  });
  await assert.rejects(f.lore.getCampaignLore(uid, { ...f.scope(), sourceKey: heroKey }), {
    code: 'failed-precondition',
  });
});
test('a complete authorization pass is bound to the persistent clock token, not merely a reusable epoch', async () => {
  const f = await fixture();
  const candidate = await f.candidate();
  let p = (await f.start(candidate)).result.progress;
  p = await f.finish(p);
  const rootBefore = structuredClone(f.records.get('campaigns/' + f.campaign.id));
  const ref = f.db.doc(`users/${uid}/campaignAuthorization/current`);
  await f.db.runTransaction(async (tx) => {
    const value = (await tx.get(ref)).data();
    tx.set(ref, { ...value, token: '0'.repeat(64) });
  });
  await assert.rejects(f.step('activateCampaignAdoption', p), reason('authorization-changed'));
  assert.deepEqual(f.records.get('campaigns/' + f.campaign.id), rootBefore);
});
test('save/discard reject corrupt old storage and chunk headers before deleting anything, without reading old prose for discard', async () => {
  const f = await fixture();
  await f.save('local');
  const path = 'campaigns/' + f.campaign.id + '/loreVariants/' + heroKey,
    valid = structuredClone(f.records.get(path));
  const bodyPath = [...f.records.keys()].find((p) => p.includes('/loreVariantBodies/'));
  const body = structuredClone(f.records.get(bodyPath));
  const attempt = (name) =>
    f.lore.discardCampaignLoreVariant(uid, {
      ...f.scope(),
      sourceKey: heroKey,
      expectedRevision: 1,
      operationId: op(name),
    });
  f.records.set(path, {
    ...valid,
    bodyBinding: {
      schemaVersion: 1,
      layout: 'generation',
      generationId: 'e'.repeat(64),
      baseId: f.campaign.activeBaseId,
      sourceKey: heroKey,
      bodyRevision: 1,
    },
  });
  await assert.rejects(attempt('missing-physical-generation'), { code: 'failed-precondition' });
  assert.deepEqual(f.records.get(bodyPath), body);
  f.records.set(path, valid);
  f.records.set(bodyPath, { ...body, campaignToken: 'f'.repeat(64) });
  const before = structuredClone([...f.records]);
  await assert.rejects(attempt('wrong-chunk-header'), { code: 'failed-precondition' });
  assert.deepEqual([...f.records], before);
  const headerRead = f.metadataReads.findLast((r) => r.path === bodyPath);
  assert.equal(headerRead.fields.includes('content'), false);
});
test('materialized overlays use the injected clock and reject revision overflow without writing an invalid generation', async () => {
  const f = await fixture();
  await f.save('local');
  const path = 'campaigns/' + f.campaign.id + '/loreVariants/' + heroKey;
  const initial = f.records.get(path);
  f.records.set(path, { ...initial, createdAt: 10, updatedAt: 20 });
  f.adoptions = createCampaignAdoptionService({ db: f.db, now: () => 50 });
  const candidate = await f.candidate();
  // f.step closes over its service; use a separate complete driver with the injected service.
  const input = {
    operationId: op('clock-plan'),
    campaignId: f.campaign.id,
    campaignToken: f.campaignToken,
    comparisonId: candidate.comparisonId,
    currentBaseId: f.campaign.activeBaseId,
    candidateBaseId: candidate.candidateBaseId,
    expectedCollectionRevision: 1,
  };
  let p = (await f.adoptions.startCampaignAdoption(uid, input)).progress;
  const step = async (method, p, extra = {}) =>
    (
      await f.adoptions[method](uid, {
        adoptionId: p.adoptionId,
        expectedCheckpoint: p.checkpoint,
        operationId: op('clock-' + method + '-' + p.checkpoint),
        ...extra,
      })
    ).progress;
  p = await step('decideCampaignAdoption', p, {
    sourceKey: heroKey,
    expectedRevision: 1,
    choice: 'keep-local',
  });
  p = await step('prepareCampaignAdoption', p);
  p = await step('advanceCampaignAdoption', p);
  p = await step('advanceCampaignAdoption', p);
  assert.equal(
    f.records.get(
      loreGenerationPath(f.campaign.id, p.loreGenerationId) + '/loreVariants/' + heroKey,
    ).updatedAt,
    50,
  );
  const g = await fixture();
  await g.save('local');
  const oldPath = 'campaigns/' + g.campaign.id + '/loreVariants/' + heroKey;
  g.records.set(oldPath, { ...g.records.get(oldPath), revision: Number.MAX_SAFE_INTEGER });
  const nextCandidate = await g.candidate();
  let q = (await g.start(nextCandidate)).result.progress;
  q = (
    await g.step('decideCampaignAdoption', q, {
      sourceKey: heroKey,
      expectedRevision: Number.MAX_SAFE_INTEGER,
      choice: 'keep-local',
    })
  ).progress;
  q = (await g.step('prepareCampaignAdoption', q)).progress;
  q = (await g.step('advanceCampaignAdoption', q)).progress;
  await assert.rejects(g.step('advanceCampaignAdoption', q), { code: 'invalid-argument' });
  assert.equal(
    g.records.has(
      loreGenerationPath(g.campaign.id, q.loreGenerationId) + '/loreVariants/' + heroKey,
    ),
    false,
  );
});
test('more than 25 overlays and fifty related entities fit bounded stages; final has no query and at most ten writes', async () => {
  const data = studioDb(),
    instrumented = measuredDb(data.db);
  const f = await adoptionFixture(instrumented.db, async ({ universe, scenes, scene }) => {
    for (let index = 0; index < 50; index++) {
      const id = 'target-' + String(index).padStart(2, '0');
      await universe.saveUniverseLore(uid, {
        universeId: 'world',
        id,
        create: true,
        input: {
          name: 'Alvo ' + index,
          category: 'character',
          summary: 'Resumo',
          details: 'Detalhes',
          isPublic: false,
          relations: Array.from({ length: 50 }, (_, r) => ({
            targetEntityId: 'universe:world:hero',
            relationType: 'Vínculo ' + r,
            description: '🐉'.repeat(2000),
          })),
        },
      });
      await scenes.setSceneReference(uid, {
        target,
        sceneId: scene.id,
        expectedRevision: (await scenes.getScene(uid, { target, sceneId: scene.id })).revision,
        reference: { kind: 'universe', scopeId: 'world', entityId: id },
        operationId: op('target-reference-' + index),
      });
    }
  });
  const { baseSourceKey } = await import('../src/campaignBaseContracts.mjs');
  const keys = Array.from({ length: 50 }, (_, index) =>
    baseSourceKey({
      kind: 'lore',
      scopeId: 'world',
      id: 'target-' + String(index).padStart(2, '0'),
    }),
  );
  for (let index = 0; index < 26; index++) {
    const header = {
      ...f.scope(),
      sourceKey: keys[index],
      expectedRevision: 0,
      operationId: op('remove-' + index),
    };
    await f.lore.removeCampaignLore(uid, header);
    await f.recovery.resolveCampaignLoreOperation(uid, {
      ...header,
      action: 'remove',
      intent: 'confirm',
    });
  }
  // Related targets must be active for a newly sealed save.
  for (let index = 0; index < 26; index++) {
    const header = {
      ...f.scope(),
      sourceKey: keys[index],
      expectedRevision: 1,
      operationId: op('restore-' + index),
    };
    await f.lore.restoreCampaignLore(uid, header);
    await f.recovery.resolveCampaignLoreOperation(uid, {
      ...header,
      action: 'restore',
      intent: 'confirm',
    });
  }
  await f.save(
    'large',
    0,
    entity({
      details: '🐉'.repeat(70000),
      relations: keys.map((targetKey) => ({
        targetKey,
        relationType: 'Conhece',
        description: 'Relação 🐉',
      })),
    }),
  );
  const candidate = await f.candidate();
  let p = (await f.start(candidate)).result.progress;
  let cursor;
  const rows = [];
  do {
    const page = await f.adoptions.listCampaignAdoptionDecisions(uid, {
      adoptionId: p.adoptionId,
      limit: 25,
      ...(cursor ? { cursor } : {}),
    });
    rows.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(rows.length, 27);
  const metadataStart = data.metadataReads.length;
  const window = await f.lore.listCampaignLore(uid, { ...f.scope(), limit: 50 });
  assert.equal(window.items.length, 50);
  for (const read of data.metadataReads
    .slice(metadataStart)
    .filter((r) => r.path.includes('/items/'))) {
    assert.equal(read.fields.includes('structured'), false);
    assert.equal(read.fields.includes('structured.relations'), false);
    assert.equal(read.fields.includes('fields'), false);
  }
  for (const row of rows.filter((r) => r.required))
    p = (
      await f.step('decideCampaignAdoption', p, {
        sourceKey: row.sourceKey,
        expectedRevision: row.revision,
        choice: 'keep-local',
      })
    ).progress;
  p = await f.finish(p);
  const before = structuredClone(
    [...data.records].filter(([path]) => path.includes('/loreVariantBodies/')),
  );
  await f.step('activateCampaignAdoption', p);
  const final = instrumented.measurements.at(-1);
  assert.equal(final.queries, 0);
  assert.ok(final.writes <= 10);
  assert.ok(final.reads <= 384);
  assert.ok(final.readBytes <= 4 * 1024 * 1024);
  assert.ok(final.writeBytes <= 2 * 1024 * 1024);
  assert.equal(final.bodyReads, 0);
  for (const [path, value] of before) assert.deepEqual(data.records.get(path), value);
  for (const m of instrumented.measurements) {
    assert.ok(m.reads <= 384);
    assert.ok(m.writes <= 64);
  }
});
test('an already retained legacy remains legacy while revoked and returns through its original frozen anchor when access is restored', async () => {
  const f = await fixture();
  await f.save('local');
  await f.removeReferences();
  const first = await f.candidate();
  let p = (await f.start(first)).result.progress;
  p = (
    await f.step('decideCampaignAdoption', p, {
      sourceKey: heroKey,
      expectedRevision: 1,
      choice: 'keep-local',
    })
  ).progress;
  p = await f.finish(p);
  await f.step('activateCampaignAdoption', p);
  f.campaign = f.acceptCampaign(f.records.get('campaigns/' + f.campaign.id));
  await f.universe.deleteUniverseLore(uid, { universeId: 'world', id: 'hero' });
  assert.equal(
    (await f.lore.getCampaignLore(uid, { ...f.scope(), sourceKey: heroKey })).item,
    null,
  );
  const second = await f.candidate('second');
  p = (await f.start(second, 'second-plan')).result.progress;
  assert.equal(
    (await f.adoptions.listCampaignAdoptionDecisions(uid, { adoptionId: p.adoptionId })).items
      .length,
    0,
  );
  p = await f.finish(p);
  await f.step('activateCampaignAdoption', p);
  f.campaign = f.acceptCampaign(f.records.get('campaigns/' + f.campaign.id));
  assert.equal(
    f.records.get(
      loreGenerationPath(f.campaign.id, p.loreGenerationId) + '/loreVariants/' + heroKey,
    ).participation,
    'legacy',
  );
  await f.universe.saveUniverseLore(uid, {
    universeId: 'world',
    id: 'hero',
    create: true,
    input: { name: 'Nome novo vivo', category: 'character', summary: 'Novo', isPublic: false },
  });
  const read = await f.lore.getCampaignLore(uid, { ...f.scope(), sourceKey: heroKey });
  assert.equal(read.item.legacy, true);
  assert.equal(read.item.entity.name, entity().name);
  assert.equal(read.item.revision, 3);
});
test('a first unavailable unselected override stays inert without prose reads and can be explicitly retained after reentry', async () => {
  const f = await fixture();
  await f.save('local');
  await f.universe.deleteUniverseLore(uid, { universeId: 'world', id: 'hero' });
  const candidate = await f.candidate();
  let p = (await f.start(candidate)).result.progress;
  assert.equal(
    (await f.adoptions.listCampaignAdoptionDecisions(uid, { adoptionId: p.adoptionId })).items
      .length,
    0,
  );
  p = await f.finish(p);
  await f.step('activateCampaignAdoption', p);
  f.campaign = f.acceptCampaign(f.records.get('campaigns/' + f.campaign.id));
  const inert = f.records.get(
    loreGenerationPath(f.campaign.id, p.loreGenerationId) + '/loreVariants/' + heroKey,
  );
  assert.equal(inert.participation, 'inactive');
  assert.equal(inert.mode, 'override');
  assert.equal(inert.manifest.bodyRevision, 1);
  await f.universe.saveUniverseLore(uid, {
    universeId: 'world',
    id: 'hero',
    create: true,
    input: { name: 'Restaurada viva', category: 'character', summary: 'Novo', isPublic: false },
  });
  assert.equal((await f.lore.listCampaignLore(uid, f.scope())).items.length, 0);
  const second = await f.candidate('second');
  p = (await f.start(second, 'second-plan')).result.progress;
  const row = (await f.adoptions.listCampaignAdoptionDecisions(uid, { adoptionId: p.adoptionId }))
    .items[0];
  assert.equal(row.required, true);
  assert.equal(row.candidate.present, true);
  p = (
    await f.step('decideCampaignAdoption', p, {
      sourceKey: heroKey,
      expectedRevision: 2,
      choice: 'keep-local',
    })
  ).progress;
  p = await f.finish(p);
  await f.step('activateCampaignAdoption', p);
  f.campaign = f.acceptCampaign(f.records.get('campaigns/' + f.campaign.id));
  const read = await f.lore.getCampaignLore(uid, { ...f.scope(), sourceKey: heroKey });
  assert.equal(read.item.legacy, false);
  assert.equal(read.item.entity.details, entity().details);
  assert.equal(read.item.revision, 3);
});
async function relatedFixture() {
  const data = studioDb();
  const f = {
    ...data,
    ...(await adoptionFixture(data.db, async ({ universe, scenes, scene }) => {
      await universe.saveUniverseLore(uid, {
        universeId: 'world',
        id: 'ally',
        create: true,
        input: { name: 'Aliada', category: 'character', summary: 'Resumo', isPublic: false },
      });
      await scenes.setSceneReference(uid, {
        target,
        sceneId: scene.id,
        expectedRevision: (await scenes.getScene(uid, { target, sceneId: scene.id })).revision,
        reference: { kind: 'universe', scopeId: 'world', entityId: 'ally' },
        operationId: op('ally-reference'),
      });
    })),
  };
  f.allyKey = baseSourceKey({ kind: 'lore', scopeId: 'world', id: 'ally' });
  const value = entity({
    relations: [
      { targetKey: f.allyKey, relationType: 'Conhece', description: 'Descrição preservada' },
    ],
  });
  await f.save('local', 0, value);
  return f;
}
test('keeping a variant and an already removed target preserves its bytes and the previously suppressed relationship', async () => {
  const f = await relatedFixture();
  const h = {
    ...f.scope(),
    sourceKey: f.allyKey,
    operationId: op('remove-ally'),
    expectedRevision: 0,
  };
  await f.lore.removeCampaignLore(uid, h);
  await f.recovery.resolveCampaignLoreOperation(uid, { ...h, action: 'remove', intent: 'confirm' });
  assert.equal(
    (await f.lore.getCampaignLore(uid, { ...f.scope(), sourceKey: heroKey })).item.entity.relations
      .length,
    0,
  );
  const bodies = structuredClone(
    [...f.records].filter(([path]) => path.includes('/loreVariantBodies/')),
  );
  const candidate = await f.candidate();
  let p = (await f.start(candidate)).result.progress;
  const rows = (await f.adoptions.listCampaignAdoptionDecisions(uid, { adoptionId: p.adoptionId }))
    .items;
  for (const row of rows)
    p = (
      await f.step('decideCampaignAdoption', p, {
        sourceKey: row.sourceKey,
        expectedRevision: row.revision,
        choice: 'keep-local',
      })
    ).progress;
  p = await f.finish(p);
  await f.step('activateCampaignAdoption', p);
  f.campaign = f.acceptCampaign(f.records.get('campaigns/' + f.campaign.id));
  assert.equal(
    (await f.lore.getCampaignLore(uid, { ...f.scope(), sourceKey: heroKey })).item.entity.relations
      .length,
    0,
  );
  for (const [path, value] of bodies) assert.deepEqual(f.records.get(path), value);
});
test('discarding a previously visible relationship target aborts adoption instead of silently hiding that relationship', async () => {
  const f = await relatedFixture();
  await f.save('ally-local', 0, entity({ name: 'Aliada adaptada' }), f.allyKey);
  const scene = await f.scenes.getScene(uid, { target, sceneId: f.scene.id });
  await f.scenes.setSceneReference(uid, {
    target,
    sceneId: f.scene.id,
    operationId: op('remove-ally-ref'),
    expectedRevision: scene.revision,
    reference: { kind: 'universe', scopeId: 'world', entityId: 'ally' },
    remove: true,
  });
  const candidate = await f.candidate();
  let p = (await f.start(candidate)).result.progress;
  const rows = (await f.adoptions.listCampaignAdoptionDecisions(uid, { adoptionId: p.adoptionId }))
    .items;
  for (const row of rows)
    p = (
      await f.step('decideCampaignAdoption', p, {
        sourceKey: row.sourceKey,
        expectedRevision: row.revision,
        choice: row.sourceKey === heroKey ? 'keep-local' : 'discard-local',
      })
    ).progress;
  p = (await f.step('prepareCampaignAdoption', p)).progress;
  for (let i = 0; i < 20 && p.state === 'preparing'; i++)
    p = (await f.step('advanceCampaignAdoption', p)).progress;
  assert.equal(p.state, 'aborted');
  assert.equal(p.reason, 'relations-incompatible');
  assert.equal(f.records.get('campaigns/' + f.campaign.id).activeBaseId, f.campaign.activeBaseId);
  assert.equal(
    (await f.lore.getCampaignLore(uid, { ...f.scope(), sourceKey: heroKey })).item.entity
      .relations[0].targetName,
    'Aliada adaptada',
  );
});
test('an explicitly null generation never falls back to legacy storage', async () => {
  const f = await fixture();
  await f.save('local');
  const path = 'campaigns/' + f.campaign.id;
  f.records.set(path, { ...f.records.get(path), activeLoreGenerationId: null });
  await assert.rejects(f.lore.getCampaignLore(uid, { ...f.scope(), sourceKey: heroKey }), {
    code: 'failed-precondition',
  });
});
test('a future remote receipt schema is rejected even with the same private request fingerprint', async () => {
  const f = await fixture();
  await f.save('local', 0, entity(), heroKey, false);
  const row = (await f.remote.listCampaignLoreOperations(uid, f.scope())).items[0];
  const input = {
    ...f.scope(),
    operationId: row.operationId,
    statusToken: row.statusToken,
    resolutionId: op('close-schema'),
    intent: 'confirm',
  };
  await f.remote.resolveCampaignLoreRemoteOperation(uid, input);
  const path = `users/${uid}/campaignVariantResolutionOperations/${input.resolutionId}`;
  f.records.set(path, { ...f.records.get(path), schemaVersion: 2 });
  await assert.rejects(f.remote.resolveCampaignLoreRemoteOperation(uid, input), {
    code: 'failed-precondition',
  });
});
test('staging progress redacts its count after observing an inaccessible participant although the adventure stays authorized', async () => {
  const f = await fixture();
  await f.save('local');
  await f.universe.deleteUniverseLore(uid, { universeId: 'world', id: 'hero' });
  const candidate = await f.candidate();
  let p = (await f.start(candidate)).result.progress;
  p = (await f.step('prepareCampaignAdoption', p)).progress;
  p = (await f.step('advanceCampaignAdoption', p)).progress;
  p = (await f.step('advanceCampaignAdoption', p)).progress;
  assert.equal(p.sourceAvailable, true);
  assert.equal(p.processed, null);
  const latest = await f.adoptions.getCampaignAdoption(uid, { adoptionId: p.adoptionId });
  assert.equal(latest.processed, null);
});
