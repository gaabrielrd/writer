import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyVariantFixture } from './helpers/campaignLegacyVariant.mjs';
import { signedOriginCampaign } from './helpers/campaignOriginRestore.mjs';
import {
  variantMaterializationFixture,
  finishVariants,
  uid,
  rid,
  mut,
  generationPath,
  variantRestoreRoot as root,
} from './helpers/campaignVariantMaterialization.mjs';
import { entity } from './helpers/campaignLore.mjs';
import { digest } from '../src/sceneContracts.mjs';
import { parseJob } from '../src/campaignRestoreContracts.mjs';
import { VARIANT_AUTHORIZATION_CODEC } from '../src/campaignRestoreVariantFormat.mjs';
const next = (f, p, name = 'variant-resume-next-copy') =>
  f.api.advanceCampaignRestoreVariants(uid, mut(p, name, { limit: 25 }));
const update = (f, path, patch) => f.db.runTransaction((tx) => tx.update(f.db.doc(path), patch));
let cached;
async function partial(source) {
  cached ??= (async () => {
    const original = await signedOriginCampaign();
    await original.save('variant-native-long-original', 1, entity({ details: 'á'.repeat(145000) }));
    original.file = await original.makeFile();
    return original;
  })();
  const f = await variantMaterializationFixture(source ?? (await cached)),
    port = await f.api.openCampaignRestoreDerivedIndex(uid, {
      restoreId: rid,
      jobToken: f.p.jobToken,
    }),
    rows = [];
  for (let n = 0; n < port.certificate.rows; n += 25)
    rows.push(...(await port.read(n, Math.min(25, port.certificate.rows - n))));
  const row = rows.find((r) => r.section === 'variant' && r.value.unit.outcome === 'available');
  let p = f.p;
  while ((p.variantMaterialization?.processedRows ?? 0) < row.index)
    p = (
      await f.api.advanceCampaignRestoreVariants(
        uid,
        mut(p, 'variant-resume-position-' + p.checkpoint, {
          limit: Math.min(25, row.index - (p.variantMaterialization?.processedRows ?? 0)),
        }),
      )
    ).progress;
  p = (await next(f, p, 'variant-resume-first-copy')).progress;
  assert.equal(p.variantMaterialization.variants, 0);
  assert.equal(p.variantMaterialization.written, 1);
  f.p = p;
  return { f, p, port };
}
test('native owner revoke and regrant resumes a partial body and all new journals carry the edition codec', async () => {
  const { f, p, port } = await partial(),
    path = 'adventures/' + port.context.active.adventure.id;
  assert.equal(
    f.records.get(root).variantMaterialization.authorizationCodec,
    VARIANT_AUTHORIZATION_CODEC,
  );
  assert.equal(p.variantMaterialization.authorizationCodec, undefined);
  await update(f, path, { ownerId: 'other' });
  await assert.rejects(next(f, p), (e) => e.details?.reason === 'campaign-backup-origin-changed');
  await update(f, path, { ownerId: uid });
  const end = await finishVariants(f, p);
  assert.equal(end.variantMaterialization.variants, 1);
  for (const [key, v] of f.records)
    if (key.startsWith(root + '/variantWrites/'))
      assert.equal(v.authorizationCodec, VARIANT_AUTHORIZATION_CODEC);
  const bodies = [...f.records]
    .filter(([k]) => k.startsWith(generationPath(f, end) + '/loreVariantBodies/'))
    .map(([, v]) => v)
    .sort((a, b) => a.index - b.index);
  assert.equal(JSON.parse(bodies.map((b) => b.content).join('')).details, 'á'.repeat(145000));
});
test('native revoke and regrant during the same partial-body read invalidates the write, then permits fresh retry', async () => {
  const { f, p, port } = await partial(),
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
          await update(f, path, { ownerId: 'other' });
          await update(f, path, { ownerId: uid });
        }
        return bytes;
      },
    };
  };
  await assert.rejects(next(f, p), (e) => e.details?.reason === 'campaign-backup-origin-changed');
  assert.equal(f.records.get(root).checkpoint, p.checkpoint);
  f.api.openCampaignRestoreSource = open;
  assert.equal((await next(f, p)).progress.checkpoint, p.checkpoint + 1);
});
test('historical codec job completes without rewriting old journals or ciphertext prefix', async () => {
  const f = await legacyVariantFixture(),
    old = structuredClone(f.records.get(root + '/variantWrites/' + '0'.repeat(15))),
    uploaded = structuredClone(
      [...f.records].filter(([path]) => path.startsWith(root + '/chunks/')),
    ),
    prefix = structuredClone(
      [...f.records].filter(([path]) =>
        path.startsWith(generationPath(f, f.p) + '/loreVariantBodies/'),
      ),
    ),
    end = await finishVariants(f);
  assert.equal(end.variantMaterialization.variants, 1);
  assert.deepEqual(f.records.get(root + '/variantWrites/' + '0'.repeat(15)), old);
  for (const [path, value] of [...uploaded, ...prefix])
    assert.deepEqual(f.records.get(path), value);
  assert.equal(f.records.get(root).variantMaterialization.authorizationCodec, undefined);
  for (const [key, v] of f.records)
    if (key.startsWith(root + '/variantWrites/')) assert.equal(v.authorizationCodec, undefined);
});
test('changed native access on a legacy partial job gives explicit restart reason and keeps keyless cancellation available', async () => {
  const f = await legacyVariantFixture(),
    p = f.p,
    port = await f.api.openCampaignRestoreDerivedIndex(uid, {
      restoreId: rid,
      jobToken: p.jobToken,
    }),
    path = 'adventures/' + port.context.active.adventure.id;
  await update(f, path, { ownerId: 'other' });
  await update(f, path, { ownerId: uid });
  const before = structuredClone([...f.records]);
  await assert.rejects(
    next(f, p),
    (e) => e.details?.reason === 'variant-authorization-restart-required',
  );
  assert.deepEqual([...f.records], before);
  let current = (await f.api.cancelCampaignRestore(uid, mut(p, 'variant-legacy-cancel'))).progress,
    n = 0;
  await update(f, path, { ownerId: 'other' });
  while (current.state !== 'cancelled' && n++ < 10000)
    current = (
      await f.api.advanceCampaignRestoreCleanup(
        uid,
        mut(current, 'v-legacy-clean-' + digest(current.checkpoint), { limit: 25 }),
      )
    ).progress;
  assert.equal(current.state, 'cancelled');
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith(root + '/variantWrites/')),
    false,
  );
});

