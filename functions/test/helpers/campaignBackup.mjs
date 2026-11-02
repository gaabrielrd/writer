import assert from 'node:assert/strict';
import { studioDb } from './studioDb.mjs';
import { createStudioService } from '../../src/studio.mjs';
import { createCampaignBackupSourceService } from '../../src/campaignBackupSource.mjs';
import { createCampaignBackupInventoryService } from '../../src/campaignBackupInventory.mjs';
import { createCampaignNotesService } from '../../src/campaignNotes.mjs';
import { createCampaignSessionsService } from '../../src/campaignSessions.mjs';
import { createCampaignPreparationService } from '../../src/campaignPreparation.mjs';
import { createCampaignSessionReferencesService } from '../../src/campaignSessionReferences.mjs';
import { createWorkProgressService } from '../../src/workProgress.mjs';
import { createCampaignCaptureService } from '../../src/campaignCapture.mjs';
import { createScenesService } from '../../src/scenes.mjs';
import { baseSourceKey, digest } from '../../src/campaignBaseContracts.mjs';

export const uid = 'author',
  op = (name) => 'campaign-inventory-operation-' + name;
export const reason = (value) => (error) => error.details?.reason === value;
export const pageChanged = reason('campaign-backup-page-changed'),
  sourceChanged = reason('campaign-backup-source-changed'),
  inconsistent = reason('campaign-backup-item-inconsistent');
export const families = [
  'note',
  'session',
  'checklist',
  'preparation-item',
  'preparation-body',
  'session-reference',
  'session-reference-state',
  'session-preparation-link',
  'session-preparation-state',
];
const secretFields = [
  'title',
  'description',
  'content',
  'summary',
  'body',
  'target',
  'keyBase64',
  'url',
];
export function readonly(f) {
  const forbidden = () => assert.fail('Inventory must not read full documents or write');
  return {
    doc: (path) => {
      assert.ok(
        path.startsWith(f.path + '/') ||
          path === f.path ||
          path === 'campaignDeletionReservations/' + f.id,
      );
      return { path, id: path.split('/').at(-1) };
    },
    collection: (path) => {
      assert.ok(path.startsWith(f.path + '/') && !path.slice(f.path.length + 1).includes('/'));
      return f.db.collection(path);
    },
    runTransaction: (cb) =>
      f.db.runTransaction((tx) =>
        cb({
          ...tx,
          get: (query) => {
            assert.ok(query.collectionPath, 'No full document get');
            assert.ok(query.maximum <= 26 && query.maximum >= 2);
            assert.ok(Array.isArray(query.fields) && query.fields.length > 0);
            assert.equal(query.filters.length, 0, 'Tombstones must be observed');
            assert.equal(query.orders.length, 1);
            assert.equal(query.orders[0][0], '__name__');
            for (const field of secretFields) assert.equal(query.fields.includes(field), false);
            return tx.get(query);
          },
          getAll: (...args) => {
            for (const field of secretFields)
              assert.equal(args.at(-1).fieldMask.includes(field), false);
            return tx.getAll(...args);
          },
          create: forbidden,
          update: forbidden,
          set: forbidden,
          delete: forbidden,
        }),
      ),
  };
}
export async function fixture(original = false) {
  const f = studioDb();
  f.id = op('campaign');
  f.studio = createStudioService({ db: f.db, now: () => 100 });
  if (!original) await f.studio.createCampaign(uid, { operationId: f.id, title: 'PRIVATE ROOT' });
  else {
    f.adventureId = op('adventure');
    await f.studio.createAdventure(uid, {
      operationId: f.adventureId,
      title: 'PRIVATE ORIGINAL',
      universeId: null,
    });
    const scenes = createScenesService({ db: f.db, now: () => 150 }),
      scene = await scenes.createScene(uid, {
        target: { kind: 'adventure', id: f.adventureId },
        operationId: op('scene'),
        title: 'PRIVATE SCENE',
        parentId: null,
        content: '<p>PRIVATE CONTENT</p>',
        planning: { objective: 'PRIVATE OBJECTIVE' },
      });
    f.sceneKey = baseSourceKey({ kind: 'scene', adventureId: f.adventureId, id: scene.scene.id });
    const capture = createCampaignCaptureService({ db: f.db, assets: {}, now: () => 200 }),
      source = await capture.getCampaignCaptureSource(uid, { adventureId: f.adventureId });
    let p = await capture.startCampaignCapture(uid, {
      operationId: op('capture'),
      adventureId: f.adventureId,
      expectedSourceToken: source.sourceToken,
      title: 'PRIVATE TABLE',
      description: '',
      universeId: null,
    });
    for (let count = 0; p.state === 'preparing' && count < 100; count++)
      p = await capture.advanceCampaignCapture(uid, {
        captureId: p.captureId,
        expectedCheckpoint: p.checkpoint,
        operationId: digest({ captureId: p.captureId, checkpoint: p.checkpoint }),
      });
    assert.equal(p.state, 'prepared');
    const active = await capture.activateCampaignCapture(uid, {
      captureId: p.captureId,
      expectedCheckpoint: p.checkpoint,
      operationId: op('activate'),
    });
    assert.equal(active.kind, 'activated');
    f.id = active.campaign.id;
  }
  f.path = 'campaigns/' + f.id;
  f.notes = createCampaignNotesService({ db: f.db, now: () => 300 });
  f.sessions = createCampaignSessionsService({ db: f.db, now: () => 300 });
  f.preparation = createCampaignPreparationService({ db: f.db, now: () => 300 });
  f.references = createCampaignSessionReferencesService({ db: f.db, now: () => 300 });
  f.progress = createWorkProgressService({ db: f.db, now: () => 300 });
  const initial = await f.sessions.listCampaignSessions(uid, { campaignId: f.id });
  f.scope = { campaignId: f.id, campaignToken: initial.campaignToken };
  const db = readonly(f);
  f.source = createCampaignBackupSourceService({ db });
  f.api = createCampaignBackupInventoryService({ db });
  await refresh(f);
  return f;
}
export async function refresh(f) {
  f.sourceToken = (await f.source.getCampaignBackupSource(uid, { campaignId: f.id })).sourceToken;
}
export const request = (f, family, extra = {}) => ({
  campaignId: f.id,
  sourceToken: f.sourceToken,
  family,
  ...extra,
});
export const list = (f, family, extra = {}) =>
  f.api.listCampaignBackupOwnInventory(uid, request(f, family, extra));
