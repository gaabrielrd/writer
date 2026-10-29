import test from 'node:test';
import assert from 'node:assert/strict';
import { baseFixture } from './helpers/campaignBackupBase.mjs';
import { uid, adventureId, op, target } from './helpers/campaignComparison.mjs';
import { createCampaignBackupWitnessService } from '../src/campaignBackupWitness.mjs';
import { createCampaignBaseReadService } from '../src/campaignBaseRead.mjs';
import { createCampaignNotesService } from '../src/campaignNotes.mjs';
import { createAdventureLoreService } from '../src/adventureLore.mjs';
import { baseItemAvailable, digest, readCampaignBase } from '../src/campaignBaseContracts.mjs';
import { adventureIdentityToken } from '../src/campaignLoreOrigin.mjs';
import { anchorContext } from '../src/campaignLoreStorage.mjs';
import { observeCampaign, generationContext } from '../src/campaignComparisonContracts.mjs';

const copiedId = 'restored-campaign-reader-001',
  copiedBase = digest('restored-base-reader'),
  archiveHash = digest('authenticated-file'),
  localId = op('restored-local-lore');
const bad = (e) => e.details?.reason === 'campaign-restored-source-inconsistent';
const unavailable = (e) => e.code === 'not-found';
async function fixture(local = false) {
  const f = await baseFixture(
    local
      ? async (x) => {
          const lore = createAdventureLoreService({ db: x.db });
          const scope = await lore.listAdventureLore(uid, { adventureId, scope: 'adventure' });
          await lore.saveAdventureLore(uid, {
            adventureId,
            adventureToken: scope.adventureToken,
            entityId: localId,
            operationId: localId,
            expectedRevision: 0,
            expectedCollectionRevision: 0,
            entity: {
              name: 'Local',
              aliases: [],
              category: 'character',
              summary: 'Resumo local',
              details: 'Texto local 🐉',
              structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
              relations: [],
              isPublic: false,
            },
          });
          const scene = await x.scenes.getScene(uid, { target, sceneId: x.scene.id });
          await x.scenes.setSceneReference(uid, {
            target,
            sceneId: scene.id,
            operationId: op('restored-local-reference'),
            expectedRevision: scene.revision,
            reference: { kind: 'adventure', scopeId: adventureId, entityId: localId },
          });
        }
      : undefined,
  );
  const witness = createCampaignBackupWitnessService({ db: f.db });
  const baseSource = (await witness.getCampaignBackupBaseWitness(uid, f.anchor)).content;
  const evidence = new Map();
  let cursor = null;
  do {
    const page = await f.list(cursor ? { cursor } : {});
    for (const r of page.items)
      evidence.set(
        r.id,
        (
          await witness.getCampaignBackupItemWitness(uid, {
            ...f.anchor,
            id: r.id,
            itemToken: r.itemToken,
          })
        ).content,
      );
    cursor = page.nextCursor;
  } while (cursor);
  await f.studio.createCampaign(uid, {
    operationId: copiedId,
    title: 'Cópia privada',
    description: 'Própria',
  });
  const root = f.records.get('campaigns/' + copiedId);
  f.records.set('campaigns/' + copiedId, {
    ...root,
    activeBaseId: copiedBase,
    provenance: { kind: 'original', adventureId, baseId: copiedBase },
  });
  const oldPath = f.path,
    newPath = 'users/' + uid + '/campaignBases/' + copiedBase;
  for (const [path, value] of [...f.records]) {
    if (path !== oldPath && !path.startsWith(oldPath + '/')) continue;
    const copy = structuredClone(value);
    if (path === oldPath)
      Object.assign(copy, {
        id: copiedBase,
        campaignId: copiedId,
        sourceMode: 'restored',
        sourceEvidence: { schemaVersion: 1, archiveHash, source: structuredClone(baseSource) },
      });
    else if (path.startsWith(oldPath + '/items/'))
      copy.sourceEvidence = {
        schemaVersion: 1,
        archiveHash,
        source: structuredClone(evidence.get(copy.sourceKey)),
      };
    f.records.set(newPath + path.slice(oldPath.length), copy);
    f.records.delete(path);
  }
  f.records.delete('campaigns/' + f.id);
  f.metadata.set(newPath, { createdAt: 50, updatedAt: 60 });
  const fullReads = [];
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
  const reader = createCampaignBaseReadService({ db, assets: f.assets });
  const items = [...f.records].filter(([p]) => p.startsWith(newPath + '/items/')).map(([, v]) => v);
  const find = (kind) => items.find((i) => i.kind === kind);
  const read = (item) =>
    reader.readCampaignBaseItem(uid, { campaignId: copiedId, sourceKey: item.sourceKey });
  return {
    ...f,
    db,
    reader,
    fullReads,
    baseSource,
    oldPath,
    newPath,
    items,
    find,
    read,
    context: () => db.runTransaction((tx) => readCampaignBase(tx, db, uid, copiedId)),
  };
}
function patch(f, path, values) {
  f.records.set(path, { ...f.records.get(path), ...values });
}
function recreate(f, path) {
  f.metadata.set(path, { createdAt: 11, updatedAt: 30 });
}
const baseRecord = (f) => f.records.get(f.newPath);

