import { readCampaignRestoreJsonUnit } from './campaignRestoreJsonUnit.mjs';
import { createSHA256 } from 'hash-wasm';
import { readCampaignBackupFrame } from './campaignBackupContainer.mjs';
import {
  campaignFileJson,
  campaignFileHeader,
  campaignFileUnit,
  campaignFileWitness,
} from './campaignBackupFileRecords.mjs';
import { CAMPAIGN_OWN_JSON_BYTES } from './campaignBackupOwnDefinitions.mjs';
import {
  families,
  metadata,
  checkOwnEnvelope,
  ownCounts,
  checkOwnRow,
  bad as ownBad,
} from './campaignBackupOwnChecks.mjs';
import { createCampaignRestoreReviewIndex } from './campaignRestoreReviewIndex.mjs';
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
const MAX = 65536,
  aad = (l, cp) => [RESTORE_DOMAIN, l.uid, l.rid, l.token, 'own-review', cp];
const publicState = (state, rows) => ({
  schemaVersion: 1,
  phase: state.phase,
  checkpoint: 0,
  records: state.cursor.records,
  offset: state.cursor.offset,
  rows,
  processed: state.counts.units,
});
async function loadHash(saved) {
  const h = await createSHA256();
  h.init();
  if (saved !== null) {
    if (typeof saved !== 'string' || saved.length > 5464) bad();
    const b = Buffer.from(saved, 'base64');
    if (b.toString('base64') !== saved || b.length > 4096) bad();
    try {
      h.load(b);
    } catch {
      bad();
    }
  }
  return h;
}
function decodeState(l, key) {
  if (!l.job.ownReview)
    return {
      schemaVersion: 1,
      codec: RESTORE_HASH_ALGORITHM,
      phase: 'indexing',
      cursor: null,
      active: null,
      lastRank: -1,
      lastId: null,
      root: null,
      progress: false,
      project: null,
      counts: ownCounts(),
      hashState: null,
    };
  let s;
  try {
    s = JSON.parse(
      open(key.bytes, l.job.ownReview.payload, aad(l, l.job.ownReview.checkpoint), MAX).toString(
        'utf8',
      ),
    );
  } catch {
    bad();
  }
  closed(s, [
    'schemaVersion',
    'codec',
    'phase',
    'cursor',
    'active',
    'lastRank',
    'lastId',
    'root',
    'progress',
    'project',
    'counts',
    'hashState',
  ]);
  if (
    s.schemaVersion !== 1 ||
    s.codec !== RESTORE_HASH_ALGORITHM ||
    digest({
      ...publicState(s, l.job.reviewIndex.rows),
      checkpoint: l.job.ownReview.checkpoint,
    }) !==
      digest(Object.fromEntries(Object.entries(l.job.ownReview).filter(([k]) => k !== 'payload')))
  )
    bad();
  closed(s.counts, Object.keys(ownCounts()));
  for (const value of Object.values(s.counts)) integer(value);
  if (s.phase !== 'indexing' && (s.active || !s.cursor.done || !s.hashState)) bad();
  return s;
}
const ownPayload = (source, active) =>
  readCampaignRestoreJsonUnit(source, active, ownBad, CAMPAIGN_OWN_JSON_BYTES);
