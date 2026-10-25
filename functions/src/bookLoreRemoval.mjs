import { prepareBookLoreRemovalStart } from './bookLoreRemovalStart.mjs';
import { bornEqual } from './bookRestoreUploadContracts.mjs';
import { readWorkMetadata } from './workProgressContracts.mjs';
import { inventoryScope } from './bookLoreResourceInventoryContracts.mjs';
import { loadInventoryControl } from './bookLoreResourceInventoryStore.mjs';
import { resourcePayloadBodyPath } from './bookResourcePayloadPaths.mjs';
import { deletionScopeCheck } from './bookLoreDeletionStore.mjs';
import { loreCleanupQuery } from './bookLoreCleanupScope.mjs';
import { prepareLoreCleanupUnit } from './bookLoreCleanup.mjs';
import {
  removalConflict as conflict,
  removalIntent,
  removalStartHash,
  removalPaths,
  removalRequest,
} from './bookLoreRemovalContracts.mjs';
import {
  loadBookLoreRemoval,
  openBookLoreRemovalCleanup,
  replayBookLoreRemoval,
  reserveRemovalCommit,
  removalProgress,
} from './bookLoreRemovalStore.mjs';
async function finishCleanup(tx, l, next) {
  for (const name of ['bookResourceBodies', 'bookLoreSegments'])
    if ((await tx.get(loreCleanupQuery(l, name).select().limit(1))).docs.length) conflict();
  let query = loreCleanupQuery(l, 'bookResourceInventory').orderBy('__name__').select().limit(1);
  if (next.cursor) query = query.startAfter(next.cursor);
  const s = (await tx.get(query)).docs[0];
  if (!s) {
    next.complete = true;
    return;
  }
  deletionScopeCheck(l, s);
  const body = await loadInventoryControl(
    tx,
    inventoryScope(l.c.db, l.c.uid, l.c.bookId),
    'body',
    s.id,
  );
  if (
    !body ||
    body.context.loreId !== l.c.loreId ||
    !bornEqual(l.root, { createTime: body.context.bookBirth }) ||
    body.state.phase !== 'collected'
  )
    conflict();
  const header = await readWorkMetadata(
      tx,
      l.c.db.doc(resourcePayloadBodyPath(l.c.bookId, s.id)),
      [],
    ),
    chunks = await tx.get(
      l.c.db
        .collection('books/' + l.c.bookId + '/bookResourceChunks')
        .where('bodyId', '==', s.id)
        .select()
        .limit(1),
    );
  if (header.exists || chunks.docs.length) conflict();
  next.cursor = s.id;
}
export function createBookLoreRemovalService({ db, now = () => Date.now() }) {
  return {
    async startBookLoreRemoval(uid, input) {
      const intent = removalIntent(uid, input),
        startHash = removalStartHash(intent),
        c = removalPaths(db, uid, intent.removalId);
      return db
        .runTransaction(async (tx) =>
          (await prepareBookLoreRemovalStart(tx, { db, now }, uid, intent)).commit(),
        )
        .then(
          (result) =>
            result ??
            db.runTransaction(async (tx) => {
              const l = await loadBookLoreRemoval(tx, c, { startHash });
              if (!l) conflict();
              return removalProgress(tx, l);
            }),
        );
    },
    async getBookLoreRemoval(uid, input) {
      const r = removalRequest(uid, input),
        c = removalPaths(db, uid, r.removalId);
      return db.runTransaction(async (tx) => {
        const l = await loadBookLoreRemoval(tx, c, r);
        if (!l) return null;
        return removalProgress(tx, l);
      });
    },
    async advanceBookLoreRemoval(uid, input) {
      const r = removalRequest(uid, input, true),
        c = removalPaths(db, uid, r.removalId);
      return db.runTransaction(async (tx) => {
        const l = await loadBookLoreRemoval(tx, c, r);
        if (!l) conflict();
        const replay = await replayBookLoreRemoval(tx, l, 'advanceBookLoreRemoval', r);
        if (replay) return { ...replay, progress: await removalProgress(tx, l) };
        if (l.record.handoff || l.state.complete || l.state.revision !== r.expectedRevision)
          conflict();
        await openBookLoreRemovalCleanup(tx, l);
        const finish = await reserveRemovalCommit(tx, l, 'advanceBookLoreRemoval', r),
          next = structuredClone(l.state);
        let unit = { remove: [], commit() {} };
        if (next.phase === 'finish') await finishCleanup(tx, l, next);
        else unit = await prepareLoreCleanupUnit(tx, l, next, 16);
        next.processed += unit.remove.length;
        const plan = finish(next);
        for (const ref of unit.remove) tx.delete(ref);
        unit.commit();
        plan.commit();
        return { receipt: plan.receipt, progress: plan.progress };
      });
    },
  };
}
