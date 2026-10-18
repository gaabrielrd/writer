import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, collection, getDocs, query, limit } from 'firebase/firestore';
import {
  comparisonFixture,
  startComparison,
  finishComparison,
  comparisonRows,
  uid,
  adventureId,
  target,
  op,
} from '../../functions/test/helpers/campaignComparison.mjs';
import { createCampaignComparisonReadService } from '../../functions/src/campaignComparisonRead.mjs';
import {
  basePath,
  baseSourceKey,
  baseTextFields,
  baseBodyKey,
  digest,
} from '../../functions/src/campaignBaseContracts.mjs';
import { comparisonPath } from '../../functions/src/campaignComparisonContracts.mjs';

const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const { Firestore } = requireFunctions('firebase-admin/firestore');
const projectId = 'demo-writer-campaign-comparison-tests';
let environment, admin, f;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!address) throw new Error('Use somente o emulador demo.');
  const [host, port] = address.split(':');
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
});
beforeEach(async () => {
  await environment.clearFirestore();
  f = await comparisonFixture(admin);
});
after(async () => {
  await admin?.terminate();
  await environment?.cleanup();
});
const client = (user) =>
  user
    ? environment.authenticatedContext(user).firestore()
    : environment.unauthenticatedContext().firestore();

test('SDK real writers capture seven families, root, references and images without adopting; exact order survives rank rebalance and body sides stay frozen', async () => {
  const campaignBefore = (await admin.doc('campaigns/' + f.campaign.id).get()).data();
  await admin
    .doc('adventures/' + adventureId + '/parts/' + f.part.id)
    .update({ content: '<p>Legado 🐉</p>' });
  await admin.doc('adventures/' + adventureId).update({ synopsis: 'Nova sinopse' });
  for (const resource of [
    { kind: 'arc' },
    { kind: 'milestone', arcId: f.arc.item.id },
    { kind: 'event' },
  ]) {
    let complete = false;
    for (let n = 0; n < 10 && !complete; n++)
      complete = (
        await f.narrative.rebalanceNarrativeRanks(uid, {
          target,
          resource,
          operationId: op('rebalance-' + resource.kind),
          limit: 1,
        })
      ).complete;
    assert.equal(complete, true);
  }
  const { result } = await startComparison(f),
    p = await finishComparison(f, result);
  assert.deepEqual((await admin.doc('campaigns/' + f.campaign.id).get()).data(), campaignBefore);
  assert.equal((await admin.collection('campaigns').limit(5).get()).size, 1);
  const items = await comparisonRows(f, p, 'items');
  assert.equal(new Set(items.map((row) => row.candidateSummary.kind)).size, 7);
  assert.equal(
    items
      .filter((row) => row.candidateSummary.kind === 'arc')
      .every((row) => row.change === 'unchanged'),
    true,
  );
  assert.equal((await comparisonRows(f, p, 'source'))[0].change, 'changed');
  assert.equal((await comparisonRows(f, p, 'references')).length, 2);
  const images = await comparisonRows(f, p, 'images');
  assert.equal(images[0].candidateSummary.preview, 'unchecked');
  const partKey = baseSourceKey({ adventureId, kind: 'part', id: f.part.id });
  const body = await f.reader.readCampaignComparisonItem(uid, {
    comparisonId: p.comparisonId,
    sourceKey: partKey,
    side: 'candidate',
  });
  assert.equal(body.chunks[0].field, 'legacyContent');
  assert.equal(body.chunks[0].content, '<p>Legado 🐉</p>');
  assert.equal(body.key, partKey);
  assert.equal(body.side, 'candidate');
  const mainKey = baseSourceKey({ adventureId, kind: 'block', id: f.scene.id, role: 'main' });
  const mainRef = admin.doc(basePath(uid, p.candidateBaseId) + '/items/' + mainKey);
  await mainRef.update({ 'image.internalStorageHint': 'PRIVATE-INTERNAL-EXTRA' });
  const mainRow = (await comparisonRows(f, p, 'items', { kind: 'block' })).find(
    (row) => row.key === mainKey,
  );
  assert.equal(mainRow.change, 'unchanged');
  await mainRef.update({ 'image.caption': 'Nova legenda autoral' });
  const capturedImage = (
    await admin.doc(basePath(uid, p.candidateBaseId) + '/images/' + images[0].key).get()
  ).data();
  await admin.doc(`users/${uid}/imageLibrary/${f.imageId}/uses/${capturedImage.useKey}`).delete();
  const captionRow = (await comparisonRows(f, p, 'items', { kind: 'block' })).find(
    (row) => row.key === mainKey,
  );
  assert.equal(captionRow.change, 'changed');
  const detail = await f.reader.readCampaignComparisonItem(uid, {
    comparisonId: p.comparisonId,
    sourceKey: mainKey,
    side: 'candidate',
  });
  assert.deepEqual(detail.item.image, {
    imageKey: images[0].key,
    alt: 'Dragão',
    caption: 'Nova legenda autoral',
  });
  assert.deepEqual(await comparisonRows(f, p, 'images'), []);
  await assert.rejects(
    f.reader.readCampaignComparisonImage(uid, {
      comparisonId: p.comparisonId,
      imageKey: images[0].key,
      side: 'candidate',
    }),
    { code: 'not-found' },
  );
  for (const user of [uid, 'other', null]) {
    const db = client(user),
      root = basePath(uid, p.candidateBaseId);
    for (const path of [
      comparisonPath(uid, p.comparisonId),
      root,
      `users/${uid}/campaignComparisonOperations/${p.comparisonId}`,
    ])
      await assertFails(getDoc(doc(db, path)));
    await assertFails(getDocs(query(collection(db, root + '/items'), limit(25))));
    await assertFails(setDoc(doc(db, root + '/items/forged'), { title: 'Forjado' }));
  }
});

