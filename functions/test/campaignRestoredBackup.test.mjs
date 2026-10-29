import test from 'node:test';
import assert from 'node:assert/strict';
import {
  restoredBackupFixture,
  recreate,
  uid,
  adventureId,
  localId,
} from './helpers/campaignRestoredBackup.mjs';
import { entity, heroKey } from './helpers/campaignBackupLore.mjs';
import { createCampaignBackupReviewService } from '../src/campaignBackupReview.mjs';
import { createCampaignBackupBaseInventoryService } from '../src/campaignBackupBaseInventory.mjs';
import { decodeCampaignBackup } from '../src/campaignBackupContainer.mjs';
import { campaignBackupBaseAnchor } from '../src/campaignBackupBaseContext.mjs';
import { readCampaignBackupDerivedSource } from '../src/campaignBackupDerivedSource.mjs';
import { campaignBackupScope } from '../src/campaignBackupSource.mjs';
import { digest } from '../src/workProgressContracts.mjs';

const bad = (e) => e.details?.reason === 'campaign-restored-source-inconsistent';
const source = (bytes) => ({
  size: bytes.length,
  read: async (offset, n) => bytes.subarray(offset, offset + n),
});
function indexes(opened) {
  return async (stage) => {
    const rows = new Map(),
      state = { stage, disposed: 0 };
    opened.push(state);
    return {
      write: async (r) => rows.set(r.index, { ...r, payload: Buffer.from(r.payload) }),
      seal: async () => {},
      read: async (start, n) => Array.from({ length: n }, (_, i) => rows.get(start + i)),
      lookup: async (family, key) => {
        if (stage === 'own')
          return [...rows.values()].find((r) => r.family === family && r.id === key);
        const list = [...rows.values()]
          .filter((r) => r.section === family)
          .sort((a, b) => a.position - b.position);
        return (
          list.find((r) => r.key === key) ?? {
            before: list.filter((r) => r.key < key).at(-1) ?? null,
            after: list.find((r) => r.key > key) ?? null,
          }
        );
      },
      reverse: async (kind, key) =>
        [...rows.values()].find((r) => {
          const v = JSON.parse(Buffer.from(r.payload).toString());
          return kind === 'image'
            ? r.section === 'base:item' && v.meta?.image === key
            : kind === 'ledger'
              ? r.section === 'base:loreReferences' && v.meta?.targetKey === key
              : r.section === 'base:links' && v.meta?.target?.sourceKey === key;
        }),
      dispose: async () => {
        state.disposed++;
        rows.clear();
      },
    };
  };
}
async function review(f, bytes) {
  const opened = [];
  const result = await createCampaignBackupReviewService({
    db: f.db,
    keys: f.keys,
    now: () => 6000,
    createIndex: indexes(opened),
  }).reviewCampaignBackup(uid, source(bytes));
  assert.ok(opened.every((s) => s.disposed === 1));
  assert.deepEqual(
    opened.map((s) => s.stage),
    ['own', 'derived', 'origins'],
  );
  return result;
}
test('a copied campaign reexports a real signed rich file with original births, frozen long UTF8, images and variants', async () => {
  const f = await restoredBackupFixture({ local: true, long: true });
  f.metadataReads.length = 0;
  await f.save(
    'restored-rich-variant',
    0,
    entity({ details: '\ufeff  ' + '🐉á'.repeat(14000) + '\n  ' }),
  );
  await f.refresh();
  const target = { kind: 'adventure', id: adventureId };
  const live = await f.scenes.getScene(uid, { target, sceneId: f.scene.id });
  await f.scenes.updateScene(uid, {
    target,
    sceneId: live.id,
    operationId: 'restored-live-scene-edit',
    expectedRevision: live.revision,
    patch: { content: 'LIVE REPLACEMENT SHOULD NOT APPEAR' },
  });
  await f.refresh();
  const before = structuredClone([...f.records]),
    file = await f.write();
  assert.equal(file.commits, 1);
  assert.equal(file.aborts, 0);
  const r = await review(f, file.bytes);
  assert.equal(r.validation, 'campaign-backup-review-only');
  assert.equal(r.origins.unavailable, 0);
  assert.ok(r.derived.items > 7);
  assert.deepEqual([...f.records], before);
  assert.equal(f.records.has(f.oldBasePath), false);
  const b = await f.witness.getCampaignBackupBaseWitness(uid, f.anchor);
  assert.equal(b.content.baseId, f.baseId);
  assert.notEqual(b.content.baseId, f.oldSource.baseId);
  assert.deepEqual(b.content.adventure, f.oldSource.adventure);
  assert.deepEqual(b.content.universe, f.oldSource.universe);
  assert.equal(b.content.capturedAt, f.oldSource.capturedAt);
  let archivedWitness = null;
  for await (const record of decodeCampaignBackup(source(file.bytes))) {
    if (record.kind === 'witness') {
      const value = JSON.parse(Buffer.from(record.payload).toString());
      if (value[0] === 'base') archivedWitness = value[3];
    }
  }
  assert.deepEqual(archivedWitness, b.content);
  const plaintext = file.bytes.toString('utf8');
  assert.doesNotMatch(plaintext, /sourceEvidence|sourceMode|LIVE REPLACEMENT SHOULD NOT APPEAR/);
  assert.match(plaintext, /🐉á/);
  assert.ok(
    !f.metadataReads.some(
      (read) => read.path === f.oldBasePath || read.path.startsWith(f.oldBasePath + '/'),
    ),
  );
});
for (const family of ['adventure', 'world', 'ficha', 'local ficha'])
  test('backup cannot reauthorize recreated ' + family + ' before the new copy birth', async () => {
    const f = await restoredBackupFixture({ local: true }),
      lore = f.items().find((v) => v.origin.kind === 'lore');
    const path =
      family === 'adventure'
        ? 'adventures/' + adventureId
        : family === 'world'
          ? 'universes/world'
          : family === 'ficha'
            ? 'universes/world/lore/' + lore.origin.id
            : 'adventures/' + adventureId + '/lore/' + localId;
    recreate(f, path);
    await f.refresh();
    if (family === 'adventure') {
      const d = await f.derived.getCampaignBackupDerivedSource(uid, {
        campaignId: f.id,
        sourceToken: f.anchor.sourceToken,
      });
      assert.equal(d.availability, 'unavailable');
      await assert.rejects(
        f.listBase(),
        (e) => e.details?.reason === 'campaign-backup-base-unavailable',
      );
    } else {
      const item =
        family === 'local ficha' ? f.items().find((v) => v.origin.kind === 'adventure-lore') : lore;
      const witness = await f.witnessItem(item.sourceKey);
      assert.equal(witness.content.availability, 'unavailable');
      assert.equal(Object.hasOwn(witness.content, 'origin'), false);
      assert.ok(
        (await f.witnessItem(f.items().find((v) => v.kind === 'scene').sourceKey)).content.origin,
      );
      const row = (await f.listBase()).items.find((r) => r.id === item.sourceKey);
      const hidden = await f.baseReader.readCampaignBackupBaseItem(uid, {
        ...f.anchor,
        id: row.id,
        itemToken: row.itemToken,
        index: 0,
      });
      assert.equal(hidden.outcome, 'unavailable');
      assert.equal(Object.hasOwn(hidden, 'chunkBase64'), false);
      const file = await f.write(),
        r = await review(f, file.bytes);
      assert.ok(r.derived.items > 0);
      const bodies = [...f.records]
        .filter(([p, v]) => p.startsWith(f.basePath + '/bodies/') && v.sourceKey === item.sourceKey)
        .map(([p]) => p);
      assert.ok(bodies.length > 0);
      assert.ok(
        !f.metadataReads.some((r) => bodies.includes(r.path) && r.fields.includes('content')),
      );
    }
  });
