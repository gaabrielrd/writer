import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fixture as portableFixture,
  known,
  wire,
  unresolved,
} from './helpers/campaignPortableVariantBody.mjs';
import { uid, adventureId } from './helpers/campaignRestoredBackup.mjs';
import { heroKey, entity, measuredDb } from './helpers/campaignAdoption.mjs';
import { startComparison } from './helpers/campaignComparison.mjs';
import { startDeletion, finishDeletion } from './helpers/campaignDeletion.mjs';
import { createCampaignNotesService } from '../src/campaignNotes.mjs';
import { createCampaignSessionsService } from '../src/campaignSessions.mjs';
import { createCampaignSessionReferencesService } from '../src/campaignSessionReferences.mjs';
import { createCampaignPreparationService } from '../src/campaignPreparation.mjs';
import { baseImageKey, baseImageUseKey } from '../src/campaignBaseContracts.mjs';
import { digest } from '../src/workProgressContracts.mjs';

const ownRoots = (f) =>
  [...f.records]
    .filter(
      ([p, v]) =>
        p.startsWith('users/' + uid + '/campaignBases/') &&
        p.split('/').length === 4 &&
        v.campaignId === f.id,
    )
    .map(([p]) => p);

async function ownMaterial(f) {
  const scope = { campaignId: f.id, campaignToken: f.campaignToken };
  f.notes = createCampaignNotesService({ db: f.db });
  for (let n = 0; n < 27; n++)
    await f.notes.saveCampaignNote(uid, {
      ...scope,
      noteId: 'restored-cleanup-note-' + n,
      operationId: 'restored-cleanup-note-' + n,
      expectedRevision: 0,
      title: 'Nota própria ' + n,
      content: 'Texto privado da nota 🐉\n',
    });
  f.sessions = createCampaignSessionsService({ db: f.db });
  const sessionId = 'restored-cleanup-session';
  await f.sessions.saveCampaignSession(uid, {
    ...scope,
    sessionId,
    operationId: sessionId,
    expectedRevision: 0,
    title: 'Sessão da mesa',
    summary: 'Resumo próprio 🐉',
    scheduledDate: null,
    status: 'planned',
  });
  f.refs = createCampaignSessionReferencesService({ db: f.db });
  const session = { ...scope, sessionId, expectedSessionRevision: 1 };
  const source = (
    await f.refs.listCampaignSessionReferences(uid, {
      ...session,
      kind: 'scene',
      view: 'references',
    })
  ).sourceContext;
  await f.refs.addCampaignSessionReference(uid, {
    ...session,
    referenceId: 'restored-cleanup-scene-link',
    operationId: 'restored-cleanup-scene-link',
    expectedReferenceCollectionRevision: 0,
    sourceContext: source,
    target: { kind: 'scene', sourceKey: f.items().find((i) => i.kind === 'scene').sourceKey },
  });
  f.preparation = createCampaignPreparationService({ db: f.db });
  const itemId = 'restored-cleanup-clue';
  await f.preparation.saveCampaignPreparationItem(uid, {
    ...scope,
    itemId,
    operationId: itemId,
    expectedRevision: 0,
    expectedItemCollectionRevision: 0,
    kind: 'clue',
    title: 'Pista privada',
    status: 'pending',
    body: { text: 'Texto da pista 🐉', condition: 'Ao investigar', recipient: 'Somente mestre' },
  });
  await f.preparation.addCampaignSessionPreparationLink(uid, {
    ...session,
    linkId: 'restored-cleanup-clue-link',
    operationId: 'restored-cleanup-clue-link',
    expectedRevision: 0,
    expectedLinkCollectionRevision: 0,
    itemId,
    expectedItemRevision: 1,
  });
}

