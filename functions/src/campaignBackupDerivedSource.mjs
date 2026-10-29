import {
  campaignBackupScope,
  campaignBackupToken,
  campaignBackupIdentity,
  readCampaignBackupSource,
} from './campaignBackupSource.mjs';
import { readRestoredCampaignBaseAccess } from './campaignRestoredSource.mjs';
import { campaignIdentityToken } from './campaignIdentity.mjs';
import { readAdventureDeletionReservation } from './adventureDeletionGuard.mjs';
import { readCampaignAuthorization } from './campaignAuthorization.mjs';
import { loreGuardPath, loreGenerationPath } from './campaignLoreStorage.mjs';
import { basePath } from './campaignBaseContracts.mjs';
import { digest, workFail, workId } from './workProgressContracts.mjs';

const inconsistent = () =>
  workFail(
    'failed-precondition',
    'A origem ou os controles da base estão inconsistentes.',
    'campaign-backup-derived-source-inconsistent',
  );
const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const safe = (value) => Number.isSafeInteger(value) && value >= 0;
const storedId = (value) => {
  try {
    return workId(value);
  } catch {
    inconsistent();
  }
};
const fields = ['schemaVersion', 'ownerId', 'campaignId', 'campaignToken'];
const revisionFields = [...fields, 'baseId', 'revision'];
const rootFields = [
  'ownerId',
  'schemaVersion',
  'deleting',
  'revision',
  'provenance.kind',
  'provenance.baseId',
  'provenance.adventureId',
  'activeBaseId',
  'activeLoreGenerationId',
];
async function metadata(tx, ref, fieldMask) {
  if (typeof tx.getAll !== 'function') inconsistent();
  const snapshots = await tx.getAll(ref, { fieldMask }),
    snapshot = snapshots?.[0];
  if (!Array.isArray(snapshots) || snapshots.length !== 1 || snapshot?.ref?.path !== ref.path)
    inconsistent();
  return { snapshot, value: snapshot.data(), native: campaignBackupIdentity(snapshot) };
}
const bornBefore = (a, b) =>
  a.seconds < b.seconds || (a.seconds === b.seconds && a.nanoseconds <= b.nanoseconds);
