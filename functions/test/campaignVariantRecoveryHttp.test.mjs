import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { setCampaignVariantRecoveryHeaders } from '../src/campaignVariantRecoveryHttp.mjs';
let server, address;
before(async () => {
  const app = express();
  app.use(express.json());
  for (const [path, method] of [
    ['/key', 'prepareCampaignLoreVariant'],
    ['/other', 'getCampaignLore'],
  ])
    app.post(
      path,
      onCall({ enforceAppCheck: false, cors: false }, async (request) => {
        setCampaignVariantRecoveryHeaders(method, request);
        if (request.data.fail) throw new HttpsError('not-found', 'Ficha indisponível.');
        return { confirmed: true };
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
});
const call = (path, data = {}) =>
  fetch(address + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });
test('real Firebase callable key handler sends private no-store on success and application errors', async () => {
  const success = await call('/key');
  assert.equal(success.status, 200);
  assert.equal(success.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await success.json(), { result: { confirmed: true } });
  const failure = await call('/key', { fail: true });
  assert.equal(failure.status, 404);
  assert.equal(failure.headers.get('cache-control'), 'private, no-store');
  assert.equal((await failure.json()).error.status, 'NOT_FOUND');
});
test('key HTTP policy leaves other callables unchanged', async () => {
  const response = await call('/other');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), null);
});
