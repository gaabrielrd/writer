import assert from 'node:assert/strict';
import { adventureDeletionDb } from '../../../../functions/test/helpers/adventureDeletionDb.mjs';
import { createAdventureDeletionService } from '../../../../functions/src/adventureDeletion.mjs';
import { createStudioService } from '../../../../functions/src/studio.mjs';
import { createScenesService } from '../../../../functions/src/scenes.mjs';
import { createAdventureBlocksService } from '../../../../functions/src/adventureBlocks.mjs';
import { createWorkProgressService } from '../../../../functions/src/workProgress.mjs';
import { createEditorChatConversationsService } from '../../../../functions/src/editorChatConversations.mjs';
import { createEditorChatGenerationService } from '../../../../functions/src/editorChatGeneration.mjs';
import { createCampaignCaptureService } from '../../../../functions/src/campaignCapture.mjs';
import { createCampaignBaseReadService } from '../../../../functions/src/campaignBaseRead.mjs';
import { createCampaignNotesService } from '../../../../functions/src/campaignNotes.mjs';
import { signed } from '../../../../functions/test/helpers/editorChatFixture.mjs';
import { ARCHIVE_NAMES } from '../../../../functions/src/adventureRestoreArchiveContracts.mjs';
import { digest } from '../../../../functions/src/workProgressContracts.mjs';
import { captureAdventure } from './adventureRoundtripFixture.mjs';
const uid = 'author',
  op = (suffix) => 'restored-deletion-' + suffix;
const snapshot = (f, predicate) =>
  structuredClone([...f.records].filter(([path, value]) => predicate(path, value)));
const storageSnapshot = (storage) =>
  new Map(
    [...storage.versions].map(([path, versions]) => [
      path,
      new Map(
        [...versions].map(([generation, value]) => [
          generation,
          {
            metadata: structuredClone(value.metadata),
            bytes: Buffer.from(value.bytes),
          },
        ]),
      ),
    ]),
  );
