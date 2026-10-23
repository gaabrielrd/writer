import { createHash } from 'node:crypto';
import {
  authorize,
  mutationInput,
  requestHash,
  restoreFail as fail,
  inconsistent,
  sum,
} from './bookRestoreUploadContracts.mjs';
import { digest, assertSceneEnvelope } from './sceneContracts.mjs';
import { countVisibleWords } from './visibleWordCount.mjs';
import { createVerifiedBookRestoreContent } from './bookRestoreContentRead.mjs';
import { readBookRestoreArtifact, prepareBookRestoreArtifacts } from './bookRestoreArtifacts.mjs';
import { restoredDraftVersionId, matchesRestoredDraftChapter } from './bookRestoreDraft.mjs';
import { projectBookVersionDraft, validateBookBackupJSONItem } from './bookBackupSchema.mjs';
const action = 'finalizeBookRestoreDraft';
export function createBookRestoreDraftFinalizeService({
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
    if (loaded.job.preparation?.phase !== 'draft-finalize')
      fail('failed-precondition', 'draft-finalize-phase-conflict');
  }
  return {
    async finalizeBookRestoreDraft(uid, input) {
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
      let item,
        descriptor,
        profile,
        wordCount = null;
      const proofs = [];
      try {
        const reader = await createVerifiedBookRestoreContent({
          db,
          uid,
          id: request.restoreId,
          token: request.jobToken,
          load,
        });
        item = await reader.readMappedItem(initial.loaded.job.preparation.draft.startIndex);
        if (item.record.kind !== 'book-draft' || item.record.id !== initial.loaded.job.bookId)
          inconsistent();
        const observed = await db.runTransaction(async (tx) => {
          const collected = [];
          let currentProfile;
          const loaded = await load(tx, uid, request.restoreId, request.jobToken);
          available(loaded, request);
          await item.verify(tx);
          const native = await readBookRestoreArtifact(
              tx,
              db,
              loaded,
              'draft-definition',
              'current',
            ),
            d = native.value,
            p = loaded.job.preparation.draft;
          collected.push(native.verify);
          let expected;
          if (item.value.state === 'none') expected = { schemaVersion: 1, state: 'none' };
          else {
            const value = item.value,
              chapter = await readBookRestoreArtifact(tx, db, loaded, 'chapter', value.chapter.id, {
                optional: true,
              }),
              match = matchesRestoredDraftChapter(chapter?.value, value);
            if (match !== p.match) inconsistent();
            if (chapter) collected.push(chapter.verify);
            if (value.persona) {
              const persona = await readBookRestoreArtifact(
                tx,
                db,
                loaded,
                'persona-definition',
                value.persona.id,
              );
              if (
                digest(persona.value.profile) !== digest(value.persona) ||
                persona.value.profileHash !== digest(value.persona)
              )
                inconsistent();
              currentProfile = persona.value.profile;
              collected.push(persona.verify);
            }
            const id = match ? null : restoredDraftVersionId(loaded, value.chapter.id);
            expected = {
              schemaVersion: 1,
              state: 'present',
              outcome: match ? 'saved' : 'version',
              chapter: value.chapter,
              personaId: value.persona?.id ?? null,
              profileHash: value.persona ? digest(value.persona) : null,
              versionId: id,
              contentHash: value.contentHash,
              byteLength: value.byteLength,
              chunkCount: p.bodyCount,
              sourceChunks: value.chunkCount,
            };
            if (id !== p.versionId) inconsistent();
          }
          if (digest(d) !== digest(expected)) inconsistent();
          return { descriptor: d, profile: currentProfile, proofs: collected };
        });
        descriptor = observed.descriptor;
        profile = observed.profile;
        proofs.push(...observed.proofs);
        if (descriptor.state === 'present' && descriptor.outcome === 'version') {
          const chunks = [],
            hash = createHash('sha256');
          let total = 0;
          for (let index = 0; index < descriptor.chunkCount; index++) {
            const body = await db.runTransaction(async (tx) => {
                const loaded = await load(tx, uid, request.restoreId, request.jobToken);
                available(loaded, request);
                await item.verify(tx);
                return readBookRestoreArtifact(
                  tx,
                  db,
                  loaded,
                  'history-body',
                  digest({ versionId: descriptor.versionId, index }),
                );
              }),
              value = body.value;
            if (
              value.versionId !== descriptor.versionId ||
              value.index !== index ||
              typeof value.content !== 'string' ||
              !value.content.isWellFormed() ||
              Buffer.byteLength(value.content) > 65536
            )
              inconsistent();
            const bytes = Buffer.from(value.content, 'utf8');
            total = sum(total, bytes.length);
            hash.update(bytes);
            if (total > descriptor.byteLength) inconsistent();
            chunks.push(value.content);
            proofs.push(body.verify);
          }
          if (total !== descriptor.byteLength || hash.digest('hex') !== descriptor.contentHash)
            inconsistent();
          // Count exactly one contribution using the existing HTML/Markdown semantics.
          const content = chunks.join('');
          chunks.length = 0;
          wordCount = countVisibleWords(content);
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
        for (const verify of proofs) await verify(tx);
        const preparation = structuredClone(loaded.job.preparation);
        preparation.draft.finalized = { schemaVersion: 1, wordCount };
        preparation.phase = 'cover';
        // Reserve the one new artifact before constructing its server-created timestamp.
        const creates = descriptor.state === 'present' && descriptor.outcome === 'version' ? 1 : 0;
        preparation.artifactCount = sum(preparation.artifactCount, creates);
        const record = next(loaded.job, request, { preparation }),
          writes = [];
        if (creates) {
          const value = {
            id: descriptor.versionId,
            target: { kind: 'book', id: loaded.job.bookId },
            resource: { kind: 'chapter', id: descriptor.chapter.id },
            createdAt: record.updatedAt,
            reason: 'manual',
            label: 'Rascunho recuperado do backup',
            wordCount,
            byteLength: descriptor.byteLength,
            contentHash: descriptor.contentHash,
            chunkCount: descriptor.chunkCount,
            draft: projectBookVersionDraft({
              schemaVersion: 1,
              chapter: descriptor.chapter,
              persona: profile ?? null,
            }),
          };
          validateBookBackupJSONItem('work-version', value, loaded.job.bookId);
          writes.push({
            kind: 'history-version',
            id: value.id,
            value: {
              ...value,
              schemaVersion: 1,
              resourceKey: digest(value.resource),
              deleting: false,
            },
          });
        }
        writes.forEach((w) => assertSceneEnvelope(w.value));
        const artifacts = await prepareBookRestoreArtifacts(
          tx,
          db,
          loaded,
          request.operationId,
          writes,
        );
        if (artifacts.created !== creates) inconsistent();
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
