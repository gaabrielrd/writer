import { born, bornEqual, date, integer } from './bookRestoreUploadContracts.mjs';
import { digest, readWorkMetadata } from './workProgressContracts.mjs';
import { nextBookLocalLoreVersion } from './bookLoreVersion.mjs';
import { inspectionPaths } from './bookLoreSourceInspectionContracts.mjs';
import { openBookLoreSourceInspection } from './bookLoreSourceInspectionStore.mjs';
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
  initializeBookLoreRemoval,
  replayBookLoreRemoval,
  reserveRemovalCommit,
  removalProgress,
} from './bookLoreRemovalStore.mjs';
function timestamp(now, book, source) {
  const values = [date(now)];
  for (const value of [book.updatedAt, source.dates.updatedAt]) {
    if (value === undefined) continue;
    integer(value);
    if (!Number.isSafeInteger(value + 1) || !Number.isFinite(new Date(value + 1).getTime()))
      conflict();
    values.push(value + 1);
  }
  return Math.max(...values);
}
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
        .runTransaction(async (tx) => {
          const previous = await loadBookLoreRemoval(tx, c, { startHash });
          if (previous) {
            if (digest(previous.context.intent) !== digest(intent)) conflict();
            return removalProgress(tx, previous);
          }
          const source = await openBookLoreSourceInspection(
              tx,
              inspectionPaths(db, uid, intent.inspection.inspectionId),
              intent.inspection,
            ),
            original = source.loaded.job.context;
          if (
            original.bookId !== intent.bookId ||
            original.loreId !== intent.loreId ||
            original.sourceToken !== intent.sourceToken
          )
            conflict();
          const root = await readWorkMetadata(tx, db.doc('books/' + intent.bookId), [
              'authorId',
              'deleting',
              'localLoreVersion',
              'updatedAt',
              'publicationPrivacyVersion',
              'hasLoreResources',
            ]),
            book = root.data(),
            localLoreVersion = nextBookLocalLoreVersion(book),
            privacy = source.metadata.isPublic,
            revoked = privacy.present && privacy.value === true,
            epoch = Object.hasOwn(book, 'publicationPrivacyVersion')
              ? book.publicationPrivacyVersion
              : 0;
          integer(epoch);
          const publicationPrivacyVersion = epoch + (revoked ? 1 : 0);
          integer(publicationPrivacyVersion);
          if (Object.hasOwn(book, 'hasLoreResources') && typeof book.hasLoreResources !== 'boolean')
            conflict();
          if (
            !root.exists ||
            book.authorId !== uid ||
            !bornEqual(root, source.source.book.snapshot) ||
            (Object.hasOwn(book, 'deleting') && book.deleting !== false)
          )
            conflict();
          const context = {
              schemaVersion: 1,
              ownerId: uid,
              intent,
              startHash,
              bookBirth: born(root),
              sourceBirth: born(source.source.opened.snapshot),
              sourceUpdate: born({ createTime: source.source.opened.snapshot.updateTime }),
              inspectionBirth: born(source.loaded.snapshot),
              metadataHash: digest(source.metadata),
              privacy,
              revoked,
              timestamp: timestamp(now, book, source.metadata),
              localLoreVersion,
              publicationPrivacyVersion,
            },
            initial = await initializeBookLoreRemoval(tx, c, context);
          initial.commit();
          tx.delete(source.source.opened.snapshot.ref);
          tx.update(root.ref, {
            localLoreVersion,
            hasLoreResources: true,
            updatedAt: context.timestamp,
            ...(revoked ? { status: 'draft', publicationPrivacyVersion } : {}),
          });
          if (revoked) tx.delete(db.doc('publicBooks/' + intent.bookId));
          // Birth and token are read from the committed context, never guessed from wall time.
          return null;
        })
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
