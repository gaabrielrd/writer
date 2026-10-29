import { randomBytes, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { validateCampaignBackupFile } from './campaignBackupFileValidation.mjs';
import { campaignDerivedBad as bad } from './campaignBackupDerivedContent.mjs';
import {
  keyFor,
  createCampaignDerivedStageState,
  createCampaignDerivedStaging,
} from './campaignBackupDerivedStaging.mjs';
import { closedCampaignRecord, campaignManifestId } from './portableCampaignManifest.mjs';
import { createCampaignBackupAttestationVerifier } from './campaignBackupAttestation.mjs';
import {
  advanceCampaignDerivedRow,
  createCampaignDerivedRowState,
  campaignDerivedCounts,
} from './campaignBackupDerivedRowWalk.mjs';
import { workFail } from './workProgressContracts.mjs';
/** All lookups refer to authenticated temporary metadata; no native origin queries or grants. */
export function createCampaignBackupDerivedSemanticsService({ keys, now = Date.now }) {
  return {
    async reviewCampaignBackupDerivedContent(
      uid,
      source,
      { index, signal, onProgress, onDecision } = {},
    ) {
      if (typeof uid !== 'string' || !uid) workFail('unauthenticated', 'Entre na sua conta.');
      campaignManifestId(uid);
      if (
        !index ||
        ['write', 'seal', 'read', 'lookup', 'reverse', 'dispose'].some(
          (k) => typeof index[k] !== 'function',
        ) ||
        (onProgress !== undefined && typeof onProgress !== 'function') ||
        (onDecision !== undefined && typeof onDecision !== 'function')
      )
        throw new TypeError('Índice derivado inválido.');
      const write = index.write.bind(index),
        seal = index.seal.bind(index),
        read = index.read.bind(index),
        lookup = index.lookup.bind(index),
        reverse = index.reverse.bind(index),
        dispose = index.dispose.bind(index),
        secret = randomBytes(32),
        check = () => signal?.throwIfAborted(),
        mac = (r, bytes) =>
          createHmac('sha256', secret)
            .update(
              JSON.stringify([
                'writer-campaign-derived-index-v1',
                uid,
                r.index,
                r.section,
                r.key,
                r.position,
              ]) + '\n',
            )
            .update(bytes)
            .digest(),
        state = createCampaignDerivedStageState(),
        staging = createCampaignDerivedStaging(state, async (row) => {
          check();
          const { index, section, key, position, value } = row,
            meta = { index, section, key, position },
            payload = Buffer.from(JSON.stringify(value));
          await write(Object.freeze({ ...meta, payload, tag: mac(meta, payload).toString('hex') }));
          check();
        });
      function detach(raw, expected) {
        if (!closedCampaignRecord(raw, ['index', 'section', 'key', 'position', 'payload', 'tag']))
          bad();
        const r = { index: raw.index, section: raw.section, key: raw.key, position: raw.position },
          bytes = raw.payload,
          tag = raw.tag;
        if (
          !Number.isSafeInteger(r.index) ||
          r.index < 0 ||
          r.index >= state.stored ||
          (expected !== undefined && r.index !== expected) ||
          typeof r.section !== 'string' ||
          !Object.hasOwn(state.sizes, r.section) ||
          typeof r.key !== 'string' ||
          !Number.isSafeInteger(r.position) ||
          r.position < 0 ||
          r.position >= state.sizes[r.section] ||
          !(bytes instanceof Uint8Array) ||
          bytes.length > 65536 ||
          typeof tag !== 'string' ||
          !/^[a-f0-9]{64}$/.test(tag)
        )
          bad();
        const payload = Buffer.from(bytes);
        if (!timingSafeEqual(Buffer.from(tag, 'hex'), mac(r, payload))) bad();
        let value;
        try {
          value = JSON.parse(payload);
        } catch {
          bad();
        }
        return Object.freeze({ ...r, value });
      }
      async function find(section, id, field = null, optional = false) {
        check();
        const key = keyFor(id, field),
          raw = await lookup(section, key);
        check();
        if (closedCampaignRecord(raw, ['before', 'after'])) {
          if (!optional || !['base:item', 'variant'].includes(section)) bad();
          const before = raw.before === null ? null : detach(raw.before),
            after = raw.after === null ? null : detach(raw.after),
            size = state.sizes[section] ?? 0;
          if (
            (before && (before.section !== section || before.key >= key)) ||
            (after && (after.section !== section || after.key <= key)) ||
            (before ? before.position + 1 : 0) !== (after ? after.position : size)
          )
            bad();
          return null;
        }
        const row = detach(raw);
        if (row.section !== section || row.key !== key) bad();
        return row;
      }
      try {
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
          onWitness: ({ record }) => staging.witness(record),
          onDerivedUnit: ({ unit, payload, contentVersion }) =>
            staging.unit(unit, payload, contentVersion),
        });
        const active = staging.finish(file);
        check();
        await seal();
        check();
        const hash = createHash('sha256'),
          counts = campaignDerivedCounts();
        hash.update(
          JSON.stringify(['writer-campaign-derived-semantics-v1', uid, file.seal.chainHash]) + '\n',
        );
        try {
          for (let start = 0; start < state.stored; start += 25) {
            check();
            const length = Math.min(25, state.stored - start),
              raw = await read(start, length);
            check();
            if (!Array.isArray(raw) || raw.length !== length) bad();
            const page = Array.from({ length }, (_, i) => detach(raw[i], start + i));
            for (const row of page) {
              const s = row.section,
                walk = createCampaignDerivedRowState(row);
              while (!walk.done) {
                check();
                await advanceCampaignDerivedRow({
                  row,
                  context: { active, baseWitness: state.baseWitness },
                  counts,
                  state: walk,
                  write: (s) => hash.update(s),
                  readers: {
                    find,
                    reverse: async (kind, key) => {
                      check();
                      const r = detach(await reverse(kind, key));
                      check();
                      return r;
                    },
                  },
                });
              }
              if (onDecision) {
                await onDecision(Object.freeze({ section: s, key: row.key, index: row.index }));
                check();
              }
            }
            if (onProgress) {
              await onProgress(
                Object.freeze({ phase: 'derived', processed: counts.records, total: state.stored }),
              );
              check();
            }
          }
          if (counts.records !== state.stored) bad();
          createCampaignBackupAttestationVerifier({ keys, now }).verifyCampaignBackupAttestation(
            uid,
            { manifest: file.manifest, attestation: file.attestation },
          );
          check();
          return Object.freeze({
            validation: 'campaign-derived-semantics-only',
            manifest: file.manifest,
            archive: Object.freeze({
              chainHash: file.seal.chainHash,
              size: file.seal.archiveBytes,
            }),
            derived: Object.freeze({ ...counts, digest: hash.digest('hex') }),
          });
        } finally {
          hash.destroy();
        }
      } finally {
        secret.fill(0);
        await dispose();
      }
    },
  };
}
