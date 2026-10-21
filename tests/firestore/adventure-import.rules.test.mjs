import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, query, limit, setDoc } from 'firebase/firestore';
import { createAdventureImportService } from '../../functions/src/adventureImport.mjs';
import { createAdventureImportRecoveryHandler } from '../../functions/src/adventureImportRecovery.mjs';
import { createStudioService } from '../../functions/src/studio.mjs';
import { createScenesService } from '../../functions/src/scenes.mjs';
import { createAdventureBlocksService } from '../../functions/src/adventureBlocks.mjs';
import { workSourceKey, workGroupKey } from '../../functions/src/workProgressLedger.mjs';

const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const { Firestore } = requireFunctions('firebase-admin/firestore');
const express = requireFunctions('express');
const { onRequest } = requireFunctions('firebase-functions/v2/https');
const projectId = 'demo-writer-adventure-import-tests';
const uid = 'adventure-import-sdk-owner';
const intruder = 'adventure-import-sdk-intruder';
const previousMetadata = process.env.METADATA_SERVER_DETECTION;
const op = (name) => 'adventure-import-sdk-' + name;
const reason = (value) => (error) => error.details?.reason === value;
const sorted = (v) =>
  Array.isArray(v)
    ? v.map(sorted)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sorted(v[k])]),
        )
      : v;
