import { campaignBackupIdentity } from './campaignBackupSource.mjs';
import {
  readAdventureDeletionReservation,
  adventureDeletionReservationFields,
} from './adventureDeletionGuard.mjs';
import { adventureIdentityToken } from './campaignLoreOrigin.mjs';
import { digest, workFail } from './workProgressContracts.mjs';
const bad = () =>
  workFail(
    'failed-precondition',
    'A origem está inconsistente.',
    'campaign-backup-origin-inconsistent',
  );
const versions = (v, keys) => {
  for (const key of keys)
    if (Object.hasOwn(v, key) && (!Number.isSafeInteger(v[key]) || v[key] < 0)) bad();
};
const same = (a, b) => !!a && !!b && a.seconds === b.seconds && a.nanoseconds === b.nanoseconds;
const fact = (h) => ({ native: h.native, metadata: h.value ?? null });
function masked(tx) {
  if (typeof tx.getAll !== 'function') bad();
}
async function baseMasked(tx, ref, fieldMask) {
  const result = await tx.getAll(ref, { fieldMask }),
    snapshot = result?.[0];
  if (!Array.isArray(result) || result.length !== 1 || snapshot?.ref?.path !== ref.path)
    workFail(
      'failed-precondition',
      'O recurso congelado está inconsistente.',
      'campaign-backup-base-inconsistent',
    );
  return { snapshot, value: snapshot.data(), native: campaignBackupIdentity(snapshot) };
}
/** Witness must come from the authenticated file or its server-owned restored evidence. No prose or writes. */
export async function readCampaignSourceAccess(tx, db, uid, base, item) {
  masked(tx);
  const reservation = await readAdventureDeletionReservation(tx, db, base.adventure.id),
    reservationHead = await baseMasked(tx, reservation.ref, adventureDeletionReservationFields);
  if (digest(reservationHead.value ?? null) !== digest(reservation.record)) bad();
  const adventure = await baseMasked(tx, db.doc('adventures/' + base.adventure.id), [
      'schemaVersion',
      'ownerId',
      'deleting',
      'loreVersion',
    ]),
    facts = { reservation: fact(reservationHead), adventure: fact(adventure) };
  const allowed =
    reservation.record === null &&
    adventure.snapshot.exists &&
    adventure.value.ownerId === uid &&
    !adventure.value.deleting &&
    same(adventure.native?.created, base.adventure.born);
  if (allowed && adventure.value.schemaVersion !== 1) bad();
  if (allowed) versions(adventure.value, ['loreVersion']);
  if (!allowed)
    return {
      availability: 'unavailable',
      globalLore: base.universe.kind === 'none' ? 'none' : 'unavailable',
      proof: digest(facts),
    };
  let globalLore = base.universe.kind === 'none' ? 'none' : 'unavailable';
  if (base.universe.kind === 'reference') {
    const world = await baseMasked(tx, db.doc('universes/' + base.universe.id), [
      'authorId',
      'deleting',
      'loreVersion',
      'privacyVersion',
    ]);
    facts.world = fact(world);
    if (
      world.snapshot.exists &&
      world.value.authorId === uid &&
      !world.value.deleting &&
      same(world.native?.created, base.universe.born)
    ) {
      versions(world.value, ['loreVersion', 'privacyVersion']);
      globalLore = 'available';
    }
  }
  if (!item) return { availability: 'available', globalLore, proof: digest(facts) };
  const origin = item.origin;
  let available;
  if (origin.kind === 'adventure') available = true;
  else if (origin.kind === 'lore') {
    available = globalLore === 'available';
    if (available) {
      const ficha = await baseMasked(
        tx,
        db.doc('universes/' + origin.scopeId + '/lore/' + origin.entityId),
        ['deleted', 'deleting'],
      );
      facts.ficha = fact(ficha);
      available =
        ficha.snapshot.exists &&
        !ficha.value.deleted &&
        !ficha.value.deleting &&
        same(ficha.native?.created, origin.born);
    }
  } else {
    const ficha = await baseMasked(
        tx,
        db.doc('adventures/' + origin.adventureId + '/lore/' + origin.entityId),
        [
          'schemaVersion',
          'ownerId',
          'adventureId',
          'adventureToken',
          'entityId',
          'deleted',
          'deleting',
        ],
      ),
      v = ficha.value;
    facts.ficha = fact(ficha);
    available =
      ficha.snapshot.exists &&
      v.schemaVersion === 1 &&
      v.ownerId === uid &&
      v.adventureId === origin.adventureId &&
      v.adventureToken === adventureIdentityToken(uid, base.adventure.id, adventure.snapshot) &&
      v.entityId === origin.entityId &&
      v.deleted === false &&
      !v.deleting &&
      same(ficha.native?.created, origin.born);
  }
  return { availability: available ? 'available' : 'unavailable', proof: digest(facts) };
}
