import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { after, before, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  limit,
} from 'firebase/firestore';
import { createEditorChatConversationsService } from '../../functions/src/editorChatConversations.mjs';
import { editorChatModelAnswer } from '../../functions/src/editorChatHistoryRead.mjs';
import { resolveChatGeneration } from '../../functions/src/chatGeneration.mjs';
import { createEditorChatApplyService } from '../../functions/src/editorChatApply.mjs';
import { createWorkProgressService } from '../../functions/src/workProgress.mjs';
import { createEditorChatContextService } from '../../functions/src/editorChatContext.mjs';
import {
  editorChatRequestHash,
  editorChatTextHash,
} from '../../functions/src/editorChatContracts.mjs';
import { createStudioService } from '../../functions/src/studio.mjs';
import { createScenesService } from '../../functions/src/scenes.mjs';
import { createAdventureBlocksService } from '../../functions/src/adventureBlocks.mjs';
import { createWorkHistoryService } from '../../functions/src/workHistory.mjs';
import {
  createUniverseService,
  prepareUniverseProjectLink,
} from '../../functions/src/universes.mjs';

const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const { Firestore } = requireFunctions('firebase-admin/firestore');
const uid = 'apply-author';
const prose = '<p>Aria Mundo</p>';
const afterText = '<p>Texto novo aplicado</p>';
const suggestion = 'Texto novo aplicado';
const privateLore = 'PRIVATE-LORE-ORIGINAL';
const previousMetadata = process.env.METADATA_SERVER_DETECTION;
let environment, admin, scenes, blocks, history, studio, universes, progress, serial;
const op = (name) => `sdk-apply-${name}-${++serial}`;
const reason = (expected) => (error) => error.details?.reason === expected;
const client = (actor = uid) =>
  actor
    ? environment.authenticatedContext(actor).firestore()
    : environment.unauthenticatedContext().firestore();
const rootPath = (target) => `${target.kind === 'book' ? 'books' : 'adventures'}/${target.id}`;
const scope = (f) => ({ target: f.target, resource: f.resource });
const contextFields = (f, current) => ({
  ...scope(f),
  contextId: current.contextId,
  contextToken: current.contextToken,
});
const entity = (extra = {}) => ({
  name: 'Aria',
  aliases: ['Mundo'],
  category: 'character',
  summary: 'Resumo',
  details: privateLore,
  structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
  relations: [],
  isPublic: false,
  ...extra,
});

before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!address) throw Error('Use somente emulador demo.');
  process.env.METADATA_SERVER_DETECTION = 'none';
  const [host, port] = address.split(':');
  environment = await initializeTestEnvironment({
    projectId: 'demo-writer-editor-chat-apply-tests',
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({
    projectId: 'demo-writer-editor-chat-apply-tests',
    host: address,
    ssl: false,
    universeDomain: 'googleapis.com',
  });
  scenes = createScenesService({ db: admin });
  blocks = createAdventureBlocksService({ db: admin });
  history = createWorkHistoryService({ db: admin });
  progress = createWorkProgressService({ db: admin });
  studio = createStudioService({ db: admin });
  universes = createUniverseService({ db: admin });
});
beforeEach(async () => {
  await environment.clearFirestore();
  serial = 0;
  await admin.doc(`users/${uid}`).set({ credits: 9 });
});
after(async () => {
  await admin?.terminate();
  await environment?.cleanup();
  if (previousMetadata === undefined) delete process.env.METADATA_SERVER_DETECTION;
  else process.env.METADATA_SERVER_DETECTION = previousMetadata;
});

