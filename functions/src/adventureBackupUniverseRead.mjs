import { digest, workFail, readWorkMetadata } from './workProgressContracts.mjs';
import {
  adventureBackupScope,
  adventureBackupToken as token,
  adventureBackupIdentity as identity,
  readAdventureBackupSource,
} from './adventureBackupSource.mjs';
import { validatePortableUniverseOrigin } from './portableUniverseOrigin.mjs';
const bad = () =>
  workFail('failed-precondition', 'O vínculo do universo da aventura está inconsistente.');
export function createAdventureBackupUniverseService({ db }) {
  return {
    async getAdventureBackupUniverse(uid, data) {
      const context = adventureBackupScope(db, uid, data, ['sourceToken', 'expectedUniverseToken']),
        sourceToken = token(data.sourceToken),
        expected = Object.hasOwn(data, 'expectedUniverseToken')
          ? token(data.expectedUniverseToken)
          : undefined;
      return db.runTransaction(async (tx) => {
        const current = await readAdventureBackupSource(tx, context, sourceToken),
          snapshot = await readWorkMetadata(tx, context.ref, [
            'ownerId',
            'schemaVersion',
            'deleting',
            'universeId',
          ]),
          root = snapshot.data();
        if (!root || root.ownerId !== uid || root.schemaVersion !== 1 || root.deleting) bad();
        const id = root.universeId ?? null;
        let origin = { kind: 'none' },
          native = null;
        if (id !== null) {
          try {
            origin = validatePortableUniverseOrigin({ kind: 'unavailable', id });
          } catch {
            bad();
          }
          const world = await readWorkMetadata(tx, db.doc('universes/' + id), [
              'authorId',
              'deleting',
            ]),
            value = world.data();
          if (value && value.authorId === uid && !value.deleting) {
            native = identity(world);
            origin = validatePortableUniverseOrigin({
              kind: 'reference',
              id,
              created: native.created,
            });
          }
        }
        const universeToken = digest({
          version: 1,
          kind: 'adventure-universe-origin',
          uid,
          adventureId: context.adventureId,
          sourceToken,
          origin,
          native,
        });
        if (expected !== undefined && universeToken !== expected)
          workFail(
            'failed-precondition',
            'A origem do universo mudou durante a captura.',
            'adventure-backup-universe-changed',
          );
        return { ...current.result, origin, universeToken };
      });
    },
  };
}
