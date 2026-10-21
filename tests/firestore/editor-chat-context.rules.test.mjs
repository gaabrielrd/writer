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
  writeBatch,
  query,
  limit,
} from 'firebase/firestore';
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
const uid = 'context-author';
const prose = '<p>Aria Mundo. PRIVATE-MANUSCRIPT.</p>';
const privateLore = 'PRIVATE-LORE-ORIGINAL';
const previousMetadata = process.env.METADATA_SERVER_DETECTION;
let environment, admin, scenes, blocks, history, studio, universes, serial;
const op = (name) => `sdk-context-${name}-${++serial}`;
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
    projectId: 'demo-writer-editor-chat-context-tests',
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({
    projectId: 'demo-writer-editor-chat-context-tests',
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
    const contextBody = path.includes('/editorChatContextBodies/');
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

test('SDK contexto editor: três alvos reais, autorização e quatro namespaces privados', async () => {
  const observed = observedDb(admin),
    service = api(observed);
  const fixtures = [await fixture('book'), await fixture('adventure'), await fixture('block')];
  const contexts = [];
  for (const f of fixtures) {
    const current = await ready(service, f);
    contexts.push(current);
    const result = await inspect(service, f, current);
    assert.deepEqual(result.source.target, f.target);
    assert.deepEqual(result.source.resource, f.resource);
    assert.equal(result.source.containerScene === null, f.resource.kind === 'scene');
    assert.equal(result.frozen.capture.text, 'Aria Mundo');
    assert.equal(result.frozen.lore.length, 0);
    assert.equal(JSON.stringify(result.context).includes('PRIVATE-'), false);
    for (const actor of ['intruder', null]) {
      observed.clear();
      await assert.rejects(
        () => service.dispatch(actor, { action: 'getContext', ...contextFields(f, current) }),
        reason(actor ? 'context-unavailable' : 'auth-required'),
      );
      assert.equal(derivedReads(observed).length, 0);
    }
  }
  const f = fixtures[0],
    kept = contexts[0];
  const disposable = (await prepare(service, f)).result.current;
  const deleted = await mutation(service, 'deleteContext', contextFields(f, disposable));
  for (const path of [
    `users/${uid}/editorChatContexts/${kept.contextId}`,
    `users/${uid}/editorChatContextBodies/${kept.contextId}`,
    `users/${uid}/editorChatOperations/${kept.contextId}`,
    `users/${uid}/editorChatCleanup/${deleted.result.current.cleanupId}`,
  ])
    await privateDeny(path);
  const control = (
    await admin.doc(`users/${uid}/editorChatContexts/${kept.contextId}`).get()
  ).data();
  assert.equal(control.closureManifest.version, 1);
  assert.ok(control.closureManifest.leaves.length > 0);
  assert.equal(JSON.stringify(control).includes('PRIVATE-'), false);
  assert.equal((await admin.doc(`users/${uid}`).get()).data().credits, 9);
});

test('SDK contexto editor: paginação local completa, aliases qualificados e stale sem fallback', async () => {
  const worldId = await world();
  const f = await fixture('book', worldId),
    service = api();
  const database = client(),
    batch = writeBatch(database);
  for (let n = 0; n < 52; n++)
    batch.set(
      doc(database, rootPath(f.target), 'lore', 'filler_' + String(n).padStart(2, '0')),
      entity({ name: 'Other' + n, aliases: [] }),
    );
  batch.set(
    doc(database, rootPath(f.target), 'lore', 'zz_same'),
    entity({ name: 'Local', aliases: ['Aria'], details: 'PRIVATE-LOCAL-WINNER' }),
  );
  batch.update(doc(database, rootPath(f.target)), { localLoreVersion: 1 });
  await batch.commit();
  const initial = await prepare(service, f);
  let current = initial.result.current;
  assert.equal(current.scannedLocal, 0);
  assert.equal(current.scannedGlobal, 0);
  current = (await advance(service, f, current)).result.current;
  assert.equal(current.phase, 'local');
  assert.equal(current.scannedLocal, 50);
  assert.equal(current.scannedGlobal, 0);
  assert.equal(current.includedEntityCount, null);
  for (let n = 0; n < 10 && current.phase !== 'ready'; n++) {
    if (current.phase === 'local') assert.equal(current.scannedGlobal, 0);
    else assert.equal(current.scannedLocal, 53);
    current = (await advance(service, f, current)).result.current;
  }
  assert.equal(current.phase, 'ready');
  assert.equal(current.scannedLocal, 53);
  assert.equal(current.matchedEntityCount, 2);
  const frozen = (await inspect(service, f, current)).frozen;
  assert.deepEqual(
    frozen.lore.map((row) => row.reference),
    [
      { kind: 'book', scopeId: f.target.id, entityId: 'zz_same' },
      { kind: 'universe', scopeId: worldId, entityId: 'zz_same' },
    ],
  );
  assert.equal(frozen.lore[0].detailsExcerpt, 'PRIVATE-LOCAL-WINNER');
  const pending = (await prepare(service, f)).result.current;
  const remove = writeBatch(database);
  remove.delete(doc(database, rootPath(f.target), 'lore', 'zz_same'));
  remove.update(doc(database, rootPath(f.target)), { localLoreVersion: 2 });
  await remove.commit();
  const observed = observedDb(admin),
    guarded = api(observed);
  const stale = await advance(guarded, f, pending);
  assert.equal(stale.result.current.phase, 'stale');
  assert.equal(stale.result.current.revision, pending.revision + 1);
  assert.equal(derivedReads(observed).length, 0);
  await assert.rejects(() => inspect(guarded, f, current), reason('provenance-revoked'));
  assert.equal(derivedReads(observed).length, 0);
  const replacement = await ready(service, f);
  const next = (await inspect(service, f, replacement)).frozen;
  assert.equal(next.lore.length, 1);
  assert.deepEqual(next.lore[0].reference, {
    kind: 'universe',
    scopeId: worldId,
    entityId: 'zz_same',
  });
});

test('SDK contexto editor: manifesto precede corpos e distingue stale, revogação e encarnações nativas', async () => {
  const worldId = await world(),
    f = await fixture('block', worldId);
  const observed = observedDb(admin),
    service = api(observed);
  const original = await ready(service, f);
  const originalView = await inspect(service, f, original);
  const identity = originalView.frozen.lore[0].identityToken;
  const controlRef = admin.doc(`users/${uid}/editorChatContexts/${original.contextId}`);
  const validControl = (await controlRef.get()).data();
  await controlRef.update({ closureHash: '0'.repeat(64) });
  observed.clear();
  await assert.rejects(() => inspect(service, f, original), reason('inconsistent'));
  assert.equal(derivedReads(observed).length, 0);
  await controlRef.update({ closureHash: validControl.closureHash });
  await universes.saveUniverseLore(uid, {
    universeId: worldId,
    id: 'zz_same',
    create: false,
    input: entity({ details: 'PRIVATE-LORE-EDITED' }),
  });
  const old = await inspect(service, f, original);
  assert.equal(old.freshness, 'stale');
  assert.equal(old.frozen.lore[0].detailsExcerpt, privateLore);
  assert.equal(old.frozen.lore[0].identityToken, identity);
  const edited = await ready(service, f);
  const editedView = await inspect(service, f, edited);
  assert.equal(editedView.frozen.lore[0].detailsExcerpt, 'PRIVATE-LORE-EDITED');
  assert.equal(editedView.frozen.lore[0].identityToken, identity);
  await admin.doc(`universes/${worldId}`).update({ deleting: true });
  observed.clear();
  await assert.rejects(() => inspect(service, f, edited), reason('provenance-revoked'));
  assert.ok(
    observed.reads.some(
      (read) => read.path === `users/${uid}/editorChatContexts/${edited.contextId}`,
    ),
  );
  assert.equal(derivedReads(observed).length, 0);
  await admin.doc(`universes/${worldId}`).update({ deleting: false });
  const restored = await inspect(service, f, edited);
  assert.equal(restored.frozen.lore[0].identityToken, identity);

  const loreRef = admin.doc(`universes/${worldId}/lore/zz_same`),
    firstBirth = (await loreRef.get()).createTime;
  await loreRef.delete();
  await universes.saveUniverseLore(uid, {
    universeId: worldId,
    id: 'zz_same',
    create: true,
    input: entity(),
  });
  assert.notDeepEqual((await loreRef.get()).createTime, firstBirth);
  observed.clear();
  await assert.rejects(() => inspect(service, f, edited), reason('provenance-revoked'));
  assert.equal(derivedReads(observed).length, 0);
  const recreated = await ready(service, f),
    recreatedView = await inspect(service, f, recreated);
  assert.notEqual(recreatedView.frozen.lore[0].identityToken, identity);
  const pending = (await prepare(service, f)).result.current;
  assert.equal(pending.phase, 'local');

  const sceneRef = admin.doc(`${rootPath(f.target)}/scenes/${f.sceneId}`),
    sceneBefore = await sceneRef.get();
  const bodyRef = admin.doc(`${rootPath(f.target)}/sceneBlocks/${f.resource.id}/body/current`),
    bodyBefore = await bodyRef.get();
  await sceneRef.delete();
  await sceneRef.create(sceneBefore.data());
  assert.notDeepEqual((await sceneRef.get()).createTime, sceneBefore.createTime);
  assert.deepEqual((await bodyRef.get()).createTime, bodyBefore.createTime);
  observed.clear();
  await assert.rejects(() => inspect(service, f, pending), reason('identity-changed'));
  assert.equal(derivedReads(observed).length, 0);
  observed.clear();
  await assert.rejects(() => inspect(service, f, recreated), reason('provenance-revoked'));
  assert.equal(derivedReads(observed).length, 0);
  const current = await ready(service, f);
  assert.notEqual(current.resourceToken, recreated.resourceToken);
  assert.equal((await admin.doc(`users/${uid}`).get()).data().credits, 9);
});

test('SDK contexto editor: persona raiz sem cena, CAS, recibos, fence e cleanup sem origem', async () => {
  const adventure = await studio.createAdventure(uid, {
    operationId: op('empty-adventure'),
    title: 'Sem cenas',
  });
  const service = api();
  const rootRequest = {
    action: 'getAdventurePersonaBinding',
    adventureId: adventure.id,
    sceneId: null,
  };
  const original = await service.dispatch(uid, rootRequest);
  assert.equal((await admin.collection(`adventures/${adventure.id}/scenes`).get()).size, 0);
  const fields = {
    adventureId: adventure.id,
    adventureToken: original.adventureToken,
    sceneId: null,
    expectedBindingToken: original.bindingToken,
    value: { personaId: 'preset-epic' },
  };
  const changed = await mutation(service, 'setAdventurePersonaBinding', fields);
  assert.deepEqual(changed.result.current.value, { personaId: 'preset-epic' });
  assert.equal(changed.result.current.personaRevision, original.personaRevision + 1);
  const replay = await service.dispatch(uid, changed.request);
  assert.deepEqual(replay.receipt, changed.result.receipt);
  assert.equal(
    (await service.dispatch(uid, rootRequest)).personaRevision,
    changed.result.current.personaRevision,
  );
  await assert.rejects(
    () =>
      mutation(service, 'setAdventurePersonaBinding', {
        ...fields,
        value: { personaId: 'preset-incisive' },
      }),
    reason('revision-conflict'),
  );
  const canceledRequest = {
    action: 'setAdventurePersonaBinding',
    ...fields,
    operationId: op('fenced-persona'),
    expectedBindingToken: changed.result.current.bindingToken,
    value: { personaId: 'preset-incisive' },
  };
  canceledRequest.requestHash = await editorChatRequestHash(canceledRequest);
  const fence = await service.dispatch(uid, {
    action: 'resolveOperation',
    operationId: canceledRequest.operationId,
    operationAction: canceledRequest.action,
    requestHash: canceledRequest.requestHash,
    intent: 'cancel',
  });
  assert.equal(fence.state, 'settled');
  assert.equal(fence.receipt.outcome, 'canceled');
  assert.equal((await service.dispatch(uid, canceledRequest)).receipt.outcome, 'canceled');
  assert.deepEqual((await service.dispatch(uid, rootRequest)).value, { personaId: 'preset-epic' });

  const target = { kind: 'adventure', id: adventure.id };
  const part = await scenes.createSceneGroup(uid, {
    target,
    operationId: op('persona-part'),
    title: 'Parte',
  });
  const scene = (
    await scenes.createScene(uid, {
      target,
      operationId: op('persona-scene'),
      parentId: part.id,
      title: 'Cena',
      content: prose,
    })
  ).scene;
  const additional = await blocks.createAdventureBlock(uid, {
    adventureId: adventure.id,
    sceneId: scene.id,
    operationId: op('persona-block'),
    title: 'Adicional',
    content: prose,
    audience: 'creator',
  });
  const sceneBinding = await service.dispatch(uid, { ...rootRequest, sceneId: scene.id });
  await mutation(service, 'setAdventurePersonaBinding', {
    adventureId: adventure.id,
    adventureToken: sceneBinding.adventureToken,
    sceneId: scene.id,
    expectedBindingToken: sceneBinding.bindingToken,
    value: { personaComplement: { personaId: 'preset-unsettling', overrides: [] } },
  });
  const f = { target, resource: additional.block.resource };
  const context = await ready(service, f);
  const view = await inspect(service, f, context);
  assert.equal(view.frozen.persona.base.id, 'preset-epic');
  assert.equal(view.frozen.persona.complement.id, 'preset-unsettling');
  const savedBody = await admin
    .doc(`adventures/${adventure.id}/sceneBlocks/${f.resource.id}/body/current`)
    .get();
  await admin.doc(`adventures/${adventure.id}`).delete();
  const observed = observedDb(admin),
    cleanupService = api(observed);
  const deletion = await mutation(cleanupService, 'deleteContext', contextFields(f, context));
  let cleanup = deletion.result.current;
  for (let n = 0; n < 5 && cleanup.state !== 'deleted'; n++) {
    observed.writes.length = 0;
    cleanup = (
      await mutation(cleanupService, 'advanceCleanup', {
        cleanupId: cleanup.cleanupId,
        cleanupToken: cleanup.cleanupToken,
        expectedRevision: cleanup.revision,
      })
    ).result.current;
    assert.ok(observed.writes.length <= 50);
  }
  assert.equal(cleanup.state, 'deleted');
  assert.equal(cleanup.phase, 'complete');
  assert.equal(derivedReads(observed).length, 0);
  assert.ok(observed.reads.length > 0);
  const retried = await cleanupService.dispatch(uid, deletion.request);
  assert.deepEqual(retried.receipt, deletion.result.receipt);
  const terminal = await cleanupService.dispatch(uid, {
    action: 'getCleanup',
    cleanupId: cleanup.cleanupId,
    cleanupToken: cleanup.cleanupToken,
  });
  assert.equal(terminal.state, 'deleted');
  assert.equal(derivedReads(observed).length, 0);
  assert.equal(
    (await admin.doc(`users/${uid}/editorChatContextBodies/${context.contextId}`).get()).exists,
    false,
  );
  assert.equal((await admin.doc(`adventures/${adventure.id}`).get()).exists, false);
  assert.deepEqual((await savedBody.ref.get()).data(), savedBody.data());
  assert.equal((await admin.doc(`users/${uid}`).get()).data().credits, 9);
});
