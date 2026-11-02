import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createStudioService } from '../src/studio.mjs';
import { createCampaignNotesService } from '../src/campaignNotes.mjs';
import { createCampaignDeletionService } from '../src/campaignDeletion.mjs';
import { digest } from '../src/workProgressContracts.mjs';
import {
  adoptedDeletionFixture,
  startDeletion,
  finishDeletion,
} from './helpers/campaignDeletion.mjs';
import { measuredDb } from './helpers/campaignAdoption.mjs';
import { createCampaignCaptureService } from '../src/campaignCapture.mjs';
import { baseImageUseKey, digest as baseDigest } from '../src/campaignBaseContracts.mjs';
import { createCampaignBaseReadService } from '../src/campaignBaseRead.mjs';
import {
  comparisonFixture,
  startComparison,
  finishComparison,
} from './helpers/campaignComparison.mjs';
import { createCampaignsService } from '../src/campaigns.mjs';

const uid = 'author',
  campaignId = 'campaign-deletion-independent',
  op = (name) => 'campaign-deletion-operation-' + name;
async function fixture() {
  const f = studioDb();
  const studio = createStudioService({ db: f.db, now: () => 100 }),
    service = createCampaignDeletionService({ db: f.db, now: () => 200 }),
    notes = createCampaignNotesService({ db: f.db, now: () => 120 });
  await studio.createCampaign(uid, {
    operationId: campaignId,
    title: 'Mesa privada',
    description: 'Prosa da mesa',
  });
  return { ...f, studio, service, notes };
}
async function begin(f, name = 'start') {
  const source = await f.service.getCampaignDeletionSource(uid, { campaignId });
  const input = {
    campaignId,
    campaignToken: source.campaignToken,
    expectedRevision: source.revision,
    operationId: op(name),
  };
  return { input, value: await f.service.startCampaignDeletion(uid, input) };
}
async function finish(f, initial) {
  let p = initial;
  for (let index = 0; !p.complete && index < 300; index++) {
    p = (
      await f.service.advanceCampaignDeletion(uid, {
        deletionId: p.deletionId,
        operationId: op('advance-' + index),
        expectedCheckpoint: p.checkpoint,
      })
    ).progress;
  }
  assert.equal(p.complete, true);
  return p;
}
test('independent deletion revokes before bounded cleanup and preserves other notes and opaque receipts', async () => {
  const f = await fixture(),
    initial = await f.notes.listCampaignNotes(uid, { campaignId });
  for (let i = 0; i < 27; i++) {
    const id = op('note-' + i);
    await f.notes.saveCampaignNote(uid, {
      campaignId,
      campaignToken: initial.campaignToken,
      noteId: id,
      operationId: id,
      expectedRevision: 0,
      title: 'Nota ' + i,
      content: 'Segredo 🐉\n',
    });
    f.records.set(`campaigns/${campaignId}/workChecklist/${i}`, { title: 'Preparar segredo' });
  }
  f.records.set(`users/${uid}/workActivity/${digest({ kind: 'campaign', id: campaignId })}`, {
    target: { kind: 'campaign', id: campaignId },
    resource: { kind: 'project' },
    accessedAt: 90,
  });
  f.records.set(`users/${uid}/workActivityState/current`, { revision: 5, accessedAt: 90 });
  f.records.set('campaigns/other/notes/note', { content: 'Preservado' });
  const { input, value } = await begin(f);
  assert.deepEqual(await f.service.startCampaignDeletion(uid, input), value);
  assert.equal(await f.studio.getCampaign(uid, { id: campaignId }), null);
  assert.deepEqual((await f.studio.listStudioProjects(uid, { kind: 'campaign' })).items, []);
  await assert.rejects(f.notes.listCampaignNotes(uid, { campaignId }), {
    details: { reason: 'campaign-deleting', campaignId, deletionId: input.operationId },
  });
  const complete = await finish(f, value.progress);
  assert.equal(f.records.has('campaigns/' + campaignId), false);
  assert.equal(
    [...f.records.keys()].some((key) => key.startsWith(`campaigns/${campaignId}/`)),
    false,
  );
  assert.equal(f.records.get('campaigns/other/notes/note').content, 'Preservado');
  assert.equal(f.records.get(`users/${uid}/workActivityState/current`).revision, 6);
  assert.equal(JSON.stringify([...f.records.values()]).includes('Segredo'), false);
  assert.equal(
    (await f.service.getCampaignDeletion(uid, { campaignId })).deletion.state,
    'deleted',
  );
  assert.equal(complete.checkpoint > 1, true);
  await assert.rejects(
    f.studio.createCampaign(uid, { operationId: campaignId, title: 'Recriação' }),
    { code: 'failed-precondition' },
  );
});
test('unknown deletion start is fenced without root and competing starts cannot replace the winning job', async () => {
  const f = await fixture(),
    source = await f.service.getCampaignDeletionSource(uid, { campaignId }),
    input = {
      campaignId,
      campaignToken: source.campaignToken,
      expectedRevision: source.revision,
      operationId: op('never'),
    };
  const result = await f.service.resolveCampaignDeletionStart(uid, { ...input, intent: 'cancel' });
  assert.equal(result.kind, 'canceled');
  assert.deepEqual(await f.service.startCampaignDeletion(uid, input), result);
  const started = await begin(f, 'winner');
  await assert.rejects(
    f.service.startCampaignDeletion(uid, { ...input, operationId: op('loser') }),
    { code: 'failed-precondition' },
  );
  const canceled = await f.service.resolveCampaignDeletionStart(uid, {
    ...input,
    operationId: op('loser'),
    intent: 'cancel',
  });
  assert.equal(canceled.kind, 'canceled');
  assert.equal(
    (await f.service.getCampaignDeletion(uid, { campaignId })).deletion.deletionId,
    started.value.progress.deletionId,
  );
});
test('deletion stale checkpoint, wrong actor, changed incarnation and payload reuse never destroy data', async () => {
  const f = await fixture(),
    { input, value } = await begin(f),
    step = { deletionId: input.operationId, operationId: op('step'), expectedCheckpoint: 0 },
    next = await f.service.advanceCampaignDeletion(uid, step);
  assert.deepEqual(await f.service.advanceCampaignDeletion(uid, step), next);
  await assert.rejects(
    f.service.advanceCampaignDeletion(uid, { ...step, operationId: op('stale') }),
    { details: { reason: 'checkpoint-conflict' } },
  );
  assert.equal((await f.service.getCampaignDeletion('other', { campaignId })).deletion, null);
  await assert.rejects(f.service.advanceCampaignDeletion('other', step), { code: 'not-found' });
  await assert.rejects(f.service.startCampaignDeletion(uid, { ...input, expectedRevision: 9 }), {
    code: 'invalid-argument',
  });
  f.records.delete('campaigns/' + campaignId);
  await f.db.runTransaction(async (tx) =>
    tx.create(f.db.doc('campaigns/' + campaignId), {
      ownerId: uid,
      schemaVersion: 1,
      deleting: true,
      deletionId: input.operationId,
      secret: 'Preservar',
    }),
  );
  await assert.rejects(
    f.service.advanceCampaignDeletion(uid, {
      ...step,
      expectedCheckpoint: next.progress.checkpoint,
      operationId: op('changed'),
    }),
    { details: { reason: 'campaign-changed' } },
  );
  assert.equal(f.records.get('campaigns/' + campaignId).secret, 'Preservar');
  assert.equal(value.progress.checkpoint, 0);
});
test('captured deletion erases borrowed bodies and every generation while sanitizing keys, related descriptors and pending controls without reading prose', async () => {
  const data = studioDb(),
    measured = measuredDb(data.db),
    f = await adoptedDeletionFixture(measured.db),
    campaign = f.campaign.id,
    original = structuredClone(data.records.get('adventures/comparison-adventure-001')),
    clock = structuredClone(data.records.get('users/author/campaignAuthorization/current')),
    library = data.records.get('users/author/imageLibrary/' + f.imageId);
  assert.equal(library.useCount, 4);
  // A deletion must work even after both origin and lore authorization disappear.
  data.records.delete('universes/world/lore/hero');
  data.metadataReads.length = 0;
  data.reads.length = 0;
  const before = measured.measurements.length,
    d = await startDeletion(measured.db, campaign);
  assert.equal((await f.api.listCampaignComparisons(uid, {})).items.length, 0);
  assert.equal((await f.adoptions.listCampaignAdoptions(uid, {})).items.length, 0);
  await assert.rejects(
    f.recovery.resolveCampaignLoreOperation(uid, { ...f.header, action: 'save', intent: 'cancel' }),
    { code: 'failed-precondition' },
  );
  await finishDeletion(d.service, d.result.progress);
  assert.equal(
    [...data.records.keys()].some((p) => p.startsWith('campaigns/' + campaign)),
    false,
  );
  assert.equal(
    [...data.records.keys()].some((p) => p.startsWith('users/author/campaignBases/')),
    false,
  );
  assert.equal(data.records.get('users/author/imageLibrary/' + f.imageId).useCount, 1);
  assert.deepEqual(data.records.get('adventures/comparison-adventure-001'), original);
  assert.deepEqual(data.records.get('users/author/campaignAuthorization/current'), clock);
  const values = [...data.records].filter(([p]) =>
    /campaign(Variant|Preparation|Comparison|Adoption)/.test(p),
  );
  for (const [, value] of values) {
    assert.equal(Object.hasOwn(value, 'key'), false);
    assert.equal(Object.hasOwn(value, 'relatedSourceKeys'), false);
    assert.equal(Object.hasOwn(value, 'request'), false);
    assert.equal(Object.hasOwn(value, 'sourceToken'), false);
    assert.equal(Object.hasOwn(value, 'title'), false);
    assert.equal(Object.hasOwn(value, 'description'), false);
    assert.equal(Object.hasOwn(value, 'result'), false);
  }
  assert.equal(
    data.reads
      .filter((r) => /\/(bodies|loreVariantBodies|notes|workChecklist)$/.test(r.collectionPath))
      .every((r) => Array.isArray(r.fields) && !r.fields.length),
    true,
  );
  assert.equal(
    data.metadataReads.some((r) => r.fields.includes('content')),
    false,
  );
  for (const m of measured.measurements.slice(before)) {
    assert.ok(
      m.reads <= 384 &&
        m.writes <= 64 &&
        m.readBytes <= 4 * 1024 ** 2 &&
        m.writeBytes <= 2 * 1024 ** 2,
    );
  }
});
test('one pin per transaction preserves shared images; pending unexpected uses and corrupt ready counts never advance the checkpoint', async () => {
  const f = await fixture(),
    imageId = 'image-shared',
    first = baseDigest({ first: true }),
    second = baseDigest({ second: true }),
    imageKey = baseDigest({ imageId });
  f.records.set('users/author/imageLibrary/' + imageId, {
    useCount: 4,
    state: 'active',
    path: 'book-covers/author/shared.webp',
  });
  for (const baseId of [first, second]) {
    f.records.set('users/author/campaignBases/' + baseId, {
      id: baseId,
      schemaVersion: 1,
      ownerId: uid,
      campaignId,
    });
    f.records.set(`users/author/campaignBases/${baseId}/images/${imageKey}`, {
      imageKey,
      imageId,
      state: 'ready',
      useKey: baseImageUseKey(baseId, imageId),
    });
    f.records.set(`users/author/imageLibrary/${imageId}/uses/${baseImageUseKey(baseId, imageId)}`, {
      kind: 'campaign-base',
      campaignId,
      baseId,
    });
  }
  f.records.set(`users/author/imageLibrary/${imageId}/uses/other`, {
    kind: 'campaign-base',
    campaignId: 'other',
    baseId: 'other',
  });
  let p = (await begin(f)).value.progress;
  while (p.phase !== 'bases')
    p = (
      await f.service.advanceCampaignDeletion(uid, {
        deletionId: p.deletionId,
        expectedCheckpoint: p.checkpoint,
        operationId: op('pre-pin-' + p.checkpoint),
      })
    ).progress;
  f.records.get('users/author/imageLibrary/' + imageId).useCount = 0;
  const input = {
    deletionId: p.deletionId,
    expectedCheckpoint: p.checkpoint,
    operationId: op('bad-count'),
  };
  await assert.rejects(f.service.advanceCampaignDeletion(uid, input), {
    code: 'failed-precondition',
  });
  assert.equal(
    (await f.service.getCampaignDeletion(uid, { campaignId })).deletion.checkpoint,
    p.checkpoint,
  );
  f.records.get('users/author/imageLibrary/' + imageId).useCount = 4;
  const success = await f.service.advanceCampaignDeletion(uid, input);
  assert.equal(f.records.get('users/author/imageLibrary/' + imageId).useCount, 3);
  assert.deepEqual(await f.service.advanceCampaignDeletion(uid, input), success);
  await finish(f, success.progress);
  assert.equal(f.records.get('users/author/imageLibrary/' + imageId).useCount, 2);
  assert.equal(f.records.has(`users/author/imageLibrary/${imageId}/uses/other`), true);
  const x = await fixture(),
    baseId = baseDigest({ pending: true });
  x.records.set('users/author/campaignBases/' + baseId, {
    id: baseId,
    schemaVersion: 1,
    ownerId: uid,
    campaignId,
  });
  x.records.set(`users/author/campaignBases/${baseId}/images/${imageKey}`, {
    imageKey,
    imageId,
    state: 'pending',
  });
  x.records.set(`users/author/imageLibrary/${imageId}/uses/${baseImageUseKey(baseId, imageId)}`, {
    kind: 'campaign-base',
    campaignId,
    baseId,
  });
  let q = (await begin(x)).value.progress;
  while (q.phase !== 'bases')
    q = (
      await x.service.advanceCampaignDeletion(uid, {
        deletionId: q.deletionId,
        expectedCheckpoint: q.checkpoint,
        operationId: op('pre-pending-' + q.checkpoint),
      })
    ).progress;
  await assert.rejects(
    x.service.advanceCampaignDeletion(uid, {
      deletionId: q.deletionId,
      expectedCheckpoint: q.checkpoint,
      operationId: op('unexpected-use'),
    }),
    { code: 'failed-precondition' },
  );
});
test('permanent lookup resolves capture-only starts without deriving identities in clients and never exposes another owners reservation', async () => {
  const f = await fixture(),
    captureId = op('unknown-capture'),
    derived = digest({ uid, captureId, kind: 'campaign' });
  await f.studio.createCampaign(uid, { operationId: derived, title: 'Mesmo ID reservado' });
  const d = await startDeletion(f.db, derived, 'derived-delete');
  const proof = await d.service.getCampaignDeletion(uid, { captureId });
  assert.deepEqual(proof.lookup, { captureId });
  assert.equal(proof.deletion.campaignId, derived);
  assert.equal(
    (await d.service.getCampaignDeletion('other', { campaignId: derived })).deletion,
    null,
  );
  await assert.rejects(d.service.getCampaignDeletion(uid, { campaignId: derived, captureId }), {
    code: 'invalid-argument',
  });
  const capture = createCampaignCaptureService({ db: f.db, assets: {} });
  await assert.rejects(
    capture.startCampaignCapture(uid, {
      operationId: captureId,
      adventureId: 'gone',
      expectedSourceToken: 'a'.repeat(64),
      title: 'Não recriar',
      description: '',
      universeId: null,
    }),
    { code: 'failed-precondition' },
  );
});
test('corrupt internal cursors or certificates cannot skip cleanup or advance its checkpoint', async () => {
  const f = await fixture(),
    d = await begin(f),
    path = `users/${uid}/campaignDeletions/${d.input.operationId}`,
    original = structuredClone(f.records.get(path));
  f.records.set(`campaigns/${campaignId}/notes/secret`, { content: 'Não apagar por pulo' });
  for (const change of [
    { part: 999 },
    { childPart: 999 },
    { certified: ['recovery'] },
    { cursor: 'bad/path' },
    { futureField: true },
  ]) {
    f.records.set(path, { ...original, ...change });
    await assert.rejects(
      f.service.advanceCampaignDeletion(uid, {
        deletionId: d.input.operationId,
        operationId: op('corrupt'),
        expectedCheckpoint: 0,
      }),
      { code: 'failed-precondition' },
    );
    assert.equal(f.records.get(path).checkpoint, 0);
    assert.equal(
      f.records.get(`campaigns/${campaignId}/notes/secret`).content,
      'Não apagar por pulo',
    );
  }
  f.records.set(path, original);
  await finish(f, d.value.progress);
});
test('campaign and capture-only deletion lookups reject a same-owner job whose reserved identity was redirected', async () => {
  const f = await fixture(),
    captureId = op('redirected-capture'),
    derived = digest({ uid, captureId, kind: 'campaign' });
  await f.studio.createCampaign(uid, { operationId: derived, title: 'Reserva da captura' });
  const d = await startDeletion(f.db, derived, 'redirected-delete'),
    path = `users/${uid}/campaignDeletions/${d.result.progress.deletionId}`,
    original = structuredClone(f.records.get(path));
  for (const change of [{ campaignId }, { campaignToken: 'a'.repeat(64) }]) {
    f.records.set(path, { ...original, ...change });
    for (const lookup of [{ campaignId: derived }, { captureId }])
      await assert.rejects(d.service.getCampaignDeletion(uid, lookup), {
        code: 'failed-precondition',
      });
    assert.equal(f.records.get(path).checkpoint, 0);
  }
  f.records.set(path, original);
  assert.equal(
    (await d.service.getCampaignDeletion(uid, { captureId })).deletion.campaignId,
    derived,
  );
});
test('reserved last-scanned snapshots retain prototype getter identities for a truthful empty window and next page', async () => {
  const f = await fixture();
  await f.studio.createCampaign(uid, { operationId: op('other-table'), title: 'Outra mesa' });
  await begin(f);
  const db = {
    ...f.db,
    runTransaction: (fn) =>
      f.db.runTransaction((tx) =>
        fn({
          ...tx,
          get: async (ref) => {
            const result = await tx.get(ref);
            if (!result.docs) return result;
            return {
              docs: result.docs.map((snapshot) =>
                Object.create({
                  get id() {
                    return snapshot.id;
                  },
                  get ref() {
                    return snapshot.ref;
                  },
                  data: () => snapshot.data(),
                }),
              ),
            };
          },
        }),
      ),
  };
  const studio = createStudioService({ db }),
    first = await studio.listStudioProjects(uid, { kind: 'campaign', limit: 1 });
  assert.deepEqual(first.items, []);
  assert.equal(JSON.parse(Buffer.from(first.nextCursor, 'base64url').toString()).id, campaignId);
  const second = await studio.listStudioProjects(uid, {
    kind: 'campaign',
    limit: 1,
    cursor: first.nextCursor,
  });
  assert.equal(second.items[0].id, op('other-table'));
});
test('closed deletion inputs, frozen source CAS and bounded scoped metadata pages never expose internal cleanup state', async () => {
  const f = await fixture(),
    source = await f.service.getCampaignDeletionSource(uid, { campaignId });
  await createCampaignsService({ db: f.db, now: () => 150 }).updateCampaign(uid, {
    campaignId,
    operationId: op('edit-before-delete'),
    expectedRevision: 1,
    patch: { title: 'Título novo' },
  });
  const input = {
    campaignId,
    campaignToken: source.campaignToken,
    expectedRevision: source.revision,
    operationId: op('frozen'),
  };
  await assert.rejects(f.service.startCampaignDeletion(uid, input), {
    details: { reason: 'revision-conflict' },
  });
  assert.equal(f.records.has('campaignDeletionReservations/' + campaignId), false);
  await assert.rejects(f.service.startCampaignDeletion(uid, { ...input, extra: true }), {
    code: 'invalid-argument',
  });
  await assert.rejects(f.service.getCampaignDeletionSource('', { campaignId }), {
    code: 'unauthenticated',
  });
  for (let n = 0; n < 26; n++) {
    const cid = op('page-campaign-' + n);
    await f.studio.createCampaign(uid, { operationId: cid, title: 'Mesa ' + n });
    const v = await f.service.getCampaignDeletionSource(uid, { campaignId: cid });
    await f.service.startCampaignDeletion(uid, {
      campaignId: cid,
      campaignToken: v.campaignToken,
      expectedRevision: v.revision,
      operationId: op('page-deletion-' + n),
    });
  }
  f.reads.length = 0;
  const page = await f.service.listCampaignDeletions(uid, { limit: 25 });
  assert.equal(page.items.length, 25);
  assert.ok(page.nextCursor);
  assert.equal(Object.hasOwn(page.items[0], 'certified'), false);
  assert.equal(Object.hasOwn(page.items[0], 'cursor'), false);
  assert.equal(Object.hasOwn(page.items[0], 'title'), false);
  assert.equal(f.reads.at(-1).maximum, 26);
  assert.equal(
    (await f.service.listCampaignDeletions(uid, { cursor: page.nextCursor })).items.length,
    1,
  );
  await assert.rejects(f.service.listCampaignDeletions('other', { cursor: page.nextCursor }), {
    code: 'failed-precondition',
    details: { reason: 'cursor-invalidated' },
  });
  await assert.rejects(f.service.listCampaignDeletions(uid, { limit: 51 }), {
    code: 'invalid-argument',
  });
  const item = page.items[0],
    path = `users/${uid}/campaignDeletionOperations/${item.deletionId}`,
    receipt = structuredClone(f.records.get(path));
  f.records.get(path).receipt.confirmedCheckpoint = 9;
  await assert.rejects(
    f.service.startCampaignDeletion(uid, {
      campaignId: item.campaignId,
      campaignToken: item.campaignToken,
      expectedRevision: 1,
      operationId: item.deletionId,
    }),
    { code: 'failed-precondition' },
  );
  f.records.set(path, receipt);
});
test('base and candidate image readers with real gates refuse every byte when deletion starts during storage I/O', async () => {
  for (const mode of ['base', 'comparison']) {
    const data = studioDb(),
      f = await comparisonFixture(data.db),
      candidate = await finishComparison(f, (await startComparison(f)).result),
      reader = createCampaignBaseReadService({
        db: data.db,
        assets: f.assets,
        deriveImage: async (bytes) => bytes,
      });
    let deleted = false,
      io = 0;
    f.assets.readGeneration = async () => {
      io++;
      await startDeletion(data.db, f.campaign.id);
      deleted = true;
      return Buffer.from('webp');
    };
    await assert.rejects(
      mode === 'base'
        ? reader.readCampaignBaseImage(uid, {
            campaignId: f.campaign.id,
            imageKey: baseDigest({ imageId: f.imageId }),
          })
        : f.reader.readCampaignComparisonImage(uid, {
            comparisonId: candidate.comparisonId,
            side: 'candidate',
            imageKey: baseDigest({ imageId: f.imageId }),
          }),
      (error) => error.details?.reason === 'campaign-deleting',
    );
    assert.equal(io, 1);
    assert.equal(deleted, true);
  }
});
