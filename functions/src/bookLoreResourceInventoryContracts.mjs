import { authorize, born, closed, integer, restoreHash } from './bookRestoreUploadContracts.mjs';
import { bookContentId } from './bookBackupSchema.mjs';
import { lorePayloadPointer } from './bookRestoreLorePayloadContracts.mjs';
import { loreFieldPointer, BOOK_LORE_GENERATION_FIELDS } from './bookLoreGenerationContracts.mjs';
import { digest, workFail } from './workProgressContracts.mjs';
export const inventoryConflict = () =>
  workFail(
    'failed-precondition',
    'O inventário dos corpos de lore mudou ou está indisponível.',
    'book-lore-inventory-conflict',
  );
export const inventoryStamp = (value) => {
  closed(value, ['seconds', 'nanoseconds']);
  born({ createTime: value });
  return value;
};
export function inventoryPointer(value) {
  closed(value, ['manifest', 'expectedBirth'], ['partSealBirth']);
  return Object.hasOwn(value, 'partSealBirth')
    ? loreFieldPointer(value)
    : lorePayloadPointer(value);
}
export function inventorySelector(value) {
  closed(value, ['section', 'page'], ['field']);
  integer(value.page);
  if (
    !['base', 'field', 'relations'].includes(value.section) ||
    (value.section !== 'relations' && value.page !== 0) ||
    (value.section === 'field'
      ? !BOOK_LORE_GENERATION_FIELDS.includes(value.field)
      : Object.hasOwn(value, 'field'))
  )
    inventoryConflict();
  return structuredClone(value);
}
export function inventoryScope(db, uid, bookId) {
  authorize(uid);
  bookContentId(bookId);
  return { db, uid, bookId, path: 'books/' + bookId };
}
export function inventoryAddress(c, kind, id) {
  restoreHash(id);
  if (!['generation', 'body'].includes(kind)) inventoryConflict();
  const path =
    c.path +
    '/' +
    (kind === 'generation' ? 'bookLoreGenerations' : 'bookResourceInventory') +
    '/' +
    id;
  return {
    ...c,
    kind,
    id,
    controlPath: path,
    ref: c.db.doc(path),
    stateRef: c.db.doc(path + '/state/current'),
  };
}
export const inventoryEventId = (revision) => {
  integer(revision);
  return String(revision).padStart(16, '0');
};
export const inventoryToken = (at, snapshot, context) =>
  digest({
    domain: 'writer-lore-resource-control',
    schemaVersion: 1,
    path: at.controlPath,
    birth: born(snapshot),
    contextHash: digest(context),
  });
export function validateInventoryContext(at, value) {
  closed(value, [
    'schemaVersion',
    'kind',
    'ownerId',
    'bookId',
    'bookBirth',
    'loreId',
    ...(at.kind === 'generation'
      ? ['generationId', 'sourceBirth', 'sourceUpdate', 'storageHash']
      : ['bodyId', 'pointer', 'selector', 'initialGeneration']),
  ]);
  if (
    value.schemaVersion !== 1 ||
    value.kind !== at.kind ||
    value.ownerId !== at.uid ||
    value.bookId !== at.bookId
  )
    inventoryConflict();
  bookContentId(value.loreId);
  inventoryStamp(value.bookBirth);
  if (at.kind === 'generation') {
    if (value.generationId !== at.id) inventoryConflict();
    inventoryStamp(value.sourceBirth);
    inventoryStamp(value.sourceUpdate);
    restoreHash(value.storageHash);
  } else {
    if (value.bodyId !== at.id || value.pointer?.manifest?.bodyId !== at.id) inventoryConflict();
    inventoryPointer(value.pointer);
    inventorySelector(value.selector);
    closed(value.initialGeneration, ['generationId', 'birth', 'token']);
    restoreHash(value.initialGeneration.generationId);
    inventoryStamp(value.initialGeneration.birth);
    restoreHash(value.initialGeneration.token);
  }
  return value;
}
export function validateInventoryState(at, context, s) {
  closed(s, [
    'schemaVersion',
    'phase',
    'revision',
    ...(at.kind === 'body'
      ? ['referenceRevision', 'scanRevision', 'cursor', 'cleanupIndex', 'headToken', 'headPage']
      : []),
  ]);
  integer(s.revision);
  if (s.schemaVersion !== 1) inventoryConflict();
  if (at.kind === 'generation') {
    if (!['active', 'retired'].includes(s.phase) || (s.revision === 0 && s.phase !== 'active'))
      inventoryConflict();
  } else {
    if (!['initializing', 'live', 'scanning', 'collecting', 'collected'].includes(s.phase))
      inventoryConflict();
    integer(s.referenceRevision);
    integer(s.cleanupIndex);
    if (s.headToken === null) {
      if (s.headPage !== 0) inventoryConflict();
    } else {
      restoreHash(s.headToken);
      if (s.headPage !== null) integer(s.headPage);
    }
    if (s.phase === 'collected' && (s.headToken === null || s.headPage !== null))
      inventoryConflict();
    if (
      s.cleanupIndex > context.pointer.manifest.chunkCount ||
      (!['collecting', 'collected'].includes(s.phase) && s.cleanupIndex !== 0) ||
      (s.phase === 'collected' && s.cleanupIndex !== context.pointer.manifest.chunkCount)
    )
      inventoryConflict();
    if (['initializing', 'live'].includes(s.phase)) {
      if (s.scanRevision !== null || s.cursor !== null) inventoryConflict();
    } else {
      integer(s.scanRevision);
      if (s.scanRevision !== s.referenceRevision) inventoryConflict();
      if (s.phase === 'scanning') restoreHash(s.cursor);
      else if (s.cursor !== null) inventoryConflict();
    }
    if (s.phase === 'initializing' && (s.revision !== 0 || s.referenceRevision !== 0))
      inventoryConflict();
  }
  return s;
}
export const inventoryInitialState = (kind) =>
  kind === 'generation'
    ? { schemaVersion: 1, phase: 'active', revision: 0 }
    : {
        schemaVersion: 1,
        phase: 'initializing',
        revision: 0,
        referenceRevision: 0,
        scanRevision: null,
        cursor: null,
        cleanupIndex: 0,
        headToken: null,
        headPage: 0,
      };
