import { resourcePayloadManifest } from './bookResourcePayloadContracts.mjs';
import {
  born,
  closed,
  inconsistent,
  integer,
  restoreHash,
  restoreId,
} from './bookRestoreUploadContracts.mjs';
import { digest } from './sceneContracts.mjs';
export const lorePayloadSegmentId = (generationId, offset) =>
  digest(['lore-payload-segment', generationId, offset]);
export const BOOK_LORE_PAYLOAD_RELATIONS = 64;
export function lorePayloadPointer(value) {
  closed(value, ['manifest', 'expectedBirth']);
  resourcePayloadManifest(value.manifest);
  closed(value.expectedBirth, ['seconds', 'nanoseconds']);
  born({ createTime: value.expectedBirth });
  return structuredClone(value);
}
export function lorePayloadProgress(value) {
  if (value === null) return null;
  closed(
    value,
    [
      'schemaVersion',
      'entityId',
      'generationId',
      'generationOperationId',
      'base',
      'pages',
      'sealOperationId',
      'segment',
    ],
    ['legacy', 'streamed'],
  );
  if (
    Object.hasOwn(value, 'streamed') &&
    (value.streamed !== true ||
      Object.hasOwn(value, 'legacy') ||
      value.base !== null ||
      value.pages !== 0 ||
      value.sealOperationId !== null ||
      value.segment !== null)
  )
    inconsistent();
  if (Object.hasOwn(value, 'legacy')) {
    const old = value.legacy;
    closed(old, [
      'schemaVersion',
      'relations',
      'counted',
      'operationId',
      'birth',
      'update',
      'valueHash',
    ]);
    if (old.schemaVersion !== 1) inconsistent();
    integer(old.relations, 1);
    integer(old.counted, old.relations);
    restoreId(old.operationId);
    if (old.relations % BOOK_LORE_PAYLOAD_RELATIONS !== 0) inconsistent();
    restoreHash(old.valueHash);
    for (const stamp of [old.birth, old.update]) {
      closed(stamp, ['seconds', 'nanoseconds']);
      born({ createTime: stamp });
    }
    if (
      old.update.seconds < old.birth.seconds ||
      (old.update.seconds === old.birth.seconds && old.update.nanoseconds < old.birth.nanoseconds)
    )
      inconsistent();
  }
  if (value.schemaVersion !== 1 || !/^restore-[a-f0-9]{64}$/.test(value.entityId)) inconsistent();
  restoreHash(value.generationId);
  restoreId(value.generationOperationId);
  integer(value.pages);
  if (value.base === null) {
    if (value.pages !== 0 || value.sealOperationId !== null) inconsistent();
  } else {
    lorePayloadPointer(value.base);
    restoreId(value.sealOperationId);
  }
  if (value.segment !== null) {
    const p = value.segment;
    closed(p, ['operationId', 'manifest', 'nextPart', 'sealed']);
    restoreId(p.operationId);
    resourcePayloadManifest(p.manifest);
    integer(p.nextPart);
    if (
      p.nextPart > p.manifest.chunkCount ||
      typeof p.sealed !== 'boolean' ||
      (p.sealed && p.nextPart !== p.manifest.chunkCount)
    )
      inconsistent();
  }
  return structuredClone(value);
}
export function lorePayloadStorage(value) {
  closed(value, ['schemaVersion', 'generationId', 'base', 'relations', 'sealBirth']);
  if (value.schemaVersion !== 1) inconsistent();
  restoreHash(value.generationId);
  lorePayloadPointer(value.base);
  closed(value.sealBirth, ['seconds', 'nanoseconds']);
  born({ createTime: value.sealBirth });
  const r = value.relations;
  closed(r, ['present', 'count', 'pages']);
  integer(r.count);
  integer(r.pages);
  if (
    typeof r.present !== 'boolean' ||
    (!r.present && r.count !== 0) ||
    r.pages !== Math.ceil(r.count / BOOK_LORE_PAYLOAD_RELATIONS)
  )
    inconsistent();
  return structuredClone(value);
}
