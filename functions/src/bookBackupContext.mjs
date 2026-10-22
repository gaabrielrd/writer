import {
  digest,
  workClosed,
  workFail,
  workId,
  workProject,
  workScope,
  initialWorkControl,
} from './workProgressContracts.mjs';
export function bookBackupToken(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    workFail('invalid-argument', 'Token de captura inválido.');
  return value;
}
function stamp(value) {
  if (
    !value ||
    !Number.isSafeInteger(value.seconds) ||
    value.seconds < 0 ||
    !Number.isInteger(value.nanoseconds) ||
    value.nanoseconds < 0 ||
    value.nanoseconds >= 1e9
  )
    workFail('failed-precondition', 'Identidade nativa indisponível.');
  return { seconds: value.seconds, nanoseconds: value.nanoseconds };
}
export function bookBackupIdentity(snapshot) {
  return snapshot.exists
    ? { created: stamp(snapshot.createTime), updated: stamp(snapshot.updateTime) }
    : null;
}
export function bookBackupChanged(item = false) {
  workFail(
    'failed-precondition',
    'O livro mudou durante a captura. Faça um novo backup.',
    item ? 'book-backup-item-changed' : 'book-backup-source-changed',
  );
}
export function bookBackupScope(db, uid, data, keys) {
  if (!uid) workFail('unauthenticated', 'Entre na sua conta.');
  workClosed(data, ['bookId', ...keys]);
  return workScope(db, uid, { target: { kind: 'book', id: workId(data.bookId) } }, []);
}
export async function readBookBackupSource(tx, context, expected) {
  const root = await workProject(tx, context),
    snapshot = await tx.get(context.ref),
    control = await tx.get(context.db.doc(context.path + '/workProgress/current')),
    result = {
      schemaVersion: 1,
      bookId: context.target.id,
      sourceToken: digest({
        version: 1,
        uid: context.uid,
        bookId: context.target.id,
        root: bookBackupIdentity(snapshot),
        control: bookBackupIdentity(control),
      }),
    };
  if (expected !== undefined && result.sourceToken !== expected) bookBackupChanged();
  return {
    result,
    root,
    control: control.data() ?? initialWorkControl(context.target, root),
  };
}
