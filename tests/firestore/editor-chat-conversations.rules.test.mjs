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
import {
  createEditorChatConversationsService,
  readEditorChatConversation,
} from '../../functions/src/editorChatConversations.mjs';
import {
  selectEditorChatModelHistory,
  editorChatModelAnswer,
} from '../../functions/src/editorChatHistoryRead.mjs';
import { resolveChatGeneration } from '../../functions/src/chatGeneration.mjs';
import { mergeEditorChatClosures } from '../../functions/src/editorChatContracts.mjs';
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
const uid = 'conversations-author';
const prose = '<p>Aria Mundo. PRIVATE-MANUSCRIPT.</p>';
const privateLore = 'PRIVATE-LORE-ORIGINAL';
const previousMetadata = process.env.METADATA_SERVER_DETECTION;
let environment, admin, scenes, blocks, history, studio, universes, serial;
const op = (name) => `sdk-conversations-${name}-${++serial}`;
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
    projectId: 'demo-writer-editor-chat-conversations-tests',
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({
    projectId: 'demo-writer-editor-chat-conversations-tests',
    host: address,
    ssl: false,
    universeDomain: 'googleapis.com',
  });
  scenes = createScenesService({ db: admin });
  blocks = createAdventureBlocksService({ db: admin });
  history = createWorkHistoryService({ db: admin });
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
    writes = [];
  const record = (ref, fieldMask = null) => {
    if (ref?.path) reads.push({ path: ref.path, fieldMask });
  };
  const instrument = (transaction) =>
    new Proxy(transaction, {
      get(target, member) {
        if (member === 'get')
          return (ref) => {
            record(ref);
            return target.get(ref);
          };
        if (member === 'getAll')
          return (...args) => {
            const mask = args.at(-1)?.fieldMask ?? null;
            for (const ref of args) record(ref, mask);
            return target.getAll(...args);
          };
        if (['create', 'set', 'update', 'delete'].includes(member))
          return (ref, ...args) => {
            writes.push({ method: member, path: ref.path });
            return target[member](ref, ...args);
          };
        const value = Reflect.get(target, member);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
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
    clear() {
      reads.length = 0;
      writes.length = 0;
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
// This proves readers/history/cleanup; it does not prove AI production, context
// consumption, quota, provider requests, or billing/atomic application.
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
    provider: 'platform',
    generation: resolveChatGeneration({
      version: 1,
      provider: 'platform',
      model: null,
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
async function modelHistory(observed, f, conversation) {
  const database = observed?.db ?? admin;
  return database.runTransaction(async (transaction) => {
    const current = await readEditorChatConversation(
      transaction,
      database,
      uid,
      conversation.conversationId,
      conversation.conversationToken,
      scope(f),
    );
    return selectEditorChatModelHistory(transaction, database, uid, current);
  });
}
const turnRequest = (f, conversation, turnId) => ({
  action: 'getTurn',
  ...conversationFields(f, conversation),
  turnId,
});
const bodyReads = (observed) =>
  observed.reads.filter((read) => read.path.includes('/turnBodies/') && read.fieldMask === null);
const questionReads = (observed) =>
  observed.reads.filter((read) => read.path.includes('/turnQuestions/') && read.fieldMask === null);
const nativeStamp = (snapshot) => ({
  seconds: snapshot.createTime.seconds,
  nanoseconds: snapshot.createTime.nanoseconds,
});

test('SDK conversas editor: catálogo privado, paginação, CAS e cursores presos ao escopo e revisão', async () => {
  const f = await fixture('book'),
    service = conversationApi();
  const bootstrap = await service.dispatch(uid, { action: 'listConversations', ...scope(f) });
  assert.deepEqual(bootstrap.items, []);
  assert.equal(bootstrap.collectionRevision, 0);
  assert.ok(bootstrap.platformModel.length);
  const created = [];
  for (let n = 0; n < 3; n++) created.push(await createConversation(service, f, bootstrap));
  const sorted = created
    .map((value) => value.conversation)
    .sort((a, b) => b.updatedAt - a.updatedAt || (a.conversationId < b.conversationId ? 1 : -1));
  const first = await service.dispatch(uid, { action: 'listConversations', ...scope(f), limit: 1 });
  assert.equal(first.items[0].conversationId, sorted[0].conversationId);
  assert.ok(first.nextCursor);
  const second = await service.dispatch(uid, {
    action: 'listConversations',
    ...scope(f),
    limit: 1,
    cursor: first.nextCursor,
  });
  assert.equal(second.items[0].conversationId, sorted[1].conversationId);
  const third = await service.dispatch(uid, {
    action: 'listConversations',
    ...scope(f),
    limit: 1,
    cursor: second.nextCursor,
  });
  assert.equal(third.items[0].conversationId, sorted[2].conversationId);
  assert.equal(third.nextCursor, null);
  const conversation = created[0].conversation;
  const renamed = await mutation(service, 'renameConversation', {
    ...conversationFields(f, conversation),
    expectedRevision: conversation.revision,
    title: '  Título próprio  ',
  });
  assert.equal(renamed.result.current.title, 'Título próprio');
  assert.deepEqual((await service.dispatch(uid, renamed.request)).receipt, renamed.result.receipt);
  await assert.rejects(
    () =>
      mutation(service, 'renameConversation', {
        ...conversationFields(f, conversation),
        expectedRevision: conversation.revision,
        title: 'Concorrente',
      }),
    reason('revision-conflict'),
  );
  await assert.rejects(
    () =>
      service.dispatch(uid, {
        action: 'listConversations',
        ...scope(f),
        limit: 1,
        cursor: first.nextCursor,
      }),
    reason('cursor-stale'),
  );
  const validPage = await service.dispatch(uid, {
    action: 'listConversations',
    ...scope(f),
    limit: 1,
  });
  const other = await fixture('book');
  await assert.rejects(
    () =>
      service.dispatch(uid, {
        action: 'listConversations',
        ...scope(other),
        cursor: validPage.nextCursor,
      }),
    reason('cursor-stale'),
  );
  await assert.rejects(
    () =>
      service.dispatch(uid, { action: 'listConversations', ...scope(f), cursor: 'invalid_cursor' }),
    reason('invalid-request'),
  );
  for (const actor of ['intruder', null]) {
    await assert.rejects(
      () => service.dispatch(actor, { action: 'listConversations', ...scope(f) }),
      reason(actor ? 'source-unavailable' : 'auth-required'),
    );
    await assert.rejects(
      () =>
        service.dispatch(actor, { action: 'listMessages', ...conversationFields(f, conversation) }),
      reason(actor ? 'conversation-unavailable' : 'auth-required'),
    );
  }
  const captured = await captureContext(f);
  const turn = await seedTurn(conversation, captured, 'first');
  const path = conversationPath(conversation);
  for (const location of [
    path,
    `${path}/turns/first`,
    `${path}/turnQuestions/first`,
    `${path}/turnBodies/first`,
    `users/${uid}/editorChatCatalogs/current`,
  ])
    await privateDeny(location);
  const catalog = await service.dispatch(uid, { action: 'listConversations', ...scope(f) });
  const turns = await service.dispatch(uid, {
    action: 'listMessages',
    ...conversationFields(f, conversation),
  });
  assert.equal(turns.items[0].turnId, turn.summary.turnId);
  assert.equal(JSON.stringify(catalog).includes('PRIVATE-'), false);
  assert.equal(JSON.stringify(turns).includes('PRIVATE-'), false);
  assert.equal((await admin.doc(`users/${uid}`).get()).data().credits, 9);
});

test('SDK conversas editor: pergunta própria persiste sem abrir resposta revogada ou de origem recriada', async () => {
  const worldId = await world(),
    f = await fixture('adventure', worldId),
    contextService = api();
  const personaScope = { adventureId: f.target.id, sceneId: null };
  const binding = await contextService.dispatch(uid, {
    action: 'getAdventurePersonaBinding',
    ...personaScope,
  });
  const set = await mutation(contextService, 'setAdventurePersonaBinding', {
    ...personaScope,
    adventureToken: binding.adventureToken,
    expectedBindingToken: binding.bindingToken,
    value: { personaId: 'preset-epic' },
  });
  const captured = await captureContext(f),
    observed = observedDb(admin),
    service = conversationApi(observed);
  const { conversation } = await createConversation(service, f);
  const stored = await seedTurn(conversation, captured, 'answer', {
    question: 'Pergunta própria preservada',
    answer: { text: 'PRIVATE-RESPONSE', suggestion: 'PRIVATE-SUGGESTION' },
  });
  const request = turnRequest(f, conversation, 'answer');
  const available = await service.dispatch(uid, request);
  assert.equal(available.presentation, 'available');
  assert.equal(available.answer.context.persona.base.id, 'preset-epic');
  await mutation(contextService, 'setAdventurePersonaBinding', {
    ...personaScope,
    adventureToken: binding.adventureToken,
    expectedBindingToken: set.result.current.bindingToken,
    value: { personaId: 'preset-incisive' },
  });
  const rebound = await service.dispatch(uid, request);
  assert.equal(rebound.answer.freshness, 'stale');
  assert.equal(rebound.answer.context.persona.base.id, 'preset-epic');
  await universes.saveUniverseLore(uid, {
    universeId: worldId,
    id: 'zz_same',
    create: false,
    input: entity({ details: 'PRIVATE-ORDINARY-EDIT' }),
  });
  const edited = await service.dispatch(uid, request);
  assert.equal(edited.answer.freshness, 'stale');
  assert.equal(edited.answer.context.lore[0].detailsExcerpt, privateLore);
  await admin.doc(`universes/${worldId}`).update({ deleting: true });
  observed.clear();
  const blocked = await service.dispatch(uid, request);
  assert.equal(blocked.question, stored.question);
  assert.equal(blocked.presentation, 'blocked');
  assert.equal(blocked.answer, null);
  assert.equal(bodyReads(observed).length, 0);
  assert.equal(derivedReads(observed).length, 0);
  assert.equal(questionReads(observed).length, 1);
  await admin.doc(`universes/${worldId}`).update({ deleting: false });
  assert.equal((await service.dispatch(uid, request)).presentation, 'available');
  const origin = admin.doc(`universes/${worldId}/lore/zz_same`),
    oldBirth = nativeStamp(await origin.get());
  await origin.delete();
  await universes.saveUniverseLore(uid, {
    universeId: worldId,
    id: 'zz_same',
    create: true,
    input: entity(),
  });
  assert.notDeepEqual(nativeStamp(await origin.get()), oldBirth);
  observed.clear();
  const recreated = await service.dispatch(uid, request);
  assert.equal(recreated.question, stored.question);
  assert.equal(recreated.answer, null);
  assert.equal(recreated.presentation, 'blocked');
  assert.equal(derivedReads(observed).length, 0);
  const currentContext = await captureContext(f);
  const currentTurn = await seedTurn(conversation, currentContext, 'new-origin', {
    question: 'Pergunta da nova origem',
  });
  const currentRequest = turnRequest(f, conversation, currentTurn.summary.turnId);
  assert.equal((await service.dispatch(uid, currentRequest)).presentation, 'available');
  const root = admin.doc(rootPath(f.target)),
    before = await root.get();
  await root.delete();
  observed.clear();
  const removed = await service.dispatch(uid, currentRequest);
  assert.equal(removed.question, currentTurn.question);
  assert.equal(removed.answer, null);
  assert.equal(derivedReads(observed).length, 0);
  await root.create(before.data());
  assert.notDeepEqual(nativeStamp(await root.get()), nativeStamp(before));
  observed.clear();
  assert.equal((await service.dispatch(uid, currentRequest)).answer, null);
  assert.equal(bodyReads(observed).length, 0);
});

test('SDK conversas editor: janela completa, contadores exatos e closure transitiva sem pular revogado', async () => {
  const worldId = await world(),
    f = await fixture('book', worldId),
    service = conversationApi();
  const direct = await captureContext(f, 'Aria'),
    own = await captureContext(f, 'Texto próprio sem nomes');
  assert.equal(own.frozen.lore.length, 0);
  const { conversation } = await createConversation(service, f);
  const born = Date.now(),
    rows = [];
  const question = 'q'.repeat(1000),
    answer = { text: 'a'.repeat(2000), suggestion: null };
  const ancestor = await seedTurn(conversation, direct, 't00', {
    question,
    answer,
    createdAt: born,
  });
  rows.push(ancestor);
  for (let n = 1; n < 10; n++)
    rows.push(
      await seedTurn(conversation, own, 't' + String(n).padStart(2, '0'), {
        question,
        answer,
        createdAt: born + n,
      }),
    );
  const closureB = await mergeEditorChatClosures(own.frozen.closure, ancestor.closure);
  const inheritedHistory = (id) => ({
    turnIds: [id],
    recordCount: 2,
    characterCount: 3000,
    omittedRecordCount: 0,
    omittedCharacterCount: 0,
    hasOlderHistory: false,
  });
  const messages = [
    { role: 'user', text: question },
    { role: 'assistant', text: editorChatModelAnswer(answer) },
  ];
  const b = await seedTurn(conversation, own, 't10', {
    question,
    answer,
    closure: closureB,
    history: inheritedHistory('t00'),
    historyMessages: messages,
    createdAt: born + 10,
  });
  const c = await seedTurn(conversation, own, 't11', {
    question,
    answer,
    closure: await mergeEditorChatClosures(own.frozen.closure, b.closure),
    history: inheritedHistory('t10'),
    historyMessages: messages,
    createdAt: born + 11,
  });
  rows.push(b, c);
  const observed = observedDb(admin);
  const selected = await modelHistory(observed, f, conversation);
  assert.deepEqual(
    selected.history.turnIds,
    rows.slice(2).map((row) => row.summary.turnId),
  );
  assert.equal(selected.history.recordCount, 20);
  assert.equal(selected.history.characterCount, 30000);
  assert.equal(selected.history.omittedRecordCount, null);
  assert.equal(selected.history.omittedCharacterCount, null);
  assert.equal(selected.history.hasOlderHistory, true);
  assert.equal(selected.messages.length, 20);
  assert.equal(
    bodyReads(observed).some((read) => read.path.endsWith('/t00')),
    false,
  );
  assert.ok(
    selected.closure.leaves.some(
      (leaf) => leaf.kind === 'lore' && leaf.reference.scopeId === worldId,
    ),
  );
  const final = await service.dispatch(uid, turnRequest(f, conversation, 't11'));
  assert.equal(final.answer.context.lore.length, 0);
  assert.ok(
    final.answer.provenance.leaves.some(
      (leaf) => leaf.kind === 'lore' && leaf.reference.scopeId === worldId,
    ),
  );
  await admin.doc(`universes/${worldId}`).update({ deleting: true });
  observed.clear();
  await assert.rejects(() => modelHistory(observed, f, conversation), reason('history-revoked'));
  assert.equal(bodyReads(observed).length, 0);
  assert.equal(questionReads(observed).length, 0);
  await admin.doc(`universes/${worldId}`).update({ deleting: false });
  for (const n of [12, 13])
    await seedTurn(conversation, own, 't' + n, {
      question,
      answer: { text: 'b'.repeat(23000), suggestion: null },
      createdAt: born + n,
    });
  const limited = await modelHistory(null, f, conversation);
  assert.deepEqual(limited.history.turnIds, ['t13']);
  assert.equal(limited.history.recordCount, 2);
  assert.equal(limited.history.characterCount, 24000);
  assert.equal(limited.messages[1].text.length, 23000);
  assert.equal(limited.history.hasOlderHistory, true);
  const metadata = admin.doc(`${conversationPath(conversation)}/turns/t13`);
  await metadata.update({ modelAnswerChars: 23001 });
  await assert.rejects(() => modelHistory(null, f, conversation), reason('inconsistent'));
  await metadata.update({ modelAnswerChars: 23000 });
  assert.equal((await modelHistory(null, f, conversation)).history.characterCount, 24000);
});

test('SDK conversas editor: exclusão cerca turno ativo e limpa órfãos por cursor sem reabrir corpos', async () => {
  const f = await fixture('book'),
    captured = await captureContext(f),
    service = conversationApi();
  const { conversation } = await createConversation(service, f);
  for (let n = 0; n < 48; n++)
    await seedTurn(conversation, captured, 'turn-' + String(n).padStart(2, '0'));
  const active = await seedTurn(conversation, captured, 'turn-active', {
    state: 'running',
    active: true,
  });
  const path = conversationPath(conversation);
  await admin.doc(path).update({ 'summary.title': 'PRIVATE-TITLE' });
  const orphans = admin.batch();
  orphans.create(admin.doc(`${path}/turnBodies/orphan-body-a`), {
    schemaVersion: 1,
    text: 'PRIVATE-ORPHAN-A',
  });
  orphans.create(admin.doc(`${path}/turnBodies/orphan-body-b`), {
    schemaVersion: 1,
    text: 'PRIVATE-ORPHAN-B',
  });
  orphans.create(admin.doc(`${path}/turnQuestions/orphan-question`), {
    schemaVersion: 1,
    question: 'Pergunta própria órfã',
  });
  orphans.create(admin.doc(`${path}/turns/orphan-metadata`), { schemaVersion: 1 });
  await orphans.commit();
  const manuscript = await admin
    .doc(`${rootPath(f.target)}/scenes/${f.sceneId}/body/current`)
    .get();
  const late = {
    action: 'createConversation',
    ...scope(f),
    operationId: op('late-create'),
    conversationId: op('late-conversation'),
    projectToken: conversation.projectToken,
    resourceToken: conversation.resourceToken,
  };
  late.requestHash = await editorChatRequestHash(late);
  const resolver = {
    action: 'resolveOperation',
    operationId: late.operationId,
    operationAction: late.action,
    requestHash: late.requestHash,
  };
  assert.equal((await service.dispatch(uid, { ...resolver, intent: 'observe' })).state, 'unknown');
  assert.equal(
    (await admin.doc(`users/${uid}/editorChatOperations/${late.operationId}`).get()).exists,
    false,
  );
  assert.equal(
    (await service.dispatch(uid, { ...resolver, intent: 'cancel' })).receipt.outcome,
    'canceled',
  );
  await admin.doc(rootPath(f.target)).delete();
  const observed = observedDb(admin),
    cleanupService = conversationApi(observed);
  const deletion = await mutation(
    cleanupService,
    'deleteConversation',
    conversationFields(f, conversation),
  );
  let cleanup = deletion.result.current;
  assert.equal(cleanup.phase, 'turn-bodies');
  const stopped = (await admin.doc(`${path}/turns/turn-active`).get()).data().summary;
  assert.equal(stopped.state, 'stopped');
  assert.equal(stopped.attemptToken, active.summary.attemptToken);
  observed.clear();
  await assert.rejects(
    () => cleanupService.dispatch(uid, turnRequest(f, conversation, 'turn-active')),
    reason('conversation-unavailable'),
  );
  assert.equal(bodyReads(observed).length, 0);
  assert.equal(questionReads(observed).length, 0);
  let steps = 0,
    deletes = 0;
  while (cleanup.state !== 'deleted' && steps++ < 12) {
    observed.clear();
    const previous = cleanup;
    const advanced = await mutation(cleanupService, 'advanceCleanup', {
      cleanupId: cleanup.cleanupId,
      cleanupToken: cleanup.cleanupToken,
      expectedRevision: cleanup.revision,
    });
    cleanup = advanced.result.current;
    const removed = observed.writes.filter((write) => write.method === 'delete').length;
    assert.ok(removed <= 47);
    assert.ok(observed.writes.length <= 50);
    assert.equal(cleanup.deletedDocuments - previous.deletedDocuments, removed);
    assert.equal(bodyReads(observed).length, 0);
    assert.equal(questionReads(observed).length, 0);
    deletes += removed;
    if (steps === 1) {
      assert.equal(removed, 47);
      assert.equal(cleanup.phase, 'turn-bodies');
      const control = (
        await admin.doc(`users/${uid}/editorChatCleanup/${cleanup.cleanupId}`).get()
      ).data();
      assert.ok(control.cursor);
      assert.equal((await admin.collection(`${path}/turnBodies`).get()).size, 4);
      const read = await cleanupService.dispatch(uid, {
        action: 'getCleanup',
        cleanupId: cleanup.cleanupId,
        cleanupToken: cleanup.cleanupToken,
      });
      assert.equal(read.revision, cleanup.revision);
      assert.deepEqual(
        (await cleanupService.dispatch(uid, advanced.request)).receipt,
        advanced.result.receipt,
      );
    }
  }
  assert.equal(cleanup.state, 'deleted');
  assert.equal(cleanup.phase, 'complete');
  assert.equal(cleanup.deletedDocuments, 151);
  assert.equal(deletes, 151);
  for (const child of ['turnBodies', 'turnQuestions', 'turns'])
    assert.equal((await admin.collection(`${path}/${child}`).get()).size, 0);
  const tombstone = (await admin.doc(path).get()).data();
  assert.equal(tombstone.summary.state, 'deleted');
  assert.equal(tombstone.summary.activeTurnId, null);
  assert.equal(tombstone.summary.title, '');
  assert.equal(JSON.stringify(tombstone).includes('PRIVATE-'), false);
  observed.clear();
  assert.deepEqual(
    (await cleanupService.dispatch(uid, deletion.request)).receipt,
    deletion.result.receipt,
  );
  assert.equal((await cleanupService.dispatch(uid, late)).receipt.outcome, 'canceled');
  assert.equal(
    (await admin.doc(`users/${uid}/editorChats/${late.conversationId}`).get()).exists,
    false,
  );
  assert.equal(bodyReads(observed).length, 0);
  assert.equal((await admin.doc(rootPath(f.target)).get()).exists, false);
  assert.deepEqual((await manuscript.ref.get()).data(), manuscript.data());
  assert.equal((await admin.doc(`users/${uid}`).get()).data().credits, 9);
});