async function rich(revoked = false) {
  const f = await portableFixture((x) => [wire(known(x.target)), unresolved()]);
  await f.save(
    'cleanup-guide-legacy-body',
    0,
    entity({
      name: 'Guia adaptado',
      details: 'Guia '.repeat(14000),
    }),
    f.target,
  );
  await f.adopt();
  await f.save(
    'cleanup-portable-generation-body',
    f.overlay().revision,
    entity({
      details: '🐉á'.repeat(20000),
      relations: [known(f.target)],
    }),
  );
  await f.removeReferences();
  await f.adopt();
  assert.equal((await f.read()).item.legacy, true);
  assert.equal(f.overlay().bodyBinding.layout, 'generation');
  const guide = f.records.get(f.overlayPath() + f.target);
  assert.equal(guide.bodyBinding.layout, 'legacy');
  let pending = (await startComparison(f, 'restored-cleanup-partial')).result.progress;
  for (let n = 0; pending.phase !== 'images' && n < 150; n++)
    pending = (
      await f.api.advanceCampaignComparison(uid, {
        comparisonId: pending.comparisonId,
        operationId: 'restored-cleanup-partial-' + n,
        expectedCheckpoint: pending.checkpoint,
      })
    ).progress;
  assert.equal(pending.phase, 'images');
  await ownMaterial(f);
  const other = 'restored-cleanup-other-001',
    base = digest('restored-cleanup-other-base'),
    foreign = 'users/' + uid + '/campaignBases/' + base;
  await f.studio.createCampaign(uid, { operationId: other, title: 'Outra mesa' });
  f.records.set(foreign, {
    schemaVersion: 1,
    ownerId: uid,
    campaignId: other,
    id: base,
    state: 'ready',
  });
  f.records.set(foreign + '/bodies/kept', { content: 'Texto da outra mesa' });
  const useKey = baseImageUseKey(base, f.imageId),
    imageKey = baseImageKey(f.imageId),
    library = 'users/' + uid + '/imageLibrary/' + f.imageId;
  f.records.set(foreign + '/images/' + imageKey, {
    imageKey,
    imageId: f.imageId,
    state: 'ready',
    useKey,
  });
  f.records.set(library + '/uses/' + useKey, {
    kind: 'campaign-base',
    campaignId: other,
    baseId: base,
  });
  const image = f.records.get(library);
  image.useCount++;
  f.records.set('users/other/campaignBases/preserved', {
    ownerId: 'other',
    campaignId: f.id,
    proof: 'Other owner',
  });
  if (revoked) {
    f.records.get('adventures/' + adventureId).deleting = true;
    f.records.delete('universes/world/lore/hero');
  }
  f.originals = structuredClone(
    [...f.records].filter(([p]) => p.startsWith('adventures/' + adventureId)),
  );
  f.preserved = structuredClone(
    [...f.records].filter(
      ([p]) =>
        p === 'campaigns/' + other ||
        p.startsWith(foreign) ||
        p.startsWith('users/other/') ||
        p === library + '/uses/' + useKey,
    ),
  );
  f.library = library;
  f.privateBases = ownRoots(f);
  assert.ok(f.privateBases.length >= 4);
  return f;
}

function noPayloadReads(f) {
  const forbidden = [
    'content',
    'body',
    'summary',
    'details',
    'sourceEvidence',
    'structured',
    'name',
    'title',
    'key',
    'sealed',
  ];
  assert.ok(
    !f.metadataReads.some((r) => r.fields.some((s) => forbidden.includes(s))),
    'metadata never requests prose or source proof',
  );
  assert.ok(
    f.reads.every((r) => !r.path?.includes('/loreVariantBodies/')),
    'no full body document read',
  );
}
function assertCollected(f) {
  assert.ok(!f.records.has(f.path));
  assert.ok(![...f.records.keys()].some((p) => p.startsWith(f.path + '/')));
  for (const root of f.privateBases)
    assert.ok(![...f.records.keys()].some((p) => p === root || p.startsWith(root + '/')));
  for (const [p, v] of f.preserved) assert.deepEqual(f.records.get(p), v);
  for (const [p, v] of f.originals) assert.deepEqual(f.records.get(p), v);
  assert.equal(
    f.records.get(f.library).useCount,
    2,
    'adventure and another campaign keep their pins',
  );
  assert.equal([...f.records.keys()].filter((p) => p.startsWith(f.library + '/uses/')).length, 2);
  const tombstones = [...f.records.values()].filter(
    (v) => v.campaignId === f.id && v.state === 'deleted-campaign',
  );
  assert.ok(tombstones.length > 0);
  assert.doesNotMatch(
    JSON.stringify(tombstones),
    /portable-relations-v1|sourceEvidence|portableRelations|relatedSourceKeys|Texto privado|Texto da pista/,
  );
}

