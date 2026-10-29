import { randomBytes, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { validateCampaignBackupFile } from './campaignBackupFileValidation.mjs';
import { parseCampaignBackupOwnContent } from './campaignBackupOwnContent.mjs';
import { CAMPAIGN_OWN_FAMILIES } from './campaignBackupOwnDefinitions.mjs';
import { closedCampaignRecord, campaignManifestId } from './portableCampaignManifest.mjs';
import { createCampaignBackupAttestationVerifier } from './campaignBackupAttestation.mjs';
import { workFail } from './workProgressContracts.mjs';
const families = ['campaign', 'progress', ...CAMPAIGN_OWN_FAMILIES];
const bad = () =>
  workFail(
    'failed-precondition',
    'Os dados próprios ou seus vínculos estão inconsistentes.',
    'campaign-backup-own-semantics-invalid',
  );
const controls = ['session-reference-state', 'session-preparation-state'];
const add = (a, b = 1) => {
  const result = a + b;
  if (!Number.isSafeInteger(result) || result < 0) bad();
  return result;
};
function metadata(unit, payload) {
  const kind = unit.section.slice(4);
  if (unit.outcome === 'omitted') {
    const allowed = controls.includes(kind)
      ? unit.reason === 'control'
      : unit.reason === 'deleted'
        ? [
            'note',
            'session',
            'preparation-item',
            'session-reference',
            'session-preparation-link',
          ].includes(kind)
        : unit.reason === 'inactive-parent' &&
          ['session-reference', 'session-preparation-link'].includes(kind);
    if (!allowed) bad();
    return { outcome: 'omitted', reason: unit.reason };
  }
  if (unit.outcome !== 'available' || controls.includes(kind)) bad();
  let value;
  try {
    value = parseCampaignBackupOwnContent(kind, unit.id, payload);
  } catch {
    bad();
  }
  const d = value.data,
    result = { outcome: 'available' };
  if (kind === 'campaign')
    Object.assign(result, { provenanceKind: d.provenance.kind, universeId: d.universeId ?? null });
  if (kind === 'progress') result.present = value.present;
  if (['session', 'preparation-item', 'session-preparation-link'].includes(kind))
    result.order = d.order;
  if (kind === 'checklist') result.completed = d.completed;
  if (['preparation-item', 'preparation-body'].includes(kind)) result.preparationKind = d.kind;
  if (['session-reference', 'session-preparation-link'].includes(kind))
    result.sessionId = d.sessionId;
  if (kind === 'session-preparation-link') result.itemId = d.itemId;
  if (kind === 'session-reference') result.target = d.target;
  return result;
}
/** Temporary metadata index only; no database access, persistent adapter or restoration grant. */
export function createCampaignBackupOwnSemanticsService({ keys, now = Date.now }) {
  return {
    async reviewCampaignBackupOwnContent(
      uid,
      source,
      { index, signal, onProgress, onDecision } = {},
    ) {
      if (typeof uid !== 'string' || !uid) workFail('unauthenticated', 'Entre na sua conta.');
      campaignManifestId(uid);
      if (
        !index ||
        ['write', 'seal', 'read', 'lookup', 'dispose'].some(
          (k) => typeof index[k] !== 'function',
        ) ||
        (onProgress !== undefined && typeof onProgress !== 'function') ||
        (onDecision !== undefined && typeof onDecision !== 'function')
      )
        throw new TypeError('Índice dos próprios inválido.');
      const write = index.write.bind(index),
        seal = index.seal.bind(index),
        read = index.read.bind(index),
        lookup = index.lookup.bind(index),
        dispose = index.dispose.bind(index),
        key = randomBytes(32),
        check = () => signal?.throwIfAborted(),
        mac = (ordinal, family, id, payload) =>
          createHmac('sha256', key)
            .update(
              JSON.stringify(['writer-campaign-own-index-v1', uid, ordinal, family, id]) + '\n',
            )
            .update(payload)
            .digest();
      let stored = 0,
        lastRank = -1,
        lastId = null,
        root = null,
        progress = false,
        project = null;
      function detach(raw, expected) {
        if (!closedCampaignRecord(raw, ['index', 'family', 'id', 'payload', 'tag'])) bad();
        const ordinal = raw.index,
          family = raw.family,
          id = raw.id,
          bytes = raw.payload,
          tag = raw.tag;
        if (
          !Number.isSafeInteger(ordinal) ||
          ordinal < 0 ||
          ordinal >= stored ||
          !families.includes(family) ||
          typeof id !== 'string' ||
          !(bytes instanceof Uint8Array) ||
          bytes.length > 32768 ||
          typeof tag !== 'string' ||
          !/^[a-f0-9]{64}$/.test(tag) ||
          (expected !== undefined && ordinal !== expected)
        )
          bad();
        const payload = Buffer.from(bytes);
        if (!timingSafeEqual(Buffer.from(tag, 'hex'), mac(ordinal, family, id, payload))) bad();
        let value;
        try {
          value = JSON.parse(payload.toString('utf8'));
        } catch {
          bad();
        }
        return Object.freeze({ index: ordinal, family, id, value, tag });
      }
      async function required(family, id, active = true) {
        check();
        const row = detach(await lookup(family, id));
        check();
        if (row.family !== family || row.id !== id || (active && row.value.outcome !== 'available'))
          bad();
        return row;
      }
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
          onOwnUnit: async ({ index: ordinal, unit, payload }) => {
            check();
            const family = unit.section.slice(4),
              rank = families.indexOf(family);
            if (
              ordinal !== stored ||
              rank < lastRank ||
              (rank === lastRank && Buffer.compare(Buffer.from(unit.id), Buffer.from(lastId)) <= 0)
            )
              bad();
            lastRank = rank;
            lastId = unit.id;
            const value = metadata(unit, payload);
            if (family === 'campaign') {
              if (stored !== 0 || value.outcome !== 'available') bad();
              root = value;
            }
            if (family === 'progress') {
              if (stored !== 1 || value.outcome !== 'available') bad();
              progress = true;
            }
            const bytes = Buffer.from(JSON.stringify(value)),
              tag = mac(stored, family, unit.id, bytes).toString('hex');
            await write(Object.freeze({ index: stored, family, id: unit.id, payload: bytes, tag }));
            check();
            stored = add(stored);
          },
          onWitness: ({ record }) => {
            if (record[0] === 'project') project = record[3];
          },
        });
        if (
          !root ||
          !progress ||
          (root.provenanceKind === 'independent') !== (file.manifest.availability === 'none')
        )
          bad();
        if (
          file.manifest.provenanceVersion === 2 &&
          (!project ||
            (project.universe.kind === 'none'
              ? root.universeId !== null
              : root.universeId !== project.universe.id))
        )
          bad();
        check();
        await seal();
        check();
        const hash = createHash('sha256'),
          counts = {
            units: 0,
            active: 0,
            omitted: 0,
            notes: 0,
            sessions: 0,
            checklist: 0,
            checklistCompleted: 0,
            preparationItems: 0,
            preparationBodies: 0,
            sessionReferences: 0,
            sessionLinks: 0,
            nextSessionOrder: 1,
            nextPreparationOrder: 1,
          };
        hash.update(
          JSON.stringify(['writer-campaign-own-semantics-v1', uid, file.seal.chainHash]) + '\n',
        );
        try {
          for (let start = 0; start < stored; start += 25) {
            const length = Math.min(25, stored - start);
            check();
            const raw = await read(start, length);
            check();
            if (!Array.isArray(raw) || raw.length !== length) bad();
            const page = Array.from({ length }, (_, offset) => detach(raw[offset], start + offset));
            for (const row of page) {
              check();
              const { family, id, value: v } = row,
                dependencies = [];
              if (v.outcome === 'available') {
                const other = async (family, id, active = true) => {
                  const target = await required(family, id, active);
                  dependencies.push([target.index, target.family, target.id, target.value]);
                  return target.value;
                };
                if (family === 'preparation-item' || family === 'preparation-body') {
                  const paired = await other(
                    family === 'preparation-item' ? 'preparation-body' : 'preparation-item',
                    id,
                  );
                  if (paired.preparationKind !== v.preparationKind) bad();
                }
                if (family === 'session-reference' || family === 'session-preparation-link') {
                  await other('session', v.sessionId);
                  const control = await other(
                    family === 'session-reference'
                      ? 'session-reference-state'
                      : 'session-preparation-state',
                    v.sessionId,
                    false,
                  );
                  if (control.outcome !== 'omitted' || control.reason !== 'control') bad();
                  if (family === 'session-preparation-link')
                    await other('preparation-item', v.itemId);
                }
                counts.active = add(counts.active);
                const field = {
                  note: 'notes',
                  session: 'sessions',
                  checklist: 'checklist',
                  'preparation-item': 'preparationItems',
                  'preparation-body': 'preparationBodies',
                  'session-reference': 'sessionReferences',
                  'session-preparation-link': 'sessionLinks',
                }[family];
                if (field) counts[field] = add(counts[field]);
                if (family === 'checklist' && v.completed)
                  counts.checklistCompleted = add(counts.checklistCompleted);
                if (family === 'session-preparation-link') add(v.order);
                if (family === 'session')
                  counts.nextSessionOrder = Math.max(counts.nextSessionOrder, add(v.order));
                if (family === 'preparation-item')
                  counts.nextPreparationOrder = Math.max(counts.nextPreparationOrder, add(v.order));
              } else {
                counts.omitted = add(counts.omitted);
                if (controls.includes(family)) {
                  const parent = await required('session', id, false);
                  dependencies.push([parent.index, parent.family, parent.id, parent.value]);
                }
              }
              counts.units = add(counts.units);
              hash.update(JSON.stringify([row.index, family, id, v, dependencies]) + '\n');
              if (onDecision) {
                await onDecision(
                  Object.freeze({ index: row.index, family, id, outcome: v.outcome }),
                );
                check();
              }
            }
            if (onProgress) {
              await onProgress(
                Object.freeze({ phase: 'own', processed: counts.units, total: stored }),
              );
              check();
            }
          }
          if (counts.units !== stored) bad();
          createCampaignBackupAttestationVerifier({ keys, now }).verifyCampaignBackupAttestation(
            uid,
            { manifest: file.manifest, attestation: file.attestation },
          );
          check();
          return Object.freeze({
            validation: 'campaign-own-semantics-only',
            manifest: file.manifest,
            archive: Object.freeze({
              chainHash: file.seal.chainHash,
              size: file.seal.archiveBytes,
            }),
            own: Object.freeze({
              ...counts,
              digest: hash.digest('hex'),
              organizationalUniverse:
                file.manifest.provenanceVersion === 1 ? 'unproven' : 'matched',
            }),
          });
        } finally {
          hash.destroy();
        }
      } finally {
        key.fill(0);
        await dispose();
      }
    },
  };
}