test('restored ordinary readers preserve the frozen edition after old campaign/base removal and never expose private proofs', async () => {
  const f = await fixture(),
    base = await f.reader.getCampaignBase(uid, { campaignId: copiedId });
  assert.equal(base.baseId, copiedBase);
  assert.equal(f.records.has(f.oldPath), false);
  const first = await f.read(f.find('scene'));
  assert.ok(first.chunks.some((c) => c.content));
  const page = await f.reader.listCampaignBaseItems(uid, { campaignId: copiedId, kind: 'lore' });
  assert.ok(page.items.length);
  for (const dto of [base, first, page])
    assert.doesNotMatch(JSON.stringify(dto), /sourceEvidence|archiveHash|sourceMode/);
  patch(f, 'adventures/' + adventureId, {
    title: 'Outra revisão',
    synopsis: 'Não substituir',
    loreVersion: 99,
  });
  const second = await f.read(f.find('scene'));
  assert.deepEqual(second.chunks, first.chunks);
  assert.deepEqual(
    (await f.reader.getCampaignBase(uid, { campaignId: copiedId })).source,
    base.source,
  );
  assert.ok(!f.fullReads.some((p) => p === f.oldPath || p.startsWith(f.oldPath + '/')));
});
for (const kind of ['adventure', 'world', 'ficha'])
  test(
    'recreated ' +
      kind +
      ' cannot grant frozen bytes merely because it predates the new private base',
    async () => {
      const f = await fixture(),
        lore = f.find('lore'),
        originPath =
          kind === 'adventure'
            ? 'adventures/' + adventureId
            : kind === 'world'
              ? 'universes/world'
              : 'universes/world/lore/' + lore.origin.id;
      recreate(f, originPath);
      f.fullReads.length = 0;
      if (kind === 'adventure') {
        await assert.rejects(f.read(f.find('scene')), unavailable);
        assert.ok(!f.fullReads.includes(f.newPath));
        assert.equal(
          await f.db.runTransaction((tx) =>
            readCampaignBase(tx, f.db, uid, copiedId, { optionalSource: true }),
          ),
          null,
        );
        const observed = await f.db.runTransaction((tx) =>
          observeCampaign(tx, f.db, uid, copiedId),
        );
        assert.equal(observed.available, false);
        assert.equal(observed.reason, 'source-unavailable');
      } else {
        await assert.rejects(f.read(lore), unavailable);
        assert.ok(!f.fullReads.includes(f.newPath + '/items/' + lore.sourceKey));
        const page = await f.reader.listCampaignBaseItems(uid, {
          campaignId: copiedId,
          kind: 'lore',
        });
        assert.equal(page.items.length, 0);
        assert.ok((await f.read(f.find('scene'))).chunks.length);
      }
      assert.ok(
        !f.fullReads.some(
          (p) => p.includes('/bodies/') && (kind === 'adventure' || p.includes(lore.sourceKey)),
        ),
      );
    },
  );
