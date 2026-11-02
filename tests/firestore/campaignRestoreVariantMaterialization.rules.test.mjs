import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { generateKeyPairSync } from 'node:crypto';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { createStudioService } from '../../functions/src/studio.mjs';
import { createScenesService } from '../../functions/src/scenes.mjs';
import { createAdventureLoreService } from '../../functions/src/adventureLore.mjs';
import { createCampaignCaptureService } from '../../functions/src/campaignCapture.mjs';
import { createCampaignBackupFileService } from '../../functions/src/campaignBackupFile.mjs';
import { createCampaignLoreService } from '../../functions/src/campaignLore.mjs';
import { createCampaignVariantRecoveryService } from '../../functions/src/campaignVariantRecovery.mjs';
import { seal, entity } from '../../functions/test/helpers/campaignLore.mjs';
import { baseSourceKey } from '../../functions/src/campaignBaseContracts.mjs';
import { createCampaignRestoreTransferService } from '../../functions/src/campaignRestoreTransfer.mjs';
import {
  uid,
  ownMut as mut,
  prepareOwnRestore,
  finishOwnMaterialization,
} from '../../functions/test/helpers/campaignOwnMaterialization.mjs';
import { sha } from '../../functions/src/campaignRestoreContracts.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore');
let env, admin;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? '')) throw Error('Local demo only');
  const [host, port] = address.split(':'),
    projectId = 'demo-writer-variant-materialization';
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
  await env.clearFirestore();
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
test(
  'native restored variants bind original source at write and keep pending Rules until keyless collection',
  { timeout: 480000 },
  async () => {
    const studio = createStudioService({ db: admin }),
      adventureId = 'base-sdk-native-adventure',
      scenes = createScenesService({ db: admin }),
      target = { kind: 'adventure', id: adventureId },
      text = '\ufeff  Texto congelado 🐉\n  ';
    await studio.createAdventure(uid, {
      operationId: adventureId,
      title: 'Origem',
      universeId: null,
    });
    const scene = (
        await scenes.createScene(uid, {
          target,
          operationId: 'base-sdk-native-scene',
          title: 'Cena',
          parentId: null,
          content: text,
          planning: { objective: '', conflict: '', pointOfView: '' },
        })
      ).scene,
      lore = createAdventureLoreService({ db: admin }),
      entityId = 'base-sdk-native-local-lore',
      scope = await lore.listAdventureLore(uid, { adventureId, scope: 'adventure' });
    await lore.saveAdventureLore(uid, {
      adventureId,
      adventureToken: scope.adventureToken,
      entityId,
      operationId: entityId,
      expectedRevision: 0,
      expectedCollectionRevision: 0,
      entity: {
        name: 'Guia',
        aliases: [],
        category: 'character',
        summary: 'Resumo próprio',
        details: 'Lore congelado',
        structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
        relations: [],
        isPublic: false,
      },
    });
    await scenes.setSceneReference(uid, {
      target,
      sceneId: scene.id,
      operationId: 'base-sdk-native-reference',
      expectedRevision: scene.revision,
      reference: { kind: 'adventure', scopeId: adventureId, entityId },
    });
    const capture = createCampaignCaptureService({ db: admin, assets: {} }),
      source = await capture.getCampaignCaptureSource(uid, { adventureId });
    let c = await capture.startCampaignCapture(uid, {
      operationId: 'base-sdk-native-capture',
      adventureId,
      expectedSourceToken: source.sourceToken,
      title: 'Mesa fonte',
      description: '',
      universeId: null,
    });
    for (let n = 0; c.state === 'preparing' && n < 100; n++)
      c = await capture.advanceCampaignCapture(uid, {
        captureId: c.captureId,
        operationId: 'base-sdk-capture-step-' + n,
        expectedCheckpoint: c.checkpoint,
      });
    assert.equal(c.state, 'prepared');
    const active = await capture.activateCampaignCapture(uid, {
      captureId: c.captureId,
      operationId: 'base-sdk-capture-activate',
      expectedCheckpoint: c.checkpoint,
    });
    const loreApi = createCampaignLoreService({ db: admin }),
      loreScope = await loreApi.listCampaignLore(uid, {
        campaignId: active.campaign.id,
        baseId: active.campaign.activeBaseId,
      }),
      header = {
        campaignId: active.campaign.id,
        campaignToken: loreScope.campaignToken,
        baseId: active.campaign.activeBaseId,
        sourceKey: baseSourceKey({ kind: 'adventure-lore', adventureId, id: entityId }),
        operationId: 'variant-sdk-original-save',
        expectedRevision: 0,
        relatedSourceKeys: [],
      },
      recovery = createCampaignVariantRecoveryService({ db: admin }),
      prepared = await recovery.prepareCampaignLoreVariant(uid, header);
    await loreApi.saveCampaignLoreVariant(uid, {
      ...header,
      sealed: seal(prepared, entity({ details: text })),
    });
    await recovery.resolveCampaignLoreOperation(uid, {
      ...header,
      action: 'save',
      intent: 'confirm',
    });
    const pair = generateKeyPairSync('ed25519'),
      keys = [{ id: 'base-sdk-test', state: 'active', publicKey: pair.publicKey }],
      frames = [];
    await createCampaignBackupFileService({
      db: admin,
      storage: {},
      keys,
      keyId: keys[0].id,
      privateKey: pair.privateKey,
      now: () => 6000,
    }).writeCampaignBackupFile(
      uid,
      { campaignId: active.campaign.id },
      {
        sink: {
          async write(b) {
            frames.push(Buffer.from(b));
          },
          async commit() {},
          async abort() {
            frames.length = 0;
          },
        },
      },
    );
    const original = { keys, file: Buffer.concat(frames) },
      rid = 'campaign-variant-materialize-sdk';
    let { api, p } = await prepareOwnRestore(admin, original, rid);
    p = await finishOwnMaterialization({ api, p });
    for (const [method, field, phase] of [
      ['advanceCampaignRestoreDerivedIndex', 'derivedReview', 'indexed'],
      ['advanceCampaignRestoreDerivedSemantics', 'derivedCheck', 'verified'],
    ]) {
      for (let n = 0; p[field]?.phase !== phase && n < 1000; n++)
        p = (
          await api[method](
            uid,
            mut(p, 'base-prep-' + sha(JSON.stringify([method, p.checkpoint])), {
              limit: 25,
            }),
          )
        ).progress;
      assert.equal(p[field].phase, phase);
    }

    for (let n = 0; p.baseMaterialization?.phase !== 'ready' && n < 1000; n++)
      p = (
        await api.advanceCampaignRestoreBase(
          uid,
          mut(p, 'variant-base-' + sha(String(p.checkpoint)), { limit: 25 }),
        )
      ).progress;
    assert.equal(p.baseMaterialization.phase, 'ready');
    const port = await api.openCampaignRestoreDerivedIndex(uid, {
        restoreId: rid,
        jobToken: p.jobToken,
      }),
      rows = [];
    for (let n = 0; n < port.certificate.rows; n += 25)
      rows.push(...(await port.read(n, Math.min(25, port.certificate.rows - n))));
    const first = rows.find((r) => r.section === 'variant' && r.value.unit.outcome === 'available');
    while ((p.variantMaterialization?.processedRows ?? 0) < first.index)
      p = (
        await api.advanceCampaignRestoreVariants(
          uid,
          mut(p, 'variant-position-sdk-' + p.checkpoint, { limit: 1 }),
        )
      ).progress;
    const open = api.openCampaignRestoreSource.bind(api),
      jobPath = 'users/' + uid + '/campaignRestores/' + rid,
      before = (await admin.doc(jobPath).get()).data();
    let changed = false;
    api.openCampaignRestoreSource = async (...args) => {
      const source = await open(...args);
      return {
        ...source,
        read: async (...range) => {
          const bytes = await source.read(...range);
          if (!changed) {
            changed = true;
            await admin.doc('adventures/' + adventureId).update({ ownerId: 'other' });
          }
          return bytes;
        },
      };
    };
    const request = mut(p, 'variant-sdk-late-source-change', { limit: 1 });
    await assert.rejects(
      api.advanceCampaignRestoreVariants(uid, request),
      (e) => e.details?.reason === 'campaign-backup-origin-changed',
    );
    assert.deepEqual((await admin.doc(jobPath).get()).data(), before);
    await admin.doc('adventures/' + adventureId).update({ ownerId: uid });
    api = createCampaignRestoreTransferService({ db: admin, keys, now: () => 7000 });
    const copied = await api.advanceCampaignRestoreVariants(uid, request);
    p = copied.progress;
    for (let n = 0; p.variantMaterialization.phase !== 'ready' && n < 1000; n++)
      p = (
        await api.advanceCampaignRestoreVariants(
          uid,
          mut(p, 'variant-sdk-copy-' + p.checkpoint, { limit: 25 }),
        )
      ).progress;
    assert.equal(p.variantMaterialization.phase, 'ready');
    const result = await api.getCampaignRestoreVariants(uid, {
        restoreId: rid,
        jobToken: p.jobToken,
      }),
      path = 'campaigns/' + p.campaignId + '/loreGenerations/' + result.generationId,
      parent = await admin.doc(path).get(),
      bodies = (await admin.collection(path + '/loreVariantBodies').get()).docs
        .map((d) => ({ path: d.ref.path, ...d.data() }))
        .sort((a, b) => a.index - b.index),
      overlay = (await admin.collection(path + '/loreVariants').get()).docs[0],
      journal = await admin
        .doc(
          jobPath +
            '/variantWrites/' +
            String(p.variantMaterialization.written - 1).padStart(15, '0'),
        )
        .get();
    assert.equal(parent.data().state, 'preparing');
    assert.equal(parent.createTime.isEqual(journal.createTime), true);
    assert.equal(overlay.data().bodyBinding.generationId, result.generationId);
    assert.equal(overlay.data().bodyCodec, 'portable-relations-v1');
    assert.equal(JSON.parse(bodies.map((b) => b.content).join('')).details, text);
    const client = env.authenticatedContext(uid).firestore();
    await assertFails(getDoc(doc(client, path)));
    await assertFails(getDoc(doc(client, overlay.ref.path)));
    await assertFails(getDoc(doc(client, bodies[0].path)));
    const foreign = path + '/loreVariantBodies/foreign-test';
    await admin.doc(foreign).create({ content: 'FOREIGN' });
    await admin.doc('adventures/' + adventureId).update({ ownerId: 'other' });
    p = (await api.cancelCampaignRestore(uid, mut(p, 'variant-sdk-cancel-copy'))).progress;
    await assert.rejects(
      api.advanceCampaignRestoreCleanup(uid, mut(p, 'variant-sdk-held-cleanup', { limit: 25 })),
    );
    assert.equal((await admin.doc(path).get()).exists, true);
    assert.equal((await admin.doc(foreign).get()).exists, true);
    assert.equal(
      (await admin.doc('users/' + uid + '/campaignRestoreKeys/' + rid).get()).exists,
      false,
    );
    await admin.doc(foreign).delete();
    for (let n = 0; p.state !== 'cancelled' && n < 1000; n++)
      p = (
        await api.advanceCampaignRestoreCleanup(
          uid,
          mut(p, 'variant-sdk-clean-' + p.checkpoint, { limit: 25 }),
        )
      ).progress;
    assert.equal(p.state, 'cancelled');
    assert.equal((await admin.doc(path).get()).exists, false);
    for (const family of ['loreVariants', 'loreVariantBodies'])
      assert.equal(
        (
          await admin
            .collection(path + '/' + family)
            .limit(1)
            .get()
        ).empty,
        true,
      );
    assert.equal(
      (
        await admin
          .collection(jobPath + '/variantWrites')
          .limit(1)
          .get()
      ).empty,
      true,
    );
    assert.deepEqual(
      (await api.advanceCampaignRestoreVariants(uid, request)).receipt,
      copied.receipt,
    );
    assert.equal((await admin.doc('campaigns/' + active.campaign.id).get()).exists, true);
  },
);
