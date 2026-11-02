import test from 'node:test';
import assert from 'node:assert/strict';
import {
  restoredBackupFixture,
  recreate,
  uid,
  adventureId,
} from './helpers/campaignRestoredBackup.mjs';
import { campaignBackupTestIndexes } from './helpers/campaignBackupTestIndexes.mjs';
import { entity } from './helpers/campaignBackupLore.mjs';
import { createCampaignSessionsService } from '../src/campaignSessions.mjs';
import { createCampaignSessionReferencesService } from '../src/campaignSessionReferences.mjs';
import { createCampaignSessionScenesService } from '../src/campaignSessionScenes.mjs';
import { createCampaignBackupReviewService } from '../src/campaignBackupReview.mjs';
import { digest } from '../src/workProgressContracts.mjs';
import {
  parseCampaignBackupOwnContent,
  serializeCampaignBackupOwnContent,
} from '../src/campaignBackupOwnContent.mjs';
const bad = (e) => e.details?.reason === 'campaign-restored-source-inconsistent';
async function fixture() {
  const f = await restoredBackupFixture({ local: true, long: true }),
    fullReads = [],
    downloads = [];
  const db = {
    ...f.db,
    runTransaction: (fn) =>
      f.db.runTransaction((tx) =>
        fn({
          ...tx,
          get: (ref) => {
            if (ref.path) fullReads.push(ref.path);
            return tx.get(ref);
          },
        }),
      ),
  };
  const sessions = createCampaignSessionsService({ db, now: () => 100 });
  const start = await sessions.listCampaignSessions(uid, { campaignId: f.id });
  const sessionId = 'restored-session-material-001';
  await sessions.saveCampaignSession(uid, {
    campaignId: f.id,
    campaignToken: start.campaignToken,
    sessionId,
    operationId: sessionId,
    expectedRevision: 0,
    title: 'Mesa',
    summary: 'Preparação própria intacta 🐉',
    scheduledDate: null,
    status: 'planned',
  });
  const scope = {
    campaignId: f.id,
    campaignToken: start.campaignToken,
    sessionId,
    expectedSessionRevision: 1,
  };
  const refs = createCampaignSessionReferencesService({ db, now: () => 200 });
  const source = (
    await refs.listCampaignSessionReferences(uid, { ...scope, view: 'references', kind: 'scene' })
  ).sourceContext;
  const scene = f.items().find((i) => i.kind === 'scene'),
    main = f
      .items()
      .find((i) => i.kind === 'block' && i.role === 'main' && i.parentKey === scene.sourceKey);
  const additional = f
    .items()
    .find((i) => i.kind === 'block' && i.role === 'additional' && i.parentKey === scene.sourceKey);
  const lore = f.items().find((i) => i.origin.kind === 'lore');
  const ids = { scene: 'restored-session-scene-link', lore: 'restored-session-lore-link' };
  let collection = 0;
  for (const [kind, item] of [
    ['scene', scene],
    ['lore', lore],
  ])
    await refs.addCampaignSessionReference(uid, {
      ...scope,
      referenceId: ids[kind],
      operationId: ids[kind],
      expectedReferenceCollectionRevision: collection++,
      sourceContext: source,
      target: { kind, sourceKey: item.sourceKey },
    });
  const assets = {
    metadata: (...args) => f.storage.metadata(...args),
    readGeneration: async (path, generation) => {
      downloads.push({ path, generation });
      assert.equal(path, f.storagePath);
      assert.equal(generation, f.generation);
      await f.onDownload?.();
      return Buffer.from(f.bytes);
    },
  };
  const material = createCampaignSessionScenesService({ db, assets });
  const input = {
    ...scope,
    referenceId: ids.scene,
    expectedRevision: 1,
    expectedReferenceCollectionRevision: 2,
    sourceContext: source,
  };
  const list = (kind = 'scene', view = 'references') =>
    refs.listCampaignSessionReferences(uid, {
      ...scope,
      kind,
      view,
      ...(view === 'candidates' ? { sourceContext: source } : {}),
    });
  return {
    ...f,
    db,
    fullReads,
    downloads,
    sessions,
    refs,
    material,
    scope,
    source,
    input,
    scene,
    main,
    additional,
    lore,
    ids,
    list,
    original: f,
    beforeSession: structuredClone(f.records.get(f.path + '/sessions/' + sessionId)),
  };
}
const noMaterialReads = (f) => {
  assert.ok(!f.fullReads.some((p) => p.includes('/bodies/') || p.includes('/loreVariantBodies/')));
  assert.equal(f.downloads.length, 0);
};
test('restored session reads complete frozen scene, blocks, effective lore and pinned image with no own-text changes', async () => {
  const f = await fixture();
  const page = await f.list();
  assert.equal(page.items[0].target.sourceKey, f.scene.sourceKey);
  const blocks = await f.material.listCampaignSessionSceneBlocks(uid, f.input);
  assert.ok(blocks.items.some((b) => b.role === 'main'));
  assert.ok(blocks.items.some((b) => b.role === 'additional'));
  const main = await f.material.readCampaignSessionSceneReference(uid, {
    ...f.input,
    blockKey: f.main.sourceKey,
  });
  assert.match(main.material.chunks.map((c) => c.content).join(''), /🐉á/);
  const imageBlock = [f.main, f.additional].find((b) => b.image);
  assert.ok(imageBlock);
  const image = await f.material.readCampaignSessionSceneImage(uid, {
    ...f.input,
    blockKey: imageBlock.sourceKey,
  });
  assert.match(image.dataUrl, /^data:image\/webp;base64,/);
  const lore = await f.refs.readCampaignSessionLoreReference(uid, {
    ...f.input,
    referenceId: f.ids.lore,
  });
  assert.ok(lore.material.entity.details);
  assert.deepEqual(f.records.get(f.path + '/sessions/' + f.scope.sessionId), f.beforeSession);
  for (const dto of [page, blocks, main, image, lore])
    assert.doesNotMatch(JSON.stringify(dto), /sourceEvidence|archiveHash|sourceMode/);
});
for (const [name, mutate] of [
  [
    'missing proof',
    (i) => {
      delete i.sourceEvidence;
    },
  ],
  [
    'null proof',
    (i) => {
      i.sourceEvidence = null;
    },
  ],
  [
    'wrong chain',
    (i) => {
      i.sourceEvidence.archiveHash = digest('other');
    },
  ],
  [
    'wrong archived base',
    (i) => {
      i.sourceEvidence.source.baseId = digest('other');
    },
  ],
  [
    'unavailable witness',
    (i) => {
      i.sourceEvidence.source = {
        kind: 'item',
        baseId: i.sourceEvidence.source.baseId,
        sourceKey: i.sourceKey,
        availability: 'unavailable',
      };
    },
  ],
])
  test(
    'scene proof rejects ' + name + ' in references, candidates and material before prose',
    async () => {
      const f = await fixture();
      mutate(f.records.get(f.basePath + '/items/' + f.scene.sourceKey));
      f.fullReads.length = 0;
      await assert.rejects(f.list(), bad);
      await assert.rejects(f.list('scene', 'candidates'), bad);
      await assert.rejects(
        f.refs.addCampaignSessionReference(uid, {
          ...f.scope,
          referenceId: 'restored-invalid-new-scene-link',
          operationId: 'restored-invalid-new-scene-link',
          expectedReferenceCollectionRevision: 2,
          sourceContext: f.source,
          target: { kind: 'scene', sourceKey: f.scene.sourceKey },
        }),
        bad,
      );
      assert.equal(
        f.records.get(f.path + '/sessionReferenceState/' + f.scope.sessionId).revision,
        2,
      );
      await assert.rejects(f.material.readCampaignSessionSceneReference(uid, f.input), bad);
      await assert.rejects(f.material.listCampaignSessionSceneBlocks(uid, f.input), bad);
      noMaterialReads(f);
    },
  );