for (const revoked of [false, true])
  test(
    'C4 collects rich restored campaign with ' +
      (revoked ? 'revoked' : 'authorized') +
      ' origins, both borrowed body layouts and shared pins without prose',
    async () => {
      const f = await rich(revoked),
        measured = measuredDb(f.db),
        d = await startDeletion(measured.db, f.id, 'restored-cleanup-' + revoked);
      assert.equal(await f.studio.getCampaign(uid, { id: f.id }), null);
      await assert.rejects(f.read(), (e) => e.details?.reason === 'campaign-deleting');
      await assert.rejects(
        f.notes.listCampaignNotes(uid, { campaignId: f.id }),
        (e) => e.details?.reason === 'campaign-deleting',
      );
      await assert.rejects(f.write(), (e) => e.details?.reason === 'campaign-deleting');
      f.metadataReads.length = 0;
      f.reads.length = 0;
      const before = measured.measurements.length;
      await finishDeletion(
        d.service,
        d.result.progress,
        'restored-cleanup-step-' + revoked,
        async (input, result) => {
          const checkpoint = result.progress.checkpoint,
            replay = await d.service.advanceCampaignDeletion(uid, input);
          assert.equal(replay.receipt.confirmedCheckpoint, checkpoint);
          assert.deepEqual(replay.progress, result.progress);
        },
      );
      noPayloadReads(f);
      for (const m of measured.measurements.slice(before))
        assert.ok(
          m.reads <= 384 &&
            m.writes <= 64 &&
            m.readBytes <= 4 * 1024 ** 2 &&
            m.writeBytes <= 2 * 1024 ** 2,
        );
      assertCollected(f);
      const p = (await d.service.getCampaignDeletion(uid, { campaignId: f.id })).deletion;
      assert.equal(p.complete, true);
      await assert.rejects(
        f.studio.createCampaign(uid, { operationId: f.id, title: 'Reuso' }),
        (e) => e.details?.reason === 'campaign-deleted',
      );
    },
  );

test('restored cleanup resumes by reservation after the root disappears and still erases every owned base/generation', async () => {
  const f = await rich(true),
    d = await startDeletion(f.db, f.id, 'restored-cleanup-no-root');
  f.records.delete(f.path);
  f.metadataReads.length = 0;
  f.reads.length = 0;
  await finishDeletion(d.service, d.result.progress, 'restored-cleanup-no-root-step');
  noPayloadReads(f);
  assertCollected(f);
});

test('private source evidence and portable relation payloads are not parsed to authorize deletion of the owned copy', async () => {
  const f = await rich();
  const restored = f.records.get(f.basePath);
  restored.sourceMode = 'INVALID-READ-MODE';
  restored.sourceEvidence = { content: 'NEVER READ THIS PROOF' };
  f.records.get(f.basePath + '/items/' + heroKey).sourceEvidence = null;
  f.overlay().bodyCodec = 'future-invalid-codec';
  const d = await startDeletion(f.db, f.id, 'restored-cleanup-bad-proofs');
  f.metadataReads.length = 0;
  f.reads.length = 0;
  await finishDeletion(d.service, d.result.progress, 'restored-cleanup-bad-proofs-step');
  noPayloadReads(f);
  assertCollected(f);
});

test('wrong base ownership interrupts a restored cleanup without advancing checkpoint or deleting data', async () => {
  const f = await rich(),
    d = await startDeletion(f.db, f.id, 'restored-cleanup-owner');
  let p = d.result.progress;
  for (let n = 0; p.phase !== 'bases' && n < 150; n++)
    p = (
      await d.service.advanceCampaignDeletion(uid, {
        deletionId: p.deletionId,
        operationId: 'restored-cleanup-owner-before-' + n,
        expectedCheckpoint: p.checkpoint,
      })
    ).progress;
  assert.equal(p.phase, 'bases');
  const root = ownRoots(f).sort()[0],
    owner = f.records.get(root).ownerId;
  f.records.get(root).ownerId = 'other';
  const before = structuredClone([...f.records]),
    input = {
      deletionId: p.deletionId,
      operationId: 'restored-cleanup-owner-fail',
      expectedCheckpoint: p.checkpoint,
    };
  await assert.rejects(d.service.advanceCampaignDeletion(uid, input), {
    code: 'failed-precondition',
  });
  assert.deepEqual([...f.records], before);
  f.records.get(root).ownerId = owner;
  p = (await d.service.advanceCampaignDeletion(uid, input)).progress;
  await finishDeletion(d.service, p, 'restored-cleanup-owner-after');
  assertCollected(f);
});

