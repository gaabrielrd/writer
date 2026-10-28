import { adventureIdentityToken } from './campaignLoreOrigin.mjs';
import { readAdventureDeletionReservation } from './adventureDeletionGuard.mjs';
import {
  digest,
  readWorkMetadata,
  workClosed,
  workFail,
  workId,
} from './workProgressContracts.mjs';

export const ADVENTURE_DELETION_ROOT_FIELDS = Object.freeze([
  'ownerId',
  'schemaVersion',
  'revision',
  'title',
  'universeId',
  'deleting',
  'deletionId',
  'updatedAt',
]);
const inconsistent = () =>
  workFail(
    'failed-precondition',
    'A origem da exclusão está inconsistente.',
    'adventure-deletion-source-inconsistent',
  );
function stamp(value) {
  if (
    !value ||
    !Number.isSafeInteger(value.seconds) ||
    value.seconds < 0 ||
    !Number.isSafeInteger(value.nanoseconds) ||
    value.nanoseconds < 0 ||
    value.nanoseconds >= 1e9
  )
    inconsistent();
  return { seconds: value.seconds, nanoseconds: value.nanoseconds };
}
function nativeIdentity(snapshot) {
  if (!snapshot.exists) return null;
  const created = stamp(snapshot.createTime),
    updated = stamp(snapshot.updateTime);
  if (
    updated.seconds < created.seconds ||
    (updated.seconds === created.seconds && updated.nanoseconds < created.nanoseconds)
  )
    inconsistent();
  return { created, updated };
}
export async function readAdventureDeletionSource(tx, db, uid, adventureId) {
  if (typeof tx.getAll !== 'function') inconsistent();
  const reservation = await readAdventureDeletionReservation(tx, db, adventureId);
  if (reservation.record) return null;
  const ref = db.doc('adventures/' + adventureId),
    snapshot = await readWorkMetadata(tx, ref, ADVENTURE_DELETION_ROOT_FIELDS),
    root = snapshot.data();
  if (!snapshot.exists || !root || root.ownerId !== uid || root.deleting) return null;
  if (
    root.schemaVersion !== 1 ||
    !Number.isSafeInteger(root.revision) ||
    root.revision < 1 ||
    typeof root.title !== 'string' ||
    !root.title.trim() ||
    root.title.length > 300 ||
    !root.title.isWellFormed()
  )
    inconsistent();
  const project = nativeIdentity(snapshot),
    progress = await readWorkMetadata(tx, db.doc(ref.path + '/workProgress/current'), [
      'schemaVersion',
    ]);
  if (progress.exists && progress.data()?.schemaVersion !== 1) inconsistent();
  const source = {
    schemaVersion: 1,
    ownerId: uid,
    adventureId,
    adventureToken: adventureIdentityToken(uid, adventureId, snapshot),
    sourceToken: digest({
      schemaVersion: 1,
      kind: 'adventure-deletion-source',
      ownerId: uid,
      adventureId,
      project,
      progress: nativeIdentity(progress),
    }),
    revision: root.revision,
    title: root.title,
  };
  return { source, ref, snapshot, root };
}
export function createAdventureDeletionSourceService({ db }) {
  return {
    async getAdventureDeletionSource(uid, data) {
      if (!uid) workFail('unauthenticated', 'Entre na sua conta.');
      workId(uid);
      workClosed(data, ['adventureId']);
      const adventureId = workId(data.adventureId);
      return db.runTransaction(
        async (tx) => (await readAdventureDeletionSource(tx, db, uid, adventureId))?.source ?? null,
      );
    },
  };
}
