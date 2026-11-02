import {
  campaignBackupScope,
  campaignBackupToken,
  campaignBackupIdentity,
  readCampaignBackupSource,
} from './campaignBackupSource.mjs';
import { readCampaignBackupOwnItem } from './campaignBackupInventory.mjs';
import {
  CAMPAIGN_OWN_CHUNK_BYTES,
  CAMPAIGN_OWN_FIELDS,
  serializeCampaignBackupOwnContent,
} from './campaignBackupOwnContent.mjs';
import { digest, workFail, workId } from './workProgressContracts.mjs';

const invalid = () => workFail('invalid-argument', 'Pedido de conteúdo próprio inválido.');
const inconsistent = () =>
  workFail(
    'failed-precondition',
    'O conteúdo próprio está inconsistente.',
    'campaign-backup-content-inconsistent',
  );
const changed = () =>
  workFail(
    'failed-precondition',
    'O recurso mudou. Reinicie a captura.',
    'campaign-backup-item-changed',
  );
const controls = ['session-reference-state', 'session-preparation-state'];
function input(db, uid, data) {
  const context = campaignBackupScope(db, uid, data, [
    'sourceToken',
    'kind',
    'id',
    'itemToken',
    'index',
  ]);
  if (
    typeof data.kind !== 'string' ||
    !(Object.hasOwn(CAMPAIGN_OWN_FIELDS, data.kind) || controls.includes(data.kind))
  )
    invalid();
  const kind = data.kind,
    id = workId(data.id),
    expected = campaignBackupToken(data.sourceToken),
    itemExpected = campaignBackupToken(data.itemToken),
    index = data.index;
  if (
    !Number.isSafeInteger(index) ||
    index < 0 ||
    (kind === 'campaign' && id !== context.campaignId) ||
    (kind === 'progress' && id !== 'current') ||
    (['campaign', 'progress'].includes(kind) && itemExpected !== expected)
  )
    invalid();
  return { ...context, kind, id, expected, itemExpected, index };
}
async function masked(tx, ref, fields) {
  const snapshots = await tx.getAll(ref, { fieldMask: fields }),
    snapshot = snapshots?.[0];
  if (!Array.isArray(snapshots) || snapshots.length !== 1 || snapshot?.ref?.path !== ref.path)
    inconsistent();
  return snapshot;
}
export function createCampaignBackupOwnReadService({ db }) {
  return {
    async readCampaignBackupOwnContent(uid, data) {
      const context = input(db, uid, data);
      return db.runTransaction(async (tx) => {
        const c = context;
        let source,
          itemToken = c.itemExpected,
          ref,
          observed,
          omission = null;
        if (['campaign', 'progress'].includes(c.kind)) {
          source = await readCampaignBackupSource(tx, c);
          ref = db.doc(c.kind === 'campaign' ? c.path : c.path + '/workProgress/current');
          observed = await masked(tx, ref, c.kind === 'campaign' ? ['ownerId'] : ['schemaVersion']);
          if (c.kind === 'campaign' && (!observed.exists || observed.data()?.ownerId !== uid))
            changed();
          if (c.kind === 'progress' && observed.exists && observed.data()?.schemaVersion !== 1)
            inconsistent();
        } else {
          const item = await readCampaignBackupOwnItem(tx, c, c.kind, c.id, c.itemExpected);
          source = item.source;
          itemToken = item.entry.itemToken;
          ref = item.ref;
          observed = item.snapshot;
          omission = item.omission;
        }
        const observedIdentity = campaignBackupIdentity(observed),
          envelope = { ...source, kind: c.kind, id: c.id, itemToken };
        if (omission !== null) {
          if (c.index !== 0) invalid();
          return { ...envelope, outcome: 'omitted', reason: omission };
        }
        const snapshot = await masked(tx, ref, CAMPAIGN_OWN_FIELDS[c.kind]);
        if (digest(campaignBackupIdentity(snapshot)) !== digest(observedIdentity)) changed();
        if (!snapshot.exists && c.kind !== 'progress') changed();
        let encoded;
        try {
          encoded = serializeCampaignBackupOwnContent(
            c.kind,
            c.id,
            snapshot.data(),
            snapshot.exists,
          );
        } catch (error) {
          if (error instanceof TypeError) inconsistent();
          throw error;
        }
        const byteLength = encoded.bytes.length,
          chunkCount = Math.ceil(byteLength / CAMPAIGN_OWN_CHUNK_BYTES);
        if (c.index >= chunkCount) invalid();
        return {
          ...envelope,
          outcome: 'chunk',
          index: c.index,
          byteLength,
          chunkCount,
          contentHash: digest(encoded.json),
          chunkBase64: encoded.bytes
            .subarray(c.index * CAMPAIGN_OWN_CHUNK_BYTES, (c.index + 1) * CAMPAIGN_OWN_CHUNK_BYTES)
            .toString('base64'),
        };
      });
    },
  };
}
