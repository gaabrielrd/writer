import { born, bornEqual, closed } from './bookRestoreUploadContracts.mjs';
import { digest } from './workProgressContracts.mjs';
import { openBookResourcePayload } from './bookResourcePayloadRead.mjs';
import { openBookLoreRelationPage } from './bookLoreStorageRead.mjs';
import {
  loreGenerationRelations,
  BOOK_LORE_GENERATION_FIELDS,
  loreGenerationStorage,
} from './bookLoreGenerationContracts.mjs';
import { lorePayloadSegmentId } from './bookRestoreLorePayloadContracts.mjs';
import { fieldUploadPaths } from './bookLoreFieldUploadContracts.mjs';
import { loadFieldUpload } from './bookLoreFieldUploadStore.mjs';
import { inventoryScope } from './bookLoreResourceInventoryContracts.mjs';
import {
  loadInventoryControl,
  prepareInventoryInitialization,
  prepareInventoryChange,
  inventoryReference,
  readInventoryReference,
} from './bookLoreResourceInventoryStore.mjs';
import {
  editSlotId,
  editReservationConflict as conflict,
} from './bookLoreEditReservationContracts.mjs';
import {
  editReservationSource,
  readEditReservationSlot,
  reservedEditMarker,
  editReservationPair,
  assertEditReservationOpening,
} from './bookLoreEditReservationStore.mjs';
import { COMPILATION_ALGORITHM, compilationPointer } from './bookLoreEditCompilationContracts.mjs';
const immutable = (s) => s.exists && bornEqual(s, { createTime: s.updateTime });
export const compilationAuditRef = (l) => l.c.db.doc(l.c.path + '/compilationState/current');
export async function compilationSource(tx, l) {
  assertEditReservationOpening(tx, l);
  const source = await editReservationSource(tx, l.c, l.job.context.intent, l.job.context);
  if (source.inspection.source.opened.mode !== 'payload') conflict();
  return source.inspection;
}
export async function compilationSlot(tx, l, target, required = false) {
  const s = await tx.get(l.c.db.doc(l.c.path + '/slots/' + editSlotId(target)));
  if (!s.exists) {
    if (required) conflict();
    return null;
  }
  const record = await readEditReservationSlot(tx, l, s),
    slot = record.slot,
    field = await loadFieldUpload(
      tx,
      fieldUploadPaths(l.c.db, l.c.uid, slot.upload.uploadId),
      slot.upload,
    );
  if (
    !field ||
    field.job.phase !== 'reserved' ||
    digest(field.job.reservation) !== digest(reservedEditMarker(l, slot)) ||
    digest(field.job.context.manifest) !== digest(slot.pointer.manifest)
  )
    conflict();
  return slot.pointer;
}
export async function prepareCompilationReference(tx, l, pointer, selector) {
  assertEditReservationOpening(tx, l);
  const j = l.job,
    c = inventoryScope(l.c.db, l.c.uid, j.context.intent.bookId),
    generation = l.generation;
  if (j.phase !== 'preparing' || generation.state.phase !== 'preparing') conflict();
  await openBookResourcePayload(tx, c.db, {
    uid: c.uid,
    bookId: c.bookId,
    resource: { kind: 'lore', parentId: null, id: j.context.intent.loreId },
    ...pointer,
  });
  const body = await loadInventoryControl(tx, c, 'body', pointer.manifest.bodyId);
  if (!body) {
    const plan = await prepareInventoryInitialization(tx, c, {
      schemaVersion: 1,
      kind: 'body',
      ownerId: c.uid,
      bookId: c.bookId,
      bookBirth: j.context.bookBirth,
      loreId: j.context.intent.loreId,
      bodyId: pointer.manifest.bodyId,
      pointer,
      selector,
      initialGeneration: {
        generationId: generation.at.id,
        birth: born(generation.snapshot),
        token: generation.token,
      },
    });
    return { complete: false, commit: () => plan.commit() };
  }
  if (
    body.context.loreId !== j.context.intent.loreId ||
    digest(body.context.pointer) !== digest(pointer) ||
    !bornEqual({ createTime: body.context.bookBirth }, { createTime: j.context.bookBirth }) ||
    ['collecting', 'collected'].includes(body.state.phase)
  )
    conflict();
  const ref = c.db.doc(body.at.controlPath + '/references/' + generation.at.id),
    existing = await tx.get(ref);
  if (existing.exists) {
    const proof = await readInventoryReference(tx, body, existing);
    if (proof.generation.token !== generation.token) conflict();
    return { complete: true, commit() {} };
  }
  const reference = inventoryReference(body, generation, body.state.revision + 1),
    plan = await prepareInventoryChange(
      tx,
      body,
      'register',
      {
        phase: 'live',
        referenceRevision: body.state.referenceRevision + 1,
        scanRevision: null,
        cursor: null,
        headToken: null,
        headPage: 0,
      },
      digest(reference),
    );
  return {
    complete: false,
    commit() {
      tx.create(ref, reference);
      plan.commit();
    },
  };
}
export const compilationSegmentPath = (l, page) =>
  'books/' +
  l.job.context.intent.bookId +
  '/bookLoreSegments/' +
  lorePayloadSegmentId(l.job.generationId, page * 64);
export const compilationSegmentJournal = (l, page) =>
  l.c.path + '/compilationSegments/' + String(page).padStart(16, '0');
