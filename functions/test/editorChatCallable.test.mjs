import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
const previousProject = process.env.GCLOUD_PROJECT;
process.env.GCLOUD_PROJECT = 'demo-writer-editor-chat-callable';
const { editorChat } = await import('../src/index.mjs');
let server, address;
before(async () => {
  const app = express();
  app.use(express.json());
  app.post('/editorChat', editorChat);
  server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  address = 'http://127.0.0.1:' + server.address().port + '/editorChat';
});
after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  if (previousProject === undefined) delete process.env.GCLOUD_PROJECT;
  else process.env.GCLOUD_PROJECT = previousProject;
});
for (const appCheck of [null, 'invalid-test-app-check'])
  test(`exported editorChat callable rejects ${appCheck === null ? 'missing' : 'invalid'} App Check before service`, async () => {
    const response = await fetch(address, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(appCheck ? { 'X-Firebase-AppCheck': appCheck } : {}),
      },
      body: JSON.stringify({
        data: {
          action: 'listConversations',
          target: { kind: 'book', id: 'book' },
          resource: { kind: 'scene', id: 'scene' },
          prompt: 'PRIVATE_TEST_PROMPT',
        },
      }),
    });
    assert.equal(response.status, 401);
    const text = await response.text();
    const body = JSON.parse(text);
    assert.equal(body.error.status, 'UNAUTHENTICATED');
    assert.equal(body.error.message, 'Unauthenticated');
    assert.equal(body.error.details, undefined);
    assert.equal(text.includes('PRIVATE_TEST_PROMPT'), false);
    assert.equal(text.includes('invalid-test-app-check'), false);
  });
