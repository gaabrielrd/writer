import test from 'node:test';
import assert from 'node:assert/strict';
import {
  restoredBackupFixture,
  recreate,
  uid,
  adventureId,
  localId,
} from './helpers/campaignRestoredBackup.mjs';
import { campaignBackupTestIndexes } from './helpers/campaignBackupTestIndexes.mjs';
import { createCampaignBaseReadService } from '../src/campaignBaseRead.mjs';
import { createCampaignLoreService } from '../src/campaignLore.mjs';
import { createCampaignBackupReviewService } from '../src/campaignBackupReview.mjs';
import { portableBaseLoreRelations } from '../src/campaignPortableRelations.mjs';
import { digest } from '../src/workProgressContracts.mjs';
import { entity } from './helpers/campaignLore.mjs';
const bad = (e) => e.details?.reason === 'campaign-portable-relations-inconsistent';
async function fixture() {
  const f = await restoredBackupFixture({ local: true }),
    fullReads = [];
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
  f.reader = createCampaignBaseReadService({ db, assets: f.storage });
  f.lore = createCampaignLoreService({ db });
  const item = f.items().find((i) => i.origin.kind === 'lore'),
    target = f.items().find((i) => i.origin.kind === 'adventure-lore');
  item.structured.relations = [
    {
      targetEntityId: 'adventure:' + adventureId + ':' + localId,
      relationType: 'Conhece',
      description: 'Descrição literal 🐉',
    },
    {
      targetEntityId: 'universe:world:absent-source-0001',
      relationType: 'UNAVAILABLE SECRET',
      description: 'NEVER EXPOSE',
    },
    {
      targetEntityId: 'adventure:' + adventureId + ':' + localId,
      relationType: 'Rival',
      description: '',
    },
  ];
  const row = async () => (await f.listBase()).items.find((r) => r.id === item.sourceKey);
  const logical = async () => {
    const r = await row(),
      chunks = [];
    let part;
    for (let index = 0; !part || index < part.chunkCount; index++) {
      part = await f.baseReader.readCampaignBackupBaseItem(uid, {
        ...f.anchor,
        id: r.id,
        itemToken: r.itemToken,
        index,
      });
      assert.equal(part.outcome, 'chunk');
      chunks.push(Buffer.from(part.chunkBase64, 'base64'));
    }
    return JSON.parse(Buffer.concat(chunks).toString());
  };
  const original = await logical(),
    relations = structuredClone(original.structured.relations);
  delete item.structured.relations;
  item.structured.relationMode = 'portable';
  item.structured.portableRelations = relations;
  const read = () =>
    f.reader.readCampaignBaseItem(uid, { campaignId: f.id, sourceKey: item.sourceKey });
  const effective = () => f.lore.getCampaignLore(uid, { ...f.scope(), sourceKey: item.sourceKey });
  const review = async (bytes) => {
    const opened = [];
    const result = await createCampaignBackupReviewService({
      db: f.db,
      keys: f.keys,
      now: () => 6000,
      createIndex: campaignBackupTestIndexes(opened),
    }).reviewCampaignBackup(uid, {
      size: bytes.length,
      read: async (o, n) => bytes.subarray(o, o + n),
    });
    assert.ok(opened.every((s) => s.disposed === 1));
    return result;
  };
  return {
    ...f,
    item,
    target,
    original,
    relations,
    fullReads,
    logical,
    read,
    effective,
    review,
    originalFixture: f,
  };
}
test('real portable base DTO retains order/multiple types and reexports a signed reviewed file without raw or private relations', async () => {
  const f = await fixture();
  assert.deepEqual((await f.logical()).structured.relations, f.original.structured.relations);
  const projected = await f.read();
  assert.deepEqual(
    projected.item.structured.relations.map((r) => r.relationType),
    ['Conhece', 'Rival'],
  );
  const effective = (await f.effective()).item.entity;
  assert.deepEqual(
    effective.relations.map((r) => r.relationType),
    ['Conhece', 'Rival'],
  );
  assert.ok(effective.relations.every((r) => r.targetName));
  const file = await f.write(),
    r = await f.review(file.bytes);
  assert.equal(r.validation, 'campaign-backup-review-only');
  assert.doesNotMatch(
    file.bytes.toString('utf8'),
    /relationMode|portableRelations|targetEntityId|UNAVAILABLE SECRET|NEVER EXPOSE|absent-source-0001/,
  );
});
test('false relations never probe their absent target; current target names come from authorized effective C2 only', async () => {
  const f = await fixture(),
    unknown = f.relations.find((r) => !r.available).targetKey;
  f.metadataReads.length = 0;
  await f.read();
  await f.effective();
  assert.ok(
    !f.metadataReads.some(
      (r) => r.path === f.basePath + '/items/' + unknown || r.path.includes('absent-source-0001'),
    ),
  );
  await f.originalFixture.save(
    'portable-target-override',
    0,
    entity({ name: 'Nome efetivo da mesa' }),
    f.target.sourceKey,
  );
  const effective = (await f.effective()).item.entity;
  assert.ok(effective.relations.every((r) => r.targetName === 'Nome efetivo da mesa'));
});
test('creating and discarding a whole override preserves the original portable base and its unresolved declarations', async () => {
  const f = await fixture(),
    before = structuredClone(f.item);
  await f.originalFixture.save(
    'portable-base-override',
    0,
    entity({ details: 'Alteração explícita da ficha inteira' }),
  );
  assert.equal((await f.effective()).item.entity.details, 'Alteração explícita da ficha inteira');
  assert.deepEqual(f.item, before);
  await f.lore.discardCampaignLoreVariant(uid, {
    ...f.scope(),
    sourceKey: f.item.sourceKey,
    operationId: 'portable-base-discard-001',
    expectedRevision: 1,
  });
  const restored = await f.effective();
  assert.deepEqual(
    restored.item.entity.relations.map((r) => r.relationType),
    ['Conhece', 'Rival'],
  );
  await f.refresh();
  assert.deepEqual((await f.logical()).structured.relations, f.original.structured.relations);
});
test('recreated target suppresses type/description without regranting old source and reexports only logical unavailable keys', async () => {
  const f = await fixture();
  recreate(f, 'adventures/' + adventureId + '/lore/' + localId);
  await f.refresh();
  assert.deepEqual((await f.read()).item.structured.relations, []);
  assert.deepEqual((await f.effective()).item.entity.relations, []);
  const logical = await f.logical();
  assert.ok(logical.structured.relations.every((r) => !r.available && Object.keys(r).length === 2));
  const file = await f.write();
  assert.equal((await f.review(file.bytes)).validation, 'campaign-backup-review-only');
});
for (const [name, mutate] of [
  [
    'missing mode',
    (s) => {
      delete s.relationMode;
    },
  ],
  [
    'null mode',
    (s) => {
      s.relationMode = null;
    },
  ],
  [
    'missing list',
    (s) => {
      delete s.portableRelations;
    },
  ],
  [
    'null list',
    (s) => {
      s.portableRelations = null;
    },
  ],
  [
    'native alongside portable',
    (s) => {
      s.relations = [];
    },
  ],
  [
    'invalid key',
    (s) => {
      s.portableRelations[0].targetKey = 'bad';
    },
  ],
  [
    'invalid state',
    (s) => {
      s.portableRelations[0].available = null;
    },
  ],
  [
    'missing label',
    (s) => {
      delete s.portableRelations[0].relationType;
    },
  ],
  [
    'false leaks label',
    (s) => {
      s.portableRelations[1].relationType = 'private';
    },
  ],
  [
    'unknown field',
    (s) => {
      s.portableRelations[0].extra = true;
    },
  ],
  [
    'invalid UTF8',
    (s) => {
      s.portableRelations[0].relationType = '\ud800';
    },
  ],
])
  test('portable relation rejects ' + name + ' in normal/C2/backup before bodies', async () => {
    const f = await fixture();
    mutate(f.item.structured);
    f.fullReads.length = 0;
    f.metadataReads.length = 0;
    await assert.rejects(f.read(), bad);
    await assert.rejects(f.effective(), bad);
    await assert.rejects(f.logical(), bad);
    assert.ok(
      !f.fullReads.some((p) => p.includes('/bodies/') || p.includes('/loreVariantBodies/')),
    );
    assert.ok(
      !f.metadataReads.some((r) => r.path.includes('/bodies/') && r.fields.includes('content')),
    );
  });
