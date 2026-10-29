import test from 'node:test';
import assert from 'node:assert/strict';
import {
  anchorMaterializationFixture as fixture,
  finishAnchors,
  positionAnchor,
  historicalAnchorOriginal,
  anchorRestoreRoot as root,
  uid,
  rid,
  mut,
  generationPath,
} from './helpers/campaignAnchorMaterialization.mjs';
import {
  variantMaterializationFixture,
  finishVariants,
} from './helpers/campaignVariantMaterialization.mjs';
import { restoredAnchorBaseId } from '../src/campaignRestoreVariantFormat.mjs';
import { createCampaignLoreService } from '../src/campaignLore.mjs';
import { createCampaignRestoreTransferService } from '../src/campaignRestoreTransfer.mjs';
import { signedOriginCampaign } from './helpers/campaignOriginRestore.mjs';
import { digest } from '../src/sceneContracts.mjs';
import { rewriteCampaignBackupTestFile } from './helpers/campaignBackupRewrite.mjs';
import { sha } from '../src/campaignRestoreContracts.mjs';
const next = (f, p, name = 'anchor-next-operation-01', limit = 25) =>
  f.api.advanceCampaignRestoreAnchors(uid, mut(p, name, { limit }));
const roots = (f, p) =>
  [...f.records]
    .filter(([k]) => k.startsWith(root + '/anchorSlots/'))
    .map(
      ([, v]) =>
        'users/' +
        uid +
        '/campaignBases/' +
        restoredAnchorBaseId({ uid, rid, token: p.jobToken }, v.anchorKey),
    );

