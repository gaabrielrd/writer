import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { before, after, test } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { ADVENTURE_RESTORE_METHODS } from '../../functions/src/adventureRestoreCallable.mjs';
import { emptyAdventureArchive } from '../../functions/test/helpers/adventureRestoreArchiveFixture.mjs';
import {
  prepareAdventureImages,
  finishImages,
} from '../../functions/test/helpers/adventureRestoreImageFixture.mjs';
import { finishImageStorage } from '../../functions/test/helpers/adventureRestoreImageStorageFixture.mjs';
import { finishCounts } from '../../functions/test/helpers/adventureRestoreCountsFixture.mjs';
import { finishAudit } from '../../functions/test/helpers/adventureRestoreAuditFixture.mjs';
import { finishImageLibrary } from '../../functions/test/helpers/adventureRestoreImageLibraryFixture.mjs';
import { activationRequest } from '../../functions/test/helpers/adventureRestoreActivationFixture.mjs';
import { domainSdkFixture } from '../../functions/test/helpers/domainSdkFixture.mjs';
import { finishMedia } from '../../functions/test/helpers/adventureRestoreMediaFixture.mjs';
import { finishArchiveCleanup } from '../../functions/test/helpers/adventureRestoreArchiveCleanupFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  express = requireFunctions('express'),
  { getAuth } = requireFunctions('firebase-admin/auth'),
  { getAppCheck } = requireFunctions('firebase-admin/app-check'),
  { getFirestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-adventure-callable',
  address = process.env.FIRESTORE_EMULATOR_HOST;
if (!/^127[.]0[.]0[.]1:[0-9]+$/.test(address ?? ''))
  throw Error('Dedicated loopback emulator only');
const previousProject = process.env.GCLOUD_PROJECT,
  previousConfig = process.env.FIREBASE_CONFIG;
process.env.GCLOUD_PROJECT = projectId;
process.env.FIREBASE_CONFIG = JSON.stringify({
  projectId,
  storageBucket: projectId + '.appspot.com',
});
const host = domainSdkFixture(await import('../../functions/src/index.mjs'));
let env, admin, server, url, auth, appCheck, oldAuth, oldAppCheck;
before(async () => {
  const [hostname, port] = address.split(':');
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: hostname,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = getFirestore();
  assert.equal(admin.projectId, projectId);
  await env.clearFirestore();
  auth = getAuth();
  appCheck = getAppCheck();
  oldAuth = auth.verifyIdToken;
  oldAppCheck = appCheck.verifyToken;
  // Test-only attestations keep the real Functions middleware and production configuration unchanged.
  auth.verifyIdToken = async (token) => {
    if (!['local-author-auth', 'local-other-auth'].includes(token))
      throw Error('Rejected local token');
    const uid = token === 'local-author-auth' ? 'author' : 'other';
    return { uid, sub: uid };
  };
  appCheck.verifyToken = async (token) => {
    if (token !== 'local-valid-app-check') throw Error('Rejected local attestation');
    return { appId: 'local-contract-app', token: { app_id: 'local-contract-app' } };
  };
  const app = express();
  app.use(express.json({ limit: '128kb' }));
  app.use(
    express.raw({
      type: 'text/plain',
      limit: '16kb',
      verify: (req, _res, body) => {
        req.rawBody = body;
      },
    }),
  );
  app.post('/getAdventureRestoreRecoveryKey', host.getAdventureRestoreRecoveryKey);
  for (const method of ADVENTURE_RESTORE_METHODS) app.post('/' + method, host[method]);
  server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  url = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  if (auth) auth.verifyIdToken = oldAuth;
  if (appCheck) appCheck.verifyToken = oldAppCheck;
  server?.closeAllConnections();
  if (server) await new Promise((resolve) => server.close(resolve));
  await admin?.terminate();
  await env?.cleanup();
  if (previousProject === undefined) delete process.env.GCLOUD_PROJECT;
  else process.env.GCLOUD_PROJECT = previousProject;
  if (previousConfig === undefined) delete process.env.FIREBASE_CONFIG;
  else process.env.FIREBASE_CONFIG = previousConfig;
});
test('native HTTP callables restore and collect a private adventure with the real Firestore SDK', async () => {
  const requests = [],
    uid = 'author',
    api = Object.fromEntries(
      ADVENTURE_RESTORE_METHODS.map((method) => [
        method,
        async (actor, input) => {
          assert.ok(['author', 'other'].includes(actor));
          const response = await fetch(url + '/' + method, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization:
                'Bearer ' + (actor === 'author' ? 'local-author-auth' : 'local-other-auth'),
              'X-Firebase-AppCheck': 'local-valid-app-check',
            },
            body: JSON.stringify({ data: input }),
          });
          requests.push({ method, status: response.status });
          assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
          assert.ok(response.headers.get('Vary').includes('Authorization'));
          const body = await response.json();
          if (!response.ok)
            throw Object.assign(new Error(body.error.message), {
              code: body.error.status,
              details: body.error.details,
            });
          return body.result;
        },
      ]),
    ),
    f = { api, uid };
  let p = await prepareAdventureImages(api, uid, await emptyAdventureArchive());
  const own = env.authenticatedContext(uid).firestore(),
    other = env.authenticatedContext('other').firestore(),
    jobRef = admin.doc('users/' + uid + '/adventureRestores/' + p.restoreId),
    rootRef = admin.doc('adventures/' + p.adventureId);
  const keyInput = {
    restoreId: p.restoreId,
    jobToken: p.jobToken,
    reviewHash: (await jobRef.get()).data().reviewHash,
  };
  const fetchKey = async (actor, input = keyInput) => {
    const response = await fetch(url + '/getAdventureRestoreRecoveryKey', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
        Authorization: 'Bearer ' + (actor === uid ? 'local-author-auth' : 'local-other-auth'),
        'X-Firebase-AppCheck': 'local-valid-app-check',
      },
      body: JSON.stringify(input),
    });
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.ok(response.headers.get('Vary').includes('Authorization'));
    return { status: response.status, body: await response.json() };
  };
  const key = await fetchKey(uid);
  assert.equal(key.status, 200);
  assert.equal(Buffer.from(key.body.data.keyBase64, 'base64').length, 32);
  assert.deepEqual(await fetchKey(uid, { ...keyInput, expectedKeyId: key.body.data.keyId }), key);
  assert.equal((await fetchKey('other')).status, 404);
  const keyRef = admin.doc('users/' + uid + '/adventureRestoreRecoveryKeys/' + p.restoreId);
  assert.equal((await keyRef.get()).createTime.isEqual((await jobRef.get()).createTime), true);
  await assertFails(getDoc(doc(own, keyRef.path)));
  await assertFails(getDoc(doc(other, keyRef.path)));
  await assertFails(getDoc(doc(own, jobRef.path)));
  await assertFails(getDoc(doc(own, rootRef.path)));
  await assert.rejects(
    () => api.getAdventureRestore('other', { restoreId: p.restoreId, jobToken: p.jobToken }),
    { code: 'NOT_FOUND' },
  );
  p = await finishCounts(f, await finishImageStorage(f, await finishImages(f, p)));
  p = await finishAudit(f, await finishImageLibrary(f, await finishAudit(f, p)));
  const review = await activationRequest(f, p),
    activated = await api.activateAdventureRestore(uid, review.request);
  p = activated.progress;
  assert.equal(p.state, 'activated');
  assert.equal((await rootRef.get()).data().ownerId, uid);
  await assertSucceeds(getDoc(doc(own, rootRef.path)));
  await assertFails(getDoc(doc(other, rootRef.path)));
  const media = (
    await api.getAdventureRestoreMediaState(uid, { restoreId: p.restoreId, jobToken: p.jobToken })
  ).media;
  assert.equal((await finishMedia(f, p, media)).complete, true);
  const control = (
    await api.getAdventureRestoreArchiveCleanup(uid, {
      restoreId: p.restoreId,
      jobToken: p.jobToken,
    })
  ).progress;
  assert.equal((await finishArchiveCleanup(f, p, control)).phase, 'done');
  assert.equal((await keyRef.get()).exists, false);
  assert.equal((await fetchKey(uid)).body.error.details.reason, 'recovery-key-unavailable');
  assert.deepEqual(await api.activateAdventureRestore(uid, review.request), activated);
  assert.equal(
    (await api.getAdventureRestore(uid, { restoreId: p.restoreId, jobToken: p.jobToken })).state,
    'activated',
  );
  assert.equal((await admin.collection(jobRef.path + '/chunks').get()).empty, true);
  assert.ok(
    requests.some((r) => r.method === 'advanceAdventureRestoreArchiveCleanup' && r.status === 200),
  );
});
