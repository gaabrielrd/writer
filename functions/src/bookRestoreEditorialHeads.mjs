import {
  authorize,
  mutationInput,
  requestHash,
  restoreFail as fail,
  inconsistent,
  sum,
} from './bookRestoreUploadContracts.mjs';
import { digest, assertSceneEnvelope } from './sceneContracts.mjs';
import { createVerifiedBookRestoreContent } from './bookRestoreContentRead.mjs';
import { prepareBookRestoreArtifacts } from './bookRestoreArtifacts.mjs';
import { nativeRestoreToken } from './bookRestoreIntegrityRead.mjs';
import { assertBookRestoreEditorialHeadNamespacesEmpty } from './bookRestoreEditorialInventory.mjs';
import {
  readBookRestoreEditorialControl,
  readProtectedBookRestoreEditorialArtifact as protectedArtifact,
  assertEditorialSameCommit,
} from './bookRestoreEditorialRead.mjs';
import {
  validateEditorialMaterialization,
  editorialArtifactCount,
  editorialRecordDescriptor,
} from './bookRestoreEditorialBodyContracts.mjs';
import {
  BOOK_RESTORE_EDITORIAL_HEAD_SEED,
  validateEditorialHeads,
  projectBookRestoreEditorialHead,
} from './bookRestoreEditorialHeadContracts.mjs';
const action = 'advanceBookRestoreEditorialHeads';
/** Internal only. Root remains absent; preparing heads is not an activation grant. */
export function createBookRestoreEditorialHeadsService({
  db,
  load,
  readOp,
  writeOp,
  confirmed,
  next,
  pickProgress,
  openContent = createVerifiedBookRestoreContent,
}) {
  function available(loaded, request) {
    const j = loaded.job;
    if (
      j.state !== 'content-verified' ||
      j.cleanupVersion !== 15 ||
      j.source.format !== 'writer-book-archive' ||
      j.source.version !== 2 ||
      j.preparation?.phase !== 'activation-ready' ||
      j.preparation.audit?.phase !== 'done'
    )
      fail('failed-precondition', 'editorial-heads-not-ready');
    if (j.checkpoint !== request.expectedCheckpoint)
      fail('failed-precondition', 'checkpoint-conflict');
  }
  return {
    async advanceBookRestoreEditorialHeads(uid, input) {
      authorize(uid);
      const request = mutationInput(input),
        fingerprint = requestHash(action, request);
      async function resolved(tx, loaded) {
        const op = await tx.get(
          db.doc('users/' + uid + '/bookRestoreOperations/' + request.operationId),
        );
        return op.exists
          ? confirmed(loaded, readOp(op, uid, request.restoreId, fingerprint, loaded))
          : null;
      }
      const initial = await db.runTransaction(async (tx) => {
        const loaded = await load(tx, uid, request.restoreId, request.jobToken),
          result = await resolved(tx, loaded);
        if (result) return { result };
        available(loaded, request);
        const current = await readBookRestoreEditorialControl(tx, db, loaded);
        if (!current || current.value.phase !== 'materialized')
          fail('failed-precondition', 'editorial-materialization-required');
        if (current.value.heads?.phase === 'prepared')
          fail('failed-precondition', 'editorial-heads-already-prepared');
        if (!Object.hasOwn(current.value, 'heads'))
          await assertBookRestoreEditorialHeadNamespacesEmpty(tx, db, loaded);
        return { loaded, current };
      });
      if (initial.result) return initial.result;
      let state;
      const proofs = [],
        writes = [];
      try {
        const reader = await openContent({
          db,
          uid,
          id: request.restoreId,
          token: request.jobToken,
          load,
        });
        if (
          reader.itemCount !== initial.current.value.itemCount ||
          reader.bookId !== initial.loaded.job.bookId ||
          reader.sourceBookId !== initial.current.value.sourceBookId
        )
          inconsistent();
        state = structuredClone(initial.current.value);
        state.heads ??= {
          schemaVersion: 1,
          phase: 'scan',
          itemIndex: 0,
          itemCount: reader.itemCount,
          created: 0,
          contracts: 0,
          plans: 0,
          proofRoot: BOOK_RESTORE_EDITORIAL_HEAD_SEED,
          last: null,
        };
        const heads = state.heads;
        if (heads.last !== null) {
          for (const previous of heads.last) {
            const artifact = await db.runTransaction((tx) =>
              protectedArtifact(tx, db, initial.loaded, previous.kind, previous.id),
            );
            assertEditorialSameCommit(artifact.snapshot, initial.current.snapshot);
            if (digest(artifact.value) !== previous.valueHash) inconsistent();
            heads.proofRoot = digest({
              previous: heads.proofRoot,
              kind: previous.kind,
              id: previous.id,
              token: nativeRestoreToken(artifact.snapshot),
              valueHash: previous.valueHash,
            });
            proofs.push(artifact.verify);
          }
          heads.last = null;
        }
        for (let scanned = 0; heads.itemIndex < reader.itemCount && scanned < 16; scanned++) {
          const at = heads.itemIndex,
            source = await reader.openEditorialItem(at);
          proofs.push(source.verify);
          if (
            !source.editorial ||
            source.record.kind !== 'book-editorial-artifact' ||
            !['contract', 'plan'].includes(source.artifact.kind)
          ) {
            heads.itemIndex++;
            continue;
          }
          const original = await reader.readItem(at);
          if (digest(original.record) !== digest(source.record)) inconsistent();
          proofs.push(original.verify);
          const projection = projectBookRestoreEditorialHead(
            original.value,
            {
              schemaVersion: 1,
              sourceBookId: reader.sourceBookId,
              bookId: reader.bookId,
              jobToken: request.jobToken,
            },
            initial.loaded.job.preparation.timestamp,
          );
          const archived = await db.runTransaction((tx) =>
            protectedArtifact(tx, db, initial.loaded, 'editorial-record', source.id),
          );
          editorialRecordDescriptor(archived.value);
          if (
            archived.value.sourceIndex !== at ||
            archived.value.sourceToken !== source.sourceToken ||
            archived.value.valueHash !== source.valueHash ||
            archived.value.byteLength !== source.byteLength ||
            archived.value.chunkCount !== source.chunkCount ||
            digest(archived.value.sourceRecord) !== digest(source.record)
          )
            inconsistent();
          proofs.push(archived.verify);
          heads.itemIndex++;
          if (projection === null) continue;
          if (projection.kind === 'contract' && heads.contracts !== 0)
            fail('failed-precondition', 'ambiguous-editorial-contract-head');
          writes.push(...projection.writes);
          heads[projection.kind === 'contract' ? 'contracts' : 'plans']++;
          heads.created = sum(heads.created, projection.writes.length);
          heads.last = projection.writes.map((write) => ({
            kind: write.kind,
            id: write.id,
            valueHash: digest(write.value),
          }));
          break;
        }
        if (heads.itemIndex === reader.itemCount && heads.last === null) heads.phase = 'prepared';
        validateEditorialHeads(heads, reader.itemCount);
        validateEditorialMaterialization(state);
        writes.push({ kind: 'editorial-control', id: 'current', replace: true, value: state });
        for (const write of writes) assertSceneEnvelope(write.value);
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
        await initial.current.verify(tx);
        if (!Object.hasOwn(initial.current.value, 'heads'))
          await assertBookRestoreEditorialHeadNamespacesEmpty(tx, db, loaded);
        for (const verify of proofs) await verify(tx);
        const artifacts = await prepareBookRestoreArtifacts(
          tx,
          db,
          loaded,
          request.operationId,
          writes,
          15,
        );
        // No existing native head is adopted, replaced or counted as a newly prepared copy.
        const expected = state.heads.created - (initial.current.value.heads?.created ?? 0);
        if (artifacts.created !== expected) inconsistent();
        const preparation = structuredClone(loaded.job.preparation);
        preparation.artifactCount = sum(preparation.artifactCount, artifacts.created);
        preparation.editorialAddedArtifacts = sum(
          preparation.editorialAddedArtifacts ?? 0,
          artifacts.created,
        );
        if (editorialArtifactCount(state) !== preparation.artifactCount) inconsistent();
        const record = next(loaded.job, request, { preparation });
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
