import { randomBytes, createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { validateCampaignBackupFile } from './campaignBackupFileValidation.mjs';
import { campaignFileJson, campaignFileWitness } from './campaignBackupFileRecords.mjs';
import { closedCampaignRecord, campaignManifestId } from './portableCampaignManifest.mjs';
import {
  campaignOriginClock,
  readCampaignOriginAccess,
  readCampaignOrganizationalUniverseAccess,
  originReviewChanged,
} from './campaignBackupOriginAccess.mjs';
import { workFail, digest } from './workProgressContracts.mjs';
import { createCampaignBackupAttestationVerifier } from './campaignBackupAttestation.mjs';
const bad = () =>
  workFail(
    'failed-precondition',
    'O índice temporário está inconsistente.',
    'campaign-backup-origin-index-invalid',
  );
const add = (n, amount = 1) => {
  const result = n + amount;
  if (!Number.isSafeInteger(result) || result < 0) bad();
  return result;
};
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
          let activeBase = null,
            sawBase = false,
            sawProject = false,
            organizationalUniverse = Object.freeze({ availability: 'unproven' }),
            processed = 0,
            available = 0,
            unavailable = 0,
            none = 0,
            globalUnavailable = 0;
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
                const [section, id, outcome, content] = record;
                let base = null,
                  item = null,
                  omission = null;
                if (section === 'project') {
                  if (
                    file.manifest.provenanceVersion !== 2 ||
                    sawProject ||
                    processed !== 0 ||
                    id !== file.manifest.originCampaignId
                  )
                    bad();
                  sawProject = true;
                } else if (section === 'base') {
                  if (
                    sawBase ||
                    processed !== (sawProject ? 1 : 0) ||
                    outcome !== file.manifest.availability
                  )
                    bad();
                  sawBase = true;
                  if (outcome === 'available') {
                    activeBase = content;
                    base = content;
                  } else omission = outcome;
                } else if (section === 'item') {
                  if (!activeBase || content.baseId !== activeBase.baseId) bad();
                  base = activeBase;
                  item = content;
                  if (item.availability !== 'available') omission = 'unavailable';
                  else if (
                    item.origin.kind === 'lore'
                      ? base.universe.kind !== 'reference' ||
                        item.origin.scopeId !== base.universe.id
                      : item.origin.adventureId !== base.adventure.id
                  )
                    bad();
                } else {
                  if (!sawBase) bad();
                  if (outcome === 'unavailable') omission = 'unavailable';
                  else {
                    base = content.base;
                    item = content.item;
                  }
                }
                const result = await db.runTransaction(async (tx) => {
                  await campaignOriginClock(tx, db, uid, clock);
                  if (section === 'project')
                    return readCampaignOrganizationalUniverseAccess(tx, db, uid, content.universe);
                  return omission
                    ? { availability: omission, proof: digest(['exported-omission', record]) }
                    : readCampaignOriginAccess(tx, db, uid, base, item);
                });
                check();
                processed = add(processed);
                if (section === 'project') {
                  organizationalUniverse = Object.freeze({
                    availability: result.availability,
                    ...(content.universe.kind === 'none' ? {} : { id: content.universe.id }),
                  });
                } else if (result.availability === 'available') available = add(available);
                else if (result.availability === 'unavailable') unavailable = add(unavailable);
                else none = add(none);
                if (result.globalLore === 'unavailable') globalUnavailable = add(globalUnavailable);
                const decision = Object.freeze({
                  index: ordinal,
                  section,
                  id,
                  availability: result.availability,
                  ...(result.globalLore === undefined ? {} : { globalLore: result.globalLore }),
                });
                hash.update(JSON.stringify([decision, result.proof]) + '\n');
                if (name === 'capture' && onDecision) {
                  await onDecision(decision);
                  check();
                }
              }
              if (onProgress) {
                await onProgress(
                  Object.freeze({ phase: 'origins', pass: name, processed, total: stored }),
                );
                check();
              }
            }
            if (
              !sawBase ||
              processed !== stored ||
              (file.manifest.provenanceVersion === 2 && !sawProject)
            )
              bad();
            await db.runTransaction((tx) => campaignOriginClock(tx, db, uid, clock));
            check();
            return Object.freeze({
              witnesses: processed,
              derivedWitnesses: processed - (sawProject ? 1 : 0),
              organizationalUniverse,
              available,
              unavailable,
              none,
              globalUnavailable,
              digest: hash.digest('hex'),
            });
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
