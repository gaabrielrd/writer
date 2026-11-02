import {
  authorize,
  mutationInput,
  requestHash,
  inconsistent,
  restoreFail,
  digest,
  nativeToken,
  ADVENTURE_RESTORE_SEED,
} from './adventureRestoreContracts.mjs';
import { AdventureContentError } from './adventureContentPrimitives.mjs';
import { AdventureBackupFormatError } from './adventureBackupContainer.mjs';
import { createAdventureContentHash } from './adventureContentHash.mjs';
import {
  initialAdventureRestoreValidation,
  prepareAdventureRestoreValidationStep,
  completeAdventureRestoreValidation,
} from './adventureRestoreValidationStep.mjs';
import {
  initialAdventureValidationMeta,
  ADVENTURE_VALIDATION_COLLECTIONS,
  ADVENTURE_VALIDATION_FAILURES,
} from './adventureRestoreValidationMeta.mjs';
import {
  readAdventureValidationState,
  assertAdventureValidationPin,
  validationFrames,
} from './adventureRestoreValidationState.mjs';
import {
  createAdventureValidationSource,
  verifyAdventureValidationMembership,
} from './adventureRestoreValidationSource.mjs';
import { createAdventureValidationIndex } from './adventureRestoreValidationIndex.mjs';
import { restoreContext } from './adventureRestoreChunks.mjs';
async function emptyValidation(store, tx, loaded) {
  for (const name of ADVENTURE_VALIDATION_COLLECTIONS)
    if (
      (
        await tx.get(
          store.db
            .collection(loaded.ref.path + '/' + name)
            .select('schemaVersion')
            .limit(1),
        )
      ).docs.length
    )
      inconsistent();
}
/** Internal coordinator; content verification does not create an owned project or authorize restore. */
export function createAdventureRestoreValidationService(store) {
  const action = 'advanceAdventureRestoreValidation';
  return {
    async advanceAdventureRestoreValidation(uid, input) {
      authorize(uid);
      const request = Object.freeze(mutationInput(input)),
        fingerprint = requestHash(action, request);
      const begin = await store.db.runTransaction(async (tx) => {
        const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
          op = await tx.get(store.refs.op(uid, request.operationId));
        if (op.exists)
          return { replay: store.confirm(loaded, store.operation(op, loaded, fingerprint)) };
        if (!['bytes-verified', 'validating'].includes(loaded.job.state))
          restoreFail('failed-precondition', 'state-conflict');
        if (loaded.job.checkpoint !== request.expectedCheckpoint)
          restoreFail('failed-precondition', 'checkpoint-conflict');
        const saved = loaded.job.validation
          ? await readAdventureValidationState(store, tx, loaded)
          : null;
        if (!saved) await emptyValidation(store, tx, loaded);
        return { loaded, saved };
      });
      if (begin.replay) return begin.replay;
      const { loaded: initial, saved } = begin,
        hash = await createAdventureContentHash(),
        source = createAdventureValidationSource(store, initial),
        previous = saved?.state ?? initialAdventureRestoreValidation(),
        buffer = createAdventureValidationIndex(store, initial, request, previous),
        validation = structuredClone(initial.job.validation ?? initialAdventureValidationMeta());
      let nextState = null,
        failure = null,
        recheck = null;
      try {
        if (validation.phase === 'recheck') {
          const from = validation.recheckedChunks,
            end = Math.min(initial.job.checkedChunks, from + 16);
          let chain = from
            ? (await source.chunk(from - 1)).proof.chainHash
            : ADVENTURE_RESTORE_SEED;
          for (let at = from; at < end; at++) {
            const item = await source.chunk(at);
            if (item.proof.previousChainHash !== chain) inconsistent();
            chain = item.proof.chainHash;
          }
          recheck = { from, end };
          validation.recheckedChunks = end;
          if (end === initial.job.checkedChunks) {
            if (chain !== initial.job.uploadedChainHash) inconsistent();
            const report = completeAdventureRestoreValidation(previous, {
              index: buffer.port.index,
              hash,
            });
            if (report.sourceAdventureId === initial.job.adventureId) inconsistent();
            validation.phase = 'verified';
            validation.summary = {
              sourceAdventureId: report.sourceAdventureId,
              totals: report.totals,
              warnings: report.warnings,
            };
            validation.reportHash = digest({
              domain: 'writer-adventure-server-content-v1',
              source: initial.job.source,
              report,
            });
          }
        } else {
          nextState = await prepareAdventureRestoreValidationStep(
            previous,
            source.source,
            buffer.port,
            { hash },
          );
          validation.phase = nextState.phase === 'done' ? 'recheck' : nextState.phase;
          validation.frames = validationFrames(nextState);
          validation.items = nextState.items;
          validation.indexEntries += buffer.counts.indexEntries;
          if (nextState.items !== previous.items + buffer.counts.items) inconsistent();
        }
      } catch (error) {
        if (
          !(
            error instanceof AdventureContentError || error instanceof AdventureBackupFormatError
          ) ||
          !ADVENTURE_VALIDATION_FAILURES.includes(error.code)
        ) {
          // Another worker may have committed this exact operation while a pinned read was pending.
          let replay = null;
          try {
            replay = await store.db.runTransaction(async (tx) => {
              const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
                op = await tx.get(store.refs.op(uid, request.operationId));
              return op.exists
                ? store.confirm(loaded, store.operation(op, loaded, fingerprint))
                : null;
            });
          } catch {
            /* Preserve the original storage/identity failure if resolution is unavailable. */
          }
          if (replay) return replay;
          throw error;
        }
        failure = error.code;
      }
      return store.db.runTransaction(async (tx) => {
        const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
          op = await tx.get(store.refs.op(uid, request.operationId));
        if (op.exists) return store.confirm(loaded, store.operation(op, loaded, fingerprint));
        assertAdventureValidationPin(loaded, initial);
        if (saved) {
          const current = await readAdventureValidationState(store, tx, loaded);
          if (nativeToken(current.snapshot) !== nativeToken(saved.snapshot)) inconsistent();
        } else await emptyValidation(store, tx, loaded);
        await source.verify(tx, loaded);
        await buffer.verify(tx, loaded);
        if (recheck)
          await verifyAdventureValidationMembership(store, tx, loaded, recheck.from, recheck.end);
        const meta = failure
          ? {
              ...(initial.job.validation ?? initialAdventureValidationMeta()),
              phase: 'rejected',
              failure,
            }
          : validation;
        let value = null;
        if (!failure && nextState) {
          value = {
            ...restoreContext(loaded, saved?.value.createdByOperationId ?? request.operationId),
            updatedByOperationId: request.operationId,
            checkpoint: loaded.job.checkpoint + 1,
            stateJSON: JSON.stringify(nextState),
          };
          meta.stateCreated = true;
          meta.snapshot = {
            birthOperationId: value.createdByOperationId,
            operationId: request.operationId,
            checkpoint: value.checkpoint,
            hash: digest(value),
          };
        }
        const record = store.next(loaded, request, action, {
            validation: meta,
            state: failure
              ? 'content-rejected'
              : meta.phase === 'verified'
                ? 'content-verified'
                : 'validating',
          }),
          effects = failure ? [] : buffer.effects();
        if (value) effects.push(store.effect('validationState', 'current', value));
        if (!failure) buffer.commit(tx);
        if (value) {
          const ref = store.db.doc(loaded.ref.path + '/validationState/current');
          if (saved) tx.update(ref, value);
          else tx.create(ref, value);
        }
        return store.commit(tx, loaded, request, action, record, effects);
      });
    },
  };
}
