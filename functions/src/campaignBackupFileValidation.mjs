import { createHash } from 'node:crypto';
import { workId, workFail } from './workProgressContracts.mjs';
import { readCampaignBackupFrame } from './campaignBackupContainer.mjs';
import { createCampaignBackupAttestationVerifier } from './campaignBackupAttestation.mjs';
import {
  closedCampaignRecord,
  validatePortableCampaignManifest,
  validateCampaignAttestation,
} from './portableCampaignManifest.mjs';
import {
  campaignFileBad as bad,
  campaignFileJson,
  campaignFileHeader,
  campaignFileUnit,
  campaignFileWitness,
} from './campaignBackupFileRecords.mjs';
const add = (v, n = 1) => {
  const r = v + n;
  if (!Number.isSafeInteger(r) || r < 0) bad();
  return r;
};
/** Full bytes/roots/issuance only. Current origin access and restoration remain separate. */
export async function validateCampaignBackupFile(
  uid,
  source,
  { keys, now = Date.now, signal, onProgress } = {},
) {
  if (typeof uid !== 'string' || !uid) workFail('unauthenticated', 'Entre na sua conta.');
  workId(uid);
  if (onProgress !== undefined && typeof onProgress !== 'function')
    throw new TypeError('Progresso de validação inválido.');
  if (
    !source ||
    typeof source.read !== 'function' ||
    !Number.isSafeInteger(source.size) ||
    source.size < 16
  )
    bad();
  const size = source.size,
    read = source.read.bind(source),
    input = {
      get size() {
        if (source.size !== size) bad();
        return size;
      },
      read,
    },
    verifier = createCampaignBackupAttestationVerifier({ keys, now }),
    content = createHash('sha256'),
    provenance = createHash('sha256'),
    fold = (hash, v) => hash.update(JSON.stringify(v) + '\n');
  let cursor = null,
    header = null,
    packet = null,
    active = null,
    units = 0,
    bytes = 0,
    chunks = 0,
    omitted = 0,
    unavailable = 0,
    witnesses = 0,
    witnessBytes = 0;
  try {
    for (;;) {
      signal?.throwIfAborted();
      const step = await readCampaignBackupFrame(input, cursor, { signal });
      signal?.throwIfAborted();
      cursor = step.cursor;
      if (step.seal) {
        if (!packet || active) bad();
        const verified = verifier.verifyCampaignBackupAttestation(uid, packet),
          m = verified.manifest,
          actual = { units, bytes, chunks, omitted, unavailable, digest: content.digest('hex') },
          origins = { units: witnesses, bytes: witnessBytes, digest: provenance.digest('hex') };
        if (
          m.originCampaignId !== header.originCampaignId ||
          m.availability !== header.availability ||
          JSON.stringify(m.content) !== JSON.stringify(actual) ||
          JSON.stringify(m.provenance) !== JSON.stringify(origins)
        )
          bad();
        signal?.throwIfAborted();
        return Object.freeze({
          validation: 'campaign-file-integrity-only',
          manifest: m,
          seal: Object.freeze(step.seal),
        });
      }
      const r = step.record;
      if (packet) bad();
      if (!header) {
        if (r.kind !== 'campaign' || r.id !== 'header' || r.part !== 0) bad();
        header = campaignFileJson(r.payload, campaignFileHeader);
        fold(content, [
          'writer-campaign-logical-units-v1',
          header.originCampaignId,
          header.availability,
        ]);
        fold(provenance, ['writer-campaign-witnesses-v1', header.originCampaignId]);
      } else if (active) {
        if (
          r.kind !== 'data' ||
          r.id !== active.id ||
          r.part !== active.index ||
          r.payload.length !== Math.min(65536, active.unit.byteLength - active.bytes)
        )
          bad();
        if (
          active.unit.section === 'image' &&
          r.part === 0 &&
          Buffer.from(r.payload.subarray(0, 8)).toString('hex') !== '89504e470d0a1a0a'
        )
          bad();
        active.hash.update(r.payload);
        active.bytes = add(active.bytes, r.payload.length);
        active.index++;
        if (active.index === active.unit.chunkCount) {
          const digest = active.hash.digest('hex');
          active.hash.destroy();
          if (active.bytes !== active.unit.byteLength || digest !== active.unit.contentHash) bad();
          active = null;
        }
      } else if (r.kind === 'unit') {
        if (r.id !== String(units) || r.part !== 0) bad();
        const unit = campaignFileJson(r.payload, campaignFileUnit);
        if (unit.section === 'own:campaign' && unit.id !== header.originCampaignId) bad();
        if (unit.section === 'own:progress' && unit.id !== 'current') bad();
        units = add(units);
        bytes = add(bytes, unit.byteLength ?? 0);
        chunks = add(chunks, unit.chunkCount ?? 0);
        if (unit.outcome === 'omitted') omitted = add(omitted);
        if (unit.outcome === 'unavailable') unavailable = add(unavailable);
        fold(content, unit);
        if (unit.outcome === 'available')
          active = { id: r.id, unit, index: 0, bytes: 0, hash: createHash('sha256') };
      } else if (r.kind === 'witness') {
        if (r.id !== String(witnesses) || r.part !== 0) bad();
        const witness = campaignFileJson(r.payload, campaignFileWitness, 65536);
        witnesses = add(witnesses);
        witnessBytes = add(
          witnessBytes,
          witness[3] === null ? 0 : Buffer.byteLength(JSON.stringify(witness[3])),
        );
        fold(provenance, witness);
      } else if (r.kind === 'attestation') {
        if (r.id !== 'manifest' || r.part !== 0) bad();
        packet = campaignFileJson(r.payload, (v) => {
          if (!closedCampaignRecord(v, ['manifest', 'attestation'])) bad();
          return {
            manifest: validatePortableCampaignManifest(v.manifest),
            attestation: validateCampaignAttestation(v.attestation),
          };
        });
      } else bad();
      if (onProgress) {
        await onProgress(Object.freeze({ records: cursor.records, units, witnesses }));
        signal?.throwIfAborted();
      }
    }
  } finally {
    active?.hash.destroy();
    content.destroy();
    provenance.destroy();
  }
}