for (const [name, update] of [
  [
    'missing mode',
    (b) => {
      delete b.sourceMode;
    },
  ],
  [
    'null mode',
    (b) => {
      b.sourceMode = null;
    },
  ],
  [
    'missing evidence',
    (b) => {
      delete b.sourceEvidence;
    },
  ],
  [
    'null evidence',
    (b) => {
      b.sourceEvidence = null;
    },
  ],
  [
    'unknown field',
    (b) => {
      b.sourceEvidence.extra = true;
    },
  ],
  [
    'wrong witness kind',
    (b) => {
      b.sourceEvidence.source.kind = 'project';
    },
  ],
  [
    'wrong adventure',
    (b) => {
      b.sourceEvidence.source.adventure.id = 'another-adventure-id';
    },
  ],
  [
    'wrong universe',
    (b) => {
      b.sourceEvidence.source.universe.id = 'other';
    },
  ],
  [
    'wrong capture time',
    (b) => {
      b.sourceEvidence.source.capturedAt++;
    },
  ],
])
  test(
    'base rejects ' + name + ' without falling back to native capture or reading its snapshot',
    async () => {
      const f = await fixture(),
        b = baseRecord(f);
      update(b);
      f.fullReads.length = 0;
      await assert.rejects(f.context(), bad);
      assert.ok(!f.fullReads.includes(f.newPath));
    },
  );
for (const [name, update] of [
  [
    'missing evidence',
    (i) => {
      delete i.sourceEvidence;
    },
  ],
  [
    'null evidence',
    (i) => {
      i.sourceEvidence = null;
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
      i.sourceEvidence.source.baseId = copiedBase;
    },
  ],
  [
    'wrong key',
    (i) => {
      i.sourceEvidence.source.sourceKey = digest('other');
    },
  ],
  [
    'unavailable witness',
    (i) => {
      i.sourceEvidence.source = { ...i.sourceEvidence.source, availability: 'unavailable' };
      delete i.sourceEvidence.source.origin;
    },
  ],
  [
    'redirected ficha',
    (i) => {
      i.sourceEvidence.source.origin.entityId = 'other';
    },
  ],
])
  test('item rejects ' + name + ' before reading its text', async () => {
    const f = await fixture(),
      i = f.find('lore');
    update(f.records.get(f.newPath + '/items/' + i.sourceKey));
    f.fullReads.length = 0;
    await assert.rejects(f.read(i), bad);
    assert.ok(!f.fullReads.includes(f.newPath + '/items/' + i.sourceKey));
    assert.ok(!f.fullReads.some((p) => p.includes('/bodies/')));
  });