function own(value, context, campaignToken) {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    value.ownerId !== context.uid ||
    value.campaignId !== context.campaignId ||
    value.campaignToken !== campaignToken
  )
    inconsistent();
}
function version(value, key) {
  if (Object.hasOwn(value, key) && !safe(value[key])) inconsistent();
  return value[key] ?? null;
}
function input(db, uid, data) {
  const context = campaignBackupScope(db, uid, data, ['sourceToken', 'expectedDerivedToken']),
    expected = campaignBackupToken(data.sourceToken),
    derivedExpected = Object.hasOwn(data, 'expectedDerivedToken')
      ? campaignBackupToken(data.expectedDerivedToken)
      : undefined;
  return { ...context, expected, derivedExpected };
}
/** Metadata-only origin gate. This is neither a complete inventory nor portable provenance. */
export async function readCampaignBackupDerivedSource(tx, context) {
  const { db, uid, campaignId, path } = context,
    source = await readCampaignBackupSource(tx, context),
    root = await metadata(tx, db.doc(path), rootFields);
  if (!root.snapshot.exists || root.value?.ownerId !== uid || root.value.deleting)
    workFail('not-found', 'Campanha indisponível.');
  const campaignToken = campaignIdentityToken(uid, campaignId, root.snapshot),
    state = await metadata(tx, db.doc(path + '/loreVariantState/current'), revisionFields),
    facts = { root: root.native, variants: state.native };
  const finish = (availability, base, dependencies = {}) => {
    const derivedToken = digest({
      version: 1,
      kind: 'campaign-backup-derived-metadata',
      uid,
      campaignId,
      sourceToken: source.sourceToken,
      availability,
      base,
      facts,
      dependencies,
    });
    if (context.derivedExpected !== undefined && context.derivedExpected !== derivedToken)
      workFail(
        'failed-precondition',
        'A origem autorizada mudou. Reinicie a captura.',
        'campaign-backup-derived-source-changed',
      );
    return { ...source, availability, derivedToken, base };
  };
  if (root.value.provenance?.kind === 'independent') {
    if (
      root.value.activeBaseId != null ||
      Object.hasOwn(root.value, 'activeLoreGenerationId') ||
      state.snapshot.exists
    )
      inconsistent();
    return finish('none', null);
  }
  if (
    root.value.provenance?.kind !== 'original' ||
    !hash(root.value.activeBaseId) ||
    root.value.provenance.baseId !== root.value.activeBaseId
  )
    inconsistent();
  const adventureId = storedId(root.value.provenance.adventureId),
    baseId = root.value.activeBaseId;
  if (state.snapshot.exists) {
    own(state.value, context, campaignToken);
    if (state.value.baseId !== baseId || !safe(state.value.revision)) inconsistent();
  }
  const guard = await metadata(tx, db.doc(loreGuardPath(uid, campaignId, campaignToken)), [
    ...fields,
    'admissionEpoch',
    'adoptionId',
  ]);
  if (guard.snapshot.exists) {
    own(guard.value, context, campaignToken);
    if (!safe(guard.value.admissionEpoch)) inconsistent();
    if (guard.value.adoptionId != null) {
      storedId(guard.value.adoptionId);
      workFail(
        'failed-precondition',
        'Encerre a adoção em preparação antes do backup.',
        'adoption-in-progress',
      );
    }
  }
  const captured = await metadata(tx, db.doc(basePath(uid, baseId)), [
    'schemaVersion',
    'id',
    'ownerId',
    'campaignId',
    'adventureId',
    'universeId',
    'sourceToken',
    'state',
    'capturedAt',
    'sourceMode',
    'sourceEvidence',
  ]);
  const dependencies = { guard: guard.native, base: captured.native };
  if (!captured.snapshot.exists) return finish('unavailable', null, dependencies);
  const base = captured.value;
  if (
    !base ||
    base.schemaVersion !== 1 ||
    base.id !== baseId ||
    base.ownerId !== uid ||
    base.campaignId !== campaignId ||
    base.adventureId !== adventureId ||
    base.state !== 'ready' ||
    !hash(base.sourceToken) ||
    !Number.isFinite(base.capturedAt) ||
    base.capturedAt < 0 ||
    base.capturedAt > 8640000000000000
  )
    inconsistent();
  const restoredAccess = await readRestoredCampaignBaseAccess(tx, db, uid, base);
  if (restoredAccess) {
    dependencies.restoredSourceProof = digest(restoredAccess);
    if (restoredAccess.availability !== 'available')
      return finish('unavailable', null, dependencies);
  }
  const universeId = base.universeId == null ? null : storedId(base.universeId),
    reservation = await readAdventureDeletionReservation(tx, db, adventureId);
  if (reservation.record) return finish('unavailable', null, { ...dependencies, retired: true });
  const adventure = await metadata(tx, db.doc('adventures/' + adventureId), [
    'ownerId',
    'schemaVersion',
    'deleting',
    'loreVersion',
  ]);
  if (
    !adventure.snapshot.exists ||
    adventure.value?.ownerId !== uid ||
    adventure.value?.deleting ||
    (!restoredAccess && !bornBefore(adventure.native.created, captured.native.created))
  )
    return finish('unavailable', null, {
      ...dependencies,
      adventure: adventure.native?.created ?? null,
    });
  if (adventure.value.schemaVersion !== 1) inconsistent();
  const authorization = await readCampaignAuthorization(tx, db, uid),
    authorizationHead = await metadata(tx, authorization.ref, ['schemaVersion']);
  let generation = null;
  if (Object.hasOwn(root.value, 'activeLoreGenerationId')) {
    const generationId = root.value.activeLoreGenerationId;
    if (!hash(generationId)) inconsistent();
    generation = await metadata(tx, db.doc(loreGenerationPath(campaignId, generationId)), [
      ...fields,
      'id',
      'baseId',
      'state',
    ]);
    own(generation.value, context, campaignToken);
    if (
      !generation.snapshot.exists ||
      generation.value.id !== generationId ||
      generation.value.baseId !== baseId ||
      generation.value.state !== 'ready'
    )
      inconsistent();
  }
  let globalLore = 'none',
    worldFacts = null;
  if (universeId !== null) {
    const world = await metadata(tx, db.doc('universes/' + universeId), [
      'authorId',
      'deleting',
      'loreVersion',
      'privacyVersion',
    ]);
    const available =
      world.snapshot.exists &&
      world.value?.authorId === uid &&
      !world.value.deleting &&
      (restoredAccess
        ? restoredAccess.globalLore === 'available'
        : bornBefore(world.native.created, captured.native.created));
    globalLore = available ? 'available' : 'unavailable';
    worldFacts = {
      born: world.native?.created ?? null,
      available,
      ...(available
        ? {
            loreVersion: version(world.value, 'loreVersion'),
            privacyVersion: version(world.value, 'privacyVersion'),
          }
        : {}),
    };
  }
  return finish(
    'available',
    { id: baseId, capturedAt: base.capturedAt, globalLore },
    {
      ...dependencies,
      originalSourceToken: base.sourceToken,
      adventure: {
        born: adventure.native.created,
        loreVersion: version(adventure.value, 'loreVersion'),
      },
      universeId,
      world: worldFacts,
      generation: generation?.native ?? null,
      authorization: { record: authorization.record, native: authorizationHead.native },
    },
  );
}
export function createCampaignBackupDerivedSourceService({ db }) {
  return {
    async getCampaignBackupDerivedSource(uid, data) {
      const context = input(db, uid, data);
      return db.runTransaction((tx) => readCampaignBackupDerivedSource(tx, context));
    },
  };
}
