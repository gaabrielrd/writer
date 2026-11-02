import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { digest, nativeToken, inconsistent, restoreFail } from './adventureRestoreContracts.mjs';
import {
  adventureStageArtifactId,
  readAdventureStageArtifact,
} from './adventureRestoreArtifacts.mjs';
import {
  adventureImageBindingAddress,
  adventureImageAssetAddress,
  adventureImageBytesAddress,
} from './adventureRestoreImageProjection.mjs';
import { validAdventureStorageIntent } from './adventureRestoreImageStorageMeta.mjs';
export const imageStorageAddress = (id) => ({
  scope: 'job',
  path: ['preparedRoot', 'image-storage-' + id],
});
const same = (a, b) => {
  if (digest(a) !== digest(b)) inconsistent();
};
function verifier(store, loaded, address, journalToken, journalHash, targetToken) {
  return async (tx, current) => {
    if (
      current.uid !== loaded.uid ||
      current.id !== loaded.id ||
      current.view.jobToken !== loaded.view.jobToken
    )
      inconsistent();
    const snap = await tx.get(
        store.db.doc(current.ref.path + '/stagingArtifacts/' + adventureStageArtifactId(address)),
      ),
      entry = await readAdventureStageArtifact(store, tx, current, snap);
    if (
      nativeToken(snap) !== journalToken ||
      digest(snap.data()) !== journalHash ||
      nativeToken(entry.metadata) !== targetToken
    )
      inconsistent();
  };
}
export async function observeImageArtifact(store, tx, loaded, address) {
  const snap = await tx.get(
      store.db.doc(loaded.ref.path + '/stagingArtifacts/' + adventureStageArtifactId(address)),
    ),
    entry = await readAdventureStageArtifact(store, tx, loaded, snap, { withValue: true }),
    jt = nativeToken(snap),
    jh = digest(snap.data()),
    tt = nativeToken(entry.metadata);
  return {
    data: entry.data,
    token: digest({ address, jt, jh, tt }),
    verify: verifier(store, loaded, address, jt, jh, tt),
  };
}
export function checkedStorageIntent(loaded, observed, id) {
  const value = observed.data;
  if (
    !validAdventureStorageIntent(value) ||
    value.ownerId !== loaded.uid ||
    value.asset.assetId !== id
  )
    inconsistent();
  return value;
}
export const adventureImageStorageContext = (loaded, asset) => ({
  ownerId: loaded.uid,
  restoreId: loaded.id,
  jobToken: loaded.view.jobToken,
  imageId: asset.imageId,
  contentHash: asset.contentHash,
  byteLength: asset.byteLength,
});
export async function readImageStorageSource(reader, mapper, index) {
  const unit = await reader.readItem(index),
    mapped = await mapper.mapJSON(unit.record, unit.value),
    value = mapped.value,
    proofs = [unit];
  if (unit.record.kind === 'adventure-images') return { unit, value, asset: null, proofs };
  if (unit.record.kind !== 'adventure-image-binding') inconsistent();
  const sourceHead = await reader.findResource(unit.value.resource.kind, unit.value.resource.id);
  proofs.push(sourceHead);
  const sourceImage =
      unit.value.resource.kind === 'scene'
        ? sourceHead.value.data.mainBlockImage
        : sourceHead.value.data.image,
    reference = (v) =>
      v.image === null
        ? null
        : { imageId: v.image.imageId, alt: v.image.alt, caption: v.image.caption };
  same(sourceImage ?? null, reference(unit.value));
  let asset = null;
  if (value.image !== null) {
    const assetUnit = await reader.readItem(index + 1);
    if (assetUnit.record.kind !== 'adventure-image') inconsistent();
    asset = (await mapper.mapJSON(assetUnit.record, assetUnit.value)).value;
    if (asset.assetId !== value.image.assetId || asset.imageId !== value.image.imageId)
      inconsistent();
    proofs.push(assetUnit);
  }
  return { unit, value, asset, proofs, bindingId: mapped.record.id, reference: reference(value) };
}
export async function observeImageStorageSource(store, tx, loaded, source) {
  const native = [];
  if (source.unit.record.kind === 'adventure-images') return native;
  const binding = await observeImageArtifact(
    store,
    tx,
    loaded,
    adventureImageBindingAddress(source.bindingId),
  );
  same(binding.data, source.value);
  native.push(binding);
  const resource = source.value.resource,
    head = await observeImageArtifact(store, tx, loaded, {
      scope: 'adventure',
      path: [resource.kind === 'scene' ? 'scenes' : 'sceneBlocks', resource.id],
    });
  if (
    head.data.ownerId !== loaded.uid ||
    head.data.id !== resource.id ||
    head.data.deleting === true
  )
    inconsistent();
  same(
    (resource.kind === 'scene' ? head.data.mainBlockImage : head.data.image) ?? null,
    source.reference,
  );
  native.push(head);
  if (source.asset !== null) {
    const asset = await observeImageArtifact(
      store,
      tx,
      loaded,
      adventureImageAssetAddress(source.asset.assetId),
    );
    same(asset.data, source.asset);
    native.push(asset);
  }
  return native;
}
export async function readPreparedImageBuffer(store, initial, asset, guard) {
  const bytes = Buffer.alloc(asset.byteLength),
    proofs = [],
    hash = createHash('sha256');
  let offset = 0;
  for (let index = 0; index < asset.chunkCount; index++) {
    const part = await store.db.runTransaction(async (tx) => {
        const loaded = await store.load(tx, initial.uid, initial.id, initial.view.jobToken);
        guard(loaded);
        return observeImageArtifact(
          store,
          tx,
          loaded,
          adventureImageBytesAddress(asset.assetId, index),
        );
      }),
      v = part.data,
      expected = Math.min(65536, asset.byteLength - offset);
    if (
      !v ||
      Object.keys(v).length !== 6 ||
      v.schemaVersion !== 1 ||
      v.ownerId !== initial.uid ||
      v.assetId !== asset.assetId ||
      v.index !== index ||
      !Array.isArray(v.bytes) ||
      v.bytes.length !== expected ||
      v.bytes.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
    )
      inconsistent();
    const frame = Buffer.from(v.bytes);
    if (createHash('sha256').update(frame).digest('hex') !== v.contentHash) inconsistent();
    frame.copy(bytes, offset);
    offset += frame.length;
    hash.update(frame);
    proofs.push(part.verify);
  }
  if (offset !== asset.byteLength || hash.digest('hex') !== asset.contentHash) inconsistent();
  const image = sharp(bytes, {
      failOn: 'warning',
      limitInputPixels: false,
      sequentialRead: true,
      animated: true,
    }),
    metadata = await image.metadata();
  if (
    metadata.format !== 'png' ||
    ![metadata.width, metadata.height].every((n) => Number.isSafeInteger(n) && n > 0)
  )
    restoreFail('failed-precondition', 'invalid-adventure-image');
  await image.stats();
  return { bytes, proofs };
}
