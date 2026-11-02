import { domainSdkFixture } from './helpers/domainSdkFixture.mjs';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { GenerationError } from '../src/generation.mjs';
import {
  createBookLoreEditOutcomeService,
  setBookLoreEditOutcomeHeaders,
} from '../src/bookLoreEditOutcome.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { adoptionFixture, adoptFixture } from './helpers/bookLoreEditAdoptionFixture.mjs';
import { digest } from '../src/workProgressContracts.mjs';
const previousProject = process.env.GCLOUD_PROJECT;
process.env.GCLOUD_PROJECT = 'demo-writer-lore-edit-outcome';
const { bookLoreEditOutcome } = domainSdkFixture(await import('../src/index.mjs'));
let server, address, input, outcome;
before(async () => {
  const d = adventureImportDb({ nativeUpdates: true }),
    i = { writeId: 'outcome-http', bookId: 'book', loreId: 'entity' },
    editId =
      'lore-edit-' +
      digest({
        domain: 'writer-book-lore-client-job',
        uid: 'author',
        ...i,
        kind: 'lore-edit',
        index: 0,
      }),
    f = await adoptionFixture(d.db, { editId });
  await adoptFixture(f);
  input = { ...i, editId, startHash: f.startHash, sourceToken: f.intent.sourceToken };
  const service = createBookLoreEditOutcomeService({ db: d.db });
  outcome = await service.bookLoreEditOutcome('author', input);
  const app = express();
  app.use(express.json({ limit: '128kb' }));
  app.all('/production', bookLoreEditOutcome);
  // Fixed local Auth only; no valid production ID token or attestation is supplied.
  app.post(
    '/fixture',
    onCall({ enforceAppCheck: false, cors: false }, async (request) => {
      setBookLoreEditOutcomeHeaders('bookLoreEditOutcome', request);
      try {
        return await service.bookLoreEditOutcome('author', request.data);
      } catch (e) {
        if (e instanceof GenerationError) throw new HttpsError(e.code, e.message, e.details);
        throw new HttpsError('unavailable', 'Serviço indisponível.');
      }
    }),
  );
  server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  address = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  server?.closeAllConnections();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (previousProject === undefined) delete process.env.GCLOUD_PROJECT;
  else process.env.GCLOUD_PROJECT = previousProject;
});
const post = (path, data, headers = {}) =>
  fetch(address + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ data }),
  });
for (const token of [null, 'invalid-app-check'])
  test(
    'production callable rejects ' + (token ? 'invalid' : 'missing') + ' App Check',
    async () => {
      const r = await post(
        '/production',
        { ...input, text: 'PRIVATE_TEST' },
        token ? { 'X-Firebase-AppCheck': token } : {},
      );
      assert.equal(r.status, 401);
      const body = await r.text();
      assert.equal(JSON.parse(body).error.status, 'UNAUTHENTICATED');
      assert.equal(body.includes('PRIVATE_TEST'), false);
    },
  );
test('exported callable applies no-store before Auth and closed DTO errors', async () => {
  for (const auth of [undefined, { uid: 'author' }]) {
    const headers = [];
    await assert.rejects(
      () =>
        bookLoreEditOutcome.run({
          auth,
          data: { ...input, text: 'PRIVATE_TEST' },
          rawRequest: { res: { setHeader: (...args) => headers.push(args) } },
        }),
      (e) => {
        assert.equal(e.code, auth ? 'invalid-argument' : 'unauthenticated');
        assert.equal(JSON.stringify(e).includes('PRIVATE_TEST'), false);
        return true;
      },
    );
    assert.deepEqual(
      [...new Map(headers)],
      [
        ['Cache-Control', 'private, no-store'],
        ['Vary', auth ? 'Authorization' : 'Authorization, X-Firebase-AppCheck'],
      ],
    );
  }
});
test('HTTP fixture returns original metadata with private headers and rejects supplied UID', async () => {
  const r = await post('/fixture', input);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'private, no-store');
  assert.equal(r.headers.get('vary'), 'Authorization');
  assert.deepEqual(await r.json(), { result: outcome });
  const bad = await post('/fixture', { ...input, uid: 'victim', text: 'PRIVATE_TEST' });
  assert.equal(bad.status, 400);
  assert.equal((await bad.text()).includes('PRIVATE_TEST'), false);
});
