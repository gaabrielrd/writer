import { digest, workClosed, workFail, workId } from './workProgressContracts.mjs';
import { assertCampaignNotDeleted } from './campaignDeletionGuard.mjs';
import { campaignIdentityToken } from './campaignIdentity.mjs';

const inconsistent = () =>
  workFail(
    'failed-precondition',
    'Não foi possível conferir os metadados da campanha.',
    'campaign-backup-source-inconsistent',
  );
const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const revision = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
const controls = [
  ['workProgress', ['schemaVersion']],
  ['noteState', []],
  ['sessionState', ['nextOrder']],
  ['preparationState', ['nextOrder']],
  ['loreVariantState', ['baseId']],
];
const controlFields = ['schemaVersion', 'ownerId', 'campaignId', 'campaignToken', 'revision'];

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
export function campaignBackupIdentity(snapshot) {
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
export function campaignBackupToken(value) {
  if (!hash(value)) workFail('invalid-argument', 'Token de captura inválido.');
  return value;
}
export function campaignBackupScope(db, uid, data, keys = ['expectedSourceToken']) {
  if (typeof uid !== 'string' || !uid) workFail('unauthenticated', 'Entre na sua conta.');
  workId(uid);
  workClosed(data, ['campaignId', ...keys]);
  const campaignId = workId(data.campaignId);
  let expected;
  if (Object.hasOwn(data, 'expectedSourceToken')) {
    expected = campaignBackupToken(data.expectedSourceToken);
  }
  return { db, uid, campaignId, expected, path: 'campaigns/' + campaignId };
}
async function metadata(tx, ref, fieldMask) {
  const snapshots = await tx.getAll(ref, { fieldMask });
  if (!Array.isArray(snapshots) || snapshots.length !== 1 || !snapshots[0]) inconsistent();
  return snapshots[0];
}
function validateControl(name, value, context, campaignToken) {
  if (value?.schemaVersion !== 1) inconsistent();
  if (name === 'workProgress') return;
  if (
    value.ownerId !== context.uid ||
    value.campaignId !== context.campaignId ||
    value.campaignToken !== campaignToken ||
    !revision(value.revision) ||
    (['sessionState', 'preparationState'].includes(name) && !revision(value.nextOrder, 1)) ||
    (name === 'loreVariantState' && !hash(value.baseId))
  )
    inconsistent();
}

/** Anchor only: per-item, per-session and authorized base proofs are separate. */
export async function readCampaignBackupSource(tx, context) {
  if (typeof tx.getAll !== 'function') inconsistent();
  const { db, uid, campaignId, path, expected } = context;
  await assertCampaignNotDeleted(tx, db, uid, campaignId);
  const snapshot = await metadata(tx, db.doc(path), [
      'ownerId',
      'schemaVersion',
      'deleting',
      'revision',
    ]),
    root = snapshot.data();
  if (!snapshot.exists || !root || root.ownerId !== uid || root.deleting)
    workFail('not-found', 'Campanha indisponível.');
  if (root.schemaVersion !== 1 || !revision(root.revision, 1)) inconsistent();
  const project = campaignBackupIdentity(snapshot),
    campaignToken = campaignIdentityToken(uid, campaignId, snapshot),
    controlIdentities = {};
  for (const [name, extraFields] of controls) {
    const current = await metadata(
      tx,
      db.doc(path + '/' + name + '/current'),
      name === 'workProgress' ? extraFields : [...controlFields, ...extraFields],
    );
    if (current.exists) validateControl(name, current.data(), context, campaignToken);
    controlIdentities[name] = campaignBackupIdentity(current);
  }
  const sourceToken = digest({
    version: 1,
    kind: 'campaign',
    scope: 'root-fixed-controls',
    uid,
    campaignId,
    project,
    controls: controlIdentities,
  });
  if (expected !== undefined && expected !== sourceToken)
    workFail(
      'failed-precondition',
      'A campanha mudou durante a captura. Faça um novo backup.',
      'campaign-backup-source-changed',
    );
  return { schemaVersion: 1, campaignId, sourceToken };
}
export function createCampaignBackupSourceService({ db }) {
  return {
    async getCampaignBackupSource(uid, data) {
      const context = campaignBackupScope(db, uid, data);
      return db.runTransaction((tx) => readCampaignBackupSource(tx, context));
    },
  };
}
