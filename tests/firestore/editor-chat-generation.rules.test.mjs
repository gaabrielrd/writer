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
import { createEditorChatService } from '../../functions/src/editorChat.mjs';
import { createChapterChatService } from '../../functions/src/chapterChat.mjs';
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
const uid = 'generation-author';
const prose = '<p>Aria Mundo. PRIVATE-MANUSCRIPT.</p>';
const privateLore = 'PRIVATE-LORE-GENERATION';
const previousMetadata = process.env.METADATA_SERVER_DETECTION;
const platform = { version: 1, provider: 'platform', model: null, reasoning: 'auto' };
const byok = { version: 1, provider: 'openai_byok', model: 'gpt-4o-mini', reasoning: 'auto' };
let environment, admin, scenes, blocks, history, studio, universes, serial;
const op = (name) => `sdk-generation-${name}-${++serial}`;
const reason = (expected) => (error) => error.details?.reason === expected;
const client = (actor = uid) =>
  actor
    ? environment.authenticatedContext(actor).firestore()
    : environment.unauthenticatedContext().firestore();
const rootPath = (target) => `${target.kind === 'book' ? 'books' : 'adventures'}/${target.id}`;
const scope = (f) => ({ target: f.target, resource: f.resource });
const conversationPath = (c) => `users/${uid}/editorChats/${c.conversationId}`;
const contextPath = (c) => `users/${uid}/editorChatContexts/${c.contextId}`;
const conversationFields = (f, c) => ({
  ...scope(f),
  conversationId: c.conversationId,
  conversationToken: c.conversationToken,
});
const turnFields = (f, c, t) => ({
  ...conversationFields(f, c),
  turnId: t.turnId,
  attemptToken: t.attemptToken,
});
const data = async (path) => (await admin.doc(path).get()).data();
const quota = () => data(`users/${uid}/chapterChatLimits/current`);
const signed = async (request) => ({
  ...request,
  requestHash: await editorChatRequestHash(request),
});
const mutate = async (service, action, fields, operationId = op(action)) => {
  const request = await signed({ action, ...fields, operationId });
  return { request, result: await service.dispatch(uid, request) };
};
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!address) throw Error('Use somente emulador demo.');
  process.env.METADATA_SERVER_DETECTION = 'none';
  const [host, port] = address.split(':');
  const projectId = 'demo-writer-editor-chat-generation-tests';
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
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

