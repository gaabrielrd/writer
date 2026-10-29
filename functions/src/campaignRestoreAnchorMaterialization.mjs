import { readCampaignBackupFrame } from './campaignBackupContainer.mjs';
import { parseCampaignDerivedUnit } from './campaignBackupDerivedContent.mjs';
import { readCampaignRestoreJsonUnit } from './campaignRestoreJsonUnit.mjs';
import { createCampaignRestoreDerivedIndex } from './campaignRestoreDerivedIndex.mjs';
import { createCampaignRestoreAnchorWrites } from './campaignRestoreAnchorWrites.mjs';
import { createCampaignRestoreAnchorOrigin } from './campaignRestoreAnchorOrigin.mjs';
import { ANCHOR_MATERIALIZATION_BYTES } from './campaignRestoreAnchorFormat.mjs';
import { restoredBaseImage } from './campaignRestoreBaseFormat.mjs';
import { restoredAnchorBaseId } from './campaignRestoreVariantFormat.mjs';
import { advanceRestoredBaseField } from './campaignRestoreBaseField.mjs';
import { emptyCaptureCounts, baseBodyKey } from './campaignBaseContracts.mjs';
import { keyFor } from './campaignBackupDerivedStaging.mjs';
import { originReviewChanged } from './campaignBackupOriginAccess.mjs';
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

const aad = (l, cp) => [RESTORE_DOMAIN, l.uid, l.rid, l.token, 'anchor-materialization', cp],
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
    slots: s.slots,
    cleanedSlots: 0,
    anchors: s.anchors,
    reused: s.reused,
    skipped: s.skipped,
    availability: s.availability,
  }),
  target = (collection, id, value) => ({ collection, id, value });
