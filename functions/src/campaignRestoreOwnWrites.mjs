import { OWN_TARGET_FIELDS, ownTargetMetadata } from './campaignRestoreOwnFormat.mjs';
import {
  closed,
  id,
  integer,
  hash,
  digest,
  chunkId,
  immutable,
  sameBirth,
  bad,
} from './campaignRestoreContracts.mjs';
export const OWN_WRITE_FIELDS = [
  'schemaVersion',
  'ownerId',
  'restoreId',
  'campaignId',
  'jobToken',
  'index',
  'createdByOperationId',
  'targets',
];
export function createCampaignRestoreOwnWrites(store) {
  const { db } = store,
    ref = (l, n) => db.doc(l.ref.path + '/ownWrites/' + chunkId(n));
  async function emptyTargets(tx, l) {
    for (const collection of Object.keys(OWN_TARGET_FIELDS))
      if (
        (
          await tx.get(
            db
              .collection('campaigns/' + l.job.campaignId + '/' + collection)
              .select()
              .limit(1),
          )
        ).docs.length
      )
        bad();
  }
  async function empty(tx, l) {
    if (
      (
        await tx.get(
          db
            .collection(l.ref.path + '/ownWrites')
            .select()
            .limit(1),
        )
      ).docs.length
    )
      bad();
    await emptyTargets(tx, l);
  }
  async function prepare(tx, l, operationId, targets) {
    if (!targets.length || targets.length > 4) bad();
    const index = l.job.ownMaterialization?.written ?? 0,
      entries = targets.map(({ collection, id: targetId, value }) => {
        if (
          !Object.hasOwn(OWN_TARGET_FIELDS, collection) ||
          typeof targetId !== 'string' ||
          !targetId ||
          targetId.includes('/')
        )
          bad();
        return {
          collection,
          id: targetId,
          metadataHash: digest(ownTargetMetadata(collection, value)),
        };
      }),
      journal = {
        schemaVersion: 1,
        ownerId: l.uid,
        restoreId: l.rid,
        campaignId: l.job.campaignId,
        jobToken: l.token,
        index,
        createdByOperationId: operationId,
        targets: entries,
      },
      journalRef = ref(l, index),
      targetRefs = entries.map((t) =>
        db.doc('campaigns/' + l.job.campaignId + '/' + t.collection + '/' + t.id),
      );
    if ((await tx.get(journalRef)).exists) bad();
    for (const r of targetRefs) if ((await tx.get(r)).exists) bad();
    return {
      effect: { write: { index, metadataHash: digest(journal) } },
      commit() {
        tx.create(journalRef, journal);
        targets.forEach((t, n) => tx.create(targetRefs[n], t.value));
      },
    };
  }
  async function verify(tx, l, snapshot) {
    if (!snapshot.exists) bad();
    const v = closed(snapshot.data(), OWN_WRITE_FIELDS);
    if (
      v.schemaVersion !== 1 ||
      v.ownerId !== l.uid ||
      v.restoreId !== l.rid ||
      v.campaignId !== l.job.campaignId ||
      v.jobToken !== l.token ||
      snapshot.id !== chunkId(v.index) ||
      v.index >= (l.job.ownMaterialization?.written ?? 0)
    )
      bad();
    integer(v.index);
    id(v.createdByOperationId);
    immutable(snapshot);
    if (!Array.isArray(v.targets) || !v.targets.length || v.targets.length > 4) bad();
    const op = await store.operation(tx, l, v.createdByOperationId);
    if (
      !op ||
      op.value.action !== 'materialize-own' ||
      !sameBirth(snapshot, op.snapshot) ||
      digest(op.value.effect) !== digest({ write: { index: v.index, metadataHash: digest(v) } })
    )
      bad();
    const refs = [],
      seen = new Set();
    for (const t of v.targets) {
      closed(t, ['collection', 'id', 'metadataHash']);
      hash(t.metadataHash);
      if (
        !Object.hasOwn(OWN_TARGET_FIELDS, t.collection) ||
        typeof t.id !== 'string' ||
        !t.id ||
        t.id.includes('/')
      )
        bad();
      const path = 'campaigns/' + l.job.campaignId + '/' + t.collection + '/' + t.id;
      if (seen.has(path)) bad();
      seen.add(path);
      const r = db.doc(path),
        target = (await tx.getAll(r, { fieldMask: OWN_TARGET_FIELDS[t.collection] }))[0];
      if (
        !target?.exists ||
        !sameBirth(target, snapshot) ||
        digest(ownTargetMetadata(t.collection, target.data())) !== t.metadataHash
      )
        bad();
      immutable(target);
      refs.push(r);
    }
    return refs;
  }
  async function audit(tx, l, start, limit) {
    const end = Math.min(l.job.ownMaterialization.written, start + limit);
    for (let n = start; n < end; n++) await verify(tx, l, await tx.get(ref(l, n)));
    return end;
  }
  async function cleanup(tx, l, request, fp) {
    const state = l.job.ownMaterialization,
      written = state?.written ?? 0,
      cleaned = state?.cleaned ?? 0,
      rows = (
        await tx.get(
          db
            .collection(l.ref.path + '/ownWrites')
            .orderBy('__name__')
            .select(...OWN_WRITE_FIELDS)
            .limit(request.limit + 1),
        )
      ).docs,
      count = Math.min(rows.length, request.limit),
      targets = [];
    if (cleaned + count > written || (!rows.length && cleaned !== written)) bad();
    for (let n = 0; n < count; n++) {
      if (rows[n].id !== chunkId(cleaned + n)) bad();
      targets.push(...(await verify(tx, l, rows[n])));
    }
    if (count) {
      if (cleaned + count === written && rows.length !== count) bad();
      store.commit(tx, l, request, 'cleanup', fp, {
        ownMaterialization: { ...state, cleaned: cleaned + count },
      });
      targets.forEach((r) => tx.delete(r));
      rows.slice(0, count).forEach((r) => tx.delete(r.ref));
      return true;
    }
    await emptyTargets(tx, l);
    return false;
  }
  return { empty, prepare, audit, verify, cleanup };
}
