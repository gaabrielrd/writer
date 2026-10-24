import { authorize, born, closed, integer, restoreHash } from './bookRestoreUploadContracts.mjs';
import { creationRef } from './bookLoreCreationContracts.mjs';
import { bookContentId } from './bookBackupSchema.mjs';
import { BOOK_LORE_GENERATION_FIELDS } from './bookLoreGenerationContracts.mjs';
import { digest, workFail } from './workProgressContracts.mjs';
import { editAdoptionView } from './bookLoreEditAdoptionContracts.mjs';
import { compilationView } from './bookLoreEditCompilationContracts.mjs';
export const editReservationConflict = () =>
  workFail(
    'failed-precondition',
    'A preparação da edição mudou ou está indisponível.',
    'book-lore-edit-conflict',
  );
export const editStamp = (s) => {
  closed(s, ['seconds', 'nanoseconds']);
  born({ createTime: s });
  return s;
};
export function editUploadRef(v) {
  closed(v, ['uploadId', 'startHash', 'jobToken']);
  return {
    uploadId: bookContentId(v.uploadId),
    startHash: restoreHash(v.startHash),
    jobToken: restoreHash(v.jobToken),
  };
}
export function editInspectionRef(v) {
  closed(v, ['inspectionId', 'startHash', 'jobToken']);
  return {
    inspectionId: bookContentId(v.inspectionId),
    startHash: restoreHash(v.startHash),
    jobToken: restoreHash(v.jobToken),
  };
}
export function editReservationTarget(v) {
  closed(v, ['field'], v?.field === 'relations' ? ['page', 'count'] : []);
  if (v.field === 'relations') {
    closed(v, ['field', 'page', 'count']);
    integer(v.page);
    integer(v.count, 1);
    if (v.count > 64) editReservationConflict();
  } else if (!BOOK_LORE_GENERATION_FIELDS.includes(v.field)) editReservationConflict();
  return { field: v.field, ...(v.field === 'relations' ? { page: v.page, count: v.count } : {}) };
}
export const editSlotId = (target) =>
  digest({ domain: 'writer-lore-edit-slot', target: editReservationTarget(target) });
export const editGenerationId = (token) =>
  digest({ domain: 'writer-lore-edit-generation', editToken: restoreHash(token) });
export function editReservationIntent(uid, v) {
  authorize(uid);
  const creating = Object.hasOwn(v, 'creation');
  closed(
    v,
    ['bookId', 'loreId', 'editId', 'sourceToken', creating ? 'creation' : 'inspection', 'fields'],
    ['relations'],
  );
  closed(v.fields, [], BOOK_LORE_GENERATION_FIELDS);
  const fields = {};
  for (const field of BOOK_LORE_GENERATION_FIELDS)
    if (Object.hasOwn(v.fields, field)) {
      if (v.fields[field] === null) {
        if (['name', 'category'].includes(field)) editReservationConflict();
        fields[field] = null;
      } else fields[field] = editUploadRef(v.fields[field]);
    }
  const intent = {
    bookId: bookContentId(v.bookId),
    loreId: bookContentId(v.loreId),
    editId: bookContentId(v.editId),
    sourceToken: restoreHash(v.sourceToken),
    ...(creating
      ? { creation: creationRef(v.creation) }
      : { inspection: editInspectionRef(v.inspection) }),
    fields,
  };
  if (Object.hasOwn(v, 'relations')) {
    closed(v.relations, ['present', 'count']);
    integer(v.relations.count);
    if (
      typeof v.relations.present !== 'boolean' ||
      (!v.relations.present && v.relations.count !== 0)
    )
      editReservationConflict();
    intent.relations = { present: v.relations.present, count: v.relations.count };
  }
  if (
    creating &&
    (intent.sourceToken !== intent.creation.jobToken ||
      !fields.name ||
      !fields.category ||
      !Object.hasOwn(intent, 'relations'))
  )
    editReservationConflict();
  if (!Object.keys(fields).length && !Object.hasOwn(intent, 'relations')) editReservationConflict();
  return intent;
}
export const editReservationStartHash = (intent) =>
  digest({ domain: 'writer-lore-edit-start', schemaVersion: 1, intent });
