import { randomBytes, createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { validateCampaignBackupFile } from './campaignBackupFileValidation.mjs';
import { campaignFileJson, campaignFileWitness } from './campaignBackupFileRecords.mjs';
import { closedCampaignRecord, campaignManifestId } from './portableCampaignManifest.mjs';
import {
  campaignOriginClock,
  readCampaignOriginWitnessAccess,
  originReviewChanged,
} from './campaignBackupOriginAccess.mjs';
import { workFail } from './workProgressContracts.mjs';
import { createCampaignBackupAttestationVerifier } from './campaignBackupAttestation.mjs';
import {
  originIndexBad as bad,
  createCampaignOriginPassState,
  prepareCampaignOriginWitness,
  applyCampaignOriginDecision,
  finishCampaignOriginPass,
} from './campaignBackupOriginChecks.mjs';
/** Index is a temporary host adapter. Its contents are authenticated before any origin lookup. */
export function createCampaignBackupOriginReviewService({ db, keys, now = Date.now }) {
  return {
    async reviewCampaignBackupOrigins(uid, source, { index, signal, onProgress, onDecision } = {}) {
      if (typeof uid !== 'string' || !uid) workFail('unauthenticated', 'Entre na sua conta.');
      campaignManifestId(uid);
      if (
        !index ||
        ['write', 'seal', 'read', 'dispose'].some((k) => typeof index[k] !== 'function') ||
        (onProgress !== undefined && typeof onProgress !== 'function') ||
        (onDecision !== undefined && typeof onDecision !== 'function')
      )
        throw new TypeError('Índice de revisão inválido.');
      const write = index.write.bind(index),
        seal = index.seal.bind(index),
        read = index.read.bind(index),
        dispose = index.dispose.bind(index),
        key = randomBytes(32),
        check = () => signal?.throwIfAborted(),
        mac = (ordinal, payload) =>
          createHmac('sha256', key)
            .update(JSON.stringify(['writer-campaign-origin-index-v1', uid, ordinal]) + '\n')
            .update(payload)
            .digest();
      let stored = 0;
      try {
        check();
        const file = await validateCampaignBackupFile(uid, source, {
          keys,
          now,
          signal,
          onProgress: onProgress
            ? async (p) => {
                await onProgress(Object.freeze({ phase: 'integrity', ...p }));
                check();
              }
            : undefined,
          onWitness: async ({ index: ordinal, record }) => {
            check();
            if (ordinal !== stored) bad();
            const payload = Buffer.from(JSON.stringify(record)),
              tag = mac(ordinal, payload).toString('hex');
            if (payload.length > 65536) bad();
            await write(Object.freeze({ index: ordinal, payload, tag }));
            check();
            stored++;
          },
        });
        if (stored !== file.manifest.provenance.units) bad();
        check();
        await seal();
        check();
        const clock = await db.runTransaction((tx) => campaignOriginClock(tx, db, uid));
        check();
        async function pass(name) {
          const hash = createHash('sha256');
          const passState = createCampaignOriginPassState();
          hash.update(
            JSON.stringify(['writer-campaign-origin-review-v1', uid, file.seal.chainHash, clock]) +
              '\n',
          );
          try {
            for (let start = 0; start < stored; start += 25) {
              check();
              const raw = await read(start, Math.min(25, stored - start));
              check();
              if (!Array.isArray(raw) || raw.length !== Math.min(25, stored - start)) bad();
              // Detach and authenticate the entire bounded page before the first DB await.
              const page = Array.from({ length: Math.min(25, stored - start) }, (_, offset) => {
                const row = raw[offset];
                if (!closedCampaignRecord(row, ['index', 'payload', 'tag'])) bad();
                const ordinal = row.index,
                  rawPayload = row.payload,
                  tag = row.tag;
                if (
                  ordinal !== start + offset ||
                  !(rawPayload instanceof Uint8Array) ||
                  rawPayload.length > 65536 ||
                  typeof tag !== 'string' ||
                  !/^[a-f0-9]{64}$/.test(tag)
                )
                  bad();
                const payload = Buffer.from(rawPayload);
                if (!timingSafeEqual(Buffer.from(tag, 'hex'), mac(ordinal, payload))) bad();
                return { ordinal, record: campaignFileJson(payload, campaignFileWitness, 65536) };
              });
              for (const { ordinal, record } of page) {
                check();
                const prepared = prepareCampaignOriginWitness(passState, file, ordinal, record);
                const result = await db.runTransaction((tx) =>
                  readCampaignOriginWitnessAccess(tx, db, uid, clock, prepared, record),
                );
                check();
                const decision = applyCampaignOriginDecision(passState, ordinal, record, result);
                hash.update(JSON.stringify([decision, result.proof]) + '\n');
                if (name === 'capture' && onDecision) {
                  await onDecision(decision);
                  check();
                }
              }
              if (onProgress) {
                await onProgress(
                  Object.freeze({
                    phase: 'origins',
                    pass: name,
                    processed: passState.processed,
                    total: stored,
                  }),
                );
                check();
              }
            }
            await db.runTransaction((tx) => campaignOriginClock(tx, db, uid, clock));
            check();
            return finishCampaignOriginPass(passState, file, stored, hash.digest('hex'));
          } finally {
            hash.destroy();
          }
        }
        const first = await pass('capture'),
          second = await pass('recheck');
        if (JSON.stringify(first) !== JSON.stringify(second)) originReviewChanged();
        check();
        createCampaignBackupAttestationVerifier({ keys, now }).verifyCampaignBackupAttestation(
          uid,
          { manifest: file.manifest, attestation: file.attestation },
        );
        check();
        return Object.freeze({
          validation: 'campaign-origin-review-only',
          manifest: file.manifest,
          archive: Object.freeze({ chainHash: file.seal.chainHash, size: file.seal.archiveBytes }),
          origins: first,
        });
      } finally {
        key.fill(0);
        await dispose();
      }
    },
  };
}
