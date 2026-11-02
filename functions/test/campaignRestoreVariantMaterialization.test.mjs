import test from 'node:test';
import assert from 'node:assert/strict';
import {
  variantMaterializationFixture as fixture,
  finishVariants,
  generationPath,
  variantRestoreRoot as root,
  uid,
  rid,
  mut,
} from './helpers/campaignVariantMaterialization.mjs';
import { createCampaignRestoreTransferService } from '../src/campaignRestoreTransfer.mjs';
import { createCampaignLoreService } from '../src/campaignLore.mjs';
import { readVariantEntity, overlayRecord } from '../src/campaignLoreContracts.mjs';
import { signedOriginCampaign } from './helpers/campaignOriginRestore.mjs';
import { rewriteCampaignBackupTestFile } from './helpers/campaignBackupRewrite.mjs';
import { restoredAnchorBaseId } from '../src/campaignRestoreVariantFormat.mjs';
import { digest } from '../src/sceneContracts.mjs';
import { entity } from './helpers/campaignBackupLore.mjs';

const next = (f, p, name = 'variant-next-operation-01', limit = 25) =>
  f.api.advanceCampaignRestoreVariants(uid, mut(p, name, { limit }));
async function beforeVariant(f) {
  const port = await f.api.openCampaignRestoreDerivedIndex(uid, {
      restoreId: rid,
      jobToken: f.p.jobToken,
    }),
    rows = [];
  for (let n = 0; n < port.certificate.rows; n += 25)
    rows.push(...(await port.read(n, Math.min(25, port.certificate.rows - n))));
  const row = rows.find((r) => r.section === 'variant' && r.value.unit.outcome === 'available');
  let p = f.p,
    count = 0;
  while ((p.variantMaterialization?.processedRows ?? 0) < row.index && count++ < 10000)
    p = (await next(f, p, 'variant-pos-' + digest(p.checkpoint), 1)).progress;
  return { p, port, row };
}
const variants = (f, p) =>
  [...f.records]
    .filter(([k]) => k.startsWith(generationPath(f, p) + '/loreVariants/'))
    .map(([, v]) => v);

test('variants materialize native generation and bodies; ordinary body reader preserves UTF8', async () => {
  const f = await fixture(),
    p = await finishVariants(f),
    path = generationPath(f, p),
    result = await f.api.getCampaignRestoreVariants(uid, { restoreId: rid, jobToken: p.jobToken }),
    overlay = variants(f, p)[0],
    generation = f.records.get(path);
  assert.equal(result.validation, 'campaign-variants-materialized-only');
  assert.equal(result.variants, 1);
  assert.equal(generation.state, 'preparing');
  assert.equal(overlay.mode, 'override');
  assert.equal(overlay.revision, 1);
  assert.equal(overlay.bodyCodec, 'portable-relations-v1');
  assert.equal(overlay.bodyBinding.generationId, result.generationId);
  assert.equal(f.records.get('campaigns/' + p.campaignId).ownerId, undefined);
  assert.doesNotMatch(JSON.stringify(p), /payload|SECRET ORIGIN TEXT/);
  // Only the fixture releases the generation to exercise the existing body reader.
  f.records.set(path, { ...generation, state: 'ready' });
  const c = {
    uid,
    campaignId: p.campaignId,
    campaignToken: overlay.campaignToken,
    base: { id: overlay.baseId },
    generationId: result.generationId,
  };
  const read = await f.db.runTransaction((tx) => readVariantEntity(tx, f.db, c, overlay));
  assert.equal(read.details, 'SECRET ORIGIN TEXT');
  overlayRecord(overlay, c, overlay.sourceKey);
  assert.equal(overlay.anchor.capturedBaseId, overlay.baseId);
  // TEST ONLY: production activation and control creation remain a future gate.
  const draft = await f.api.getCampaignRestoreOwnProject(uid, {
      restoreId: rid,
      jobToken: p.jobToken,
    }),
    basePath = 'users/' + uid + '/campaignBases/' + overlay.baseId,
    base = f.records.get(basePath);
  f.records.set(basePath, { ...base, state: 'ready' });
  f.records.set('campaigns/' + p.campaignId, {
    ...draft.project,
    ownerId: uid,
    schemaVersion: 1,
    revision: 1,
    activeBaseId: overlay.baseId,
    activeLoreGenerationId: result.generationId,
    provenance: { kind: 'original', adventureId: base.adventureId, baseId: overlay.baseId },
  });
  f.records.set('campaigns/' + p.campaignId + '/loreVariantState/current', {
    schemaVersion: 1,
    ownerId: uid,
    campaignId: p.campaignId,
    campaignToken: overlay.campaignToken,
    baseId: overlay.baseId,
    revision: 1,
  });
  const api = createCampaignLoreService({ db: f.db }),
    request = {
      campaignId: p.campaignId,
      campaignToken: overlay.campaignToken,
      baseId: overlay.baseId,
      sourceKey: overlay.sourceKey,
    };
  assert.equal((await api.getCampaignLore(uid, request)).item.entity.details, 'SECRET ORIGIN TEXT');
  f.records.get('universes/world').deleting = true;
  assert.equal((await api.getCampaignLore(uid, request)).item, null);
});

