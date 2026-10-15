import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
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
import { createAdventureBlocksService } from '../../functions/src/adventureBlocks.mjs';
import { createScenesService } from '../../functions/src/scenes.mjs';
import { createWorkHistoryService } from '../../functions/src/workHistory.mjs';
import { createWorkProgressService } from '../../functions/src/workProgress.mjs';
import { digest } from '../../functions/src/sceneContracts.mjs';

const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-adventure-blocks-tests',
  target = { kind: 'adventure', id: 'adventure' },
  path = 'adventures/adventure',
  op = (name) => 'blocks-sdk-operation-' + name,
  previousMetadata = process.env.METADATA_SERVER_DETECTION;
let environment, admin, api, scenes, history, progress, sceneId, groupId;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!address) throw new Error('Use somente o emulador demo.');
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
  api = createAdventureBlocksService({ db: admin });
  scenes = createScenesService({ db: admin });
  history = createWorkHistoryService({ db: admin });
  progress = createWorkProgressService({ db: admin });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await admin
    .doc(path)
    .set({ ownerId: 'author', title: 'Aventura', status: 'draft', createdAt: 1, updatedAt: 100 });
  const group = await scenes.createSceneGroup('author', {
    target,
    operationId: op('part'),
    title: 'Parte',
  });
  groupId = group.id;
  const result = await scenes.createScene('author', {
    target,
    operationId: op('scene'),
    parentId: groupId,
    title: 'Cena secreta',
    content: 'Texto principal',
  });
  sceneId = result.scene.id;
});
after(async () => {
  await admin?.terminate();
  await environment?.cleanup();
  if (previousMetadata === undefined) delete process.env.METADATA_SERVER_DETECTION;
  else process.env.METADATA_SERVER_DETECTION = previousMetadata;
});
const client = (uid) =>
  uid
    ? environment.authenticatedContext(uid).firestore()
    : environment.unauthenticatedContext().firestore();
const scene = async () => (await admin.doc(path + '/scenes/' + sceneId).get()).data();
const create = (name, fields = {}) =>
  api.createAdventureBlock('author', {
    adventureId: target.id,
    sceneId,
    operationId: op(name),
    title: name,
    content: 'Texto adicional privado',
    ...fields,
  });
const source = (resource) => history.getWorkVersionSource('author', { target, resource });
async function prepare() {
  for (let i = 0; i < 20; i++) {
    const result = await progress.prepareWorkWordCount('author', {
      target,
      operationId: op('prepare'),
      limit: 1,
    });
    if (result.complete) return result;
  }
  assert.fail('Preparation did not finish');
}

test('SDK additional bodies and operations remain server-only even when classified for players', async () => {
  const created = await create('private', { audience: 'players' });
  const paths = [
    path + '/sceneBlocks/' + created.block.resource.id,
    path + '/sceneBlocks/' + created.block.resource.id + '/body/current',
    'users/author/adventureBlockOperations/' + op('private'),
  ];
  for (const uid of ['author', 'other', null]) {
    for (const location of paths) {
      await assertFails(getDoc(doc(client(uid), location)));
      await assertFails(setDoc(doc(client(uid), location), { forged: true }));
      await assertFails(deleteDoc(doc(client(uid), location)));
    }
    await assertFails(getDocs(query(collection(client(uid), path + '/sceneBlocks'), limit(25))));
    await assertFails(
      updateDoc(doc(client(uid), path + '/scenes/' + sceneId), {
        blockWordCount: 999,
        mainBlockAudience: 'players',
      }),
    );
  }
  assert.equal(
    await api.getAdventureBlock('other', {
      adventureId: target.id,
      resource: created.block.resource,
    }),
    null,
  );
  const before = await admin.doc(path + '/scenes/' + sceneId).get();
  const listed = await api.listAdventureBlocks('author', { adventureId: target.id, sceneId });
  const after = await admin.doc(path + '/scenes/' + sceneId).get();
  assert.equal(after.updateTime.isEqual(before.updateTime), true);
  assert.equal(listed.items[0].audience, 'creator');
  assert.equal(listed.mainBodyHash, digest('Texto principal'));
});