test('actual retained lore materializes historical base, original evidence and ordinary legacy reader', async () => {
  const f = await fixture(),
    at = await positionAnchor(f),
    p = await finishAnchors(f, at.p),
    result = await f.api.getCampaignRestoreAnchors(uid, { restoreId: rid, jobToken: p.jobToken }),
    path = roots(f, p)[0],
    base = f.records.get(path),
    overlay = [...f.records].find(([k]) =>
      k.startsWith(generationPath(f, p) + '/loreVariants/'),
    )[1],
    witness = (await at.port.lookup('w:anchor', JSON.stringify([overlay.sourceKey, null]))).value
      .record[3];
  assert.equal(result.validation, 'campaign-anchors-materialized-only');
  assert.equal(result.anchors, 1);
  assert.equal(base.state, 'preparing');
  assert.equal(base.id, overlay.anchor.capturedBaseId);
  assert.notEqual(base.id, overlay.baseId);
  assert.deepEqual(base.sourceEvidence.source, witness.base);
  assert.equal(base.sourceEvidence.archiveHash, result.archive.chainHash);
  assert.deepEqual(
    f.records.get(path + '/items/' + overlay.sourceKey).sourceEvidence.source,
    witness.item,
  );
  assert.equal(base.counts.lore, 1);
  assert.equal(p.anchorMaterialization.slots, 1);
  assert.equal(f.records.get('campaigns/' + p.campaignId).ownerId, undefined);
  // TEST ONLY: release the pending roots/control to exercise existing ordinary readers.
  const draft = await f.api.getCampaignRestoreOwnProject(uid, {
      restoreId: rid,
      jobToken: p.jobToken,
    }),
    activePath = 'users/' + uid + '/campaignBases/' + overlay.baseId,
    active = f.records.get(activePath),
    gen = generationPath(f, p);
  f.records.set(activePath, { ...active, state: 'ready' });
  f.records.set(path, { ...base, state: 'ready' });
  f.records.set(gen, { ...f.records.get(gen), state: 'ready' });
  f.records.set('campaigns/' + p.campaignId, {
    ...draft.project,
    ownerId: uid,
    schemaVersion: 1,
    revision: 1,
    activeBaseId: overlay.baseId,
    activeLoreGenerationId: gen.split('/').at(-1),
    provenance: { kind: 'original', adventureId: active.adventureId, baseId: overlay.baseId },
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
    scope = {
      campaignId: p.campaignId,
      campaignToken: overlay.campaignToken,
      baseId: overlay.baseId,
      sourceKey: overlay.sourceKey,
    };
  const lore = await api.getCampaignLore(uid, scope);
  assert.equal(lore.item.legacy, true);
  assert.equal(lore.item.entity.details, 'SECRET ORIGIN TEXT');
  f.records.get('universes/world').deleting = true;
  assert.equal((await api.getCampaignLore(uid, scope)).item, null);
});

test('equivalent active anchors reuse the native base without reading anchor prose', async () => {
  const f = await variantMaterializationFixture(await signedOriginCampaign());
  f.p = await finishVariants(f);
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
  const p = await finishAnchors(f);
  assert.equal(p.anchorMaterialization.anchors, 0);
  assert.equal(p.anchorMaterialization.reused, 1);
  assert.equal(p.anchorMaterialization.slots, 0);
  assert.equal(reads, 0);
});

test('historical long UTF8 fields resume by frame without text in checkpoint', async () => {
  const original = await historicalAnchorOriginal({ long: true }),
    f = await fixture(original),
    at = await positionAnchor(f);
  let p = (await next(f, at.p)).progress;
  assert.equal(p.anchorMaterialization.slots, 1);
  assert.equal(roots(f, p).length, 1);
  assert.equal(f.records.has(roots(f, p)[0]), false);
  while (p.anchorMaterialization.written < 2)
    p = (await next(f, p, 'anchor-long-step-' + p.checkpoint, 1)).progress;
  const state = f.records.get(root).anchorMaterialization;
  assert.ok(Buffer.from(state.payload.data, 'base64').length <= 8192);
  assert.doesNotMatch(JSON.stringify(state), /🐉|details|SECRET/);
  f.api = createCampaignRestoreTransferService({ db: f.db, keys: f.keys });
  const end = await finishAnchors(f, p),
    path = roots(f, end)[0],
    bodies = [...f.records]
      .filter(([k, v]) => k.startsWith(path + '/bodies/') && v.field === 'details')
      .map(([, v]) => v)
      .sort((a, b) => a.index - b.index);
  assert.equal(bodies.map((b) => b.content).join(''), '\ufeff  ' + '🐉á'.repeat(24000) + '\n ');
});

async function registered(f) {
  const at = await positionAnchor(f),
    p = (await next(f, at.p, 'anchor-register-fixture')).progress;
  assert.equal(p.anchorMaterialization.slots, 1);
  assert.equal(p.anchorMaterialization.written, 0);
  return { ...at, p };
}
async function clean(f, p) {
  let n = 0;
  while (p.state !== 'cancelled' && n++ < 10000)
    p = (
      await f.api.advanceCampaignRestoreCleanup(
        uid,
        mut(p, 'anchor-clean-' + digest(p.checkpoint), { limit: 25 }),
      )
    ).progress;
  assert.equal(p.state, 'cancelled');
  return p;
}
test('slot is registered before children and replay never allocates another slot', async () => {
  const f = await fixture(),
    { p: before } = await positionAnchor(f),
    request = mut(before, 'anchor-register-replay', { limit: 25 }),
    result = await f.api.advanceCampaignRestoreAnchors(uid, request),
    p = result.progress,
    slot = f.records.get(root + '/anchorSlots/' + '0'.repeat(15));
  assert.equal(p.anchorMaterialization.slots, 1);
  assert.equal(p.anchorMaterialization.written, 0);
  assert.equal(f.records.has(roots(f, p)[0]), false);
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith(roots(f, p)[0] + '/')),
    false,
  );
  const receipt = f.records.get(
    'users/' + uid + '/campaignRestoreOperations/' + request.operationId,
  );
  assert.deepEqual(receipt.effect, { slot: { index: 0, metadataHash: digest(slot) } });
  const beforeRecords = structuredClone([...f.records]);
  assert.deepEqual(
    (await f.api.advanceCampaignRestoreAnchors(uid, request)).receipt,
    result.receipt,
  );
  assert.deepEqual([...f.records], beforeRecords);
  await assert.rejects(
    next(f, before, 'anchor-conflicting-register'),
    (e) => e.details?.reason === 'checkpoint-conflict',
  );
});