function decode(l, key, ctx) {
  let s;
  try {
    s = JSON.parse(
      open(
        key.bytes,
        l.job.anchorMaterialization.payload,
        aad(l, l.job.anchorMaterialization.checkpoint),
        ANCHOR_MATERIALIZATION_BYTES,
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
    'slots',
    'anchors',
    'reused',
    'skipped',
    'availability',
    'pending',
    'text',
  ]);
  if (
    s.schemaVersion !== 1 ||
    s.scope !== binding(ctx) ||
    digest({
      ...projection(s, ctx.port.certificate.rows),
      checkpoint: l.job.anchorMaterialization.checkpoint,
    }) !==
      digest(
        Object.fromEntries(
          Object.entries(l.job.anchorMaterialization).filter(([k]) => k !== 'payload'),
        ),
      )
  )
    bad();
  if (s.pending) {
    closed(s.pending, [
      'index',
      'slotIndex',
      'anchorKey',
      'sourceKey',
      'authorizationHash',
      'fields',
      'stage',
    ]);
    integer(s.pending.index, 0, s.row - 1);
    integer(s.pending.slotIndex, 0, s.slots - 1);
    for (const k of ['anchorKey', 'sourceKey', 'authorizationHash']) hash(s.pending[k]);
    if (
      !['fields', 'item', 'root'].includes(s.pending.stage) ||
      !Array.isArray(s.pending.fields) ||
      s.pending.fields.length > 6
    )
      bad();
    for (const f of s.pending.fields) {
      closed(f, ['chunkCount']);
      integer(f.chunkCount, 1);
    }
  } else if (s.text) bad();
  return s;
}
export function createCampaignRestoreAnchorMaterialization({
  store,
  openIndex,
  derivedSemantics,
  openSource,
}) {
  const { db } = store,
    index = createCampaignRestoreDerivedIndex(store),
    writes = createCampaignRestoreAnchorWrites(store),
    origins = createCampaignRestoreAnchorOrigin(store, index);
  function ready(l) {
    if (
      l.job.state !== 'bytes-verified' ||
      l.job.derivedCheck?.phase !== 'verified' ||
      l.job.ownMaterialization?.phase !== 'ready' ||
      l.job.baseMaterialization?.phase !== 'ready' ||
      l.job.variantMaterialization?.phase !== 'ready'
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
  async function before(uid, r, seed, ctx, row, expected, slotIndex = null) {
    const result = await db.runTransaction(async (tx) => {
      const l = await store.load(tx, uid, r.restoreId, r.jobToken);
      ready(l);
      if (l.job.checkpoint !== r.expectedCheckpoint)
        fail('failed-precondition', 'checkpoint-conflict');
      if ((await origins.base(tx, l, ctx)).availability !== 'available') originReviewChanged();
      if (slotIndex !== null) {
        const slot = await writes.readSlot(tx, l, slotIndex);
        if (slot.value.row !== row || slot.value.authorizationHash !== expected) bad();
      }
      return origins.selection(tx, l, seed.key, ctx, row);
    });
    if (result.kind === 'unavailable' || (expected && result.decision !== expected))
      originReviewChanged();
    return result;
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
      );
    if (
      digest(parseCampaignDerivedUnit(row.value.unit, bytes, ctx.proof.manifest.contentVersion)) !==
      digest(row.value.meta)
    )
      bad();
    return JSON.parse(bytes.toString('utf8'));
  }
  async function work(uid, r, seed, ctx, s) {
    for (let step = 0; step < r.limit; step++) {
      if (s.phase === 'audit') return { targets: [], audit: true };
      if (s.pending) {
        const p = s.pending,
          row = (await ctx.port.read(p.index, 1))[0],
          owner = row.value.meta.item,
          permission = await before(uid, r, seed, ctx, p.index, p.authorizationHash, p.slotIndex),
          bind = {
            slotIndex: p.slotIndex,
            anchorKey: p.anchorKey,
            sourceKey: p.sourceKey,
            authorizationHash: p.authorizationHash,
          };
        if (permission.kind !== 'historical') bad();
        if (p.stage === 'fields') {
          if (p.fields.length === owner.fields.length) {
            p.stage = 'item';
            continue;
          }
          const current = (await ctx.port.read(s.row, 1))[0],
            field = owner.fields[p.fields.length],
            u = current.value.unit;
          if (current.section !== 'anchor:field' || u.id !== p.anchorKey || u.field !== field.field)
            bad();
          if (!s.text) {
            const location = await ctx.port.locate(current.section, current.key);
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
            targets = result.chunks.map((c) =>
              target('bodies', baseBodyKey(p.sourceKey, field.field, c.index), {
                sourceKey: p.sourceKey,
                field: field.field,
                index: c.index,
                content: c.content,
              }),
            );
          if (result.done) {
            p.fields.push({ chunkCount: s.text.written });
            s.text = null;
            s.row++;
            if (p.fields.length === owner.fields.length) p.stage = 'item';
          }
          return { targets, permission, row: p.index, bind };
        }
        const dto = await json(uid, r, row, ctx),
          witness = (await ctx.port.lookup('w:anchor', keyFor(p.sourceKey))).value.record[3],
          evidence = (source) => ({
            schemaVersion: 1,
            archiveHash: ctx.proof.archive.chainHash,
            source,
          });
        if (p.stage === 'item') {
          const value = dto.item,
            { relations = [], ...structured } = value.structured;
          value.fields = value.fields.map((f, n) => ({
            ...f,
            bodySourceKey: p.sourceKey,
            chunkCount: p.fields[n].chunkCount,
          }));
          value.structured = {
            ...structured,
            relationMode: 'portable',
            portableRelations: relations,
          };
          if (value.image)
            value.image = {
              ...value.image,
              imageKey: restoredBaseImage(seed.l, value.image.imageKey).imageKey,
            };
          value.sourceEvidence = evidence(witness.item);
          p.stage = 'root';
          return { targets: [target('items', p.sourceKey, value)], permission, row: p.index, bind };
        }
        const counts = emptyCaptureCounts();
        counts.lore = 1;
        const baseId = restoredAnchorBaseId(seed.l, p.anchorKey),
          source = dto.source;
        s.anchors++;
        s.pending = null;
        return {
          targets: [
            target('root', baseId, {
              id: baseId,
              schemaVersion: 1,
              ownerId: uid,
              campaignId: seed.l.job.campaignId,
              state: 'preparing',
              adventureId: source.adventureId,
              universeId: source.universeId,
              capturedAt: source.capturedAt,
              snapshot: {
                title: source.title,
                synopsis: source.synopsis,
                language: source.language,
              },
              counts,
              sourceMode: 'restored',
              sourceEvidence: evidence(witness.base),
            }),
          ],
          permission,
          row: p.index,
          bind,
        };
      }
      if (s.row === ctx.port.certificate.rows) {
        if (s.text || s.anchors !== s.slots) bad();
        s.phase = 'audit';
        continue;
      }
      const row = (await ctx.port.read(s.row, 1))[0];
      s.row++;
      if (row.section !== 'anchor') continue;
      if (row.value.unit.outcome !== 'available' || s.availability !== 'available') {
        s.skipped++;
        continue;
      }
      const permission = await before(uid, r, seed, ctx, row.index);
      if (permission.kind === 'omitted') {
        s.skipped++;
        continue;
      }
      if (permission.kind === 'reused') {
        s.reused++;
        return { targets: [], permission, row: row.index };
      }
      if (permission.kind !== 'historical') bad();
      const m = row.value.meta;
      s.pending = {
        index: row.index,
        slotIndex: s.slots,
        anchorKey: m.anchorKey,
        sourceKey: m.item.sourceKey,
        authorizationHash: permission.decision,
        fields: [],
        stage: 'fields',
      };
      return {
        targets: [],
        permission,
        row: row.index,
        registration: {
          row: row.index,
          anchorKey: m.anchorKey,
          sourceKey: m.item.sourceKey,
          authorizationHash: permission.decision,
        },
      };
    }
    return { targets: [] };
  }
  return {
    async advanceCampaignRestoreAnchors(uid, input) {
      authorize(uid);
      const r = { ...mutation(input, ['limit']), limit: integer(input.limit, 1, 25) },
        fp = fingerprint('materialize-anchors', r),
        seed = await db.runTransaction(async (tx) => {
          const l = await store.load(tx, uid, r.restoreId, r.jobToken),
            op = await store.operation(tx, l, r.operationId, fp);
          if (op) return { replay: store.confirm(l, op) };
          if (l.job.checkpoint !== r.expectedCheckpoint)
            fail('failed-precondition', 'checkpoint-conflict');
          ready(l);
          if (l.job.anchorMaterialization?.phase === 'ready')
            fail('failed-precondition', 'state-conflict');
          return { l, key: await store.key(tx, l, true) };
        });
      if (seed.replay) return seed.replay;
      try {
        const ctx = await context(uid, r),
          s = seed.l.job.anchorMaterialization
            ? decode(seed.l, seed.key, ctx)
            : {
                schemaVersion: 1,
                scope: binding(ctx),
                phase: 'copying',
                row: 0,
                written: 0,
                audited: 0,
                slots: 0,
                anchors: 0,
                reused: 0,
                skipped: 0,
                availability: seed.l.job.baseMaterialization.availability,
                pending: null,
                text: null,
              },
          action = await work(uid, r, seed, ctx, s),
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
          if (!l.job.anchorMaterialization) await writes.empty(tx, l);
          if (
            s.availability === 'available' &&
            (await origins.base(tx, l, ctx)).availability !== 'available'
          )
            originReviewChanged();
          if (action.permission) {
            const current = await origins.selection(tx, l, seed.key, ctx, action.row);
            if (
              current.kind !== action.permission.kind ||
              current.proof !== action.permission.proof ||
              current.decision !== action.permission.decision
            )
              originReviewChanged();
          }
          const next = structuredClone(s);
          if (action.audit) {
            next.audited = await writes.audit(tx, l, next.audited, 1, async (journal, slot) => {
              const current = await origins.selection(tx, l, seed.key, ctx, slot.row);
              if (current.kind !== 'historical' || current.decision !== journal.authorizationHash)
                originReviewChanged();
            });
            if (next.audited === next.written) next.phase = 'ready';
          }
          const effect = action.registration
            ? await writes.register(tx, l, r.operationId, action.registration)
            : action.targets.length
              ? await writes.prepare(tx, l, r.operationId, action.targets, action.bind)
              : null;
          if (action.registration) next.slots++;
          else if (effect) next.written++;
          const bytes = Buffer.from(JSON.stringify(next));
          if (bytes.length > ANCHOR_MATERIALIZATION_BYTES) bad();
          store.commit(
            tx,
            l,
            r,
            'materialize-anchors',
            fp,
            {
              anchorMaterialization: {
                ...projection(next, ctx.port.certificate.rows),
                checkpoint: r.expectedCheckpoint + 1,
                payload: seal(seed.key.bytes, bytes, aad(l, r.expectedCheckpoint + 1)),
              },
            },
            effect?.effect ?? null,
          );
          effect?.commit();
          return null;
        });
        return prior ?? store.after(uid, r.restoreId, r.operationId, fp);
      } finally {
        seed.key.bytes.fill(0);
      }
    },
    async getCampaignRestoreAnchors(uid, input) {
      authorize(uid);
      closed(input, ['restoreId', 'jobToken']);
      const r = { restoreId: id(input.restoreId), jobToken: hash(input.jobToken) },
        seed = await db.runTransaction(async (tx) => {
          const l = await store.load(tx, uid, r.restoreId, r.jobToken);
          ready(l);
          if (l.job.anchorMaterialization?.phase !== 'ready')
            fail('failed-precondition', 'anchor-materialization-incomplete');
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
            s.availability === 'available' &&
            (await origins.base(tx, l, ctx)).availability !== 'available'
          )
            originReviewChanged();
        });
        return {
          validation: 'campaign-anchors-materialized-only',
          campaignId: seed.l.job.campaignId,
          availability: s.availability,
          anchors: s.anchors,
          reused: s.reused,
          skipped: s.skipped,
          manifest: ctx.proof.manifest,
          archive: ctx.proof.archive,
        };
      } finally {
        seed.key.bytes.fill(0);
      }
    },
  };
}