test('SDK concurrent block writes and principal autosave retain all text with atomic canonical ledger', async () => {
  const a = await create('first'),
    b = await create('second');
  await prepare();
  const results = await Promise.allSettled([
    api.updateAdventureBlock('author', {
      adventureId: target.id,
      resource: a.block.resource,
      operationId: op('edit-first'),
      expectedRevision: 1,
      patch: { content: 'Primeiro novo' },
    }),
    api.updateAdventureBlock('author', {
      adventureId: target.id,
      resource: b.block.resource,
      operationId: op('edit-second'),
      expectedRevision: 1,
      patch: { content: 'Segundo novo agora' },
    }),
  ]);
  assert.ok(results.every((result) => result.status === 'fulfilled'));
  const savedScene = await scene();
  const race = await Promise.allSettled([
    scenes.updateScene('author', {
      target,
      sceneId,
      operationId: op('main-race'),
      expectedRevision: savedScene.revision,
      patch: { content: 'Principal concorrente' },
    }),
    api.updateAdventureBlock('author', {
      adventureId: target.id,
      resource: a.block.resource,
      operationId: op('child-race'),
      expectedRevision: 2,
      patch: { content: 'Filho concorrente final' },
    }),
  ]);
  assert.equal(race[1].status, 'fulfilled');
  if (race[0].status === 'rejected')
    assert.equal(race[0].reason.details?.reason, 'revision-conflict');
  const current = await scene(),
    mainBody = (await admin.doc(path + '/scenes/' + sceneId + '/body/current').get()).data()
      .content;
  assert.equal(
    mainBody,
    race[0].status === 'fulfilled' ? 'Principal concorrente' : 'Texto principal',
  );
  assert.equal(current.wordCount, 8);
  assert.equal((await progress.getWorkProgress('author', { target })).manuscript.wordCount, 8);
  assert.equal((await admin.doc(path + '/parts/' + groupId).get()).data().wordCount, 8);
  assert.equal(race[1].value.mainBodyHash, digest(mainBody));
  const child = await api.getAdventureBlock('author', {
    adventureId: target.id,
    resource: a.block.resource,
  });
  assert.equal(child.content, 'Filho concorrente final');
});

test('SDK text history restores only intended block, preserves metadata and principal extras with predecessor', async () => {
  const a = await create('history', { audience: 'gm', narrativeType: 'clue' }),
    initial = await source(a.block.resource);
  const captured = await history.createWorkVersion('author', {
    target,
    resource: a.block.resource,
    operationId: op('capture-child'),
    expectedSourceToken: initial.sourceToken,
  });
  const principal = { kind: 'scene', id: sceneId },
    mainInitial = await source(principal);
  const mainVersion = await history.createWorkVersion('author', {
    target,
    resource: principal,
    operationId: op('capture-main'),
    expectedSourceToken: mainInitial.sourceToken,
  });
  await prepare();
  await api.updateAdventureBlock('author', {
    adventureId: target.id,
    resource: a.block.resource,
    operationId: op('edit-history'),
    expectedRevision: 1,
    patch: { content: 'Curto', audience: 'players' },
  });
  const request = {
    target,
    resource: a.block.resource,
    versionId: captured.version.id,
    operationId: op('restore-child'),
    expectedSourceToken: (await source(a.block.resource)).sourceToken,
  };
  const restored = await history.restoreWorkVersion('author', request);
  assert.equal(restored.source.content, initial.content);
  assert.equal(restored.source.sceneWordCount, 5);
  assert.equal(restored.previousVersion.reason, 'before-restore');
  assert.deepEqual(await history.restoreWorkVersion('author', request), restored);
  assert.equal(
    (await api.getAdventureBlock('author', { adventureId: target.id, resource: a.block.resource }))
      .audience,
    'players',
  );
  await scenes.updateScene('author', {
    target,
    sceneId,
    operationId: op('edit-main'),
    expectedRevision: (await scene()).revision,
    patch: { content: 'Mudado' },
  });
  const mainRestored = await history.restoreWorkVersion('author', {
    target,
    resource: principal,
    versionId: mainVersion.version.id,
    operationId: op('restore-main'),
    expectedSourceToken: (await source(principal)).sourceToken,
  });
  assert.equal(mainRestored.source.content, 'Texto principal');
  assert.equal(mainRestored.source.sceneWordCount, 5);
  assert.equal((await scene()).blockWordCount, 3);
  assert.equal((await progress.getWorkProgress('author', { target })).manuscript.wordCount, 5);
});

