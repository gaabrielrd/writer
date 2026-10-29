const encoder = new TextEncoder(),
  decoder = new TextDecoder('utf-8', { fatal: true });
const bad = () => {
  throw new TypeError('Manifesto portátil de campanha inválido.');
};
export const CAMPAIGN_ATTESTATION_DOMAIN = 'writer-private-campaign-backup-v1';
export const closedCampaignRecord = (v, keys) =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).length === keys.length &&
  Object.keys(v).every((k) => keys.includes(k));
const hash = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const count = (v) => Number.isSafeInteger(v) && v >= 0;
export function campaignManifestId(v) {
  if (
    typeof v !== 'string' ||
    !v ||
    v.length > 1500 ||
    v.includes('/') ||
    ['.', '..'].includes(v) ||
    encoder.encode(v).length > 1500 ||
    decoder.decode(encoder.encode(v)) !== v
  )
    bad();
  return v;
}
function totals(v, keys) {
  if (
    !closedCampaignRecord(v, [...keys, 'digest']) ||
    !hash(v.digest) ||
    keys.some((k) => !count(v[k]))
  )
    bad();
  return Object.freeze(Object.fromEntries([...keys.map((k) => [k, v[k]]), ['digest', v.digest]]));
}
/** Deterministic closed JSON projection; not a file-content or access validator. */
export function validatePortableCampaignManifest(v) {
  if (
    !closedCampaignRecord(v, [
      'schemaVersion',
      'kind',
      'contentVersion',
      'provenanceVersion',
      'ownerBinding',
      'originCampaignId',
      'availability',
      'issuedAt',
      'content',
      'provenance',
    ]) ||
    v.schemaVersion !== 1 ||
    v.kind !== 'writer-campaign' ||
    v.contentVersion !== 1 ||
    v.provenanceVersion !== 1 ||
    !hash(v.ownerBinding) ||
    !['none', 'available', 'unavailable'].includes(v.availability) ||
    !count(v.issuedAt) ||
    v.issuedAt > 8640000000000000
  )
    bad();
  const content = totals(v.content, ['units', 'bytes', 'chunks', 'omitted', 'unavailable']),
    provenance = totals(v.provenance, ['units', 'bytes']);
  if (
    content.units < 3 ||
    provenance.units < 1 ||
    content.omitted + content.unavailable > content.units ||
    content.chunks > content.bytes
  )
    bad();
  return Object.freeze({
    schemaVersion: 1,
    kind: 'writer-campaign',
    contentVersion: 1,
    provenanceVersion: 1,
    ownerBinding: v.ownerBinding,
    originCampaignId: campaignManifestId(v.originCampaignId),
    availability: v.availability,
    issuedAt: v.issuedAt,
    content,
    provenance,
  });
}
export function validateCampaignAttestation(v) {
  if (
    !closedCampaignRecord(v, ['schemaVersion', 'algorithm', 'keyId', 'signature']) ||
    v.schemaVersion !== 1 ||
    v.algorithm !== 'Ed25519' ||
    typeof v.keyId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(v.keyId) ||
    typeof v.signature !== 'string' ||
    !/^[A-Za-z0-9_-]{86}$/.test(v.signature)
  )
    bad();
  return Object.freeze({
    schemaVersion: 1,
    algorithm: 'Ed25519',
    keyId: v.keyId,
    signature: v.signature,
  });
}
