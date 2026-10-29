import test from 'node:test';
import assert from 'node:assert/strict';
import { restoredBackupFixture, recreate, uid } from './helpers/campaignRestoredBackup.mjs';
import { campaignBackupTestIndexes } from './helpers/campaignBackupTestIndexes.mjs';
import { createCampaignBaseReadService, projectedReference } from '../src/campaignBaseRead.mjs';
import { createCampaignBackupBaseInventoryService } from '../src/campaignBackupBaseInventory.mjs';
import { createCampaignBackupReviewService } from '../src/campaignBackupReview.mjs';
import { readCampaignBase, digest } from '../src/campaignBaseContracts.mjs';
const bad = (e) => e.details?.reason === 'campaign-portable-reference-inconsistent';
async function rows(f, family) {
  const result = [];
  let cursor;
  do {
    const page = await f.inventory.listCampaignBackupBaseResources(uid, {
      ...f.anchor,
      family,
      ...(cursor ? { cursor } : {}),
    });
    for (const row of page.items) {
      const bytes = [];
      let part;
      for (let index = 0; !part || index < part.chunkCount; index++) {
        part = await f.inventory.readCampaignBackupBaseResource(uid, {
          ...f.anchor,
          family,
          id: row.id,
          resourceToken: row.resourceToken,
          index,
        });
        assert.equal(part.outcome, 'chunk');
        bytes.push(Buffer.from(part.chunkBase64, 'base64'));
      }
      result.push({ row, data: JSON.parse(Buffer.concat(bytes).toString()) });
    }
    cursor = page.nextCursor;
  } while (cursor);
  return result;
}
async function fixture({ missing = false } = {}) {
  const f = await restoredBackupFixture({ local: true });
  f.inventory = createCampaignBackupBaseInventoryService({ db: f.db });
  f.reader = createCampaignBaseReadService({ db: f.db, assets: f.storage });
  const items = f.items(),
    arc = items.find((i) => i.kind === 'arc');
  for (const kind of ['scene', 'event']) {
    const target = items.find((i) => i.kind === kind);
    f.records.set(f.basePath + '/links/' + digest('portable-' + kind), {
      kind: 'narrative',
      sourceKey: arc.sourceKey,
      reference: { kind, [kind + 'Id']: target.origin.id },
    });
  }
  f.externalKey = digest({
    kind: 'book-lore',
    bookId: 'unavailable-book-0001',
    id: 'hidden-entry-0001',
  });
  f.records.set(f.basePath + '/links/' + digest('portable-external'), {
    kind: 'narrative',
    sourceKey: arc.sourceKey,
    reference: {
      kind: 'lore',
      reference: { kind: 'book', scopeId: 'unavailable-book-0001', entityId: 'hidden-entry-0001' },
    },
  });
  const lore = items.find((i) => i.origin.kind === 'lore');
  f.loreKey = lore.sourceKey;
  if (missing) f.records.get('universes/world/lore/' + lore.origin.id).deleted = true;
  await f.refresh();
  const ledgers = await rows(f, 'loreReferences'),
    links = await rows(f, 'links');
  for (const { data } of ledgers) {
    const value = f.records.get(f.basePath + '/loreReferences/' + data.id);
    delete value.reference;
    delete value.available;
    delete value.sourceKey;
    Object.assign(value, {
      referenceMode: 'portable',
      portableReference: {
        schemaVersion: 1,
        target: { kind: 'lore', sourceKey: data.targetKey, available: data.available },
      },
    });
  }
  for (const { data } of links) {
    const value = f.records.get(f.basePath + '/links/' + data.id);
    delete value.reference;
    Object.assign(value, {
      referenceMode: 'portable',
      portableReference: {
        schemaVersion: 1,
        target: { ...data.target },
        ledgerId:
          data.target.kind === 'lore'
            ? (ledgers.find((r) => r.data.targetKey === data.target.sourceKey)?.data.id ?? null)
            : null,
      },
    });
  }
  if (missing) {
    f.records.delete(f.basePath + '/items/' + lore.sourceKey);
    for (const [path, value] of [...f.records])
      if (path.startsWith(f.basePath + '/bodies/') && value.sourceKey === lore.sourceKey)
        f.records.delete(path);
    delete f.records.get('universes/world/lore/' + lore.origin.id).deleted;
  }
  f.nativeDtos = { links: links.map((r) => r.data), loreReferences: ledgers.map((r) => r.data) };
  f.publicRows = async (sourceKey) =>
    f.reader.listCampaignBaseReferences(uid, { campaignId: f.id, sourceKey });
  f.review = async (bytes) => {
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
    assert.ok(opened.every((r) => r.disposed === 1));
    return result;
  };
  return f;
}
test('logical links and ledgers retain exact portable DTOs, all target kinds and valid signed reexport without raw origins', async () => {
  const f = await fixture();
  for (const family of ['links', 'loreReferences'])
    assert.deepEqual(
      (await rows(f, family)).map((r) => r.data),
      f.nativeDtos[family],
    );
  const kinds = new Set();
  let unavailable = 0;
  for (const item of f
    .items()
    .filter((i) => ['scene', 'arc', 'milestone', 'event'].includes(i.kind))) {
    const page = await f.publicRows(item.sourceKey);
    for (const link of page.items) {
      if (link.available) kinds.add(f.records.get(f.basePath + '/items/' + link.targetKey).kind);
      else unavailable++;
    }
    assert.doesNotMatch(
      JSON.stringify(page),
      /portableReference|referenceMode|ledgerId|unavailable-book-0001|hidden-entry-0001/,
    );
  }
  assert.deepEqual([...kinds].sort(), ['event', 'lore', 'scene']);
  assert.ok(unavailable > 0);
  const file = await f.write(),
    review = await f.review(file.bytes);
  assert.ok(review.derived.links >= 5);
  assert.ok(review.derived.ledger >= 2);
  assert.doesNotMatch(
    file.bytes.toString('utf8'),
    /portableReference|referenceMode|unavailable-book-0001|hidden-entry-0001/,
  );
});
test('missing target remains opaque when its live source returns; read never probes the absent item or old origin', async () => {
  const f = await fixture({ missing: true }),
    scene = f.items().find((i) => i.kind === 'scene');
  f.metadataReads.length = 0;
  const page = await f.publicRows(scene.sourceKey);
  const unknown = page.items.filter((r) => !r.available);
  assert.ok(unknown.length);
  assert.ok(unknown.every((r) => r.targetKey === null));
  assert.ok(
    !f.metadataReads.some(
      (r) => r.path === f.basePath + '/items/' + f.loreKey || r.path.includes('/lore/hero'),
    ),
  );
  const output = (await rows(f, 'links')).map((r) => r.data);
  assert.ok(output.some((r) => r.target.sourceKey === f.loreKey && !r.target.available));
  const file = await f.write(),
    review = await f.review(file.bytes);
  assert.equal(review.validation, 'campaign-backup-review-only');
});
test('an explicitly unavailable link never resolves even if an item later appears; backup rejects contradictory physical content', async () => {
  const f = await fixture(),
    entry = [...f.records].find(
      ([p, v]) =>
        p.startsWith(f.basePath + '/links/') &&
        v.portableReference.target.sourceKey === f.externalKey,
    );
  const [path, link] = entry;
  const context = await f.db.runTransaction((tx) => readCampaignBase(tx, f.db, uid, f.id));
  f.records.set(f.basePath + '/items/' + f.externalKey, { sourceKey: f.externalKey, kind: 'lore' });
  f.metadataReads.length = 0;
  const result = await f.db.runTransaction((tx) =>
    projectedReference(tx, f.db, context, link, path.split('/').at(-1)),
  );
  assert.equal(result.available, false);
  assert.equal(result.targetKey, null);
  assert.equal(f.metadataReads.length, 0);
  await assert.rejects(
    rows(f, 'links'),
    (e) => e.details?.reason === 'campaign-backup-base-inconsistent',
  );
});
test('current source revocation suppresses formerly available target and recreation cannot reauthorize old copied material', async () => {
  const f = await fixture(),
    scene = f.items().find((i) => i.kind === 'scene');
  recreate(f, 'universes/world/lore/hero');
  await f.refresh();
  const page = await f.publicRows(scene.sourceKey);
  assert.ok(page.items.some((r) => !r.available));
  const output = (await rows(f, 'links')).map((r) => r.data);
  assert.ok(output.some((r) => r.target.sourceKey === f.loreKey && !r.target.available));
  const file = await f.write();
  assert.equal((await f.review(file.bytes)).validation, 'campaign-backup-review-only');
});
for (const [name, mutate] of [
  [
    'missing mode',
    (v) => {
      delete v.referenceMode;
    },
  ],
  [
    'null mode',
    (v) => {
      v.referenceMode = null;
    },
  ],
  [
    'missing descriptor',
    (v) => {
      delete v.portableReference;
    },
  ],
  [
    'null descriptor',
    (v) => {
      v.portableReference = null;
    },
  ],
  [
    'unknown field',
    (v) => {
      v.portableReference.extra = true;
    },
  ],
  [
    'wrong schema',
    (v) => {
      v.portableReference.schemaVersion = 2;
    },
  ],
  [
    'raw reference alongside marker',
    (v) => {
      v.reference = { kind: 'scene', sceneId: 'hidden-scene-0001' };
    },
  ],
  [
    'invalid key',
    (v) => {
      v.portableReference.target.sourceKey = 'bad';
    },
  ],
  [
    'nonboolean state',
    (v) => {
      v.portableReference.target.available = null;
    },
  ],
  [
    'scene link points to event',
    (v) => {
      v.portableReference.target.kind = 'event';
    },
  ],
  [
    'available lore without ledger',
    (v) => {
      v.portableReference.ledgerId = null;
    },
  ],
])
  test('malformed portable link rejects ' + name + ' without native fallback', async () => {
    const f = await fixture(),
      entry = [...f.records].find(
        ([p, v]) =>
          p.startsWith(f.basePath + '/links/') &&
          v.kind === 'scene' &&
          v.portableReference.target.available,
      );
    const value = entry[1];
    mutate(value);
    await assert.rejects(f.publicRows(value.sourceKey), bad);
    await assert.rejects(rows(f, 'links'), bad);
  });