const B = (v) => createHash('sha256').update(v, 'utf8').digest('hex');
const D = (v) => B(JSON.stringify(sorted(v)));
const id = (f, index, kind) => D({ version: 1, uid, importId: f.input.operationId, index, kind });
const prose = '<p>SEGREDO DA REVISAO 🐉 ação e café.</p>\n';
let environment, admin;
before(async () => {
  process.env.METADATA_SERVER_DETECTION = 'none';
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!address) throw Error('Use somente emulador demo.');
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
});
beforeEach(() => environment.clearFirestore());
after(async () => {
  await admin?.terminate();
  await environment?.cleanup();
  if (previousMetadata === undefined) delete process.env.METADATA_SERVER_DETECTION;
  else process.env.METADATA_SERVER_DETECTION = previousMetadata;
});
function review(name, count = 2) {
  const sections = Array.from({ length: count }, (_, index) => ({
    title: 'Seção ' + String(index).padStart(2, '0'),
    content: prose + '<p>Índice ' + index + '</p>',
  }));
  const project = {
    title: 'Aventura ' + name,
    synopsis: 'SINOPSE PARTICULAR NAO LISTAR',
    universeId: null,
  };
  const source = {
    mediaType: 'text/markdown',
    sha256: B('source-synthetic-' + name),
    byteLength: 50,
  };
  let chain = D({ version: 1, kind: 'adventure-import-sections' });
  for (const [index, section] of sections.entries())
    chain = D({
      version: 1,
      previous: chain,
      index,
      title: section.title,
      bodyHash: B(section.content),
      bodyBytes: Buffer.byteLength(section.content),
    });
  const totalBodyBytes = sections.reduce((sum, s) => sum + Buffer.byteLength(s.content), 0);
  const input = {
    operationId: op(name),
    project,
    source,
    sectionCount: count,
    totalBodyBytes,
    reviewHash: D({
      version: 1,
      project,
      source,
      sectionCount: count,
      totalBodyBytes,
      sectionsHash: chain,
    }),
  };
  return {
    input,
    sections,
    chain,
    requestHash: D({ action: 'startAdventureImport', request: input }),
  };
}
async function start(name, count = 2, db = admin) {
  const f = { ...review(name, count), api: createAdventureImportService({ db }), serial: 0 };
  const outcome = await f.api.startAdventureImport(uid, f.input);
  assert.equal(outcome.kind, 'confirmed');
  f.progress = outcome.progress;
  f.start = outcome;
  return f;
}
const scope = (f) => ({ importId: f.progress.importId, jobToken: f.progress.jobToken });
const mutation = (f, name) => ({
  ...scope(f),
  operationId: op(B(f.input.operationId).slice(0, 16) + '-' + name + '-' + ++f.serial),
  expectedCheckpoint: f.progress.checkpoint,
});
async function key(f) {
  const result = await f.api.getAdventureImportRecoveryKey(uid, {
    ...scope(f),
    reviewHash: f.input.reviewHash,
    expectedKeyId: f.progress.keyId,
  });
  assert.equal(result.keyId, f.progress.keyId);
  assert.equal(Buffer.from(result.keyBase64, 'base64').length, 32);
  return result;
}
async function append(f, count = f.sections.length) {
  for (let index = f.progress.uploadedSections; index < count; index++) {
    const result = await f.api.appendAdventureImportSection(uid, {
      ...mutation(f, 'append'),
      index,
      section: f.sections[index],
    });
    f.progress = result.progress;
  }
}
async function prepare(f) {
  while (f.progress.state === 'preparing')
    f.progress = (await f.api.advanceAdventureImport(uid, mutation(f, 'prepare'))).progress;
  assert.equal(f.progress.state, 'ready');
}
function noPrivate(value) {
  const text = JSON.stringify(value);
  for (const forbidden of [
    'SEGREDO DA REVISAO',
    'SINOPSE PARTICULAR NAO LISTAR',
    'keyBase64',
    'ciphertext',
    '<p>',
  ])
    assert.equal(text.includes(forbidden), false, 'metadata não contém ' + forbidden);
}
function observeDb(db) {
  const writes = [],
    bodyReads = [];
  return {
    writes,
    bodyReads,
    db: new Proxy(db, {
      get(target, property) {
        if (property === 'runTransaction')
          return (work) =>
            target.runTransaction((tx) => {
              const batch = [];
              writes.push(batch);
              return work(
                new Proxy(tx, {
                  get(transaction, member) {
                    if (['set', 'create', 'update', 'delete'].includes(member))
                      return (ref, ...args) => {
                        batch.push({ method: member, path: ref.path });
                        return transaction[member](ref, ...args);
                      };
                    if (member === 'get')
                      return (ref, ...args) => {
                        if (/\/body\//.test(ref.path ?? '')) bodyReads.push(ref.path);
                        return transaction.get(ref, ...args);
                      };
                    if (member === 'getAll')
                      return (...args) => {
                        const mask = args.at(-1)?.fieldMask;
                        for (const ref of args.filter((value) => value?.path))
                          if (/\/body\//.test(ref.path) && (!mask || mask.includes('content')))
                            bodyReads.push(ref.path);
                        return transaction.getAll(...args);
                      };
                    const value = Reflect.get(transaction, member);
                    return typeof value === 'function' ? value.bind(transaction) : value;
                  },
                }),
              );
            });
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }),
  };
}
async function http(f) {
  const handler = createAdventureImportRecoveryHandler({
    service: f.api,
    verifyIdToken: async (token) => {
      if (token !== 'owner-token') throw Error('invalid token');
      return { uid };
    },
    verifyAppCheck: async (token) => {
      if (token !== 'app-token') throw Error('invalid app');
      return { appId: 'synthetic-app' };
    },
  });
  const app = express();
  app.use(
    express.raw({
      type: 'text/plain',
      limit: '100kb',
      verify(req, _res, buffer) {
        req.rawBody = buffer;
      },
    }),
  );
  app.use(onRequest({ cors: false }, handler));
  const server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = 'http://127.0.0.1:' + server.address().port;
  try {
    const input = { ...scope(f), reviewHash: f.input.reviewHash, expectedKeyId: f.progress.keyId };
    for (const specimen of [
      { status: 200 },
      { status: 405, method: 'GET' },
      { status: 401, auth: '' },
      { status: 401, auth: 'Bearer invalid' },
      { status: 401, app: '' },
      { status: 401, app: 'invalid' },
      { status: 400, body: '{malformed' },
      { status: 400, body: ' '.repeat(8193) },
      { status: 412, body: JSON.stringify({ ...input, expectedKeyId: 'f'.repeat(64) }) },
    ]) {
      const method = specimen.method ?? 'POST';
      const response = await fetch(address, {
        method,
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8',
          Authorization: specimen.auth ?? 'Bearer owner-token',
          'X-Firebase-AppCheck': specimen.app ?? 'app-token',
        },
        ...(method === 'POST' ? { body: specimen.body ?? JSON.stringify(input) } : {}),
      });
      assert.equal(response.status, specimen.status);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.match(response.headers.get('content-type'), /application\/json/);
      const json = await response.json();
      if (specimen.status === 200) assert.equal(json.data.algorithm, 'AES-GCM');
      else {
        assert.ok(json.error.details.reason);
        assert.equal(JSON.stringify(json).includes('keyBase64'), false);
      }
      if (method === 'GET') assert.equal(response.headers.get('allow'), 'POST');
    }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('I família 1: SDK direto fechado, raiz ausente, reserva Studio e chave HTTP real no-store', async () => {
  const f = await start('privacy');
  const A = f.progress.adventureId;
  assert.equal(A, D({ version: 1, uid, importId: f.input.operationId, kind: 'adventure-import' }));
  const control = await admin.doc(`users/${uid}/adventureImports/${f.progress.importId}`).get();
  assert.equal(
    f.progress.jobToken,
    D({
      version: 1,
      uid,
      importId: f.progress.importId,
      createTime: {
        seconds: control.createTime.seconds,
        nanoseconds: control.createTime.nanoseconds,
      },
    }),
  );
  assert.equal((await admin.doc('adventures/' + A).get()).exists, false);
  for (const actor of [uid, intruder])
    await assert.rejects(
      createStudioService({ db: admin }).createAdventure(actor, {
        operationId: A,
        title: 'Não tomar a reserva',
      }),
    );
  for (const actor of [null, intruder]) {
    await assert.rejects(f.api.getAdventureImport(actor, scope(f)));
    await assert.rejects(
      f.api.getAdventureImportRecoveryKey(actor, { ...scope(f), reviewHash: f.input.reviewHash }),
    );
    await assert.rejects(
      f.api.appendAdventureImportSection(actor, {
        ...mutation(f, 'intruder'),
        index: 0,
        section: f.sections[0],
      }),
    );
  }
  await key(f);
  await append(f, 1);
  const paths = [
    ['adventureImportReservations', A],
    ['users/' + uid + '/adventureImports', f.progress.importId],
    ['users/' + uid + '/adventureImports/' + f.progress.importId + '/sections', '0000000000000000'],
    ['users/' + uid + '/adventureImportRecoveryKeys', f.progress.importId],
    ['users/' + uid + '/adventureImportOperations', f.input.operationId],
    ['users/' + uid + '/adventureImportStartFences', f.input.operationId],
    ['adventures/' + A + '/scenes/' + id(f, 0, 'scene') + '/body', 'current'],
  ];
  for (const actor of [uid, intruder, null]) {
    const sdk = actor
      ? environment.authenticatedContext(actor).firestore()
      : environment.unauthenticatedContext().firestore();
    for (const [parent, name] of paths) {
      await assertFails(getDoc(doc(sdk, parent, name)));
      await assertFails(getDocs(query(collection(sdk, parent), limit(1))));
      await assertFails(setDoc(doc(sdk, parent, name), { takeover: true }));
    }
  }
  noPrivate(await f.api.getAdventureImport(uid, scope(f)));
  noPrivate(await f.api.listAdventureImports(uid, { view: 'all' }));
  noPrivate(f.start);
  await http(f);
});

test('I família 2: mais de 25 seções, páginas vazias, ativação N partes/cenas/principais privados', async () => {
  const f = await start('pagination', 27);
  await key(f);
  await append(f);
  await prepare(f);
  assert.equal(f.progress.uploadedBodyBytes, f.input.totalBodyBytes);
  assert.equal(f.progress.uploadedChainHash, f.chain);
  assert.equal(f.progress.preparedSections, 27);
  const A = f.progress.adventureId;
  assert.equal((await admin.doc('adventures/' + A).get()).exists, false);
  const stagedSceneId = id(f, 0, 'scene'),
    stagedPartId = id(f, 0, 'part');
  assert.equal(
    await createScenesService({ db: admin }).getScene(uid, {
      target: { kind: 'adventure', id: A },
      sceneId: stagedSceneId,
    }),
    null,
  );
  for (const actor of [uid, intruder, null]) {
    const sdk = actor
      ? environment.authenticatedContext(actor).firestore()
      : environment.unauthenticatedContext().firestore();
    for (const path of [
      `adventures/${A}/scenes/${stagedSceneId}`,
      `adventures/${A}/parts/${stagedPartId}`,
      `adventures/${A}/scenes/${stagedSceneId}/body/current`,
      `adventures/${A}/scenes/${stagedSceneId}/planning/current`,
    ])
      await assertFails(getDoc(doc(sdk, path)));
    for (const path of [`adventures/${A}/scenes`, `adventures/${A}/parts`])
      await assertFails(getDocs(query(collection(sdk, path), limit(1))));
  }
  const activation = await f.api.activateAdventureImport(uid, mutation(f, 'activate'));
  f.progress = activation.progress;
  assert.equal(f.progress.state, 'activated');
  assert.deepEqual(f.progress.result, { adventureId: A, revision: 1 });
  const root = (await admin.doc('adventures/' + A).get()).data();
  assert.equal(root.synopsis, f.input.project.synopsis, 'a raiz conserva a sinopse integral');
  const terminalControl = (
    await admin.doc(`users/${uid}/adventureImports/${f.progress.importId}`).get()
  ).data();
  assert.equal(Object.hasOwn(terminalControl.project, 'synopsis'), false);
  noPrivate(terminalControl);
  const terminalReplay = await f.api.startAdventureImport(uid, f.input);
  assert.deepEqual(terminalReplay.receipt, f.start.receipt);
  assert.equal(terminalReplay.progress.state, 'activated');
  noPrivate(terminalReplay);

  assert.equal(root.editorialState, 'draft');
  assert.equal(root.language, 'pt-BR');
  assert.equal(root.origin.kind, 'imported');
  assert.equal(root.origin.reviewHash, f.input.reviewHash);
  const parts = await admin.collection('adventures/' + A + '/parts').get();
  const scenes = await admin.collection('adventures/' + A + '/scenes').get();
  assert.equal(parts.size, 27);
  assert.equal(scenes.size, 27);
  const scenesApi = createScenesService({ db: admin });
  const blocksApi = createAdventureBlocksService({ db: admin });
  for (let index = 0; index < 27; index++) {
    const sceneId = id(f, index, 'scene'),
      partId = id(f, index, 'part');
    const scene = await scenesApi.getScene(uid, { target: { kind: 'adventure', id: A }, sceneId });
    assert.equal(scene.content, f.sections[index].content);
    assert.equal(scene.parentId, partId);
    const blocks = await blocksApi.listAdventureBlocks(uid, { adventureId: A, sceneId });
    assert.equal(blocks.items.length, 1);
    assert.equal(blocks.items[0].resource.kind, 'scene');
    assert.equal(blocks.items[0].audience, 'creator');
    assert.equal(blocks.items[0].narrativeType, 'scene');
    assert.equal((await admin.collection(`adventures/${A}/sceneBlocks`).get()).size, 0);
  }
  assert.equal(
    (await admin.doc(`adventures/${A}/workProgress/current`).get()).data().countReady,
    true,
  );
  assert.equal(
    (await admin.doc(`users/${uid}/adventureImportRecoveryKeys/${f.progress.importId}`).get())
      .exists,
    false,
  );
  await assert.rejects(key(f));
  await assert.rejects(f.api.cancelAdventureImport(uid, mutation(f, 'cancel-activated')));
  assert.equal((await admin.doc('adventures/' + A).get()).exists, true);
  // Public pages contain metadata only; pending deliberately scans through terminal windows.
  for (let n = 0; n < 27; n++) await start('window-' + String(n).padStart(2, '0'));
  const seen = [];
  let cursor = null,
    pages = 0;
  do {
    const page = await f.api.listAdventureImports(uid, { view: 'all', limit: 25, cursor });
    noPrivate(page);
    assert.ok(page.items.length <= 25);
    seen.push(...page.items.map((x) => x.importId));
    cursor = page.nextCursor;
    pages++;
  } while (cursor && pages < 10);
  assert.equal(cursor, null);
  assert.equal(new Set(seen).size, 28);
  assert.ok(pages > 1);
  const all = await f.api.listAdventureImports(uid, { view: 'all', limit: 1 });
  assert.ok(all.nextCursor);
  await assert.rejects(
    f.api.listAdventureImports(uid, { view: 'pending', limit: 1, cursor: all.nextCursor }),
  );
  await assert.rejects(
    f.api.listAdventureImports(intruder, { view: 'all', limit: 1, cursor: all.nextCursor }),
  );
  // Make the first window terminal without mutating canonical descriptors/counters.
  const pending = await f.api.listAdventureImports(uid, { view: 'pending', limit: 1 });
  const first = pending.items[0];
  assert.ok(first);
  let current = (
    await f.api.cancelAdventureImport(uid, {
      importId: first.importId,
      jobToken: first.jobToken,
      operationId: op('empty-cancel'),
      expectedCheckpoint: first.checkpoint,
    })
  ).progress;
  while (current.state === 'deleting')
    current = (
      await f.api.advanceAdventureImport(uid, {
        importId: current.importId,
        jobToken: current.jobToken,
        operationId: op('empty-clean-' + current.checkpoint),
        expectedCheckpoint: current.checkpoint,
      })
    ).progress;
  const empty = await f.api.listAdventureImports(uid, { view: 'pending', limit: 1 });
  assert.deepEqual(empty.items, []);
  assert.ok(empty.nextCursor);
});

test('I família 3: retries históricos, start incerto, payload/CAS imutáveis e chave sem rotação', async () => {
  const f = await start('recovery');
  const bootstrap = await f.api.getAdventureImport(uid, { importId: f.input.operationId });
  assert.equal(bootstrap.jobToken, f.progress.jobToken);
  const initialKey = await key(f);
  assert.equal((await key(f)).keyBase64, initialKey.keyBase64);
  const before = f.progress.checkpoint;
  const appendInput = { ...mutation(f, 'lost-append'), index: 0, section: f.sections[0] };
  // Drop only the response, after the real Admin transaction committed.
  const committed = await f.api.appendAdventureImportSection(uid, appendInput);
  const recognized = await f.api.appendAdventureImportSection(uid, appendInput);
  assert.deepEqual(recognized.receipt, committed.receipt);
  assert.equal(recognized.progress.uploadedSections, 1);
  assert.equal(recognized.progress.checkpoint, before + 1);
  f.progress = recognized.progress;
  await assert.rejects(
    f.api.appendAdventureImportSection(uid, {
      ...appendInput,
      section: { ...f.sections[0], content: 'alterado' },
    }),
  );
  await assert.rejects(
    f.api.appendAdventureImportSection(uid, { ...appendInput, operationId: op('stale-cas') }),
    reason('checkpoint-conflict'),
  );
  const next = { ...mutation(f, 'concurrent'), index: 1, section: f.sections[1] };
  const rival = { ...next, operationId: op('rival-append') };
  const races = await Promise.allSettled([
    f.api.appendAdventureImportSection(uid, next),
    f.api.appendAdventureImportSection(uid, rival),
  ]);
  assert.equal(races.filter((x) => x.status === 'fulfilled').length, 1);
  f.progress = await f.api.getAdventureImport(uid, scope(f));
  await prepare(f);
  const historical = await f.api.appendAdventureImportSection(uid, appendInput);
  assert.equal(historical.receipt.state, 'uploading');
  assert.equal(historical.progress.state, 'ready');
  const cancelInput = mutation(f, 'cancel-after-recovery');
  f.progress = (await f.api.cancelAdventureImport(uid, cancelInput)).progress;
  const afterCancel = await f.api.startAdventureImport(uid, f.input);
  assert.deepEqual(afterCancel.receipt, f.start.receipt);
  assert.equal(afterCancel.progress.state, 'deleting');
  await assert.rejects(key(f));
  // Metadata-only resolver needs no project/synopsis in the pre-seal journal.
  const never = review('never-sent');
  const canceled = await f.api.resolveAdventureImportStart(uid, {
    operationId: never.input.operationId,
    requestHash: never.requestHash,
    intent: 'cancel',
  });
  assert.equal(canceled.kind, 'canceled');
  assert.equal('jobToken' in canceled, false);
  assert.deepEqual(await f.api.startAdventureImport(uid, never.input), canceled);
  await assert.rejects(
    f.api.startAdventureImport(uid, {
      ...never.input,
      project: { ...never.input.project, synopsis: 'diferente' },
    }),
  );
  const existing = await f.api.resolveAdventureImportStart(uid, {
    operationId: f.input.operationId,
    requestHash: f.requestHash,
    intent: 'cancel',
  });
  assert.equal(existing.kind, 'confirmed');
  assert.equal(existing.progress.state, 'deleting');
  // A corrupt marker is not permission to generate another raw key.
  const mismatch = await start('hash-mismatch', 1);
  await key(mismatch);
  await assert.rejects(
    mismatch.api.appendAdventureImportSection(uid, {
      ...mutation(mismatch, 'bad-final-hash'),
      index: 0,
      section: { ...mismatch.sections[0], content: prose + 'OUTRA REVISAO' },
    }),
    reason('review-mismatch'),
  );
  assert.equal((await mismatch.api.getAdventureImport(uid, scope(mismatch))).uploadedSections, 0);
  assert.equal(
    (
      await admin
        .doc(
          `adventures/${mismatch.progress.adventureId}/scenes/${id(mismatch, 0, 'scene')}/body/current`,
        )
        .get()
    ).exists,
    false,
  );
  const broken = await start('broken-key');
  await key(broken);
  await admin.doc(`users/${uid}/adventureImportRecoveryKeys/${broken.progress.importId}`).delete();
  await assert.rejects(key(broken), reason('inconsistent'));
});

test('I família 4: cancel/fence, limpeza retomável ≤50 escritas e corrida activate preserva obra', async () => {
  const observed = observeDb(admin);
  const f = await start('cleanup', 8, observed.db);
  await key(f);
  await append(f);
  f.progress = (await f.api.advanceAdventureImport(uid, mutation(f, 'first-prepared'))).progress;
  const A = f.progress.adventureId;
  await admin
    .doc('adventures/unrelated-adventure')
    .set({ ownerId: uid, content: 'PRESERVAR OUTRA OBRA' });
  const late = {
    ...mutation(f, 'late-append'),
    index: 8,
    section: { title: 'não admitir', content: prose },
  };
  const cancelInput = mutation(f, 'cancel');
  f.progress = (await f.api.cancelAdventureImport(uid, cancelInput)).progress;
  await assert.rejects(f.api.appendAdventureImportSection(uid, late));
  await assert.rejects(f.api.activateAdventureImport(uid, mutation(f, 'late-activate')));
  const boundary = observed.writes.length,
    reads = observed.bodyReads.length;
  const cleanupInput = mutation(f, 'cleanup-lost');
  const committed = await f.api.advanceAdventureImport(uid, cleanupInput);
  f.progress = committed.progress;
  assert.equal(f.progress.state, 'deleting');
  assert.equal(f.progress.cleanedSections, 6);
  assert.deepEqual(
    (await f.api.advanceAdventureImport(uid, cleanupInput)).receipt,
    committed.receipt,
  );
  while (f.progress.state === 'deleting')
    f.progress = (await f.api.advanceAdventureImport(uid, mutation(f, 'resume-cleanup'))).progress;
  assert.equal(f.progress.state, 'deleted');
  assert.equal(f.progress.cleanupComplete, true);
  const terminalControl = (
    await admin.doc(`users/${uid}/adventureImports/${f.progress.importId}`).get()
  ).data();
  assert.equal(Object.hasOwn(terminalControl.project, 'synopsis'), false);
  noPrivate(terminalControl);
  const terminalReplay = await f.api.startAdventureImport(uid, f.input);
  assert.deepEqual(terminalReplay.receipt, f.start.receipt);
  assert.equal(terminalReplay.progress.state, 'deleted');
  noPrivate(terminalReplay);

  assert.ok(observed.writes.slice(boundary).every((writes) => writes.length <= 50));
  assert.equal(observed.bodyReads.length, reads, 'cleanup não carrega prosa');
  for (let index = 0; index < 8; index++) {
    const S = id(f, index, 'scene'),
      P = id(f, index, 'part');
    for (const path of [
      `users/${uid}/adventureImports/${f.progress.importId}/sections/${String(index).padStart(16, '0')}`,
      `adventures/${A}/parts/${P}`,
      `adventures/${A}/scenes/${S}`,
      `adventures/${A}/scenes/${S}/body/current`,
      `adventures/${A}/scenes/${S}/planning/current`,
      `adventures/${A}/workWordSources/${workSourceKey('scene', S)}`,
      `adventures/${A}/workWordGroups/${workGroupKey({ kind: 'adventure' }, P)}`,
    ])
      assert.equal((await admin.doc(path).get()).exists, false, path);
  }
  assert.equal((await admin.doc(`adventures/${A}/workProgress/current`).get()).exists, false);
  assert.equal((await admin.doc('adventures/' + A).get()).exists, false);
  assert.equal(
    (await admin.doc('adventures/unrelated-adventure').get()).data().content,
    'PRESERVAR OUTRA OBRA',
  );
  assert.equal((await admin.doc('adventureImportReservations/' + A).get()).exists, true);
  await assert.rejects(
    createStudioService({ db: admin }).createAdventure(uid, { operationId: A, title: 'Reusar' }),
  );
  const recreated = await start('recreated-control');
  const jobRef = admin.doc(`users/${uid}/adventureImports/${recreated.progress.importId}`);
  const oldJob = (await jobRef.get()).data();
  const reservation = await admin
    .doc('adventureImportReservations/' + recreated.progress.adventureId)
    .get();
  assert.equal(reservation.createTime.seconds, (await jobRef.get()).createTime.seconds);
  assert.equal(reservation.createTime.nanoseconds, (await jobRef.get()).createTime.nanoseconds);
  await jobRef.delete();
  await jobRef.set(oldJob);
  await assert.rejects(
    recreated.api.getAdventureImport(uid, { importId: recreated.progress.importId }),
  );
  await assert.rejects(recreated.api.getAdventureImport(uid, scope(recreated)));
  await assert.rejects(key(recreated));
  const won = await start('activate-race');
  await key(won);
  await append(won);
  await prepare(won);
  const activate = mutation(won, 'race-activate'),
    cancel = mutation(won, 'race-cancel');
  const outcomes = await Promise.allSettled([
    won.api.activateAdventureImport(uid, activate),
    won.api.cancelAdventureImport(uid, cancel),
  ]);
  assert.equal(outcomes.filter((x) => x.status === 'fulfilled').length, 1);
  won.progress = await won.api.getAdventureImport(uid, scope(won));
  if (won.progress.state === 'activated') {
    assert.equal((await admin.doc('adventures/' + won.progress.adventureId).get()).exists, true);
    await assert.rejects(won.api.cancelAdventureImport(uid, mutation(won, 'cancel-activated')));
    assert.equal((await admin.doc('adventures/' + won.progress.adventureId).get()).exists, true);
  } else {
    assert.equal(won.progress.state, 'deleting');
    await assert.rejects(won.api.activateAdventureImport(uid, mutation(won, 'activate-canceled')));
    assert.equal((await admin.doc('adventures/' + won.progress.adventureId).get()).exists, false);
  }
});
