import {
  authorize,
  closed,
  restoreId,
  restoreHash,
  restoreFail,
  inconsistent,
  digest,
  nativeToken,
} from './adventureRestoreContracts.mjs';
import { adventureStagingView } from './adventureRestoreStagingMeta.mjs';
import { createVerifiedAdventureRestoreContent } from './adventureRestoreContentRead.mjs';
import {
  adventureAuditContext,
  verifyAdventureAuditAnchor,
} from './adventureRestoreAuditInventory.mjs';
import { readAdventureCountArtifact, countAddress } from './adventureRestoreCountEffects.mjs';
import { readAdventureRestorePersonaBatch } from './adventureRestorePersonaLibraryBatch.mjs';
import { prepareAdventureRestoreUniverseLink } from './adventureRestoreUniverse.mjs';
export function assertAdventureActivationAvailable(loaded) {
  const p = loaded.job.staging;
  if (
    loaded.job.state !== 'content-verified' ||
    p?.phase !== 'audit-ready' ||
    !p.librarySourceAudit ||
    p.libraryImages !== p.imageAssets ||
    p.libraryUses !== p.imageAssets ||
    p.auditSealOperationId === p.librarySourceAudit.operationId ||
    p.cleanedArtifacts !== 0 ||
    p.personaLibraryRevoked ||
    p.storageFenced !== 0 ||
    p.auditContext !== adventureAuditContext(loaded)
  )
    restoreFail('failed-precondition', 'activation-phase-conflict');
}
export async function verifyAdventureActivationSeal(store, tx, loaded) {
  assertAdventureActivationAvailable(loaded);
  const p = loaded.job.staging;
  await verifyAdventureAuditAnchor(store, tx, loaded, p.auditAnchor);
  const seal = await tx.get(store.refs.op(loaded.uid, p.auditSealOperationId));
  if (!seal.exists) inconsistent();
  const r = store.operation(seal, loaded);
  if (
    !['advanceAdventureRestoreAudit', 'retireAdventureRestoreActivation'].includes(r.action) ||
    r.state !== 'content-verified' ||
    r.checkpoint !== loaded.job.checkpoint ||
    seal.id !== loaded.job.lastOperationId ||
    seal.data().jobHash !== digest(loaded.job) ||
    digest(r.staging) !== digest(adventureStagingView(p))
  )
    inconsistent();
  return seal;
}
export async function adventureActivationItems(store, uid, input) {
  const reader = await createVerifiedAdventureRestoreContent({
      db: store.db,
      uid,
      restoreId: input.restoreId,
      jobToken: input.jobToken,
    }),
    loaded = await store.db.runTransaction((tx) =>
      store.load(tx, uid, input.restoreId, input.jobToken),
    );
  assertAdventureActivationAvailable(loaded);
  return {
    metadata: await reader.readMappedItem(0),
    universe: await reader.readItem(loaded.job.staging.historyStartIndex),
  };
}
export async function prepareAdventureActivationReview(store, tx, loaded, items) {
  const seal = await verifyAdventureActivationSeal(store, tx, loaded),
    root = await readAdventureCountArtifact(store, tx, loaded, {
      scope: 'job',
      path: ['preparedRoot', 'current'],
    }),
    control = await readAdventureCountArtifact(
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
    batch = await readAdventureRestorePersonaBatch(store, tx, loaded, 'preparing'),
    p = loaded.job.staging;
  if (
    items.metadata.record.kind !== 'adventure-metadata' ||
    items.metadata.record.id !== loaded.job.adventureId ||
    items.metadata.sourceRecord.id !== root.data.sourceAdventureId
  )
    inconsistent();
  await items.metadata.verify(tx);
  if (
    root.data.ownerId !== loaded.uid ||
    root.data.value.id !== loaded.job.adventureId ||
    root.data.value.title !== items.metadata.value.data.title ||
    control.data.countReady !== false ||
    control.data.wordCount !== p.countWordCount ||
    control.data.processed !== p.countScenes ||
    control.data.phase !== 'done' ||
    control.data.cursor !== null ||
    index.data.complete !== true ||
    index.data.processed !== p.resourceCounts['scene-reference']
  )
    inconsistent();
  const universe = await prepareAdventureRestoreUniverseLink(tx, store, loaded, items.universe),
    title = root.data.value.title,
    clipped = title.slice(0, 300),
    preview = /[\uD800-\uDBFF]$/.test(clipped) ? clipped.slice(0, -1) : clipped,
    result = {
      schemaVersion: 1,
      restoreId: loaded.id,
      adventureId: loaded.job.adventureId,
      checkpoint: loaded.job.checkpoint,
      summary: {
        titlePreview: preview,
        titleTruncated: preview.length !== title.length,
        visibility: 'private',
        counts: {
          parts: p.parts,
          scenes: p.scenes,
          blocks: p.blocks,
          words: p.countWordCount,
          lore: p.loreHeads,
          versions: p.historyVersions + p.drafts,
          profiles: p.personaLibraryInstalled,
          images: p.libraryImages,
        },
        universe: {
          originKind: universe.origin.kind,
          observed: universe.observed,
          universeId: universe.universeId,
        },
        mediaState: p.imageAssets ? 'pending' : 'none',
        draftOutcome: p.draftOutcome,
        warnings: structuredClone(loaded.job.validation.summary.warnings),
      },
    };
  const reviewToken = digest({
    domain: 'writer-adventure-activation-review-v1',
    uid: loaded.uid,
    restoreId: loaded.id,
    jobToken: loaded.view.jobToken,
    job: nativeToken(loaded.snapshot),
    source: loaded.job.source,
    reviewHash: loaded.job.reviewHash,
    staging: p,
    seal: nativeToken(seal),
    metadata: items.metadata.sourceToken,
    controls: [root, control, index].map((a) => ({
      journal: a.value,
      target: nativeToken(a.metadata),
    })),
    batch: nativeToken(batch.snapshot),
    universe: result.summary.universe,
    result,
  });
  return { result: { ...result, reviewToken }, root, control, batch, universe };
}
export function createAdventureRestoreActivationReviewService(store) {
  return {
    async getAdventureRestoreActivationReview(uid, input) {
      authorize(uid);
      closed(input, ['restoreId', 'jobToken']);
      const request = {
          restoreId: restoreId(input.restoreId),
          jobToken: restoreHash(input.jobToken),
        },
        items = await adventureActivationItems(store, uid, request);
      return store.db.runTransaction(async (tx) => {
        const loaded = await store.load(tx, uid, request.restoreId, request.jobToken);
        return (await prepareAdventureActivationReview(store, tx, loaded, items)).result;
      });
    },
  };
}
