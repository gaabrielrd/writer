import { born, bornEqual, closed, integer } from './bookRestoreUploadContracts.mjs';
import { bookContentId } from './bookBackupSchema.mjs';
import { digest } from './workProgressContracts.mjs';
import { editReservationConflict as conflict } from './bookLoreEditReservationContracts.mjs';
const immutable = (s) => s.exists && bornEqual(s, { createTime: s.updateTime });
const update = (s) => born({ createTime: s.updateTime });
const atMost = (a, b) =>
  a.seconds < b.seconds || (a.seconds === b.seconds && a.nanoseconds <= b.nanoseconds);
export async function editReservationPair(tx, loaded, id) {
  const c = loaded.c;
  bookContentId(id);
  const receipt = await tx.get(c.db.doc(c.path + '/operations/' + id)),
    anchor = await tx.get(c.db.doc(c.path + '/operationProofs/' + id));
  if (!receipt.exists && !anchor.exists) return null;
  if (
    !immutable(receipt) ||
    !immutable(anchor) ||
    !bornEqual(receipt, anchor) ||
    !atMost(born(loaded.snapshot), born(receipt)) ||
    !atMost(born(receipt), update(loaded.snapshot))
  )
    conflict();
  const r = receipt.data(),
    a = anchor.data();
  closed(r, [
    'schemaVersion',
    'ownerId',
    'editId',
    'editToken',
    'startHash',
    'operationId',
    'method',
    'requestHash',
    'revision',
    'jobHash',
    'progress',
  ]);
  closed(a, [
    'schemaVersion',
    'ownerId',
    'editId',
    'editToken',
    'startHash',
    'operationId',
    'receiptHash',
  ]);
  for (const [key, value] of Object.entries({
    schemaVersion: 1,
    ownerId: c.uid,
    editId: c.id,
    editToken: loaded.token,
    startHash: loaded.job.startHash,
    operationId: id,
  }))
    if (r[key] !== value || a[key] !== value) conflict();
  closed(
    r.progress,
    [
      'editId',
      'startHash',
      'jobToken',
      'phase',
      'revision',
      'reservedCount',
      'releasedCount',
      'blockedReason',
    ],
    ['compilation', 'adoption'],
  );
  integer(r.revision, 1);
  if (
    a.receiptHash !== digest(r) ||
    r.revision > loaded.job.revision ||
    r.progress.revision !== r.revision ||
    r.progress.jobToken !== loaded.token
  )
    conflict();
  return { snapshot: receipt, record: r };
}
