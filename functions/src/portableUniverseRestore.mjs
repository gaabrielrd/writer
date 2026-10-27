import { readWorkMetadata } from './workProgressContracts.mjs';
import { validatePortableUniverseOrigin } from './portableUniverseOrigin.mjs';

/** Observation only. Callers authorize the account and commit any native link separately. */
export async function inspectPortableRestoreUniverse(tx, db, uid, input) {
  const origin = validatePortableUniverseOrigin(input);
  if (origin.kind !== 'reference') return { origin, observed: origin.kind, universeId: null };
  const snapshot = await readWorkMetadata(tx, db.doc('universes/' + origin.id), [
      'authorId',
      'deleting',
    ]),
    record = snapshot.data();
  let available = false;
  if (record && record.authorId === uid && !record.deleting) {
    const created = snapshot.createTime;
    if (
      !Number.isSafeInteger(created?.seconds) ||
      created.seconds < 0 ||
      !Number.isInteger(created.nanoseconds) ||
      created.nanoseconds < 0 ||
      created.nanoseconds >= 1e9
    )
      throw new TypeError('Identidade nativa de universo inválida.');
    available =
      created.seconds === origin.created.seconds &&
      created.nanoseconds === origin.created.nanoseconds;
  }
  return {
    origin,
    observed: available ? 'available' : 'unavailable',
    universeId: available ? origin.id : null,
  };
}