test('long variant uses bounded encrypted checkpoint and resumes in a new service', async () => {
  const original = await signedOriginCampaign();
  const text = '\ufeff  ' + '🐉á'.repeat(24000) + '\n ';
  await original.save(
    'variant-long-native',
    1,
    entity({
      details: text,
      structuredDetails: { appearance: text, personality: '', history: '', notes: '' },
    }),
  );
  original.file = await original.makeFile();
  const f = await fixture(original),
    at = await beforeVariant(f),
    response = await next(f, at.p),
    p = response.progress,
    job = f.records.get(root);
  assert.equal(p.variantMaterialization.variants, 0);
  assert.ok(Buffer.from(job.variantMaterialization.payload.data, 'base64').length < 8192);
  assert.doesNotMatch(JSON.stringify(job.variantMaterialization), /🐉|SECRET|details/);
  assert.equal(variants(f, p).length, 0);
  assert.equal(
    [...f.records.keys()].filter((k) => k.startsWith(generationPath(f, p) + '/loreVariantBodies/'))
      .length,
    3,
  );
  f.api = createCampaignRestoreTransferService({ db: f.db, keys: f.keys });
  const end = await finishVariants(f, p),
    overlay = variants(f, end)[0];
  f.records.get(generationPath(f, end)).state = 'ready';
  const read = await f.db.runTransaction((tx) =>
    readVariantEntity(
      tx,
      f.db,
      {
        uid,
        campaignId: end.campaignId,
        campaignToken: overlay.campaignToken,
        base: { id: overlay.baseId },
        generationId: generationPath(f, end).split('/').at(-1),
      },
      overlay,
    ),
  );
  assert.equal(read.details, text);
  assert.equal(read.structuredDetails.appearance, text);
});

test('variant replay and competing checkpoint never duplicate native bodies', async () => {
  const f = await fixture(),
    { p } = await beforeVariant(f),
    request = mut(p, 'variant-replay-operation-01', { limit: 25 }),
    first = await f.api.advanceCampaignRestoreVariants(uid, request),
    before = structuredClone([...f.records]),
    again = await f.api.advanceCampaignRestoreVariants(uid, request);
  assert.deepEqual(again.receipt, first.receipt);
  assert.deepEqual([...f.records], before);
  await assert.rejects(
    next(f, p, 'variant-racing-operation-01'),
    (e) => e.details?.reason === 'checkpoint-conflict',
  );
});

test('revocation during variant bytes rolls back; same origin can be revalidated and retried', async () => {
  const f = await fixture(),
    { p, port } = await beforeVariant(f),
    path = 'adventures/' + port.context.active.adventure.id,
    open = f.api.openCampaignRestoreSource.bind(f.api),
    before = structuredClone([...f.records]);
  let revoke = true;
  f.api.openCampaignRestoreSource = async (...args) => {
    const source = await open(...args);
    return {
      ...source,
      read: async (...range) => {
        const bytes = await source.read(...range);
        if (revoke) {
          revoke = false;
          f.records.get(path).ownerId = 'other';
        }
        return bytes;
      },
    };
  };
  await assert.rejects(next(f, p), (e) => e.details?.reason === 'campaign-backup-origin-changed');
  assert.equal(f.records.get(root).checkpoint, p.checkpoint);
  assert.equal(variants(f, p).length, 0);
  f.records.get(path).ownerId = uid;
  f.api.openCampaignRestoreSource = open;
  assert.deepEqual([...f.records], before);
  assert.equal((await next(f, p)).progress.checkpoint, p.checkpoint + 1);
});