async function conversation(f, rich) {
  const conversations = createEditorChatConversationsService({ db: f.db, now: () => 6000 }),
    catalog = await conversations.dispatch(uid, { action: 'listConversations', ...rich.scope }),
    current = (
      await conversations.dispatch(
        uid,
        await signed({
          action: 'createConversation',
          ...rich.scope,
          conversationId: op('conversation'),
          operationId: op('conversation'),
          projectToken: catalog.projectToken,
          resourceToken: catalog.resourceToken,
        }),
      )
    ).current;
  const turnScope = {
      ...rich.scope,
      conversationId: current.conversationId,
      conversationToken: current.conversationToken,
    },
    generation = createEditorChatGenerationService({
      db: f.db,
      now: () => 6000,
      generator: () =>
        Promise.resolve('Private answer [[SUGESTAO]]Private suggestion[[/SUGESTAO]]'),
    }),
    prompt = 'Minha pergunta própria 🐉\n',
    turn = (
      await generation.dispatch(
        uid,
        await signed({
          action: 'send',
          ...turnScope,
          operationId: op('turn'),
          contextId: rich.context.contextId,
          contextToken: rich.context.contextToken,
          expectedContextRevision: rich.context.revision,
          expectedConversationRevision: current.revision,
          prompt,
          generation: { version: 1, provider: 'platform', model: null, reasoning: 'auto' },
        }),
      )
    ).turn,
    get = () =>
      conversations.dispatch(uid, { action: 'getTurn', ...turnScope, turnId: turn.turnId });
  assert.notEqual((await get()).answer, null);
  const parent = 'users/' + uid + '/editorChats/' + current.conversationId;
  return {
    get,
    prompt,
    body: parent + '/turnBodies/' + turn.turnId,
    question: parent + '/turnQuestions/' + turn.turnId,
  };
}
async function campaign(f) {
  const capture = createCampaignCaptureService({
      db: f.db,
      assets: f.backupAssets,
      now: () => 6500,
    }),
    source = await capture.getCampaignCaptureSource(uid, { adventureId: f.target.id });
  let p = await capture.startCampaignCapture(uid, {
    adventureId: f.target.id,
    expectedSourceToken: source.sourceToken,
    operationId: op('campaign-capture'),
    title: 'Mesa preservada da cópia',
    description: 'Descrição própria',
    universeId: null,
  });
  for (let n = 0; p.state === 'preparing'; n++) {
    assert.ok(n < 200, 'campaign preparation converges');
    p = await capture.advanceCampaignCapture(uid, {
      captureId: p.captureId,
      expectedCheckpoint: p.checkpoint,
      operationId: op('campaign-step-' + n),
    });
  }
  assert.equal(p.state, 'prepared');
  const activated = await capture.activateCampaignCapture(uid, {
    captureId: p.captureId,
    expectedCheckpoint: p.checkpoint,
    operationId: op('campaign-activate'),
  });
  assert.equal(activated.kind, 'activated');
  const id = activated.campaign.id,
    base = createCampaignBaseReadService({ db: f.db, assets: f.backupAssets }),
    notes = createCampaignNotesService({ db: f.db, now: () => 6600 }),
    list = await notes.listCampaignNotes(uid, { campaignId: id }),
    noteId = op('own-note');
  await base.getCampaignBase(uid, { campaignId: id });
  await notes.saveCampaignNote(uid, {
    campaignId: id,
    campaignToken: list.campaignToken,
    noteId,
    operationId: noteId,
    expectedRevision: 0,
    title: 'Minha nota',
    content: 'Consequência privada da mesa 🐉',
  });
  return { id, base, notes, noteId, token: list.campaignToken };
}
/** Verify deletion on the exact output of the ordinary capture/restore consumer journey. */
export async function assertRestoredAdventureDeletion(f, rich = null) {
  adventureDeletionDb(f);
  const studio = createStudioService({ db: f.db, now: () => 7000 }),
    scenes = createScenesService({ db: f.db, now: () => 7000 }),
    blocks = createAdventureBlocksService({ db: f.db, now: () => 7000 }),
    activity = createWorkProgressService({ db: f.db, now: () => 7000 }),
    sibling = await studio.createAdventure(uid, {
      operationId: op('sibling'),
      title: 'Aventura irmã preservada',
    }),
    siblingTarget = { kind: 'adventure', id: sibling.id },
    siblingScene = (
      await scenes.createScene(uid, {
        target: siblingTarget,
        parentId: null,
        operationId: op('sibling-scene'),
        title: 'Cena irmã',
        content: 'Texto próprio da irmã',
      })
    ).scene;
  let chat = null,
    table = null,
    imagesBefore = [];
  if (rich) {
    await blocks.setAdventureBlockImage(uid, {
      adventureId: sibling.id,
      resource: { kind: 'scene', id: siblingScene.id },
      operationId: op('sibling-image'),
      expectedRevision: siblingScene.revision,
      image: { imageId: rich.imageId, alt: 'Imagem compartilhada', caption: '' },
    });
    chat = await conversation(f, rich);
    table = await campaign(f);
    const ownLinks = snapshot(
      f,
      (path, value) =>
        path.includes('/imageLibrary/') &&
        path.includes('/uses/') &&
        value.kind === 'adventure-block' &&
        value.adventureId === f.target.id,
    );
    assert.equal(
      ownLinks.length,
      2,
      'restored scene and block each retain an original native image use',
    );
    assert.deepEqual(
      new Set(ownLinks.map(([, value]) => value.resource.kind)),
      new Set(['scene', 'block']),
    );
    for (const [, value] of ownLinks)
      assert.deepEqual(
        value.resource,
        value.resource.kind === 'scene' ? { kind: 'scene', id: rich.scene.id } : rich.blockResource,
      );
    imagesBefore = snapshot(
      f,
      (path) => path.startsWith('users/' + uid + '/imageLibrary/') && path.split('/').length === 4,
    ).map(([path, value]) => [
      path,
      value,
      ownLinks.filter(([usePath]) => usePath.startsWith(path + '/uses/')).length,
    ]);
    assert.equal(
      imagesBefore.length,
      2,
      'normal restoration creates one independent copy per captured resource',
    );
    await activity.recordWorkActivity(uid, {
      target: f.target,
      resource: { kind: 'scene', id: rich.scene.id },
      operationId: op('activity'),
      expectedActivityRevision:
        f.records.get('users/' + uid + '/workActivityState/current')?.revision ?? 0,
    });
  }
  if (rich) {
    for (const family of [
      'parts',
      'scenes',
      'sceneBlocks',
      'arcs',
      'timelineEvents',
      'lore',
      'loreBodies',
      'workProgress',
      'workChecklist',
      'workVersions',
      'workVersionBodies',
    ])
      assert.ok(
        snapshot(f, (path) => path.startsWith(f.rootPath + '/' + family + '/')).length > 0,
        family + ' is populated before deletion',
      );
    assert.ok(snapshot(f, (path) => path.startsWith('users/' + uid + '/aiPersonas/')).length > 0);
    assert.ok(f.records.has(chat.question));
  }
  await activity.recordWorkActivity(uid, {
    target: siblingTarget,
    resource: { kind: 'scene', id: siblingScene.id },
    operationId: op('sibling-activity'),
    expectedActivityRevision:
      f.records.get('users/' + uid + '/workActivityState/current')?.revision ?? 0,
  });
  const activityState = structuredClone(
    f.records.get('users/' + uid + '/workActivityState/current'),
  );
  const kept = snapshot(
      f,
      (path, value) =>
        path === 'adventures/' + sibling.id ||
        path.startsWith('adventures/' + sibling.id + '/') ||
        (table &&
          (path === 'campaigns/' + table.id || path.startsWith('campaigns/' + table.id + '/'))) ||
        path === 'users/' + uid + '/workActivity/' + digest(siblingTarget) ||
        path.startsWith('users/' + uid + '/aiPersonas/') ||
        path === f.path ||
        path.startsWith('users/' + uid + '/adventureRestoreOperations/') ||
        path.startsWith('users/' + uid + '/editorChatOperations/') ||
        (path.includes('/imageLibrary/') &&
          path.includes('/uses/') &&
          !(value.kind === 'adventure-block' && value.adventureId === f.target.id)) ||
        path === chat?.question,
    ),
    storage = storageSnapshot(f.storage),
    api = createAdventureDeletionService({ db: f.db, assets: f.assets, now: () => 9000 }),
    source = await api.getAdventureDeletionSource(uid, { adventureId: f.target.id }),
    input = {
      adventureId: f.target.id,
      adventureToken: source.adventureToken,
      sourceToken: source.sourceToken,
      expectedRevision: source.revision,
      operationId: op('start'),
    },
    initial = await api.startAdventureDeletion(uid, input);
  let p = initial.progress,
    last = null,
    lost = false;
  const phases = new Set();
  for (let n = 0; !p.complete; n++) {
    assert.ok(n < 1500, 'bounded native cleanup converges');
    phases.add(p.phase);
    const request = {
        deletionId: p.deletionId,
        deletionToken: p.deletionToken,
        expectedCheckpoint: p.checkpoint,
        operationId: op('step-' + String(n).padStart(6, '0')),
      },
      job = f.records.get('users/' + uid + '/adventureDeletions/' + p.deletionId);
    if (!rich && p.phase === 'verify' && job.part === 4) {
      const run = f.db.runTransaction.bind(f.db);
      let armed = true;
      f.db.runTransaction = async (callback) => {
        const value = await run(callback);
        if (armed) {
          armed = false;
          throw Error('Restored terminal ACK lost');
        }
        return value;
      };
      await assert.rejects(
        () => api.advanceAdventureDeletion(uid, request),
        /Restored terminal ACK lost/,
      );
      const committed = structuredClone(f.records);
      last = { request, result: await api.advanceAdventureDeletion(uid, request) };
      assert.deepEqual(f.records, committed, 'retry cannot recount or recreate root');
      f.db.runTransaction = run;
      lost = true;
    } else last = { request, result: await api.advanceAdventureDeletion(uid, request) };
    p = last.result.progress;
  }
  assert.deepEqual(
    [...phases],
    ['quiescence', 'media', 'images', 'children', 'controls', 'activity', 'verify'],
  );
  if (!rich) assert.equal(lost, true);
  assert.equal(p.state, 'deleted');
  assert.equal(
    [...f.records.keys()].some(
      (path) =>
        path === 'adventures/' + f.target.id || path.startsWith('adventures/' + f.target.id + '/'),
    ),
    false,
  );
  assert.equal(f.records.get('adventureDeletionReservations/' + f.target.id).state, 'deleted');
  const receiptMeta = f.metadata.get(
      'users/' + uid + '/adventureDeletionOperations/' + last.request.operationId,
    ),
    jobMeta = f.metadata.get('users/' + uid + '/adventureDeletions/' + p.deletionId),
    reservationMeta = f.metadata.get('adventureDeletionReservations/' + f.target.id);
  assert.equal(jobMeta.updatedAtNanoseconds, receiptMeta.createdAtNanoseconds);
  assert.equal(reservationMeta.updatedAtNanoseconds, receiptMeta.createdAtNanoseconds);
  assert.equal(jobMeta.createdAtNanoseconds, reservationMeta.createdAtNanoseconds);
  assert.deepEqual(f.records.get('users/' + uid + '/workActivityState/current'), {
    ...activityState,
    revision: activityState.revision + Number(!!rich),
  });
  assert.equal(
    f.records.has('users/' + uid + '/adventureRestoreRecoveryKeys/' + f.p.restoreId),
    false,
  );
  for (const name of ARCHIVE_NAMES)
    assert.equal(
      [...f.records.keys()].some((path) => path.startsWith(f.path + '/' + name + '/')),
      false,
      name,
    );
  for (const [path, value] of kept) assert.deepEqual(f.records.get(path), value, path);
  assert.deepEqual(
    storageSnapshot(f.storage),
    storage,
    'independent active image bytes/generations remain',
  );
  for (const [path, value, ownUses] of imagesBefore)
    assert.deepEqual(f.records.get(path), { ...value, useCount: value.useCount - ownUses }, path);
  assert.equal(
    snapshot(
      f,
      (path, value) =>
        path.includes('/imageLibrary/') &&
        path.includes('/uses/') &&
        value.adventureId === f.target.id,
    ).length,
    0,
  );
  assert.equal(await activity.resolveWorkResume(uid, { target: f.target }), null);
  assert.notEqual(await activity.resolveWorkResume(uid, { target: siblingTarget }), null);
  if (chat) {
    assert.equal(f.records.has(chat.body), false);
    assert.equal(
      f.records.has('users/' + uid + '/editorChatContextBodies/' + rich.context.contextId),
      false,
    );
    const read = await chat.get();
    assert.equal(read.question, chat.prompt);
    assert.equal(read.answer, null);
    assert.equal(read.presentation, 'blocked');
  }
  if (table) {
    await assert.rejects(() => table.base.getCampaignBase(uid, { campaignId: table.id }), {
      code: 'not-found',
    });
    const note = await table.notes.getCampaignNote(uid, {
      campaignId: table.id,
      campaignToken: table.token,
      noteId: table.noteId,
    });
    assert.equal(note.note.content, 'Consequência privada da mesa 🐉');
  }
  assert.equal(
    (await api.getAdventureDeletion(uid, { adventureId: f.target.id })).deletion.complete,
    true,
  );
  assert.equal((await api.listAdventureDeletions(uid, {})).items[0].complete, true);
  assert.equal(
    (await api.getAdventureDeletion('other', { adventureId: f.target.id })).deletion,
    null,
  );
  const terminal = structuredClone(f.records);
  assert.deepEqual(await api.advanceAdventureDeletion(uid, last.request), last.result);
  const replay = await api.startAdventureDeletion(uid, input);
  assert.deepEqual(replay.receipt, initial.receipt);
  assert.deepEqual(replay.progress, p);
  assert.deepEqual(
    await api.resolveAdventureDeletionStart(uid, { ...input, intent: 'cancel' }),
    replay,
  );
  assert.equal(
    (await f.api.activateAdventureRestore(uid, f.activationRequest)).progress.state,
    'activated',
  );
  await assert.rejects(
    () => studio.createAdventure(uid, { operationId: f.target.id, title: 'Não recriar' }),
    (e) => e.details?.reason === 'adventure-deleted',
  );
  await assert.rejects(
    () =>
      scenes.createScene(uid, {
        target: f.target,
        parentId: null,
        operationId: op('late-scene'),
        title: 'Não recriar',
        content: 'Novo texto',
      }),
    (e) => e.details?.reason === 'adventure-deleted',
  );
  await assert.rejects(() => captureAdventure(f, f.target.id, f.backupAssets));
  assert.deepEqual(
    f.records,
    terminal,
    'historical receipts and rejected writers cannot regenerate content',
  );
}
