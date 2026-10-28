import {
  authorize,
  mutationInput,
  requestHash,
  restoreFail,
  inconsistent,
  digest,
  sum,
  nativeToken,
} from './adventureRestoreContracts.mjs';
import { prepareAdventureStageArtifacts } from './adventureRestoreArtifacts.mjs';
import { readAdventureRestorePersonaBatch } from './adventureRestorePersonaLibraryBatch.mjs';
import { readAdventureCountArtifact, countAddress } from './adventureRestoreCountEffects.mjs';
import {
  adventureAuditContext,
  verifyAdventureAuditAnchor,
} from './adventureRestoreAuditInventory.mjs';
import { auditViewKeys, auditPrivateKeys } from './adventureRestoreAuditMeta.mjs';
import {
  observeImageArtifact,
  imageStorageAddress,
  checkedStorageIntent,
} from './adventureRestoreImageStorageRead.mjs';
import { adventureImageBindingAddress } from './adventureRestoreImageProjection.mjs';
import { adventureImageUseKey } from './adventureBlockImages.mjs';
import { validateRestoredImageOrigin } from './restoredImageRemoval.mjs';
export const adventureLibraryImageAddress = (id) => ({
  scope: 'image',
  path: ['imageLibrary', id],
});
export const adventureLibraryUseAddress = (id, key) => ({
  scope: 'image',
  path: ['imageLibrary', id, 'uses', key],
});
export function createAdventureRestoreImageLibraryService(store) {
  const action = 'advanceAdventureRestoreImageLibrary';
  function available(loaded, request) {
    const p = loaded.job.staging;
    if (
      loaded.job.state !== 'content-verified' ||
      loaded.job.checkpoint !== request.expectedCheckpoint ||
      p?.personaLibraryRevoked ||
      !(
        p?.phase === 'image-library' ||
        (p?.phase === 'audit-ready' && !Object.hasOwn(p, 'libraryImages'))
      )
    )
      restoreFail('failed-precondition', 'state-conflict');
  }
  return {
    async advanceAdventureRestoreImageLibrary(uid, input) {
      authorize(uid);
      const request = Object.freeze(mutationInput(input));
      return store.db.runTransaction(async (tx) => {
        const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
          op = await tx.get(store.refs.op(uid, request.operationId));
        if (op.exists)
          return store.confirm(loaded, store.operation(op, loaded, requestHash(action, request)));
        available(loaded, request);
        await readAdventureRestorePersonaBatch(store, tx, loaded, 'preparing');
        const p = structuredClone(loaded.job.staging),
          first = p.phase === 'audit-ready';
        if (first) {
          if (
            p.auditContext !== adventureAuditContext(loaded) ||
            p.auditSealOperationId !== loaded.job.lastOperationId
          )
            inconsistent();
          await verifyAdventureAuditAnchor(store, tx, loaded, p.auditAnchor);
          const seal = await tx.get(store.refs.op(uid, p.auditSealOperationId)),
            receipt = store.operation(seal, loaded);
          if (
            receipt.action !== 'advanceAdventureRestoreAudit' ||
            receipt.staging?.phase !== 'audit-ready' ||
            receipt.checkpoint !== loaded.job.checkpoint ||
            seal.data().jobHash !== digest(loaded.job)
          )
            inconsistent();
          const source = {
            operationId: p.auditSealOperationId,
            checkpoint: loaded.job.checkpoint,
            artifactCount: p.artifactCount,
            contextToken: p.auditContext,
            jobHash: seal.data().jobHash,
          };
          for (const key of [...auditViewKeys, ...auditPrivateKeys]) delete p[key];
          Object.assign(p, {
            phase: 'image-library',
            libraryImages: 0,
            libraryUses: 0,
            libraryAfter: null,
            librarySourceAudit: source,
          });
        } else {
          const source = p.librarySourceAudit,
            seal = await tx.get(store.refs.op(uid, source.operationId)),
            receipt = store.operation(seal, loaded);
          if (
            receipt.action !== 'advanceAdventureRestoreAudit' ||
            receipt.staging?.phase !== 'audit-ready' ||
            receipt.checkpoint !== source.checkpoint ||
            receipt.staging.artifactCount !== source.artifactCount ||
            seal.data().jobHash !== source.jobHash
          )
            inconsistent();
        }
        let query = store.db
          .collection(loaded.ref.path + '/preparedRoot')
          .where('kind', '==', 'adventure-restore-image-storage')
          .select()
          .orderBy('__name__')
          .limit(1);
        if (p.libraryAfter !== null) query = query.startAfter(p.libraryAfter);
        const rows = await tx.get(query),
          writes = [];
        let sourceToken = digest(p.librarySourceAudit);
        if (rows.docs.length) {
          const snap = rows.docs[0],
            id = snap.id.slice('image-storage-'.length),
            observed = await observeImageArtifact(store, tx, loaded, imageStorageAddress(id)),
            intent = checkedStorageIntent(loaded, observed, id),
            asset = intent.asset,
            binding = intent.binding;
          if (
            intent.state !== 'prepared' ||
            nativeToken(snap) !== nativeToken(await tx.get(snap.ref))
          )
            inconsistent();
          const descriptor = await observeImageArtifact(
              store,
              tx,
              loaded,
              adventureImageBindingAddress(id),
            ),
            resource = binding.resource,
            head = await observeImageArtifact(
              store,
              tx,
              loaded,
              countAddress(resource.kind === 'scene' ? 'scenes' : 'sceneBlocks', resource.id),
            ),
            image =
              (resource.kind === 'scene' ? head.data.mainBlockImage : head.data.image) ?? null,
            root = await readAdventureCountArtifact(store, tx, loaded, {
              scope: 'job',
              path: ['preparedRoot', 'current'],
            });
          if (
            digest(descriptor.data) !== digest(binding) ||
            digest(image) !==
              digest({
                imageId: asset.imageId,
                alt: binding.image.alt,
                caption: binding.image.caption,
              }) ||
            head.data.ownerId !== uid ||
            head.data.deleting ||
            root.data.ownerId !== uid ||
            root.data.value.id !== loaded.job.adventureId
          )
            inconsistent();
          const origin = validateRestoredImageOrigin({
              schemaVersion: 2,
              restoreId: loaded.id,
              jobToken: loaded.view.jobToken,
              installationOperationId: request.operationId,
              target: { kind: 'adventure', id: loaded.job.adventureId },
              assetId: id,
            }),
            key = adventureImageUseKey(loaded.job.adventureId, resource);
          writes.push(
            {
              address: adventureLibraryImageAddress(asset.imageId),
              value: {
                id: asset.imageId,
                name: asset.name ?? root.data.value.title,
                url: null,
                path: 'book-covers/' + uid + '/' + asset.imageId + '.png',
                state: 'preparing',
                useCount: 1,
                createdAt: asset.createdAt ?? p.timestamp,
                updatedAt: asset.updatedAt ?? p.timestamp,
                restoreOrigin: origin,
                restoreStorage: {
                  schemaVersion: 1,
                  contentHash: asset.contentHash,
                  byteLength: asset.byteLength,
                  proof: intent.storage,
                },
              },
            },
            {
              address: adventureLibraryUseAddress(asset.imageId, key),
              value: { kind: 'adventure-block', adventureId: loaded.job.adventureId, resource },
            },
          );
          p.libraryImages = sum(p.libraryImages, 1);
          p.libraryUses = sum(p.libraryUses, 1);
          p.libraryAfter = snap.id;
          sourceToken = digest({
            intent: observed.token,
            binding: descriptor.token,
            head: head.token,
          });
        } else {
          if (p.libraryImages !== p.storagePrepared || p.libraryUses !== p.libraryImages)
            inconsistent();
          p.phase = 'image-library-ready';
        }
        const artifacts = await prepareAdventureStageArtifacts(
          store,
          tx,
          loaded,
          request.operationId,
          writes,
          sourceToken,
        );
        if (artifacts.count !== writes.length) inconsistent();
        p.artifactCount = sum(p.artifactCount, artifacts.count);
        const record = store.next(loaded, request, action, { staging: p });
        artifacts.commit();
        return store.commit(tx, loaded, request, action, record, artifacts.effects);
      });
    },
  };
}

export async function assertAdventureRestoreImageLibraryClean(store, tx, loaded) {
  const rows = await tx.get(
    store.db
      .collection('users/' + loaded.uid + '/imageLibrary')
      .where('restoreOrigin.target.id', '==', loaded.job.adventureId)
      .select()
      .limit(1),
  );
  if (rows.docs.length) inconsistent();
}