test('retained restored anchor survives actual native adoption, reexport and removal of the original database base', async () => {
  const f = await restoredBackupFixture();
  await f.save('restored-retained-variant', 0, entity());
  await f.refresh();
  await f.removeReferences();
  await f.adopt();
  assert.notEqual(f.campaign.activeBaseId, f.baseId);
  const page = await f.list(),
    row = page.items.find((v) => v.id === heroKey);
  assert.ok(row);
  const w = await f.witness.getCampaignBackupLoreWitness(uid, {
    ...f.anchor,
    id: row.id,
    variantToken: row.variantToken,
  });
  assert.equal(w.content.base.baseId, f.baseId);
  assert.deepEqual(w.content.base.adventure, f.oldSource.adventure);
  assert.notEqual(w.content.base.baseId, f.oldSource.baseId);
  const file = await f.write(),
    r = await review(f, file.bytes);
  assert.ok(r.derived.anchors > 0);
  recreate(f, 'universes/world/lore/hero');
  await f.refresh();
  assert.equal((await f.list()).items.find((v) => v.id === heroKey).availability, 'unavailable');
});
for (const [name, mutate] of [
  [
    'partial base marker',
    (f) => {
      delete f.records.get(f.basePath).sourceMode;
    },
  ],
  [
    'null base evidence',
    (f) => {
      f.records.get(f.basePath).sourceEvidence = null;
    },
  ],
  [
    'wrong base source',
    (f) => {
      f.records.get(f.basePath).sourceEvidence.source.adventure.id = 'another-adventure';
    },
  ],
])
  test('backup rejects ' + name + ' before derived text', async () => {
    const f = await restoredBackupFixture();
    mutate(f);
    await assert.rejects(f.refresh(), bad);
  });
