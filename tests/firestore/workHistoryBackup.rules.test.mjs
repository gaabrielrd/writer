import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { createWorkHistoryService } from '../../functions/src/workHistory.mjs';
import { digest, splitHistoryContent } from '../../functions/src/workHistoryContracts.mjs';

const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const { Firestore } = requireFunctions('firebase-admin/firestore');
const projectId = 'demo-writer-history-backup-stream',
  target = { kind: 'book', id: 'book' };
const large = 'ação 🌙\u0000'.repeat(12000);
let environment, admin, history;
const previousMetadata = process.env.METADATA_SERVER_DETECTION;
const source = () => history.getWorkHistoryBackupSource('author', { target });
const list = (extra = {}, uid = 'author') =>
  history.listWorkVersions(uid, { target, limit: 20, ...extra });
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? ''))
    throw new Error('Use somente emulador local demo.');
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
  history = createWorkHistoryService({ db: admin, now: () => 5000 });
});
beforeEach(async () => {
  await environment.clearFirestore();
  const batch = admin.batch();
  batch.set(admin.doc('books/book'), {
    authorId: 'author',
    title: 'Livro',
    status: 'draft',
    createdAt: 1,
    updatedAt: 2,
    wordCount: 1,
    historyRevision: 55,
  });
  batch.set(admin.doc('books/book/chapters/current'), {
    title: 'Atual',
    order: 1,
    content: '<p>Atual</p>',
    wordCount: 1,
    createdAt: 1,
    updatedAt: 2,
  });
  for (let i = 0; i < 55; i++) {
    const id = 'version-' + String(i).padStart(3, '0'),
      resource = { kind: i % 2 ? 'scene' : 'chapter', id: 'removed-' + i },
      content = i ? '' : large,
      chunks = splitHistoryContent(content);
    batch.set(admin.doc('books/book/workVersions/' + id), {
      schemaVersion: 1,
      id,
      target,
      resource,
      createdAt: 1000 + i,
      reason: i % 2 ? 'before-restore' : 'manual',
      label: i % 2 ? 'Anterior' : null,
      wordCount: 0,
      byteLength: Buffer.byteLength(content),
      contentHash: digest(content),
      chunkCount: chunks.length,
      resourceKey: digest(resource),
      deleting: false,
    });
    chunks.forEach((text, index) =>
      batch.set(admin.doc('books/book/workVersionBodies/' + digest({ versionId: id, index })), {
        versionId: id,
        index,
        content: text,
      }),
    );
  }
  await batch.commit();
});
after(async () => {
  await admin?.terminate();
  await environment?.cleanup();
  if (previousMetadata === undefined) delete process.env.METADATA_SERVER_DETECTION;
  else process.env.METADATA_SERVER_DETECTION = previousMetadata;
});
test('ID order enumerates all 55 real stored versions despite absent resources and date order; no writes', async () => {
  const initial = await source(),
    rootBefore = await admin.doc('books/book').get(),
    ids = [];
  let cursor = null;
  do {
    const page = await list({ order: 'id', cursor, expectedHistoryToken: initial.sourceToken });
    ids.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor;
  } while (cursor);
  assert.deepEqual(
    ids,
    Array.from({ length: 55 }, (_, i) => 'version-' + String(i).padStart(3, '0')),
  );
  assert.ok(rootBefore.updateTime.isEqual((await admin.doc('books/book').get()).updateTime));
  let body = '',
    bodyCursor = null;
  do {
    const page = await history.readWorkVersion('author', {
      target,
      versionId: ids[0],
      cursor: bodyCursor,
      limit: 1,
      expectedHistoryToken: initial.sourceToken,
    });
    body += page.chunks.map((part) => part.content).join('');
    bodyCursor = page.nextCursor;
  } while (bodyCursor);
  assert.equal(body, large);
});
test('legacy date cursor keeps working; ID/date/resource cursor scopes cannot be crossed', async () => {
  const initial = await list({ limit: 2 }),
    byId = await list({ limit: 2, order: 'id' });
  assert.deepEqual(
    initial.items.map((item) => item.id),
    ['version-054', 'version-053'],
  );
  assert.deepEqual(
    (await list({ limit: 2, cursor: initial.nextCursor })).items.map((item) => item.id),
    ['version-052', 'version-051'],
  );
  assert.deepEqual(
    byId.items.map((item) => item.id),
    ['version-000', 'version-001'],
  );
  await assert.rejects(list({ order: 'id', cursor: initial.nextCursor }), {
    code: 'invalid-argument',
  });
  await assert.rejects(list({ cursor: byId.nextCursor }), { code: 'invalid-argument' });
  await assert.rejects(
    list({ order: 'id', cursor: byId.nextCursor, resource: { kind: 'chapter', id: 'removed-0' } }),
    { code: 'invalid-argument' },
  );
});
test('actual manual creation between pages invalidates ID backup source and replay creates no extra version', async () => {
  const initial = await source(),
    page = await list({ order: 'id', expectedHistoryToken: initial.sourceToken });
  const resource = { kind: 'chapter', id: 'current' };
  const current = await history.getWorkVersionSource('author', { target, resource });
  const input = {
    target,
    resource,
    operationId: 'history-backup-create',
    expectedSourceToken: current.sourceToken,
  };
  await history.createWorkVersion('author', input);
  await assert.rejects(
    list({ order: 'id', cursor: page.nextCursor, expectedHistoryToken: initial.sourceToken }),
    { details: { reason: 'history-snapshot-changed' } },
  );
  const next = await source();
  await history.createWorkVersion('author', input);
  assert.deepEqual(await source(), next);
});
test('actual deletion between pages invalidates source; removed version is not silently retained in new selection', async () => {
  const initial = await source(),
    page = await list({ order: 'id', expectedHistoryToken: initial.sourceToken });
  await history.deleteWorkVersion('author', {
    target,
    versionId: 'version-001',
    operationId: 'history-backup-delete',
  });
  await assert.rejects(
    list({ order: 'id', cursor: page.nextCursor, expectedHistoryToken: initial.sourceToken }),
    { details: { reason: 'history-snapshot-changed' } },
  );
  const current = await list({ order: 'id' });
  assert.equal(
    current.items.some((item) => item.id === 'version-001'),
    false,
  );
});
test('ID mode cannot bypass SDK denial, author checks, root deletion or same-ID incarnation', async () => {
  const initial = await source(),
    own = environment.authenticatedContext('author').firestore();
  await assertFails(getDoc(doc(own, 'books/book/workVersions/version-000')));
  for (const uid of [null, 'other'])
    await assert.rejects(list({ order: 'id', expectedHistoryToken: initial.sourceToken }, uid), {
      code: uid ? 'not-found' : 'unauthenticated',
    });
  const ref = admin.doc('books/book'),
    previous = (await ref.get()).data();
  await ref.update({ deleting: true });
  await assert.rejects(list({ order: 'id', expectedHistoryToken: initial.sourceToken }), {
    code: 'not-found',
  });
  await ref.delete();
  await ref.set(previous);
  await assert.rejects(list({ order: 'id', expectedHistoryToken: initial.sourceToken }), {
    details: { reason: 'history-snapshot-changed' },
  });
});
