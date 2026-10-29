import { seal, open } from './campaignRestoreCrypto.mjs';
import {
  RESTORE_DOMAIN,
  closed,
  integer,
  hash,
  id,
  chunkId,
  digest,
  bad,
  immutable,
  sameBirth,
} from './campaignRestoreContracts.mjs';
import { families } from './campaignBackupOwnChecks.mjs';
import { campaignManifestId } from './portableCampaignManifest.mjs';
export const REVIEW_ROW_META = [
  'schemaVersion',
  'ownerId',
  'restoreId',
  'campaignId',
  'jobToken',
  'index',
  'kind',
  'identityHash',
  'byteLength',
  'cipherHash',
  'createdByOperationId',
];
const identity = (family, id) => digest(['own', family, id]);
const aad = (l, index) => [RESTORE_DOMAIN, l.uid, l.rid, l.token, 'review-row', 'own', index];
export function createCampaignRestoreReviewIndex(store) {
  const { db } = store,
    ref = (l, index) => db.doc(l.ref.path + '/reviewRows/' + chunkId(index));
  function draft(l, key, index, row, operationId) {
    integer(index, 0, 0xfffffffe);
    closed(row, ['index', 'family', 'id', 'value']);
    if (row.index !== index || !families.includes(row.family)) bad();
    campaignManifestId(row.id);
    const bytes = Buffer.from(JSON.stringify(row));
    if (bytes.length > 32768) bad();
    const payload = seal(key.bytes, bytes, aad(l, index)),
      meta = {
        schemaVersion: 1,
        ownerId: l.uid,
        restoreId: l.rid,
        campaignId: l.job.campaignId,
        jobToken: l.token,
        index,
        kind: 'own',
        identityHash: identity(row.family, row.id),
        byteLength: bytes.length,
        cipherHash: digest(payload),
        createdByOperationId: operationId,
      };
    return {
      ref: ref(l, index),
      value: { ...meta, payload },
      proof: { index, metadataHash: digest(meta) },
    };
  }
  async function verify(tx, l, snapshot, full = false) {
    if (!snapshot.exists) bad();
    const v = closed(snapshot.data(), full ? [...REVIEW_ROW_META, 'payload'] : REVIEW_ROW_META);
    if (
      v.schemaVersion !== 1 ||
      v.ownerId !== l.uid ||
      v.restoreId !== l.rid ||
      v.campaignId !== l.job.campaignId ||
      v.jobToken !== l.token ||
      v.kind !== 'own' ||
      snapshot.id !== chunkId(v.index) ||
      v.index >= (l.job.reviewIndex?.rows ?? 0)
    )
      bad();
    integer(v.index);
    integer(v.byteLength, 1, 32768);
    hash(v.identityHash);
    hash(v.cipherHash);
    immutable(snapshot);
    const op = await store.operation(tx, l, id(v.createdByOperationId)),
      rows = op?.value.effect?.rows;
    if (
      !op ||
      op.value.action !== 'review-own-index' ||
      !sameBirth(snapshot, op.snapshot) ||
      !Array.isArray(rows) ||
      rows.length < 1 ||
      rows.length > 25 ||
      rows.filter(
        (p) =>
          p.index === v.index &&
          p.metadataHash === digest(Object.fromEntries(REVIEW_ROW_META.map((k) => [k, v[k]]))),
      ).length !== 1
    )
      bad();
    if (full && v.cipherHash !== digest(v.payload)) bad();
    return v;
  }
  function decode(l, key, v) {
    let row;
    try {
      row = JSON.parse(open(key.bytes, v.payload, aad(l, v.index), 32768).toString('utf8'));
    } catch {
      bad();
    }
    closed(row, ['index', 'family', 'id', 'value']);
    if (
      row.index !== v.index ||
      !families.includes(row.family) ||
      identity(row.family, row.id) !== v.identityHash ||
      Buffer.byteLength(JSON.stringify(row)) !== v.byteLength
    )
      bad();
    campaignManifestId(row.id);
    return row;
  }
  async function lookup(tx, l, key, family, id) {
    const rows = (
      await tx.get(
        db
          .collection(l.ref.path + '/reviewRows')
          .where('identityHash', '==', identity(family, id))
          .limit(2),
      )
    ).docs;
    if (rows.length !== 1) bad();
    const row = decode(l, key, await verify(tx, l, rows[0], true));
    if (row.family !== family || row.id !== id) bad();
    return row;
  }
  async function page(tx, l, key, start, limit) {
    integer(start);
    integer(limit, 1, 25);
    if (start + limit > (l.job.reviewIndex?.rows ?? 0)) bad();
    const snapshots = await Promise.all(
      Array.from({ length: limit }, (_, n) => tx.get(ref(l, start + n))),
    );
    const values = await Promise.all(snapshots.map((s) => verify(tx, l, s, true)));
    // Authenticate the whole page before dependent lookup.
    return values.map((v) => decode(l, key, v));
  }
  async function available(tx, l, drafts) {
    for (const d of drafts) {
      if (
        (await tx.get(d.ref)).exists ||
        (
          await tx.get(
            db
              .collection(l.ref.path + '/reviewRows')
              .where('identityHash', '==', d.value.identityHash)
              .select()
              .limit(1),
          )
        ).docs.length
      )
        bad();
    }
  }
  async function cleanup(tx, l, request, fp) {
    const rows = (
      await tx.get(
        db
          .collection(l.ref.path + '/reviewRows')
          .orderBy('__name__')
          .select(...REVIEW_ROW_META)
          .limit(request.limit + 1),
      )
    ).docs;
    const control = l.job.reviewIndex ?? { schemaVersion: 1, rows: 0, cleanedRows: 0 },
      count = Math.min(rows.length, request.limit),
      from = control.cleanedRows;
    if (from + count > control.rows || (!rows.length && from !== control.rows)) bad();
    if (!rows.length) return false;
    for (let n = 0; n < count; n++) {
      if (rows[n].id !== chunkId(from + n)) bad();
      await verify(tx, l, rows[n]);
    }
    if (from + count === control.rows && rows.length !== count) bad();
    store.commit(tx, l, request, 'cleanup', fp, {
      reviewIndex: { ...control, cleanedRows: from + count },
    });
    for (const row of rows.slice(0, count)) tx.delete(row.ref);
    return true;
  }
  return { draft, verify, lookup, page, available, cleanup };
}
