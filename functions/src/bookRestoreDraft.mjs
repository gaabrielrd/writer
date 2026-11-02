import { createSHA256 } from 'hash-wasm';
import {
  authorize,
  mutationInput,
  requestHash,
  restoreFail as fail,
  inconsistent,
  sum,
} from './bookRestoreUploadContracts.mjs';
import { digest, assertSceneEnvelope } from './sceneContracts.mjs';
import { BOOK_RESTORE_HISTORY_HASH } from './bookRestoreHistoryContracts.mjs';
import { chapterTextManifest } from './bookChapterText.mjs';
import { validateBookRestoreDraft } from './bookRestoreDraftContracts.mjs';
import { createVerifiedBookRestoreContent } from './bookRestoreContentRead.mjs';
import {
  prepareBookRestoreArtifacts,
  readBookRestoreArtifact,
  assertBookRestoreDraftNamespaceEmpty,
} from './bookRestoreArtifacts.mjs';
const action = 'advanceBookRestoreDraft';
export function restoredDraftVersionId(loaded, chapterId) {
  return (
    'restore-' +
    digest({
      domain: 'book-restored-draft-version',
      jobToken: loaded.view.jobToken,
      bookId: loaded.job.bookId,
      chapterId,
    })
  );
}
export function matchesRestoredDraftChapter(chapter, value) {
  if (!chapter || chapter.contentMode === 'scenes') return false;
  if (chapter.contentStorage != null) {
    const manifest = chapterTextManifest(chapter.contentStorage);
    return manifest.contentHash === value.contentHash && manifest.byteLength === value.byteLength;
  }
  const content = chapter.content ?? '';
  if (typeof content !== 'string') inconsistent();
  return digest(content) === value.contentHash && Buffer.byteLength(content) === value.byteLength;
}
export function createBookRestoreDraftService({
  db,
  load,
  readOp,
  writeOp,
  confirmed,
  next,
  pickProgress,
}) {
  const opRef = (uid, id) => db.doc('users/' + uid + '/bookRestoreOperations/' + id);
  function available(loaded, request) {
    if (loaded.job.state !== 'content-verified') fail('failed-precondition', 'state-conflict');
    if (loaded.job.checkpoint !== request.expectedCheckpoint)
      fail('failed-precondition', 'checkpoint-conflict');
    if (loaded.job.preparation?.phase !== 'draft')
      fail('failed-precondition', 'draft-phase-conflict');
  }
  return {
    async advanceBookRestoreDraft(uid, input) {
      authorize(uid);
      const request = mutationInput(input),
        fingerprint = requestHash(action, request);
      async function resolved(tx, loaded) {
        const op = await tx.get(opRef(uid, request.operationId));
        return op.exists
          ? confirmed(loaded, readOp(op, uid, request.restoreId, fingerprint, loaded))
          : null;
      }
      const initial = await db.runTransaction(async (tx) => {
        const loaded = await load(tx, uid, request.restoreId, request.jobToken),
          result = await resolved(tx, loaded);
        if (result) return { result };
        available(loaded, request);
        return { loaded };
      });
      if (initial.result) return initial.result;
      const cursor = structuredClone(initial.loaded.job.preparation);
      if (cursor.schemaVersion === 7) {
        cursor.schemaVersion = 8;
        cursor.draft = {
          schemaVersion: 1,
          startIndex: cursor.itemIndex,
          parts: 0,
          bytes: 0,
          bodyCount: 0,
          match: null,
          pending: null,
          outcome: 'preparing',
          versionId: null,
        };
      }
      let item, unit, pending, bytes, parts, text;
      try {
        const reader = await createVerifiedBookRestoreContent({
          db,
          uid,
          id: request.restoreId,
          token: request.jobToken,
          load,
        });
        item = await reader.readMappedItem(cursor.itemIndex);
        if (item.record.kind !== 'book-draft' || item.record.id !== initial.loaded.job.bookId)
          inconsistent();
        if (item.value.state === 'present') {
          const draft = cursor.draft,
            old = draft.pending;
          unit = await item.readRawPart({ part: draft.parts, cursor: old?.cursor ?? null });
          const hasher = await createSHA256();
          if (old) {
            const saved = Buffer.from(old.hashState, 'base64');
            if (saved.length !== hasher.save().length || saved.toString('base64') !== old.hashState)
              inconsistent();
            try {
              hasher.load(saved);
            } catch {
              inconsistent();
            }
          }
          hasher.update(unit.bytes);
          bytes = sum(draft.bytes, unit.bytes.length);
          parts = sum(draft.parts, 1);
          if (bytes > item.value.byteLength) inconsistent();
          if (
            unit.done &&
            (bytes !== item.value.byteLength || hasher.digest() !== item.value.contentHash)
          )
            inconsistent();
          text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(unit.bytes);
          pending = unit.done
            ? null
            : {
                id: restoredDraftVersionId(initial.loaded, item.value.chapter.id),
                part: parts,
                bytes,
                chunkCount: parts,
                algorithm: BOOK_RESTORE_HISTORY_HASH,
                hashState: Buffer.from(hasher.save()).toString('base64'),
                cursor: unit.cursor,
              };
        }
      } catch (error) {
        const result = await db.runTransaction(async (tx) =>
          resolved(tx, await load(tx, uid, request.restoreId, request.jobToken)),
        );
        if (result) return result;
        throw error;
      }
      return db.runTransaction(async (tx) => {
        const loaded = await load(tx, uid, request.restoreId, request.jobToken),
          result = await resolved(tx, loaded);
        if (result) return result;
        available(loaded, request);
        await item.verify(tx);
        if (unit) await unit.verify(tx);
        if (loaded.job.cleanupVersion < 11)
          await assertBookRestoreDraftNamespaceEmpty(tx, db, loaded);
        const preparation = structuredClone(cursor),
          draft = preparation.draft,
          value = item.value,
          writes = [];
        let descriptor;
        if (value.state === 'none') {
          if (preparation.personas.draftProfileId != null) inconsistent();
          draft.outcome = 'none';
          descriptor = { schemaVersion: 1, state: 'none' };
        } else {
          const chapter = await readBookRestoreArtifact(
              tx,
              db,
              loaded,
              'chapter',
              value.chapter.id,
              { optional: true },
            ),
            match = matchesRestoredDraftChapter(chapter?.value, value),
            versionId = restoredDraftVersionId(loaded, value.chapter.id),
            profile = value.persona,
            exclusive = preparation.personas.draftProfileId;
          if (draft.match !== null && draft.match !== match) inconsistent();
          if (exclusive != null && exclusive !== profile?.id) inconsistent();
          let profileHash = null;
          if (profile) {
            const current = await readBookRestoreArtifact(
              tx,
              db,
              loaded,
              'persona-definition',
              profile.id,
              { optional: true },
            );
            profileHash = digest(profile);
            if (current) {
              if (
                current.value.profileHash !== profileHash ||
                digest(current.value.profile) !== profileHash
              )
                inconsistent();
            } else if (exclusive !== profile.id) inconsistent();
            writes.push({
              kind: 'persona-definition',
              id: profile.id,
              replace: true,
              value: { schemaVersion: 1, profileHash, profile },
            });
          }
          draft.parts = parts;
          draft.bytes = bytes;
          draft.match = match;
          draft.pending = pending;
          draft.versionId = versionId;
          if (!match) {
            writes.push({
              kind: 'history-body',
              id: digest({ versionId, index: unit.part }),
              value: { versionId, index: unit.part, content: text },
            });
            draft.bodyCount = sum(draft.bodyCount, 1);
          }
          if (unit.done) {
            draft.outcome = match ? 'saved' : 'version';
            draft.versionId = match ? null : versionId;
            descriptor = {
              schemaVersion: 1,
              state: 'present',
              outcome: draft.outcome,
              chapter: value.chapter,
              personaId: profile?.id ?? null,
              profileHash,
              versionId: draft.versionId,
              contentHash: value.contentHash,
              byteLength: value.byteLength,
              chunkCount: draft.bodyCount,
              sourceChunks: value.chunkCount,
            };
          }
        }
        if (descriptor) {
          writes.push({ kind: 'draft-definition', id: 'current', value: descriptor });
          preparation.itemIndex = sum(preparation.itemIndex, 1);
          preparation.phase = 'draft-finalize';
        }
        writes.forEach((w) => assertSceneEnvelope(w.value));
        validateBookRestoreDraft(draft);
        const artifacts = await prepareBookRestoreArtifacts(
          tx,
          db,
          loaded,
          request.operationId,
          writes,
          11,
        );
        preparation.artifactCount = sum(preparation.artifactCount, artifacts.created);
        const record = next(loaded.job, request, { cleanupVersion: 11, preparation });
        artifacts.commit();
        tx.update(loaded.ref, record);
        const receipt = writeOp(
          tx,
          uid,
          request.restoreId,
          action,
          request,
          record,
          loaded.view.jobToken,
        );
        return confirmed({ ...loaded, view: { ...loaded.view, ...pickProgress(record) } }, receipt);
      });
    },
  };
}
