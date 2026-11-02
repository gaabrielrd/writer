import {
  BOOK_RESOURCE_KINDS,
  BOOK_RESOURCE_CHILDREN,
  BOOK_RESOURCE_SINGLETONS,
} from './bookBackupResources.mjs';
import { bookContentId } from './bookBackupSchema.mjs';
import {
  authorize,
  closed,
  inconsistent,
  integer,
  restoreHash,
} from './bookRestoreUploadContracts.mjs';

export const BOOK_RESOURCE_PAYLOAD_PART_BYTES = 65536;
const additionalKinds = ['book', 'act', 'chapter', 'work-version', 'book-draft'];
export function resourcePayloadScope({ uid, bookId, resource }) {
  authorize(uid);
  bookContentId(bookId);
  closed(resource, ['kind', 'parentId', 'id']);
  if (![...BOOK_RESOURCE_KINDS, ...additionalKinds].includes(resource.kind)) inconsistent();
  bookContentId(resource.id);
  if (
    Object.hasOwn(BOOK_RESOURCE_SINGLETONS, resource.kind) &&
    resource.id !== BOOK_RESOURCE_SINGLETONS[resource.kind]
  )
    inconsistent();
  const child = Object.values(BOOK_RESOURCE_CHILDREN).some((kinds) =>
    kinds.includes(resource.kind),
  );
  if (child) bookContentId(resource.parentId);
  else if (resource.parentId !== null) inconsistent();
  if (resource.kind === 'book' && resource.id !== bookId) inconsistent();
  return { uid, bookId, resource: { ...resource } };
}
export function resourcePayloadManifest(value) {
  closed(value, [
    'schemaVersion',
    'bodyId',
    'byteLength',
    'chunkCount',
    'contentHash',
    'merkleRoot',
  ]);
  if (value.schemaVersion !== 1) inconsistent();
  restoreHash(value.bodyId);
  restoreHash(value.contentHash);
  restoreHash(value.merkleRoot);
  integer(value.byteLength, 1);
  integer(value.chunkCount, 1);
  if (value.chunkCount !== Math.ceil(value.byteLength / BOOK_RESOURCE_PAYLOAD_PART_BYTES))
    inconsistent();
  return { ...value };
}
export function resourcePayloadPartIndex(manifest, index) {
  integer(index);
  if (index >= manifest.chunkCount) inconsistent();
  return index;
}
