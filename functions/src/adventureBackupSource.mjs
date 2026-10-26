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
function identity(snapshot) {
  return snapshot.exists
    ? { created: stamp(snapshot.createTime), updated: stamp(snapshot.updateTime) }
    : null;
}
/** A root/progress anchor only. Resource bindings and bodies need separate proofs. */
export function createAdventureBackupSourceService({ db }) {
  return {
    async getAdventureBackupSource(uid, data) {
      if (!uid) workFail('unauthenticated', 'Entre na sua conta.');
      workClosed(data, ['adventureId', 'expectedSourceToken']);
      const adventureId = workId(data.adventureId),
        expected = data.expectedSourceToken;
      if (
        Object.hasOwn(data, 'expectedSourceToken') &&
        (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected))
      )
        workFail('invalid-argument', 'Token de captura inválido.');
      return db.runTransaction(async (tx) => {
        if (typeof tx.getAll !== 'function') inconsistent();
        const path = 'adventures/' + adventureId,
          snapshot = await readWorkMetadata(tx, db.doc(path), [
            'ownerId',
            'schemaVersion',
            'deleting',
          ]),
          root = snapshot.data();
        if (!snapshot.exists || !root || root.ownerId !== uid || root.deleting)
          workFail('not-found', 'Aventura indisponível.');
        if (root.schemaVersion !== 1) inconsistent();
        const project = identity(snapshot),
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
            progress: identity(progress),
          });
        if (progress.exists && progress.data()?.schemaVersion !== 1) inconsistent();
        if (expected !== undefined && sourceToken !== expected)
          workFail(
            'failed-precondition',
            'A aventura mudou durante a captura. Faça um novo backup.',
            'adventure-backup-source-changed',
          );
        return { schemaVersion: 1, adventureId, sourceToken };
      });
    },
  };
}