test('relation count bounds preserve fifty ordered entries and reject fifty-one without truncation', async () => {
  const f = await fixture(),
    base = f.records.get(f.basePath);
  f.item.structured.portableRelations = Array.from({ length: 50 }, (_, i) => ({
    targetKey: f.item.sourceKey,
    available: true,
    relationType: 'Self ' + i,
  }));
  const normalized = portableBaseLoreRelations(base, f.item);
  assert.equal(normalized.length, 50);
  assert.equal(normalized[49].relationType, 'Self 49');
  f.item.structured.portableRelations.push({ targetKey: digest('overflow'), available: false });
  await assert.rejects(f.read(), bad);
});
test('portable unavailable relation remains hidden if a target appears; backup detects contradictory snapshot', async () => {
  const f = await fixture(),
    unknown = f.relations.find((r) => !r.available).targetKey;
  const row = (await f.listBase()).items.find((r) => r.id === f.item.sourceKey);
  f.records.set(f.basePath + '/items/' + unknown, { sourceKey: unknown, kind: 'lore' });
  const projected = await f.read();
  assert.ok(!projected.item.structured.relations.some((r) => r.targetKey === unknown));
  await assert.rejects(
    f.baseReader.readCampaignBackupBaseItem(uid, {
      ...f.originalFixture.anchor,
      id: row.id,
      itemToken: row.itemToken,
      index: 0,
    }),
    (e) => e.details?.reason === 'campaign-backup-base-inconsistent',
  );
});
test('historical external relation stays private, does not resolve by hash and reexports an explicit unresolved key', async () => {
  const f = await fixture(),
    unknown = digest('external-old-anchor-key');
  f.item.structured.portableRelations.push({
    targetKey: unknown,
    available: true,
    relationType: 'HISTORICAL TYPE',
    description: 'HISTORICAL DESCRIPTION',
  });
  const projected = await f.read();
  assert.ok(!projected.item.structured.relations.some((r) => r.targetKey === unknown));
  const logical = await f.logical(),
    r = logical.structured.relations.find((r) => r.targetKey === unknown);
  assert.deepEqual(r, { targetKey: unknown, available: false });
  assert.equal(f.item.structured.portableRelations.at(-1).description, 'HISTORICAL DESCRIPTION');
  const file = await f.write();
  assert.equal((await f.review(file.bytes)).validation, 'campaign-backup-review-only');
  assert.doesNotMatch(file.bytes.toString('utf8'), /HISTORICAL TYPE|HISTORICAL DESCRIPTION/);
});
test('retained base-mode anchor preserves portable relations after explicit native adoption and restore', async () => {
  const f = await fixture();
  const remove = {
    ...f.scope(),
    sourceKey: f.item.sourceKey,
    operationId: 'portable-legacy-remove-001',
    expectedRevision: 0,
  };
  await f.lore.removeCampaignLore(uid, remove);
  await f.recovery.resolveCampaignLoreOperation(uid, {
    ...remove,
    action: 'remove',
    intent: 'confirm',
  });
  await f.originalFixture.removeReferences();
  await f.originalFixture.adopt();
  const root = f.records.get(f.path);
  f.campaign = root;
  const restore = {
    ...f.scope(),
    sourceKey: f.item.sourceKey,
    operationId: 'portable-legacy-restore-001',
    expectedRevision: 2,
  };
  await f.lore.restoreCampaignLore(uid, restore);
  await f.recovery.resolveCampaignLoreOperation(uid, {
    ...restore,
    action: 'restore',
    intent: 'confirm',
  });
  const projected = await f.effective();
  assert.equal(projected.item.legacy, true);
  assert.deepEqual(
    projected.item.entity.relations.map((r) => r.relationType),
    ['Conhece', 'Rival'],
  );
  const file = await f.write(),
    r = await f.review(file.bytes);
  assert.ok(r.derived.anchors > 0);
  assert.ok(r.derived.externalAnchorTargets > 0);
});
test('portable markers on a non-lore item or native capture reject without a compatibility fallback', async () => {
  const f = await fixture(),
    base = f.records.get(f.basePath),
    other = { ...f.item, kind: 'scene' };
  assert.throws(() => portableBaseLoreRelations(base, other), bad);
  const native = { ...base };
  delete native.sourceMode;
  delete native.sourceEvidence;
  assert.throws(() => portableBaseLoreRelations(native, f.item), bad);
});