test('a restored image use attributed to another campaign is never decremented or removed by a failed step', async () => {
  const f = await rich(),
    d = await startDeletion(f.db, f.id, 'restored-cleanup-pin');
  const changed = [];
  for (const root of f.privateBases)
    for (const [p, v] of f.records)
      if (p.startsWith(root + '/images/') && v.state === 'ready') {
        const use = f.records.get(f.library + '/uses/' + v.useKey);
        changed.push(use);
        use.campaignId = 'different-campaign';
      }
  let progress = d.result.progress,
    failed = false;
  for (let n = 0; !failed && n < 150; n++) {
    const before = structuredClone([...f.records]),
      count = f.records.get(f.library).useCount;
    try {
      progress = (
        await d.service.advanceCampaignDeletion(uid, {
          deletionId: progress.deletionId,
          operationId: 'restored-cleanup-pin-' + n,
          expectedCheckpoint: progress.checkpoint,
        })
      ).progress;
    } catch (e) {
      assert.equal(e.code, 'failed-precondition');
      assert.deepEqual([...f.records], before);
      assert.equal(f.records.get(f.library).useCount, count);
      failed = true;
    }
  }
  assert.equal(failed, true);
  for (const use of changed) use.campaignId = f.id;
  await finishDeletion(d.service, progress, 'restored-cleanup-pin-after');
  assertCollected(f);
});

for (const version of [undefined, 1, 2, 3, 4])
  test(
    'C4 ' +
      (version === undefined ? 'implicit v1' : 'v' + version) +
      ' keeps its historical inventory while collecting restored fields',
    async () => {
      const f = await portableFixture(),
        value = version ?? 1;
      const roots = [
        'notes',
        'noteState',
        'workChecklist',
        'workProgress',
        'loreVariants',
        'loreVariantBodies',
        'loreVariantState',
        ...(value >= 2 ? ['sessions', 'sessionState'] : []),
        ...(value >= 3 ? ['sessionReferences', 'sessionReferenceState'] : []),
        ...(value >= 4
          ? [
              'preparationItems',
              'preparationBodies',
              'preparationState',
              'sessionPreparationLinks',
              'sessionPreparationState',
            ]
          : []),
      ];
      for (const name of roots)
        if (!['loreVariants', 'loreVariantBodies', 'loreVariantState'].includes(name))
          f.records.set(f.path + '/' + name + '/extra', { content: 'PRIVATE-RESTORED-PAYLOAD' });
      const d = await startDeletion(f.db, f.id, 'restored-cleanup-version-' + value),
        path = 'users/' + uid + '/campaignDeletions/' + d.result.progress.deletionId,
        job = f.records.get(path);
      if (version === undefined) delete job.cleanupVersion;
      else job.cleanupVersion = version;
      const versionBefore = job.cleanupVersion;
      f.metadataReads.length = 0;
      f.reads.length = 0;
      await finishDeletion(
        d.service,
        d.result.progress,
        'restored-cleanup-version-step-' + value,
        async (_, r) => {
          if (!r.progress.complete) assert.equal(f.records.get(path).cleanupVersion, versionBefore);
        },
      );
      noPayloadReads(f);
      assert.ok(![...f.records.keys()].some((p) => p.startsWith(f.path + '/')));
      assert.ok(![...f.records.keys()].some((p) => p.startsWith(f.basePath)));
      assert.equal(
        f.records.get(f.library ?? 'users/' + uid + '/imageLibrary/' + f.imageId).useCount,
        1,
      );
      assert.equal('cleanupVersion' in f.records.get(path), false);
    },
  );
