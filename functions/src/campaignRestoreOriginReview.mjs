import { createSHA256 } from 'hash-wasm';
import {
  createCampaignOriginPassState,
  prepareCampaignOriginWitness,
  applyCampaignOriginDecision,
  finishCampaignOriginPass,
  originIndexBad as invalid,
} from './campaignBackupOriginChecks.mjs';
import {
  campaignOriginClock,
  readCampaignOriginWitnessAccess,
  originReviewChanged,
} from './campaignBackupOriginAccess.mjs';
import { ORIGIN_REVIEW_BYTES } from './campaignRestoreOriginFormat.mjs';
import { seal, open } from './campaignRestoreCrypto.mjs';
import {
  RESTORE_DOMAIN,
  RESTORE_HASH_ALGORITHM,
  authorize,
  closed,
  id,
  hash,
  integer,
  mutation,
  fingerprint,
  digest,
  bad,
  fail,
} from './campaignRestoreContracts.mjs';
const aad = (l, cp) => [RESTORE_DOMAIN, l.uid, l.rid, l.token, 'origin-review', cp];
async function hasher(saved = null) {
  const h = await createSHA256();
  h.init();
  if (saved !== null) {
    if (typeof saved !== 'string' || saved.length > 5464) bad();
    const bytes = Buffer.from(saved, 'base64');
    if (!bytes.length || bytes.length > 4096 || bytes.toString('base64') !== saved) bad();
    try {
      h.load(bytes);
    } catch {
      bad();
    }
  }
  return h;
}
async function hex(h) {
  const copy = await hasher();
  copy.load(h.save());
  return copy.digest('hex');
}
const scope = (ctx, token) =>
  digest([
    token,
    ctx.proof.manifest,
    ctx.proof.archive,
    ctx.index.certificate.rows,
    ctx.index.certificate.sizes,
    ctx.project,
  ]);
