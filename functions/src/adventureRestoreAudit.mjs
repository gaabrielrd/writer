import {
  authorize,
  mutationInput,
  requestHash,
  restoreFail,
  inconsistent,
  nativeToken,
} from './adventureRestoreContracts.mjs';
import { ADVENTURE_AUDIT_LAYOUT } from './adventureRestoreAuditLayout.mjs';
import { ADVENTURE_AUDIT_PHASES } from './adventureRestoreAuditMeta.mjs';
import { readAdventureRestorePersonaBatch } from './adventureRestorePersonaLibraryBatch.mjs';
import { readAdventureCountArtifact, countAddress } from './adventureRestoreCountEffects.mjs';
import {
  observeImageArtifact,
  imageStorageAddress,
  checkedStorageIntent,
  adventureImageStorageContext,
} from './adventureRestoreImageStorageRead.mjs';
import {
  adventureAuditContext,
  verifyAdventureAuditAnchor,
  advanceAdventureAuditJournals,
  advanceAdventureAuditPhysical,
} from './adventureRestoreAuditInventory.mjs';
const action = 'advanceAdventureRestoreAudit';
export function createAdventureRestoreAuditService(store, assets) {
  function available(loaded, request) {
    if (
      loaded.job.state !== 'content-verified' ||
      !['counts-ready', ...ADVENTURE_AUDIT_PHASES.slice(0, -1)].includes(
        loaded.job.staging?.phase,
      ) ||
      loaded.job.checkpoint !== request.expectedCheckpoint ||
      loaded.job.staging.personaLibraryRevoked
    )
      restoreFail('failed-precondition', 'state-conflict');
  }
  async function resolved(tx, loaded, request) {
    const op = await tx.get(store.refs.op(loaded.uid, request.operationId));
    return op.exists
      ? store.confirm(loaded, store.operation(op, loaded, requestHash(action, request)))
      : null;
  }
  async function controls(tx, loaded) {
    await readAdventureRestorePersonaBatch(store, tx, loaded, 'preparing');
    const control = await readAdventureCountArtifact(
        store,
        tx,
        loaded,
        countAddress('workProgress', 'current'),
      ),
      index = await readAdventureCountArtifact(
        store,
        tx,
        loaded,
        countAddress('narrativeControls', 'entity-scenes'),
      ),
      root = await readAdventureCountArtifact(store, tx, loaded, {
        scope: 'job',
        path: ['preparedRoot', 'current'],
      }),
      p = loaded.job.staging;
    if (
      control.data.countReady !== false ||
      control.data.wordCount !== p.countWordCount ||
      control.data.processed !== p.countScenes ||
      control.data.phase !== 'done' ||
      control.data.cursor !== null ||
      index.data.complete !== true ||
      index.data.processed !== p.resourceCounts['scene-reference'] ||
      root.data.ownerId !== loaded.uid ||
      root.data.value.wordCount !== p.countWordCount ||
      root.data.value.id !== loaded.job.adventureId ||
      p.storagePrepared !== p.imageAssets
    )
      inconsistent();
  }
  function nextStage(loaded) {
    const p = loaded.job.staging;
    if (p.phase !== 'counts-ready') return structuredClone(p);
    return {
      ...p,
      phase: 'audit-journals',
      auditContext: adventureAuditContext(loaded),
      auditJournals: 0,
      auditPhysical: 0,
      auditMedia: 0,
      auditFamily: 0,
      auditParent: null,
      auditParentAfter: null,
      auditAfter: null,
      auditAnchor: null,
      auditMediaAfter: null,
      auditSealOperationId: null,
    };
  }
  function commit(tx, loaded, request, staging) {
    const record = store.next(loaded, request, action, { staging });
    return store.commit(tx, loaded, request, action, record);
  }
  return {
    async advanceAdventureRestoreAudit(uid, input) {
      authorize(uid);
      const request = Object.freeze(mutationInput(input)),
        initial = await store.db.runTransaction(async (tx) => {
          const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
            replay = await resolved(tx, loaded, request);
          if (replay) return { result: replay };
          available(loaded, request);
          await controls(tx, loaded);
          const p = nextStage(loaded);
          if (p.auditContext !== adventureAuditContext(loaded)) inconsistent();
          await verifyAdventureAuditAnchor(store, tx, loaded, p.auditAnchor);
          if (p.phase === 'audit-journals')
            await advanceAdventureAuditJournals(store, tx, loaded, p);
          else if (p.phase === 'audit-physical') {
            await advanceAdventureAuditPhysical(store, tx, loaded, p);
            if (p.auditFamily === ADVENTURE_AUDIT_LAYOUT.length) {
              if (p.auditPhysical !== p.auditJournals) inconsistent();
              p.phase = 'audit-media';
            }
          } else if (p.phase === 'audit-media') {
            let query = store.db
              .collection(loaded.ref.path + '/preparedRoot')
              .where('kind', '==', 'adventure-restore-image-storage')
              .select()
              .orderBy('__name__')
              .limit(1);
            if (p.auditMediaAfter !== null) query = query.startAfter(p.auditMediaAfter);
            const page = await tx.get(query);
            if (page.docs.length) {
              const snap = page.docs[0],
                id = snap.id.slice('image-storage-'.length),
                observed = await observeImageArtifact(store, tx, loaded, imageStorageAddress(id)),
                value = checkedStorageIntent(loaded, observed, id);
              if (
                value.state !== 'prepared' ||
                nativeToken(snap) !== nativeToken(await tx.get(snap.ref))
              )
                inconsistent();
              if (typeof assets?.verify !== 'function')
                restoreFail('failed-precondition', 'image-storage-unavailable');
              return { media: { loaded, p, observed, value, id: snap.id } };
            }
            if (p.auditMedia !== p.storagePrepared) inconsistent();
            p.phase = 'audit-ready';
            p.auditSealOperationId = request.operationId;
          } else inconsistent();
          return { result: commit(tx, loaded, request, p) };
        });
      if (initial.result) return initial.result;
      const m = initial.media;
      try {
        await assets.verify(adventureImageStorageContext(m.loaded, m.value.asset), m.value.storage);
      } catch (error) {
        let replay;
        try {
          replay = await store.db.runTransaction(async (tx) => {
            const loaded = await store.load(tx, uid, request.restoreId, request.jobToken);
            return resolved(tx, loaded, request);
          });
        } catch {
          /* Preserve the original Storage failure. */
        }
        if (replay) return replay;
        throw error;
      }
      return store.db.runTransaction(async (tx) => {
        const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
          replay = await resolved(tx, loaded, request);
        if (replay) return replay;
        available(loaded, request);
        if (
          loaded.job.staging.phase !== 'audit-media' ||
          loaded.job.staging.auditContext !== adventureAuditContext(loaded)
        )
          inconsistent();
        await controls(tx, loaded);
        await verifyAdventureAuditAnchor(store, tx, loaded, m.p.auditAnchor);
        await m.observed.verify(tx, loaded);
        const p = { ...m.p, auditMedia: m.p.auditMedia + 1, auditMediaAfter: m.id };
        return commit(tx, loaded, request, p);
      });
    },
  };
}