test('revocation after slot registration blocks before field bytes without abandoning inventory', async () => {
  const f = await fixture(),
    { p } = await registered(f),
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
  await assert.rejects(
    next(f, p, 'anchor-denied-field'),
    (e) => e.details?.reason === 'campaign-backup-origin-changed',
  );
  assert.equal(reads, 0);
  assert.equal(f.records.get(root).checkpoint, p.checkpoint);
  assert.equal(roots(f, p).length, 1);
});

test('ownership change during field bytes prevents writes and allows exact retry after reauthorization', async () => {
  const f = await fixture(),
    { p, port } = await registered(f),
    path = 'adventures/' + port.context.active.adventure.id,
    open = f.api.openCampaignRestoreSource.bind(f.api),
    before = structuredClone([...f.records]);
  let changed = false;
  f.api.openCampaignRestoreSource = async (...args) => {
    const source = await open(...args);
    return {
      ...source,
      read: async (...range) => {
        const bytes = await source.read(...range);
        if (!changed) {
          changed = true;
          f.records.get(path).ownerId = 'other';
        }
        return bytes;
      },
    };
  };
  await assert.rejects(next(f, p), (e) => e.details?.reason === 'campaign-backup-origin-changed');
  assert.equal(f.records.get(root).checkpoint, p.checkpoint);
  f.records.get(path).ownerId = uid;
  f.api.openCampaignRestoreSource = open;
  assert.deepEqual([...f.records], before);
  assert.equal((await next(f, p)).progress.anchorMaterialization.written, 1);
});

for (const [phase, point] of [
  ['slot', 0],
  ['slot', 3],
  ['body', 0],
  ['body', 3],
  ['body', 4],
])
  test('atomic anchor rollback at ' + phase + '/' + point, async () => {
    const f = await fixture(),
      { p } = phase === 'slot' ? await positionAnchor(f) : await registered(f),
      run = f.db.runTransaction.bind(f.db),
      before = structuredClone([...f.records]);
    f.db.runTransaction = (fn) =>
      run((tx) => {
        const wrapped = { ...tx };
        let n = 0;
        for (const method of ['create', 'set'])
          wrapped[method] = (ref, ...args) => {
            const result = tx[method](ref, ...args);
            if (n++ === point) throw Error('anchor-rollback');
            return result;
          };
        return fn(wrapped);
      });
    await assert.rejects(next(f, p), /anchor-rollback/);
    assert.deepEqual([...f.records], before);
    f.db.runTransaction = run;
    assert.equal((await next(f, p)).progress.checkpoint, p.checkpoint + 1);
  });

test('existing orphan at historical destination prevents registering its slot', async () => {
  const f = await fixture(),
    { p, row } = await positionAnchor(f),
    path =
      'users/' +
      uid +
      '/campaignBases/' +
      restoredAnchorBaseId({ uid, rid, token: p.jobToken }, row.value.meta.anchorKey);
  f.records.set(path + '/bodies/foreign', { content: 'PRESERVAR' });
  await assert.rejects(next(f, p));
  assert.equal(f.records.get(root).checkpoint, p.checkpoint);
  assert.equal(f.records.get(path + '/bodies/foreign').content, 'PRESERVAR');
  assert.equal(roots(f, p).length, 0);
});

