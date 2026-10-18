import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { createCampaignLoreService } from '../../functions/src/campaignLore.mjs';
import { createCampaignVariantRecoveryService } from '../../functions/src/campaignVariantRecovery.mjs';
import { createCampaignNotesService } from '../../functions/src/campaignNotes.mjs';
import {
  uid,
  campaignId,
  baseId,
  adventureId,
  basePath,
  campaignPath,
  key,
  op,
  entity,
  seedLoreRecords,
  header,
  seal,
} from '../../functions/test/helpers/campaignLore.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-campaign-lore-tests',
  reason = (name) => (error) => error.details?.reason === name,
  previousMetadata = process.env.METADATA_SERVER_DETECTION;
let environment, admin, api, recovery, scope;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!address) throw new Error('Use somente o emulador demo.');
  process.env.METADATA_SERVER_DETECTION = 'none';
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
  api = createCampaignLoreService({ db: admin, now: () => 100 });
  recovery = createCampaignVariantRecoveryService({ db: admin });
});
beforeEach(async () => {
  await environment.clearFirestore();
  const batch = admin.batch();
  for (const [path, value] of seedLoreRecords()) batch.set(admin.doc(path), value);
  await batch.commit();
  const initial = await api.listCampaignLore(uid, { campaignId, baseId });
  scope = { campaignId, baseId, campaignToken: initial.campaignToken };
});
after(async () => {
  await admin?.terminate();
  await environment?.cleanup();
  if (previousMetadata === undefined) delete process.env.METADATA_SERVER_DETECTION;
  else process.env.METADATA_SERVER_DETECTION = previousMetadata;
});
const client = (user) =>
  user
    ? environment.authenticatedContext(user).firestore()
    : environment.unauthenticatedContext().firestore();
