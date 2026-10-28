import { contentClosed as closed, contentCount as count } from './adventureContentPrimitives.mjs';
import {
  validateAdventureImageAsset,
  validateAdventureImageBinding,
} from './adventureContentSchema.mjs';
export const adventureImagePreparationPhase = (v) =>
  ['image-bytes', 'image-bytes-ready'].includes(v.phase);
export const imagePreparationViewKeys = [
  'imageBindings',
  'imageAssets',
  'imageBytes',
  'imageFrames',
  'imageUnits',
  'imagePending',
];
export const imagePreparationPrivateKeys = ['imageIndex', 'imageStateCreated'];
export const validAdventureImageView = (v) =>
  imagePreparationViewKeys.filter((k) => k !== 'imagePending').every((k) => count(v[k])) &&
  typeof v.imagePending === 'boolean';
export function validAdventureImageMeta(v, job) {
  const t = job.validation.summary.totals,
    ready = v.phase === 'image-bytes-ready';
  return (
    validAdventureImageView(v) &&
    count(v.imageIndex) &&
    typeof v.imageStateCreated === 'boolean' &&
    v.imageIndex === v.itemIndex + v.imageUnits &&
    v.imageIndex <= job.validation.items &&
    v.imageUnits === v.imageBindings + v.imageAssets + Number(ready) &&
    v.imageBindings <= t.imageBindings &&
    v.imageAssets <= t.imageAssets &&
    v.imageAssets + Number(v.imagePending) <= v.imageBindings &&
    v.imageBytes <= t.imageBytes &&
    v.imageBytes >= v.imageAssets * 8 &&
    v.imageFrames <= Math.ceil(t.imageBytes / 65536) + t.imageAssets &&
    (!v.imagePending || (v.imageStateCreated && !ready)) &&
    v.imageStateCreated === v.imageFrames > 0 &&
    (!ready ||
      (!v.imagePending &&
        v.imageBindings === t.imageBindings &&
        v.imageAssets === t.imageAssets &&
        v.imageBytes === t.imageBytes &&
        v.imageIndex === job.validation.items))
  );
}
export function validAdventureImageState(v) {
  try {
    if (
      !closed(v, [
        'schemaVersion',
        'ownerId',
        'unitIndex',
        'asset',
        'binding',
        'rawCheckpoint',
        'done',
      ]) ||
      v.schemaVersion !== 1 ||
      typeof v.ownerId !== 'string' ||
      !count(v.unitIndex) ||
      typeof v.done !== 'boolean' ||
      Buffer.byteLength(JSON.stringify(v)) > 65536
    )
      return false;
    validateAdventureImageAsset(v.asset);
    validateAdventureImageBinding(v.binding);
    const a = v.asset,
      b = v.binding,
      c = v.rawCheckpoint;
    return (
      b.image !== null &&
      a.assetId === b.image.assetId &&
      a.imageId === b.image.imageId &&
      /^restore-[a-f0-9]{64}$/.test(a.imageId) &&
      /^restore-[a-f0-9]{64}$/.test(b.resource.id) &&
      closed(c, [
        'schemaVersion',
        'sourceToken',
        'part',
        'byteLength',
        'container',
        'hashState',
        'utf8',
        'done',
      ]) &&
      c.schemaVersion === 1 &&
      c.done === v.done &&
      count(c.part) &&
      c.part >= 1 &&
      c.part <= a.chunkCount &&
      count(c.byteLength) &&
      (v.done
        ? c.part === a.chunkCount && c.byteLength === a.byteLength
        : c.part < a.chunkCount && c.byteLength === c.part * 65536)
    );
  } catch {
    return false;
  }
}
