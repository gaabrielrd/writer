import {
  digest,
  inconsistent,
  born,
  bornEqual,
  nativeToken,
} from './adventureRestoreContracts.mjs';
import {
  readAdventureStageJournal,
  adventureStageArtifactId,
} from './adventureRestoreArtifacts.mjs';
import {
  observeImageArtifact,
  imageStorageAddress,
  checkedStorageIntent,
  adventureImageStorageContext,
} from './adventureRestoreImageStorageRead.mjs';
import { adventureLibraryImageAddress } from './adventureRestoreImageLibrary.mjs';
import { adventureImageUseKey } from './adventureBlockImages.mjs';
import { validateRestoredImageOrigin } from './restoredImageRemoval.mjs';
import {
  assertAdventureNotDeleted,
  readAdventureDeletionReservation,
} from './adventureDeletionGuard.mjs';
import { adventureIdentityToken } from './campaignLoreOrigin.mjs';
export async function prepareAdventureRestoreMedia(store, tx, loaded, control) {
  await assertAdventureNotDeleted(tx, store.db, loaded.uid, loaded.job.adventureId);
  return prepareMedia(store, tx, loaded, control, false);
}
// Internal retirement requires an existing deletion of this exact native source.
// No public media request can select this path or authorize publication with it.
export async function prepareDeletedAdventureRestoreMedia(store, tx, loaded, control, deletion) {
  const { record: r } = await readAdventureDeletionReservation(
    tx,
    store.db,
    loaded.job.adventureId,
  );
  if (
    !r ||
    deletion.ownerId !== loaded.uid ||
    deletion.adventureId !== loaded.job.adventureId ||
    r.state !== 'deleting' ||
    r.ownerId !== loaded.uid ||
    r.deletionId !== deletion.deletionId ||
    r.adventureToken !== deletion.adventureToken ||
    loaded.job.state !== 'activated' ||
    adventureIdentityToken(loaded.uid, loaded.job.adventureId, loaded.snapshot) !== r.adventureToken
  )
    inconsistent();
  return prepareMedia(store, tx, loaded, control, true);
}
async function prepareMedia(store, tx, loaded, control, retiring) {
  let query = store.db
    .collection(loaded.ref.path + '/preparedRoot')
    .where('kind', '==', 'adventure-restore-image-storage')
    .select()
    .orderBy('__name__')
    .limit(1);
  if (control.cursor !== null) query = query.startAfter(control.cursor);
  const rows = await tx.get(query);
  if (!rows.docs.length) {
    if (control.processed !== control.total) inconsistent();
    return null;
  }
  if (control.processed >= control.total) inconsistent();
  const row = rows.docs[0],
    assetId = row.id.slice('image-storage-'.length),
    observed = await observeImageArtifact(store, tx, loaded, imageStorageAddress(assetId)),
    intent = checkedStorageIntent(loaded, observed, assetId),
    asset = intent.asset;
  if (intent.state !== 'prepared') inconsistent();
  const address = adventureLibraryImageAddress(asset.imageId),
    journal = await tx.get(
      store.db.doc(loaded.ref.path + '/stagingArtifacts/' + adventureStageArtifactId(address)),
    ),
    installation = await readAdventureStageJournal(store, tx, loaded, journal);
  if (
    digest(installation.address) !== digest(address) ||
    installation.value.createdByOperationId !== installation.value.updatedByOperationId ||
    store.operation(installation.first, loaded).action !== 'advanceAdventureRestoreImageLibrary'
  )
    inconsistent();
  const imageRef = store.db.doc('users/' + loaded.uid + '/imageLibrary/' + asset.imageId),
    image = await tx.get(imageRef),
    value = image.data(),
    path = 'book-covers/' + loaded.uid + '/' + asset.imageId + '.png',
    origin = validateRestoredImageOrigin({
      schemaVersion: 2,
      restoreId: loaded.id,
      jobToken: loaded.view.jobToken,
      installationOperationId: installation.first.id,
      target: { kind: 'adventure', id: loaded.job.adventureId },
      assetId,
    }),
    storage = {
      schemaVersion: 1,
      contentHash: asset.contentHash,
      byteLength: asset.byteLength,
      proof: intent.storage,
    };
  if (
    !image.exists ||
    !bornEqual(image, installation.first) ||
    value.id !== asset.imageId ||
    !['preparing', 'deleting', 'deleted'].includes(value.state) ||
    value.url !== null ||
    value.path !== path ||
    digest(value.restoreOrigin ?? null) !== digest(origin) ||
    digest(value.restoreStorage ?? null) !== digest(storage) ||
    !Number.isSafeInteger(value.useCount) ||
    value.useCount < 0 ||
    value.useCount > 1
  )
    inconsistent();
  const unavailable = value.state !== 'preparing',
    uses = await tx.get(
      store.db
        .collection(imageRef.path + '/uses')
        .select('kind', 'adventureId', 'resource')
        .limit(2),
    ),
    key = adventureImageUseKey(loaded.job.adventureId, intent.binding.resource),
    usage = {
      kind: 'adventure-block',
      adventureId: loaded.job.adventureId,
      resource: intent.binding.resource,
    };
  if (
    uses.docs.length !== value.useCount ||
    (unavailable && value.useCount !== 0) ||
    uses.docs.some(
      (s) =>
        s.id !== key || digest(s.data()) !== digest(usage) || !bornEqual(s, installation.first),
    )
  )
    inconsistent();
  return {
    assetId,
    imageId: asset.imageId,
    after: row.id,
    unavailable: retiring || unavailable,
    ...(retiring ? { retirement: true, retirementUses: uses.docs.map((s) => s.ref) } : {}),
    imageRef,
    image,
    path,
    sourceProof: intent.storage,
    context: adventureImageStorageContext(loaded, asset),
    token: digest({
      intent: observed.token,
      journal: nativeToken(journal),
      imageBirth: born(image),
      origin,
      storage,
      unavailable,
      ...(retiring
        ? {
            retiring: true,
            image: nativeToken(image),
            uses: uses.docs.map((s) => ({ id: s.id, token: nativeToken(s) })),
          }
        : {}),
    }),
  };
}
