import { digest, workFail, readWorkMetadata } from './workProgressContracts.mjs';
import {
  bookBackupScope,
  bookBackupToken,
  bookBackupIdentity,
  readBookBackupSource,
} from './bookBackupContext.mjs';
import { validateBookBackupUniverseOrigin } from './bookBackupUniverse.mjs';
export function createBookBackupUniverseService({ db }) {
  return {
    async getBookBackupUniverse(uid, data) {
      const context = bookBackupScope(db, uid, data, ['sourceToken', 'expectedUniverseToken']),
        sourceToken = bookBackupToken(data.sourceToken),
        expected = Object.hasOwn(data, 'expectedUniverseToken')
          ? bookBackupToken(data.expectedUniverseToken)
          : undefined;
      return db.runTransaction(async (tx) => {
        const current = await readBookBackupSource(tx, context, sourceToken),
          id = current.root.universeId ?? null;
        let origin = { kind: 'none' },
          native = null;
        if (id !== null) {
          try {
            origin = validateBookBackupUniverseOrigin({ kind: 'unavailable', id });
          } catch {
            workFail('failed-precondition', 'O vínculo de universo do livro está inconsistente.');
          }
          const snapshot = await readWorkMetadata(tx, db.doc('universes/' + id), [
              'authorId',
              'deleting',
            ]),
            record = snapshot.data();
          if (record && record.authorId === uid && !record.deleting) {
            native = bookBackupIdentity(snapshot);
            origin = validateBookBackupUniverseOrigin({
              kind: 'reference',
              id,
              created: native.created,
            });
          }
        }
        const universeToken = digest({
          version: 1,
          uid,
          bookId: context.target.id,
          sourceToken,
          origin,
          native,
        });
        if (expected !== undefined && universeToken !== expected)
          workFail(
            'failed-precondition',
            'A origem de universo mudou durante a captura. Faça um novo backup.',
            'book-backup-universe-changed',
          );
        return { ...current.result, origin, universeToken };
      });
    },
  };
}
