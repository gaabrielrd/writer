import { createHash } from 'node:crypto';
import { constants as bufferConstants } from 'node:buffer';
import {
  authorize,
  mutationInput,
  requestHash,
  restoreFail,
  inconsistent,
  sum,
  digest,
  nativeToken,
} from './adventureRestoreContracts.mjs';
import { assertAdventureValidationPin } from './adventureRestoreValidationState.mjs';
import { createVerifiedAdventureRestoreContent } from './adventureRestoreContentRead.mjs';
import { createAdventureRestoreRemapper } from './adventureRestoreRemap.mjs';
import {
  adventureStageArtifactId,
  adventureStageTarget,
  readAdventureStageArtifact,
  prepareAdventureStageArtifacts,
} from './adventureRestoreArtifacts.mjs';
import { readWorkMetadata } from './workProgressContracts.mjs';
import { validAdventureTextState } from './adventureRestoreHistoryMeta.mjs';
import { validAdventureRecoveredDraft } from './adventureRestoreDraftMeta.mjs';
import { recoveredAdventureDraftVersionId } from './adventureRestoreHistoryProjection.mjs';
import { countVisibleWords } from './visibleWordCount.mjs';
const privateAddress = (id) => ({ scope: 'job', path: ['preparedRoot', id] });
const native = (...path) => ({ scope: 'adventure', path });
async function observe(store, tx, loaded, address) {
  const ref = store.db.doc(
      loaded.ref.path + '/stagingArtifacts/' + adventureStageArtifactId(address),
    ),
    snapshot = await tx.get(ref),
    artifact = await readAdventureStageArtifact(store, tx, loaded, snapshot, { withValue: true }),
    journalToken = nativeToken(snapshot),
    journalHash = digest(snapshot.data()),
    targetToken = nativeToken(artifact.metadata);
  return {
    data: artifact.data,
    token: digest({ address, journalToken, journalHash, targetToken }),
    async verify(tx, current) {
      if (
        current.uid !== loaded.uid ||
        current.id !== loaded.id ||
        current.view.jobToken !== loaded.view.jobToken
      )
        inconsistent();
      const now = await tx.get(ref),
        value = await readAdventureStageArtifact(store, tx, current, now);
      if (
        nativeToken(now) !== journalToken ||
        digest(now.data()) !== journalHash ||
        nativeToken(value.metadata) !== targetToken
      )
        inconsistent();
    },
  };
}
async function absent(store, tx, loaded, address) {
  const target = await readWorkMetadata(tx, adventureStageTarget(store, loaded, address), [
      'schemaVersion',
    ]),
    journal = await readWorkMetadata(
      tx,
      store.db.doc(loaded.ref.path + '/stagingArtifacts/' + adventureStageArtifactId(address)),
      ['schemaVersion'],
    );
  if (target.exists || journal.exists) inconsistent();
}
export function createAdventureRestoreDraftFinalizeService(store) {
  const action = 'finalizeAdventureRestoreDraft';
  function available(loaded, request) {
    if (
      loaded.job.state !== 'content-verified' ||
      loaded.job.staging?.phase !== 'history-ready' ||
      loaded.job.checkpoint !== request.expectedCheckpoint
    )
      restoreFail('failed-precondition', 'state-conflict');
  }
  return {
    async finalizeAdventureRestoreDraft(uid, input) {
      authorize(uid);
      const request = Object.freeze(mutationInput(input)),
        fingerprint = requestHash(action, request);
      const initial = await store.db.runTransaction(async (tx) => {
        const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
          op = await tx.get(store.refs.op(uid, request.operationId));
        if (op.exists)
          return { replay: store.confirm(loaded, store.operation(op, loaded, fingerprint)) };
        available(loaded, request);
        const root = await observe(store, tx, loaded, privateAddress('current'));
        if (
          root.data.ownerId !== uid ||
          root.data.value.id !== loaded.job.adventureId ||
          root.data.value.historyRevision !== loaded.job.staging.historyVersions
        )
          inconsistent();
        if (loaded.job.staging.drafts === 0) {
          await absent(store, tx, loaded, privateAddress('recovered-draft'));
          return { loaded, root, descriptor: null };
        }
        const descriptor = await observe(store, tx, loaded, privateAddress('recovered-draft')),
          state = await observe(store, tx, loaded, privateAddress('text-state'));
        if (
          !validAdventureRecoveredDraft(descriptor.data) ||
          !validAdventureTextState(state.data) ||
          !state.data.done ||
          state.data.kind !== 'draft' ||
          state.data.ownerId !== uid ||
          state.data.unitIndex !== loaded.job.staging.itemIndex - 2
        )
          inconsistent();
        return { loaded, root, descriptor, state };
      });
      if (initial.replay) return initial.replay;
      const proofs = [initial.root],
        chunks = [];
      let source = null,
        descriptor = null,
        wordCount = null;
      try {
        if (initial.descriptor) {
          descriptor = initial.descriptor.data;
          proofs.push(initial.descriptor, initial.state);
          const reader = await createVerifiedAdventureRestoreContent({
              db: store.db,
              uid,
              restoreId: request.restoreId,
              jobToken: request.jobToken,
            }),
            unit = await reader.readItem(initial.state.data.unitIndex),
            mapper = createAdventureRestoreRemapper({
              schemaVersion: 1,
              jobToken: request.jobToken,
              sourceAdventureId: reader.sourceAdventureId,
              adventureId: reader.adventureId,
            });
          if (
            unit.record.kind !== 'adventure-draft' ||
            unit.contentHash !== initial.state.data.sourceHeaderHash
          )
            inconsistent();
          const mapped = (await mapper.mapJSON(unit.record, unit.value)).value,
            raw = await reader.openMappedRaw(initial.state.data.unitIndex),
            state = initial.state.data;
          const expected = {
            schemaVersion: 1,
            state: 'pending-finalization',
            versionId: recoveredAdventureDraftVersionId(initial.loaded, mapped.resource),
            resource: mapped.resource,
            baseRevision: mapped.baseRevision,
            savedAt: mapped.savedAt,
            current: unit.value.current,
            byteLength: mapped.byteLength,
            contentHash: mapped.contentHash,
            chunkCount: initial.loaded.job.staging.draftBodies,
          };
          if (
            digest(descriptor) !== digest(expected) ||
            state.versionId !== descriptor.versionId ||
            state.chunkCount !== descriptor.chunkCount ||
            state.writtenBytes !== descriptor.byteLength ||
            state.rawCheckpoint.sourceToken !== raw.sourceToken ||
            state.rawCheckpoint.part !== raw.manifest.chunkCount ||
            raw.manifest.byteLength !== descriptor.byteLength ||
            raw.manifest.contentHash !== descriptor.contentHash
          )
            inconsistent();
          source = unit;
          const sourceHead = await reader.findResource(
              unit.value.resource.kind,
              unit.value.resource.id,
            ),
            sourceBody = await reader.findResource(
              unit.value.resource.kind + '-body',
              'current',
              unit.value.resource.id,
            );
          if (
            sourceHead.contentHash !== unit.value.current.headHash ||
            sourceBody.contentHash !== unit.value.current.bodyHash
          )
            inconsistent();
          const collection = mapped.resource.kind === 'scene' ? 'scenes' : 'sceneBlocks';
          await store.db.runTransaction(async (tx) => {
            const loaded = await store.load(tx, uid, request.restoreId, request.jobToken);
            available(loaded, request);
            assertAdventureValidationPin(loaded, initial.loaded);
            const head = await observe(store, tx, loaded, native(collection, mapped.resource.id)),
              body = await observe(
                store,
                tx,
                loaded,
                native(collection, mapped.resource.id, 'body', 'current'),
              );
            if (
              head.data.ownerId !== uid ||
              head.data.id !== mapped.resource.id ||
              head.data.bodyHash !== sourceBody.value.data.hash ||
              body.data.content !== sourceBody.value.data.content ||
              body.data.hash !== sourceBody.value.data.hash
            )
              inconsistent();
            proofs.push(head, body);
          });
          // The original saved source and the prepared manuscript both remain tied to the draft.
          proofs.push(
            { verify: (tx) => sourceHead.verify(tx) },
            { verify: (tx) => sourceBody.verify(tx) },
          );
          const sha = createHash('sha256');
          let bytes = 0,
            characters = 0;
          for (let index = 0; index < descriptor.chunkCount; index++) {
            const part = await store.db.runTransaction(async (tx) => {
                const loaded = await store.load(tx, uid, request.restoreId, request.jobToken);
                available(loaded, request);
                assertAdventureValidationPin(loaded, initial.loaded);
                return observe(
                  store,
                  tx,
                  loaded,
                  native('workVersionBodies', digest({ versionId: descriptor.versionId, index })),
                );
              }),
              v = part.data;
            if (
              v.versionId !== descriptor.versionId ||
              v.index !== index ||
              typeof v.content !== 'string' ||
              !v.content.isWellFormed() ||
              Buffer.byteLength(v.content) > 65536
            )
              inconsistent();
            const value = Buffer.from(v.content, 'utf8');
            bytes = sum(bytes, value.length);
            characters = sum(characters, v.content.length);
            if (bytes > descriptor.byteLength) inconsistent();
            if (characters > bufferConstants.MAX_STRING_LENGTH)
              restoreFail('resource-exhausted', 'count-capacity');
            sha.update(value);
            chunks.push(v.content);
            proofs.push(part);
          }
          if (bytes !== descriptor.byteLength || sha.digest('hex') !== descriptor.contentHash)
            inconsistent();
          try {
            wordCount = countVisibleWords(chunks.join(''));
          } catch (error) {
            if (error instanceof RangeError) restoreFail('resource-exhausted', 'count-capacity');
            throw error;
          } finally {
            chunks.length = 0;
          }
        }
      } catch (error) {
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
          /* Preserve the original preparation failure. */
        }
        if (replay) return replay;
        throw error;
      }
      return store.db.runTransaction(async (tx) => {
        const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
          op = await tx.get(store.refs.op(uid, request.operationId));
        if (op.exists) return store.confirm(loaded, store.operation(op, loaded, fingerprint));
        available(loaded, request);
        assertAdventureValidationPin(loaded, initial.loaded);
        if (source) await source.verify(tx);
        for (const proof of proofs) await proof.verify(tx, loaded);
        const writes = [];
        if (descriptor) {
          const version = {
            schemaVersion: 1,
            id: descriptor.versionId,
            target: { kind: 'adventure', id: loaded.job.adventureId },
            resource: descriptor.resource,
            resourceKey: digest(descriptor.resource),
            createdAt: descriptor.savedAt,
            reason: 'manual',
            label: 'Rascunho recuperado do backup',
            wordCount,
            byteLength: descriptor.byteLength,
            contentHash: descriptor.contentHash,
            chunkCount: descriptor.chunkCount,
            deleting: false,
          };
          writes.push(
            { address: native('workVersions', descriptor.versionId), value: version },
            {
              address: privateAddress('recovered-draft'),
              mode: 'update',
              update: (old) => {
                if (digest(old) !== digest(descriptor)) inconsistent();
                return { ...old, state: 'finalized', wordCount };
              },
            },
            {
              address: privateAddress('current'),
              mode: 'update',
              update: (old) => {
                if (digest(old) !== digest(initial.root.data)) inconsistent();
                return {
                  ...old,
                  value: {
                    ...old.value,
                    historyRevision: sum(loaded.job.staging.historyVersions, 1),
                  },
                };
              },
            },
          );
        } else await absent(store, tx, loaded, privateAddress('recovered-draft'));
        const artifacts = await prepareAdventureStageArtifacts(
            store,
            tx,
            loaded,
            request.operationId,
            writes,
            digest({
              source: source?.sourceToken ?? null,
              artifacts: proofs.filter((p) => p.token).map((p) => p.token),
              wordCount,
            }),
          ),
          staging = {
            ...loaded.job.staging,
            phase: 'draft-ready',
            draftOutcome: descriptor ? 'version' : 'none',
            draftWordCount: wordCount,
            artifactCount: sum(loaded.job.staging.artifactCount, artifacts.count),
          },
          record = store.next(loaded, request, action, { staging });
        artifacts.commit();
        return store.commit(tx, loaded, request, action, record, artifacts.effects);
      });
    },
  };
}