const get = (sourceKey = key('a')) => api.getCampaignLore(uid, { ...scope, sourceKey });
async function saved(name, revision = 0, value = entity(), sourceKey = key('a')) {
  const input = {
      ...header(scope, name, revision, sourceKey),
      relatedSourceKeys: [...new Set(value.relations.map((relation) => relation.targetKey))].sort(),
    },
    prepared = await recovery.prepareCampaignLoreVariant(uid, input),
    request = { ...input, sealed: seal(prepared, value) };
  return { input, prepared, request, result: await api.saveCampaignLoreVariant(uid, request) };
}
test('SDK whole lore lifecycle preserves immutable bodyRevision, base/global and notes, and direct SDK denies chunks, keys, receipts and list', async () => {
  const notes = createCampaignNotesService({ db: admin }),
    noteScope = await notes.listCampaignNotes(uid, { campaignId });
  await notes.saveCampaignNote(uid, {
    campaignId,
    campaignToken: noteScope.campaignToken,
    noteId: op('own-note'),
    operationId: op('own-note'),
    expectedRevision: 0,
    title: 'Minha nota',
    content: 'Texto autoral privado',
  });
  const first = await saved('first'),
    overlayPath = campaignPath + '/loreVariants/' + key('a'),
    before = (await admin.doc(overlayPath).get()).data();
  assert.equal(first.result.item.entity.details, entity().details);
  await api.removeCampaignLore(uid, header(scope, 'remove', 1));
  const removed = await get();
  assert.equal(removed.item.entity, null);
  assert.equal(
    (await api.listCampaignLore(uid, { ...scope, view: 'removed' })).items[0].name,
    entity().name,
  );
  const restored = await api.restoreCampaignLore(uid, header(scope, 'restore', 2));
  assert.equal(restored.item.entity.details, entity().details);
  assert.deepEqual((await admin.doc(overlayPath).get()).data().manifest, before.manifest);
  const chunk = (
    await admin
      .collection(campaignPath + '/loreVariantBodies')
      .limit(1)
      .get()
  ).docs[0];
  for (const user of [uid, 'other', null]) {
    const db = client(user);
    for (const path of [
      overlayPath,
      chunk.ref.path,
      campaignPath + '/loreVariantState/current',
      `users/${uid}/campaignVariantOperations/${op('first')}`,
    ]) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), { forged: true }));
      await assertFails(updateDoc(doc(db, path), { revision: 9 }));
      await assertFails(deleteDoc(doc(db, path)));
    }
    await assertFails(getDocs(collection(db, campaignPath + '/loreVariants')));
  }
  await api.discardCampaignLoreVariant(uid, header(scope, 'discard', 3));
  assert.equal((await get()).item.entity.name, 'Ficha congelada a');
  assert.equal((await admin.collection(campaignPath + '/loreVariantBodies').get()).size, 0);
  assert.equal(
    (await admin.doc('universes/world/lore/a').get()).data().name,
    'Nome vivo não usar a',
  );
  assert.equal(
    (
      await notes.getCampaignNote(uid, {
        campaignId,
        campaignToken: noteScope.campaignToken,
        noteId: op('own-note'),
      })
    ).note.content,
    'Texto autoral privado',
  );
  await assert.rejects(
    api.saveCampaignLoreVariant(uid, first.request),
    reason('revision-conflict'),
  );
});
test('SDK racing CAS and cancel fence linearize, while committed key recovery survives +1 and key closure requires a receipt', async () => {
  const inputs = ['race-a', 'race-b'].map((name) => ({
      ...header(scope, name),
      relatedSourceKeys: [],
    })),
    prepared = await Promise.all(
      inputs.map((input) => recovery.prepareCampaignLoreVariant(uid, input)),
    ),
    requests = inputs.map((input, index) => ({
      ...input,
      sealed: seal(prepared[index], entity({ details: 'Todo texto ' + index })),
    }));
  const results = await Promise.allSettled(
    requests.map((request) => api.saveCampaignLoreVariant(uid, request)),
  );
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const winner = results.findIndex((result) => result.status === 'fulfilled');
  assert.equal(
    (await recovery.prepareCampaignLoreVariant(uid, inputs[winner])).key,
    prepared[winner].key,
  );
  assert.deepEqual(await api.saveCampaignLoreVariant(uid, requests[winner]), results[winner].value);
  const resolved = await recovery.resolveCampaignLoreOperation(uid, {
    ...inputs[winner],
    action: 'save',
    intent: 'confirm',
  });
  assert.equal(resolved.state, 'committed');
  assert.equal(resolved.revision, 1);
  assert.equal(
    'key' in
      (
        await admin
          .doc(`users/${uid}/campaignVariantOperations/${inputs[winner].operationId}`)
          .get()
      ).data(),
    false,
  );
  await assert.rejects(
    recovery.prepareCampaignLoreVariant(uid, inputs[winner]),
    reason('operation-canceled'),
  );
  const fenceInput = { ...header(scope, 'fence', 0, key('b')), relatedSourceKeys: [] },
    fenceKey = await recovery.prepareCampaignLoreVariant(uid, fenceInput),
    request = { ...fenceInput, sealed: seal(fenceKey, entity()) };
  await assert.rejects(
    recovery.resolveCampaignLoreOperation(uid, {
      ...fenceInput,
      action: 'save',
      intent: 'confirm',
    }),
    reason('operation-unconfirmed'),
  );
  const [write, cancel] = await Promise.allSettled([
    api.saveCampaignLoreVariant(uid, request),
    recovery.resolveCampaignLoreOperation(uid, { ...fenceInput, action: 'save', intent: 'cancel' }),
  ]);
  assert.equal(cancel.status, 'fulfilled');
  if (write.status === 'fulfilled') {
    assert.equal(cancel.value.state, 'committed');
    assert.equal((await get(key('b'))).item.revision, 1);
  } else {
    assert.equal(cancel.value.state, 'canceled');
    assert.equal(write.reason.details.reason, 'operation-canceled');
    assert.equal((await get(key('b'))).item.revision, 0);
  }
});
test('SDK gates related drafts on every key delivery, redacts unavailable relations, keeps own notes and cancels unseen operations without a root', async () => {
  const relations = ['ally', 'rival'].map((relationType) => ({
      targetKey: key('b'),
      relationType,
      description: 'Segredo relacionado',
    })),
    first = await saved('relations', 0, entity({ relations }));
  assert.equal(first.result.item.entity.relations.length, 2);
  await saved('target-name', 0, entity({ name: 'Nome particular da mesa' }), key('b'));
  assert.equal((await get()).item.entity.relations[0].targetName, 'Nome particular da mesa');
  await admin.doc('universes/world/lore/b').delete();
  await assert.rejects(recovery.prepareCampaignLoreVariant(uid, first.input), {
    code: 'not-found',
  });
  assert.deepEqual((await get()).item.entity.relations, []);
  await api.removeCampaignLore(uid, header(scope, 'remove-source', 1));
  assert.equal(
    (await api.restoreCampaignLore(uid, header(scope, 'restore-source', 2))).item.entity.relations
      .length,
    0,
  );
  await api.discardCampaignLoreVariant(uid, header(scope, 'discard-source', 3));
  await admin.doc('adventures/' + adventureId).delete();
  const ownClose = await recovery.resolveCampaignLoreOperation(uid, {
    ...first.input,
    action: 'save',
    intent: 'confirm',
  });
  assert.equal(ownClose.state, 'committed');
  assert.equal('entity' in ownClose, false);
  const unseen = { ...header(scope, 'never-received'), relatedSourceKeys: [], action: 'save' };
  await admin.doc(campaignPath).delete();
  await assert.rejects(
    recovery.resolveCampaignLoreOperation(uid, { ...unseen, intent: 'confirm' }),
    reason('operation-unconfirmed'),
  );
  const canceled = await recovery.resolveCampaignLoreOperation(uid, {
    ...unseen,
    intent: 'cancel',
  });
  assert.equal(canceled.state, 'canceled');
  assert.equal((await admin.doc(campaignPath).get()).exists, false);
  await admin.doc(campaignPath).set(seedLoreRecords().get(campaignPath));
  await admin
    .doc('adventures/' + adventureId)
    .set(seedLoreRecords().get('adventures/' + adventureId));
  await assert.rejects(get(), reason('campaign-changed'));
  assert.deepEqual(
    await recovery.resolveCampaignLoreOperation(uid, { ...unseen, intent: 'confirm' }),
    canceled,
  );
});
test('SDK bounded metadata windows/cursors and UTF-8/hash/descriptor validation reject malformed state without partial writes', async () => {
  const keys = [key('a'), key('b'), key('c')].sort();
  await api.removeCampaignLore(uid, header(scope, 'remove-first', 0, keys[0]));
  const page = await api.listCampaignLore(uid, { ...scope, limit: 1 });
  assert.equal(page.items.length, 0);
  assert.ok(page.nextCursor);
  const next = await api.listCampaignLore(uid, { ...scope, limit: 1, cursor: page.nextCursor });
  assert.equal(next.items[0].sourceKey, keys[1]);
  assert.equal('entity' in next.items[0], false);
  assert.equal('aliases' in next.items[0], false);
  await api.restoreCampaignLore(uid, header(scope, 'restore-first', 1, keys[0]));
  await assert.rejects(
    api.listCampaignLore(uid, { ...scope, cursor: page.nextCursor }),
    reason('cursor-invalidated'),
  );
  const sourceKey = keys[2],
    preparedInput = { ...header(scope, 'bad-body', 0, sourceKey), relatedSourceKeys: [] },
    prepared = await recovery.prepareCampaignLoreVariant(uid, preparedInput);
  await assert.rejects(
    api.saveCampaignLoreVariant(uid, {
      ...preparedInput,
      sealed: seal(prepared, entity({ details: '\ud800' })),
    }),
    { code: 'invalid-argument' },
  );
  assert.equal((await get(sourceKey)).item.revision, 0);
  const good = await saved('large', 0, entity({ details: '漢'.repeat(120000) }), sourceKey);
  assert.equal(good.result.item.entity.details.length, 120000);
  const body = (
    await admin
      .collection(campaignPath + '/loreVariantBodies')
      .where('sourceKey', '==', sourceKey)
      .limit(1)
      .get()
  ).docs[0];
  await body.ref.update({ content: 'corrompido' });
  await assert.rejects(get(sourceKey), { code: 'failed-precondition' });
  await admin.doc(campaignPath + '/loreVariantState/current').delete();
  await assert.rejects(api.listCampaignLore(uid, { campaignId, baseId }), {
    code: 'failed-precondition',
  });
  assert.equal((await admin.doc(campaignPath + '/loreVariantState/current').get()).exists, false);
  assert.ok((await admin.doc(basePath + '/items/' + sourceKey).get()).exists);
});