test('local lore authorizes its archived ficha birth and preserves frozen text across live changes', async () => {
  const f = await fixture(true),
    item = f.items.find((i) => i.origin.kind === 'adventure-lore');
  assert.ok(item);
  const initial = await f.read(item);
  patch(f, 'adventures/' + adventureId + '/lore/' + localId, { details: 'Mudou' });
  assert.deepEqual((await f.read(item)).chunks, initial.chunks);
  recreate(f, 'adventures/' + adventureId + '/lore/' + localId);
  await assert.rejects(f.read(item), unavailable);
});
test('restored retained anchor uses its own new private path and exact old birth after adoption of a native base', async () => {
  const f = await fixture(),
    context = await f.context(),
    nextId = digest('native-next');
  const native = { ...baseRecord(f), id: nextId };
  delete native.sourceMode;
  delete native.sourceEvidence;
  const nextPath = 'users/' + uid + '/campaignBases/' + nextId;
  f.records.set(nextPath, native);
  patch(f, 'campaigns/' + copiedId, {
    activeBaseId: nextId,
    provenance: { kind: 'original', adventureId, baseId: nextId },
  });
  const current = await f.context(),
    anchor = { capturedBaseId: copiedBase, sourceKey: f.find('lore').sourceKey };
  const retained = await f.db.runTransaction((tx) => anchorContext(tx, f.db, current, anchor));
  assert.equal(retained.path, f.newPath);
  assert.equal(
    await f.db.runTransaction((tx) => baseItemAvailable(tx, f.db, retained, f.find('lore'))),
    true,
  );
  assert.notEqual(current.base.id, context.base.id);
  recreate(f, 'universes/world');
  const revoked = await f.db.runTransaction((tx) => anchorContext(tx, f.db, current, anchor));
  assert.equal(revoked.world, null);
  assert.equal(
    await f.db.runTransaction((tx) => baseItemAvailable(tx, f.db, revoked, f.find('lore'))),
    false,
  );
  recreate(f, 'adventures/' + adventureId);
  await assert.rejects(
    f.db.runTransaction((tx) => anchorContext(tx, f.db, current, anchor)),
    { code: 'failed-precondition' },
  );
});
test('comparison generation uses authorized snapshot and projection without leaking a recreated world', async () => {
  const f = await fixture(),
    before = await f.db.runTransaction((tx) =>
      generationContext(tx, f.db, uid, copiedId, baseRecord(f)),
    );
  assert.ok(before.world);
  recreate(f, 'universes/world');
  const after = await f.db.runTransaction((tx) =>
    generationContext(tx, f.db, uid, copiedId, baseRecord(f)),
  );
  assert.equal(after.world, null);
  assert.notEqual(after.projectionToken, before.projectionToken);
  recreate(f, 'adventures/' + adventureId);
  await assert.rejects(
    f.db.runTransaction((tx) => generationContext(tx, f.db, uid, copiedId, baseRecord(f))),
    unavailable,
  );
});
test('own campaign notes remain writable and readable after the restored origin is revoked', async () => {
  const f = await fixture(),
    notes = createCampaignNotesService({ db: f.db });
  recreate(f, 'adventures/' + adventureId);
  const page = await notes.listCampaignNotes(uid, { campaignId: copiedId });
  const noteId = 'restored-own-note-001';
  await notes.saveCampaignNote(uid, {
    campaignId: copiedId,
    campaignToken: page.campaignToken,
    noteId,
    operationId: noteId,
    expectedRevision: 0,
    title: 'Consequência',
    content: 'Escolha própria 🐉',
  });
  const note = await notes.getCampaignNote(uid, {
    campaignId: copiedId,
    campaignToken: page.campaignToken,
    noteId,
  });
  assert.match(JSON.stringify(note), /Escolha própria 🐉/);
});
for (const cause of ['foreign owner', 'deleting', 'reservation'])
  test(cause + ' denies restored source before base prose', async () => {
    const f = await fixture();
    if (cause === 'foreign owner') patch(f, 'adventures/' + adventureId, { ownerId: 'other' });
    else if (cause === 'deleting') patch(f, 'adventures/' + adventureId, { deleting: true });
    else {
      const snapshot = await f.db.doc('adventures/' + adventureId).get();
      f.records.set('adventureDeletionReservations/' + adventureId, {
        schemaVersion: 1,
        ownerId: uid,
        adventureId,
        adventureToken: adventureIdentityToken(uid, adventureId, snapshot),
        deletionId: 'restored-delete-reservation',
        state: 'deleted',
        createdAt: 1,
        updatedAt: 1,
      });
    }
    f.fullReads.length = 0;
    await assert.rejects(f.context(), unavailable);
    assert.ok(!f.fullReads.includes(f.newPath));
  });