// Observe real Admin transactions without replacing snapshots, domain authorization,
// retries or commits. Each callback attempt has a separate writes array: aborted
// attempts are not asserted to be commits. Persisted snapshots prove the effects.
function observedDb(database) {
  const reads = [],
    attempts = [];
  const record = (ref, fieldMask = null) => {
    if (ref?.path) reads.push({ path: ref.path, fieldMask });
  };
  const db = new Proxy(database, {
    get(target, member) {
      if (member === 'runTransaction')
        return (work, ...options) =>
          target.runTransaction(
            (tx) => {
              const writes = [];
              attempts.push(writes);
              return work(
                new Proxy(tx, {
                  get(transaction, method) {
                    if (method === 'get')
                      return (ref) => {
                        record(ref);
                        return transaction.get(ref);
                      };
                    if (method === 'getAll')
                      return (...args) => {
                        const mask = args.at(-1)?.fieldMask ?? null;
                        for (const ref of args) record(ref, mask);
                        return transaction.getAll(...args);
                      };
                    if (['create', 'set', 'update', 'delete'].includes(method))
                      return (ref, ...args) => {
                        writes.push({ method, path: ref.path });
                        return transaction[method](ref, ...args);
                      };
                    const value = Reflect.get(transaction, method);
                    return typeof value === 'function' ? value.bind(transaction) : value;
                  },
                }),
              );
            },
            ...options,
          );
      const value = Reflect.get(target, member);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return {
    db,
    reads,
    attempts,
    clear() {
      reads.length = 0;
      attempts.length = 0;
    },
  };
}
const bodyReads = (observed) =>
  observed.reads.filter((r) => r.path.includes('/turnBodies/') && r.fieldMask === null);
const api = (options = {}) =>
  createEditorChatService({ db: admin, generator: async () => 'Resposta', ...options });
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
    if (worldId) await linkWorld(target, worldId);
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
async function linkWorld(target, universeId) {
  await admin.runTransaction(async (tx) => {
    const ref = admin.doc(rootPath(target)),
      current = (await tx.get(ref)).data();
    const plan = await prepareUniverseProjectLink(
      tx,
      admin,
      uid,
      target,
      current.universeId,
      universeId,
    );
    plan.commit();
    tx.update(ref, { universeId });
  });
}
async function world() {
  const id = op('world');
  await universes.createUniverse(uid, { creationId: id, name: 'Mundo', description: '' });
  await universes.saveUniverseLore(uid, {
    universeId: id,
    id: 'aria',
    create: true,
    input: {
      name: 'Aria',
      aliases: ['Mundo'],
      category: 'character',
      summary: 'Resumo',
      details: privateLore,
      structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
      relations: [],
      isPublic: false,
    },
  });
  return id;
}
async function ready(service, f, text = 'Aria Mundo') {
  const source = await history.getWorkVersionSource(uid, scope(f)),
    id = op('context');
  let current = (
    await mutate(
      service,
      'prepareContext',
      {
        ...scope(f),
        contextId: id,
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
      id,
    )
  ).result.current;
  for (let n = 0; n < 20 && ['local', 'global'].includes(current.phase); n++)
    current = (
      await mutate(service, 'advanceContext', {
        ...scope(f),
        contextId: current.contextId,
        contextToken: current.contextToken,
        expectedRevision: current.revision,
      })
    ).result.current;
  assert.equal(current.phase, 'ready');
  return current;
}
async function conversation(service, f) {
  const page = await service.dispatch(uid, { action: 'listConversations', ...scope(f) });
  return (
    await mutate(service, 'createConversation', {
      ...scope(f),
      conversationId: op('conversation'),
      projectToken: page.projectToken,
      resourceToken: page.resourceToken,
    })
  ).result.current;
}
const currentConversation = async (c) => (await data(conversationPath(c))).summary;
async function sendRequest(f, c, context, generation = platform, prompt = '  Pergunta própria\n') {
  const current = await currentConversation(c);
  return signed({
    action: 'send',
    ...conversationFields(f, c),
    operationId: op('send'),
    expectedConversationRevision: current.revision,
    contextId: context.contextId,
    contextToken: context.contextToken,
    expectedContextRevision: context.revision,
    prompt,
    generation,
  });
}
const readTurn = (service, f, c, turnId) =>
  service.dispatch(uid, {
    action: 'getTurn',
    ...conversationFields(f, c),
    turnId,
  });
async function cleanupConversation(service, f, c) {
  let cleanup = (await mutate(service, 'deleteConversation', conversationFields(f, c))).result
    .current;
  for (let n = 0; n < 20 && cleanup.state !== 'deleted'; n++) {
    cleanup = (
      await mutate(service, 'advanceCleanup', {
        cleanupId: cleanup.cleanupId,
        cleanupToken: cleanup.cleanupToken,
        expectedRevision: cleanup.revision,
      })
    ).result.current;
  }
  assert.equal(cleanup.state, 'deleted');
  return cleanup;
}

test('SDK geração editor: claim atômico nos três alvos, replay durante execução e namespaces privados', async () => {
  for (const kind of ['book', 'adventure', 'block']) {
    const f = await fixture(kind),
      entered = deferred(),
      release = deferred(),
      observed = observedDb(admin);
    let calls = 0;
    const service = api({
      db: observed.db,
      generator: async (_input, onDelta) => {
        calls++;
        entered.resolve();
        await release.promise;
        await onDelta('Resposta ');
        await onDelta('[[SUGESTAO]]Prosa[[/SUGESTAO]]');
        return 'Resposta [[SUGESTAO]]Prosa[[/SUGESTAO]]';
      },
    });
    const context = await ready(service, f),
      c = await conversation(service, f);
    const request = await sendRequest(f, c, context),
      events = [],
      beforeQuota = (await quota())?.count ?? 0;
    const catalogBefore = await data(`users/${uid}/editorChatCatalogs/current`);
    observed.clear();
    const transport = {
      stream: (event) => {
        events.push(event);
      },
    };
    const sending = Promise.all([
      service.dispatch(uid, request, transport),
      service.dispatch(uid, request, transport),
    ]);
    let results;
    try {
      await Promise.race([
        entered.promise,
        sending.then(() => assert.fail('Gerador não iniciou.')),
      ]);
      const path = conversationPath(c),
        turnId = request.operationId;
      const required = [
        `${path}/turns/${turnId}`,
        `${path}/turnQuestions/${turnId}`,
        `${path}/turnBodies/${turnId}`,
        contextPath(context),
        `users/${uid}/editorChatContextBodies/${context.contextId}`,
        path,
        `users/${uid}/editorChatCatalogs/current`,
        `users/${uid}/chapterChatLimits/current`,
        `users/${uid}/editorChatOperations/${turnId}`,
      ];
      assert.ok(
        observed.attempts.some((writes) => required.every((p) => writes.some((w) => w.path === p))),
      );
      assert.ok(
        observed.attempts.some((writes) =>
          writes.some((w) => w.path === required[4] && w.method === 'delete'),
        ),
      );
      const control = await data(`${path}/turns/${turnId}`),
        storedReceipt = await data(required.at(-1));
      assert.equal(control.summary.state, 'running');
      assert.equal(control.summary.paid, false);
      assert.equal((await data(contextPath(context))).summary.phase, 'consumed');
      assert.equal((await admin.doc(required[4]).get()).exists, false);
      assert.equal((await data(path)).summary.activeTurnId, turnId);
      assert.equal((await data(path)).summary.revision, c.revision + 1);
      assert.equal((await data(required[6])).revision, catalogBefore.revision + 1);
      assert.equal((await quota()).count, beforeQuota + 1);
      assert.equal((await data(required[1])).question, request.prompt);
      assert.equal(JSON.stringify(control).includes('Pergunta própria'), false);
      assert.equal(JSON.stringify(storedReceipt).includes('Pergunta própria'), false);
      const replay = await service.dispatch(uid, request);
      assert.deepEqual(replay.receipt, storedReceipt.receipt);
      assert.equal(replay.turn.state, 'running');
      assert.equal(calls, 1);
      const otherContext = await ready(service, f);
      await assert.rejects(
        service.dispatch(uid, await sendRequest(f, c, otherContext)),
        reason('conversation-busy'),
      );
      assert.equal((await data(contextPath(otherContext))).summary.phase, 'ready');
    } finally {
      release.resolve();
      results = await sending;
    }
    const result = results.find((r) => r.turn.state === 'done');
    assert.ok(result);
    assert.deepEqual(results[0].receipt, results[1].receipt);
    assert.equal(result.turn.state, 'done');
    assert.equal(result.receipt.result.state, 'running');
    assert.deepEqual(
      events.map((e) => e.type),
      ['started', 'delta', 'delta', 'settled'],
    );
    assert.deepEqual(
      events.filter((e) => e.type === 'delta').map((e) => e.index),
      [0, 1],
    );
    const read = await readTurn(service, f, c, request.operationId);
    assert.equal(read.answer.suggestion, 'Prosa');
    assert.equal(read.answer.context.source.resource.kind, kind === 'block' ? 'block' : 'scene');
    observed.clear();
    assert.deepEqual((await service.dispatch(uid, request)).receipt, result.receipt);
    assert.equal(calls, 1);
    assert.equal(bodyReads(observed).length, 0);
    assert.equal((await quota()).count, beforeQuota + 1);
    assert.equal((await data(`users/${uid}`)).credits, 9);
    await assert.rejects(service.dispatch('intruder', request));
    await assert.rejects(service.dispatch(null, request), reason('auth-required'));
    if (kind === 'book')
      for (const path of [
        conversationPath(c),
        `${conversationPath(c)}/turns/${request.operationId}`,
        `${conversationPath(c)}/turnQuestions/${request.operationId}`,
        `${conversationPath(c)}/turnBodies/${request.operationId}`,
        `users/${uid}/editorChatOperations/${request.operationId}`,
        `users/${uid}/chapterChatLimits/current`,
      ])
        await privateDeny(path);
  }
});

test('SDK geração editor: quota compartilhada exata, fence e proveniência transitiva antes de corpos históricos', async () => {
  let clock = 5000,
    calls = 0;
  const service = api({
    now: () => clock,
    generator: async () => {
      calls++;
      return 'Resposta';
    },
  });
  const f = await fixture(),
    c = await conversation(service, f),
    context = await ready(service, f);
  const request = await sendRequest(f, c, context);
  // A real legacy chapterChat claim takes slot 60 in the SAME UID quota document.
  const legacy = createChapterChatService({
    db: admin,
    now: () => clock,
    generator: async () => 'Legado',
  });
  const legacyScope = { bookId: f.target.id, chapterId: f.groupId, conversationId: op('legacy') };
  await legacy.chapterChat(uid, { action: 'create', ...legacyScope });
  await admin.doc(`users/${uid}/chapterChatLimits/current`).set({ hour: 0, count: 59 });
  const legacySend = {
    action: 'send',
    ...legacyScope,
    requestId: op('legacy-send'),
    text: 'Pergunta',
    mode: 'platform',
    context: { source: 'chapter', text: '', surrounding: '', title: '', bookTitle: '', lore: [] },
  };
  assert.equal((await legacy.chapterChat(uid, legacySend)).state, 'done');
  assert.deepEqual(await quota(), { hour: 0, count: 60 });
  await assert.rejects(service.dispatch(uid, request), reason('chat-quota'));
  assert.equal(calls, 0);
  assert.equal((await data(contextPath(context))).summary.phase, 'ready');
  assert.equal(
    (await admin.doc(`users/${uid}/editorChatOperations/${request.operationId}`).get()).exists,
    false,
  );
  clock = 3600005;
  const result = await service.dispatch(uid, request);
  assert.equal(result.turn.state, 'done');
  assert.deepEqual(await quota(), { hour: 1, count: 1 });
  await service.dispatch(uid, request);
  assert.equal(calls, 1);
  assert.equal((await quota()).count, 1);
  await admin.doc(`users/${uid}/chapterChatLimits/current`).set({ hour: 1, count: 60 });
  await assert.rejects(
    legacy.chapterChat(uid, { ...legacySend, requestId: op('legacy-full') }),
    (error) => error.code === 'resource-exhausted',
  );
  const fencedContext = await ready(service, f),
    fenced = await sendRequest(f, c, fencedContext);
  const canceled = await service.dispatch(uid, {
    action: 'resolveOperation',
    operationId: fenced.operationId,
    operationAction: 'send',
    requestHash: fenced.requestHash,
    intent: 'cancel',
  });
  assert.deepEqual(await service.dispatch(uid, fenced), {
    receipt: canceled.receipt,
    turn: null,
    delivery: null,
    byokInput: null,
  });
  assert.equal((await data(contextPath(fencedContext))).summary.phase, 'ready');
  assert.equal(calls, 1);
  await admin.doc(`users/${uid}/chapterChatLimits/current`).set({ hour: 1, count: 0 });

  const worldId = await world(),
    loreFixture = await fixture('book', worldId),
    observed = observedDb(admin);
  const inputs = [],
    historyService = api({
      db: observed.db,
      now: () => clock,
      generator: async (input) => {
        inputs.push(input);
        return 'Resposta com contexto';
      },
    });
  const hc = await conversation(historyService, loreFixture);
  const a = await historyService.dispatch(
    uid,
    await sendRequest(loreFixture, hc, await ready(historyService, loreFixture)),
  );
  const own = await ready(historyService, loreFixture, 'Texto próprio sem nomes');
  const b = await historyService.dispatch(uid, await sendRequest(loreFixture, hc, own));
  assert.equal(inputs[1].context.lore.length, 0);
  assert.equal(inputs[1].history.length, 2);
  const storedB = await data(`${conversationPath(hc)}/turns/${b.turn.turnId}`);
  assert.ok(
    storedB.closureManifest.leaves.some(
      (leaf) => leaf.kind === 'lore' && leaf.reference.scopeId === worldId,
    ),
  );
  await linkWorld(loreFixture.target, null);
  const fresh = await ready(historyService, loreFixture, 'Texto próprio sem nomes');
  const third = await sendRequest(loreFixture, hc, fresh),
    beforeCount = (await quota()).count;
  observed.clear();
  await assert.rejects(historyService.dispatch(uid, third), reason('history-revoked'));
  assert.equal(bodyReads(observed).length, 0);
  assert.equal(inputs.length, 2);
  assert.equal((await quota()).count, beforeCount);
  assert.equal((await data(contextPath(fresh))).summary.phase, 'ready');
  observed.clear();
  const blocked = await readTurn(historyService, loreFixture, hc, b.turn.turnId);
  assert.equal(blocked.question, '  Pergunta própria\n');
  assert.equal(blocked.presentation, 'blocked');
  assert.equal(blocked.answer, null);
  assert.equal(bodyReads(observed).length, 0);
  const storedA = await data(`${conversationPath(hc)}/turns/${a.turn.turnId}`);
  assert.ok(
    storedA.closureManifest.leaves.every((leaf) =>
      storedB.closureManifest.leaves.some(
        (inherited) => JSON.stringify(inherited) === JSON.stringify(leaf),
      ),
    ),
  );
});

test('SDK geração editor: stop e revogação dentro dos callbacks impedem novas entregas', async () => {
  for (const mode of ['stop', 'revoke', 'started']) {
    const worldId = await world(),
      f = await fixture('adventure', worldId),
      events = [];
    let calls = 0,
      stoppedRequest;
    const service = api({
      generator: async (_input, onDelta) => {
        calls++;
        await onDelta('Primeiro');
        await onDelta('PRIVATE-SHOULD-NOT-DELIVER');
        return 'PrimeiroPRIVATE-SHOULD-NOT-DELIVER';
      },
    });
    const c = await conversation(service, f);
    const request = await sendRequest(f, c, await ready(service, f));
    const result = await service.dispatch(uid, request, {
      stream: async (event) => {
        events.push(event);
        if (event.type === 'started' && mode === 'started')
          await admin.doc(`universes/${worldId}`).update({ deleting: true });
        if (event.type === 'delta' && event.index === 0) {
          if (mode === 'stop')
            stoppedRequest = (
              await mutate(
                service,
                'stopTurn',
                turnFields(f, c, {
                  turnId: request.operationId,
                  attemptToken: event.attemptToken,
                }),
              )
            ).request;
          else await admin.doc(`universes/${worldId}`).update({ deleting: true });
        }
      },
    });
    assert.equal(result.turn.state, mode === 'stop' ? 'stopped' : 'blocked');
    assert.equal(calls, mode === 'started' ? 0 : 1);
    assert.deepEqual(
      events.filter((e) => e.type === 'delta').map((e) => e.text),
      mode === 'started' ? [] : ['Primeiro'],
    );
    assert.equal((await readTurn(service, f, c, request.operationId)).answer, null);
    assert.equal((await currentConversation(c)).activeTurnId, null);
    const body = await data(`${conversationPath(c)}/turnBodies/${request.operationId}`);
    assert.equal(body.answer, null);
    assert.equal(JSON.stringify(body).includes('PRIVATE-SHOULD-NOT-DELIVER'), false);
    const before = (await quota()).count;
    await service.dispatch(uid, request);
    if (stoppedRequest) assert.equal((await service.dispatch(uid, stoppedRequest)).current, null);
    assert.equal(calls, mode === 'started' ? 0 : 1);
    assert.equal((await quota()).count, before);
  }
});

test('SDK geração editor: BYOK recupera input, cerca tentativas e falhas; cleanup vence retorno tardio', async () => {
  const f = await fixture('block'),
    observed = observedDb(admin);
  let calls = 0;
  const options = {
    db: observed.db,
    generator: async () => {
      calls++;
      throw Error('PRIVATE-PROVIDER-SECRET');
    },
  };
  const service = api(options),
    c = await conversation(service, f);
  const request = await sendRequest(f, c, await ready(service, f), byok);
  const pending = await service.dispatch(uid, request);
  assert.equal(pending.turn.state, 'awaiting-byok');
  assert.equal(calls, 0);
  assert.equal(pending.byokInput.prompt, request.prompt);
  assert.deepEqual(pending.byokInput.generation.requested, byok);
  const reloaded = api(options),
    get = { action: 'getByokInput', ...turnFields(f, c, pending.turn) };
  assert.deepEqual((await reloaded.dispatch(uid, get)).input, pending.byokInput);
  assert.equal((await quota()).count, 1);
  await assert.rejects(
    reloaded.dispatch(uid, { ...get, attemptToken: '0'.repeat(64) }),
    reason('identity-changed'),
  );
  const wrong = await signed({
    action: 'completeBYOK',
    ...turnFields(f, c, pending.turn),
    attemptToken: '0'.repeat(64),
    operationId: op('wrong-attempt'),
    rawAnswer: 'Não gravar',
  });
  await assert.rejects(reloaded.dispatch(uid, wrong), reason('identity-changed'));
  const complete = await signed({
    action: 'completeBYOK',
    ...turnFields(f, c, pending.turn),
    operationId: op('complete'),
    rawAnswer: 'Resposta [[SUGESTAO]]Prosa BYOK[[/SUGESTAO]]',
  });
  const completed = await reloaded.dispatch(uid, complete);
  assert.equal(completed.current.state, 'done');
  assert.deepEqual(await reloaded.dispatch(uid, complete), {
    receipt: completed.receipt,
    current: null,
  });
  assert.equal(
    (await readTurn(reloaded, f, c, pending.turn.turnId)).answer.suggestion,
    'Prosa BYOK',
  );
  await admin.doc(rootPath(f.target)).update({ deleting: true });
  observed.clear();
  assert.equal((await reloaded.dispatch(uid, get)).input, null);
  assert.equal(bodyReads(observed).length, 0);
  await admin.doc(rootPath(f.target)).update({ deleting: false });
  const next = await reloaded.dispatch(
    uid,
    await sendRequest(f, c, await ready(reloaded, f), byok),
  );
  await admin.doc(rootPath(f.target)).delete();
  observed.clear();
  const stopped = await mutate(reloaded, 'stopTurn', turnFields(f, c, next.turn));
  assert.equal(stopped.result.current.state, 'stopped');
  assert.equal(bodyReads(observed).length, 0);
  await assert.rejects(
    reloaded.dispatch(
      uid,
      await signed({
        action: 'completeBYOK',
        ...turnFields(f, c, next.turn),
        operationId: op('late-complete'),
        rawAnswer: 'Tarde',
      }),
    ),
    reason('revision-conflict'),
  );
  assert.equal((await quota()).count, 2);
  assert.equal(calls, 0);

  const worldId = await world(),
    revokedFixture = await fixture('adventure', worldId);
  const rc = await conversation(reloaded, revokedFixture);
  const revoked = await reloaded.dispatch(
    uid,
    await sendRequest(revokedFixture, rc, await ready(reloaded, revokedFixture), byok),
  );
  const secondConversation = await conversation(reloaded, revokedFixture);
  const revokedCompletion = await reloaded.dispatch(
    uid,
    await sendRequest(
      revokedFixture,
      secondConversation,
      await ready(reloaded, revokedFixture),
      byok,
    ),
  );
  await admin.doc(`universes/${worldId}`).update({ deleting: true });
  observed.clear();
  const revokedInput = await reloaded.dispatch(uid, {
    action: 'getByokInput',
    ...turnFields(revokedFixture, rc, revoked.turn),
  });
  assert.equal(revokedInput.input, null);
  assert.equal(revokedInput.turn.state, 'blocked');
  assert.equal(bodyReads(observed).length, 0);
  assert.equal(
    (await readTurn(reloaded, revokedFixture, rc, revoked.turn.turnId)).question,
    request.prompt,
  );
  observed.clear();
  const rejectedAnswer = 'PRIVATE-REVOKED-BYOK-ANSWER';
  const blockedCompletion = await mutate(reloaded, 'completeBYOK', {
    ...turnFields(revokedFixture, secondConversation, revokedCompletion.turn),
    rawAnswer: rejectedAnswer,
  });
  assert.equal(blockedCompletion.result.current.state, 'blocked');
  assert.equal(bodyReads(observed).length, 0);
  assert.equal(
    JSON.stringify(
      await data(
        `${conversationPath(secondConversation)}/turnBodies/${revokedCompletion.turn.turnId}`,
      ),
    ).includes(rejectedAnswer),
    false,
  );

  const failedFixture = await fixture(),
    fc = await conversation(service, failedFixture);
  const failRequest = await sendRequest(failedFixture, fc, await ready(service, failedFixture));
  const failed = await service.dispatch(uid, failRequest);
  assert.equal(failed.turn.state, 'failed');
  assert.equal(failed.turn.failureReason, 'provider-unavailable');
  assert.equal(calls, 1);
  assert.equal((await readTurn(service, failedFixture, fc, failed.turn.turnId)).answer, null);
  for (const path of [
    conversationPath(fc),
    `${conversationPath(fc)}/turns/${failed.turn.turnId}`,
    `${conversationPath(fc)}/turnBodies/${failed.turn.turnId}`,
    `users/${uid}/editorChatOperations/${failRequest.operationId}`,
  ])
    assert.equal(JSON.stringify(await data(path)).includes('PRIVATE-PROVIDER-SECRET'), false);
  await service.dispatch(uid, failRequest);
  assert.equal(calls, 1);

  const deletingFixture = await fixture('adventure');
  let cleanup,
    cleanupCalls = 0;
  const deletingService = api({
    generator: async () => {
      cleanupCalls++;
      cleanup = await cleanupConversation(deletingService, deletingFixture, dc);
      return 'PRIVATE-LATE-ANSWER';
    },
  });
  const dc = await conversation(deletingService, deletingFixture);
  const late = await sendRequest(
    deletingFixture,
    dc,
    await ready(deletingService, deletingFixture),
  );
  const deleted = await deletingService.dispatch(uid, late);
  assert.equal(deleted.receipt.outcome, 'confirmed');
  assert.equal(deleted.turn, null);
  assert.equal(deleted.delivery, null);
  assert.equal(deleted.byokInput, null);
  assert.equal((await currentConversation(dc)).state, 'deleted');
  for (const namespace of ['turns', 'turnQuestions', 'turnBodies'])
    assert.equal(
      (
        await admin
          .collection(`${conversationPath(dc)}/${namespace}`)
          .limit(1)
          .get()
      ).empty,
      true,
    );
  assert.deepEqual((await deletingService.dispatch(uid, late)).receipt, deleted.receipt);
  assert.equal(cleanupCalls, 1);
  assert.equal(
    (
      await deletingService.dispatch(uid, {
        action: 'getCleanup',
        cleanupId: cleanup.cleanupId,
        cleanupToken: cleanup.cleanupToken,
      })
    ).state,
    'deleted',
  );
  assert.equal((await data(`users/${uid}`)).credits, 9);
});
