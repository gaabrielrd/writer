import { bornEqual, closed } from './bookRestoreUploadContracts.mjs';
import { digest, readWorkMetadata } from './workProgressContracts.mjs';
import { patch } from './loreAnalysisFields.mjs';
import { applicationConflict as conflict } from './loreAnalysisApplicationContracts.mjs';
import { initialApplicationCursor } from './loreAnalysisApplicationWorkflowContracts.mjs';
import {
  readOwnedAnalysisChild,
  prepareAnalysisChildBinding,
} from './loreAnalysisApplicationChildBindings.mjs';
import { createBookLoreCreationReservationService } from './bookLoreCreation.mjs';
import { creationStartHash } from './bookLoreCreationContracts.mjs';
import { createBookLoreSourceInspectionService } from './bookLoreSourceInspection.mjs';
import { inspectionStartHash } from './bookLoreSourceInspectionContracts.mjs';
import { readLoreBook, loreEntityToken } from './bookLoreReadContracts.mjs';
import { createBookLoreFieldUploadService } from './bookLoreFieldUpload.mjs';
import {
  fieldUploadIntent,
  fieldUploadStartHash,
  fieldUploadOperationId,
} from './bookLoreFieldUploadContracts.mjs';
import { prepareBookResourcePayload } from './bookResourcePayload.mjs';
import { createBookLoreEditReservationService } from './bookLoreEditReservation.mjs';
import {
  editReservationIntent,
  editReservationStartHash,
  editReservationPaths,
} from './bookLoreEditReservationContracts.mjs';
import { loadEditReservation } from './bookLoreEditReservationStore.mjs';
import { openBookLoreEditCompilation } from './bookLoreEditCompilationStore.mjs';
import { assertApplicationOpening, readApplicationEvent } from './loreAnalysisApplicationStore.mjs';
const immutable = (s) => s.exists && bornEqual(s, { createTime: s.updateTime });
const memberId = (index) => String(index).padStart(4, '0');
export const preparedMemberPaths = (l, index) => ({
  record: l.c.db.doc(l.c.path + '/prepared/' + memberId(index)),
  proof: l.c.db.doc(l.c.path + '/preparedProofs/' + memberId(index)),
});
const child = (m, kind, id) => ({ member: m.index, kind, id });
const childOperation = (l, r, label) =>
  digest(['analysis-child-unit', l.token, r.operationId, label]);
