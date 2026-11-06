import { verifyBookRestoreEditorialBaseAudit } from './bookRestoreEditorialAudit.mjs';
import {
  readProtectedBookRestoreEditorialArtifact as protectedArtifact,
  assertEditorialSameCommit as sameCommit,
  readBookRestoreEditorialControl,
} from './bookRestoreEditorialRead.mjs';
import { createSHA256 } from 'hash-wasm';
import {
  authorize,
  mutationInput,
  requestHash,
  restoreFail as fail,
  inconsistent,
  sum,
  closed,
  restoreId,
  restoreHash,
  sha256,
} from './bookRestoreUploadContracts.mjs';
import { digest, assertSceneEnvelope } from './sceneContracts.mjs';
import { nativeRestoreToken } from './bookRestoreIntegrityRead.mjs';
import { createVerifiedBookRestoreContent } from './bookRestoreContentRead.mjs';
import { prepareBookRestoreArtifacts } from './bookRestoreArtifacts.mjs';
import {
  BOOK_RESTORE_EDITORIAL_ENCODING as encoding,
  BOOK_RESTORE_EDITORIAL_HASH as algorithm,
  BOOK_RESTORE_EDITORIAL_PROOF_SEED as seed,
  editorialBodyDescriptor,
  editorialRecordDescriptor,
  editorialStoredPart,
  editorialBirth,
  validateEditorialMaterialization,
  editorialArtifactCount,
} from './bookRestoreEditorialBodyContracts.mjs';
const action = 'advanceBookRestoreEditorial';
const partId = (id, index) => id + ':' + String(index).padStart(15, '0');
function project(state) {
  return {
    schemaVersion: 1,
    phase: state.phase,
    itemIndex: state.itemIndex,
    itemCount: state.itemCount,
    artifacts: state.artifacts,
    links: state.links,
    summaries: state.summaries,
    byteLength: state.bytes,
    parts: state.parts,
    pendingPart: state.pending?.part ?? null,
    pendingParts: state.pending?.body.chunkCount ?? null,
    audit: state.census
      ? {
          phase: state.census.phase,
          checkedArtifacts: state.census.checkedArtifacts,
          checkedPhysical: state.census.checkedPhysical,
        }
      : null,
    heads: state.heads
      ? {
          phase: state.heads.phase,
          itemIndex: state.heads.itemIndex,
          itemCount: state.heads.itemCount,
          contracts: state.heads.contracts,
          plans: state.heads.plans,
        }
      : null,
  };
}
export function createBookRestoreEditorialService({
  db,
  load,
  readOp,
  writeOp,
  confirmed,
  next,
  pickProgress,
  openContent = createVerifiedBookRestoreContent,
}) {
  const opRef = (uid, operationId) =>
    db.doc('users/' + uid + '/bookRestoreOperations/' + operationId);
  function available(loaded, request, mutation = true) {
    const j = loaded.job,
      p = j.preparation;
    if (j.state !== 'content-verified') fail('failed-precondition', 'state-conflict');
    if (j.source.format !== 'writer-book-archive' || j.source.version !== 2)
      fail('failed-precondition', 'editorial-source-required');
    if (mutation && j.checkpoint !== request.expectedCheckpoint)
      fail('failed-precondition', 'checkpoint-conflict');
    if (
      ![14, 15].includes(j.cleanupVersion) ||
      p?.schemaVersion !== 13 ||
      p.phase !== 'activation-ready' ||
      p.audit?.phase !== 'done'
    )
      fail('failed-precondition', 'editorial-base-not-ready');
  }
  const control = (tx, loaded) => readBookRestoreEditorialControl(tx, db, loaded);
  return {
    async getBookRestoreEditorial(uid, input) {
      authorize(uid);
      closed(input, ['restoreId', 'jobToken']);
      restoreId(input.restoreId);
      restoreHash(input.jobToken);
      return db.runTransaction(async (tx) => {
        const loaded = await load(tx, uid, input.restoreId, input.jobToken);
        available(loaded, input, false);
        const current = await control(tx, loaded);
        return current === null
          ? { schemaVersion: 1, phase: 'not-started' }
          : project(current.value);
      });
    },
    async advanceBookRestoreEditorial(uid, input) {
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
        const current = await control(tx, loaded);
        if (current?.value.phase === 'materialized')
          fail('failed-precondition', 'editorial-already-materialized');
        return { loaded, current };
      });
      if (initial.result) return initial.result;
      const proofs = [],
        writes = [];
      let state;
      try {
        const reader = await openContent({
          db,
          uid,
          id: request.restoreId,
          token: request.jobToken,
          load,
        });
        if (
          reader.sourceBookId !== initial.loaded.job.validationSummary.sourceBookId ||
          reader.bookId !== initial.loaded.job.bookId
        )
          inconsistent();
        state = initial.current
          ? structuredClone(initial.current.value)
          : {
              schemaVersion: 1,
              encoding,
              phase: 'scan',
              sourceSha256: initial.loaded.job.source.sha256,
              sourceBookId: reader.sourceBookId,
              itemCount: reader.itemCount,
              itemIndex: 0,
              baseArtifacts: initial.loaded.job.preparation.artifactCount,
              artifacts: 0,
              links: 0,
              summaries: 0,
              bytes: 0,
              parts: 0,
              proofRoot: seed,
              lastRecord: null,
              pending: null,
            };
        if (state.itemCount !== reader.itemCount) inconsistent();
        if (state.lastRecord !== null) {
          const previous = await db.runTransaction((tx) =>
            protectedArtifact(tx, db, initial.loaded, 'editorial-record', state.lastRecord.id),
          );
          editorialRecordDescriptor(previous.value);
          sameCommit(previous.snapshot, initial.current.snapshot);
          if (digest(previous.value) !== state.lastRecord.recordHash) inconsistent();
          state.proofRoot = digest({
            previous: state.proofRoot,
            id: state.lastRecord.id,
            token: nativeRestoreToken(previous.snapshot),
            recordHash: state.lastRecord.recordHash,
          });
          proofs.push(previous.verify);
          state.lastRecord = null;
        }
        if (state.phase === 'scan') {
          for (let scanned = 0; state.itemIndex < state.itemCount && scanned < 16; scanned++) {
            const item = await reader.openEditorialItem(state.itemIndex);
            proofs.push(item.verify);
            if (!item.editorial) {
              state.itemIndex++;
              continue;
            }
            const body = editorialBodyDescriptor({
              schemaVersion: 1,
              encoding,
              id: item.id,
              sourceIndex: state.itemIndex,
              sourceRecord: item.record,
              sourceBookId: item.sourceBookId,
              sourceToken: item.sourceToken,
              valueHash: item.valueHash,
              artifact: item.artifact,
              byteLength: item.byteLength,
              chunkCount: item.chunkCount,
              state: 'preparing',
              contentHash: null,
              partProofRoot: null,
            });
            state.pending = {
              body,
              part: 0,
              bytes: 0,
              hashState: null,
              algorithm,
              partProofRoot: seed,
              lastPart: null,
              bodyToken: null,
              contentHash: null,
            };
            state.phase = 'copy';
            writes.push({ kind: 'editorial-body', id: item.id, value: body });
            break;
          }
          if (state.phase === 'scan' && state.itemIndex === state.itemCount) {
            const totals = initial.loaded.job.validationSummary.totals;
            if (
              state.artifacts !== totals.editorialArtifacts ||
              state.links !== totals.editorialLinks ||
              state.summaries !== 1
            )
              inconsistent();
            state.phase = 'materialized';
          }
        } else {
          const p = state.pending,
            item = await reader.openEditorialItem(state.itemIndex);
          if (
            !item.editorial ||
            item.id !== p.body.id ||
            item.sourceToken !== p.body.sourceToken ||
            item.valueHash !== p.body.valueHash ||
            item.byteLength !== p.body.byteLength ||
            item.chunkCount !== p.body.chunkCount ||
            digest(item.record) !== digest(p.body.sourceRecord) ||
            digest(item.artifact) !== digest(p.body.artifact)
          )
            inconsistent();
          proofs.push(item.verify);
          const existing = await db.runTransaction(async (tx) => {
            const body = await protectedArtifact(
              tx,
              db,
              initial.loaded,
              'editorial-body',
              p.body.id,
            );
            editorialBodyDescriptor(body.value);
            if (digest(body.value) !== digest(p.body)) inconsistent();
            if (p.bodyToken === null) sameCommit(body.snapshot, initial.current.snapshot);
            else if (nativeRestoreToken(body.snapshot) !== p.bodyToken) inconsistent();
            const last =
              p.lastPart === null
                ? null
                : await protectedArtifact(
                    tx,
                    db,
                    initial.loaded,
                    'editorial-part',
                    partId(p.body.id, p.lastPart.index),
                  );
            return { body, last };
          });
          proofs.push(existing.body.verify);
          p.bodyToken = nativeRestoreToken(existing.body.snapshot);
          if (existing.last) {
            sameCommit(existing.last.snapshot, initial.current.snapshot);
            const length = Math.min(65536, p.body.byteLength - p.lastPart.index * 65536);
            const bytes = editorialStoredPart(
              existing.last.value,
              p.body.id,
              p.lastPart.index,
              length,
            );
            if (
              sha256(bytes) !== p.lastPart.contentHash ||
              existing.last.value.contentHash !== p.lastPart.contentHash
            )
              inconsistent();
            p.partProofRoot = digest({
              previous: p.partProofRoot,
              part: p.lastPart.index,
              token: nativeRestoreToken(existing.last.snapshot),
              contentHash: p.lastPart.contentHash,
            });
            proofs.push(existing.last.verify);
          }
          if (state.phase === 'copy') {
            const unit = await item.readPart(p.part);
            proofs.push(unit.verify);
            if (
              unit.part !== p.part ||
              unit.bytes.length !== Math.min(65536, p.body.byteLength - p.part * 65536) ||
              unit.done !== (p.part + 1 === p.body.chunkCount)
            )
              inconsistent();
            const hasher = await createSHA256();
            hasher.init();
            try {
              if (p.part > 0) {
                const saved = Buffer.from(p.hashState, 'base64');
                if (
                  saved.toString('base64') !== p.hashState ||
                  saved.length !== hasher.save().length
                )
                  inconsistent();
                try {
                  hasher.load(saved);
                } catch {
                  inconsistent();
                }
              }
              hasher.update(unit.bytes);
              const hash = sha256(unit.bytes);
              writes.push({
                kind: 'editorial-part',
                id: partId(p.body.id, p.part),
                value: {
                  schemaVersion: 1,
                  bodyId: p.body.id,
                  index: p.part,
                  byteLength: unit.bytes.length,
                  contentHash: hash,
                  bytesBase64: Buffer.from(unit.bytes).toString('base64'),
                },
              });
              p.lastPart = { index: p.part, contentHash: hash };
              p.part++;
              p.bytes = sum(p.bytes, unit.bytes.length);
              state.bytes = sum(state.bytes, unit.bytes.length);
              state.parts = sum(state.parts, 1);
              if (unit.done) {
                p.contentHash = hasher.digest();
                p.hashState = null;
                state.phase = 'seal';
              } else p.hashState = Buffer.from(hasher.save()).toString('base64');
            } finally {
              hasher.init();
            }
          } else {
            if (p.bytes !== p.body.byteLength || p.part !== p.body.chunkCount || !existing.last)
              inconsistent();
            const body = editorialBodyDescriptor({
              ...p.body,
              state: 'complete',
              contentHash: p.contentHash,
              partProofRoot: p.partProofRoot,
            });
            const record = editorialRecordDescriptor({
              ...body,
              bodyBirth: editorialBirth(existing.body.snapshot),
            });
            writes.push(
              { kind: 'editorial-body', id: body.id, replace: true, value: body },
              { kind: 'editorial-record', id: body.id, value: record },
            );
            state.lastRecord = { id: body.id, recordHash: digest(record) };
            const counter = {
              'book-editorial-artifact': 'artifacts',
              'book-editorial-link': 'links',
              'book-editorial': 'summaries',
            }[body.sourceRecord.kind];
            state[counter] = sum(state[counter], 1);
            state.itemIndex++;
            state.pending = null;
            state.phase = 'scan';
          }
        }
        validateEditorialMaterialization(state);
        assertSceneEnvelope(state);
        writes.push({
          kind: 'editorial-control',
          id: 'current',
          replace: initial.current !== null,
          value: state,
        });
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
        if (initial.current) await initial.current.verify(tx);
        else
          await verifyBookRestoreEditorialBaseAudit(
            tx,
            db,
            loaded,
            readOp,
            loaded.job.preparation.artifactCount,
          );
        for (const verify of proofs) await verify(tx);
        const artifacts = await prepareBookRestoreArtifacts(
          tx,
          db,
          loaded,
          request.operationId,
          writes,
          15,
        );
        const preparation = structuredClone(loaded.job.preparation);
        preparation.artifactCount = sum(preparation.artifactCount, artifacts.created);
        preparation.editorialAddedArtifacts = sum(
          preparation.editorialAddedArtifacts ?? 0,
          artifacts.created,
        );
        if (editorialArtifactCount(state) !== preparation.artifactCount) inconsistent();
        const record = next(loaded.job, request, { cleanupVersion: 15, preparation });
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