export async function note(f, name) {
  const id = op(name);
  await f.notes.saveCampaignNote(uid, {
    ...f.scope,
    noteId: id,
    operationId: id,
    expectedRevision: 0,
    title: 'PRIVATE NOTE',
    content: 'PRIVATE OWN TEXT 🐉\n  ',
  });
  return id;
}
export async function session(f, name) {
  const id = op(name);
  await f.sessions.saveCampaignSession(uid, {
    ...f.scope,
    sessionId: id,
    operationId: id,
    expectedRevision: 0,
    title: 'PRIVATE SESSION',
    summary: 'PRIVATE SUMMARY',
    status: 'planned',
    scheduledDate: null,
  });
  return id;
}
export async function preparation(f, name, kind = 'clue') {
  const id = op(name);
  await f.preparation.saveCampaignPreparationItem(uid, {
    ...f.scope,
    itemId: id,
    operationId: id,
    expectedRevision: 0,
    expectedItemCollectionRevision:
      f.records.get(f.path + '/preparationState/current')?.revision ?? 0,
    kind,
    title: 'PRIVATE ITEM',
    status: kind === 'clue' ? 'pending' : 'available',
    body:
      kind === 'clue'
        ? { text: 'PRIVATE CLUE', condition: 'PRIVATE CONDITION', recipient: 'PRIVATE RECIPIENT' }
        : { description: 'PRIVATE QUEST', consequences: 'PRIVATE CONSEQUENCES' },
  });
  return id;
}
export async function link(f, name, sessionId, itemId) {
  const id = op(name);
  await f.preparation.addCampaignSessionPreparationLink(uid, {
    ...f.scope,
    sessionId,
    expectedSessionRevision: 1,
    linkId: id,
    operationId: id,
    expectedRevision: 0,
    expectedLinkCollectionRevision:
      f.records.get(f.path + '/sessionPreparationState/' + sessionId)?.revision ?? 0,
    itemId,
    expectedItemRevision: f.records.get(f.path + '/preparationItems/' + itemId).revision,
  });
  return id;
}
export async function reference(f, name, sessionId) {
  const scope = { ...f.scope, sessionId, expectedSessionRevision: 1 },
    view = await f.references.listCampaignSessionReferences(uid, { ...scope, view: 'references' }),
    id = op(name);
  await f.references.addCampaignSessionReference(uid, {
    ...scope,
    referenceId: id,
    operationId: id,
    expectedReferenceCollectionRevision: view.referenceCollectionRevision,
    sourceContext: view.sourceContext,
    target: { kind: 'scene', sourceKey: f.sceneKey },
  });
  return id;
}
export async function richFixture() {
  const f = await fixture(true);
  f.noteId = await note(f, 'note');
  f.sessionId = await session(f, 'session');
  f.itemId = await preparation(f, 'clue');
  f.questId = await preparation(f, 'quest', 'quest');
  f.linkId = await link(f, 'link', f.sessionId, f.itemId);
  f.referenceId = await reference(f, 'reference', f.sessionId);
  await f.progress.createWorkChecklistItem(uid, {
    target: { kind: 'campaign', id: f.id },
    operationId: op('checklist'),
    title: 'PRIVATE TASK',
  });
  await refresh(f);
  return f;
}