const fieldControl = (id, startHash, p, operationId) => ({
  uploadId: id,
  startHash,
  jobToken: p.jobToken,
  operationId,
  expectedRevision: p.revision,
});
const editControl = (id, startHash, p, operationId) => ({
  editId: id,
  startHash,
  jobToken: p.jobToken,
  operationId,
  expectedRevision: p.revision,
});
async function inspectionIntentFor(tx, l, m) {
  const scope = {
      db: l.c.db,
      uid: l.c.uid,
      bookId: l.context.bookId,
      path: 'books/' + l.context.bookId,
    },
    book = await readLoreBook(tx, scope),
    head = await readWorkMetadata(tx, l.c.db.doc(scope.path + '/lore/' + m.targetId), []);
  if (!head.exists) conflict();
  return {
    bookId: l.context.bookId,
    loreId: m.targetId,
    inspectionId: m.children.inspectionId,
    sourceToken: loreEntityToken(scope, book, head),
  };
}
async function sourceReference(tx, l, m) {
  const db = l.c.db,
    uid = l.c.uid;
  if (m.children.creationId) {
    const id = m.children.creationId,
      owned = await readOwnedAnalysisChild(tx, l.c, 'creation', id, l);
    if (!owned) conflict();
    const p = await createBookLoreCreationReservationService({
      db,
      transaction: tx,
    }).getBookLoreCreationReservation(uid, { bookId: l.context.bookId, creationId: id });
    if (p?.phase !== 'preparing') conflict();
    const creation = { creationId: id, startHash: owned.record.startHash, jobToken: p.jobToken };
    return { sourceToken: p.jobToken, creation };
  }
  const id = m.children.inspectionId,
    owned = await readOwnedAnalysisChild(tx, l.c, 'inspection', id, l);
  if (!owned) conflict();
  const p = await createBookLoreSourceInspectionService({
    db,
    transaction: tx,
  }).getBookLoreSourceInspection(uid, { inspectionId: id, startHash: owned.record.startHash });
  if (p?.phase !== 'ready') conflict();
  return {
    sourceToken: (await inspectionIntentFor(tx, l, m)).sourceToken,
    inspection: { inspectionId: id, startHash: owned.record.startHash, jobToken: p.jobToken },
  };
}
async function fieldReference(tx, l, upload) {
  const owned = await readOwnedAnalysisChild(tx, l.c, 'field', upload.uploadId, l);
  if (!owned) conflict();
  const p = await createBookLoreFieldUploadService({
    db: l.c.db,
    transaction: tx,
  }).getBookLoreFieldUpload(l.c.uid, {
    uploadId: upload.uploadId,
    startHash: owned.record.startHash,
  });
  if (!['sealed', 'reserved'].includes(p?.phase)) conflict();
  return { uploadId: upload.uploadId, startHash: owned.record.startHash, jobToken: p.jobToken };
}
async function sourceUnit(tx, l, m, next, r, now) {
  const db = l.c.db,
    uid = l.c.uid,
    creating = Boolean(m.children.creationId),
    id = creating ? m.children.creationId : m.children.inspectionId,
    kind = creating ? 'creation' : 'inspection',
    intent = creating
      ? { bookId: l.context.bookId, creationId: id }
      : await inspectionIntentFor(tx, l, m),
    startHash = creating ? creationStartHash(intent) : inspectionStartHash(intent),
    binding = await prepareAnalysisChildBinding(
      tx,
      l,
      child(m, kind, id),
      startHash,
      intent,
      r.operationId,
    );
  if (creating) {
    const api = createBookLoreCreationReservationService({ db, transaction: tx });
    if (!binding.existing) await api.startBookLoreCreationReservation(uid, intent);
    else {
      const p = await api.getBookLoreCreationReservation(uid, intent);
      if (p?.phase !== 'preparing') conflict();
      next.cursor = { member: m.index, stage: 'fields', field: 0 };
    }
  } else {
    const api = createBookLoreSourceInspectionService({ db, now, transaction: tx });
    if (!binding.existing) await api.startBookLoreSourceInspection(uid, intent);
    else {
      const p = await api.getBookLoreSourceInspection(uid, { inspectionId: id, startHash });
      if (p?.phase === 'ready') next.cursor = { member: m.index, stage: 'fields', field: 0 };
      else {
        if (!['checking', 'base', 'privacy'].includes(p?.phase)) conflict();
        const result = await api.advanceBookLoreSourceInspection(uid, {
          inspectionId: id,
          startHash,
          jobToken: p.jobToken,
          expectedRevision: p.revision,
          operationId: childOperation(l, r, 'inspect'),
        });
        if (result.progress.phase === 'ready')
          next.cursor = { member: m.index, stage: 'fields', field: 0 };
      }
    }
  }
  binding.commit();
}
async function fieldUnit(tx, l, m, next, r, input, now) {
  const position = next.cursor.field,
    upload = m.children.uploads[position];
  if (!upload) {
    next.cursor = { member: m.index, stage: 'edit', field: 0 };
    return;
  }
  const values = patch(input),
    value = Object.hasOwn(values, upload.field)
      ? values[upload.field]
      : upload.field === 'isPublic'
        ? false
        : upload.field === 'aliases'
          ? []
          : '',
    db = l.c.db,
    uid = l.c.uid,
    target = { field: upload.field },
    source = await sourceReference(tx, l, m),
    prepared = prepareBookResourcePayload({
      uid,
      bookId: l.context.bookId,
      resource: { kind: 'lore', parentId: null, id: m.targetId },
      operationId: fieldUploadOperationId(
        uid,
        l.context.bookId,
        m.targetId,
        upload.uploadId,
        target,
      ),
      timestamp: Math.floor(
        l.snapshot.createTime.seconds * 1000 + l.snapshot.createTime.nanoseconds / 1e6,
      ),
      value,
    }),
    intent = fieldUploadIntent(uid, {
      bookId: l.context.bookId,
      loreId: m.targetId,
      uploadId: upload.uploadId,
      sourceToken: source.sourceToken,
      target,
      manifest: prepared.manifest,
      ...(source.creation ? { creation: source.creation } : {}),
    }),
    startHash = fieldUploadStartHash(intent),
    binding = await prepareAnalysisChildBinding(
      tx,
      l,
      child(m, 'field', upload.uploadId),
      startHash,
      intent,
      r.operationId,
    ),
    api = createBookLoreFieldUploadService({ db, now, transaction: tx });
  if (!binding.existing) await api.startBookLoreFieldUpload(uid, intent);
  else {
    const p = await api.getBookLoreFieldUpload(uid, { uploadId: upload.uploadId, startHash });
    let phase = p?.phase;
    if (phase === 'uploading') {
      const part = prepared.part(p.nextIndex);
      phase = (
        await api.appendBookLoreFieldUpload(uid, {
          ...fieldControl(upload.uploadId, startHash, p, childOperation(l, r, 'append')),
          index: p.nextIndex,
          chunkBase64: part.bytes.toString('base64'),
          proof: part.proof,
        })
      ).progress.phase;
    } else if (phase === 'verifying')
      phase = (
        await api.advanceBookLoreFieldSeal(
          uid,
          fieldControl(upload.uploadId, startHash, p, childOperation(l, r, 'seal')),
        )
      ).progress.phase;
    else if (phase !== 'sealed') conflict();
    if (phase === 'sealed') next.cursor.field++;
  }
  binding.commit();
}
async function editOpening(tx, l, m, r, now) {
  const db = l.c.db,
    uid = l.c.uid,
    id = m.children.editId,
    owned = await readOwnedAnalysisChild(tx, l.c, 'edit', id, l);
  let intent = null,
    startHash = owned?.record.startHash;
  if (!owned) {
    const source = await sourceReference(tx, l, m),
      fields = {};
    for (const upload of m.children.uploads)
      fields[upload.field] = await fieldReference(tx, l, upload);
    intent = editReservationIntent(uid, {
      bookId: l.context.bookId,
      loreId: m.targetId,
      editId: id,
      ...source,
      fields,
      ...(m.relations ? { relations: m.relations } : {}),
    });
    startHash = editReservationStartHash(intent);
  }
  const binding = await prepareAnalysisChildBinding(
      tx,
      l,
      child(m, 'edit', id),
      startHash,
      intent,
      r.operationId,
    ),
    api = createBookLoreEditReservationService({ db, now, transaction: tx }),
    progress = owned ? await api.getBookLoreEditReservation(uid, { editId: id, startHash }) : null;
  return { id, startHash, binding, api, progress, intent };
}
async function preparedSlots(tx, l, index) {
  const at = preparedMemberPaths(l, index);
  if ((await tx.get(at.record)).exists || (await tx.get(at.proof)).exists) conflict();
  return at;
}
function finishMember(tx, l, m, next, r, at, edit = null) {
  const record = {
    schemaVersion: 1,
    applicationToken: l.token,
    member: m.index,
    patchHash: m.patchHash,
    edit,
    unitRevision: l.state.revision + 1,
    operationId: r.operationId,
  };
  tx.create(at.record, record);
  tx.create(at.proof, { schemaVersion: 1, recordHash: digest(record) });
  next.preparedCount++;
  next.cursor = { ...initialApplicationCursor(), member: m.index + 1 };
  if (next.preparedCount === l.context.members.length) next.phase = 'ready';
}
export async function produceApplicationMember(tx, l, next, r, changes, now) {
  const m = l.context.members[next.cursor.member];
  if (!m || digest(patch(changes[m.index].input)) !== m.patchHash) conflict();
  if (m.scope === 'global') {
    const at = await preparedSlots(tx, l, m.index);
    finishMember(tx, l, m, next, r, at);
    return;
  }
  const stage = next.cursor.stage;
  if (stage === 'source') return sourceUnit(tx, l, m, next, r, now);
  if (stage === 'fields') return fieldUnit(tx, l, m, next, r, changes[m.index].input, now);
  const edit = await editOpening(tx, l, m, r, now),
    p = edit.progress;
  if (stage === 'edit') {
    if (!p) await edit.api.startBookLoreEditReservation(l.c.uid, edit.intent);
    else if (p.phase === 'initializing') {
      const result = await edit.api.initializeBookLoreEditGeneration(
        l.c.uid,
        editControl(edit.id, edit.startHash, p, childOperation(l, r, 'initialize')),
      );
      if (result.progress.phase === 'preparing') next.cursor.stage = 'reserve';
    } else if (p.phase === 'preparing') next.cursor.stage = 'reserve';
    else conflict();
  } else {
    if (p?.phase !== 'preparing') conflict();
    if (stage === 'reserve') {
      const upload = m.children.uploads[next.cursor.field];
      if (!upload) next.cursor = { member: m.index, stage: 'compile', field: 0 };
      else {
        if (p.reservedCount !== next.cursor.field) conflict();
        const ref = await fieldReference(tx, l, upload);
        await edit.api.reserveBookLoreEditUpload(l.c.uid, {
          ...editControl(edit.id, edit.startHash, p, childOperation(l, r, 'reserve')),
          target: { field: upload.field },
          upload: ref,
        });
        next.cursor.field++;
      }
    } else if (stage === 'compile') {
      const at = await preparedSlots(tx, l, m.index);
      let ready = p;
      if (p.compilation?.phase === 'ready') {
        const loaded = await loadEditReservation(
          tx,
          editReservationPaths(l.c.db, l.c.uid, edit.id),
          { startHash: edit.startHash, jobToken: p.jobToken },
        );
        await openBookLoreEditCompilation(tx, loaded);
      } else
        ready = (
          await edit.api.advanceBookLoreEditCompilation(
            l.c.uid,
            editControl(edit.id, edit.startHash, p, childOperation(l, r, 'compile')),
          )
        ).progress;
      if (ready.compilation?.phase === 'ready')
        finishMember(
          tx,
          l,
          m,
          next,
          r,
          at,
          editControl(
            edit.id,
            edit.startHash,
            ready,
            digest(['analysis-adopt-member', l.token, m.index]),
          ),
        );
    } else conflict();
  }
  edit.binding.commit();
}
export async function readPreparedApplicationMember(tx, l, index) {
  assertApplicationOpening(tx, l);
  const at = preparedMemberPaths(l, index),
    record = await tx.get(at.record),
    proof = await tx.get(at.proof);
  if (!immutable(record) || !immutable(proof) || !bornEqual(record, proof)) conflict();
  const v = record.data(),
    p = proof.data(),
    m = l.context.members[index];
  closed(v, [
    'schemaVersion',
    'applicationToken',
    'member',
    'patchHash',
    'edit',
    'unitRevision',
    'operationId',
  ]);
  closed(p, ['schemaVersion', 'recordHash']);
  if (
    !m ||
    v.schemaVersion !== 1 ||
    p.schemaVersion !== 1 ||
    p.recordHash !== digest(v) ||
    v.applicationToken !== l.token ||
    v.member !== index ||
    v.patchHash !== m.patchHash ||
    (m.scope === 'global' ? v.edit !== null : v.edit?.editId !== m.children.editId)
  )
    conflict();
  const event = await readApplicationEvent(tx, l, v.unitRevision);
  if (
    event.record.method !== 'advanceLoreAnalysisApplication' ||
    event.record.operationId !== v.operationId ||
    !bornEqual(event.snapshot, record) ||
    event.record.progress.preparedCount <= index
  )
    conflict();
  return v;
}