test('links and ledger must match target and exported state in both readers', async () => {
  const f = await fixture(),
    entry = [...f.records].find(
      ([p, v]) =>
        p.startsWith(f.basePath + '/links/') &&
        v.kind === 'scene' &&
        v.portableReference.target.available,
    );
  const value = entry[1],
    ledger = f.records.get(f.basePath + '/loreReferences/' + value.portableReference.ledgerId);
  ledger.portableReference.target.available = false;
  await assert.rejects(f.publicRows(value.sourceKey), bad);
  await assert.rejects(rows(f, 'links'), bad);
});
test('ledger cannot retain conflicting native declarations or an unprocessed state', async () => {
  const f = await fixture(),
    entry = [...f.records].find(([p]) => p.startsWith(f.basePath + '/loreReferences/')),
    value = entry[1];
  value.available = true;
  await assert.rejects(rows(f, 'loreReferences'), bad);
  delete value.available;
  value.processed = false;
  await assert.rejects(rows(f, 'loreReferences'), bad);
});
test('logical ledger ID remains canonical for an available captured origin', async () => {
  const f = await fixture(),
    entry = [...f.records].find(
      ([p, v]) =>
        p.startsWith(f.basePath + '/links/') &&
        v.kind === 'scene' &&
        v.portableReference.target.available,
    );
  const value = entry[1],
    old = value.portableReference.ledgerId,
    wrong = digest('wrong-ledger');
  const ledger = f.records.get(f.basePath + '/loreReferences/' + old);
  f.records.delete(f.basePath + '/loreReferences/' + old);
  ledger.referenceKey = wrong;
  f.records.set(f.basePath + '/loreReferences/' + wrong, ledger);
  for (const [p, v] of f.records)
    if (p.startsWith(f.basePath + '/links/') && v.portableReference.ledgerId === old)
      v.portableReference.ledgerId = wrong;
  await assert.rejects(f.publicRows(value.sourceKey), bad);
  await assert.rejects(rows(f, 'loreReferences'), bad);
});
test('ledger requires a real reverse link and source owner, with no unbounded scan', async () => {
  const f = await fixture(),
    ledgers = [...f.records].filter(([p]) => p.startsWith(f.basePath + '/loreReferences/'));
  const key = ledgers[0][0].split('/').at(-1);
  for (const [p, v] of [...f.records])
    if (p.startsWith(f.basePath + '/links/') && v.portableReference.ledgerId === key)
      f.records.delete(p);
  await assert.rejects(
    rows(f, 'loreReferences'),
    (e) => e.details?.reason === 'campaign-backup-base-inconsistent',
  );
  assert.ok(f.reads.every((r) => r.maximum <= 26));
});
test('portable markers cannot be attached to a native capture', async () => {
  const f = await fixture(),
    base = f.records.get(f.basePath);
  delete base.sourceMode;
  delete base.sourceEvidence;
  for (const item of f.items()) delete item.sourceEvidence;
  await f.refresh();
  const scene = f.items().find((i) => i.kind === 'scene');
  await assert.rejects(f.publicRows(scene.sourceKey), bad);
  await assert.rejects(rows(f, 'links'), bad);
});
test('changing logical marker invalidates resource token even without a native updateTime change', async () => {
  const f = await fixture(),
    page = await f.inventory.listCampaignBackupBaseResources(uid, { ...f.anchor, family: 'links' }),
    ref = page.items.find((row) => row.id === digest('portable-external'));
  const value = f.records.get(f.basePath + '/links/' + ref.id);
  value.portableReference.target.sourceKey = digest('changed');
  await assert.rejects(
    f.inventory.readCampaignBackupBaseResource(uid, {
      ...f.anchor,
      family: 'links',
      id: ref.id,
      resourceToken: ref.resourceToken,
      index: 0,
    }),
    (error) => error.details?.reason === 'campaign-backup-base-item-changed',
  );
});
