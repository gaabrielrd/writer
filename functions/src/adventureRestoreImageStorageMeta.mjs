import { ADVENTURE_COUNT_AND_AUDIT_PHASES as ADVENTURE_COUNT_PHASES } from './adventureRestoreCountMeta.mjs';
import { contentCount as count, contentClosed as closed } from './adventureContentPrimitives.mjs';
import {
  validateAdventureImageAsset,
  validateAdventureImageBinding,
} from './adventureContentSchema.mjs';
import { bookRestoreStorageProof } from './bookRestoreCoverStorageContracts.mjs';
export const imageStoragePhase = (v) =>
  ['image-storage', 'image-storage-ready', ...ADVENTURE_COUNT_PHASES].includes(v.phase);
export const imageStorageViewKeys = [
  'storageBindings',
  'storageIntents',
  'storagePrepared',
  'storageFenced',
  'storagePending',
];
export const imageStoragePrivateKeys = ['storageIndex', 'storageAssetId', 'storageFenceAfter'];
export const validImageStorageView = (v) =>
  imageStorageViewKeys.filter((k) => k !== 'storagePending').every((k) => count(v[k])) &&
  typeof v.storagePending === 'boolean';
export function validImageStorageMeta(v, job) {
  const ready = v.phase !== 'image-storage',
    active = ['content-verified', 'activated'].includes(job.state);
  return (
    validImageStorageView(v) &&
    count(v.storageIndex) &&
    v.storageIndex === v.itemIndex + v.storageBindings + v.storageIntents + Number(ready) &&
    v.storageIndex <= job.validation.items &&
    v.storageBindings <= v.imageBindings &&
    v.storageIntents <= v.imageAssets &&
    v.storageIntents <= v.storageBindings &&
    v.storagePrepared <= v.storageIntents &&
    v.storageFenced <= v.storageIntents &&
    (job.state !== 'cancelled' || v.storageFenced === v.storageIntents) &&
    (v.storageFenced === 0
      ? v.storageFenceAfter === null
      : typeof v.storageFenceAfter === 'string' &&
        /^image-storage-[a-f0-9]{64}$/.test(v.storageFenceAfter)) &&
    (v.storagePending
      ? typeof v.storageAssetId === 'string' && /^[a-f0-9]{64}$/.test(v.storageAssetId)
      : v.storageAssetId === null) &&
    (!active ||
      (v.storageFenced === 0 &&
        v.storagePrepared + Number(v.storagePending) === v.storageIntents)) &&
    (!ready ||
      (!v.storagePending &&
        v.storageBindings === v.imageBindings &&
        v.storageIntents === v.imageAssets &&
        v.storagePrepared === v.imageAssets &&
        v.storageIndex === job.validation.items))
  );
}
export function validAdventureStorageIntent(v) {
  try {
    if (
      !closed(v, [
        'schemaVersion',
        'ownerId',
        'kind',
        'sourceIndex',
        'asset',
        'binding',
        'state',
        'storage',
        'fence',
      ]) ||
      v.schemaVersion !== 1 ||
      typeof v.ownerId !== 'string' ||
      v.kind !== 'adventure-restore-image-storage' ||
      !count(v.sourceIndex) ||
      !['reserved', 'prepared', 'fenced'].includes(v.state)
    )
      return false;
    validateAdventureImageAsset(v.asset);
    validateAdventureImageBinding(v.binding);
    if (
      !v.binding.image ||
      v.binding.image.assetId !== v.asset.assetId ||
      v.binding.image.imageId !== v.asset.imageId ||
      !/^restore-[a-f0-9]{64}$/.test(v.asset.imageId) ||
      !/^restore-[a-f0-9]{64}$/.test(v.binding.resource.id)
    )
      return false;
    if (v.storage !== null) bookRestoreStorageProof(v.storage);
    if (v.fence !== null) bookRestoreStorageProof(v.fence);
    return v.state === 'reserved'
      ? v.storage === null && v.fence === null
      : v.state === 'prepared'
        ? v.storage !== null && v.fence === null
        : v.fence !== null;
  } catch {
    return false;
  }
}
