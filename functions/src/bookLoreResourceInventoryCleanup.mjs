import { born, bornEqual, closed, restoreHash } from './bookRestoreUploadContracts.mjs';
import { digest, readWorkMetadata } from './workProgressContracts.mjs';
import { stagedEditUploadProof } from './bookLoreEditLeaseProofs.mjs';
import {
  loreGenerationStorage,
  loreGenerationRelations,
  loreBirthAtMost,
  loreFieldPointer,
} from './bookLoreGenerationContracts.mjs';
import { lorePayloadSegmentId, lorePayloadPointer } from './bookRestoreLorePayloadContracts.mjs';
import { openBookResourcePayload } from './bookResourcePayloadRead.mjs';
import { resourcePayloadChunkPath } from './bookResourcePayloadPaths.mjs';
import {
  inventoryScope,
  inventoryConflict as conflict,
} from './bookLoreResourceInventoryContracts.mjs';
import {
  inventoryImmutable,
  loadInventoryControl,
  readInventoryReference,
  prepareInventoryChange,
} from './bookLoreResourceInventoryStore.mjs';
async function inspectCurrentHead(tx, c, body, limit) {
  const context = body.context,
    head = await readWorkMetadata(tx, c.db.doc(c.path + '/lore/' + context.loreId), [
      'bookId',
      'ownerId',
      'universeId',
      'adventureId',
      'payloadStorage',
    ]);
  const token = digest({
    exists: head.exists,
    birth: head.exists ? born(head) : null,
    update: head.exists ? born({ createTime: head.updateTime }) : null,
  });
  const complete = { token, page: null, referenced: false, scan: false };
  if (!head.exists) return complete;
  const data = head.data();
  if (
    (data.bookId !== undefined && data.bookId !== c.bookId) ||
    (data.ownerId !== undefined && data.ownerId !== c.uid) ||
    Object.hasOwn(data, 'universeId') ||
    Object.hasOwn(data, 'adventureId')
  )
    conflict();
  if (!Object.hasOwn(data, 'payloadStorage')) return complete;
  const storage = loreGenerationStorage(data.payloadStorage),
    id = body.at.id;
  if (
    storage.base?.manifest.bodyId === id ||
    (storage.schemaVersion === 2 &&
      Object.values(storage.fields).some((pointer) => pointer?.manifest.bodyId === id))
  )
    return { ...complete, referenced: true };
  const relation = loreGenerationRelations(storage);
  if (!relation.pages || (body.state.headToken === token && body.state.headPage === null))
    return complete;
  const start = body.state.headToken === token ? body.state.headPage : 0;
  if (start > relation.pages) conflict();
  const end = Math.min(relation.pages, start + limit);
  for (let page = start; page < end; page++) {
    const offset = page * 64,
      segment = await tx.get(
        c.db.doc(
          c.path + '/bookLoreSegments/' + lorePayloadSegmentId(relation.generationId, offset),
        ),
      ),
      value = segment.data();
    if (!inventoryImmutable(segment) || !loreBirthAtMost(born(segment), relation.sealBirth))
      conflict();
    closed(value, [
      'schemaVersion',
      'ownerId',
      'bookId',
      'loreId',
      'generationId',
      'offset',
      'count',
      'payload',
    ]);
    if (
      ![1, ...(storage.schemaVersion === 2 ? [2] : [])].includes(value.schemaVersion) ||
      value.ownerId !== c.uid ||
      value.bookId !== c.bookId ||
      value.loreId !== context.loreId ||
      value.generationId !== relation.generationId ||
      value.offset !== offset ||
      value.count !== Math.min(64, relation.count - offset)
    )
      conflict();
    const pointer =
      value.schemaVersion === 1
        ? lorePayloadPointer(value.payload)
        : loreFieldPointer(value.payload);
    if (!loreBirthAtMost(pointer.expectedBirth, born(segment))) conflict();
    if (pointer.manifest.bodyId === id) return { ...complete, referenced: true };
  }
  return {
    token,
    page: end === relation.pages ? null : end,
    referenced: false,
    scan: true,
    scanned: end - start,
  };
}
const deferred = (reason) => ({ complete: false, processed: 0, deferred: true, reason });
/** One native transaction; staged access must come from the bound parent/upload proof. */
export async function collectBookLoreInventoryUnit(tx, c, input, access = null) {
  const db = c.db,
    uid = c.uid,
    limit = input.limit ?? 16;
  restoreHash(input.bodyId);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 16) conflict();

  const root = await readWorkMetadata(tx, db.doc(c.path), ['authorId', 'deleting']),
    data = root.data();
  const staging = access ? stagedEditUploadProof(tx, access, c, input.bodyId) : null;
  if (!root.exists && !staging) return deferred('book-absent');
  if (root.exists && data.authorId !== uid && !staging) conflict();
  if (root.exists && !staging && Object.hasOwn(data, 'deleting') && data.deleting !== false)
    return deferred('book-deleting');
  const body = await loadInventoryControl(tx, c, 'body', input.bodyId);
  if (!body) {
    if (staging) conflict();
    return deferred('unmanaged');
  }
  if (staging) stagedEditUploadProof(tx, access, c, input.bodyId, body);
  if (root.exists && !bornEqual(root, { createTime: body.context.bookBirth })) conflict();
  if (body.state.phase === 'collected')
    return {
      complete: true,
      processed: 0,
      cleanupIndex: body.context.pointer.manifest.chunkCount,
      headerRemoved: true,
    };
  const head = await inspectCurrentHead(tx, c, body, limit);
  if (head.referenced) return deferred('active-head');
  const lease = await tx.get(db.doc(c.path + '/bookResourceLeases/' + body.at.id));
  if (staging) {
    if (
      !lease.exists ||
      !bornEqual(lease, { createTime: staging.leaseBirth }) ||
      !bornEqual({ createTime: lease.updateTime }, { createTime: staging.leaseUpdate }) ||
      digest(lease.data()) !== staging.leaseHash
    )
      conflict();
  } else if (lease.exists) return deferred('lease');
  const state = body.state;
  if (state.phase === 'initializing') {
    const initial = body.context.initialGeneration,
      generation = await loadInventoryControl(tx, c, 'generation', initial.generationId);
    if (
      !generation ||
      generation.token !== initial.token ||
      !bornEqual(generation.snapshot, { createTime: initial.birth })
    )
      conflict();
    if (!['retired', 'cancelled'].includes(generation.state.phase))
      return deferred('active-generation');
  }
  const headPatch = { headToken: head.token, headPage: head.page };
  if (head.scan) {
    const plan = await prepareInventoryChange(tx, body, 'scan-head', {
      ...headPatch,
      phase: state.phase === 'initializing' ? 'live' : state.phase,
    });
    plan.commit();
    return {
      complete: false,
      processed: 0,
      headScanned: head.scanned,
      cleanupIndex: state.cleanupIndex,
      headerRemoved: false,
    };
  }
  if (!['collecting', 'collected'].includes(state.phase)) {
    let query = db
      .collection(body.at.controlPath + '/references')
      .orderBy('__name__')
      .limit(limit + 1);
    if (state.cursor !== null) query = query.startAfter(state.cursor);
    const page = await tx.get(query),
      selected = page.docs.slice(0, limit);
    for (const reference of selected) {
      const proof = await readInventoryReference(tx, body, reference);
      if (!['retired', 'cancelled'].includes(proof.generation.state.phase))
        return deferred('active-generation');
    }
    const more = page.docs.length > limit,
      plan = await prepareInventoryChange(tx, body, 'scan', {
        ...headPatch,
        phase: more ? 'scanning' : 'collecting',
        scanRevision: state.referenceRevision,
        cursor: more ? selected.at(-1).id : null,
      });
    plan.commit();
    return {
      complete: false,
      processed: 0,
      scanned: selected.length,
      cleanupIndex: state.cleanupIndex,
      headerRemoved: false,
    };
  }
  const pointer = body.context.pointer,
    opened = await openBookResourcePayload(tx, db, {
      uid,
      bookId: c.bookId,
      resource: { kind: 'lore', parentId: null, id: body.context.loreId },
      ...pointer,
    }),
    count = pointer.manifest.chunkCount;
  if (state.cleanupIndex < count) {
    const end = Math.min(count, state.cleanupIndex + limit),
      remove = [];
    for (let index = state.cleanupIndex; index < end; index++) {
      const ref = db.doc(resourcePayloadChunkPath(c.bookId, body.at.id, index)),
        part = await readWorkMetadata(tx, ref, [
          'schemaVersion',
          'ownerId',
          'bookId',
          'bodyId',
          'index',
        ]),
        v = part.data();
      if (
        !inventoryImmutable(part) ||
        !loreBirthAtMost(born(part), born(opened.header)) ||
        (pointer.partSealBirth && !loreBirthAtMost(born(part), pointer.partSealBirth))
      )
        conflict();
      closed(v, ['schemaVersion', 'ownerId', 'bookId', 'bodyId', 'index']);
      if (
        v.schemaVersion !== 1 ||
        v.ownerId !== uid ||
        v.bookId !== c.bookId ||
        v.bodyId !== body.at.id ||
        v.index !== index
      )
        conflict();
      remove.push(ref);
    }
    const plan = await prepareInventoryChange(tx, body, 'collect-chunks', {
      ...headPatch,
      cleanupIndex: end,
    });
    remove.forEach((ref) => tx.delete(ref));
    plan.commit();
    return { complete: false, processed: remove.length, cleanupIndex: end, headerRemoved: false };
  }
  const extra = await tx.get(
    db
      .collection(c.path + '/bookResourceChunks')
      .where('bodyId', '==', body.at.id)
      .limit(1)
      .select(),
  );
  if (extra.docs.length) conflict();
  const plan = await prepareInventoryChange(tx, body, 'collect-header', {
    ...headPatch,
    phase: 'collected',
  });
  tx.delete(opened.header.ref);
  plan.commit();
  return { complete: true, processed: 1, cleanupIndex: count, headerRemoved: true };
}
export function createBookLoreResourceInventoryCleanup({ db }) {
  return {
    async collectBookLoreInventoryBody(uid, input) {
      closed(input, ['bookId', 'bodyId'], ['limit']);
      const c = inventoryScope(db, uid, input.bookId),
        limit = input.limit ?? 16;
      restoreHash(input.bodyId);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 16) conflict();
      const result = await db.runTransaction((tx) => collectBookLoreInventoryUnit(tx, c, input));
      const response = { ...result };
      delete response.cleanupIndex;
      delete response.headerRemoved;
      return response;
    },
  };
}
