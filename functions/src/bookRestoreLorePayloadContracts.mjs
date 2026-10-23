import { resourcePayloadManifest } from './bookResourcePayloadContracts.mjs';
import {
  born,
  closed,
  inconsistent,
  integer,
  restoreHash,
  restoreId,
} from './bookRestoreUploadContracts.mjs';
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
  closed(value, [
    'schemaVersion',
    'entityId',
    'generationId',
    'generationOperationId',
    'base',
    'pages',
    'sealOperationId',
    'segment',
  ]);
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
