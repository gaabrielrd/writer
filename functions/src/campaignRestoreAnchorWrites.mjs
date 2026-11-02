import {
  createCampaignRestoreNativeWrites,
  NATIVE_WRITE_FIELDS,
} from './campaignRestoreNativeWrites.mjs';
import {
  ANCHOR_TARGET_FIELDS,
  ANCHOR_SLOT_FIELDS,
  ANCHOR_BINDING_FIELDS,
  anchorBasePath,
} from './campaignRestoreAnchorFormat.mjs';
import {
  closed,
  integer,
  hash,
  id,
  digest,
  chunkId,
  immutable,
  sameBirth,
  bad,
} from './campaignRestoreContracts.mjs';
export function createCampaignRestoreAnchorWrites(store) {
  const { db } = store,
    slots = (l) => db.collection(l.ref.path + '/anchorSlots'),
    journals = (l) => db.collection(l.ref.path + '/anchorWrites'),
    slotRef = (l, n) => db.doc(l.ref.path + '/anchorSlots/' + chunkId(n)),
    binding = (v) => {
      integer(v.slotIndex);
      hash(v.anchorKey);
      hash(v.sourceKey);
      hash(v.authorizationHash);
    },
    native = createCampaignRestoreNativeWrites(store, {
      journalCollection: 'anchorWrites',
      controlField: 'anchorMaterialization',
      action: 'materialize-anchors',
      targetRoot: anchorBasePath,
      targetFields: ANCHOR_TARGET_FIELDS,
      bindingFields: ANCHOR_BINDING_FIELDS,
      validateBinding: binding,
    });
  async function readSlot(tx, l, n) {
    const snap = await tx.get(slotRef(l, n));
    if (!snap.exists) bad();
    const v = closed(snap.data(), ANCHOR_SLOT_FIELDS);
    integer(v.index, 0, (l.job.anchorMaterialization?.slots ?? 0) - 1);
    integer(v.row, 0, l.job.derivedIndex.rows - 1);
    id(v.createdByOperationId);
    hash(v.anchorKey);
    hash(v.sourceKey);
    hash(v.authorizationHash);
    if (
      v.index !== n ||
      snap.id !== chunkId(n) ||
      v.schemaVersion !== 1 ||
      v.ownerId !== l.uid ||
      v.restoreId !== l.rid ||
      v.campaignId !== l.job.campaignId ||
      v.jobToken !== l.token
    )
      bad();
    immutable(snap);
    const op = await store.operation(tx, l, v.createdByOperationId);
    if (
      !op ||
      op.value.action !== 'materialize-anchors' ||
      !sameBirth(snap, op.snapshot) ||
      digest(op.value.effect) !== digest({ slot: { index: n, metadataHash: digest(v) } })
    )
      bad();
    return { ref: snap.ref, value: v };
  }
  async function slotFor(tx, l, v) {
    const slot = await readSlot(tx, l, v.slotIndex);
    for (const k of ['anchorKey', 'sourceKey', 'authorizationHash'])
      if (slot.value[k] !== v[k]) bad();
    return slot;
  }
  async function empty(tx, l) {
    if (
      (await tx.get(slots(l).select().limit(1))).docs.length ||
      (await tx.get(journals(l).select().limit(1))).docs.length
    )
      bad();
  }
  async function register(tx, l, operationId, value) {
    closed(value, ['row', 'anchorKey', 'sourceKey', 'authorizationHash']);
    integer(value.row, 0, l.job.derivedIndex.rows - 1);
    hash(value.anchorKey);
    hash(value.sourceKey);
    hash(value.authorizationHash);
    const index = l.job.anchorMaterialization?.slots ?? 0,
      ref = slotRef(l, index),
      record = {
        schemaVersion: 1,
        ownerId: l.uid,
        restoreId: l.rid,
        campaignId: l.job.campaignId,
        jobToken: l.token,
        index,
        createdByOperationId: operationId,
        ...value,
      };
    if ((await tx.get(ref)).exists) bad();
    await native.emptyTargets(tx, l, value);
    return {
      effect: { slot: { index, metadataHash: digest(record) } },
      commit() {
        tx.create(ref, record);
      },
    };
  }
  async function prepare(tx, l, operationId, targets, value) {
    await slotFor(tx, l, value);
    return native.prepare(tx, l, operationId, targets, value);
  }
  async function verify(tx, l, snapshot, guard) {
    if (!snapshot.exists) bad();
    const value = closed(snapshot.data(), [...NATIVE_WRITE_FIELDS, ...ANCHOR_BINDING_FIELDS]);
    binding(value);
    const slot = await slotFor(tx, l, value);
    return native.verify(tx, l, snapshot, async (v) => guard?.(v, slot.value));
  }
  async function audit(tx, l, start, limit, guard) {
    const end = Math.min(l.job.anchorMaterialization.written, start + limit);
    for (let n = start; n < end; n++)
      await verify(tx, l, await tx.get(db.doc(l.ref.path + '/anchorWrites/' + chunkId(n))), guard);
    return end;
  }
  async function cleanup(tx, l, request, fp) {
    const state = l.job.anchorMaterialization,
      written = state?.written ?? 0,
      cleaned = state?.cleaned ?? 0,
      rows = (
        await tx.get(
          journals(l)
            .orderBy('__name__')
            .select(...NATIVE_WRITE_FIELDS, ...ANCHOR_BINDING_FIELDS)
            .limit(request.limit + 1),
        )
      ).docs,
      count = Math.min(rows.length, request.limit),
      targets = [],
      parents = [];
    if (cleaned + count > written || (!rows.length && cleaned !== written)) bad();
    for (let n = 0; n < count; n++) {
      if (rows[n].id !== chunkId(cleaned + n)) bad();
      targets.push(...(await verify(tx, l, rows[n])));
      if (rows[n].data().targets.some((t) => t.collection === 'root'))
        parents.push(anchorBasePath(l, rows[n].data()));
    }
    if (count) {
      if (cleaned + count === written && rows.length !== count) bad();
      const deleting = new Set(targets.map((r) => r.path));
      for (const parent of parents)
        for (const collection of Object.keys(ANCHOR_TARGET_FIELDS).filter((c) => c !== 'root')) {
          const physical = (
            await tx.get(
              db
                .collection(parent + '/' + collection)
                .select()
                .limit(targets.length + 1),
            )
          ).docs;
          if (physical.some((d) => !deleting.has(d.ref.path))) bad();
        }
      store.commit(tx, l, request, 'cleanup', fp, {
        anchorMaterialization: { ...state, cleaned: cleaned + count },
      });
      targets.forEach((r) => tx.delete(r));
      rows.slice(0, count).forEach((r) => tx.delete(r.ref));
      return true;
    }
    const registered = (
        await tx.get(
          slots(l)
            .orderBy('__name__')
            .select(...ANCHOR_SLOT_FIELDS)
            .limit(request.limit + 1),
        )
      ).docs,
      size = Math.min(registered.length, request.limit),
      from = state?.cleanedSlots ?? 0,
      total = state?.slots ?? 0,
      refs = [];
    if (from + size > total || (!registered.length && from !== total)) bad();
    for (let n = 0; n < size; n++) {
      if (registered[n].id !== chunkId(from + n)) bad();
      const slot = await readSlot(tx, l, from + n);
      await native.emptyTargets(tx, l, slot.value);
      refs.push(slot.ref);
    }
    if (size) {
      if (from + size === total && registered.length !== size) bad();
      store.commit(tx, l, request, 'cleanup', fp, {
        anchorMaterialization: { ...state, cleanedSlots: from + size },
      });
      refs.forEach((r) => tx.delete(r));
      return true;
    }
    return false;
  }
  return { empty, register, readSlot, prepare, verify, audit, cleanup };
}