test('slot-only cancellation retires cipher and removes slot with no origin grant', async () => {
  const f = await fixture(),
    { p: before } = await registered(f),
    path = roots(f, before)[0];
  f.records.get('universes/world').deleting = true;
  let p = (await f.api.cancelCampaignRestore(uid, mut(before, 'anchor-slot-cancel'))).progress;
  assert.equal(f.records.get(root).anchorMaterialization.payload, null);
  p = await clean(f, p);
  assert.equal(p.anchorMaterialization.cleanedSlots, 1);
  assert.equal(roots(f, p).length, 0);
  assert.equal(f.records.has(path), false);
});

test('keyless cleanup holds historical parent with foreign child before deleting slots or active base', async () => {
  const f = await fixture(),
    end = await finishAnchors(f),
    path = roots(f, end)[0],
    overlay = [...f.records].find(([k]) =>
      k.startsWith(generationPath(f, end) + '/loreVariants/'),
    )[1],
    activePath = 'users/' + uid + '/campaignBases/' + overlay.baseId;
  f.records.set(path + '/bodies/foreign', { content: 'PRESERVAR' });
  f.records.get('universes/world').deleting = true;
  let p = (await f.api.cancelCampaignRestore(uid, mut(end, 'anchor-parent-cancel'))).progress,
    held = false;
  for (let n = 0; n < 100; n++) {
    try {
      p = (
        await f.api.advanceCampaignRestoreCleanup(
          uid,
          mut(p, 'anchor-parent-clean-' + p.checkpoint, { limit: 25 }),
        )
      ).progress;
    } catch {
      held = true;
      break;
    }
  }
  assert.equal(held, true);
  assert.equal(f.records.has(path), true);
  assert.equal(f.records.has(activePath), true);
  assert.equal(roots(f, p).length, 1);
  f.records.delete(path + '/bodies/foreign');
  p = await clean(f, p);
  assert.equal(p.anchorMaterialization.cleaned, p.anchorMaterialization.written);
  assert.equal(p.anchorMaterialization.cleanedSlots, p.anchorMaterialization.slots);
  assert.equal(
    [...f.records.keys()].some((k) => k === path || k.startsWith(path + '/')),
    false,
  );
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith(root + '/anchorWrites/')),
    false,
  );
  assert.equal(roots(f, p).length, 0);
});

test('a slot updated after its native birth cannot authorize bytes or be collected', async () => {
  const f = await fixture(),
    { p: before } = await registered(f),
    slot = root + '/anchorSlots/' + '0'.repeat(15);
  await f.db.runTransaction((tx) => tx.update(f.db.doc(slot), { sourceKey: 'f'.repeat(64) }));
  await assert.rejects(next(f, before));
  const p = (await f.api.cancelCampaignRestore(uid, mut(before, 'anchor-changed-slot-cancel')))
    .progress;
  // Collect variant journals first; the corrupted slot is then preserved.
  let current = p,
    failed = false;
  for (let n = 0; n < 100; n++) {
    try {
      current = (
        await f.api.advanceCampaignRestoreCleanup(
          uid,
          mut(current, 'anchor-changed-clean-' + current.checkpoint, { limit: 25 }),
        )
      ).progress;
    } catch {
      failed = true;
      break;
    }
  }
  assert.equal(failed, true);
  assert.equal(f.records.has(slot), true);
});

test('cancel during held historical field I/O prevents late materialization', async () => {
  const f = await fixture(),
    { p } = await registered(f),
    open = f.api.openCampaignRestoreSource.bind(f.api);
  let started, release;
  const entered = new Promise((r) => {
      started = r;
    }),
    hold = new Promise((r) => {
      release = r;
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
    await f.api.cancelCampaignRestore(uid, mut(p, 'anchor-held-cancel'));
  } finally {
    release();
  }
  assert.ok((await attempt).error);
  assert.equal(f.records.get(root).anchorMaterialization.payload, null);
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith(root + '/anchorWrites/')),
    false,
  );
});

