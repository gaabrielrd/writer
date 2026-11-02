import {
  sourceInspectionFixture,
  finishSourceInspection,
} from './bookLoreSourceInspectionFixture.mjs';
import { prepareBookResourcePayload } from '../../src/bookResourcePayload.mjs';
import {
  fieldUploadOperationId,
  fieldUploadIntent,
  fieldUploadStartHash,
  fieldUploadPaths,
} from '../../src/bookLoreFieldUploadContracts.mjs';
import { createBookLoreFieldUploadService } from '../../src/bookLoreFieldUpload.mjs';
import { uploadAll, sealAll } from './bookLoreFieldUploadFixture.mjs';
import { createBookLoreEditReservationService } from '../../src/bookLoreEditReservation.mjs';
import {
  editReservationIntent,
  editReservationStartHash,
  editReservationPaths,
} from '../../src/bookLoreEditReservationContracts.mjs';
export async function editReservationFixture(
  db,
  {
    uid = 'author',
    bookId = 'book',
    loreId = 'entity',
    editId = 'edit-reservation-0001',
    mode = 'inline',
    changes = [{ target: { field: 'details' }, value: '\ufeffnew literal 🌙' }],
    removals = [],
    relations,
    sourceOptions = {},
    seal = true,
  } = {},
) {
  const source = await sourceInspectionFixture(db, {
      uid,
      bookId,
      id: loreId,
      inspectionId: 'source-' + editId,
      mode,
      data: { name: 'Original', category: 'other', details: 'saved', isPublic: true },
      ...sourceOptions,
    }),
    inspected = await finishSourceInspection(source),
    inspection = {
      inspectionId: source.inspectionId,
      startHash: source.startHash,
      jobToken: inspected.jobToken,
    },
    uploads = [],
    fields = Object.fromEntries(removals.map((field) => [field, null]));
  for (let index = 0; index < changes.length; index++) {
    const { target, value } = changes[index],
      uploadId = 'upload-' + editId + '-' + index,
      prepared = prepareBookResourcePayload({
        uid,
        bookId,
        resource: { kind: 'lore', parentId: null, id: loreId },
        operationId: fieldUploadOperationId(uid, bookId, loreId, uploadId, target),
        timestamp: 1000,
        value,
      }),
      intent = fieldUploadIntent(uid, {
        bookId,
        loreId,
        uploadId,
        sourceToken: source.intent.sourceToken,
        target,
        manifest: prepared.manifest,
      }),
      startHash = fieldUploadStartHash(intent),
      c = fieldUploadPaths(db, uid, uploadId),
      factory = () => createBookLoreFieldUploadService({ db, now: () => 1000 }),
      field = {
        db,
        uid,
        bookId,
        loreId,
        uploadId,
        value,
        target,
        prepared,
        intent,
        startHash,
        c,
        factory,
      };
    const initial = await factory().startBookLoreFieldUpload(uid, intent),
      progress = seal ? await sealAll(field, await uploadAll(field, initial)) : initial,
      ref = { uploadId, startHash, jobToken: progress.jobToken };
    uploads.push({ ...field, progress, ref });
    if (target.field !== 'relations') fields[target.field] = ref;
  }
  const intent = editReservationIntent(uid, {
      bookId,
      loreId,
      editId,
      sourceToken: source.intent.sourceToken,
      inspection,
      fields,
      ...(relations === undefined ? {} : { relations }),
    }),
    startHash = editReservationStartHash(intent),
    c = editReservationPaths(db, uid, editId),
    factory = () => createBookLoreEditReservationService({ db, now: () => 2000 });
  return {
    db,
    uid,
    bookId,
    loreId,
    editId,
    source,
    inspection,
    intent,
    startHash,
    c,
    factory,
    uploads,
  };
}
export const editControl = (f, p, operationId = 'edit-step-' + p.revision) => ({
  editId: f.editId,
  startHash: f.startHash,
  jobToken: p.jobToken,
  operationId,
  expectedRevision: p.revision,
});
export async function initializeEditReservation(f, p) {
  const current = p ?? (await f.factory().startBookLoreEditReservation(f.uid, f.intent));
  return (
    await f
      .factory()
      .initializeBookLoreEditGeneration(f.uid, editControl(f, current, 'initialize-edit'))
  ).progress;
}
export const editReserveRequest = (f, p, index = 0, operationId = 'reserve-edit-' + index) => ({
  ...editControl(f, p, operationId),
  target: f.uploads[index].target,
  upload: f.uploads[index].ref,
});
export async function reserveAllEditUploads(f, p) {
  let current = p ?? (await initializeEditReservation(f));
  for (let i = 0; i < f.uploads.length; i++)
    current = (
      await f.factory().reserveBookLoreEditUpload(f.uid, editReserveRequest(f, current, i))
    ).progress;
  return current;
}
export const cancelEditReservation = (f, p) =>
  f.factory().cancelBookLoreEditReservation(f.uid, {
    editId: f.editId,
    startHash: f.startHash,
    jobToken: p.jobToken,
    operationId: 'cancel-edit',
  });
export async function drainEditReservation(f, p) {
  let current = p ?? (await cancelEditReservation(f, await reserveAllEditUploads(f))).progress;
  for (let unit = 0; current.phase === 'cancelling' && unit < 1000; unit++) {
    current = (
      await f.factory().advanceBookLoreEditReservationCleanup(f.uid, editControl(f, current))
    ).progress;
    if (current.blockedReason) return current;
  }
  return current;
}
export const getEditReservation = (f) =>
  f.factory().getBookLoreEditReservation(f.uid, { editId: f.editId, startHash: f.startHash });
