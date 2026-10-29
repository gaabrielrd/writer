import { signedOriginCampaign, uid } from './campaignOriginRestore.mjs';
import { note, session, preparation, link, reference } from './campaignBackup.mjs';
import { createCampaignNotesService } from '../../src/campaignNotes.mjs';
import { createCampaignSessionsService } from '../../src/campaignSessions.mjs';
import { createCampaignPreparationService } from '../../src/campaignPreparation.mjs';
import { createCampaignSessionReferencesService } from '../../src/campaignSessionReferences.mjs';
import { createWorkProgressService } from '../../src/workProgress.mjs';
import { baseSourceKey } from '../../src/campaignBaseContracts.mjs';
import { createCampaignRestoreTransferService } from '../../src/campaignRestoreTransfer.mjs';
import { sha } from '../../src/campaignRestoreContracts.mjs';
export { uid };
export const ownRid = 'campaign-own-materialize-0001',
  ownMut = (p, operationId, extra = {}) => ({
    restoreId: p.restoreId,
    jobToken: p.jobToken,
    operationId,
    expectedCheckpoint: p.checkpoint,
    ...extra,
  });
export async function richOwnCampaign({ large = false, empty = false } = {}) {
  const f = await signedOriginCampaign();
  if (!empty) {
    Object.assign(f, {
      scope: { campaignId: f.id, campaignToken: f.campaignToken },
      notes: createCampaignNotesService({ db: f.db }),
      sessions: createCampaignSessionsService({ db: f.db }),
      preparation: createCampaignPreparationService({ db: f.db }),
      references: createCampaignSessionReferencesService({ db: f.db }),
      progress: createWorkProgressService({ db: f.db }),
      sceneKey: baseSourceKey({
        kind: 'scene',
        adventureId: f.campaign.provenance.adventureId,
        id: f.scene.id,
      }),
    });
    f.noteId = await note(f, 'materialized-note');
    f.deletedNoteId = await note(f, 'materialized-deleted-note');
    await f.notes.deleteCampaignNote(uid, {
      ...f.scope,
      noteId: f.deletedNoteId,
      operationId: 'materialize-delete-note-operation',
      expectedRevision: 1,
    });
    f.sessionId = await session(f, 'materialized-session');
    f.secondSessionId = await session(f, 'materialized-second-session');
    f.itemId = await preparation(f, 'materialized-clue');
    f.questId = await preparation(f, 'materialized-quest', 'quest');
    await link(f, 'materialized-link', f.sessionId, f.itemId);
    await link(f, 'materialized-quest-link', f.sessionId, f.questId);
    await reference(f, 'materialized-reference', f.sessionId);
    await f.sessions.saveCampaignSession(uid, {
      ...f.scope,
      sessionId: f.sessionId,
      operationId: 'materialize-update-session-operation',
      expectedRevision: 1,
      title: 'PRIVATE SESSION',
      summary: '  \ufeff Preparação 🐉\n  ',
      status: 'completed',
      scheduledDate: '2026-10-30',
    });
    f.checklistId = 'materialized-own-checklist-01';
    await f.progress.createWorkChecklistItem(uid, {
      target: { kind: 'campaign', id: f.id },
      operationId: f.checklistId,
      title: 'PRIVATE TASK',
    });
    await f.progress.updateWorkChecklistItem(uid, {
      target: { kind: 'campaign', id: f.id },
      id: f.checklistId,
      operationId: 'materialized-own-checklist-done',
      expectedRevision: 1,
      patch: { completed: true },
    });
    if (large) {
      f.largeText = '\u0000'.repeat(150000);
      await f.db.runTransaction((tx) =>
        tx.update(f.db.doc(f.path + '/preparationBodies/' + f.itemId), {
          body: { text: f.largeText, condition: f.largeText, recipient: f.largeText },
        }),
      );
    }
  }
  f.file = await f.makeFile();
  return f;
}
export async function prepareOwnRestore(db, original, rid = ownRid) {
  const api = createCampaignRestoreTransferService({ db, keys: original.keys, now: () => 6000 }),
    bytes = original.file;
  let p = (
    await api.startCampaignRestore(uid, {
      operationId: rid,
      source: {
        format: 'writer-campaign-backup',
        version: 1,
        byteLength: bytes.length,
        sha256: sha(bytes),
      },
    })
  ).progress;
  for (let n = 0; n < Math.ceil(bytes.length / 65536); n++) {
    const b = bytes.subarray(n * 65536, (n + 1) * 65536);
    p = (
      await api.appendCampaignRestoreChunk(
        uid,
        ownMut(p, 'own-prep-upload-' + rid + '-' + n, {
          index: n,
          chunkHash: sha(b),
          chunkBase64: b.toString('base64'),
        }),
      )
    ).progress;
  }
  for (const [method, field, phase] of [
    ['advanceCampaignRestoreFileReview', 'fileReview', 'verified'],
    ['advanceCampaignRestoreOwnReview', 'ownReview', 'verified'],
  ]) {
    let n = 0;
    while ((p[field]?.phase ?? p[field]?.status) !== phase && n++ < 10000)
      p = (
        await api[method](uid, ownMut(p, 'own-prep-' + field + '-' + rid + '-' + n, { limit: 25 }))
      ).progress;
    if ((p[field]?.phase ?? p[field]?.status) !== phase) throw Error('Own fixture failed');
  }
  return { api, p };
}
export async function finishOwnMaterialization(f, p = f.p, limit = 25) {
  let n = 0;
  while (p.ownMaterialization?.phase !== 'ready' && n++ < 10000)
    p = (
      await f.api.advanceCampaignRestoreOwnMaterialization(
        uid,
        ownMut(p, 'own-write-' + sha(JSON.stringify([p.restoreId, p.checkpoint])), { limit }),
      )
    ).progress;
  if (p.ownMaterialization?.phase !== 'ready') throw Error('Own materialization failed');
  return p;
}