for (const [name, mutate] of [
  [
    'missing item evidence',
    (i) => {
      delete i.sourceEvidence;
    },
  ],
  [
    'wrong archive',
    (i) => {
      i.sourceEvidence.archiveHash = digest('other');
    },
  ],
  [
    'wrong old base',
    (i) => {
      i.sourceEvidence.source.baseId = digest('other');
    },
  ],
  [
    'wrong key',
    (i) => {
      i.sourceEvidence.source.sourceKey = digest('other');
    },
  ],
  [
    'redirected ficha',
    (i) => {
      i.sourceEvidence.source.origin.entityId = 'different';
    },
  ],
])
  test('backup rejects ' + name + ' without treating the item as native', async () => {
    const f = await restoredBackupFixture(),
      i = f.items().find((v) => v.kind === 'lore');
    mutate(i);
    await assert.rejects(f.listBase(), bad);
  });
test('restored source proof changes invalidate an existing derived anchor even without relying on updateTime', async () => {
  const f = await restoredBackupFixture(),
    anchor = { ...f.anchor };
  f.records.get(f.basePath).sourceEvidence.archiveHash = digest('changed-file');
  await assert.rejects(
    f.baseReader.listCampaignBackupBaseItems(uid, anchor),
    (e) => e.details?.reason === 'campaign-backup-derived-source-changed',
  );
});
test('a nanosecond-only ficha recreation is unavailable to the backup witness', async () => {
  const f = await restoredBackupFixture(),
    i = f.items().find((v) => v.kind === 'lore'),
    path = 'universes/world/lore/' + i.origin.id;
  const born = (await f.db.doc(path).get()).createTime;
  f.metadata.set(path, {
    createdAt: 10,
    createdAtNanoseconds: born.nanoseconds - 10e6 + 1,
    updatedAt: 30,
  });
  await f.refresh();
  assert.equal((await f.witnessItem(i.sourceKey)).content.availability, 'unavailable');
});
test('retained base gate checks its own evidence rather than borrowing the current native candidate', async () => {
  const f = await restoredBackupFixture();
  await f.save('restored-anchor-gate', 0, entity());
  await f.refresh();
  await f.removeReferences();
  await f.adopt();
  f.records.get(f.basePath).sourceEvidence = null;
  const input = {
    ...campaignBackupScope(f.db, uid, { campaignId: f.id }),
    expected: f.anchor.sourceToken,
    derivedExpected: f.anchor.derivedToken,
  };
  await assert.rejects(
    f.db.runTransaction(async (tx) => {
      const current = await readCampaignBackupDerivedSource(tx, input);
      return campaignBackupBaseAnchor(tx, input, current, f.baseId, adventureId);
    }),
    bad,
  );
});
test('changing restored proof during file output aborts publication of bytes', async () => {
  const f = await restoredBackupFixture();
  let observed;
  await assert.rejects(
    f.write(async (result, n) => {
      observed = result;
      if (n === 1) f.records.get(f.basePath).sourceEvidence.archiveHash = digest('new-file');
    }),
  );
  assert.equal(observed?.commits, 0);
  assert.equal(observed?.aborts, 1);
});
test('physical resource inventory remains metadata-only and reuses the exact restored gate', async () => {
  const f = await restoredBackupFixture(),
    api = createCampaignBackupBaseInventoryService({ db: f.db });
  const page = await api.listCampaignBackupBaseResources(uid, { ...f.anchor, family: 'bodies' });
  assert.ok(page.items.length);
  for (const read of f.metadataReads) assert.ok(!read.fields.includes('content'));
  recreate(f, 'adventures/' + adventureId);
  await f.refresh();
  await assert.rejects(
    api.listCampaignBackupBaseResources(uid, { ...f.anchor, family: 'bodies' }),
    (e) => e.details?.reason === 'campaign-backup-base-unavailable',
  );
});

test('own notes still reexport after all restored adventure material becomes unavailable, without Storage access', async () => {
  const f = await restoredBackupFixture();
  await f.save(
    'restored-now-revoked-variant',
    0,
    entity({ details: 'DERIVED TEXT MUST BE OMITTED' }),
  );
  const { createCampaignNotesService } = await import('../src/campaignNotes.mjs');
  const notes = createCampaignNotesService({ db: f.db });
  const scope = await notes.listCampaignNotes(uid, { campaignId: f.id }),
    noteId = 'restored-backup-own-note-001';
  await notes.saveCampaignNote(uid, {
    campaignId: f.id,
    campaignToken: scope.campaignToken,
    noteId,
    operationId: noteId,
    expectedRevision: 0,
    title: 'Consequência própria',
    content: 'OWN CONSEQUENCE PRESERVED',
  });
  recreate(f, 'adventures/' + adventureId);
  await f.refresh();
  f.controls.events.length = 0;
  const file = await f.write(),
    r = await review(f, file.bytes);
  assert.equal(r.manifest.availability, 'unavailable');
  assert.equal(r.derived.items, 0);
  assert.equal(f.controls.events.length, 0);
  assert.match(file.bytes.toString('utf8'), /OWN CONSEQUENCE PRESERVED/);
  assert.doesNotMatch(file.bytes.toString('utf8'), /DERIVED TEXT MUST BE OMITTED/);
});
