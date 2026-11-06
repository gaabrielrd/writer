import {
  authorize,
  mutationInput,
  requestHash,
  restoreFail as fail,
  inconsistent,
  sum,
} from './bookRestoreUploadContracts.mjs';
import { digest } from './sceneContracts.mjs';
import { BOOK_PERSONA_SCOPES, projectBookBackupPersona } from './bookBackupPersonas.mjs';
import { createVerifiedBookRestoreContent } from './bookRestoreContentRead.mjs';
import {
  prepareBookRestoreArtifacts,
  readBookRestoreArtifact,
  assertBookRestorePersonaNamespacesEmpty,
} from './bookRestoreArtifacts.mjs';
const action = 'advanceBookRestorePersonas';

export function createBookRestorePersonasService({
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
    if (loaded.job.preparation?.phase !== 'personas')
      fail('failed-precondition', 'personas-phase-conflict');
  }
  return {
    async advanceBookRestorePersonas(uid, input) {
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
      const cursor =
        initial.loaded.job.preparation.schemaVersion === 4
          ? {
              ...initial.loaded.job.preparation,
              schemaVersion: 5,
              resourceEndIndex: initial.loaded.job.preparation.itemIndex,
              personas: {
                schemaVersion: 1,
                profileCount: 0,
                bindings: Object.fromEntries(BOOK_PERSONA_SCOPES.map((scope) => [scope, 0])),
              },
            }
          : structuredClone(initial.loaded.job.preparation);
      let item, metadata, draft;
      try {
        const reader = await createVerifiedBookRestoreContent({
          db,
          uid,
          id: request.restoreId,
          token: request.jobToken,
          load,
        });
        item = await reader.readMappedItem(cursor.itemIndex);
        if (item.record.kind === 'book-personas') {
          draft = await reader.readMappedDraft();
          if (draft.record.kind !== 'book-draft' || draft.record.id !== initial.loaded.job.bookId)
            inconsistent();
        }
        if (item.record.kind === 'book-persona' && item.value.scope === 'book')
          metadata = await reader.readMappedItem(0);
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
        if (metadata) await metadata.verify(tx);
        if (draft) await draft.verify(tx);
        if (loaded.job.cleanupVersion < 9)
          await assertBookRestorePersonaNamespacesEmpty(tx, db, loaded);
        const preparation = structuredClone(cursor),
          state = preparation.personas,
          writes = [];
        let profileItem = false;
        if (item.record.kind === 'book-persona') {
          const { scope, ownerId, personaId } = item.value;
          if (!BOOK_PERSONA_SCOPES.includes(scope) || item.record.id !== digest([scope, ownerId]))
            inconsistent();
          if (scope === 'book') {
            if (
              ownerId !== loaded.job.bookId ||
              metadata.record.kind !== 'book-metadata' ||
              metadata.value.book.personaId !== personaId
            )
              inconsistent();
          } else {
            const owner = await readBookRestoreArtifact(
              tx,
              db,
              loaded,
              scope === 'chapter' ? 'chapter' : 'scene-source',
              ownerId,
            );
            const complement = (scope === 'chapter' ? owner.value : owner.value.original)
              ?.personaComplement;
            if (complement?.personaId !== personaId) inconsistent();
          }
          const profile = projectBookBackupPersona(item.value.profile),
            profileHash = digest(profile);
          if (profile.id !== personaId) inconsistent();
          writes.push(
            {
              kind: 'persona-definition',
              id: personaId,
              replace: true,
              value: { schemaVersion: 1, profileHash, profile },
            },
            {
              kind: 'persona-binding',
              id: item.record.id,
              value: { schemaVersion: 1, scope, ownerId, personaId, profileHash },
            },
          );
          state.bindings[scope] = sum(state.bindings[scope], 1);
          profileItem = true;
        } else if (item.record.kind === 'book-personas') {
          const totals = loaded.job.validationSummary.totals;
          state.draftProfileId = null;
          const profile = draft.value.state === 'present' ? draft.value.persona : null;
          if (profile) {
            const prepared = await readBookRestoreArtifact(
              tx,
              db,
              loaded,
              'persona-definition',
              profile.id,
              { optional: true },
            );
            if (prepared) {
              if (
                digest(prepared.value.profile) !== digest(profile) ||
                prepared.value.profileHash !== digest(profile)
              )
                inconsistent();
            } else state.draftProfileId = profile.id;
          }
          if (
            BOOK_PERSONA_SCOPES.some(
              (scope) =>
                item.value.owners[scope] !== totals.owners[scope] ||
                item.value.bindings[scope] !== totals.bindings[scope] ||
                state.bindings[scope] !== item.value.bindings[scope],
            ) ||
            sum(state.profileCount, state.draftProfileId === null ? 0 : 1) !== totals.profiles
          )
            inconsistent();
          preparation.phase = 'universe';
        } else inconsistent();
        const artifacts = await prepareBookRestoreArtifacts(
          tx,
          db,
          loaded,
          request.operationId,
          writes,
          9,
        );
        if (profileItem) {
          // Each logical binding is unique; only its shared definition may already exist.
          if (![1, 2].includes(artifacts.created)) inconsistent();
          state.profileCount = sum(state.profileCount, artifacts.created - 1);
        }
        preparation.itemIndex = sum(preparation.itemIndex, 1);
        preparation.artifactCount = sum(preparation.artifactCount, artifacts.created);
        const record = next(loaded.job, request, { cleanupVersion: 9, preparation });
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
