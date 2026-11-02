import { createSHA256 } from 'hash-wasm';
import {
  advanceCampaignDerivedRow,
  createCampaignDerivedRowState,
  campaignDerivedCounts,
} from './campaignBackupDerivedRowWalk.mjs';
import { keyFor } from './campaignBackupDerivedStaging.mjs';
import { closedCampaignRecord } from './portableCampaignManifest.mjs';
import { campaignDerivedBad as invalid } from './campaignBackupDerivedContent.mjs';
import { DERIVED_STATE_BYTES } from './campaignRestoreDerivedFormat.mjs';
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
const aad = (l, cp) => [RESTORE_DOMAIN, l.uid, l.rid, l.token, 'derived-check', cp];
const scope = (port, token) =>
  digest([
    token,
    port.certificate.archive,
    port.certificate.rows,
    port.certificate.sizes,
    port.context,
  ]);
const projection = (s, totalRows) => ({
  schemaVersion: 1,
  phase: s.counts.records === totalRows ? 'verified' : 'checking',
  checkpoint: 0,
  processedRows: s.counts.records,
  steps: s.steps,
  totalRows,
});
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
function state(l, key, port) {
  const binding = scope(port, l.token);
  if (!l.job.derivedCheck)
    return {
      schemaVersion: 1,
      codec: RESTORE_HASH_ALGORITHM,
      scope: binding,
      counts: campaignDerivedCounts(),
      steps: 0,
      walk: null,
      hashState: null,
    };
  let s;
  try {
    s = JSON.parse(
      open(
        key.bytes,
        l.job.derivedCheck.payload,
        aad(l, l.job.derivedCheck.checkpoint),
        DERIVED_STATE_BYTES,
      ).toString('utf8'),
    );
  } catch {
    bad();
  }
  closed(s, ['schemaVersion', 'codec', 'scope', 'counts', 'steps', 'walk', 'hashState']);
  closed(s.counts, Object.keys(campaignDerivedCounts()));
  for (const n of Object.values(s.counts)) integer(n);
  if (
    s.schemaVersion !== 1 ||
    s.codec !== RESTORE_HASH_ALGORITHM ||
    s.scope !== binding ||
    !s.hashState ||
    (l.job.derivedCheck.phase === 'verified' && s.walk !== null) ||
    digest({
      ...projection(s, port.certificate.rows),
      checkpoint: l.job.derivedCheck.checkpoint,
    }) !==
      digest(
        Object.fromEntries(Object.entries(l.job.derivedCheck).filter(([k]) => k !== 'payload')),
      )
  )
    bad();
  return s;
}
function readers(port) {
  return {
    async find(section, id, field = null, optional = false) {
      const key = keyFor(id, field),
        raw = await port.lookup(section, key);
      if (closedCampaignRecord(raw, ['before', 'after'])) {
        if (!optional || !['base:item', 'variant'].includes(section)) invalid();
        const { before, after } = raw,
          size = port.certificate.sizes[section] ?? 0;
        if (
          (before && (before.section !== section || before.key >= key)) ||
          (after && (after.section !== section || after.key <= key)) ||
          (before ? before.position + 1 : 0) !== (after ? after.position : size)
        )
          invalid();
        return null;
      }
      if (raw.section !== section || raw.key !== key) invalid();
      return raw;
    },
    reverse: (kind, key) => port.reverse(kind, key),
  };
}
/** Private semantic checkpoint only, never a grant for current native origins. */
export function createCampaignRestoreDerivedSemantics({ store, openIndex }) {
  const { db } = store;
  async function ready(tx, uid, r) {
    const l = await store.load(tx, uid, r.restoreId, r.jobToken);
    if (
      l.job.state !== 'bytes-verified' ||
      l.job.derivedReview?.phase !== 'indexed' ||
      !l.job.derivedIndex?.sealed
    )
      fail('failed-precondition', 'derived-index-incomplete');
    return l;
  }
  return {
    async advanceCampaignRestoreDerivedSemantics(uid, input) {
      authorize(uid);
      const r = { ...mutation(input, ['limit']), limit: integer(input.limit, 1, 25) },
        fp = fingerprint('check-derived', r),
        seed = await db.runTransaction(async (tx) => {
          const l = await store.load(tx, uid, r.restoreId, r.jobToken),
            op = await store.operation(tx, l, r.operationId, fp);
          if (op) return { replay: store.confirm(l, op) };
          if (l.job.checkpoint !== r.expectedCheckpoint)
            fail('failed-precondition', 'checkpoint-conflict');
          if (l.job.derivedCheck?.phase === 'verified')
            fail('failed-precondition', 'state-conflict');
          await ready(tx, uid, r);
          return { l, key: await store.key(tx, l, true) };
        });
      if (seed.replay) return seed.replay;
      try {
        const port = await openIndex(uid, { restoreId: r.restoreId, jobToken: r.jobToken }),
          s = state(seed.l, seed.key, port),
          h = await hasher(s.hashState),
          io = readers(port);
        if (s.hashState === null)
          h.update(
            JSON.stringify([
              'writer-campaign-derived-semantics-v1',
              uid,
              port.certificate.archive.chainHash,
            ]) + '\n',
          );
        let row;
        for (let n = 0; n < r.limit && s.counts.records < port.certificate.rows; n++) {
          if (!row || row.index !== s.counts.records) [row] = await port.read(s.counts.records, 1);
          s.walk ??= createCampaignDerivedRowState(row);
          const result = await advanceCampaignDerivedRow({
            row,
            context: port.context,
            counts: s.counts,
            state: s.walk,
            readers: io,
            write: (text) => h.update(text),
          });
          s.steps++;
          if (result.done) s.walk = null;
        }
        s.hashState = Buffer.from(h.save()).toString('base64');
        const meta = projection(s, port.certificate.rows);
        if (meta.phase === 'verified') {
          const finalPort = await openIndex(uid, { restoreId: r.restoreId, jobToken: r.jobToken });
          if (scope(finalPort, r.jobToken) !== s.scope) bad();
        }
        const bytes = Buffer.from(JSON.stringify(s));
        if (bytes.length > DERIVED_STATE_BYTES) bad();
        const derivedCheck = {
          ...meta,
          checkpoint: r.expectedCheckpoint + 1,
          payload: seal(seed.key.bytes, bytes, aad(seed.l, r.expectedCheckpoint + 1)),
        };
        const prior = await db.runTransaction(async (tx) => {
          const l = await store.load(tx, uid, r.restoreId, r.jobToken),
            op = await store.operation(tx, l, r.operationId, fp);
          if (op) return store.confirm(l, op);
          if (l.job.checkpoint !== r.expectedCheckpoint)
            fail('failed-precondition', 'checkpoint-conflict');
          if (digest(l.job) !== digest(seed.l.job)) bad();
          if (
            l.job.state !== 'bytes-verified' ||
            l.job.derivedReview?.phase !== 'indexed' ||
            !l.job.derivedIndex?.sealed
          )
            fail('failed-precondition', 'derived-index-incomplete');
          store.commit(
            tx,
            l,
            r,
            'check-derived',
            fp,
            { derivedCheck },
            {
              processedRows: meta.processedRows,
              steps: meta.steps,
              complete: meta.phase === 'verified',
            },
          );
          return null;
        });
        return prior ?? store.after(uid, r.restoreId, r.operationId, fp);
      } finally {
        seed.key.bytes.fill(0);
      }
    },
    async getCampaignRestoreDerivedSemantics(uid, input) {
      authorize(uid);
      closed(input, ['restoreId', 'jobToken']);
      const r = { restoreId: id(input.restoreId), jobToken: hash(input.jobToken) },
        seed = await db.runTransaction(async (tx) => {
          const l = await ready(tx, uid, r);
          if (l.job.derivedCheck?.phase !== 'verified')
            fail('failed-precondition', 'derived-check-incomplete');
          return { l, key: await store.key(tx, l, true) };
        });
      try {
        const port = await openIndex(uid, r),
          s = state(seed.l, seed.key, port),
          h = await hasher(s.hashState);
        const proof = Object.freeze({
          validation: 'campaign-derived-semantics-only',
          manifest: port.certificate.manifest,
          archive: port.certificate.archive,
          derived: Object.freeze({ ...s.counts, digest: h.digest('hex') }),
        });
        await db.runTransaction(async (tx) => {
          const live = await ready(tx, uid, r);
          if (digest(live.job) !== digest(seed.l.job))
            fail('failed-precondition', 'checkpoint-conflict');
        });
        return proof;
      } finally {
        seed.key.bytes.fill(0);
      }
    },
  };
}
