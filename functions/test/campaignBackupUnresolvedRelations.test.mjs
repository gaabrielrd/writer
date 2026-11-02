import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { restoredBackupFixture, uid } from './helpers/campaignRestoredBackup.mjs';
import { entity } from './helpers/campaignLore.mjs';
import { campaignBackupTestIndexes } from './helpers/campaignBackupTestIndexes.mjs';
import { rewriteCampaignBackupTestFile } from './helpers/campaignBackupRewrite.mjs';
import { createCampaignBackupFileService } from '../src/campaignBackupFile.mjs';
import { createCampaignBackupReviewService } from '../src/campaignBackupReview.mjs';
import { validateCampaignBackupFile } from '../src/campaignBackupFileValidation.mjs';
import { digest } from '../src/workProgressContracts.mjs';
const bad = (e) => e.details?.reason === 'campaign-backup-derived-invalid';
function change(groups, section, update) {
  const g = groups.find((r) => r.kind === 'unit' && r.unit.section === section);
  assert.ok(g);
  const v = JSON.parse(Buffer.concat(g.chunks).toString());
  update(v);
  const bytes = Buffer.from(JSON.stringify(v));
  g.chunks = [];
  for (let i = 0; i < bytes.length; i += 65536) g.chunks.push(bytes.subarray(i, i + 65536));
}
async function fixture(long = false) {
  const f = await restoredBackupFixture({ local: true, long });
  f.target = f.items().find((r) => r.origin.kind === 'adventure-lore').sourceKey;
  f.scene = f.items().find((r) => r.kind === 'scene').sourceKey;
  f.owner = f.items().find((r) => r.origin.kind === 'lore').sourceKey;
  await f.save(
    'wire-version-variant',
    0,
    entity({
      relations: [
        { targetKey: f.target, relationType: 'Conhece', description: 'Descrição própria' },
      ],
    }),
  );
  await f.refresh();
  f.pair = generateKeyPairSync('ed25519');
  f.keys = [{ id: 'wire-v3-test-key', state: 'active', publicKey: f.pair.publicKey }];
  f.writer = createCampaignBackupFileService({
    db: f.db,
    storage: f.storage,
    keys: f.keys,
    keyId: f.keys[0].id,
    privateKey: f.pair.privateKey,
    now: () => 5000,
  });
  f.file = (await f.write()).bytes;
  f.source = () => ({ size: f.file.length, read: async (o, n) => f.file.subarray(o, o + n) });
  f.rewrite = (mutate) => rewriteCampaignBackupTestFile(f, mutate);
  f.validate = (extra) =>
    validateCampaignBackupFile(uid, f.source(), { keys: f.keys, now: () => 6000, ...extra });
  f.review = async () => {
    const opened = [];
    const r = await createCampaignBackupReviewService({
      db: f.db,
      keys: f.keys,
      now: () => 6000,
      createIndex: campaignBackupTestIndexes(opened),
    }).reviewCampaignBackup(uid, f.source());
    assert.ok(opened.every((i) => i.disposed === 1));
    return r;
  };
  f.setRelation = (relation, version = 3) =>
    f.rewrite((g) => {
      g[0].value.contentVersion = version;
      change(g, 'variant', (v) => {
        v.entity.relations = [relation];
      });
    });
  return f;
}
test('v3 signed unresolved relation is distinct from target availability and grants no extra access or native writes', async () => {
  const f = await fixture();
  await f.setRelation({ targetKey: f.target, available: false, unresolved: true });
  const before = structuredClone([...f.records]),
    valid = await f.validate(),
    review = await f.review();
  assert.equal(valid.manifest.contentVersion, 3);
  assert.equal(valid.manifest.provenanceVersion, 2);
  assert.equal(review.derived.unresolvedRelations, 1);
  assert.ok(review.derived.items > 0);
  assert.equal(review.validation, 'campaign-backup-review-only');
  assert.deepEqual([...f.records], before);
});
test('unresolved relation with no archived target preserves only its key and does not probe live origin by hash', async () => {
  const f = await fixture(),
    key = digest('no-known-origin');
  await f.setRelation({ targetKey: key, available: false, unresolved: true });
  f.metadataReads.length = 0;
  assert.equal((await f.review()).derived.unresolvedRelations, 1);
  assert.ok(!f.metadataReads.some((r) => r.path.includes(key)));
});
for (const version of [1, 2])
  test(
    'a valid signed v' +
      version +
      ' archive cannot acquire the v3 unresolved grammar through downgrade',
    async () => {
      const f = await fixture();
      await f.setRelation({ targetKey: f.target, available: false, unresolved: true }, version);
      assert.equal((await f.validate()).manifest.contentVersion, version);
      await assert.rejects(f.review(), bad);
    },
  );