test('a restored campaign can prepare, compare and adopt a new native base through the ordinary services', async () => {
  const f = await fixture();
  f.campaign = structuredClone(f.records.get('campaigns/' + copiedId));
  const { startComparison, finishComparison } = await import('./helpers/campaignComparison.mjs');
  const { createCampaignComparisonReadService } = await import('../src/campaignComparisonRead.mjs');
  const { createCampaignAdoptionService } = await import('../src/campaignAdoption.mjs');
  const candidate = await finishComparison(
    f,
    (await startComparison(f, 'restored-native-candidate')).result,
  );
  const reader = createCampaignComparisonReadService({ db: f.db, assets: f.assets });
  const page = await reader.listCampaignComparisonChanges(uid, {
    comparisonId: candidate.comparisonId,
    group: 'source',
  });
  assert.ok(page);
  const { createCampaignLoreService } = await import('../src/campaignLore.mjs');
  const lore = await createCampaignLoreService({ db: f.db }).listCampaignLore(uid, {
    campaignId: copiedId,
    baseId: copiedBase,
  });
  const adoption = createCampaignAdoptionService({ db: f.db });
  let p = (
    await adoption.startCampaignAdoption(uid, {
      operationId: op('restored-native-adoption'),
      campaignId: copiedId,
      campaignToken: lore.campaignToken,
      comparisonId: candidate.comparisonId,
      currentBaseId: copiedBase,
      candidateBaseId: candidate.candidateBaseId,
      expectedCollectionRevision: lore.collectionRevision,
    })
  ).progress;
  const step = async (method) =>
    (
      await adoption[method](uid, {
        adoptionId: p.adoptionId,
        operationId: digest({ restored: method, checkpoint: p.checkpoint }),
        expectedCheckpoint: p.checkpoint,
      })
    ).progress;
  p = await step('prepareCampaignAdoption');
  for (let n = 0; n < 200 && p.state === 'preparing'; n++)
    p = await step('advanceCampaignAdoption');
  assert.equal(p.state, 'ready');
  p = await step('activateCampaignAdoption');
  assert.equal(p.state, 'adopted');
  const context = await f.context();
  assert.equal(context.base.id, candidate.candidateBaseId);
  assert.equal(Object.hasOwn(context.base, 'sourceMode'), false);
  assert.ok((await f.reader.getCampaignBase(uid, { campaignId: copiedId })).source.title);
});
test('a nanosecond-only ficha recreation cannot reauthorize frozen lore or projected relationships', async () => {
  const f = await fixture(),
    item = f.find('lore'),
    path = 'universes/world/lore/' + item.origin.id;
  const born = (await f.db.doc(path).get()).createTime;
  f.metadata.set(path, {
    createdAt: 10,
    createdAtNanoseconds: born.nanoseconds - 10e6 + 1,
    updatedAt: 30,
  });
  await assert.rejects(f.read(item), unavailable);
  assert.ok((await f.read(f.find('scene'))).chunks.length);
});

test('reference reads reject a revoked lore source before item prose and hide a revoked target key on scene links', async () => {
  const f = await fixture(),
    lore = f.find('lore'),
    scene = f.find('scene');
  const before = await f.reader.listCampaignBaseReferences(uid, {
    campaignId: copiedId,
    sourceKey: scene.sourceKey,
  });
  assert.ok(before.items.some((i) => i.available));
  recreate(f, 'universes/world/lore/' + lore.origin.id);
  f.fullReads.length = 0;
  await assert.rejects(
    f.reader.listCampaignBaseReferences(uid, { campaignId: copiedId, sourceKey: lore.sourceKey }),
    unavailable,
  );
  assert.ok(!f.fullReads.includes(f.newPath + '/items/' + lore.sourceKey));
  const after = await f.reader.listCampaignBaseReferences(uid, {
    campaignId: copiedId,
    sourceKey: scene.sourceKey,
  });
  assert.ok(after.items.length);
  assert.ok(after.items.every((i) => !i.available && i.targetKey === null));
});
test('an organizational universe change never rebinds the frozen source universe', async () => {
  const f = await fixture();
  patch(f, 'campaigns/' + copiedId, { universeId: 'new-organization' });
  f.records.set('universes/new-organization', { authorId: uid });
  assert.ok((await f.read(f.find('lore'))).chunks.length);
  recreate(f, 'universes/world');
  await assert.rejects(f.read(f.find('lore')), unavailable);
});
