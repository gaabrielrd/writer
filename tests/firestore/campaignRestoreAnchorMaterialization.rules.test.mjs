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
import { createCampaignComparisonService } from '../../functions/src/campaignComparison.mjs';
import { createCampaignAdoptionService } from '../../functions/src/campaignAdoption.mjs';
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
    projectId = 'demo-writer-anchor-materialization';
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
  'native historical anchor slots precede fields, bind original origins and collect safely after revocation',
  { timeout: 600000 },
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

    await scenes.setSceneReference(uid, {
      target,
      sceneId: scene.id,
      operationId: 'anchor-sdk-remove-lore-ref',
      expectedRevision: (await scenes.getScene(uid, { target, sceneId: scene.id })).revision,
      reference: { kind: 'adventure', scopeId: adventureId, entityId },
      remove: true,
    });
    const comparisonApi = createCampaignComparisonService({ db: admin, assets: {} }),
      comparisonSource = await comparisonApi.getCampaignComparisonSource(uid, {
        campaignId: active.campaign.id,
        currentBaseId: active.campaign.activeBaseId,
      });
    let comparison = (
      await comparisonApi.startCampaignComparison(uid, {
        operationId: 'anchor-sdk-comparison-native',
        campaignId: active.campaign.id,
        campaignToken: comparisonSource.campaignToken,
        currentBaseId: active.campaign.activeBaseId,
        expectedSourceToken: comparisonSource.sourceToken,
      })
    ).progress;
    for (let n = 0; comparison.state === 'preparing' && n < 1000; n++)
      comparison = (
        await comparisonApi.advanceCampaignComparison(uid, {
          comparisonId: comparison.comparisonId,
          expectedCheckpoint: comparison.checkpoint,
          operationId: 'anchor-sdk-comparison-' + comparison.checkpoint,
        })
      ).progress;
    assert.equal(comparison.state, 'ready');
    const adoptionApi = createCampaignAdoptionService({ db: admin }),
      loreCurrent = await loreApi.listCampaignLore(uid, {
        campaignId: active.campaign.id,
        baseId: active.campaign.activeBaseId,
      });
    let adoption = (
      await adoptionApi.startCampaignAdoption(uid, {
        operationId: 'anchor-sdk-adoption-native',
        campaignId: active.campaign.id,
        campaignToken: loreCurrent.campaignToken,
        comparisonId: comparison.comparisonId,
        currentBaseId: active.campaign.activeBaseId,
        candidateBaseId: comparison.candidateBaseId,
        expectedCollectionRevision: loreCurrent.collectionRevision,
      })
    ).progress;
    const adopt = async (method, extra = {}) => {
      adoption = (
        await adoptionApi[method](uid, {
          adoptionId: adoption.adoptionId,
          expectedCheckpoint: adoption.checkpoint,
          operationId: 'adopt-sdk-' + sha(JSON.stringify([method, adoption.checkpoint])),
          ...extra,
        })
      ).progress;
    };
    await adopt('decideCampaignAdoption', {
      sourceKey: header.sourceKey,
      expectedRevision: 1,
      choice: 'keep-local',
    });
    await adopt('prepareCampaignAdoption');
    for (let n = 0; adoption.state === 'preparing' && n < 1000; n++)
      await adopt('advanceCampaignAdoption');
    assert.equal(adoption.state, 'ready');
    await adopt('activateCampaignAdoption');
    assert.equal(adoption.state, 'adopted');
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
      rid = 'campaign-anchor-materialize-sdk';
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

    for (let n = 0; p.variantMaterialization?.phase !== 'ready' && n < 1000; n++)
      p = (
        await api.advanceCampaignRestoreVariants(
          uid,
          mut(p, 'anchor-vars-' + sha(String(p.checkpoint)), { limit: 25 }),
        )
      ).progress;
    assert.equal(p.variantMaterialization.phase, 'ready');
    const port = await api.openCampaignRestoreDerivedIndex(uid, {
        restoreId: rid,
        jobToken: p.jobToken,
      }),
      rows = [];
    for (let n = 0; n < port.certificate.rows; n += 25)
      rows.push(...(await port.read(n, Math.min(25, port.certificate.rows - n))));
    const row = rows.find((r) => r.section === 'anchor' && r.value.unit.outcome === 'available');
    while ((p.anchorMaterialization?.processedRows ?? 0) < row.index)
      p = (
        await api.advanceCampaignRestoreAnchors(
          uid,
          mut(p, 'anchor-sdk-position-' + p.checkpoint, {
            limit: Math.min(25, row.index - (p.anchorMaterialization?.processedRows ?? 0)),
          }),
        )
      ).progress;
    p = (
      await api.advanceCampaignRestoreAnchors(uid, mut(p, 'anchor-sdk-register-slot', { limit: 1 }))
    ).progress;
    assert.equal(p.anchorMaterialization.slots, 1);
    assert.equal(p.anchorMaterialization.written, 0);
    const jobPath = 'users/' + uid + '/campaignRestores/' + rid,
      slot = await admin.doc(jobPath + '/anchorSlots/' + '0'.repeat(15)).get(),
      slotOp = await admin
        .doc('users/' + uid + '/campaignRestoreOperations/anchor-sdk-register-slot')
        .get(),
      overlay = (await admin.collection('campaigns/' + p.campaignId + '/loreGenerations').get())
        .docs[0],
      variant = (await admin.collection(overlay.ref.path + '/loreVariants').get()).docs[0],
      path = 'users/' + uid + '/campaignBases/' + variant.data().anchor.capturedBaseId;
    assert.equal(slot.createTime.isEqual(slotOp.createTime), true);
    assert.equal((await admin.doc(path).get()).exists, false);
    assert.equal(
      (
        await admin
          .collection(path + '/bodies')
          .limit(1)
          .get()
      ).empty,
      true,
    );
    const open = api.openCampaignRestoreSource.bind(api),
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
    const request = mut(p, 'anchor-sdk-late-origin-change', { limit: 1 });
    await assert.rejects(
      api.advanceCampaignRestoreAnchors(uid, request),
      (e) => e.details?.reason === 'campaign-backup-origin-changed',
    );
    assert.deepEqual((await admin.doc(jobPath).get()).data(), before);
    await admin.doc('adventures/' + adventureId).update({ ownerId: uid });
    api = createCampaignRestoreTransferService({ db: admin, keys, now: () => 7000 });
    const copied = await api.advanceCampaignRestoreAnchors(uid, request);
    p = copied.progress;
    for (let n = 0; p.anchorMaterialization.phase !== 'ready' && n < 1000; n++)
      p = (
        await api.advanceCampaignRestoreAnchors(
          uid,
          mut(p, 'anchor-sdk-copy-' + p.checkpoint, { limit: 25 }),
        )
      ).progress;
    assert.equal(p.anchorMaterialization.phase, 'ready');
    const result = await api.getCampaignRestoreAnchors(uid, {
        restoreId: rid,
        jobToken: p.jobToken,
      }),
      parent = await admin.doc(path).get(),
      item = await admin.doc(path + '/items/' + header.sourceKey).get(),
      body = (await admin.collection(path + '/bodies').get()).docs,
      journal = await admin
        .doc(
          jobPath +
            '/anchorWrites/' +
            String(p.anchorMaterialization.written - 1).padStart(15, '0'),
        )
        .get(),
      sourceProof = (await port.lookup('w:anchor', JSON.stringify([header.sourceKey, null]))).value
        .record[3];
    assert.equal(result.anchors, 1);
    assert.equal(parent.data().state, 'preparing');
    assert.equal(parent.createTime.isEqual(journal.createTime), true);
    assert.deepEqual(parent.data().sourceEvidence.source, sourceProof.base);
    assert.deepEqual(item.data().sourceEvidence.source, sourceProof.item);
    assert.equal(parent.data().sourceEvidence.archiveHash, result.archive.chainHash);
    assert.equal(body.find((d) => d.data().field === 'details').data().content, 'Lore congelado');
    const client = env.authenticatedContext(uid).firestore();
    await assertFails(getDoc(doc(client, path)));
    await assertFails(getDoc(doc(client, body[0].ref.path)));
    await assertFails(getDoc(doc(client, slot.ref.path)));
    const foreign = path + '/bodies/foreign-test';
    await admin.doc(foreign).create({ content: 'FOREIGN' });
    await admin.doc('adventures/' + adventureId).update({ ownerId: 'other' });
    p = (await api.cancelCampaignRestore(uid, mut(p, 'anchor-sdk-cancel-copy'))).progress;
    let held = false;
    for (let n = 0; n < 1000; n++) {
      try {
        p = (
          await api.advanceCampaignRestoreCleanup(
            uid,
            mut(p, 'anchor-sdk-clean-' + p.checkpoint, { limit: 25 }),
          )
        ).progress;
      } catch {
        held = true;
        break;
      }
    }
    assert.equal(held, true);
    assert.equal((await admin.doc(path).get()).exists, true);
    assert.equal((await admin.doc(foreign).get()).exists, true);
    assert.equal((await admin.doc(slot.ref.path).get()).exists, true);
    assert.equal(
      (await admin.doc('users/' + uid + '/campaignRestoreKeys/' + rid).get()).exists,
      false,
    );
    await admin.doc(foreign).delete();
    for (let n = 0; p.state !== 'cancelled' && n < 1000; n++)
      p = (
        await api.advanceCampaignRestoreCleanup(
          uid,
          mut(p, 'anchor-sdk-clean-' + p.checkpoint, { limit: 25 }),
        )
      ).progress;
    assert.equal(p.state, 'cancelled');
    assert.equal((await admin.doc(path).get()).exists, false);
    for (const family of ['items', 'bodies', 'links', 'loreReferences', 'images'])
      assert.equal(
        (
          await admin
            .collection(path + '/' + family)
            .limit(1)
            .get()
        ).empty,
        true,
      );
    for (const family of ['anchorSlots', 'anchorWrites'])
      assert.equal(
        (
          await admin
            .collection(jobPath + '/' + family)
            .limit(1)
            .get()
        ).empty,
        true,
      );
    assert.deepEqual(
      (await api.advanceCampaignRestoreAnchors(uid, request)).receipt,
      copied.receipt,
    );
    assert.equal((await admin.doc('campaigns/' + active.campaign.id).get()).exists, true);
  },
);