test('denied variant origin is omitted before prose while local data and frozen base survive', async () => {
  const f = await fixture(),
    { p } = await beforeVariant(f),
    open = f.api.openCampaignRestoreSource.bind(f.api);
  f.records.get('universes/world').deleting = true;
  let reads = 0;
  f.api.openCampaignRestoreSource = async (...args) => {
    const source = await open(...args);
    return {
      ...source,
      read: async (...range) => {
        reads++;
        return source.read(...range);
      },
    };
  };
  const end = await finishVariants(f, p),
    result = await f.api.getCampaignRestoreVariants(uid, { restoreId: rid, jobToken: p.jobToken });
  assert.equal(result.variants, 0);
  assert.equal(result.omitted, 1);
  assert.equal(reads, 0);
  assert.equal(end.ownMaterialization.phase, 'ready');
  assert.equal(end.baseMaterialization.phase, 'ready');
});

for (const state of [
  { mode: 'base', participation: 'candidate', retainedLegacy: false },
  { mode: 'removed', previousMode: 'override', participation: 'inactive', retainedLegacy: true },
  { mode: 'removed', previousMode: 'base', participation: 'legacy', retainedLegacy: true },
])
  test('portable variant preserves state ' + JSON.stringify(state), async () => {
    const original = await signedOriginCampaign();
    await rewriteCampaignBackupTestFile(original, (groups) => {
      const g = groups.find((x) => x.unit?.section === 'variant'),
        value = JSON.parse(Buffer.concat(g.chunks));
      Object.assign(value, state);
      if ((state.previousMode ?? state.mode) === 'base') delete value.entity;
      g.chunks = [Buffer.from(JSON.stringify(value))];
    });
    const f = await fixture(original),
      p = await finishVariants(f),
      overlay = variants(f, p)[0];
    for (const [key, value] of Object.entries(state)) assert.equal(overlay[key], value);
    if ((state.previousMode ?? state.mode) === 'base') {
      assert.equal(overlay.manifest, undefined);
      assert.equal(overlay.bodyBinding, undefined);
    } else assert.equal(overlay.manifest.bodyRevision, 1);
  });

test('historical anchor after actual adoption maps to a distinct reserved historical base', async () => {
  const original = await signedOriginCampaign();
  await original.removeReferences();
  await original.adopt();
  original.file = await original.makeFile();
  const f = await fixture(original),
    { row, p: before } = await beforeVariant(f),
    p = await finishVariants(f, before),
    overlay = variants(f, p)[0],
    expected = restoredAnchorBaseId({ uid, rid, token: p.jobToken }, row.value.meta.anchorKey);
  assert.equal(overlay.anchor.capturedBaseId, expected);
  assert.notEqual(expected, overlay.baseId);
  assert.equal(f.records.has('users/' + uid + '/campaignBases/' + expected), false);
  assert.equal(f.records.get(generationPath(f, p)).state, 'preparing');
});

test('unresolved v3 relation remains opaque through native serialization', async () => {
  const original = await signedOriginCampaign(),
    opaque = 'f'.repeat(64);
  await rewriteCampaignBackupTestFile(original, (groups) => {
    const g = groups.find((x) => x.unit?.section === 'variant'),
      value = JSON.parse(Buffer.concat(g.chunks));
    value.entity.relations = [{ targetKey: opaque, available: false, unresolved: true }];
    g.chunks = [Buffer.from(JSON.stringify(value))];
  });
  const f = await fixture(original),
    p = await finishVariants(f),
    bodies = [...f.records]
      .filter(([k]) => k.startsWith(generationPath(f, p) + '/loreVariantBodies/'))
      .map(([, v]) => v)
      .sort((a, b) => a.index - b.index),
    entity = JSON.parse(bodies.map((b) => b.content).join(''));
  assert.deepEqual(entity.relations, [{ targetKey: opaque, available: false }]);
});