test('SDK checkpoint races and exact receipts; source edits and recreated campaign abort durably, while unseen start fences work without root', async () => {
  const { input, result } = await startComparison(f);
  let p = result.progress;
  const step = {
    comparisonId: p.comparisonId,
    operationId: op('race-a'),
    expectedCheckpoint: p.checkpoint,
  };
  const outcomes = await Promise.allSettled([
    f.api.advanceCampaignComparison(uid, step),
    f.api.advanceCampaignComparison(uid, { ...step, operationId: op('race-b') }),
  ]);
  assert.equal(outcomes.filter((v) => v.status === 'fulfilled').length, 1);
  p = await f.api.getCampaignComparison(uid, { comparisonId: p.comparisonId });
  const before = (await admin.doc('campaigns/' + p.campaignId).get()).data();
  await admin.doc('campaigns/' + p.campaignId).delete();
  await admin.doc('campaigns/' + p.campaignId).create(before);
  const aborted = await f.api.advanceCampaignComparison(uid, {
    comparisonId: p.comparisonId,
    operationId: op('root-recreated'),
    expectedCheckpoint: p.checkpoint,
  });
  assert.equal(aborted.progress.state, 'aborted');
  assert.equal(aborted.progress.reason, 'campaign-changed');
  assert.equal((await admin.doc(basePath(uid, p.candidateBaseId)).get()).data().state, 'aborted');
  const unseen = { ...input, operationId: op('never-received') };
  await admin.doc('campaigns/' + p.campaignId).delete();
  const canceled = await f.api.resolveCampaignComparisonStart(uid, { ...unseen, intent: 'cancel' });
  assert.equal(canceled.kind, 'canceled');
  assert.deepEqual(await f.api.startCampaignComparison(uid, unseen), canceled);
  assert.equal((await admin.doc(comparisonPath(uid, unseen.operationId)).get()).exists, false);
  for (const user of [uid, 'other', null])
    await assertFails(
      getDoc(doc(client(user), `users/${uid}/campaignComparisonStartFences/${unseen.operationId}`)),
    );
});