const projection = (s, ctx) => ({
  schemaVersion: 1,
  phase: s.phase,
  checkpoint: 0,
  processedWitnesses: s.pass.processed,
  scannedRows: s.scannedRows,
  totalWitnesses: ctx.proof.manifest.provenance.units,
  totalRows: ctx.index.certificate.rows,
});
function decode(l, key, ctx) {
  let s;
  try {
    s = JSON.parse(
      open(
        key.bytes,
        l.job.originReview.payload,
        aad(l, l.job.originReview.checkpoint),
        ORIGIN_REVIEW_BYTES,
      ).toString('utf8'),
    );
  } catch {
    bad();
  }
  closed(s, [
    'schemaVersion',
    'codec',
    'scope',
    'clock',
    'phase',
    'pass',
    'scannedRows',
    'capture',
    'hashState',
  ]);
  closed(s.pass, Object.keys(createCampaignOriginPassState()));
  for (const k of ['processed', 'available', 'unavailable', 'none', 'globalUnavailable'])
    integer(s.pass[k]);
  if (typeof s.pass.sawBase !== 'boolean' || typeof s.pass.sawProject !== 'boolean') bad();
  if (
    s.schemaVersion !== 1 ||
    s.codec !== RESTORE_HASH_ALGORITHM ||
    s.scope !== scope(ctx, l.token) ||
    !s.hashState ||
    (s.phase === 'capture' && s.capture !== null) ||
    (s.phase !== 'capture' && !s.capture) ||
    digest({ ...projection(s, ctx), checkpoint: l.job.originReview.checkpoint }) !==
      digest(
        Object.fromEntries(Object.entries(l.job.originReview).filter(([k]) => k !== 'payload')),
      )
  )
    bad();
  hash(s.clock);
  if (s.capture) {
    closed(s.capture, [
      'witnesses',
      'derivedWitnesses',
      'organizationalUniverse',
      'available',
      'unavailable',
      'none',
      'globalUnavailable',
      'digest',
    ]);
    for (const k of [
      'witnesses',
      'derivedWitnesses',
      'available',
      'unavailable',
      'none',
      'globalUnavailable',
    ])
      integer(s.capture[k]);
    hash(s.capture.digest);
  }
  return s;
}
/** Account-clock-bound review summary only; materialization still reauthorizes every resource. */
export function createCampaignRestoreOriginReview({
  store,
  openIndex,
  derivedSemantics,
  projectWitness,
}) {
  const { db } = store;
  function assertReady(l) {
    if (l.job.state !== 'bytes-verified' || l.job.derivedCheck?.phase !== 'verified')
      fail('failed-precondition', 'derived-check-incomplete');
  }
  async function context(uid, r) {
    const ref = { restoreId: r.restoreId, jobToken: r.jobToken },
      proof = await derivedSemantics(uid, ref),
      index = await openIndex(uid, ref),
      project = await projectWitness(uid, ref);
    if (
      digest(proof.manifest) !== digest(index.certificate.manifest) ||
      digest(proof.archive) !== digest(index.certificate.archive) ||
      (proof.manifest.provenanceVersion === 2) !== Boolean(project)
    )
      bad();
    return { proof, index, project };
  }
  async function currentClock(uid, r, expected) {
    return db.runTransaction(async (tx) => {
      const l = await store.load(tx, uid, r.restoreId, r.jobToken);
      assertReady(l);
      if (l.job.checkpoint !== r.expectedCheckpoint)
        fail('failed-precondition', 'checkpoint-conflict');
      return campaignOriginClock(tx, db, uid, expected);
    });
  }
  return {
    async advanceCampaignRestoreOriginReview(uid, input) {
      authorize(uid);
      const r = { ...mutation(input, ['limit']), limit: integer(input.limit, 1, 25) },
        fp = fingerprint('review-origins', r),
        seed = await db.runTransaction(async (tx) => {
          const l = await store.load(tx, uid, r.restoreId, r.jobToken),
            op = await store.operation(tx, l, r.operationId, fp);
          if (op) return { replay: store.confirm(l, op) };
          if (l.job.checkpoint !== r.expectedCheckpoint)
            fail('failed-precondition', 'checkpoint-conflict');
          assertReady(l);
          if (l.job.originReview?.phase === 'verified')
            fail('failed-precondition', 'state-conflict');
          return { l, key: await store.key(tx, l, true) };
        });
      if (seed.replay) return seed.replay;
      try {
        const ctx = await context(uid, r);
        let s, h;
        if (seed.l.job.originReview) {
          s = decode(seed.l, seed.key, ctx);
          await currentClock(uid, r, s.clock);
          h = await hasher(s.hashState);
        } else {
          const clock = await currentClock(uid, r);
          s = {
            schemaVersion: 1,
            codec: RESTORE_HASH_ALGORITHM,
            scope: scope(ctx, r.jobToken),
            clock,
            phase: 'capture',
            pass: createCampaignOriginPassState(),
            scannedRows: 0,
            capture: null,
            hashState: null,
          };
          h = await hasher();
          h.update(
            JSON.stringify([
              'writer-campaign-origin-review-v1',
              uid,
              ctx.proof.archive.chainHash,
              clock,
            ]) + '\n',
          );
        }
        async function process(record) {
          const ordinal = s.pass.processed,
            prepared = prepareCampaignOriginWitness(s.pass, ctx.proof, ordinal, record),
            result = await db.runTransaction(async (tx) => {
              const l = await store.load(tx, uid, r.restoreId, r.jobToken);
              assertReady(l);
              if (l.job.checkpoint !== r.expectedCheckpoint)
                fail('failed-precondition', 'checkpoint-conflict');
              return readCampaignOriginWitnessAccess(tx, db, uid, s.clock, prepared, record);
            }),
            decision = applyCampaignOriginDecision(s.pass, ordinal, record, result);
          h.update(JSON.stringify([decision, result.proof]) + '\n');
        }
        let remaining = r.limit;
        if (ctx.project && !s.pass.sawProject) {
          await process(ctx.project);
          remaining--;
        }
        if (remaining && s.scannedRows < ctx.index.certificate.rows) {
          const length = Math.min(remaining, ctx.index.certificate.rows - s.scannedRows),
            page = await ctx.index.read(s.scannedRows, length); // Authenticate the full bounded page first.
          for (const row of page) {
            if (row.section.startsWith('w:')) {
              const record = row.value.record;
              if (row.section !== 'w:' + record[0]) invalid();
              await process(record);
            }
            s.scannedRows++;
          }
        }
        if (s.scannedRows === ctx.index.certificate.rows) {
          const summary = finishCampaignOriginPass(
            s.pass,
            ctx.proof,
            ctx.proof.manifest.provenance.units,
            await hex(h),
          );
          await currentClock(uid, r, s.clock);
          if (s.phase === 'capture') {
            s.capture = summary;
            s.phase = 'recheck';
            s.pass = createCampaignOriginPassState();
            s.scannedRows = 0;
            h = await hasher();
            h.update(
              JSON.stringify([
                'writer-campaign-origin-review-v1',
                uid,
                ctx.proof.archive.chainHash,
                s.clock,
              ]) + '\n',
            );
          } else {
            if (JSON.stringify(s.capture) !== JSON.stringify(summary)) originReviewChanged();
            s.phase = 'verified';
            const finalContext = await context(uid, r);
            if (scope(finalContext, r.jobToken) !== s.scope) bad();
          }
        }
        s.hashState = Buffer.from(h.save()).toString('base64');
        const bytes = Buffer.from(JSON.stringify(s));
        if (bytes.length > ORIGIN_REVIEW_BYTES) bad();
        const originReview = {
            ...projection(s, ctx),
            checkpoint: r.expectedCheckpoint + 1,
            payload: seal(seed.key.bytes, bytes, aad(seed.l, r.expectedCheckpoint + 1)),
          },
          prior = await db.runTransaction(async (tx) => {
            const l = await store.load(tx, uid, r.restoreId, r.jobToken),
              op = await store.operation(tx, l, r.operationId, fp);
            if (op) return store.confirm(l, op);
            if (l.job.checkpoint !== r.expectedCheckpoint)
              fail('failed-precondition', 'checkpoint-conflict');
            assertReady(l);
            if (digest(l.job) !== digest(seed.l.job)) bad();
            await campaignOriginClock(tx, db, uid, s.clock);
            store.commit(
              tx,
              l,
              r,
              'review-origins',
              fp,
              { originReview },
              { phase: s.phase, processedWitnesses: s.pass.processed, scannedRows: s.scannedRows },
            );
            return null;
          });
        return prior ?? store.after(uid, r.restoreId, r.operationId, fp);
      } finally {
        seed.key.bytes.fill(0);
      }
    },
    async restartCampaignRestoreOriginReview(uid, input) {
      authorize(uid);
      const r = mutation(input),
        fp = fingerprint('restart-origins', r);
      const prior = await db.runTransaction(async (tx) => {
        const l = await store.load(tx, uid, r.restoreId, r.jobToken),
          op = await store.operation(tx, l, r.operationId, fp);
        if (op) return store.confirm(l, op);
        if (l.job.checkpoint !== r.expectedCheckpoint)
          fail('failed-precondition', 'checkpoint-conflict');
        assertReady(l);
        if (!l.job.originReview) fail('failed-precondition', 'origin-review-not-started');
        store.commit(tx, l, r, 'restart-origins', fp, { originReview: null });
        return null;
      });
      return prior ?? store.after(uid, r.restoreId, r.operationId, fp);
    },
    async getCampaignRestoreOriginReview(uid, input) {
      authorize(uid);
      closed(input, ['restoreId', 'jobToken']);
      const r = { restoreId: id(input.restoreId), jobToken: hash(input.jobToken) },
        seed = await db.runTransaction(async (tx) => {
          const l = await store.load(tx, uid, r.restoreId, r.jobToken);
          assertReady(l);
          if (l.job.originReview?.phase !== 'verified')
            fail('failed-precondition', 'origin-review-incomplete');
          return { l, key: await store.key(tx, l, true) };
        });
      try {
        const ctx = await context(uid, r),
          s = decode(seed.l, seed.key, ctx),
          h = await hasher(s.hashState),
          summary = finishCampaignOriginPass(
            s.pass,
            ctx.proof,
            ctx.proof.manifest.provenance.units,
            h.digest('hex'),
          );
        if (JSON.stringify(summary) !== JSON.stringify(s.capture)) originReviewChanged();
        await db.runTransaction(async (tx) => {
          const live = await store.load(tx, uid, r.restoreId, r.jobToken);
          assertReady(live);
          if (digest(live.job) !== digest(seed.l.job))
            fail('failed-precondition', 'checkpoint-conflict');
          await campaignOriginClock(tx, db, uid, s.clock);
        });
        return Object.freeze({
          validation: 'campaign-origin-review-only',
          manifest: ctx.proof.manifest,
          archive: ctx.proof.archive,
          origins: summary,
        });
      } finally {
        seed.key.bytes.fill(0);
      }
    },
  };
}
