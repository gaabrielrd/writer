import { createAdventureContentHash } from './adventureContentHash.mjs';
import {
  authorize,
  mutationInput,
  integer,
  invalid,
  inconsistent,
  requestHash,
  restoreFail,
  sum,
  chunkId,
  digest,
  closed,
} from './adventureRestoreContracts.mjs';
import { restoreContext, readAdventureRestoreChunk } from './adventureRestoreChunks.mjs';
/** Server-private hash states may retain a bounded tail of source bytes. Never expose them in metadata. */
export function createAdventureRestoreIntegrityService(store) {
  const { db, refs } = store,
    action = 'advanceAdventureRestoreIntegrity';
  return {
    async advanceAdventureRestoreIntegrity(uid, input) {
      authorize(uid);
      const request = { ...mutationInput(input, ['limit']), limit: integer(input.limit, 1) };
      if (request.limit > 16) invalid();
      const fingerprint = requestHash(action, request),
        hash = await createAdventureContentHash();
      return db.runTransaction(async (tx) => {
        const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
          op = await tx.get(refs.op(uid, request.operationId)),
          job = loaded.job;
        if (op.exists) return store.confirm(loaded, store.operation(op, loaded, fingerprint));
        if (!['uploaded', 'checking'].includes(job.state))
          restoreFail('failed-precondition', 'state-conflict');
        if (request.expectedCheckpoint !== job.checkpoint)
          restoreFail('failed-precondition', 'checkpoint-conflict');
        let saved;
        if (job.integrityStateId !== null) {
          const state = await tx.get(
              db.doc(loaded.ref.path + '/integrityStates/' + job.integrityStateId),
            ),
            value = await store.artifact(tx, loaded, 'integrityStates', state);
          closed(value, [
            'schemaVersion',
            'ownerId',
            'restoreId',
            'jobToken',
            'createdByOperationId',
            'checkpoint',
            'checkedChunks',
            'checkedBytes',
            'chainHash',
            'hashState',
          ]);
          if (
            digest(value) !== job.integrityStateHash ||
            value.checkpoint !== job.checkpoint ||
            value.checkedChunks !== job.checkedChunks ||
            value.checkedBytes !== job.checkedBytes ||
            value.chainHash !== job.checkedChainHash
          )
            inconsistent();
          saved = value.hashState;
        } else {
          for (const name of ['integrityStates', 'integrityProofs']) {
            if (
              (
                await tx.get(
                  db
                    .collection(loaded.ref.path + '/' + name)
                    .select('schemaVersion')
                    .limit(1),
                )
              ).docs.length
            )
              inconsistent();
          }
        }
        let h;
        try {
          h = hash.create(saved);
        } catch {
          inconsistent();
        }
        try {
          const from = job.checkedChunks,
            end = Math.min(job.uploadedChunks, from + request.limit),
            n = end - from;
          let query = db
            .collection(loaded.ref.path + '/chunks')
            .select('index')
            .orderBy('__name__')
            .limit(n + 1);
          if (from) query = query.startAfter(chunkId(from - 1));
          const page = await tx.get(query);
          if (page.docs.length !== n + (end < job.uploadedChunks ? 1 : 0)) inconsistent();
          for (let at = 0; at < page.docs.length; at++)
            if (page.docs[at].id !== chunkId(from + at) || page.docs[at].data().index !== from + at)
              inconsistent();
          const values = [],
            effects = [];
          let checkedBytes = job.checkedBytes,
            chainHash = job.checkedChainHash;
          for (let index = from; index < end; index++) {
            const item = await readAdventureRestoreChunk(store, tx, loaded, index),
              proofRef = db.doc(loaded.ref.path + '/integrityProofs/' + chunkId(index));
            if ((await tx.get(proofRef)).exists || item.proof.previousChainHash !== chainHash)
              inconsistent();
            h.update(item.bytes);
            checkedBytes = sum(checkedBytes, item.bytes.length);
            chainHash = item.proof.chainHash;
            const value = { ...restoreContext(loaded, request.operationId), ...item.proof };
            values.push({ ref: proofRef, value });
            effects.push(store.effect('integrityProofs', chunkId(index), value));
          }
          const complete = end === job.uploadedChunks,
            integrityDigest = complete ? h.digest() : null,
            failure = complete
              ? chainHash !== job.uploadedChainHash
                ? 'upload-chain-mismatch'
                : integrityDigest !== job.source.sha256
                  ? 'file-hash-mismatch'
                  : null
              : null;
          const state = complete
              ? null
              : {
                  ...restoreContext(loaded, request.operationId),
                  checkpoint: sum(job.checkpoint, 1),
                  checkedChunks: end,
                  checkedBytes,
                  chainHash,
                  hashState: h.save(),
                },
            stateRef = db.doc(loaded.ref.path + '/integrityStates/' + request.operationId);
          if ((await tx.get(stateRef)).exists) inconsistent();
          if (state) effects.push(store.effect('integrityStates', request.operationId, state));
          const record = store.next(loaded, request, action, {
            state: complete ? (failure ? 'rejected' : 'bytes-verified') : 'checking',
            checkedChunks: end,
            checkedBytes,
            checkedChainHash: chainHash,
            integrityDigest,
            integrityFailure: failure,
            integrityStateId: state ? request.operationId : null,
            integrityStateHash: state ? digest(state) : null,
            writtenStates: job.writtenStates + (state ? 1 : 0),
          });
          values.forEach((v) => tx.create(v.ref, v.value));
          if (state) tx.create(stateRef, state);
          return store.commit(tx, loaded, request, action, record, effects);
        } finally {
          h.destroy();
        }
      });
    },
  };
}