test('current target denial removes descriptors without reviving an opaque relation', async () => {
  const original = await signedOriginCampaign(),
    item = [...original.records].find(
      ([k, v]) =>
        k.startsWith(original.basePath + '/items/') && v.origin?.kind === 'adventure-lore',
    )[1];
  await original.save(
    'variant-target-access',
    1,
    entity({
      relations: [
        { targetKey: item.sourceKey, relationType: 'Aliado', description: 'SEGREDO DO ALVO' },
      ],
    }),
  );
  original.file = await original.makeFile();
  const f = await fixture(original),
    { p } = await beforeVariant(f);
  f.records.get('adventures/' + item.origin.adventureId + '/lore/' + item.origin.id).deleting =
    true;
  const end = await finishVariants(f, p),
    body = [...f.records]
      .filter(([k]) => k.startsWith(generationPath(f, end) + '/loreVariantBodies/'))
      .map(([, v]) => v)
      .sort((a, b) => a.index - b.index)
      .map((b) => b.content)
      .join('');
  assert.deepEqual(JSON.parse(body).relations, [{ targetKey: item.sourceKey, available: false }]);
  assert.doesNotMatch(body, /SEGREDO DO ALVO/);
});

for (const point of [0, 2, 4])
  test('native variant transaction rollback at ' + point, async () => {
    const f = await fixture(),
      { p } = await beforeVariant(f),
      before = structuredClone([...f.records]),
      run = f.db.runTransaction.bind(f.db);
    f.db.runTransaction = (fn) =>
      run((tx) => {
        const wrapped = { ...tx };
        let n = 0;
        for (const method of ['create', 'set'])
          wrapped[method] = (ref, ...args) => {
            const result = tx[method](ref, ...args);
            if (n++ === point) throw Error('variant-rollback');
            return result;
          };
        return fn(wrapped);
      });
    await assert.rejects(next(f, p), /variant-rollback/);
    assert.deepEqual([...f.records], before);
    f.db.runTransaction = run;
    assert.equal((await next(f, p)).progress.checkpoint, p.checkpoint + 1);
  });

test('cancel deletes generation before base without source permission and protects unknown child', async () => {
  const f = await fixture(),
    end = await finishVariants(f),
    path = generationPath(f, end),
    rootBase = 'users/' + uid + '/campaignBases/' + variants(f, end)[0].baseId,
    port = await f.api.openCampaignRestoreDerivedIndex(uid, {
      restoreId: rid,
      jobToken: end.jobToken,
    });
  f.records.set(path + '/loreVariantBodies/foreign', { content: 'FOREIGN' });
  f.records.get('adventures/' + port.context.active.adventure.id).ownerId = 'other';
  let p = (await f.api.cancelCampaignRestore(uid, mut(end, 'variant-cancel-operation'))).progress;
  assert.equal(f.records.get(root).variantMaterialization.payload, null);
  assert.equal(f.records.has('users/' + uid + '/campaignRestoreKeys/' + rid), false);
  await assert.rejects(
    f.api.advanceCampaignRestoreCleanup(uid, mut(p, 'variant-clean-held-operation', { limit: 25 })),
  );
  assert.equal(f.records.has(path), true);
  assert.equal(f.records.has(rootBase), true);
  f.records.delete(path + '/loreVariantBodies/foreign');
  let n = 0;
  while (p.state !== 'cancelled' && n++ < 10000)
    p = (
      await f.api.advanceCampaignRestoreCleanup(
        uid,
        mut(p, 'variant-clean-' + digest(p.checkpoint), { limit: 25 }),
      )
    ).progress;
  assert.equal(p.state, 'cancelled');
  assert.equal(
    [...f.records.keys()].some((k) => k === path || k.startsWith(path + '/')),
    false,
  );
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith(root + '/variantWrites/')),
    false,
  );
});

