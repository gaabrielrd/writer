import { createHash } from 'node:crypto';
import { baseBodyKey } from './campaignBaseContracts.mjs';
import { campaignBackupBaseFields } from './campaignBackupBaseContent.mjs';
import { baseMasked, baseInconsistent, baseChanged } from './campaignBackupBaseContext.mjs';
import { CAMPAIGN_BASE_CHUNK_BYTES as CHUNK } from './campaignBackupBaseDefinitions.mjs';
import { digest } from './workProgressContracts.mjs';

/** Authorize before reading a field manifest; callers can compare the head token first. */
export async function campaignBackupBaseManifests(c, head) {
  if (head.availability !== 'available') return null;
  const read = await baseMasked(c.tx, c.db.doc(c.path + '/items/' + head.value.sourceKey), [
    'fields',
    'role',
  ]);
  if (digest(read.native) !== digest(head.native)) baseChanged();
  return campaignBackupBaseFields(
    c,
    { ...head.value, fields: read.value.fields, role: read.value.role },
    head,
  );
}
/** Caller must first prove an authorized owner and its manifest in this transaction. */
export async function readCampaignBackupBaseBody(c, manifest, index) {
  if (!Number.isSafeInteger(index) || index < 0 || index >= manifest.chunkCount) baseInconsistent();
  const id = baseBodyKey(manifest.bodySourceKey, manifest.field, index),
    ref = c.db.doc(c.path + '/bodies/' + id),
    head = await baseMasked(c.tx, ref, ['sourceKey', 'field', 'index']);
  if (
    !head.snapshot.exists ||
    head.value.sourceKey !== manifest.bodySourceKey ||
    head.value.field !== manifest.field ||
    head.value.index !== index
  )
    baseInconsistent();
  const body = await baseMasked(c.tx, ref, ['content']);
  if (digest(head.native) !== digest(body.native)) baseChanged();
  const value = body.value?.content;
  if (typeof value !== 'string') baseInconsistent();
  const bytes = Buffer.from(value, 'utf8');
  if (
    bytes.toString('utf8') !== value ||
    bytes.length > CHUNK ||
    (bytes.length === 0 && !(manifest.bytes === 0 && manifest.chunkCount === 1 && index === 0)) ||
    bytes.length > manifest.bytes
  )
    baseInconsistent();
  if (
    manifest.chunkCount === 1 &&
    (bytes.length !== manifest.bytes || digest(value) !== manifest.sha256)
  )
    baseInconsistent();
  const bodyToken = digest({
    version: 1,
    kind: 'campaign-backup-frozen-body',
    uid: c.uid,
    ...c.anchor,
    bodySourceKey: manifest.bodySourceKey,
    field: manifest.field,
    index,
    native: head.native,
  });
  return { bytes, bodyToken };
}
/** Incremental native verification of a bounded field; never concatenates its parts. */
export async function auditCampaignBackupBaseField(c, owner, manifest) {
  const content = createHash('sha256'),
    native = createHash('sha256');
  let bytes = 0;
  native.update(
    JSON.stringify([
      'writer-frozen-field-native-v1',
      c.anchor,
      owner.value.sourceKey,
      owner.itemToken,
      manifest,
    ]) + '\n',
  );
  for (let index = 0; index < manifest.chunkCount; index++) {
    const body = await readCampaignBackupBaseBody(c, manifest, index);
    bytes += body.bytes.length;
    if (!Number.isSafeInteger(bytes) || bytes > manifest.bytes) baseInconsistent();
    content.update(body.bytes);
    native.update(JSON.stringify([index, body.bodyToken]) + '\n');
  }
  const sha256 = content.digest('hex');
  if (bytes !== manifest.bytes || sha256 !== manifest.sha256) baseInconsistent();
  return {
    field: manifest.field,
    bodySourceKey: manifest.bodySourceKey,
    bytes,
    chunkCount: manifest.chunkCount,
    sha256,
    bodyProof: native.digest('hex'),
  };
}
