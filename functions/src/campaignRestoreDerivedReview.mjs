import { readCampaignBackupFrame } from './campaignBackupContainer.mjs';
import {
  campaignFileJson,
  campaignFileHeader,
  campaignFileUnit,
  campaignFileWitness,
} from './campaignBackupFileRecords.mjs';
import { campaignTextUnit } from './campaignBackupTextChunks.mjs';
import { campaignDerivedBad as invalid } from './campaignBackupDerivedContent.mjs';
import {
  createCampaignDerivedStageState,
  createCampaignDerivedStaging,
} from './campaignBackupDerivedStaging.mjs';
import { createCampaignRestoreDerivedIndex } from './campaignRestoreDerivedIndex.mjs';
import { DERIVED_STATE_BYTES } from './campaignRestoreDerivedFormat.mjs';
import { readCampaignRestoreJsonUnit } from './campaignRestoreJsonUnit.mjs';
import { seal, open } from './campaignRestoreCrypto.mjs';
import {
  RESTORE_DOMAIN,
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
const JSON_BYTES = 4 * 1024 * 1024,
  aad = (l, n) => [RESTORE_DOMAIN, l.uid, l.rid, l.token, 'derived-index', n];
const projection = (s, rows) => ({
  schemaVersion: 1,
  phase: s.phase,
  checkpoint: 0,
  records: s.cursor.records,
  offset: s.cursor.offset,
  rows,
});
function utf8(bytes, saved, final) {
  if (typeof saved !== 'string' || saved.length > 4) invalid();
  const tail = Buffer.from(saved, 'base64');
  if (tail.length > 3 || tail.toString('base64') !== saved) invalid();
  const b = Buffer.concat([tail, bytes]);
  try {
    new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(b, { stream: !final });
  } catch {
    invalid();
  }
  if (final || !b.length) return '';
  let pos = b.length - 1;
  while (pos >= 0 && (b[pos] & 0xc0) === 0x80) pos--;
  if (pos < 0) invalid();
  const c = b[pos],
    width = c >= 0xf0 ? 4 : c >= 0xe0 ? 3 : c >= 0xc0 ? 2 : 1;
  return b.length - pos < width ? b.subarray(pos).toString('base64') : '';
}
function state(l, key) {
  if (!l.job.derivedReview)
    return {
      schemaVersion: 1,
      phase: 'indexing',
      cursor: null,
      active: null,
      staging: createCampaignDerivedStageState(),
    };
  let s;
  try {
    s = JSON.parse(
      open(
        key.bytes,
        l.job.derivedReview.payload,
        aad(l, l.job.derivedReview.checkpoint),
        DERIVED_STATE_BYTES,
      ).toString('utf8'),
    );
  } catch {
    bad();
  }
  closed(s, ['schemaVersion', 'phase', 'cursor', 'active', 'staging']);
  if (
    s.schemaVersion !== 1 ||
    digest({
      ...projection(s, l.job.derivedIndex.rows),
      checkpoint: l.job.derivedReview.checkpoint,
    }) !==
      digest(
        Object.fromEntries(Object.entries(l.job.derivedReview).filter(([k]) => k !== 'payload')),
      ) ||
    digest(s.staging.sizes) !== digest(l.job.derivedIndex.sizes) ||
    s.staging.stored !== l.job.derivedIndex.rows ||
    (s.phase === 'indexed' && (s.active || !s.cursor.done))
  )
    bad();
  return s;
}
/** Internal staging certificate only; current origin access and semantic checks are separate. */
export function createCampaignRestoreDerivedReview({ store, openSource, ownSemantics }) {
  const { db } = store,
    index = createCampaignRestoreDerivedIndex(store);
  async function authority(uid, r) {
    return ownSemantics(uid, { restoreId: r.restoreId, jobToken: r.jobToken });
  }
  async function requireReady(tx, uid, r) {
    const l = await store.load(tx, uid, r.restoreId, r.jobToken);
    if (l.job.state !== 'bytes-verified' || l.job.ownReview?.phase !== 'verified')
      fail('failed-precondition', 'own-review-incomplete');
    return l;
  }
  return {
    async advanceCampaignRestoreDerivedIndex(uid, input) {
      authorize(uid);
      const r = { ...mutation(input, ['limit']), limit: integer(input.limit, 1, 25) },
        fp = fingerprint('index-derived', r),
        seed = await db.runTransaction(async (tx) => {
          const l = await store.load(tx, uid, r.restoreId, r.jobToken),
            op = await store.operation(tx, l, r.operationId, fp);
          if (op) return { replay: store.confirm(l, op) };
          if (l.job.checkpoint !== r.expectedCheckpoint)
            fail('failed-precondition', 'checkpoint-conflict');
          if (
            l.job.state !== 'bytes-verified' ||
            l.job.ownReview?.phase !== 'verified' ||
            l.job.derivedReview?.phase === 'indexed'
          )
            fail('failed-precondition', 'state-conflict');
          return { l, key: await store.key(tx, l, true) };
        });
      if (seed.replay) return seed.replay;
      try {
        const own = await authority(uid, r),
          source = await openSource(uid, { restoreId: r.restoreId, jobToken: r.jobToken }),
          s = state(seed.l, seed.key),
          drafts = [],
          staging = createCampaignDerivedStaging(s.staging, (row) => {
            drafts.push(index.draft(seed.l, seed.key, row, r.operationId));
          });
        for (let n = 0; n < r.limit; n++) {
          const step = await readCampaignBackupFrame(source, s.cursor);
          s.cursor = step.cursor;
          if (step.seal) {
            if (
              s.active ||
              step.seal.chainHash !== own.archive.chainHash ||
              step.seal.archiveBytes !== own.archive.size
            )
              invalid();
            staging.finish(own);
            s.phase = 'indexed';
            break;
          }
          const rec = step.record;
          if (rec.kind === 'campaign') {
            const h = campaignFileJson(rec.payload, campaignFileHeader),
              m = own.manifest;
            if (
              s.cursor.records !== 1 ||
              h.contentVersion !== m.contentVersion ||
              h.provenanceVersion !== m.provenanceVersion ||
              h.originCampaignId !== m.originCampaignId ||
              h.availability !== m.availability
            )
              invalid();
          } else if (rec.kind === 'unit') {
            if (s.active) invalid();
            const unit = campaignFileJson(rec.payload, (v) =>
              campaignFileUnit(v, own.manifest.contentVersion),
            );
            if (unit.outcome === 'available') {
              const json =
                !unit.section.startsWith('own:') &&
                !campaignTextUnit(unit.section) &&
                unit.section !== 'image';
              if (json && unit.byteLength > JSON_BYTES) invalid();
              s.active = { id: rec.id, unit, part: 0, start: step.cursor, tail: '' };
            } else if (!unit.section.startsWith('own:'))
              await staging.unit(unit, null, own.manifest.contentVersion);
          } else if (rec.kind === 'data') {
            const a = s.active;
            if (!a || a.id !== rec.id || rec.part !== a.part) invalid();
            a.part++;
            if (campaignTextUnit(a.unit.section))
              a.tail = utf8(rec.payload, a.tail, a.part === a.unit.chunkCount);
            if (a.part === a.unit.chunkCount) {
              if (!a.unit.section.startsWith('own:')) {
                const json = !campaignTextUnit(a.unit.section) && a.unit.section !== 'image',
                  payload = json
                    ? await readCampaignRestoreJsonUnit(source, a, invalid, JSON_BYTES)
                    : null;
                await staging.unit(a.unit, payload, own.manifest.contentVersion);
              }
              s.active = null;
            }
          } else if (rec.kind === 'witness') {
            if (s.active) invalid();
            await staging.witness(campaignFileJson(rec.payload, campaignFileWitness, 65536));
          } else if (rec.kind === 'attestation') {
            if (s.active) invalid();
          } else invalid();
        }
        const bytes = Buffer.from(JSON.stringify(s));
        if (bytes.length > DERIVED_STATE_BYTES) bad();
        const rows = s.staging.stored,
          derivedReview = {
            ...projection(s, rows),
            checkpoint: r.expectedCheckpoint + 1,
            payload: seal(seed.key.bytes, bytes, aad(seed.l, r.expectedCheckpoint + 1)),
          },
          derivedIndex = {
            schemaVersion: 1,
            rows,
            cleanedRows: 0,
            sizes: s.staging.sizes,
            sealed: s.phase === 'indexed',
          };
        const prior = await db.runTransaction(async (tx) => {
          const l = await store.load(tx, uid, r.restoreId, r.jobToken),
            op = await store.operation(tx, l, r.operationId, fp);
          if (op) return store.confirm(l, op);
          if (l.job.checkpoint !== r.expectedCheckpoint)
            fail('failed-precondition', 'checkpoint-conflict');
          if (digest(l.job) !== digest(seed.l.job)) bad();
          await index.available(tx, l, drafts);
          store.commit(
            tx,
            l,
            r,
            'index-derived',
            fp,
            { derivedReview, derivedIndex },
            { rows: drafts.map((d) => d.proof) },
          );
          for (const d of drafts) {
            tx.create(d.ref, d.value);
            tx.create(d.pointer, d.pointerValue);
          }
          return null;
        });
        return prior ?? store.after(uid, r.restoreId, r.operationId, fp);
      } finally {
        seed.key.bytes.fill(0);
      }
    },
    async openCampaignRestoreDerivedIndex(uid, input) {
      authorize(uid);
      closed(input, ['restoreId', 'jobToken']);
      const r = { restoreId: id(input.restoreId), jobToken: hash(input.jobToken) },
        own = await authority(uid, r);
      const prepared = await db.runTransaction(async (tx) => {
        const l = await requireReady(tx, uid, r);
        if (l.job.derivedReview?.phase !== 'indexed' || !l.job.derivedIndex?.sealed)
          fail('failed-precondition', 'derived-index-incomplete');
        const key = await store.key(tx, l, true);
        try {
          const s = state(l, key);
          const active = createCampaignDerivedStaging(s.staging, () => bad()).finish(own);
          return {
            control: structuredClone(l.job.derivedIndex),
            context: structuredClone({ active, baseWitness: s.staging.baseWitness }),
          };
        } finally {
          key.bytes.fill(0);
        }
      });
      const control = prepared.control,
        token = digest(control);
      async function read(run) {
        return db.runTransaction(async (tx) => {
          const l = await requireReady(tx, uid, r);
          if (l.job.derivedReview?.phase !== 'indexed' || digest(l.job.derivedIndex) !== token)
            fail('failed-precondition', 'derived-index-incomplete');
          const key = await store.key(tx, l, true);
          try {
            return await run(tx, l, key);
          } finally {
            key.bytes.fill(0);
          }
        });
      }
      return Object.freeze({
        context: Object.freeze(prepared.context),
        certificate: Object.freeze({
          validation: 'campaign-derived-index-only',
          manifest: own.manifest,
          archive: own.archive,
          rows: control.rows,
          sizes: Object.freeze({ ...control.sizes }),
        }),
        read: async (start, limit) => {
          integer(start);
          integer(limit, 1, 25);
          return read((tx, l, k) => index.page(tx, l, k, start, limit));
        },
        lookup: (section, key) => read((tx, l, k) => index.lookup(tx, l, k, section, key)),
        reverse: (kind, key) => read((tx, l, k) => index.reverse(tx, l, k, kind, key)),
      });
    },
  };
}
