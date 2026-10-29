import { baseMasked } from './campaignBackupBaseContext.mjs';
import { readCampaignAuthorization } from './campaignAuthorization.mjs';
import { digest, workFail } from './workProgressContracts.mjs';
const bad = () =>
  workFail(
    'failed-precondition',
    'A origem está inconsistente.',
    'campaign-backup-origin-inconsistent',
  );
export const originReviewChanged = () =>
  workFail(
    'failed-precondition',
    'As origens mudaram durante a revisão. Tente novamente.',
    'campaign-backup-origin-changed',
  );
const same = (a, b) => !!a && !!b && a.seconds === b.seconds && a.nanoseconds === b.nanoseconds;
const fact = (h) => ({ native: h.native, metadata: h.value ?? null });
function masked(tx) {
  if (typeof tx.getAll !== 'function') bad();
}
export async function campaignOriginClock(tx, db, uid, expected) {
  masked(tx);
  const auth = await readCampaignAuthorization(tx, db, uid),
    head = await baseMasked(tx, auth.ref, ['schemaVersion', 'ownerId', 'token', 'epoch']),
    token = digest({
      kind: 'campaign-origin-review-clock',
      uid,
      native: head.native,
      record: auth.record,
    });
  if (digest(head.value ?? null) !== digest(auth.record)) bad();
  if (expected !== undefined && token !== expected) originReviewChanged();
  return token;
}
import { readCampaignSourceAccess } from './campaignSourceAccess.mjs';
export { readCampaignSourceAccess as readCampaignOriginAccess } from './campaignSourceAccess.mjs';

/** Organizational link is independent of the captured adventure and its universe. */
export async function readCampaignOrganizationalUniverseAccess(tx, db, uid, universe) {
  masked(tx);
  if (universe.kind !== 'reference')
    return {
      availability: universe.kind === 'none' ? 'none' : 'unavailable',
      proof: digest(['exported-organizational-universe', universe]),
    };
  const world = await baseMasked(tx, db.doc('universes/' + universe.id), ['authorId', 'deleting']);
  return {
    availability:
      world.snapshot.exists &&
      world.value.authorId === uid &&
      !world.value.deleting &&
      same(world.native?.created, universe.born)
        ? 'available'
        : 'unavailable',
    proof: digest(fact(world)),
  };
}

/** All callers use the same account clock and metadata-only source readers. */
export async function readCampaignOriginWitnessAccess(tx, db, uid, clock, prepared, record) {
  await campaignOriginClock(tx, db, uid, clock);
  if (prepared.section === 'project')
    return readCampaignOrganizationalUniverseAccess(tx, db, uid, prepared.content.universe);
  return prepared.omission
    ? { availability: prepared.omission, proof: digest(['exported-omission', record]) }
    : readCampaignSourceAccess(tx, db, uid, prepared.base, prepared.item);
}
