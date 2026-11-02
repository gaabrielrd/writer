import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test, before, after } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { createAdventureRestoreTransferService } from '../../functions/src/adventureRestoreTransfer.mjs';
import {
  prepareAdventureImages,
  finishImages,
  imageAdventureArchive,
} from '../../functions/test/helpers/adventureRestoreImageFixture.mjs';
import {
  createAdventureStoragePNG,
  finishImageStorage,
} from '../../functions/test/helpers/adventureRestoreImageStorageFixture.mjs';
import { finishCounts } from '../../functions/test/helpers/adventureRestoreCountsFixture.mjs';
import {
  auditRequest,
  auditStep,
  finishAudit,
} from '../../functions/test/helpers/adventureRestoreAuditFixture.mjs';
import { cleanup, uid, id } from '../../functions/test/helpers/adventureRestoreTransferFixture.mjs';
import { bookRestoreStorageWire } from '../../functions/test/helpers/bookRestoreStorageWire.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-adventure-audit',
  jobPath = 'users/' + uid + '/adventureRestores/' + id;
let env, admin;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127[.]0[.]0[.]1:[0-9]+$/.test(address ?? '')) throw Error('Dedicated loopback demo only');
  const [host, port] = address.split(':');
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
test('real SDK inventories reject an unjournaled native document and certify the original private GCS generation before cleanup', async (t) => {
  const wire = await bookRestoreStorageWire(t),
    assets = wire.api,
    api = createAdventureRestoreTransferService({ db: admin, assets }),
    f = { api, uid },
    png = await createAdventureStoragePNG();
  let p = await prepareAdventureImages(api, uid, await imageAdventureArchive({ image: png }));
  p = await finishImages(f, p);
  p = await finishImageStorage(f, p);
  p = await finishCounts(f, p);
  const request = auditRequest(p),
    [a, b] = await Promise.all([
      api.advanceAdventureRestoreAudit(uid, request),
      api.advanceAdventureRestoreAudit(uid, request),
    ]);
  assert.deepEqual(a, b);
  p = a.progress;
  while (p.staging.phase !== 'audit-physical') p = await auditStep(f, p);
  const foreign = admin.doc('adventures/' + p.adventureId + '/workWordGroups/' + 'f'.repeat(64));
  await foreign.create({ words: 999, enabled: true });
  let rejected = false;
  for (let n = 0; n < 1000; n++) {
    assert.ok(n < 999);
    const before = (await admin.doc(jobPath).get()).data();
    try {
      p = await auditStep(f, p);
    } catch {
      rejected = true;
      assert.deepEqual((await admin.doc(jobPath).get()).data(), before);
      assert.deepEqual((await foreign.get()).data(), { words: 999, enabled: true });
      break;
    }
    assert.notEqual(p.staging.phase, 'audit-ready');
  }
  assert.equal(rejected, true);
  await foreign.delete(); // Only the test's own injected emulator document.
  while (p.staging.phase !== 'audit-media') p = await auditStep(f, p);
  const mediaRequest = auditRequest(p),
    before = (await admin.doc(jobPath).get()).data(),
    verify = assets.verify,
    originalPosts = wire.requests.filter((r) => r.method === 'POST').length,
    path = [...wire.current.keys()][0],
    generation = wire.current.get(path).generation;
  let once = true;
  assets.verify = async (...args) => {
    const value = await verify(...args);
    if (once) {
      once = false;
      throw Error('SDK lost private verification response');
    }
    return value;
  };
  await assert.rejects(
    () => api.advanceAdventureRestoreAudit(uid, mediaRequest),
    /SDK lost private verification response/,
  );
  assert.deepEqual((await admin.doc(jobPath).get()).data(), before);
  const checked = await api.advanceAdventureRestoreAudit(uid, mediaRequest);
  assert.equal(checked.progress.staging.auditMedia, 1);
  const calls = wire.requests.length;
  assert.deepEqual(await api.advanceAdventureRestoreAudit(uid, mediaRequest), checked);
  assert.equal(wire.requests.length, calls);
  p = await finishAudit(f, checked.progress);
  assert.equal(p.staging.auditJournals, p.staging.artifactCount);
  assert.equal(p.staging.auditPhysical, p.staging.artifactCount);
  assert.equal(p.staging.auditMedia, 1);
  assert.equal(wire.current.get(path).generation, generation);
  assert.deepEqual(wire.current.get(path).bytes, png);
  assert.equal(wire.requests.filter((r) => r.method === 'POST').length, originalPosts);
  assert.equal(wire.current.get(path).metadata.accepted, 'false');
  assert.equal(wire.current.get(path).metadata.firebaseStorageDownloadTokens, undefined);
  const client = env.authenticatedContext(uid).firestore();
  await assertFails(getDoc(doc(client, 'adventures/' + p.adventureId)));
  await assertFails(getDoc(doc(client, jobPath + '/preparedRoot/current')));
  assert.equal((await admin.collection('users/' + uid + '/imageLibrary').get()).empty, true);
  const cancelled = await cleanup(f, p, 50);
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(cancelled.staging.cleanedArtifacts, p.staging.artifactCount);
  assert.equal(wire.current.get(path).bytes.length, 0);
  assert.equal(wire.versions.get(path).size, 1);
});
