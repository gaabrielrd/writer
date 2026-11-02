import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { getDoc, doc } from 'firebase/firestore';
import { createBookBackupReadService } from '../../functions/src/bookBackupRead.mjs';
import { createBookBackupResourceService } from '../../functions/src/bookBackupResourceRead.mjs';
import { createScenesService } from '../../functions/src/scenes.mjs';
import { createNarrativePlanningService } from '../../functions/src/narrativePlanning.mjs';
import { digest } from '../../functions/src/sceneContracts.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const { Firestore } = requireFunctions('firebase-admin/firestore');
const projectId = 'demo-writer-backup-resources',
  target = { kind: 'book', id: 'book' },
  text = '\ufeffação 🌙'.repeat(10000);
let environment, admin, root, api, scenes, narrative;
const previous = process.env.METADATA_SERVER_DETECTION;
const source = () => root.getBookBackupSource('author', { bookId: 'book' });
const list = (pin, kind, parentId = null, extra = {}, uid = 'author') =>
  api.listBookBackupResources(uid, {
    bookId: 'book',
    sourceToken: pin.sourceToken,
    kind,
    parentId,
    limit: 50,
    ...extra,
  });
const read = (pin, kind, parentId, item, extra = {}, uid = 'author') =>
  api.readBookBackupResource(uid, {
    bookId: 'book',
    sourceToken: pin.sourceToken,
    kind,
    parentId,
    ...item,
    index: 0,
    ...extra,
  });
