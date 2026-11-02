import { readCampaignBackupFrame } from './campaignBackupContainer.mjs';
import { parseCampaignDerivedUnit } from './campaignBackupDerivedContent.mjs';
import { readCampaignRestoreJsonUnit } from './campaignRestoreJsonUnit.mjs';
import { createCampaignRestoreDerivedIndex } from './campaignRestoreDerivedIndex.mjs';
import { createCampaignRestoreBaseWrites } from './campaignRestoreBaseWrites.mjs';
import { advanceRestoredBaseField } from './campaignRestoreBaseField.mjs';
import {
  BASE_MATERIALIZATION_BYTES,
  restoredBaseId,
  restoredBaseImage,
} from './campaignRestoreBaseFormat.mjs';
import { readCampaignSourceAccess } from './campaignSourceAccess.mjs';
import { originReviewChanged } from './campaignBackupOriginAccess.mjs';
import { keyFor } from './campaignBackupDerivedStaging.mjs';
import { emptyCaptureCounts, baseBodyKey } from './campaignBaseContracts.mjs';
import { seal, open } from './campaignRestoreCrypto.mjs';
import {
  RESTORE_DOMAIN,
  authorize,
  mutation,
  fingerprint,
  integer,
  digest,
  closed,
  id,
  hash,
  bad,
  fail,
} from './campaignRestoreContracts.mjs';
const aad = (l, cp) => [RESTORE_DOMAIN, l.uid, l.rid, l.token, 'base-materialization', cp],
  binding = (ctx) => digest([ctx.proof, ctx.port.certificate, ctx.port.context]),
  projection = (s, totalRows) => ({
    schemaVersion: 1,
    phase: s.phase,
    checkpoint: 0,
    processedRows: s.row,
    totalRows,
    written: s.written,
    cleaned: 0,
    audited: s.audited,
    availability: s.availability,
  }),
  target = (collection, id, value) => ({ collection, id, value });
