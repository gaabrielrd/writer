import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { GenerationError } from '../src/generation.mjs';
import {
  createBookLoreEditTransportService,
  setBookLoreEditHeaders,
} from '../src/bookLoreEditTransport.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';

const previousProject = process.env.GCLOUD_PROJECT;
process.env.GCLOUD_PROJECT = 'demo-writer-lore-edit-callable';
const { bookLoreEdit } = await import('../src/index.mjs');
let server, address, service;
before(async () => {
  service = createBookLoreEditTransportService({
    db: adventureImportDb({ nativeUpdates: true }).db,
  });
  const app = express();
  app.use(express.json({ limit: '128kb' }));
  app.all('/production', bookLoreEdit);
  // Authentication is fixed only in this local cache/dispatch harness. It is
  // never evidence of a valid production ID token or App Check attestation.
  app.post(
    '/fixture',
    onCall({ enforceAppCheck: false, cors: false }, async (request) => {
      setBookLoreEditHeaders('bookLoreEdit', request);
      try {
        return await service.bookLoreEdit('author', request.data);
      } catch (error) {
        if (error instanceof GenerationError)
          throw new HttpsError(error.code, error.message, error.details);
        throw new HttpsError('unavailable', 'Serviço temporariamente indisponível.');
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
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  if (previousProject === undefined) delete process.env.GCLOUD_PROJECT;
  else process.env.GCLOUD_PROJECT = previousProject;
});
const call = (path, data, headers = {}) =>
  fetch(address + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ data }),
  });
for (const appCheck of [null, 'invalid-lore-app-check'])
  test(
    'exported callable rejects ' +
      (appCheck ? 'invalid' : 'missing') +
      ' App Check before service or echo',
    async () => {
      const r = await call(
        '/production',
        { method: 'appendBookLoreFieldUpload', input: { bytes: 'PRIVATE_DRAFT_TEST' } },
        appCheck ? { 'X-Firebase-AppCheck': appCheck } : {},
      );
      assert.equal(r.status, 401);
      const text = await r.text(),
        body = JSON.parse(text);
      assert.equal(body.error.status, 'UNAUTHENTICATED');
      assert.equal(body.error.message, 'Unauthenticated'); // SDK error, not the domain auth message
      assert.equal(body.error.details, undefined);
      assert.equal(text.includes('PRIVATE_DRAFT_TEST'), false);
      assert.equal(text.includes('invalid-lore-app-check'), false);
    },
  );
test('exported handler requires authenticated UID and sets private headers before its domain errors', async () => {
  for (const auth of [undefined, { uid: 'author' }]) {
    const headers = [],
      data = { method: 'constructor', input: { bytes: 'PRIVATE_DRAFT_TEST' } };
    await assert.rejects(
      bookLoreEdit.run({
        auth,
        data,
        rawRequest: { res: { setHeader: (...v) => headers.push(v) } },
      }),
      (error) => {
        assert.equal(error.code, auth ? 'invalid-argument' : 'unauthenticated');
        assert.equal(JSON.stringify(error).includes('PRIVATE_DRAFT_TEST'), false);
        return true;
      },
    );
    assert.deepEqual(headers, [
      ['Cache-Control', 'private, no-store'],
      ['Vary', 'Authorization'],
    ]);
  }
});
test('real callable HTTP fixture preserves private cache headers and literal metadata across cancel/retry/get', async () => {
  const input = {
      uploadId: 'lore-field-' + 'a'.repeat(64),
      startHash: 'b'.repeat(64),
      operationId: 'fixture-cancel',
    },
    data = { method: 'cancelBookLoreFieldUpload', input };
  const first = await call('/fixture', data);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('cache-control'), 'private, no-store');
  assert.equal(first.headers.get('vary'), 'Authorization');
  const body = await first.json();
  assert.equal(body.result.progress.phase, 'cancelled');
  assert.equal(body.result.progress.jobToken, null);
  const again = await call('/fixture', data);
  assert.deepEqual(await again.json(), body);
  const last = await call('/fixture', {
    method: 'getBookLoreFieldUpload',
    input: { uploadId: input.uploadId, startHash: input.startHash },
  });
  assert.equal(last.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await last.json(), { result: body.result.progress });
});
test('real callable HTTP fixture rejects reserved IDs and body UID spoofing without echo or mutation', async () => {
  for (const data of [
    {
      method: 'cancelBookLoreFieldUpload',
      input: { uploadId: 'analysis-field-' + 'a'.repeat(64), bytes: 'PRIVATE_DRAFT_TEST' },
    },
    {
      method: 'getBookLoreFieldUpload',
      input: { uploadId: 'lore-field-' + 'a'.repeat(64) },
      uid: 'victim',
    },
  ]) {
    const r = await call('/fixture', data),
      text = await r.text();
    assert.equal(r.status, 400);
    assert.equal(r.headers.get('cache-control'), 'private, no-store');
    assert.equal(JSON.parse(text).error.status, 'INVALID_ARGUMENT');
    assert.equal(text.includes('PRIVATE_DRAFT_TEST'), false);
    assert.equal(text.includes('analysis-field-'), false);
    assert.equal(text.includes('victim'), false);
  }
});

test('exported callable answers browser CORS preflight before token verification without dispatching a unit', async () => {
  const origin = 'http://127.0.0.1:5173',
    response = await fetch(address + '/production', {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,authorization,x-firebase-appcheck',
      },
    });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.ok(response.headers.get('access-control-allow-methods').includes('POST'));
  const allowed = response.headers.get('access-control-allow-headers').toLowerCase();
  for (const header of ['content-type', 'authorization', 'x-firebase-appcheck'])
    assert.ok(allowed.includes(header));
  assert.equal(await response.text(), '');
});
