import {
  digest,
  workClosed,
  workFail,
  workId,
  readWorkMetadata,
} from './workProgressContracts.mjs';

const inconsistent = () =>
  workFail(
    'failed-precondition',
    'Não foi possível conferir a origem da aventura.',
    'adventure-backup-source-inconsistent',
  );
function stamp(value) {
  if (
    !value ||
    !Number.isSafeInteger(value.seconds) ||
    value.seconds < 0 ||
    !Number.isInteger(value.nanoseconds) ||
    value.nanoseconds < 0 ||
    value.nanoseconds >= 1e9
  )
    inconsistent();
  return { seconds: value.seconds, nanoseconds: value.nanoseconds };
}
export function adventureBackupIdentity(snapshot) {
  return snapshot.exists
    ? { created: stamp(snapshot.createTime), updated: stamp(snapshot.updateTime) }
    : null;
}
export function adventureBackupToken(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    workFail('invalid-argument', 'Token de captura inválido.');
  return value;
}
export function adventureBackupChanged(item = false) {
  workFail(
    'failed-precondition',
    'A aventura mudou durante a captura. Faça um novo backup.',
    item ? 'adventure-backup-item-changed' : 'adventure-backup-source-changed',
  );
}
export function adventureBackupScope(db, uid, data, keys) {
  if (!uid) workFail('unauthenticated', 'Entre na sua conta.');
  workClosed(data, ['adventureId', ...keys]);
  const adventureId = workId(data.adventureId),
    path = 'adventures/' + adventureId;
  return { db, uid, adventureId, path, ref: db.doc(path) };
}
/** Root/progress only: resource bindings and bodies require their own proofs. */
export async function readAdventureBackupSource(tx, context, expected) {
  if (typeof tx.getAll !== 'function') inconsistent();
  const { db, uid, adventureId, path, ref } = context,
    snapshot = await readWorkMetadata(tx, ref, ['ownerId', 'schemaVersion', 'deleting']),
    root = snapshot.data();
  if (!snapshot.exists || !root || root.ownerId !== uid || root.deleting)
    workFail('not-found', 'Aventura indisponível.');
  if (root.schemaVersion !== 1) inconsistent();
  const project = adventureBackupIdentity(snapshot),
    progress = await readWorkMetadata(tx, db.doc(path + '/workProgress/current'), [
      'schemaVersion',
    ]),
    sourceToken = digest({
      version: 1,
      kind: 'adventure',
      scope: 'root-progress',
      uid,
      adventureId,
      project,
      progress: adventureBackupIdentity(progress),
    });
  if (progress.exists && progress.data()?.schemaVersion !== 1) inconsistent();
  if (expected !== undefined && sourceToken !== expected) adventureBackupChanged();
  return { result: { schemaVersion: 1, adventureId, sourceToken }, snapshot, progress };
}
export function createAdventureBackupSourceService({ db }) {
  return {
    async getAdventureBackupSource(uid, data) {
      const context = adventureBackupScope(db, uid, data, ['expectedSourceToken']),
        expected = Object.hasOwn(data, 'expectedSourceToken')
          ? adventureBackupToken(data.expectedSourceToken)
          : undefined;
      return db.runTransaction(
        async (tx) => (await readAdventureBackupSource(tx, context, expected)).result,
      );
    },
  };
}