test('SDK projected hidden targets never affect classification; empty windows progress; variant changes invalidate side cursors and late gate loss prevents bodies', async () => {
  const { result } = await startComparison(f),
    p = await finishComparison(f, result),
    hero = baseSourceKey({ kind: 'lore', scopeId: 'world', id: 'hero' });
  const first = await f.reader.listCampaignComparisonChanges(uid, {
    comparisonId: p.comparisonId,
    group: 'items',
    change: 'added',
    limit: 1,
  });
  assert.equal(first.items.length, 0);
  assert.ok(first.nextCursor);
  const candidate = basePath(uid, p.candidateBaseId);
  await admin.doc(candidate + '/items/' + hero).update({
    'structured.relations': [
      {
        targetEntityId: 'universe:world:hidden',
        relationType: 'SEGREDO',
        description: 'NÃO EXPOR',
      },
    ],
  });
  const lore = await comparisonRows(f, p, 'items', { kind: 'lore' });
  assert.equal(lore[0].change, 'unchanged');
  assert.equal(JSON.stringify(lore).includes('SEGREDO'), false);
  await admin.doc('universes/world/lore/hero').delete();
  assert.deepEqual(await comparisonRows(f, p, 'items', { kind: 'lore' }), []);
  const refs = await comparisonRows(f, p, 'references');
  assert.equal(
    refs.every(
      (row) =>
        row.currentSummary.targetKey === null &&
        row.candidateSummary.targetKey === null &&
        row.change === 'unchanged',
    ),
    true,
  );
  const sceneKey = baseSourceKey({ adventureId, kind: 'scene', id: f.scene.id }),
    text = baseTextFields(sceneKey, { content: '🐉 "texto"\n'.repeat(18000) });
  await admin.doc(candidate + '/items/' + sceneKey).update({ fields: text.fields });
  for (const body of text.bodies)
    await admin
      .doc(candidate + '/bodies/' + baseBodyKey(sceneKey, body.field, body.index))
      .set(body);
  const page = await f.reader.readCampaignComparisonItem(uid, {
    comparisonId: p.comparisonId,
    sourceKey: sceneKey,
    side: 'candidate',
    limit: 1,
  });
  assert.ok(page.nextCursor);
  await admin.doc(`campaigns/${p.campaignId}/loreVariantState/current`).create({
    schemaVersion: 1,
    ownerId: uid,
    campaignId: p.campaignId,
    campaignToken: p.campaignToken,
    baseId: p.currentBaseId,
    revision: 1,
  });
  await assert.rejects(
    f.reader.readCampaignComparisonItem(uid, {
      comparisonId: p.comparisonId,
      sourceKey: sceneKey,
      side: 'candidate',
      cursor: page.nextCursor,
    }),
    (e) => e.details?.reason === 'cursor-invalidated',
  );
  await admin.doc('adventures/' + adventureId).delete();
  await assert.rejects(
    f.reader.readCampaignComparisonItem(uid, {
      comparisonId: p.comparisonId,
      sourceKey: sceneKey,
      side: 'candidate',
    }),
    { code: 'not-found' },
  );
});

