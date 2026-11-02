import { applicationConflict as conflict } from './loreAnalysisApplicationContracts.mjs';
import { assertApplicationOpening } from './loreAnalysisApplicationStore.mjs';
import { readOwnedAnalysisChild } from './loreAnalysisApplicationChildBindings.mjs';
import {
  applicationChildren,
  analysisChildPaths,
} from './loreAnalysisApplicationChildContracts.mjs';
import { readPreparedApplicationMember } from './loreAnalysisApplicationProduction.mjs';
import { createBookLoreEditReservationCleanup } from './bookLoreEditReservationCleanup.mjs';
import { createBookLoreEditReservationService } from './bookLoreEditReservation.mjs';
import { createBookLoreFieldUploadService } from './bookLoreFieldUpload.mjs';
import { createBookLoreSourceInspectionService } from './bookLoreSourceInspection.mjs';
import { createBookLoreCreationReservationService } from './bookLoreCreation.mjs';
import { digest } from './workProgressContracts.mjs';
const operation = (l, r, label) =>
  digest(['analysis-cleanup-child', l.token, r.operationId, label]);
async function owned(tx, l, kind, id) {
  if (!id) return null;
  return readOwnedAnalysisChild(tx, l.c, kind, id, l);
}
async function audit(tx, l) {
  const expected = l.state.preparedCount,
    records = await tx.get(
      l.c.db
        .collection(l.c.path + '/prepared')
        .orderBy('__name__')
        .limit(51)
        .select(),
    ),
    proofs = await tx.get(
      l.c.db
        .collection(l.c.path + '/preparedProofs')
        .orderBy('__name__')
        .limit(51)
        .select(),
    );
  for (const page of [records, proofs]) {
    if (
      page.docs.length !== expected ||
      page.docs.some((d, i) => d.id !== String(i).padStart(4, '0'))
    )
      conflict();
  }
  const results = await Promise.allSettled(
      Array.from({ length: expected }, (_, i) => readPreparedApplicationMember(tx, l, i)),
    ),
    failure = results.find((x) => x.status === 'rejected');
  if (failure) throw failure.reason;
  const ids = new Set(
      applicationChildren(l.context).map((child) => analysisChildPaths(l.c.db, l.c.uid, child).key),
    ),
    owners = await tx.get(
      l.c.db
        .collection('users/' + l.c.uid + '/loreAnalysisChildOwners')
        .where('applicationId', '==', l.c.id)
        .limit(ids.size + 1)
        .select(),
    );
  if (owners.docs.some((d) => !ids.has(d.id))) conflict();
}
export async function cleanupApplicationMember(tx, l, next, r) {
  assertApplicationOpening(tx, l);
  if (l.state.phase !== 'cancelling') conflict();
  const m = l.context.members[next.cleanup.member];
  if (!m) {
    await audit(tx, l);
    next.phase = 'cancelled';
    return;
  }
  if (m.scope === 'global') {
    next.cleanup = { member: m.index + 1, stage: 'edit', field: 0 };
    return;
  }
  const db = l.c.db,
    uid = l.c.uid,
    step = next.cleanup;
  if (step.stage === 'edit') {
    const id = m.children.editId,
      child = await owned(tx, l, 'edit', id);
    if (!child) {
      next.cleanup.stage = 'fields';
      return;
    }
    const r0 = { editId: id, startHash: child.record.startHash },
      p = await createBookLoreEditReservationService({
        db,
        transaction: tx,
      }).getBookLoreEditReservation(uid, r0);
    if (p.phase === 'adopted') conflict();
    if (p.phase === 'cancelled') {
      next.cleanup.stage = 'fields';
      return;
    }
    const api = createBookLoreEditReservationCleanup({ db, transaction: tx }),
      control = { ...r0, jobToken: p.jobToken, operationId: operation(l, r, 'edit') },
      result =
        p.phase === 'cancelling'
          ? await api.advanceBookLoreEditReservationCleanup(uid, {
              ...control,
              expectedRevision: p.revision,
            })
          : await api.cancelBookLoreEditReservation(uid, control);
    if (result.progress.blockedReason) conflict();
    if (result.progress.phase === 'cancelled') next.cleanup.stage = 'fields';
  } else if (step.stage === 'fields') {
    const upload = m.children.uploads[step.field];
    if (!upload) {
      next.cleanup.stage = 'source';
      return;
    }
    const child = await owned(tx, l, 'field', upload.uploadId);
    if (!child) {
      next.cleanup.field++;
      return;
    }
    const api = createBookLoreFieldUploadService({ db, transaction: tx }),
      r0 = { uploadId: upload.uploadId, startHash: child.record.startHash },
      p = await api.getBookLoreFieldUpload(uid, r0);
    if (p.phase === 'cancelled') {
      next.cleanup.field++;
      return;
    }
    const control = { ...r0, jobToken: p.jobToken, operationId: operation(l, r, 'field') },
      result =
        p.phase === 'cancelling'
          ? await api.advanceBookLoreFieldCleanup(uid, { ...control, expectedRevision: p.revision })
          : await api.cancelBookLoreFieldUpload(uid, control);
    if (result.progress.phase === 'cancelled') next.cleanup.field++;
  } else if (step.stage === 'source') {
    const creating = Boolean(m.children.creationId),
      kind = creating ? 'creation' : 'inspection',
      id = creating ? m.children.creationId : m.children.inspectionId,
      child = await owned(tx, l, kind, id);
    let complete = !child;
    if (child && creating) {
      const api = createBookLoreCreationReservationService({ db, transaction: tx }),
        r0 = { bookId: l.context.bookId, creationId: id },
        p = await api.getBookLoreCreationReservation(uid, r0);
      if (p.phase === 'adopted') conflict();
      if (p.phase === 'cancelled') complete = true;
      else {
        const control = { ...r0, jobToken: p.jobToken, operationId: operation(l, r, 'creation') },
          result =
            p.phase === 'cancelling'
              ? (
                  await api.advanceBookLoreCreationCleanup(uid, {
                    ...control,
                    expectedRevision: p.cleanupRevision,
                  })
                ).progress
              : await api.cancelBookLoreCreationReservation(uid, control);
        complete = result.phase === 'cancelled';
      }
    } else if (child) {
      const api = createBookLoreSourceInspectionService({ db, transaction: tx }),
        r0 = { inspectionId: id, startHash: child.record.startHash },
        p = await api.getBookLoreSourceInspection(uid, r0);
      if (p.phase === 'cancelled') complete = true;
      else
        complete =
          (
            await api.cancelBookLoreSourceInspection(uid, {
              ...r0,
              jobToken: p.jobToken,
              operationId: operation(l, r, 'inspection'),
            })
          ).progress.phase === 'cancelled';
    }
    if (complete) next.cleanup = { member: m.index + 1, stage: 'edit', field: 0 };
  } else conflict();
}
