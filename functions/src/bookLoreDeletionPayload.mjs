import { born, bornEqual, closed, integer } from './bookRestoreUploadContracts.mjs';
import { readWorkMetadata, digest } from './workProgressContracts.mjs';
import { resourcePayloadManifest, resourcePayloadScope } from './bookResourcePayloadContracts.mjs';
import { resourcePayloadBodyPath, resourcePayloadChunkPath } from './bookResourcePayloadPaths.mjs';
import { inventoryScope } from './bookLoreResourceInventoryContracts.mjs';
import { loadInventoryControl, prepareInventoryChange } from './bookLoreResourceInventoryStore.mjs';
import { resolveAdoptedInventoryLease } from './bookLoreAdoptedLease.mjs';
import {
  deletionConflict as conflict,
  deletionAtMost,
  deletionScopeCheck,
} from './bookLoreDeletionStore.mjs';
import { assertLoreCleanupOpening, loreCleanupQuery } from './bookLoreCleanupScope.mjs';
export const DELETION_PAYLOAD_FIELDS = [
  'schemaVersion',
  'bodyId',
  'byteLength',
  'chunkCount',
  'contentHash',
  'merkleRoot',
  'ownerId',
  'bookId',
  'resource',
  'createdAt',
];
const immutable = (s) => s.exists && bornEqual(s, { createTime: s.updateTime });
export async function prepareDeletionPayload(tx, l, next, limit) {
  assertLoreCleanupOpening(tx, l);
  const { db, uid, bookId } = l.c;
  let snapshot;
  if (next.body)
    snapshot = await readWorkMetadata(
      tx,
      db.doc(resourcePayloadBodyPath(bookId, next.body.bodyId)),
      DELETION_PAYLOAD_FIELDS,
    );
  else
    snapshot = (
      await tx.get(
        loreCleanupQuery(l, 'bookResourceBodies')
          .orderBy('__name__')
          .select(...DELETION_PAYLOAD_FIELDS)
          .limit(1),
      )
    ).docs[0];
  if (!snapshot) {
    next.phase = 'finish';
    return { remove: [], commit() {} };
  }
  deletionScopeCheck(l, snapshot);
  if (!immutable(snapshot)) conflict();
  const value = snapshot.data(),
    manifest = resourcePayloadManifest(
      Object.fromEntries(
        ['schemaVersion', 'bodyId', 'byteLength', 'chunkCount', 'contentHash', 'merkleRoot'].map(
          (k) => [k, value[k]],
        ),
      ),
    ),
    scoped = resourcePayloadScope({
      uid: value.ownerId,
      bookId: value.bookId,
      resource: value.resource,
    });
  if (
    scoped.uid !== uid ||
    scoped.bookId !== bookId ||
    snapshot.id !== manifest.bodyId ||
    (l.c.loreId && (scoped.resource.kind !== 'lore' || scoped.resource.id !== l.c.loreId))
  )
    conflict();
  closed(value, DELETION_PAYLOAD_FIELDS);
  integer(value.createdAt);
  const c = inventoryScope(db, uid, bookId),
    body = await loadInventoryControl(tx, c, 'body', manifest.bodyId),
    head =
      scoped.resource.kind === 'lore'
        ? await readWorkMetadata(tx, db.doc('books/' + bookId + '/lore/' + scoped.resource.id), [])
        : null;
  if (head?.exists) conflict();
  if (body) {
    deletionScopeCheck(l, body.snapshot);
    if (
      body.context.loreId !== scoped.resource.id ||
      scoped.resource.kind !== 'lore' ||
      !bornEqual(l.root, { createTime: body.context.bookBirth }) ||
      !bornEqual(snapshot, { createTime: body.context.pointer.expectedBirth }) ||
      digest(body.context.pointer.manifest) !== digest(manifest)
    )
      conflict();
    const initial = body.context.initialGeneration,
      generation = await loadInventoryControl(tx, c, 'generation', initial.generationId);
    if (
      !generation ||
      generation.token !== initial.token ||
      !bornEqual(generation.snapshot, { createTime: initial.birth }) ||
      !['retired', 'cancelled'].includes(generation.state.phase)
    )
      conflict();
  }
  const lease = await tx.get(db.doc('books/' + bookId + '/bookResourceLeases/' + manifest.bodyId));
  if (lease.exists) {
    if (!body) conflict();
    const adopted = await resolveAdoptedInventoryLease(tx, c, body, lease);
    if (adopted?.phase !== 'retired') conflict();
  }
  const captured = {
    bodyId: manifest.bodyId,
    birth: born(snapshot),
    manifest,
    resource: scoped.resource,
    controlled: body ? { birth: born(body.snapshot), token: body.token } : null,
    index: body?.state.cleanupIndex ?? 0,
  };
  if (!next.body) next.body = captured;
  else if (
    next.body.bodyId !== captured.bodyId ||
    !bornEqual(snapshot, { createTime: next.body.birth }) ||
    digest(next.body.manifest) !== digest(manifest) ||
    digest(next.body.resource) !== digest(scoped.resource) ||
    digest(next.body.controlled) !== digest(captured.controlled) ||
    (body && next.body.index !== body.state.cleanupIndex)
  )
    conflict();
  const absent = digest({ exists: false, birth: null, update: null }),
    patch = { headToken: absent, headPage: null };
  if (body && !['collecting', 'collected'].includes(body.state.phase)) {
    const plan = await prepareInventoryChange(tx, body, 'scan', {
      ...patch,
      phase: 'collecting',
      scanRevision: body.state.referenceRevision,
      cursor: null,
    });
    return { remove: [], commit: () => plan.commit() };
  }
  if (body?.state.phase === 'collected') conflict();
  const index = next.body.index;
  if (index < manifest.chunkCount) {
    const end = Math.min(manifest.chunkCount, index + limit),
      remove = [];
    for (let at = index; at < end; at++) {
      const part = await readWorkMetadata(
          tx,
          db.doc(resourcePayloadChunkPath(bookId, manifest.bodyId, at)),
          ['schemaVersion', 'ownerId', 'bookId', 'bodyId', 'index'],
        ),
        v = part.data();
      deletionScopeCheck(l, part);
      if (
        !immutable(part) ||
        !deletionAtMost(born(part), born(snapshot)) ||
        (body?.context.pointer.partSealBirth &&
          !deletionAtMost(born(part), body.context.pointer.partSealBirth))
      )
        conflict();
      closed(v, ['schemaVersion', 'ownerId', 'bookId', 'bodyId', 'index']);
      if (
        v.schemaVersion !== 1 ||
        v.ownerId !== uid ||
        v.bookId !== bookId ||
        v.bodyId !== manifest.bodyId ||
        v.index !== at
      )
        conflict();
      remove.push(part.ref);
    }
    const plan = body
      ? await prepareInventoryChange(tx, body, 'collect-chunks', { ...patch, cleanupIndex: end })
      : null;
    next.body.index = end;
    return {
      remove,
      commit() {
        plan?.commit();
      },
    };
  }
  if (
    index !== manifest.chunkCount ||
    (
      await tx.get(
        db
          .collection('books/' + bookId + '/bookResourceChunks')
          .where('bodyId', '==', manifest.bodyId)
          .select()
          .limit(1),
      )
    ).docs.length
  )
    conflict();
  const plan = body
    ? await prepareInventoryChange(tx, body, 'collect-header', { ...patch, phase: 'collected' })
    : null;
  next.body = null;
  return {
    remove: [snapshot.ref],
    commit() {
      plan?.commit();
    },
  };
}