const createScene = (id = 'scene', content = text) =>
  scenes.createScene('author', {
    target,
    operationId: 'backup-resource-' + id,
    title: 'Cena',
    content,
    planning: { objective: 'Privado' },
  });
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? '')) throw new Error('Use emulador local demo.');
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
  root = createBookBackupReadService({ db: admin });
  api = createBookBackupResourceService({ db: admin });
  scenes = createScenesService({ db: admin, now: () => 2000 });
  narrative = createNarrativePlanningService({ db: admin, now: () => 3000 });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await admin.doc('books/book').set({
    authorId: 'author',
    title: 'Livro',
    status: 'draft',
    wordCount: 1,
    createdAt: 1,
    updatedAt: 2,
  });
  await admin.doc('books/book/chapters/legacy').set({
    title: 'Original',
    order: 1,
    content: '<p>Original</p>',
    wordCount: 1,
    createdAt: 1,
    updatedAt: 2,
  });
});
after(async () => {
  await admin?.terminate();
  await environment?.cleanup();
  if (previous === undefined) delete process.env.METADATA_SERVER_DETECTION;
  else process.env.METADATA_SERVER_DETECTION = previous;
});
async function body(pin, kind, parentId = null, id = null) {
  const items = (await list(pin, kind, parentId)).items,
    item = id ? items.find((row) => row.id === id) : items[0],
    parts = [];
  let count = 1;
  for (let index = 0; index < count; index++) {
    const chunk = await read(pin, kind, parentId, item, { index });
    count = chunk.chunkCount;
    const bytes = Buffer.from(chunk.chunkBase64, 'base64');
    assert.ok(bytes.length <= 65536);
    parts.push(bytes);
  }
  return JSON.parse(Buffer.concat(parts).toString());
}
test('actual scenes/conversion/narrative writers produce portable text, original source, plans, ordering and neutral external references', async () => {
  const created = await createScene(),
    sceneId = created.scene.id;
  const original = (await admin.doc('books/book/chapters/legacy').get()).data();
  await scenes.convertChapterToScenes('author', {
    target,
    parentId: 'legacy',
    operationId: 'backup-resource-convert',
    expectedSourceVersion: digest(original),
  });
  const arc = await narrative.createNarrativeItem('author', {
    target,
    resource: { kind: 'arc' },
    operationId: 'backup-resource-arc',
    title: 'Arco',
    objective: 'Meta',
  });
  await narrative.createNarrativeItem('author', {
    target,
    resource: { kind: 'milestone', arcId: arc.item.id },
    operationId: 'backup-resource-milestone',
    title: 'Marco',
    notes: 'Notas',
  });
  await narrative.createNarrativeItem('author', {
    target,
    resource: { kind: 'event' },
    operationId: 'backup-resource-event',
    title: 'Evento',
    dateLabel: '3º dia do inverno',
  });
  await admin.doc('books/book').update({ universeId: 'world' });
  await admin.doc('universes/world').set({ authorId: 'author', updatedAt: 1 });
  await admin.doc('universes/world/lore/entity').set({ name: 'MUST NOT COPY', category: 'person' });
  const ref = { kind: 'universe', scopeId: 'world', entityId: 'entity' };
  await scenes.setSceneReference('author', {
    target,
    sceneId,
    operationId: 'backup-resource-ref',
    expectedRevision: 1,
    reference: ref,
  });
  await narrative.setNarrativeReference('author', {
    target,
    source: { kind: 'arc', id: arc.item.id },
    operationId: 'backup-resource-link',
    expectedRevision: 1,
    reference: { kind: 'lore', reference: ref },
  });
  await admin.doc('universes/world/lore/entity').delete();
  const pin = await source(),
    before = await admin.doc('books/book').get();
  assert.equal((await body(pin, 'scene-body', sceneId)).data.content, text);
  assert.equal((await body(pin, 'scene-planning', sceneId)).data.objective, 'Privado');
  assert.equal((await body(pin, 'scene-source')).data.original.content, '<p>Original</p>');
  assert.equal((await body(pin, 'arc')).data.objective, 'Meta');
  assert.equal((await body(pin, 'milestone', arc.item.id)).data.notes, 'Notas');
  assert.equal((await body(pin, 'event')).data.dateLabel, '3º dia do inverno');
  assert.equal(
    JSON.stringify(await body(pin, 'scene-reference', sceneId)).includes('MUST NOT COPY'),
    false,
  );
  assert.equal(JSON.stringify(await body(pin, 'narrative-link')).includes('MUST NOT COPY'), false);
  assert.ok(before.updateTime.isEqual((await admin.doc('books/book').get()).updateTime));
});
test('real metadata masks return no prose but retain native timestamps and token invalidation for body/planning', async () => {
  const created = await createScene(),
    id = created.scene.id,
    pin = await source();
  for (const kind of ['scene-body', 'scene-planning']) {
    const path =
        'books/book/scenes/' +
        id +
        '/' +
        (kind === 'scene-body' ? 'body' : 'planning') +
        '/current',
      ref = admin.doc(path);
    const masked = await admin.runTransaction(
      async (tx) => (await tx.getAll(ref, { fieldMask: [] }))[0],
    );
    assert.deepEqual(masked.data(), {});
    assert.ok(masked.createTime);
    assert.ok(masked.updateTime);
    const item = (await list(pin, kind, id)).items[0];
    await ref.update(kind === 'scene-body' ? { content: 'changed' } : { objective: 'changed' });
    assert.equal((await source()).sourceToken, pin.sourceToken);
    await assert.rejects(read(pin, kind, id, item), {
      details: { reason: 'book-backup-item-changed' },
    });
  }
});
test('real scene/planning and narrative writes invalidate the root source before another page', async () => {
  const created = await createScene(),
    pin = await source();
  await scenes.updateScene('author', {
    target,
    sceneId: created.scene.id,
    operationId: 'backup-resource-update',
    expectedRevision: 1,
    patch: { planning: { objective: 'Novo' } },
  });
  await assert.rejects(list(pin, 'scene'), { details: { reason: 'book-backup-source-changed' } });
  const next = await source();
  await narrative.createNarrativeItem('author', {
    target,
    resource: { kind: 'arc' },
    operationId: 'backup-resource-new-arc',
    title: 'Novo arco',
  });
  await assert.rejects(list(next, 'arc'), { details: { reason: 'book-backup-source-changed' } });
});
test('all scene IDs include archived scenes with missing chapter and each nested call enforces author/parent access', async () => {
  const created = await createScene(),
    id = created.scene.id;
  await admin.doc('books/book/scenes/' + id).update({ parentId: 'gone', archived: true });
  const pin = await source();
  assert.equal((await list(pin, 'scene')).items[0].id, id);
  assert.equal((await body(pin, 'scene')).data.parentId, 'gone');
  assert.equal((await body(pin, 'scene-body', id)).data.content, text);
  for (const uid of [null, 'other']) {
    await assert.rejects(list(pin, 'scene-body', id, {}, uid), {
      code: uid ? 'not-found' : 'unauthenticated',
    });
    const client = uid
      ? environment.authenticatedContext(uid).firestore()
      : environment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(client, 'books/book/scenes/' + id + '/body/current')));
  }
  await admin.doc('books/book/scenes/' + id).update({ ownerId: 'other' });
  await assert.rejects(list(pin, 'scene-reference', id), { code: 'not-found' });
});
test('more than 50 real references paginate with closed parent cursor and missing body fails instead of silently omitting prose', async () => {
  const created = await createScene(),
    id = created.scene.id,
    batch = admin.batch();
  for (let i = 0; i < 105; i++)
    batch.set(admin.doc('books/book/scenes/' + id + '/references/r' + String(i).padStart(3, '0')), {
      kind: 'universe',
      scopeId: 'gone',
      entityId: String(i),
    });
  await batch.commit();
  const pin = await source(),
    ids = [];
  let cursor = null,
    first;
  do {
    const page = await list(pin, 'scene-reference', id, { cursor });
    first ??= page;
    ids.push(...page.items.map((row) => row.id));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(ids.length, 105);
  assert.equal(new Set(ids).size, 105);
  await assert.rejects(list(pin, 'scene-planning', id, { cursor: first.nextCursor }), {
    code: 'invalid-argument',
  });
  await admin.doc('books/book/scenes/' + id + '/body/current').delete();
  await assert.rejects(list(pin, 'scene-body', id), { code: 'failed-precondition' });
});
test('busy controls, deleting root and same-ID root replacement cannot pass', async () => {
  const created = await createScene(),
    id = created.scene.id,
    pin = await source();
  const control = admin.doc('books/book/sceneControls/unassigned');
  await control.update({ rebalancing: true });
  const item = (await list(pin, 'scene-control')).items[0];
  await assert.rejects(read(pin, 'scene-control', null, item), { code: 'failed-precondition' });
  const current = (await admin.doc('books/book').get()).data();
  await admin.doc('books/book').update({ deleting: true });
  await assert.rejects(list(pin, 'scene'), { code: 'not-found' });
  await admin.doc('books/book').delete();
  await admin.doc('books/book').set(current);
  await assert.rejects(list(pin, 'scene'), { details: { reason: 'book-backup-source-changed' } });
  assert.ok(id);
});

test('SDK portable derived control is excluded with complete native cursor pages', async () => {
  const expected = new Set([digest({ kind: 'arc' })]),
    batch = admin.batch();
  batch.set(admin.doc('books/book/narrativeControls/' + digest({ kind: 'arc' })), {
    rankSlot: 'A',
    resource: { kind: 'arc' },
  });
  batch.set(admin.doc('books/book/narrativeControls/entity-scenes'), {
    ready: true,
    sourceRevision: 0,
  });
  for (let n = 0; n < 63; n++) {
    const resource = { kind: 'milestone', arcId: 'native-arc-' + n },
      id = digest(resource);
    expected.add(id);
    batch.set(admin.doc('books/book/narrativeControls/' + id), { rankSlot: 'A', resource });
  }
  await batch.commit();
  const pin = await source();
  for (const limit of [2, 50]) {
    let cursor = null;
    const seen = [];
    do {
      const page = await list(pin, 'narrative-control', null, { cursor, limit });
      assert.ok(page.items.length <= limit);
      if (page.nextCursor) assert.equal(page.items.length, limit);
      seen.push(...page.items.map((row) => row.id));
      cursor = page.nextCursor;
    } while (cursor);
    assert.equal(seen.length, expected.size);
    assert.deepEqual(new Set(seen), expected);
  }
  assert.equal((await admin.doc('books/book/narrativeControls/entity-scenes').get()).exists, true);
});
