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
export const NATIVE_WRITE_FIELDS = [
  'schemaVersion',
  'ownerId',
  'restoreId',
  'campaignId',
  'jobToken',
  'index',
  'createdByOperationId',
  'targets',
];
export function createCampaignRestoreNativeWrites(
  store,
  {
    journalCollection,
    controlField,
    action,
    targetRoot,
    targetFields,
    parent = false,
    bindingFields = [],
    validateBinding = () => {},
  },
) {
  const { db } = store,
    ref = (l, n) => db.doc(l.ref.path + '/' + journalCollection + '/' + chunkId(n)),
    ownTargetMetadata = (collection, value) =>
      Object.fromEntries(
        targetFields[collection].filter((k) => Object.hasOwn(value, k)).map((k) => [k, value[k]]),
      ),
    targetRef = (l, t, binding) => {
      const root = targetRoot(l, binding);
      if (t.collection === 'root' && t.id !== root.split('/').at(-1)) bad();
      return db.doc(t.collection === 'root' ? root : root + '/' + t.collection + '/' + t.id);
    };
  async function emptyTargets(tx, l, binding = {}) {
    for (const collection of Object.keys(targetFields))
      if (collection === 'root') {
        const snapshot = (
          await tx.getAll(db.doc(targetRoot(l, binding)), { fieldMask: targetFields.root })
        )[0];
        if (snapshot.exists) bad();
      } else if (
        (
          await tx.get(
            db
              .collection(targetRoot(l, binding) + '/' + collection)
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
            .collection(l.ref.path + '/' + journalCollection)
            .select()
            .limit(1),
        )
      ).docs.length
    )
      bad();
    await emptyTargets(tx, l);
  }
  async function prepare(tx, l, operationId, targets, binding = {}) {
    closed(binding, bindingFields);
    validateBinding(binding);
    if (!targets.length || targets.length > 4) bad();
    const index = l.job[controlField]?.written ?? 0,
      entries = targets.map(({ collection, id: targetId, value }) => {
        if (
          !Object.hasOwn(targetFields, collection) ||
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
        ...binding,
        targets: entries,
      },
      journalRef = ref(l, index),
      targetRefs = entries.map((t) => targetRef(l, t, binding));
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
  async function verify(tx, l, snapshot, guard) {
    if (!snapshot.exists) bad();
    const v = closed(snapshot.data(), [...NATIVE_WRITE_FIELDS, ...bindingFields]);
    if (
      v.schemaVersion !== 1 ||
      v.ownerId !== l.uid ||
      v.restoreId !== l.rid ||
      v.campaignId !== l.job.campaignId ||
      v.jobToken !== l.token ||
      snapshot.id !== chunkId(v.index) ||
      v.index >= (l.job[controlField]?.written ?? 0)
    )
      bad();
    validateBinding(v);
    integer(v.index);
    id(v.createdByOperationId);
    immutable(snapshot);
    if (!Array.isArray(v.targets) || !v.targets.length || v.targets.length > 4) bad();
    const op = await store.operation(tx, l, v.createdByOperationId);
    if (
      !op ||
      op.value.action !== action ||
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
        !Object.hasOwn(targetFields, t.collection) ||
        typeof t.id !== 'string' ||
        !t.id ||
        t.id.includes('/')
      )
        bad();
      const path = targetRef(l, t, v).path;
      if (seen.has(path)) bad();
      seen.add(path);
      const r = db.doc(path),
        target = (await tx.getAll(r, { fieldMask: targetFields[t.collection] }))[0];
      if (
        !target?.exists ||
        !sameBirth(target, snapshot) ||
        digest(ownTargetMetadata(t.collection, target.data())) !== t.metadataHash
      )
        bad();
      immutable(target);
      refs.push(r);
    }
    await guard?.(v);
    return refs;
  }
  async function audit(tx, l, start, limit, guard) {
    const end = Math.min(l.job[controlField].written, start + limit);
    for (let n = start; n < end; n++) await verify(tx, l, await tx.get(ref(l, n)), guard);
    return end;
  }
  async function cleanup(tx, l, request, fp) {
    const state = l.job[controlField],
      written = state?.written ?? 0,
      cleaned = state?.cleaned ?? 0,
      rows = (
        await tx.get(
          db
            .collection(l.ref.path + '/' + journalCollection)
            .orderBy('__name__')
            .select(...NATIVE_WRITE_FIELDS, ...bindingFields)
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
      if (parent && targets.some((r) => r.path === targetRoot(l))) {
        const deleting = new Set(targets.map((r) => r.path));
        for (const collection of Object.keys(targetFields).filter((c) => c !== 'root')) {
          const physical = (
            await tx.get(
              db
                .collection(targetRoot(l) + '/' + collection)
                .select()
                .limit(targets.length + 1),
            )
          ).docs;
          if (physical.some((d) => !deleting.has(d.ref.path))) bad();
        }
      }
      store.commit(tx, l, request, 'cleanup', fp, {
        [controlField]: { ...state, cleaned: cleaned + count },
      });
      targets.forEach((r) => tx.delete(r));
      rows.slice(0, count).forEach((r) => tx.delete(r.ref));
      return true;
    }
    await emptyTargets(tx, l);
    return false;
  }
  return { empty, emptyTargets, prepare, audit, verify, cleanup };
}