test('two retained fichas use distinct inventoried bases and collect in bounded batches', async () => {
  const original = await signedOriginCampaign(),
    local = [...original.records].find(
      ([k, v]) =>
        k.startsWith(original.basePath + '/items/') && v.origin?.kind === 'adventure-lore',
    )[1];
  await original.save(
    'anchor-local-second-variant',
    0,
    {
      name: 'Mesa local',
      aliases: [],
      category: 'character',
      summary: 'Resumo',
      details: 'Adaptação local',
      structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
      relations: [],
    },
    local.sourceKey,
  );
  await original.removeReferences();
  const target = { kind: 'adventure', id: local.origin.adventureId },
    scene = await original.scenes.getScene(uid, { target, sceneId: original.scene.id });
  await original.scenes.setSceneReference(uid, {
    target,
    sceneId: scene.id,
    operationId: 'anchor-remove-local-reference',
    expectedRevision: scene.revision,
    reference: { kind: 'adventure', scopeId: local.origin.adventureId, entityId: local.origin.id },
    remove: true,
  });
  await original.adopt();
  original.file = await original.makeFile();
  const f = await fixture(original),
    end = await finishAnchors(f),
    paths = roots(f, end);
  assert.equal(end.anchorMaterialization.anchors, 2);
  assert.equal(end.anchorMaterialization.slots, 2);
  assert.equal(new Set(paths).size, 2);
  for (const path of paths) {
    assert.equal(f.records.get(path).counts.lore, 1);
    assert.equal([...f.records.keys()].filter((k) => k.startsWith(path + '/items/')).length, 1);
  }
  let p = (await f.api.cancelCampaignRestore(uid, mut(end, 'anchor-two-cancel'))).progress,
    n = 0;
  while (p.state !== 'cancelled' && n++ < 10000)
    p = (
      await f.api.advanceCampaignRestoreCleanup(
        uid,
        mut(p, 'an-two-clean-' + digest(p.checkpoint), { limit: 2 }),
      )
    ).progress;
  assert.equal(p.state, 'cancelled');
  assert.equal(p.anchorMaterialization.cleanedSlots, 2);
  for (const path of paths)
    assert.equal(
      [...f.records.keys()].some((k) => k === path || k.startsWith(path + '/')),
      false,
    );
});

test('omitted variant never revives through an available archive anchor', async () => {
  const original = await historicalAnchorOriginal(),
    f = await variantMaterializationFixture(original);
  f.records.get('universes/world').deleting = true;
  f.p = await finishVariants(f);
  assert.equal(f.p.variantMaterialization.variants, 0);
  f.records.get('universes/world').deleting = false;
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
  const p = await finishAnchors(f);
  assert.equal(p.anchorMaterialization.slots, 0);
  assert.equal(p.anchorMaterialization.skipped, 1);
  assert.equal(reads, 0);
});

test('an altered historical body is rejected by registered audit and its parent stays pending', async () => {
  const f = await fixture();
  let p = f.p,
    n = 0;
  while (p.anchorMaterialization?.phase !== 'audit' && n++ < 10000)
    p = (await next(f, p, 'anchor-before-audit-' + p.checkpoint)).progress;
  const path = roots(f, p)[0],
    journal = f.records.get(
      root + '/anchorWrites/' + String(p.anchorMaterialization.audited).padStart(15, '0'),
    ),
    body = path + '/bodies/' + journal.targets.find((t) => t.collection === 'bodies').id;
  await f.db.runTransaction((tx) => tx.update(f.db.doc(body), { content: 'ALTERADO' }));
  await assert.rejects(next(f, p, 'anchor-audit-altered-body'));
  assert.equal(f.records.get(root).checkpoint, p.checkpoint);
  assert.equal(f.records.get(path).state, 'preparing');
});

