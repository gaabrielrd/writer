import { randomBytes, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { validateCampaignBackupFile } from './campaignBackupFileValidation.mjs';
import { campaignDerivedBad as bad } from './campaignBackupDerivedContent.mjs';
import {
  keyFor,
  sourceMatches,
  createCampaignDerivedStageState,
  createCampaignDerivedStaging,
} from './campaignBackupDerivedStaging.mjs';
import { closedCampaignRecord, campaignManifestId } from './portableCampaignManifest.mjs';
import { createCampaignBackupAttestationVerifier } from './campaignBackupAttestation.mjs';
import { baseBodyKey } from './campaignBaseContracts.mjs';
import { digest, workFail } from './workProgressContracts.mjs';
const safeAdd = (a, b = 1) => {
  const n = a + b;
  if (!Number.isSafeInteger(n) || n < 0) bad();
  return n;
};
const available = (r) => r?.value?.unit?.outcome === 'available';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function itemMatches(item, witness, base) {
  if (
    item.sourceKey !== witness.sourceKey ||
    witness.baseId !== base.baseId ||
    witness.availability !== 'available'
  )
    bad();
  const o = item.origin,
    w = witness.origin;
  if (item.kind === 'lore') {
    if (
      o.kind === 'lore'
        ? w.kind !== 'lore' ||
          w.scopeId !== o.scopeId ||
          w.entityId !== o.id ||
          base.universe.kind !== 'reference' ||
          base.universe.id !== o.scopeId
        : w.kind !== 'adventure-lore' ||
          w.adventureId !== o.adventureId ||
          w.entityId !== o.id ||
          o.adventureId !== base.adventure.id
    )
      bad();
  } else if (
    w.kind !== 'adventure' ||
    w.adventureId !== o.adventureId ||
    o.adventureId !== base.adventure.id
  )
    bad();
}
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
      async function live(section, id, field = null) {
        const r = await find(section, id, field);
        if (!available(r)) bad();
        return r;
      }
      async function relationTarget(key, isVariant = false) {
        const v = isVariant ? await find('variant', key, null, true) : null;
        if (v)
          return (
            available(v) &&
            v.value.meta.mode !== 'removed' &&
            v.value.meta.participation !== 'inactive'
          );
        const item = await find('base:item', key, null, true);
        if (item && available(item) && item.value.meta.kind !== 'lore') bad();
        return available(item);
      }
      async function witnessOwner(kind, key) {
        check();
        const row = detach(await reverse(kind, key));
        check();
        if (
          kind === 'image'
            ? row.section !== 'base:item' ||
              !available(row) ||
              row.value.meta.kind !== 'block' ||
              row.value.meta.image !== key
            : kind === 'ledger'
              ? row.section !== 'base:loreReferences' ||
                !available(row) ||
                row.value.meta.targetKey !== key
              : row.section !== 'base:links' ||
                !available(row) ||
                row.value.meta.target.kind !== 'lore' ||
                row.value.meta.target.sourceKey !== key
        )
          bad();
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
          counts = {
            records: 0,
            items: 0,
            fields: 0,
            bodies: 0,
            links: 0,
            ledger: 0,
            images: 0,
            variants: 0,
            anchors: 0,
            unavailable: 0,
            externalAnchorTargets: 0,
            unresolvedRelations: 0,
          };
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
                { unit: u, meta: m, record: w } = row.value,
                deps = [];
              const dep = async (section, id, field = null, required = true) => {
                const r = required
                  ? await live(section, id, field)
                  : await find(section, id, field);
                deps.push([r.section, r.key, r.value]);
                return r;
              };
              if (s === 'base') {
                if (active && u.id !== active.baseId) bad();
              } else if (s === 'w:base') {
                if (!same(w, state.baseWitness)) bad();
              } else if (s === 'w:item') {
                const item = await dep('base:item', w[1], null, false);
                if (item.value.unit.outcome !== w[3].availability) bad();
              } else if (s === 'w:anchor') {
                const v = await dep('variant', w[1], null, false);
                if (v.value.unit.outcome !== w[2]) bad();
              } else {
                if ((s.startsWith('base:') || s === 'image') && !active) bad();
                if (u.outcome !== 'available') counts.unavailable = safeAdd(counts.unavailable);
                if (s === 'base:item') {
                  counts.items = safeAdd(counts.items);
                  const witness = await dep('w:item', u.id, null, false),
                    proof = witness.value.record;
                  if (
                    proof[2] !== 'available' ||
                    proof[3].baseId !== active.baseId ||
                    proof[3].availability !== u.outcome
                  )
                    bad();
                  if (m) {
                    itemMatches(m, proof[3], active);
                    if (m.kind === 'lore') await witnessOwner('ledger', u.id);
                    let parent = null;
                    const kind =
                      m.kind === 'block'
                        ? 'scene'
                        : m.kind === 'milestone'
                          ? 'arc'
                          : m.kind === 'scene' && m.parentKey !== null
                            ? 'part'
                            : null;
                    if (kind) {
                      parent = (await dep('base:item', m.parentKey)).value.meta;
                      if (parent.kind !== kind) bad();
                    } else if (m.parentKey !== null) bad();
                    if (
                      m.kind === 'milestone' &&
                      m.parentKey !==
                        digest({
                          adventureId: m.origin.adventureId,
                          kind: 'arc',
                          id: m.origin.arcId,
                        })
                    )
                      bad();
                    if (m.kind === 'block' && m.role === 'main' && m.origin.id !== parent.origin.id)
                      bad();
                    if (m.image !== null) {
                      if (m.kind !== 'block') bad();
                      await dep('image', m.image, null, false);
                    }
                    for (const f of m.fields) {
                      await dep('base:field', u.id, f.field);
                      if (f.bodySourceKey !== u.id) {
                        if (
                          m.kind !== 'block' ||
                          m.role !== 'main' ||
                          f.field !== 'content' ||
                          f.bodySourceKey !== m.parentKey ||
                          !parent.fields.some((p) => same(p, f))
                        )
                          bad();
                      } else
                        for (let i = 0; i < f.chunkCount; i++) {
                          const body = (await dep('base:bodies', baseBodyKey(u.id, f.field, i)))
                            .value.meta;
                          if (body.sourceKey !== u.id || body.field !== f.field || body.index !== i)
                            bad();
                        }
                    }
                    for (const r of m.relations)
                      if ((await relationTarget(r.targetKey)) !== r.available) bad();
                  }
                } else if (s === 'base:field' || s === 'anchor:field') {
                  counts.fields = safeAdd(counts.fields);
                  const owner = (await dep(s === 'base:field' ? 'base:item' : 'anchor', u.id)).value
                      .meta,
                    fields = s === 'base:field' ? owner.fields : owner.item.fields;
                  if (
                    !fields.some(
                      (f) =>
                        f.field === u.field &&
                        f.bytes === u.byteLength &&
                        f.chunkCount === u.chunkCount &&
                        f.sha256 === u.contentHash,
                    )
                  )
                    bad();
                } else if (s === 'base:bodies') {
                  counts.bodies = safeAdd(counts.bodies);
                  if (m) {
                    const owner = (await dep('base:item', m.sourceKey)).value.meta,
                      f = owner.fields.find((f) => f.field === m.field);
                    if (
                      !f ||
                      f.bodySourceKey !== m.sourceKey ||
                      m.index >= f.chunkCount ||
                      baseBodyKey(m.sourceKey, m.field, m.index) !== u.id
                    )
                      bad();
                  }
                } else if (s === 'base:links') {
                  counts.links = safeAdd(counts.links);
                  if (m) {
                    const owner = (await dep('base:item', m.sourceKey)).value.meta;
                    if (
                      m.kind === 'scene'
                        ? owner.kind !== 'scene'
                        : !['scene', 'arc', 'milestone', 'event'].includes(owner.kind)
                    )
                      bad();
                    const t = await find('base:item', m.target.sourceKey, null, true);
                    if (
                      available(t) !== m.target.available ||
                      (t && available(t) && t.value.meta.kind !== m.target.kind)
                    )
                      bad();
                    if (t) deps.push([t.section, t.key, t.value]);
                    if (m.target.kind === 'lore' && m.target.available) {
                      const o = t.value.meta.origin;
                      const ref =
                        o.kind === 'lore'
                          ? { kind: 'universe', scopeId: o.scopeId, entityId: o.id }
                          : { kind: 'adventure', scopeId: o.adventureId, entityId: o.id };
                      const ledger = (await dep('base:loreReferences', digest(ref))).value.meta;
                      if (ledger.targetKey !== m.target.sourceKey || !ledger.available) bad();
                    }
                  }
                } else if (s === 'base:loreReferences') {
                  counts.ledger = safeAdd(counts.ledger);
                  if (m) {
                    await witnessOwner('lore', m.targetKey);
                    const t = await find('base:item', m.targetKey, null, true);
                    if (available(t) !== m.available) bad();
                    if (m.available) {
                      const o = t.value.meta.origin;
                      if (t.value.meta.kind !== 'lore') bad();
                      const ref =
                        o.kind === 'lore'
                          ? { kind: 'universe', scopeId: o.scopeId, entityId: o.id }
                          : { kind: 'adventure', scopeId: o.adventureId, entityId: o.id };
                      if (digest(ref) !== u.id) bad();
                    }
                  }
                } else if (s === 'image') {
                  counts.images = safeAdd(counts.images);
                  await witnessOwner('image', u.id);
                } else if (s === 'variant') {
                  counts.variants = safeAdd(counts.variants);
                  const proof = (await dep('w:anchor', u.id, null, false)).value.record;
                  if (proof[2] !== u.outcome) bad();
                  if (m) {
                    const anchor = (await dep('anchor', m.anchorKey)).value.meta;
                    if (
                      anchor.item.sourceKey !== u.id ||
                      proof[3].anchorKey !== m.anchorKey ||
                      m.anchorKey !==
                        digest({ capturedBaseId: proof[3].base.baseId, sourceKey: u.id })
                    )
                      bad();
                    sourceMatches(anchor.source, proof[3].base);
                    itemMatches(anchor.item, proof[3].item, proof[3].base);
                    if (
                      active &&
                      !['legacy', 'inactive'].includes(m.participation) &&
                      proof[3].base.baseId !== active.baseId
                    )
                      bad();
                    for (const r of m.relations) {
                      if (r.unresolved) {
                        const target = await find('base:item', r.targetKey, null, true);
                        if (target && available(target) && target.value.meta.kind !== 'lore') bad();
                        counts.unresolvedRelations = safeAdd(counts.unresolvedRelations);
                      } else if ((await relationTarget(r.targetKey, true)) !== r.available) bad();
                    }
                  } else await dep('anchor', u.id, null, false);
                } else if (s === 'anchor') {
                  counts.anchors = safeAdd(counts.anchors);
                  if (m) {
                    if (m.item.kind !== 'lore') bad();
                    for (const f of m.item.fields) {
                      if (f.bodySourceKey !== m.item.sourceKey) bad();
                      await dep('anchor:field', u.id, f.field);
                    }
                    for (const r of m.item.relations) {
                      const a = await find('base:item', r.targetKey, null, true),
                        v = await find('variant', r.targetKey, null, true);
                      if (a && available(a) && a.value.meta.kind !== 'lore') bad();
                      if (!a && !v)
                        counts.externalAnchorTargets = safeAdd(counts.externalAnchorTargets);
                    }
                  }
                }
              }
              counts.records = safeAdd(counts.records);
              hash.update(JSON.stringify([row.section, row.key, row.value, deps]) + '\n');
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
