import { parseCampaignDerivedUnit } from './campaignBackupDerivedContent.mjs';
import { readCampaignRestoreJsonUnit } from './campaignRestoreJsonUnit.mjs';
import { createCampaignRestoreDerivedIndex } from './campaignRestoreDerivedIndex.mjs';
import { createCampaignRestoreVariantWrites } from './campaignRestoreVariantWrites.mjs';
import { createCampaignRestoreVariantOrigin } from './campaignRestoreVariantOrigin.mjs';
import {
  VARIANT_MATERIALIZATION_BYTES,
  restoredLoreGenerationId,
} from './campaignRestoreVariantFormat.mjs';
import { restoredBaseId } from './campaignRestoreBaseFormat.mjs';
import { campaignIdentityToken } from './campaignIdentity.mjs';
import { bodyPlan, variantChunkId } from './campaignLoreContracts.mjs';
import { PORTABLE_VARIANT_BODY_CODEC } from './campaignVariantBodyCodec.mjs';
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

const aad = (l, cp) => [RESTORE_DOMAIN, l.uid, l.rid, l.token, 'variant-materialization', cp],
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
    variants: s.variants,
    omitted: s.omitted,
  }),
  target = (collection, id, value) => ({ collection, id, value });
function decode(l, key, ctx) {
  let s;
  try {
    s = JSON.parse(
      open(
        key.bytes,
        l.job.variantMaterialization.payload,
        aad(l, l.job.variantMaterialization.checkpoint),
        VARIANT_MATERIALIZATION_BYTES,
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
    'availability',
    'variants',
    'omitted',
    'pending',
  ]);
  if (
    s.schemaVersion !== 1 ||
    s.scope !== binding(ctx) ||
    digest({
      ...projection(s, ctx.port.certificate.rows),
      checkpoint: l.job.variantMaterialization.checkpoint,
    }) !==
      digest(
        Object.fromEntries(
          Object.entries(l.job.variantMaterialization).filter(([k]) => k !== 'payload'),
        ),
      )
  )
    bad();
  if (s.pending) {
    closed(s.pending, ['row', 'chunk', 'authorizationHash']);
    if (s.pending.row !== s.row) bad();
    integer(s.pending.chunk, 1, 100);
    hash(s.pending.authorizationHash);
  }
  return s;
}
export function createCampaignRestoreVariantMaterialization({
  store,
  openIndex,
  derivedSemantics,
  openSource,
}) {
  const { db } = store,
    index = createCampaignRestoreDerivedIndex(store),
    writes = createCampaignRestoreVariantWrites(store),
    origins = createCampaignRestoreVariantOrigin(store, index);
  function ready(l) {
    if (
      l.job.state !== 'bytes-verified' ||
      l.job.derivedCheck?.phase !== 'verified' ||
      l.job.ownMaterialization?.phase !== 'ready' ||
      l.job.baseMaterialization?.phase !== 'ready'
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
  async function before(uid, r, seed, ctx, row) {
    return db.runTransaction(async (tx) => {
      const l = await store.load(tx, uid, r.restoreId, r.jobToken);
      ready(l);
      if (l.job.checkpoint !== r.expectedCheckpoint)
        fail('failed-precondition', 'checkpoint-conflict');
      if (
        l.job.baseMaterialization.availability === 'available' &&
        (await origins.base(tx, l, ctx)).availability !== 'available'
      )
        originReviewChanged();
      return origins.authorization(tx, l, seed.key, ctx, row);
    });
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
    if (s.availability === 'available') await before(uid, r, seed, ctx, null);
    for (let n = 0; n < r.limit; n++) {
      if (s.phase === 'audit') return { targets: [], audit: true, row: null, permission: null };
      if (s.phase === 'root') {
        s.phase = 'audit';
        if (s.availability !== 'available') continue;
        const permission = await before(uid, r, seed, ctx, null),
          generationId = restoredLoreGenerationId(seed.l);
        return {
          targets: [
            target('root', generationId, {
              schemaVersion: 1,
              id: generationId,
              ownerId: uid,
              campaignId: seed.l.job.campaignId,
              campaignToken: campaignIdentityToken(uid, seed.l.job.campaignId, seed.l.snapshot),
              baseId: restoredBaseId(seed.l),
              state: 'preparing',
              variantCount: s.variants,
            }),
          ],
          row: null,
          permission,
        };
      }
      if (s.row === ctx.port.certificate.rows) {
        if (s.pending) bad();
        s.phase = 'root';
        continue;
      }
      const row = (await ctx.port.read(s.row, 1))[0],
        v = row.value;
      if (row.section !== 'variant') {
        s.row++;
        continue;
      }
      if (v.unit.outcome !== 'available' || s.availability !== 'available') {
        if (s.pending) bad();
        s.row++;
        s.omitted++;
        continue;
      }
      const permission = await before(uid, r, seed, ctx, row.index);
      if (s.pending && permission.proof !== s.pending.authorizationHash) originReviewChanged();
      if (permission.availability !== 'available') {
        if (s.pending) originReviewChanged();
        s.row++;
        s.omitted++;
        continue;
      }
      const dto = await json(uid, r, row, ctx),
        campaignToken = campaignIdentityToken(uid, seed.l.job.campaignId, seed.l.snapshot),
        scope = {
          campaignId: seed.l.job.campaignId,
          campaignToken,
          base: { id: restoredBaseId(seed.l) },
          generationId: restoredLoreGenerationId(seed.l),
        },
        body = dto.entity
          ? bodyPlan(
              scope,
              dto.sourceKey,
              1,
              {
                ...dto.entity,
                relations: dto.entity.relations.map((relation, k) =>
                  permission.relations[k]
                    ? {
                        targetKey: relation.targetKey,
                        relationType: relation.relationType,
                        description: relation.description,
                      }
                    : { targetKey: relation.targetKey, available: false },
                ),
              },
              PORTABLE_VARIANT_BODY_CODEC,
            )
          : null,
        first = s.pending?.chunk ?? 0,
        chunks = body?.chunks ?? [],
        end = Math.min(chunks.length, first + 3),
        targets = chunks
          .slice(first, end)
          .map((c) =>
            target('loreVariantBodies', variantChunkId(scope, dto.sourceKey, 1, c.index), c),
          );
      if (s.pending && first >= chunks.length) bad();
      if (end === chunks.length) {
        const overlay = {
          schemaVersion: 1,
          ownerId: uid,
          campaignId: scope.campaignId,
          campaignToken,
          baseId: scope.base.id,
          sourceKey: dto.sourceKey,
          revision: 1,
          mode: dto.mode,
          name: dto.name,
          category: dto.category,
          createdAt: seed.l.job.createdAt,
          updatedAt: seed.l.job.createdAt,
          anchor: permission.anchor,
          ...(body
            ? { bodyCodec: body.bodyCodec, manifest: body.manifest, bodyBinding: body.bodyBinding }
            : {}),
        };
        for (const key of ['previousMode', 'participation', 'retainedLegacy'])
          if (Object.hasOwn(dto, key)) overlay[key] = dto[key];
        targets.push(target('loreVariants', dto.sourceKey, overlay));
        s.row++;
        s.variants++;
        s.pending = null;
      } else s.pending = { row: row.index, chunk: end, authorizationHash: permission.proof };
      return { targets, permission, row: row.index };
    }
    return { targets: [], permission: null, row: null };
  }
  return {
    async advanceCampaignRestoreVariants(uid, input) {
      authorize(uid);
      const r = { ...mutation(input, ['limit']), limit: integer(input.limit, 1, 25) },
        fp = fingerprint('materialize-variants', r),
        seed = await db.runTransaction(async (tx) => {
          const l = await store.load(tx, uid, r.restoreId, r.jobToken),
            op = await store.operation(tx, l, r.operationId, fp);
          if (op) return { replay: store.confirm(l, op) };
          if (l.job.checkpoint !== r.expectedCheckpoint)
            fail('failed-precondition', 'checkpoint-conflict');
          ready(l);
          if (l.job.variantMaterialization?.phase === 'ready')
            fail('failed-precondition', 'state-conflict');
          return { l, key: await store.key(tx, l, true) };
        });
      if (seed.replay) return seed.replay;
      try {
        const ctx = await context(uid, r),
          s = seed.l.job.variantMaterialization
            ? decode(seed.l, seed.key, ctx)
            : {
                schemaVersion: 1,
                scope: binding(ctx),
                phase: 'copying',
                row: 0,
                written: 0,
                audited: 0,
                availability: seed.l.job.baseMaterialization.availability,
                variants: 0,
                omitted: 0,
                pending: null,
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
          if (!l.job.variantMaterialization) await writes.empty(tx, l);
          if (
            s.availability === 'available' &&
            (await origins.base(tx, l, ctx)).availability !== 'available'
          )
            originReviewChanged();
          if (action.permission) {
            const current = await origins.authorization(tx, l, seed.key, ctx, action.row);
            if (current.availability !== 'available' || current.proof !== action.permission.proof)
              originReviewChanged();
          }
          const next = structuredClone(s);
          if (action.audit) {
            // Each authorization may inspect 50 targets: bound that work to one journal.
            next.audited = await writes.audit(tx, l, next.audited, 1, async (journal) => {
              const current = await origins.authorization(tx, l, seed.key, ctx, journal.row);
              if (
                current.availability !== 'available' ||
                current.proof !== journal.authorizationHash
              )
                originReviewChanged();
            });
            if (next.audited === next.written) next.phase = 'ready';
          }
          const write = action.targets.length
            ? await writes.prepare(tx, l, r.operationId, action.targets, {
                row: action.row,
                authorizationHash: action.permission.proof,
              })
            : null;
          if (write) next.written++;
          const bytes = Buffer.from(JSON.stringify(next));
          if (bytes.length > VARIANT_MATERIALIZATION_BYTES) bad();
          store.commit(
            tx,
            l,
            r,
            'materialize-variants',
            fp,
            {
              variantMaterialization: {
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
    async getCampaignRestoreVariants(uid, input) {
      authorize(uid);
      closed(input, ['restoreId', 'jobToken']);
      const r = { restoreId: id(input.restoreId), jobToken: hash(input.jobToken) },
        seed = await db.runTransaction(async (tx) => {
          const l = await store.load(tx, uid, r.restoreId, r.jobToken);
          ready(l);
          if (l.job.variantMaterialization?.phase !== 'ready')
            fail('failed-precondition', 'variant-materialization-incomplete');
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
          validation: 'campaign-variants-materialized-only',
          campaignId: seed.l.job.campaignId,
          generationId: s.availability === 'available' ? restoredLoreGenerationId(seed.l) : null,
          availability: s.availability,
          variants: s.variants,
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