test('source denied before variant I/O reads zero bytes and preserves checkpoint', async () => {
  const f = await fixture(),
    { p, port } = await beforeVariant(f),
    open = f.api.openCampaignRestoreSource.bind(f.api);
  f.records.get('adventures/' + port.context.active.adventure.id).ownerId = 'other';
  let bytes = 0;
  f.api.openCampaignRestoreSource = async (...args) => {
    const source = await open(...args);
    return {
      ...source,
      read: async (...range) => {
        const b = await source.read(...range);
        bytes += b.length;
        return b;
      },
    };
  };
  await assert.rejects(next(f, p), (e) => e.details?.reason === 'campaign-backup-origin-changed');
  assert.equal(bytes, 0);
  assert.equal(f.records.get(root).checkpoint, p.checkpoint);
});

test('partial variant cannot skip a revoked owner or reread its body', async () => {
  const original = await signedOriginCampaign(),
    text = 'á'.repeat(145000);
  await original.save('variant-partial-revocation', 1, entity({ details: text }));
  original.file = await original.makeFile();
  const f = await fixture(original),
    { p: before } = await beforeVariant(f),
    p = (await next(f, before)).progress;
  assert.equal(p.variantMaterialization.variants, 0);
  f.records.get('universes/world').deleting = true;
  const open = f.api.openCampaignRestoreSource.bind(f.api);
  let reads = 0;
  f.api.openCampaignRestoreSource = async (...args) => {
    const source = await open(...args);
    return {
      ...source,
      read: async (...range) => {
        reads++;
        return source.read(...range);
      },
    };
  };
  await assert.rejects(
    next(f, p, 'variant-partial-retry'),
    (e) => e.details?.reason === 'campaign-backup-origin-changed',
  );
  assert.equal(reads, 0);
  assert.equal(f.records.get(root).checkpoint, p.checkpoint);
  assert.equal(variants(f, p).length, 0);
});

test('registered audit rejects a body updated after its native birth', async () => {
  const f = await fixture();
  let p = f.p,
    n = 0;
  while (p.variantMaterialization?.phase !== 'audit' && n++ < 10000)
    p = (await next(f, p, 'variant-to-audit-' + p.checkpoint)).progress;
  const path = [...f.records.keys()].find((k) =>
    k.startsWith(generationPath(f, p) + '/loreVariantBodies/'),
  );
  await f.db.runTransaction((tx) => tx.update(f.db.doc(path), { content: 'ALTERADO' }));
  await assert.rejects(next(f, p, 'variant-audit-corruption'));
  assert.equal(f.records.get(root).checkpoint, p.checkpoint);
  assert.equal(f.records.get(generationPath(f, p)).state, 'preparing');
});

test('cancel during held variant I/O retires key and prevents late writes', async () => {
  const f = await fixture(),
    { p } = await beforeVariant(f),
    open = f.api.openCampaignRestoreSource.bind(f.api);
  let release, started;
  const hold = new Promise((r) => {
      release = r;
    }),
    entered = new Promise((r) => {
      started = r;
    });
  f.api.openCampaignRestoreSource = async (...args) => {
    const source = await open(...args);
    return {
      ...source,
      read: async (...range) => {
        started();
        await hold;
        return source.read(...range);
      },
    };
  };
  const attempt = next(f, p).then(
    () => ({ success: true }),
    (error) => ({ error }),
  );
  await entered;
  try {
    await f.api.cancelCampaignRestore(uid, mut(p, 'variant-held-cancel'));
    assert.equal(f.records.get(root).variantMaterialization?.payload ?? null, null);
  } finally {
    release();
  }
  const result = await attempt;
  assert.ok(result.error);
  assert.equal(variants(f, p).length, 0);
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith(root + '/variantWrites/')),
    false,
  );
});

test('audit processes one journal per checkpoint even with a requested limit of 25', async () => {
  const f = await fixture();
  let p = f.p,
    n = 0;
  while (p.variantMaterialization?.phase !== 'audit' && n++ < 10000)
    p = (await next(f, p, 'variant-audit-bound-' + p.checkpoint)).progress;
  assert.ok(p.variantMaterialization.written > 1);
  while (p.variantMaterialization.phase !== 'ready' && n++ < 10000) {
    const before = p;
    p = (await next(f, p, 'variant-audit-bound-' + p.checkpoint)).progress;
    assert.equal(p.variantMaterialization.audited, before.variantMaterialization.audited + 1);
  }
  assert.equal(p.variantMaterialization.phase, 'ready');
});
