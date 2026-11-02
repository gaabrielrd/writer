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
    projectId = 'demo-writer-base-materialization';
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
  'native frozen base requires current origins at the write, keeps pending Rules and holds parent until every child is removed',
  { timeout: 360000 },
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
      }),
      pair = generateKeyPairSync('ed25519'),
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
      rid = 'campaign-base-materialize-sdk';
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
    const port = await api.openCampaignRestoreDerivedIndex(uid, {
        restoreId: rid,
        jobToken: p.jobToken,
      }),
      rows = [];
    for (let n = 0; n < port.certificate.rows; n += 25)
      rows.push(...(await port.read(n, Math.min(25, port.certificate.rows - n))));
    const first = rows.find(
      (r) =>
        r.section === 'base:field' &&
        rows
          .find((i) => i.section === 'base:item' && i.value.unit.id === r.value.unit.id)
          .value.meta.fields.find((x) => x.field === r.value.unit.field).bodySourceKey ===
          r.value.unit.id,
    );
    while ((p.baseMaterialization?.processedRows ?? 0) < first.index)
      p = (
        await api.advanceCampaignRestoreBase(
          uid,
          mut(p, 'base-sdk-before-copy-' + p.checkpoint, { limit: 1 }),
        )
      ).progress;
    const open = api.openCampaignRestoreSource.bind(api),
      before = (await admin.doc('users/' + uid + '/campaignRestores/' + rid).get()).data();
    let changed = false;
    api.openCampaignRestoreSource = async (...args) => {
      const opened = await open(...args);
      return {
        ...opened,
        read: async (...readArgs) => {
          const bytes = await opened.read(...readArgs);
          if (!changed) {
            changed = true;
            await admin.doc('adventures/' + adventureId).update({ ownerId: 'other' });
          }
          return bytes;
        },
      };
    };
    const request = mut(p, 'base-sdk-late-source-change', { limit: 1 });
    await assert.rejects(
      api.advanceCampaignRestoreBase(uid, request),
      (e) => e.details?.reason === 'campaign-backup-origin-changed',
    );
    assert.deepEqual(
      (await admin.doc('users/' + uid + '/campaignRestores/' + rid).get()).data(),
      before,
    );
    await admin.doc('adventures/' + adventureId).update({ ownerId: uid });
    api = createCampaignRestoreTransferService({ db: admin, keys, now: () => 7000 });
    const copied = await api.advanceCampaignRestoreBase(uid, request);
    p = copied.progress;
    for (let n = 0; p.baseMaterialization.phase !== 'ready' && n < 1000; n++)
      p = (
        await api.advanceCampaignRestoreBase(
          uid,
          mut(p, 'base-sdk-copy-' + p.checkpoint, { limit: 25 }),
        )
      ).progress;
    assert.equal(p.baseMaterialization.phase, 'ready');
    const result = await api.getCampaignRestoreBase(uid, { restoreId: rid, jobToken: p.jobToken }),
      path = 'users/' + uid + '/campaignBases/' + result.baseId,
      parent = await admin.doc(path).get(),
      items = (await admin.collection(path + '/items').get()).docs,
      bodies = (await admin.collection(path + '/bodies').get()).docs;
    assert.equal(parent.data().state, 'preparing');
    assert.equal(parent.data().sourceMode, 'restored');
    assert.ok(items.some((s) => s.data().origin.kind === 'adventure-lore'));
    assert.ok(bodies.some((s) => s.data().content === text));
    assert.ok(items.every((s) => s.data().sourceEvidence.archiveHash === result.archive.chainHash));
    const journal = await admin
      .doc(
        'users/' +
          uid +
          '/campaignRestores/' +
          rid +
          '/baseWrites/' +
          String(p.baseMaterialization.written - 1).padStart(15, '0'),
      )
      .get();
    assert.equal(parent.createTime.isEqual(journal.createTime), true);
    const client = env.authenticatedContext(uid).firestore();
    await assertFails(getDoc(doc(client, path)));
    await assertFails(getDoc(doc(client, bodies[0].ref.path)));
    const foreign = path + '/bodies/foreign-test';
    await admin.doc(foreign).create({ sourceKey: 'foreign', content: 'FOREIGN' });
    await admin.doc('adventures/' + adventureId).update({ ownerId: 'other' });
    p = (await api.cancelCampaignRestore(uid, mut(p, 'base-sdk-cancel-copy'))).progress;
    let held = false;
    for (let n = 0; n < 100; n++) {
      try {
        p = (
          await api.advanceCampaignRestoreCleanup(
            uid,
            mut(p, 'base-sdk-clean-' + p.checkpoint, { limit: 25 }),
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
    await admin.doc(foreign).delete();
    for (let n = 0; p.state !== 'cancelled' && n < 1000; n++)
      p = (
        await api.advanceCampaignRestoreCleanup(
          uid,
          mut(p, 'base-sdk-clean-' + p.checkpoint, { limit: 25 }),
        )
      ).progress;
    assert.equal(p.state, 'cancelled');
    assert.equal((await admin.doc(path).get()).exists, false);
    for (const name of ['items', 'bodies', 'links', 'loreReferences', 'images'])
      assert.equal(
        (
          await admin
            .collection(path + '/' + name)
            .limit(1)
            .get()
        ).empty,
        true,
      );
    assert.deepEqual((await api.advanceCampaignRestoreBase(uid, request)).receipt, copied.receipt);
    assert.equal((await admin.doc('campaigns/' + active.campaign.id).get()).exists, true);
  },
);