for (const version of [1, 2, 3])
  test(
    'real signed ordinary v' + version + ' file retains original relationship joins',
    async () => {
      const f = await fixture(version === 2);
      await f.rewrite((g) => {
        g[0].value.contentVersion = version;
      });
      const review = await f.review();
      assert.equal(review.manifest.contentVersion, version);
      assert.equal(review.derived.unresolvedRelations, 0);
    },
  );
for (const version of [1, 2, 3])
  test(
    'v' +
      version +
      ' does not relax classic false-with-available-target without the explicit marker',
    async () => {
      const f = await fixture();
      await f.setRelation({ targetKey: f.target, available: false }, version);
      assert.equal((await f.validate()).validation, 'campaign-file-integrity-only');
      await assert.rejects(f.review(), bad);
    },
  );
for (const [name, relation] of [
  [
    'true availability',
    (f) => ({
      targetKey: f.target,
      available: true,
      unresolved: true,
      relationType: 'Must reject',
      description: '',
    }),
  ],
  ['false marker', (f) => ({ targetKey: f.target, available: false, unresolved: false })],
  ['null marker', (f) => ({ targetKey: f.target, available: false, unresolved: null })],
  ['string marker', (f) => ({ targetKey: f.target, available: false, unresolved: 'true' })],
  [
    'hidden labels',
    (f) => ({
      targetKey: f.target,
      available: false,
      unresolved: true,
      description: 'DO NOT EXPOSE',
    }),
  ],
  [
    'unknown field',
    (f) => ({ targetKey: f.target, available: false, unresolved: true, extra: true }),
  ],
  ['self reference', (f) => ({ targetKey: f.owner, available: false, unresolved: true })],
  ['scene target', (f) => ({ targetKey: f.scene, available: false, unresolved: true })],
])
  test(
    'v3 semantic review rejects unresolved ' + name + ' even after valid roots and signature',
    async () => {
      const f = await fixture();
      await f.setRelation(relation(f));
      assert.equal((await f.validate()).validation, 'campaign-file-integrity-only');
      await assert.rejects(f.review(), bad);
    },
  );
test('base relations do not inherit the new variant-only marker', async () => {
  const f = await fixture();
  await f.rewrite((g) =>
    change(g, 'base:item', (v) => {
      v.structured.relations = [{ targetKey: f.target, available: false, unresolved: true }];
    }),
  );
  assert.equal((await f.validate()).validation, 'campaign-file-integrity-only');
  await assert.rejects(f.review(), bad);
});
test('derived staging callbacks receive the immutable header content version for available units', async () => {
  const f = await fixture(),
    seen = new Set();
  await f.validate({
    onDerivedUnit: async (item) => {
      assert.ok(Object.isFrozen(item));
      seen.add(item.contentVersion);
    },
  });
  assert.deepEqual([...seen], [3]);
});
test('future content versions remain unsupported even with a test-trusted signing key', async () => {
  const f = await fixture();
  await f.rewrite((g) => {
    g[0].value.contentVersion = 4;
  });
  await assert.rejects(f.validate());
});

test('unavailable derived units carry the same immutable header version without a payload', async () => {
  const f = await fixture();
  f.records.get('adventures/' + f.campaign.provenance.adventureId).deleting = true;
  f.file = (await f.write()).bytes;
  const seen = [];
  await f.validate({
    onDerivedUnit: async (item) => {
      assert.ok(Object.isFrozen(item));
      seen.push(item.unit.outcome);
      assert.equal(item.contentVersion, 3);
      if (item.unit.outcome !== 'available') assert.equal(item.payload, null);
    },
  });
  assert.ok(seen.includes('unavailable'));
});