export async function prepareCompilationSegment(tx, l, r, page, pointer, count) {
  const ref = l.c.db.doc(compilationSegmentPath(l, page)),
    journal = l.c.db.doc(compilationSegmentJournal(l, page)),
    old = await tx.get(ref),
    oldJournal = await tx.get(journal);
  if (old.exists || oldJournal.exists) conflict();
  const segment = {
      schemaVersion: Object.hasOwn(pointer, 'partSealBirth') ? 2 : 1,
      ownerId: l.c.uid,
      bookId: l.job.context.intent.bookId,
      loreId: l.job.context.intent.loreId,
      generationId: l.job.generationId,
      offset: page * 64,
      count,
      payload: pointer,
    },
    proof = {
      schemaVersion: 1,
      editToken: l.token,
      page,
      operationId: r.operationId,
      segmentHash: digest(segment),
    };
  return {
    commit() {
      tx.create(ref, segment);
      tx.create(journal, proof);
    },
  };
}
export async function readCompilationSegment(tx, l, page) {
  const snapshot = await tx.get(l.c.db.doc(compilationSegmentPath(l, page))),
    journal = await tx.get(l.c.db.doc(compilationSegmentJournal(l, page))),
    proof = journal.data(),
    value = snapshot.data();
  if (!immutable(snapshot) || !immutable(journal) || !bornEqual(snapshot, journal)) conflict();
  closed(proof, ['schemaVersion', 'editToken', 'page', 'operationId', 'segmentHash']);
  const receipt = await editReservationPair(tx, l, proof.operationId);
  if (
    proof.schemaVersion !== 1 ||
    proof.editToken !== l.token ||
    proof.page !== page ||
    proof.segmentHash !== digest(value) ||
    !receipt ||
    receipt.record.method !== 'advanceBookLoreEditCompilation' ||
    !bornEqual(receipt.snapshot, journal)
  )
    conflict();
  closed(value, [
    'schemaVersion',
    'ownerId',
    'bookId',
    'loreId',
    'generationId',
    'offset',
    'count',
    'payload',
  ]);
  if (
    value.ownerId !== l.c.uid ||
    value.bookId !== l.job.context.intent.bookId ||
    value.loreId !== l.job.context.intent.loreId ||
    value.generationId !== l.job.generationId ||
    value.offset !== page * 64 ||
    value.count !== Math.min(64, l.job.compilation.relations.count - page * 64) ||
    value.schemaVersion !== (Object.hasOwn(value.payload, 'partSealBirth') ? 2 : 1)
  )
    conflict();
  compilationPointer(value.payload);
  return { snapshot, journal, pointer: value.payload, count: value.count };
}
export async function compilationSelection(tx, l, source, index) {
  const c = l.job.compilation;
  if (index === 0)
    return c.base ? { pointer: c.base, selector: { section: 'base', page: 0 }, field: null } : null;
  if (index < 8) {
    const field = BOOK_LORE_GENERATION_FIELDS[index - 1],
      pointer = c.fields[field];
    return pointer ? { pointer, selector: { section: 'field', field, page: 0 }, field } : null;
  }
  const page = index - 8;
  if (page >= c.relations.pages) conflict();
  const selected = c.relations.copied
    ? await readCompilationSegment(tx, l, page)
    : await openBookLoreRelationPage(tx, source.source.opened, page);
  return {
    pointer: selected.pointer,
    selector: { section: 'relations', page },
    field: 'relations',
    count: selected.count,
  };
}
export async function readCompilationAudit(tx, l) {
  const snapshot = await tx.get(compilationAuditRef(l)),
    c = l.job.compilation;
  if (c.auditHash === null) {
    if (snapshot.exists) conflict();
    return null;
  }
  if (!snapshot.exists) conflict();
  const state = snapshot.data();
  closed(state, [
    'schemaVersion',
    'editToken',
    'algorithm',
    'operationId',
    'selector',
    'index',
    'manifestHash',
    'hashState',
    'parser',
  ]);
  const receipt = await editReservationPair(tx, l, state.operationId);
  if (
    state.schemaVersion !== 1 ||
    state.editToken !== l.token ||
    state.algorithm !== COMPILATION_ALGORITHM ||
    state.selector !== c.auditSelector ||
    state.index !== c.auditIndex ||
    digest(state) !== c.auditHash ||
    !receipt ||
    !bornEqual(receipt.snapshot, { createTime: snapshot.updateTime })
  )
    conflict();
  return state;
}
export async function openBookLoreEditCompilation(tx, l) {
  assertEditReservationOpening(tx, l);
  const c = l.job.compilation;
  if (
    l.job.phase !== 'preparing' ||
    c?.phase !== 'ready' ||
    l.generation.state.phase !== 'preparing'
  )
    conflict();
  const source = await compilationSource(tx, l);
  await readCompilationAudit(tx, l);
  const snapshot = await tx.get(l.c.db.doc(l.c.path + '/compilationCertificate/current')),
    v = snapshot.data();
  if (!immutable(snapshot)) conflict();
  closed(v, [
    'schemaVersion',
    'editToken',
    'operationId',
    'storageHash',
    'sourceMetadataHash',
    'auditedParts',
  ]);
  const receipt = await editReservationPair(tx, l, v.operationId);
  if (
    v.schemaVersion !== 1 ||
    v.editToken !== l.token ||
    v.storageHash !== digest(c.storage) ||
    v.sourceMetadataHash !== digest(source.metadata) ||
    v.auditedParts !== c.auditedParts ||
    !receipt ||
    receipt.record.method !== 'advanceBookLoreEditCompilation' ||
    !bornEqual(snapshot, receipt.snapshot)
  )
    conflict();
  loreGenerationStorage(c.storage);
  return { storage: structuredClone(c.storage), source, certificate: snapshot };
}
export const sourceRelations = (source) => loreGenerationRelations(source.source.opened.storage);