test('SDK worst lore pair projects100 captured targets through masks without reading live text, stays within4MiB512docs and paginates without dropping keys', async () => {
  const { result } = await startComparison(f),
    p = await finishComparison(f, result),
    hero = baseSourceKey({ kind: 'lore', scopeId: 'world', id: 'hero' });
  const heroItem = (
    await admin.doc(basePath(uid, p.currentBaseId) + '/items/' + hero).get()
  ).data();
  for (let n = 0; n < 100; n++) {
    const entityId = 'target-' + n,
      key = baseSourceKey({ kind: 'lore', scopeId: 'world', id: entityId }),
      side = n < 50 ? p.currentBaseId : p.candidateBaseId;
    // Live bodies are deliberately much larger than the masked existence check.
    await admin
      .doc('universes/world/lore/' + entityId)
      .set({ name: 'Alvo ' + n, deleting: false, details: 'PRIVATE-LIVE-TEXT'.repeat(18000) });
    await admin.doc(basePath(uid, side) + '/items/' + key).set({
      ...heroItem,
      sourceKey: key,
      title: 'Alvo ' + n,
      origin: { kind: 'lore', scopeId: 'world', id: entityId },
      structured: { ...heroItem.structured, relations: [] },
    });
  }
  for (const [side, start] of [
    [p.currentBaseId, 0],
    [p.candidateBaseId, 50],
  ])
    await admin.doc(basePath(uid, side) + '/items/' + hero).update({
      'structured.relations': Array.from({ length: 50 }, (_, n) => ({
        targetEntityId: 'universe:world:target-' + (start + n),
        relationType: 'Conhece',
        description: 'Relação',
      })),
    });
  const attempts = [];
  const measured = {
    doc: admin.doc.bind(admin),
    collection: admin.collection.bind(admin),
    runTransaction: (fn) =>
      admin.runTransaction(async (tx) => {
        let bytes = 0,
          documents = 0;
        const maskReads = [];
        const add = (snap) => {
          for (const d of snap.docs ?? [snap]) {
            documents++;
            bytes += Buffer.byteLength(JSON.stringify(d.data() ?? null));
          }
          return snap;
        };
        const wrapped = {
          get: async (ref) => add(await tx.get(ref)),
          getAll: async (ref, options) => {
            maskReads.push({ path: ref.path, fields: options.fieldMask });
            return (await tx.getAll(ref, options)).map(add);
          },
        };
        const value = await fn(wrapped);
        attempts.push({ bytes, documents, maskReads });
        return value;
      }),
  };
  const reader = createCampaignComparisonReadService({ db: measured, assets: f.assets }),
    rows = [];
  let cursor;
  for (let n = 0; n < 120; n++) {
    const page = await reader.listCampaignComparisonChanges(uid, {
      comparisonId: p.comparisonId,
      group: 'items',
      kind: 'lore',
      limit: 1,
      ...(cursor ? { cursor } : {}),
    });
    rows.push(...page.items);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  assert.equal(rows.length, 101);
  assert.equal(new Set(rows.map((row) => row.key)).size, 101);
  assert.equal(rows.find((row) => row.key === hero).change, 'changed');
  assert.equal(
    attempts.every((a) => a.bytes <= 4 * 1024 * 1024 && a.documents <= 512),
    true,
  );
  const live = attempts
    .flatMap((a) => a.maskReads)
    .filter((r) => r.path.startsWith('universes/world/lore/'));
  assert.ok(live.length >= 100);
  assert.equal(
    live.every((r) => r.fields.length === 1 && r.fields[0] === 'deleting'),
    true,
  );
  assert.equal(JSON.stringify(rows).includes('PRIVATE-LIVE-TEXT'), false);
});

test('SDK lazy media reauthorizes after I/O; cleanup retries release candidate pins only and never touches active base or own domains', async () => {
  const { result } = await startComparison(f),
    p = await finishComparison(f, result),
    key = digest({ imageId: f.imageId }),
    library = admin.doc('users/' + uid + '/imageLibrary/' + f.imageId);
  assert.equal((await library.get()).data().useCount, 3);
  const preview = await f.reader.readCampaignComparisonImage(uid, {
    comparisonId: p.comparisonId,
    imageKey: key,
    side: 'candidate',
  });
  assert.equal(preview.key, key);
  const original = f.assets.readGeneration;
  f.assets.readGeneration = async () => {
    await admin.doc('adventures/' + adventureId).delete();
    return Buffer.from('webp');
  };
  await assert.rejects(
    f.reader.readCampaignComparisonImage(uid, {
      comparisonId: p.comparisonId,
      imageKey: key,
      side: 'current',
    }),
    { code: 'not-found' },
  );
  f.assets.readGeneration = original;
  await admin.doc(`campaigns/${p.campaignId}/notes/own`).set({ content: 'Pessoal' });
  let state = (
    await f.api.cancelCampaignComparison(uid, {
      comparisonId: p.comparisonId,
      operationId: op('cleanup-start'),
      expectedCheckpoint: p.checkpoint,
    })
  ).progress;
  await library.update({ useCount: 0 });
  const failed = {
    comparisonId: p.comparisonId,
    operationId: op('cleanup-failed'),
    expectedCheckpoint: state.checkpoint,
  };
  await assert.rejects(f.api.cancelCampaignComparison(uid, failed));
  assert.equal(
    (await f.api.getCampaignComparison(uid, { comparisonId: p.comparisonId })).checkpoint,
    state.checkpoint,
  );
  await library.update({ useCount: 3 });
  state = (await f.api.cancelCampaignComparison(uid, failed)).progress;
  for (let n = 0; n < 60 && state.state !== 'deleted'; n++)
    state = (
      await f.api.cancelCampaignComparison(uid, {
        comparisonId: p.comparisonId,
        operationId: op('cleanup-' + state.checkpoint),
        expectedCheckpoint: state.checkpoint,
      })
    ).progress;
  assert.equal(state.cleanupComplete, true);
  assert.equal((await library.get()).data().useCount, 2);
  assert.equal((await admin.doc(basePath(uid, p.currentBaseId)).get()).exists, true);
  assert.equal(
    (await admin.doc(`campaigns/${p.campaignId}/notes/own`).get()).data().content,
    'Pessoal',
  );
});