test('legacy anchor fields preserve exact text and native manifests after UTF8 repacking', async () => {
  const original = await historicalAnchorOriginal({ long: true });
  await rewriteCampaignBackupTestFile(original, (groups) => {
    groups[0].value.contentVersion = 1;
    for (const g of groups)
      if (g.kind === 'unit' && ['base:field', 'anchor:field'].includes(g.unit.section)) {
        const bytes = Buffer.concat(g.chunks);
        g.chunks = [];
        for (let n = 0; n < Math.ceil(bytes.length / 65536); n++)
          g.chunks.push(bytes.subarray(n * 65536, (n + 1) * 65536));
        if (!bytes.length) g.chunks.push(Buffer.alloc(0));
      }
  });
  const f = await fixture(original),
    p = await finishAnchors(f),
    path = roots(f, p)[0],
    item = [...f.records].find(([k]) => k.startsWith(path + '/items/'))[1];
  for (const field of item.fields) {
    const chunks = [...f.records]
        .filter(([k, v]) => k.startsWith(path + '/bodies/') && v.field === field.field)
        .map(([, v]) => v)
        .sort((a, b) => a.index - b.index),
      text = chunks.map((c) => c.content).join('');
    assert.equal(sha(text), field.sha256);
    assert.equal(Buffer.byteLength(text), field.bytes);
    assert.equal(chunks.length, field.chunkCount);
    assert.equal(field.bodySourceKey, item.sourceKey);
  }
});

test('recreated historical ficha cannot inherit the signed original witness', async () => {
  const f = await fixture(),
    { p } = await registered(f),
    sourcePath = 'universes/world/lore/hero',
    native = f.metadata.get(sourcePath),
    open = f.api.openCampaignRestoreSource.bind(f.api);
  f.metadata.set(sourcePath, { ...native, createdAt: native.createdAt + 1 });
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
  await assert.rejects(next(f, p), (e) => e.details?.reason === 'campaign-backup-origin-changed');
  assert.equal(reads, 0);
  assert.equal(f.records.get(root).checkpoint, p.checkpoint);
});

test('slot survives native permission metadata changes when the same authorized origin is restored', async () => {
  const f = await fixture(),
    { p, port } = await registered(f),
    path = 'adventures/' + port.context.active.adventure.id,
    run = (patch) => f.db.runTransaction((tx) => tx.update(f.db.doc(path), patch));
  await run({ ownerId: 'other' });
  await assert.rejects(next(f, p), (e) => e.details?.reason === 'campaign-backup-origin-changed');
  await run({ ownerId: uid });
  const response = await next(f, p);
  assert.equal(response.progress.anchorMaterialization.slots, 1);
  assert.equal(response.progress.anchorMaterialization.written, 1);
  assert.equal(f.records.get(root + '/anchorSlots/' + '0'.repeat(15)).authorizationHash.length, 64);
});

test('native revoke and regrant during the same read still invalidates that write', async () => {
  const f = await fixture(),
    { p, port } = await registered(f),
    path = 'adventures/' + port.context.active.adventure.id,
    open = f.api.openCampaignRestoreSource.bind(f.api);
  let changed = false;
  f.api.openCampaignRestoreSource = async (...args) => {
    const source = await open(...args);
    return {
      ...source,
      read: async (...range) => {
        const bytes = await source.read(...range);
        if (!changed) {
          changed = true;
          await f.db.runTransaction((tx) => tx.update(f.db.doc(path), { ownerId: 'other' }));
          await f.db.runTransaction((tx) => tx.update(f.db.doc(path), { ownerId: uid }));
        }
        return bytes;
      },
    };
  };
  await assert.rejects(next(f, p), (e) => e.details?.reason === 'campaign-backup-origin-changed');
  assert.equal(f.records.get(root).checkpoint, p.checkpoint);
  assert.equal(f.records.get(root).anchorMaterialization.written, 0);
  f.api.openCampaignRestoreSource = open;
  assert.equal((await next(f, p)).progress.anchorMaterialization.written, 1);
});