test('SDK pagination, adjacent movement, verification conflict and repeat deletion retain stable boundaries', async () => {
  const a = await create('a'),
    b = await create('b'),
    c = await create('c');
  const moved = await api.moveAdventureBlock('author', {
    adventureId: target.id,
    resource: { kind: 'scene', id: sceneId },
    operationId: op('move-main'),
    expectedRevision: c.sceneRevision,
    expectedStructureRevision: c.structureRevision,
    direction: 'down',
  });
  const first = await api.listAdventureBlocks('author', {
    adventureId: target.id,
    sceneId,
    limit: 1,
  });
  assert.deepEqual(first.items[0].resource, a.block.resource);
  const second = await api.listAdventureBlocks('author', {
    adventureId: target.id,
    sceneId,
    limit: 1,
    cursor: first.nextCursor,
  });
  assert.equal(second.items[0].resource.kind, 'scene');
  const request = {
    adventureId: target.id,
    sceneId,
    operationId: op('verify'),
    expectedSceneRevision: moved.sceneRevision,
    limit: 1,
  };
  const partial = await api.verifyAdventureBlockCount('author', request);
  assert.equal(partial.complete, false);
  assert.equal(partial.sceneWordCount, null);
  const updated = await api.updateAdventureBlock('author', {
    adventureId: target.id,
    resource: b.block.resource,
    operationId: op('edit-between-verify'),
    expectedRevision: 1,
    patch: { content: 'Outro texto maior aqui' },
  });
  await assert.rejects(
    api.verifyAdventureBlockCount('author', request),
    (error) => error.details?.reason === 'revision-conflict',
  );
  assert.equal((await scene()).wordCount, updated.sceneWordCount);
  const remove = {
    adventureId: target.id,
    blockId: b.block.resource.id,
    operationId: op('delete'),
    expectedRevision: updated.block.revision,
  };
  const deleted = await api.deleteAdventureBlock('author', remove);
  assert.equal(deleted.complete, true);
  assert.deepEqual(await api.deleteAdventureBlock('author', remove), deleted);
  assert.equal(
    await api.getAdventureBlock('author', { adventureId: target.id, resource: b.block.resource }),
    null,
  );
  assert.equal((await scene()).wordCount, 8);
});

test('SDK count recovery obtains authentic status without cache before explicit verification and normal editing', async () => {
  await create('recovery-a');
  await create('recovery-b');
  await prepare();
  const sceneRef = admin.doc(path + '/scenes/' + sceneId);
  await sceneRef.update({ blockWordCount: null });
  await assert.rejects(scenes.getScene('author', { target, sceneId }), {
    code: 'failed-precondition',
  });
  const before = await sceneRef.get();
  const status = await api.getAdventureBlockCountStatus('author', {
    adventureId: target.id,
    sceneId,
  });
  assert.equal(status.sceneRevision, before.data().revision);
  assert.equal(status.mainBodyHash, digest('Texto principal'));
  assert.equal(status.sceneWordCount, null);
  assert.equal(status.needsVerification, true);
  assert.equal(status.repairable, true);
  assert.equal((await sceneRef.get()).updateTime.isEqual(before.updateTime), true);
  assert.equal(
    await api.getAdventureBlockCountStatus('other', { adventureId: target.id, sceneId }),
    null,
  );
  const recovered = await api.verifyAdventureBlockCount('author', {
    adventureId: target.id,
    sceneId,
    operationId: op('recover-without-cache'),
    expectedSceneRevision: status.sceneRevision,
  });
  assert.equal(recovered.complete, true);
  assert.equal(recovered.sceneWordCount, 8);
  const normal = await scenes.getScene('author', { target, sceneId });
  assert.equal(normal.content, 'Texto principal');
  assert.equal(normal.wordCount, 8);
  assert.equal((await progress.getWorkProgress('author', { target })).manuscript.wordCount, 8);
  const healthy = await api.getAdventureBlockCountStatus('author', {
    adventureId: target.id,
    sceneId,
  });
  assert.equal(healthy.needsVerification, false);
  assert.equal(healthy.sceneWordCount, 8);
  await sceneRef.update({ mainWordCount: null });
  const irreparable = await api.getAdventureBlockCountStatus('author', {
    adventureId: target.id,
    sceneId,
  });
  assert.equal(irreparable.repairable, false);
  assert.equal(irreparable.sceneWordCount, null);
});