async function relatedOriginal() {
  const original = await signedOriginCampaign(),
    item = [...original.records].find(
      ([k, v]) =>
        k.startsWith(original.basePath + '/items/') && v.origin?.kind === 'adventure-lore',
    )[1];
  await original.save(
    'variant-resume-related-original',
    1,
    entity({
      details: 'á'.repeat(145000),
      relations: [
        { targetKey: item.sourceKey, relationType: 'Aliado', description: 'Descrição autorizada' },
      ],
    }),
  );
  original.file = await original.makeFile();
  return {
    original,
    item,
    path: 'adventures/' + item.origin.adventureId + '/lore/' + item.origin.id,
  };
}
test('native target denial blocks partial-body I/O and reauthorization of the same target resumes unchanged descriptors', async () => {
  const { original, path, item } = await relatedOriginal(),
    { f, p } = await partial(original),
    open = f.api.openCampaignRestoreSource.bind(f.api);
  await update(f, path, { deleting: true });
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
  await update(f, path, { deleting: false });
  const end = await finishVariants(f, p),
    content = [...f.records]
      .filter(([k]) => k.startsWith(generationPath(f, end) + '/loreVariantBodies/'))
      .map(([, v]) => v)
      .sort((a, b) => a.index - b.index)
      .map((v) => v.content)
      .join('');
  assert.deepEqual(JSON.parse(content).relations, [
    {
      targetKey: item.sourceKey,
      relationType: 'Aliado',
      description: 'Descrição autorizada',
      available: true,
    },
  ]);
});
test('a file-level opaque relation stays opaque when native target permission returns during the partial body', async () => {
  const { original, path, item } = await relatedOriginal();
  await update(original, path, { deleting: true });
  original.file = await original.makeFile();
  const { f, p } = await partial(original);
  await update(f, path, { deleting: false });
  const end = await finishVariants(f, p),
    content = [...f.records]
      .filter(([k]) => k.startsWith(generationPath(f, end) + '/loreVariantBodies/'))
      .map(([, v]) => v)
      .sort((a, b) => a.index - b.index)
      .map((v) => v.content)
      .join('');
  assert.deepEqual(JSON.parse(content).relations, [
    { targetKey: item.sourceKey, available: false },
  ]);
  assert.doesNotMatch(content, /Descrição autorizada/);
});
test('unknown job authorization codecs fail closed without upgrading the legacy wire', async () => {
  const f = await legacyVariantFixture(),
    job = f.records.get(root);
  assert.throws(() =>
    parseJob(
      {
        ...job,
        variantMaterialization: { ...job.variantMaterialization, authorizationCodec: 'unknown' },
      },
      uid,
      rid,
    ),
  );
  assert.equal(f.records.get(root).variantMaterialization.authorizationCodec, undefined);
});
