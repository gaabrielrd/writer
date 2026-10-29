import {
  KeyObject,
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from 'node:crypto';
import { createCampaignBackupAuditService } from './campaignBackupAudit.mjs';
import { workId, workFail } from './workProgressContracts.mjs';
import {
  CAMPAIGN_ATTESTATION_DOMAIN,
  closedCampaignRecord,
  validatePortableCampaignManifest,
  validateCampaignAttestation,
} from './portableCampaignManifest.mjs';
const bad = () =>
  workFail(
    'failed-precondition',
    'Não foi possível conferir a procedência do backup.',
    'campaign-backup-invalid-attestation',
  );
const setup = () => {
  throw new TypeError('Configuração de assinatura de campanha inválida.');
};
export const campaignBackupOwnerBinding = (uid) =>
  createHash('sha256')
    .update(JSON.stringify(['writer-campaign-backup-owner-v1', workId(uid)]))
    .digest('hex');
const clock = (now) => {
  const t = now();
  if (!Number.isSafeInteger(t) || t < 0 || t > 8640000000000000) setup();
  return t;
};
function keyring(source) {
  const getter = typeof source === 'function' ? source : () => source;
  return () => {
    const list = getter();
    if (!Array.isArray(list)) setup();
    const map = new Map();
    for (const v of list) {
      if (
        !v ||
        typeof v.id !== 'string' ||
        !/^[A-Za-z0-9_-]{1,64}$/.test(v.id) ||
        map.has(v.id) ||
        !['active', 'verify-only', 'revoked'].includes(v.state)
      )
        setup();
      let key;
      try {
        key = v.publicKey instanceof KeyObject ? v.publicKey : createPublicKey(v.publicKey);
      } catch {
        setup();
      }
      if (key.type !== 'public' || key.asymmetricKeyType !== 'ed25519') setup();
      map.set(v.id, { id: v.id, state: v.state, key });
    }
    return map;
  };
}
const payload = (keyId, manifest) =>
  Buffer.from(
    CAMPAIGN_ATTESTATION_DOMAIN +
      '\0' +
      JSON.stringify({ schemaVersion: 1, algorithm: 'Ed25519', keyId, manifest }),
  );
export function createCampaignBackupAttestationVerifier({ keys, now = Date.now }) {
  const current = keyring(keys),
    time = now;
  return {
    verifyCampaignBackupAttestation(uid, data) {
      const owner = campaignBackupOwnerBinding(uid);
      let manifest, attestation;
      try {
        if (!closedCampaignRecord(data, ['manifest', 'attestation'])) bad();
        manifest = validatePortableCampaignManifest(data.manifest);
        attestation = validateCampaignAttestation(data.attestation);
      } catch {
        bad();
      }
      if (manifest.ownerBinding !== owner || manifest.issuedAt > clock(time) + 300000) bad();
      const record = current().get(attestation.keyId);
      if (!record || record.state === 'revoked') bad();
      const signature = Buffer.from(attestation.signature, 'base64url');
      if (
        signature.length !== 64 ||
        signature.toString('base64url') !== attestation.signature ||
        !verify(null, payload(record.id, manifest), record.key, signature)
      )
        bad();
      return Object.freeze({ validation: 'campaign-issuance-only', manifest });
    },
  };
}
/** Private key must be injected by the server. The request never supplies content roots or keys. */
export function createCampaignBackupAttestationService({
  db,
  storage,
  keys,
  keyId,
  privateKey,
  now = Date.now,
}) {
  const current = keyring(keys),
    time = now;
  let signing;
  try {
    signing = privateKey instanceof KeyObject ? privateKey : createPrivateKey(privateKey);
  } catch {
    setup();
  }
  if (signing.type !== 'private' || signing.asymmetricKeyType !== 'ed25519') setup();
  const publicBytes = createPublicKey(signing).export({ type: 'spki', format: 'der' }),
    checkKey = () => {
      const record = current().get(keyId);
      if (
        !record ||
        record.state !== 'active' ||
        !record.key.export({ type: 'spki', format: 'der' }).equals(publicBytes)
      )
        setup();
      return record;
    },
    audit = createCampaignBackupAuditService({ db, storage });
  checkKey();
  return {
    async issueCampaignBackupAttestation(uid, data, options = {}) {
      const iterator = audit.auditCampaignBackup(uid, data, {
          signal: options.signal,
          onRecord: options.onRecord,
        }),
        signal = options.signal,
        progress = options.onProgress;
      if (progress !== undefined && typeof progress !== 'function') setup();
      checkKey();
      try {
        let proof;
        for (;;) {
          signal?.throwIfAborted();
          const next = await iterator.next();
          signal?.throwIfAborted();
          if (next.done) {
            proof = next.value;
            break;
          }
          if (progress) await progress(next.value);
        }
        if (proof?.validation !== 'campaign-native-audit') bad();
        const record = checkKey(),
          manifest = validatePortableCampaignManifest({
            schemaVersion: 1,
            kind: 'writer-campaign',
            contentVersion: 1,
            provenanceVersion: 2,
            ownerBinding: campaignBackupOwnerBinding(uid),
            originCampaignId: proof.campaignId,
            availability: proof.availability,
            issuedAt: clock(time),
            content: proof.content,
            provenance: proof.provenance,
          });
        signal?.throwIfAborted();
        const signature = sign(null, payload(record.id, manifest), signing).toString('base64url');
        return Object.freeze({
          manifest,
          attestation: Object.freeze({
            schemaVersion: 1,
            algorithm: 'Ed25519',
            keyId: record.id,
            signature,
          }),
        });
      } finally {
        await iterator.return();
      }
    },
  };
}