for (const [name, mutate] of [
  [
    'missing proof',
    (i) => {
      delete i.sourceEvidence;
    },
  ],
  [
    'null proof',
    (i) => {
      i.sourceEvidence = null;
    },
  ],
  [
    'wrong chain',
    (i) => {
      i.sourceEvidence.archiveHash = digest('other');
    },
  ],
  [
    'wrong key',
    (i) => {
      i.sourceEvidence.source.sourceKey = digest('other');
    },
  ],
])
  test('block proof rejects ' + name + ' in list, text and image before Storage', async () => {
    const f = await fixture(),
      block = [f.main, f.additional].find((i) => i.image);
    mutate(f.records.get(f.basePath + '/items/' + block.sourceKey));
    f.fullReads.length = 0;
    await assert.rejects(f.material.listCampaignSessionSceneBlocks(uid, f.input), bad);
    await assert.rejects(
      f.material.readCampaignSessionSceneReference(uid, { ...f.input, blockKey: block.sourceKey }),
      bad,
    );
    await assert.rejects(
      f.material.readCampaignSessionSceneImage(uid, { ...f.input, blockKey: block.sourceKey }),
      bad,
    );
    noMaterialReads(f);
  });
test('unavailable own reference remains a declaration, with no old-base, live-lore or name fallback', async () => {
  const f = await fixture(),
    referenceId = 'restored-missing-session-link',
    sourceKey = digest('absent-frozen-scene');
  const dto = serializeCampaignBackupOwnContent('session-reference', referenceId, {
    sessionId: f.scope.sessionId,
    target: { kind: 'scene', sourceKey },
    createdAt: 1,
    updatedAt: 1,
  });
  const parsed = parseCampaignBackupOwnContent('session-reference', referenceId, dto.bytes);
  f.records.set(f.path + '/sessionReferences/' + referenceId, {
    schemaVersion: 1,
    ownerId: uid,
    campaignId: f.id,
    campaignToken: f.scope.campaignToken,
    id: referenceId,
    revision: 1,
    deleted: false,
    ...parsed.data,
  });
  const control = f.records.get(f.path + '/sessionReferenceState/' + f.scope.sessionId);
  control.revision = 3;
  f.fullReads.length = 0;
  f.metadataReads.length = 0;
  const page = await f.list();
  assert.equal(page.items.find((r) => r.id === referenceId).available, false);
  const read = await f.material.readCampaignSessionSceneReference(uid, {
    ...f.input,
    referenceId,
    expectedReferenceCollectionRevision: 3,
  });
  assert.equal(read.material, null);
  assert.ok(!f.fullReads.some((p) => p === f.oldBasePath || p.startsWith(f.oldBasePath + '/')));
  assert.ok(
    !f.metadataReads.some(
      (r) =>
        r.path.startsWith('adventures/' + adventureId + '/scenes/') ||
        r.path.startsWith('adventures/' + adventureId + '/parts/') ||
        r.path.startsWith('universes/world/lore/'),
    ),
  );
  noMaterialReads(f);
  const opened = [],
    file = await f.write();
  const review = await createCampaignBackupReviewService({
    db: f.db,
    keys: f.keys,
    now: () => 6000,
    createIndex: campaignBackupTestIndexes(opened),
  }).reviewCampaignBackup(uid, {
    size: file.bytes.length,
    read: async (o, n) => file.bytes.subarray(o, o + n),
  });
  assert.equal(review.validation, 'campaign-backup-review-only');
  assert.ok(opened.every((p) => p.disposed === 1));
  assert.match(file.bytes.toString('utf8'), new RegExp(referenceId));
  assert.deepEqual(f.records.get(f.path + '/sessions/' + f.scope.sessionId), f.beforeSession);
});
test('a recreated adventure returns neutral session material before bodies and preserves preparation', async () => {
  const f = await fixture();
  recreate(f, 'adventures/' + adventureId);
  f.fullReads.length = 0;
  assert.equal((await f.list()).items[0].available, false);
  assert.equal((await f.material.readCampaignSessionSceneReference(uid, f.input)).material, null);
  assert.equal((await f.material.listCampaignSessionSceneBlocks(uid, f.input)).scene, null);
  assert.equal(
    (await f.refs.readCampaignSessionLoreReference(uid, { ...f.input, referenceId: f.ids.lore }))
      .material,
    null,
  );
  noMaterialReads(f);
  assert.deepEqual(f.records.get(f.path + '/sessions/' + f.scope.sessionId), f.beforeSession);
});
test('world loss preserves authorized scene/blocks while unavailable lore stays neutral', async () => {
  const f = await fixture();
  recreate(f, 'universes/world');
  const current = (await f.list()).sourceContext;
  assert.ok(
    (
      await f.material.readCampaignSessionSceneReference(uid, {
        ...f.input,
        sourceContext: current,
        blockKey: f.main.sourceKey,
      })
    ).material,
  );
  assert.equal((await f.list('lore')).items[0].available, false);
  assert.equal(
    (
      await f.refs.readCampaignSessionLoreReference(uid, {
        ...f.input,
        sourceContext: current,
        referenceId: f.ids.lore,
      })
    ).material,
    null,
  );
});
test('explicit adoption uses the new active base, invalidates old source context and keeps S1 untouched', async () => {
  const f = await fixture(),
    before = f.beforeSession;
  await f.original.adopt();
  await assert.rejects(
    f.material.readCampaignSessionSceneReference(uid, f.input),
    (e) => e.details?.reason === 'source-context-changed',
  );
  const current = (await f.list()).sourceContext;
  assert.notEqual(current.baseId, f.source.baseId);
  assert.ok(
    (
      await f.material.readCampaignSessionSceneReference(uid, {
        ...f.input,
        sourceContext: current,
        blockKey: f.main.sourceKey,
      })
    ).material,
  );
  assert.deepEqual(f.records.get(f.path + '/sessions/' + f.scope.sessionId), before);
});
test('effective override remains the session source and does not replace frozen original', async () => {
  const f = await fixture(),
    original = f.records.get(f.basePath + '/items/' + f.lore.sourceKey);
  await f.original.save(
    'session-effective-override',
    0,
    entity({ details: 'Texto efetivo da mesa 🐉' }),
  );
  const current = (await f.list('lore')).sourceContext;
  const projected = await f.refs.readCampaignSessionLoreReference(uid, {
    ...f.input,
    sourceContext: current,
    referenceId: f.ids.lore,
  });
  assert.equal(projected.material.entity.details, 'Texto efetivo da mesa 🐉');
  assert.deepEqual(f.records.get(f.basePath + '/items/' + f.lore.sourceKey), original);
});
test('image result is suppressed when its restored item proof changes during download', async () => {
  const f = await fixture(),
    block = [f.main, f.additional].find((i) => i.image);
  f.original.onDownload = () => {
    f.records.get(f.basePath + '/items/' + block.sourceKey).sourceEvidence.archiveHash =
      digest('changed');
  };
  await assert.rejects(
    f.material.readCampaignSessionSceneImage(uid, { ...f.input, blockKey: block.sourceKey }),
    bad,
  );
  assert.equal(f.downloads.length, 1);
});