function decode(l, key, ctx) {
  let s;
  try {
    s = JSON.parse(
      open(
        key.bytes,
        l.job.baseMaterialization.payload,
        aad(l, l.job.baseMaterialization.checkpoint),
        BASE_MATERIALIZATION_BYTES,
      ).toString('utf8'),
    );
  } catch {
    bad();
  }
  closed(s, [
    'schemaVersion',
    'scope',
    'phase',
    'row',
    'written',
    'audited',
    'eligible',
    'availability',
    'pending',
    'text',
    'counts',
    'omitted',
  ]);
  if (
    s.schemaVersion !== 1 ||
    s.scope !== binding(ctx) ||
    typeof s.eligible !== 'boolean' ||
    digest({
      ...projection(s, ctx.port.certificate.rows),
      checkpoint: l.job.baseMaterialization.checkpoint,
    }) !==
      digest(
        Object.fromEntries(
          Object.entries(l.job.baseMaterialization).filter(([k]) => k !== 'payload'),
        ),
      )
  )
    bad();
  closed(s.counts, Object.keys(emptyCaptureCounts()));
  for (const n of Object.values(s.counts)) integer(n);
  integer(s.omitted);
  return s;
}
export function createCampaignRestoreBaseMaterialization({
  store,
  openIndex,
  derivedSemantics,
  openSource,
}) {
  const { db } = store,
    idx = createCampaignRestoreDerivedIndex(store),
    writes = createCampaignRestoreBaseWrites(store);
  function ready(l) {
    if (
      l.job.state !== 'bytes-verified' ||
      l.job.derivedCheck?.phase !== 'verified' ||
      l.job.ownMaterialization?.phase !== 'ready'
    )
      fail('failed-precondition', 'materialization-prerequisite-incomplete');
  }
  async function context(uid, r) {
    const ref = { restoreId: r.restoreId, jobToken: r.jobToken },
      proof = await derivedSemantics(uid, ref),
      port = await openIndex(uid, ref);
    if (
      digest(proof.manifest) !== digest(port.certificate.manifest) ||
      digest(proof.archive) !== digest(port.certificate.archive)
    )
      bad();
    return { proof, port };
  }
  async function resource(tx, l, key, ctx, sourceKey) {
    const base = ctx.port.context.active;
    if (!base)
      return {
        availability: 'unavailable',
        proof: digest(['exported-base-omission', ctx.port.context.baseWitness]),
      };
    let item;
    if (sourceKey !== null) {
      const row = await idx.lookup(tx, l, key, 'w:item', keyFor(sourceKey));
      if (
        !row ||
        row.value.record[2] !== 'available' ||
        row.value.record[3].availability !== 'available'
      )
        return {
          availability: 'unavailable',
          proof: digest(['exported-item-omission', sourceKey]),
        };
      item = row.value.record[3];
    }
    return readCampaignSourceAccess(tx, db, l.uid, base, item);
  }
  async function before(uid, r, seed, ctx, sourceKey, required = true) {
    const result = await db.runTransaction(async (tx) => {
      const l = await store.load(tx, uid, r.restoreId, r.jobToken);
      ready(l);
      if (l.job.checkpoint !== r.expectedCheckpoint)
        fail('failed-precondition', 'checkpoint-conflict');
      if (
        sourceKey !== null &&
        !required &&
        (await resource(tx, l, seed.key, ctx, null)).availability !== 'available'
      )
        originReviewChanged();
      return resource(tx, l, seed.key, ctx, sourceKey);
    });
    if (required && result.availability !== 'available') originReviewChanged();
    return { sourceKey, result };
  }
  async function json(uid, r, row, ctx) {
    const location = await ctx.port.locate(row.section, row.key);
    if (!location) fail('failed-precondition', 'derived-index-location-missing');
    const source = await openSource(uid, { restoreId: r.restoreId, jobToken: r.jobToken }),
      bytes = await readCampaignRestoreJsonUnit(
        source,
        { ...location, unit: row.value.unit },
        bad,
        4 * 1024 * 1024,
      ),
      meta = parseCampaignDerivedUnit(row.value.unit, bytes, ctx.proof.manifest.contentVersion);
    if (digest(meta) !== digest(row.value.meta)) bad();
    return JSON.parse(bytes.toString('utf8'));
  }
  async function action(uid, r, seed, ctx, s) {
    const active = ctx.port.context.active,
      total = ctx.port.certificate.rows;
    for (let step = 0; step < r.limit; step++) {
      if (s.phase === 'root') {
        if (!s.eligible) {
          s.phase = 'audit';
          return { targets: [], auth: [], sourceKey: null };
        }
        const auth = await before(uid, r, seed, ctx, null),
          row = await ctx.port.lookup('base', keyFor(ctx.port.context.baseWitness[1])),
          value = await json(uid, r, row, ctx),
          baseId = restoredBaseId(seed.l);
        s.phase = 'audit';
        return {
          targets: [
            target('root', baseId, {
              adventureId: value.adventureId,
              universeId: value.universeId,
              capturedAt: value.capturedAt,
              snapshot: { title: value.title, synopsis: value.synopsis, language: value.language },
              id: baseId,
              schemaVersion: 1,
              ownerId: uid,
              campaignId: seed.l.job.campaignId,
              state: 'preparing',
              counts: { ...s.counts },
              sourceMode: 'restored',
              sourceEvidence: {
                schemaVersion: 1,
                archiveHash: ctx.proof.archive.chainHash,
                source: active,
              },
            }),
          ],
          auth: [auth],
          sourceKey: null,
        };
      }
      if (s.phase === 'audit') return { audit: true, targets: [], auth: [], sourceKey: null };
      if (s.pending) {
        const row = (await ctx.port.read(s.pending.index, 1))[0],
          meta = row.value.meta,
          done = s.pending.fields.length === meta.fields.length;
        if (done) {
          const p = s.pending;
          s.pending = null;
          if (!p.eligible) {
            s.omitted++;
            continue;
          }
          const auth = await before(uid, r, seed, ctx, meta.sourceKey),
            value = await json(uid, r, row, ctx);
          value.fields = value.fields.map((f, n) => ({ ...f, chunkCount: p.fields[n].chunkCount }));
          if (value.kind === 'lore') {
            const { relations = [], ...structured } = value.structured;
            value.structured = {
              ...structured,
              relationMode: 'portable',
              portableRelations: relations,
            };
          }
          if (value.image)
            value.image = {
              ...value.image,
              imageKey: restoredBaseImage(seed.l, value.image.imageKey).imageKey,
            };
          value.sourceEvidence = {
            schemaVersion: 1,
            archiveHash: ctx.proof.archive.chainHash,
            source: (await ctx.port.lookup('w:item', keyFor(meta.sourceKey))).value.record[3],
          };
          s.counts[value.kind] = integer(s.counts[value.kind] + 1);
          return {
            targets: [target('items', value.sourceKey, value)],
            auth: [auth],
            sourceKey: value.sourceKey,
          };
        }
      }
      if (s.row === total) {
        if (s.pending || s.text) bad();
        s.phase = 'root';
        continue;
      }
      const row = (await ctx.port.read(s.row, 1))[0],
        u = row.value.unit,
        m = row.value.meta;
      if (row.section === 'base:item') {
        if (s.pending) bad();
        s.row++;
        if (u.outcome !== 'available') {
          s.omitted++;
          continue;
        }
        const permission = s.eligible ? await before(uid, r, seed, ctx, m.sourceKey, false) : null;
        s.pending = {
          index: row.index,
          eligible: permission?.result.availability === 'available',
          fields: [],
        };
        continue;
      }
      if (row.section === 'base:field') {
        if (!s.pending) bad();
        const owner = (await ctx.port.read(s.pending.index, 1))[0].value.meta,
          field = owner.fields[s.pending.fields.length];
        if (!field || u.id !== owner.sourceKey || u.field !== field.field) bad();
        if (!s.pending.eligible) {
          s.pending.fields.push({ chunkCount: field.chunkCount });
          s.row++;
          continue;
        }
        const auth = [await before(uid, r, seed, ctx, owner.sourceKey)];
        if (field.bodySourceKey !== owner.sourceKey)
          auth.push(await before(uid, r, seed, ctx, field.bodySourceKey));
        if (!s.text) {
          const location = await ctx.port.locate(row.section, row.key);
          if (!location) fail('failed-precondition', 'derived-index-location-missing');
          s.text = {
            id: location.id,
            cursor: location.start,
            part: 0,
            written: 0,
            bytes: 0,
            pending: '',
            hashState: null,
            previousLength: null,
          };
        }
        const source = await openSource(uid, { restoreId: r.restoreId, jobToken: r.jobToken }),
          next = await readCampaignBackupFrame(source, s.text.cursor);
        s.text.cursor = next.cursor;
        if (!next.record) bad();
        const result = await advanceRestoredBaseField(
            s.text,
            u,
            next.record,
            ctx.proof.manifest.contentVersion,
          ),
          targets =
            field.bodySourceKey === owner.sourceKey
              ? result.chunks.map((c) =>
                  target('bodies', baseBodyKey(field.bodySourceKey, field.field, c.index), {
                    sourceKey: field.bodySourceKey,
                    field: field.field,
                    index: c.index,
                    content: c.content,
                  }),
                )
              : [];
        if (result.done) {
          s.pending.fields.push({ chunkCount: s.text.written });
          s.text = null;
          s.row++;
        }
        return { targets, auth, sourceKey: field.bodySourceKey };
      }
      if (s.pending && !row.section.startsWith('w:')) bad();
      s.row++;
      if (!s.eligible || !u || u.outcome !== 'available') continue;
      if (row.section === 'base:links') {
        const permission = await before(uid, r, seed, ctx, m.sourceKey, false);
        if (permission.result.availability !== 'available') continue;
        const own = await db.runTransaction(
          async (tx) =>
            (
              await tx.getAll(
                db.doc(
                  'users/' +
                    uid +
                    '/campaignBases/' +
                    restoredBaseId(seed.l) +
                    '/items/' +
                    m.sourceKey,
                ),
                { fieldMask: ['sourceKey'] },
              )
            )[0],
        );
        if (!own.exists) continue;
        let ledgerId = null;
        if (m.target.kind === 'lore' && m.target.available) {
          const origin = (await ctx.port.lookup('base:item', keyFor(m.target.sourceKey))).value.meta
              .origin,
            ref =
              origin.kind === 'lore'
                ? { kind: 'universe', scopeId: origin.scopeId, entityId: origin.id }
                : { kind: 'adventure', scopeId: origin.adventureId, entityId: origin.id };
          ledgerId = digest(ref);
        }
        return {
          targets: [
            target('links', u.id, {
              kind: m.kind,
              sourceKey: m.sourceKey,
              referenceMode: 'portable',
              portableReference: { schemaVersion: 1, target: m.target, ledgerId },
            }),
          ],
          auth: [permission],
          sourceKey: m.sourceKey,
        };
      }
      if (row.section === 'base:loreReferences') {
        const auth = await before(uid, r, seed, ctx, null);
        s.counts.reference = integer(s.counts.reference + 1);
        return {
          targets: [
            target('loreReferences', u.id, {
              referenceKey: u.id,
              processed: true,
              referenceMode: 'portable',
              portableReference: {
                schemaVersion: 1,
                target: { kind: 'lore', sourceKey: m.targetKey, available: m.available },
              },
            }),
          ],
          auth: [auth],
          sourceKey: null,
        };
      }
    }
    return { targets: [], auth: [], sourceKey: null };
  }
  return {
    async advanceCampaignRestoreBase(uid, input) {
      authorize(uid);
      const r = { ...mutation(input, ['limit']), limit: integer(input.limit, 1, 25) },
        fp = fingerprint('materialize-base', r),
        seed = await db.runTransaction(async (tx) => {
          const l = await store.load(tx, uid, r.restoreId, r.jobToken),
            op = await store.operation(tx, l, r.operationId, fp);
          if (op) return { replay: store.confirm(l, op) };
          if (l.job.checkpoint !== r.expectedCheckpoint)
            fail('failed-precondition', 'checkpoint-conflict');
          ready(l);
          if (l.job.baseMaterialization?.phase === 'ready')
            fail('failed-precondition', 'state-conflict');
          return { l, key: await store.key(tx, l, true) };
        });
      if (seed.replay) return seed.replay;
      try {
        const ctx = await context(uid, r);
        let s;
        if (seed.l.job.baseMaterialization) s = decode(seed.l, seed.key, ctx);
        else {
          const allowed = ctx.port.context.active
              ? await before(uid, r, seed, ctx, null, false)
              : null,
            eligible = allowed?.result.availability === 'available';
          s = {
            schemaVersion: 1,
            scope: binding(ctx),
            phase: 'copying',
            row: 0,
            written: 0,
            audited: 0,
            eligible,
            availability: ctx.port.context.active
              ? eligible
                ? 'available'
                : 'unavailable'
              : ctx.port.context.baseWitness[2],
            pending: null,
            text: null,
            counts: emptyCaptureCounts(),
            omitted: 0,
          };
        }
        const work = await action(uid, r, seed, ctx, s),
          final = await context(uid, r);
        if (binding(final) !== s.scope) bad();
        const prior = await db.runTransaction(async (tx) => {
          const l = await store.load(tx, uid, r.restoreId, r.jobToken),
            op = await store.operation(tx, l, r.operationId, fp);
          if (op) return store.confirm(l, op);
          if (l.job.checkpoint !== r.expectedCheckpoint)
            fail('failed-precondition', 'checkpoint-conflict');
          ready(l);
          if (digest(l.job) !== digest(seed.l.job)) bad();
          if (!l.job.baseMaterialization) await writes.empty(tx, l);
          for (const a of work.auth) {
            const current = await resource(tx, l, seed.key, ctx, a.sourceKey);
            if (current.availability !== 'available' || current.proof !== a.result.proof)
              originReviewChanged();
          }
          const next = structuredClone(s);
          if (work.audit) {
            next.audited = await writes.audit(tx, l, next.audited, r.limit, async (journal) => {
              if (
                (await resource(tx, l, seed.key, ctx, journal.sourceKey)).availability !==
                'available'
              )
                originReviewChanged();
            });
            if (next.audited === next.written) next.phase = 'ready';
          }
          const write = work.targets.length
            ? await writes.prepare(tx, l, r.operationId, work.targets, {
                sourceKey: work.sourceKey,
              })
            : null;
          if (write) next.written++;
          const bytes = Buffer.from(JSON.stringify(next));
          if (bytes.length > BASE_MATERIALIZATION_BYTES) bad();
          store.commit(
            tx,
            l,
            r,
            'materialize-base',
            fp,
            {
              baseMaterialization: {
                ...projection(next, ctx.port.certificate.rows),
                checkpoint: r.expectedCheckpoint + 1,
                payload: seal(seed.key.bytes, bytes, aad(l, r.expectedCheckpoint + 1)),
              },
            },
            write?.effect ?? null,
          );
          write?.commit();
          return null;
        });
        return prior ?? store.after(uid, r.restoreId, r.operationId, fp);
      } finally {
        seed.key.bytes.fill(0);
      }
    },
    async getCampaignRestoreBase(uid, input) {
      authorize(uid);
      closed(input, ['restoreId', 'jobToken']);
      const r = { restoreId: id(input.restoreId), jobToken: hash(input.jobToken) },
        seed = await db.runTransaction(async (tx) => {
          const l = await store.load(tx, uid, r.restoreId, r.jobToken);
          ready(l);
          if (l.job.baseMaterialization?.phase !== 'ready')
            fail('failed-precondition', 'base-materialization-incomplete');
          return { l, key: await store.key(tx, l, true) };
        });
      try {
        const ctx = await context(uid, r),
          s = decode(seed.l, seed.key, ctx);
        await db.runTransaction(async (tx) => {
          const l = await store.load(tx, uid, r.restoreId, r.jobToken);
          ready(l);
          if (digest(l.job) !== digest(seed.l.job))
            fail('failed-precondition', 'checkpoint-conflict');
          if (
            s.eligible &&
            (await resource(tx, l, seed.key, ctx, null)).availability !== 'available'
          )
            originReviewChanged();
        });
        return {
          validation: 'campaign-base-materialized-only',
          campaignId: seed.l.job.campaignId,
          baseId: s.eligible ? restoredBaseId(seed.l) : null,
          availability: s.availability,
          counts: s.counts,
          omitted: s.omitted,
          manifest: ctx.proof.manifest,
          archive: ctx.proof.archive,
        };
      } finally {
        seed.key.bytes.fill(0);
      }
    },
  };
}