// Pass-through instrumentation of real Admin transactions and backend domain guards.
// Admin bypasses Rules; privateDeny separately proves the direct SDK restrictions.
// getAll masks distinguish metadata from the body of legacy, combined lore documents.
function observedDb(database) {
  const reads = [],
    writes = [],
    transactions = [];
  const record = (ref, fieldMask = null) => {
    if (ref?.path) reads.push({ path: ref.path, fieldMask });
  };
  const instrument = (transaction) => {
    const attempt = { reads: [], writes: [] };
    transactions.push(attempt);
    return new Proxy(transaction, {
      get(target, member) {
        if (member === 'get')
          return (ref) => {
            assert.equal(attempt.writes.length, 0, 'no transaction read after write');
            attempt.reads.push(ref.path ?? 'query');
            record(ref);
            return target.get(ref);
          };
        if (member === 'getAll')
          return (...args) => {
            assert.equal(attempt.writes.length, 0, 'no transaction read after write');
            const mask = args.at(-1)?.fieldMask ?? null;
            for (const ref of args) {
              record(ref, mask);
              if (ref.path) attempt.reads.push(ref.path);
            }
            return target.getAll(...args);
          };
        if (['create', 'set', 'update', 'delete'].includes(member))
          return (ref, ...args) => {
            const entry = { method: member, path: ref.path };
            writes.push(entry);
            attempt.writes.push(entry);
            return target[member](ref, ...args);
          };
        const value = Reflect.get(target, member);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  };
  const db = new Proxy(database, {
    get(target, member) {
      if (member === 'runTransaction')
        return (work, ...options) =>
          target.runTransaction((transaction) => work(instrument(transaction)), ...options);
      if (member === 'getAll')
        return (...args) => {
          const mask = args.at(-1)?.fieldMask ?? null;
          for (const ref of args) record(ref, mask);
          return target.getAll(...args);
        };
      const value = Reflect.get(target, member);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return {
    db,
    reads,
    writes,
    transactions,
    clear() {
      reads.length = 0;
      writes.length = 0;
      transactions.length = 0;
    },
  };
}
function derivedReads(observed) {
  return observed.reads.filter(({ path, fieldMask }) => {
    const contextBody = path.includes('/editorChatContextBodies/') || path.includes('/turnBodies/');
    const loreBody =
      path.includes('/loreBodies/') || /^(?:books|universes)\/[^/]+\/lore\//.test(path);
    const personaBody = path.includes('/aiPersonas/');
    if (!contextBody && !loreBody && !personaBody) return false;
    return (
      fieldMask === null ||
      fieldMask.some((field) =>
        [
          'frozen',
          'capture',
          'accumulator',
          'snapshot',
          'details',
          'structuredDetails',
          'instructions',
        ].includes(field.split('.')[0]),
      )
    );
  });
}
function api(observed) {
  return createEditorChatContextService({ db: observed?.db ?? admin });
}
async function mutation(service, action, fields, operationId = op(action)) {
  const request = { action, ...fields, operationId };
  request.requestHash = await editorChatRequestHash(request);
  return { request, result: await service.dispatch(uid, request) };
}
async function fixture(kind = 'book', worldId = null) {
  let target;
  if (kind === 'book') {
    target = { kind, id: op('book') };
    await setDoc(doc(client(), rootPath(target)), {
      authorId: uid,
      title: 'Livro',
      status: 'draft',
      createdAt: 1,
      updatedAt: 1,
      localLoreVersion: 0,
    });
    if (worldId)
      await admin.runTransaction(async (transaction) => {
        const ref = admin.doc(rootPath(target));
        const current = (await transaction.get(ref)).data();
        const link = await prepareUniverseProjectLink(
          transaction,
          admin,
          uid,
          target,
          current.universeId,
          worldId,
        );
        link.commit();
        transaction.update(ref, { universeId: worldId });
      });
  } else {
    const created = await studio.createAdventure(uid, {
      operationId: op('adventure'),
      title: 'Aventura',
      ...(worldId ? { universeId: worldId } : {}),
    });
    target = { kind: 'adventure', id: created.id };
  }
  const group = await scenes.createSceneGroup(uid, {
    target,
    operationId: op('group'),
    title: 'Grupo',
  });
  const created = await scenes.createScene(uid, {
    target,
    operationId: op('scene'),
    parentId: group.id,
    title: 'Cena',
    content: prose,
  });
  const f = {
    target,
    resource: { kind: 'scene', id: created.scene.id },
    sceneId: created.scene.id,
    groupId: group.id,
  };
  if (kind === 'block') {
    const additional = await blocks.createAdventureBlock(uid, {
      adventureId: target.id,
      sceneId: f.sceneId,
      operationId: op('block'),
      title: 'Adicional',
      content: prose,
      audience: 'creator',
    });
    f.resource = additional.block.resource;
  }
  return f;
}
async function prepare(service, f, text = 'Aria Mundo') {
  const source = await history.getWorkVersionSource(uid, scope(f));
  assert.ok(source);
  const operationId = op('prepare');
  return mutation(
    service,
    'prepareContext',
    {
      ...scope(f),
      contextId: operationId,
      base: {
        sourceToken: source.sourceToken,
        revision: source.revision,
        bodyHash: source.contentHash,
      },
      capture: {
        source: 'selection',
        editorHash: await editorChatTextHash(source.content),
        from: 1,
        to: 10,
        text,
        surroundingText: '',
        truncated: false,
      },
    },
    operationId,
  );
}
async function advance(service, f, current) {
  return mutation(service, 'advanceContext', {
    ...contextFields(f, current),
    expectedRevision: current.revision,
  });
}
async function ready(service, f, text) {
  const initial = await prepare(service, f, text);
  let current = initial.result.current;
  assert.equal(current.phase, 'local');
  for (let step = 0; step < 20 && ['local', 'global'].includes(current.phase); step++)
    current = (await advance(service, f, current)).result.current;
  assert.equal(current.phase, 'ready');
  return current;
}
const inspect = (service, f, current) =>
  service.dispatch(uid, {
    action: 'inspectContext',
    ...contextFields(f, current),
    expectedRevision: current.revision,
  });
async function world(id = 'context-world', extra = {}) {
  await universes.createUniverse(uid, { creationId: id, name: 'Mundo', description: '' });
  await universes.saveUniverseLore(uid, {
    universeId: id,
    id: 'zz_same',
    create: true,
    input: entity(extra),
  });
  return id;
}
async function privateDeny(path) {
  const parent = path.split('/').slice(0, -1).join('/');
  for (const actor of [uid, 'intruder', null]) {
    const database = client(actor);
    await assertFails(getDoc(doc(database, path)));
    await assertFails(getDocs(query(collection(database, parent), limit(1))));
    await assertFails(setDoc(doc(database, path), { forged: true }));
    await assertFails(updateDoc(doc(database, path), { forged: true }));
    await assertFails(deleteDoc(doc(database, path)));
  }
}

const conversationApi = (observed) =>
  createEditorChatConversationsService({ db: observed?.db ?? admin });
const conversationFields = (f, conversation) => ({
  ...scope(f),
  conversationId: conversation.conversationId,
  conversationToken: conversation.conversationToken,
});
const conversationPath = (conversation) =>
  `users/${uid}/editorChats/${conversation.conversationId}`;
async function captureContext(f, text = 'Aria Mundo') {
  const service = api();
  const current = await ready(service, f, text);
  const view = await inspect(service, f, current);
  const control = (
    await admin.doc(`users/${uid}/editorChatContexts/${current.contextId}`).get()
  ).data();
  return { summary: current, frozen: view.frozen, proofCoverage: control.proofCoverage };
}
async function createConversation(service, f, bootstrap) {
  const page =
    bootstrap ?? (await service.dispatch(uid, { action: 'listConversations', ...scope(f) }));
  const created = await mutation(service, 'createConversation', {
    ...scope(f),
    conversationId: op('conversation'),
    projectToken: page.projectToken,
    resourceToken: page.resourceToken,
  });
  return {
    conversation: created.result.current,
    request: created.request,
    receipt: created.result.receipt,
  };
}

// There is no send producer in this milestone. Admin seeds ONLY its approved closed
// storage shape from a real ready context/manifest and native source identities.
// This exercises the REAL apply writer/ledger/billing transaction against Firestore.
// It does not prove send, AI production, context consumption, quota or provider requests.
async function seedTurn(conversation, captured, turnId, options = {}) {
  const state = options.state ?? 'done';
  const question = options.question ?? `Pergunta própria ${turnId}`;
  const answer = options.answer ?? { text: `PRIVATE-ANSWER-${turnId}`, suggestion: null };
  const closure = options.closure ?? captured.frozen.closure;
  const createdAt = options.createdAt ?? Date.now();
  const attemptToken = await editorChatTextHash('fixture-attempt-' + turnId);
  const questionHash = await editorChatTextHash(question);
  const summary = {
    schemaVersion: 1,
    turnId,
    conversationId: conversation.conversationId,
    revision: 1,
    attemptToken,
    state,
    provider: options.provider ?? 'platform',
    generation: resolveChatGeneration({
      version: 1,
      provider: options.provider === 'byok' ? 'openai_byok' : 'platform',
      model: options.provider === 'byok' ? 'gpt-6-luna' : null,
      reasoning: 'auto',
    }),
    contextHash: captured.frozen.contextHash,
    closureHash: closure.closureHash,
    sourceToken: captured.frozen.source.sourceToken,
    suggestionAvailable: state === 'done' && answer.suggestion !== null,
    paid: false,
    failureReason: null,
    createdAt,
    updatedAt: createdAt,
  };
  const metadata = {
    schemaVersion: 1,
    ownerId: uid,
    conversationId: conversation.conversationId,
    conversationToken: conversation.conversationToken,
    turnId,
    summary,
    closureManifest: { version: 1, leaves: closure.leaves },
    closureHash: closure.closureHash,
    proofCoverage: structuredClone(captured.proofCoverage),
    questionChars: question.length,
    modelAnswerChars: state === 'done' ? editorChatModelAnswer(answer).length : 0,
    questionHash,
  };
  const ownQuestion = {
    schemaVersion: 1,
    ownerId: uid,
    conversationId: conversation.conversationId,
    conversationToken: conversation.conversationToken,
    turnId,
    attemptToken,
    question,
    questionHash,
  };
  const body = {
    schemaVersion: 1,
    ownerId: uid,
    conversationId: conversation.conversationId,
    conversationToken: conversation.conversationToken,
    turnId,
    attemptToken,
    context: captured.frozen,
    systemInstruction: 'Instrução de fixture própria',
    historyMessages: options.historyMessages ?? [],
    history: options.history ?? {
      turnIds: [],
      recordCount: 0,
      characterCount: 0,
      omittedRecordCount: 0,
      omittedCharacterCount: 0,
      hasOlderHistory: false,
    },
    answer: state === 'done' ? answer : null,
  };
  await admin.runTransaction(async (transaction) => {
    const root = admin.doc(conversationPath(conversation));
    const catalogRef = admin.doc(`users/${uid}/editorChatCatalogs/current`);
    const [rootSnapshot, catalogSnapshot] = await transaction.getAll(root, catalogRef);
    const control = rootSnapshot.data(),
      catalog = catalogSnapshot.data();
    const updatedAt = Math.max(control.summary.updatedAt + 1, createdAt);
    transaction.create(root.collection('turns').doc(turnId), metadata);
    transaction.create(root.collection('turnQuestions').doc(turnId), ownQuestion);
    transaction.create(root.collection('turnBodies').doc(turnId), body);
    transaction.set(root, {
      ...control,
      summary: {
        ...control.summary,
        revision: control.summary.revision + 1,
        updatedAt,
        ...(options.active ? { activeTurnId: turnId } : {}),
      },
    });
    transaction.set(catalogRef, {
      ...catalog,
      revision: catalog.revision + 1,
      updatedAt: Math.max(catalog.updatedAt + 1, updatedAt),
    });
  });
  return { metadata, summary, question, answer, body, closure };
}

const allKinds = ['book', 'adventure', 'block'];
const baseOf = (source) => ({
  sourceToken: source.sourceToken,
  revision: source.revision,
  bodyHash: source.contentHash,
});
const bodyPath = (f) =>
  `${rootPath(f.target)}/${f.resource.kind === 'block' ? 'sceneBlocks' : 'scenes'}/${f.resource.id}/body/current`;
const turnBodyReads = (observed) =>
  observed.reads.filter(
    ({ path, fieldMask }) => path.includes('/turnBodies/') && fieldMask === null,
  );
const signed = async (request) => ({
  ...request,
  requestHash: await editorChatRequestHash(request),
});
async function applyFixture(kind, { worldId = null, provider = 'platform' } = {}) {
  const f = await fixture(kind, worldId);
  // Both adventure targets retain the other resource's text. Only the selected resource changes.
  if (kind === 'adventure') {
    const additional = await blocks.createAdventureBlock(uid, {
      adventureId: f.target.id,
      sceneId: f.sceneId,
      operationId: op('preserved-block'),
      title: 'Preservado',
      content: prose,
      audience: 'gm',
    });
    f.untouchedPath = `${rootPath(f.target)}/sceneBlocks/${additional.block.resource.id}`;
  } else if (kind === 'block')
    f.untouchedPath = `${rootPath(f.target)}/scenes/${f.sceneId}/body/current`;
  const count = await progress.prepareWorkWordCount(uid, {
    target: f.target,
    operationId: op('count'),
    limit: 50,
  });
  assert.equal(count.complete, true);
  assert.equal(
    (await progress.getWorkProgress(uid, { target: f.target })).manuscript.wordCount,
    kind === 'book' ? 2 : 4,
  );
  const captured = await captureContext(f);
  const { conversation } = await createConversation(conversationApi(), f);
  const turnId = op('turn');
  await seedTurn(conversation, captured, turnId, {
    provider,
    answer: { text: 'Explicação própria', suggestion },
  });
  const source = await history.getWorkVersionSource(uid, scope(f));
  const request = await signed({
    action: 'applySuggestion',
    ...conversationFields(f, conversation),
    turnId,
    suggestionHash: await editorChatTextHash(suggestion),
    base: baseOf(source),
    after: afterText,
    placement: 'original',
    operationId: op('apply'),
  });
  return { ...f, conversation, turnId, request };
}
async function snapshotDocumentTree(ref) {
  const result = [];
  async function visit(document) {
    const snapshot = await document.get();
    if (snapshot.exists) result.push([document.path, snapshot.data(), stamp(snapshot.updateTime)]);
    const children = await document.listCollections();
    await Promise.all(
      children.map(async (collection) => {
        const documents = await collection.listDocuments();
        await Promise.all(documents.map(visit));
      }),
    );
  }
  await visit(ref);
  return result.sort(([a], [b]) => a.localeCompare(b));
}
const stamp = (time) => ({ seconds: time.seconds, nanoseconds: time.nanoseconds });
async function state(f) {
  return {
    project: await snapshotDocumentTree(admin.doc(rootPath(f.target))),
    user: await snapshotDocumentTree(admin.doc(`users/${uid}`)),
  };
}
async function assertNoMutation(f, service, request, expected) {
  const before = await state(f);
  await assert.rejects(() => service.dispatch(uid, request), reason(expected));
  assert.deepEqual(await state(f), before);
}
async function assertApplied(f, result, expectedCredit = 1) {
  const saved = await history.getWorkVersionSource(uid, scope(f));
  assert.equal(saved.content, afterText);
  assert.equal(saved.revision, result.current.revision);
  assert.equal(saved.contentHash, result.current.contentHash);
  assert.equal(result.current.wordCount, 3);
  assert.equal(result.current.bodyBytes, Buffer.byteLength(afterText, 'utf8'));
  assert.equal(result.current.chargedCredits, expectedCredit);
  assert.equal(
    (await progress.getWorkProgress(uid, { target: f.target })).manuscript.wordCount,
    f.target.kind === 'book' ? 3 : 5,
  );
  const root = (await admin.doc(rootPath(f.target)).get()).data();
  const scene = (await admin.doc(`${rootPath(f.target)}/scenes/${f.sceneId}`).get()).data();
  assert.equal(root.sceneRevision, result.current.projectRevision);
  const ledger = (await admin.doc(`${rootPath(f.target)}/workProgress/current`).get()).data();
  assert.equal(ledger.countReady, true);
  assert.equal(ledger.wordCount, f.target.kind === 'book' ? 3 : 5);
  // The legacy book cache is maintained only for books; adventures use the ledger.
  if (f.target.kind === 'book') assert.equal(root.wordCount, 3);
  assert.equal(scene.wordCount, f.target.kind === 'book' ? 3 : 5);
  if (f.target.kind === 'adventure') {
    assert.equal(scene.mainWordCount, f.resource.kind === 'block' ? 2 : 3);
    assert.equal(scene.blockWordCount, f.resource.kind === 'block' ? 3 : 2);
    assert.equal(saved.sceneWordCount, 5);
  }
  assert.equal((await admin.collection(`${rootPath(f.target)}/workVersions`).get()).size, 0);
  assert.equal(JSON.stringify(result.receipt).includes(afterText), false);
}
async function immutableResource(f) {
  if (!f.untouchedPath) return null;
  const ref = admin.doc(f.untouchedPath);
  const metadata = await ref.get();
  const child = await ref.collection('body').doc('current').get();
  return { data: metadata.data(), child: child.data(), stamp: stamp(metadata.updateTime) };
}

test('SDK apply editor: três alvos, escritores e ledger reais, crédito paid e recibo no mesmo commit', async () => {
  for (const kind of allKinds) {
    const f = await applyFixture(kind);
    const untouched = await immutableResource(f);
    const observed = observedDb(admin);
    const service = createEditorChatApplyService({ db: observed.db });
    const result = await service.dispatch(uid, f.request);
    await assertApplied(f, result);
    assert.deepEqual(await immutableResource(f), untouched);
    assert.equal(
      (await admin.doc(`users/${uid}`).get()).data().credits,
      9 - allKinds.indexOf(kind) - 1,
    );
    const turnPath = `${conversationPath(f.conversation)}/turns/${f.turnId}`;
    assert.equal((await admin.doc(turnPath).get()).data().summary.paid, true);
    const receiptPath = `users/${uid}/editorChatOperations/${f.request.operationId}`;
    assert.deepEqual((await admin.doc(receiptPath).get()).data().receipt, result.receipt);
    const transactionWrites = observed.transactions.filter((attempt) => attempt.writes.length > 0);
    assert.equal(transactionWrites.length, 1);
    for (const path of [
      bodyPath(f),
      rootPath(f.target),
      `${rootPath(f.target)}/workProgress/current`,
      `users/${uid}`,
      turnPath,
      receiptPath,
    ])
      assert.ok(
        transactionWrites[0].writes.some((write) => write.path === path),
        path,
      );
    assert.ok(
      transactionWrites[0].writes.some((write) => write.path.includes('/workWordSources/')),
    );
    // Actual native updateTime agrees across the manuscript, ledger, debit, paid flag and receipt.
    const committed = await admin.getAll(
      ...[
        bodyPath(f),
        `${rootPath(f.target)}/workProgress/current`,
        `users/${uid}`,
        turnPath,
        receiptPath,
      ].map((path) => admin.doc(path)),
    );
    for (const snapshot of committed)
      assert.deepEqual(stamp(snapshot.updateTime), stamp(committed[0].updateTime));
    observed.clear();
    await assert.rejects(
      () => service.dispatch('intruder', f.request),
      reason('conversation-unavailable'),
    );
    await assert.rejects(() => service.dispatch(null, f.request), reason('auth-required'));
    assert.equal(turnBodyReads(observed).length, 0);
    assert.equal(observed.writes.length, 0);
    await privateDeny(receiptPath);
  }
});

test('SDK apply editor: corrida mesmo operationId, retry histórico, reapply pago e CAS sem escrita', async () => {
  for (const kind of allKinds) {
    await admin.doc(`users/${uid}`).update({ credits: 9 });
    const f = await applyFixture(kind);
    const service = createEditorChatApplyService({ db: admin });
    const results = await Promise.all([
      service.dispatch(uid, f.request),
      service.dispatch(uid, f.request),
    ]);
    assert.equal(results.filter((result) => result.current !== null).length, 1);
    assert.deepEqual(results[0].receipt, results[1].receipt);
    const confirmed = results.find((result) => result.current !== null);
    await assertApplied(f, confirmed);
    assert.equal((await admin.doc(`users/${uid}`).get()).data().credits, 8);
    const afterFirst = await state(f);
    assert.deepEqual(await service.dispatch(uid, f.request), {
      receipt: confirmed.receipt,
      current: null,
    });
    assert.deepEqual(await state(f), afterFirst);
    const currentSource = await history.getWorkVersionSource(uid, scope(f));
    const next = await signed({
      ...f.request,
      operationId: op('reapply'),
      placement: 'retargeted',
      base: baseOf(currentSource),
      after: '<p>Outra aplicação</p>',
    });
    const reapplied = await service.dispatch(uid, next);
    assert.equal(reapplied.current.chargedCredits, 0);
    assert.equal(confirmed.receipt.result.chargedCredits, 1);
    assert.equal((await admin.doc(`users/${uid}`).get()).data().credits, 8);
    assert.equal((await history.getWorkVersionSource(uid, scope(f))).content, next.after);
    assert.equal(
      (await progress.getWorkProgress(uid, { target: f.target })).manuscript.wordCount,
      kind === 'book' ? 2 : 4,
    );
    await assertNoMutation(
      f,
      service,
      await signed({ ...f.request, operationId: op('stale-original') }),
      'revision-conflict',
    );
    await assertNoMutation(
      f,
      service,
      await signed({ ...next, operationId: op('stale-retarget') }),
      'revision-conflict',
    );
    await assertNoMutation(
      f,
      service,
      await signed({ ...f.request, after: '<p>Fingerprint diferente</p>' }),
      'operation-conflict',
    );
  }
});

test('SDK apply editor: revogação bloqueia corpo derivado e replay confirmado permanece metadata-only', async () => {
  const worldId = await world();
  for (const kind of allKinds) {
    const f = await applyFixture(kind, { worldId });
    const observed = observedDb(admin),
      service = createEditorChatApplyService({ db: observed.db });
    await admin.doc(`universes/${worldId}`).update({ deleting: true });
    observed.clear();
    await assertNoMutation(f, service, f.request, 'provenance-revoked');
    assert.equal(turnBodyReads(observed).length, 0);
    assert.equal(derivedReads(observed).length, 0);
    assert.equal(observed.writes.length, 0);
    await admin.doc(`universes/${worldId}`).update({ deleting: false });
    const result = await service.dispatch(uid, f.request);
    await assertApplied(f, result);
    await admin.doc(`universes/${worldId}`).update({ deleting: true });
    observed.clear();
    const before = await state(f);
    assert.deepEqual(await service.dispatch(uid, f.request), {
      receipt: result.receipt,
      current: null,
    });
    assert.deepEqual(await state(f), before);
    assert.equal(observed.reads.length, 1);
    assert.equal(derivedReads(observed).length, 0);
    assert.equal(observed.writes.length, 0);
    await admin.doc(`universes/${worldId}`).update({ deleting: false });
  }
});

test('SDK apply editor: saldo insuficiente, cancel fence e BYOK zero preservam fronteira de débito', async () => {
  for (const kind of allKinds) {
    const f = await applyFixture(kind);
    const observed = observedDb(admin),
      service = createEditorChatApplyService({ db: observed.db });
    await admin.doc(`users/${uid}`).update({ credits: 0 });
    observed.clear();
    await assertNoMutation(f, service, f.request, 'insufficient-credits');
    assert.equal(observed.writes.length, 0);
    assert.equal(
      (await admin.doc(`${conversationPath(f.conversation)}/turns/${f.turnId}`).get()).data()
        .summary.paid,
      false,
    );
    const resolver = {
      action: 'resolveOperation',
      operationId: f.request.operationId,
      operationAction: 'applySuggestion',
      requestHash: f.request.requestHash,
      intent: 'cancel',
    };
    const canceled = await conversationApi().dispatch(uid, resolver);
    observed.clear();
    const before = await state(f);
    assert.deepEqual(await service.dispatch(uid, f.request), {
      receipt: canceled.receipt,
      current: null,
    });
    assert.equal(canceled.receipt.outcome, 'canceled');
    assert.deepEqual(await state(f), before);
    assert.equal(observed.reads.length, 1);
    assert.equal(turnBodyReads(observed).length, 0);
    assert.equal(observed.writes.length, 0);
    await assertNoMutation(
      f,
      service,
      await signed({ ...f.request, after: '<p>Outro pedido</p>' }),
      'operation-conflict',
    );
    // Separate native context/closed turn freezes BYOK; it does not reuse a platform receipt.
    const byok = await applyFixture(kind, { provider: 'byok' });
    const free = await service.dispatch(uid, byok.request);
    await assertApplied(byok, free, 0);
    assert.equal((await admin.doc(`users/${uid}`).get()).data().credits, 0);
    assert.equal(
      (await admin.doc(`${conversationPath(byok.conversation)}/turns/${byok.turnId}`).get()).data()
        .summary.paid,
      false,
    );
    assert.equal(free.receipt.result.chargedCredits, 0);
    assert.ok(observed.writes.every((write) => write.path !== `users/${uid}`));
  }
});