export function editReservationPaths(db, uid, id) {
  authorize(uid);
  bookContentId(id);
  const path = 'users/' + uid + '/bookLoreEdits/' + id;
  return { db, uid, id, path, ref: db.doc(path) };
}
export function editReservationRequest(uid, v, extra = [], mutation = false, cas = false) {
  authorize(uid);
  closed(
    v,
    [
      'editId',
      'startHash',
      ...(mutation ? ['operationId'] : []),
      ...(cas ? ['jobToken', 'expectedRevision'] : []),
      ...extra,
    ],
    cas ? [] : ['jobToken'],
  );
  const r = { editId: bookContentId(v.editId), startHash: restoreHash(v.startHash) };
  if (Object.hasOwn(v, 'jobToken')) r.jobToken = restoreHash(v.jobToken);
  if (mutation) r.operationId = bookContentId(v.operationId);
  if (cas) {
    integer(v.expectedRevision);
    r.expectedRevision = v.expectedRevision;
  }
  for (const key of extra) r[key] = v[key];
  return r;
}
export const editReservationToken = (c, s, j) =>
  digest({
    domain: 'writer-lore-edit-job',
    schemaVersion: 1,
    uid: c.uid,
    editId: c.id,
    startHash: j.startHash,
    birth: born(s),
  });
export const editReservationView = (loaded) => {
  const j = loaded.job,
    fence = j.kind === 'fence';
  return {
    editId: loaded.c.id,
    startHash: j.startHash,
    jobToken: fence ? null : loaded.token,
    phase: j.phase,
    revision: fence ? 0 : j.revision,
    reservedCount: fence ? 0 : j.reservedCount,
    releasedCount: fence ? 0 : j.releasedCount,
    blockedReason: fence ? null : j.blockedReason,
    ...(j.compilation ? { compilation: compilationView(j.compilation) } : {}),
    ...(j.adoption ? { adoption: editAdoptionView(j.adoption) } : {}),
  };
};
export function editPreparationRef(v) {
  closed(v, ['editId', 'editToken', 'editBirth', 'startHash', 'sourceToken']);
  bookContentId(v.editId);
  restoreHash(v.editToken);
  editStamp(v.editBirth);
  restoreHash(v.startHash);
  restoreHash(v.sourceToken);
  return v;
}
export function editUploadReservation(v) {
  closed(v, [
    'schemaVersion',
    'editId',
    'editToken',
    'editBirth',
    'startHash',
    'generationId',
    'generationBirth',
    'slotId',
    'operationId',
  ]);
  if (v.schemaVersion !== 1) editReservationConflict();
  bookContentId(v.editId);
  restoreHash(v.editToken);
  editStamp(v.editBirth);
  restoreHash(v.startHash);
  if (restoreHash(v.generationId) !== editGenerationId(v.editToken)) editReservationConflict();
  editStamp(v.generationBirth);
  restoreHash(v.slotId);
  bookContentId(v.operationId);
  return v;
}
export function assertIntentReservation(intent, target, upload) {
  editReservationTarget(target);
  editUploadRef(upload);
  if (target.field === 'relations') {
    const rel = intent.relations;
    if (
      !rel?.present ||
      target.page >= Math.ceil(rel.count / 64) ||
      target.count !== Math.min(64, rel.count - target.page * 64)
    )
      editReservationConflict();
  } else if (
    !Object.hasOwn(intent.fields, target.field) ||
    intent.fields[target.field] === null ||
    digest(intent.fields[target.field]) !== digest(upload)
  )
    editReservationConflict();
}

export const expectedEditGeneration = (loaded) => {
  const { c, job: j } = loaded,
    ctx = j.context,
    intent = ctx.intent;
  return {
    schemaVersion: intent.creation ? 2 : 1,
    kind: 'generation',
    ownerId: c.uid,
    bookId: intent.bookId,
    bookBirth: ctx.bookBirth,
    loreId: intent.loreId,
    generationId: editGenerationId(loaded.token),
    ...(intent.creation
      ? { creationSource: { reference: intent.creation, birth: ctx.creationBirth } }
      : {
          sourceBirth: ctx.sourceBirth,
          sourceUpdate: ctx.sourceUpdate,
          storageHash: ctx.sourceStorageHash,
        }),
    preparation: {
      editId: c.id,
      editToken: loaded.token,
      editBirth: born(loaded.snapshot),
      startHash: j.startHash,
      sourceToken: intent.sourceToken,
    },
  };
};