/** Internal own-data semantics only. It neither grants derivative access nor activates a campaign. */
export function createCampaignRestoreOwnReview({ store, openSource, fileIntegrity }) {
  const { db } = store,
    index = createCampaignRestoreReviewIndex(store);
  async function file(uid, request) {
    return fileIntegrity(uid, { restoreId: request.restoreId, jobToken: request.jobToken });
  }
  async function seed(uid, request, fp) {
    return db.runTransaction(async (tx) => {
      const l = await store.load(tx, uid, request.restoreId, request.jobToken),
        op = await store.operation(tx, l, request.operationId, fp);
      if (op) return { replay: store.confirm(l, op) };
      if (l.job.checkpoint !== request.expectedCheckpoint)
        fail('failed-precondition', 'checkpoint-conflict');
      if (
        l.job.state !== 'bytes-verified' ||
        l.job.fileReview?.status !== 'verified' ||
        l.job.ownReview?.phase === 'verified'
      )
        fail('failed-precondition', 'state-conflict');
      return { l, key: await store.key(tx, l, true) };
    });
  }
  return {
    async advanceCampaignRestoreOwnReview(uid, input) {
      authorize(uid);
      const request = { ...mutation(input, ['limit']), limit: integer(input.limit, 1, 25) },
        fp = fingerprint('review-own', request),
        base = await seed(uid, request, fp);
      if (base.replay) return base.replay;
      try {
        const integrity = await file(uid, request),
          s = decodeState(base.l, base.key),
          from = base.l.job.reviewIndex?.rows ?? 0,
          drafts = [];
        let action;
        if (s.phase === 'indexing') {
          action = 'review-own-index';
          const source = await openSource(uid, {
            restoreId: request.restoreId,
            jobToken: request.jobToken,
          });
          async function stage(unit, ordinal, payload) {
            const family = unit.section.slice(4),
              rank = families.indexOf(family),
              position = from + drafts.length;
            if (
              ordinal !== position ||
              rank < 0 ||
              rank < s.lastRank ||
              (rank === s.lastRank &&
                Buffer.compare(Buffer.from(unit.id), Buffer.from(s.lastId)) <= 0)
            )
              ownBad();
            const value = metadata(unit, payload);
            if (family === 'campaign') {
              if (position !== 0 || value.outcome !== 'available') ownBad();
              s.root = value;
            }
            if (family === 'progress') {
              if (position !== 1 || value.outcome !== 'available') ownBad();
              s.progress = true;
            }
            s.lastRank = rank;
            s.lastId = unit.id;
            drafts.push(
              index.draft(
                base.l,
                base.key,
                position,
                { index: position, family, id: unit.id, value },
                request.operationId,
              ),
            );
          }
          for (let n = 0; n < request.limit; n++) {
            const step = await readCampaignBackupFrame(source, s.cursor);
            s.cursor = step.cursor;
            if (step.seal) {
              if (s.active || digest(step.seal) !== digest(integrity.seal)) ownBad();
              checkOwnEnvelope(s.root, s.progress, s.project, integrity);
              s.phase = 'checking';
              const h = await loadHash(null);
              h.update(
                JSON.stringify([
                  'writer-campaign-own-semantics-v1',
                  uid,
                  integrity.seal.chainHash,
                ]) + '\n',
              );
              s.hashState = Buffer.from(h.save()).toString('base64');
              break;
            }
            const r = step.record;
            if (r.kind === 'campaign') {
              const header = campaignFileJson(r.payload, campaignFileHeader),
                m = integrity.manifest;
              if (
                s.cursor.records !== 1 ||
                header.contentVersion !== m.contentVersion ||
                header.provenanceVersion !== m.provenanceVersion ||
                header.originCampaignId !== m.originCampaignId ||
                header.availability !== m.availability
              )
                ownBad();
            } else if (r.kind === 'unit') {
              if (s.active) ownBad();
              const unit = campaignFileJson(r.payload, (v) =>
                  campaignFileUnit(v, integrity.manifest.contentVersion),
                ),
                ordinal = Number(r.id);
              if (!Number.isSafeInteger(ordinal) || String(ordinal) !== r.id) ownBad();
              if (unit.outcome === 'available') {
                if (unit.section.startsWith('own:') && unit.byteLength > CAMPAIGN_OWN_JSON_BYTES)
                  ownBad();
                s.active = { id: r.id, unit, part: 0, start: step.cursor };
              } else if (unit.section.startsWith('own:')) await stage(unit, ordinal, null);
            } else if (r.kind === 'data') {
              const a = s.active;
              if (!a || r.id !== a.id || r.part !== a.part) ownBad();
              a.part++;
              if (a.part === a.unit.chunkCount) {
                if (a.unit.section.startsWith('own:'))
                  await stage(a.unit, Number(a.id), await ownPayload(source, a));
                s.active = null;
              }
            } else if (r.kind === 'witness') {
              if (s.active) ownBad();
              const witness = campaignFileJson(r.payload, campaignFileWitness, 65536);
              if (witness[0] === 'project') s.project = { universe: witness[3].universe };
            } else if (r.kind === 'attestation') {
              if (s.active) ownBad(); // Final proof is the immutable completed integrity stage.
            } else ownBad();
          }
        } else if (s.phase === 'checking') {
          action = 'review-own-check';
          const next = await db.runTransaction(async (tx) => {
            const live = await store.load(tx, uid, request.restoreId, request.jobToken);
            if (digest(live.job) !== digest(base.l.job))
              fail('failed-precondition', 'checkpoint-conflict');
            const state = structuredClone(s),
              h = await loadHash(state.hashState),
              count = Math.min(request.limit, from - state.counts.units),
              rows = await index.page(tx, live, base.key, state.counts.units, count),
              required = async (family, id, active = true) => {
                const row = await index.lookup(tx, live, base.key, family, id);
                if (active && row.value.outcome !== 'available') ownBad();
                return row;
              };
            for (const row of rows)
              h.update(JSON.stringify(await checkOwnRow(row, state.counts, required)) + '\n');
            state.hashState = Buffer.from(h.save()).toString('base64');
            if (state.counts.units === from) state.phase = 'verified';
            return state;
          });
          Object.assign(s, next);
        } else bad();
        const rows = from + drafts.length,
          serialized = Buffer.from(JSON.stringify(s));
        if (serialized.length > MAX) bad();
        const ownReview = {
          ...publicState(s, rows),
          checkpoint: request.expectedCheckpoint + 1,
          payload: seal(base.key.bytes, serialized, aad(base.l, request.expectedCheckpoint + 1)),
        };
        const prior = await db.runTransaction(async (tx) => {
          const live = await store.load(tx, uid, request.restoreId, request.jobToken),
            op = await store.operation(tx, live, request.operationId, fp);
          if (op) return store.confirm(live, op);
          if (live.job.checkpoint !== request.expectedCheckpoint)
            fail('failed-precondition', 'checkpoint-conflict');
          if (digest(live.job) !== digest(base.l.job)) bad();
          await index.available(tx, live, drafts);
          store.commit(
            tx,
            live,
            request,
            action,
            fp,
            { ownReview, reviewIndex: { schemaVersion: 1, rows, cleanedRows: 0 } },
            { rows: drafts.map((d) => d.proof) },
          );
          for (const d of drafts) tx.create(d.ref, d.value);
          return null;
        });
        return prior ?? store.after(uid, request.restoreId, request.operationId, fp);
      } finally {
        base.key.bytes.fill(0);
      }
    },
    async getCampaignRestoreOwnSemantics(uid, input) {
      authorize(uid);
      closed(input, ['restoreId', 'jobToken']);
      const request = { restoreId: id(input.restoreId), jobToken: hash(input.jobToken) },
        base = await db.runTransaction(async (tx) => {
          const l = await store.load(tx, uid, request.restoreId, request.jobToken);
          if (l.job.ownReview?.phase !== 'verified')
            fail('failed-precondition', 'own-review-incomplete');
          return { l, key: await store.key(tx, l, true) };
        });
      try {
        const integrity = await file(uid, request),
          s = decodeState(base.l, base.key),
          h = await loadHash(s.hashState);
        checkOwnEnvelope(s.root, s.progress, s.project, integrity);
        const proof = {
          validation: 'campaign-own-semantics-only',
          manifest: integrity.manifest,
          archive: { chainHash: integrity.seal.chainHash, size: integrity.seal.archiveBytes },
          own: {
            ...s.counts,
            digest: h.digest('hex'),
            organizationalUniverse:
              integrity.manifest.provenanceVersion === 1 ? 'unproven' : 'matched',
          },
        };
        await db.runTransaction(async (tx) => {
          const live = await store.load(tx, uid, request.restoreId, request.jobToken);
          if (digest(live.job) !== digest(base.l.job))
            fail('failed-precondition', 'checkpoint-conflict');
        });
        return Object.freeze(proof);
      } finally {
        base.key.bytes.fill(0);
      }
    },
  };
}
