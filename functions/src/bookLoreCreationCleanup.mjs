import { born, bornEqual } from './bookRestoreUploadContracts.mjs';
import { digest, readWorkMetadata } from './workProgressContracts.mjs';
import { deletionAtMost } from './bookLoreDeletionStore.mjs';
import { creationConflict as conflict, creationView } from './bookLoreCreationContracts.mjs';
import {
  assertCreationRecord,
  cancelCreationInTransaction,
  writeCreationCancellation,
} from './bookLoreCreationStore.mjs';
import {
  prepareCreationCancelRequest,
  replayCreationCleanup,
  reserveCreationCleanupCommit,
} from './bookLoreCreationCancelRequest.mjs';
import { fieldUploadPaths } from './bookLoreFieldUploadContracts.mjs';
import { loadFieldUpload } from './bookLoreFieldUploadStore.mjs';
import { createBookLoreFieldUploadCleanup } from './bookLoreFieldUploadCleanup.mjs';
import { resourcePayloadBodyPath } from './bookResourcePayloadPaths.mjs';
const beforeRequest = (l, s) => {
  if (!s.exists || !deletionAtMost(born(s), born(l.cancelRequest.snapshot))) conflict();
};
async function field(tx, l, id, startHash) {
  const c = fieldUploadPaths(l.c.db, l.c.uid, id),
    j = await loadFieldUpload(tx, c, { startHash });
  if (
    !j ||
    j.job.kind !== 'upload' ||
    j.job.context.bookId !== l.c.intent.bookId ||
    j.job.context.loreId !== l.c.loreId ||
    j.job.context.creation?.creationId !== l.c.intent.creationId ||
    j.job.context.creation?.jobToken !== l.token ||
    !bornEqual(l.snapshot, { createTime: j.job.context.creationBirth }) ||
    j.job.reservation
  )
    conflict();
  beforeRequest(l, j.snapshot);
  return j;
}
async function emptyField(tx, l, j) {
  if (j.job.phase !== 'cancelled') conflict();
  const body = j.job.context.manifest.bodyId,
    db = l.c.db,
    bookId = l.c.intent.bookId,
    header = await readWorkMetadata(tx, db.doc(resourcePayloadBodyPath(bookId, body)), []),
    chunks = await tx.get(
      db
        .collection('books/' + bookId + '/bookResourceChunks')
        .where('bodyId', '==', body)
        .limit(1)
        .select(),
    );
  if (header.exists || chunks.docs.length) conflict();
}
export async function requestCreationCancellation(tx, l, r) {
  assertCreationRecord(tx, l);
  if (l.cancellation) return cancelCreationInTransaction(tx, l, r);
  if (l.cancelRequest) {
    if (
      l.cancelRequest.request.operationId === r.operationId &&
      l.cancelRequest.request.requestHash !== digest(r)
    )
      conflict();
    return creationView(l);
  }
  const head = await readWorkMetadata(
    tx,
    l.c.db.doc('books/' + l.c.intent.bookId + '/lore/' + l.c.loreId),
    [],
  );
  if (head.exists) conflict();
  const children = await tx.get(
    l.c.db
      .collection(l.c.path + '/uploads')
      .limit(1)
      .select(),
  );
  if (!children.docs.length) return cancelCreationInTransaction(tx, l, r);
  const plan = await prepareCreationCancelRequest(tx, l, r);
  plan.commit();
  return creationView({ ...l, cancelRequest: { state: plan.state, request: plan.request } });
}
async function advanceUpload(tx, l, next) {
  let query = l.c.db
    .collection(l.c.path + '/uploads')
    .orderBy('__name__')
    .limit(1);
  if (next.cursor) query = query.startAfter(next.cursor);
  const binding = (await tx.get(query)).docs[0];
  if (!binding) {
    next.phase = 'leases';
    next.cursor = null;
    return;
  }
  beforeRequest(l, binding);
  const j = await field(tx, l, binding.id, binding.data().startHash);
  if (j.job.phase === 'cancelled') {
    await emptyField(tx, l, j);
    next.cursor = binding.id;
    next.completedUploads++;
    return;
  }
  const api = createBookLoreFieldUploadCleanup({ db: l.c.db, transaction: tx }),
    r = {
      uploadId: j.c.uploadId,
      startHash: j.job.startHash,
      jobToken: j.token,
      operationId: digest([
        'creation-child-cancel',
        l.cancelRequest.token,
        l.cancelRequest.state.revision,
      ]),
    },
    result =
      j.job.phase === 'cancelling'
        ? await api.advanceBookLoreFieldCleanup(l.c.uid, { ...r, expectedRevision: j.job.revision })
        : await api.cancelBookLoreFieldUpload(l.c.uid, r);
  if (result.blocked) conflict();
  next.coordinatedUnits++;
  if (result.progress.phase === 'cancelled') {
    next.cursor = binding.id;
    next.completedUploads++;
  }
}
async function audit(tx, l, next) {
  const db = l.c.db,
    leases = next.phase === 'leases';
  let query = (
    leases
      ? db
          .collection('books/' + l.c.intent.bookId + '/bookResourceLeases')
          .where('loreId', '==', l.c.loreId)
      : db
          .collection('users/' + l.c.uid + '/bookLoreFieldUploads')
          .where('context.loreId', '==', l.c.loreId)
  )
    .orderBy('__name__')
    .limit(1);
  if (next.cursor) query = query.startAfter(next.cursor);
  const s = (await tx.get(query)).docs[0];
  if (!s) {
    next.phase = leases ? 'jobs' : 'finish';
    next.cursor = null;
    return;
  }
  beforeRequest(l, s);
  const v = s.data(),
    j = await field(tx, l, leases ? v.uploadId : s.id, v.startHash);
  if (leases && j.leaseRef.path !== s.ref.path) conflict();
  await emptyField(tx, l, j);
  next.cursor = s.id;
}
async function payloadsGone(tx, l) {
  const db = l.c.db,
    bookId = l.c.intent.bookId,
    base = 'books/' + bookId + '/',
    root = await readWorkMetadata(tx, db.doc('books/' + bookId), []),
    head = await readWorkMetadata(tx, db.doc(base + 'lore/' + l.c.loreId), []);
  if ((root.exists && !bornEqual(root, { createTime: l.context.bookBirth })) || head.exists)
    conflict();
  const queries = [
    db
      .collection(base + 'bookResourceBodies')
      .where('resource.kind', '==', 'lore')
      .where('resource.id', '==', l.c.loreId),
    ...['bookLoreSegments', 'bookLoreGenerations', 'bookResourceInventory'].map((n) =>
      db.collection(base + n).where('loreId', '==', l.c.loreId),
    ),
    db
      .collection('users/' + l.c.uid + '/bookLoreEdits')
      .where('context.intent.loreId', '==', l.c.loreId),
    db
      .collection('users/' + l.c.uid + '/bookLoreSourceInspections')
      .where('context.loreId', '==', l.c.loreId),
  ];
  if (
    (await Promise.all(queries.map((q) => tx.get(q.limit(1).select())))).some((p) => p.docs.length)
  )
    conflict();
}
export async function advanceCreationCleanupInTransaction(tx, l, r) {
  assertCreationRecord(tx, l);
  if (!l.cancelRequest) conflict();
  const receipt = await replayCreationCleanup(tx, l, r);
  if (receipt) return { receipt, progress: creationView(l) };
  const x = l.cancelRequest;
  if (l.cancellation) return { receipt: null, progress: creationView(l) };
  if (x.state.revision !== r.expectedRevision) conflict();
  const reserve = await reserveCreationCleanupCommit(tx, l, r),
    next = structuredClone(x.state);
  let terminal = false;
  if (next.phase === 'uploads') await advanceUpload(tx, l, next);
  else if (['leases', 'jobs'].includes(next.phase)) await audit(tx, l, next);
  else if (next.phase === 'finish') {
    await payloadsGone(tx, l);
    next.phase = 'complete';
    terminal = true;
  } else conflict();
  next.revision = x.state.revision + 1;
  next.lastOperationId = r.operationId;
  const progress = creationView({
      ...l,
      cancelRequest: { ...x, state: next },
      ...(terminal ? { cancellation: { operationId: x.request.operationId } } : {}),
    }),
    plan = reserve(next, progress);
  if (terminal)
    writeCreationCancellation(
      tx,
      l.c,
      l.context,
      l.token,
      { operationId: x.request.operationId },
      x.request.requestHash,
    );
  plan.commit();
  return { receipt: progress, progress };
}
