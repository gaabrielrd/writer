import { born, bornEqual, date, integer } from './bookRestoreUploadContracts.mjs';
import { digest, readWorkMetadata } from './workProgressContracts.mjs';
import { nextBookLocalLoreVersion } from './bookLoreVersion.mjs';
import { inspectionPaths } from './bookLoreSourceInspectionContracts.mjs';
import { openBookLoreSourceInspection } from './bookLoreSourceInspectionStore.mjs';
import {
  removalIntent,
  removalStartHash,
  removalPaths,
  removalConflict as conflict,
} from './bookLoreRemovalContracts.mjs';
import {
  loadBookLoreRemoval,
  initializeBookLoreRemoval,
  removalProgress,
} from './bookLoreRemovalStore.mjs';
import {
  removalBatchIntent,
  removalBatchHash,
  removalBatchPaths,
  readRemovalBatch,
  removalBatchProgress,
  prepareRemovalBatchReceipt,
} from './bookLoreRemovalBatchContracts.mjs';

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
async function openCandidate(tx, db, uid, input) {
  const intent = removalIntent(uid, input),
    startHash = removalStartHash(intent),
    c = removalPaths(db, uid, intent.removalId),
    previous = await loadBookLoreRemoval(tx, c, { startHash });
  if (previous) {
    if (digest(previous.context.intent) !== digest(intent)) conflict();
    return { intent, startHash, c, previous };
  }
  const source = await openBookLoreSourceInspection(
    tx,
    inspectionPaths(db, uid, intent.inspection.inspectionId),
    intent.inspection,
  );
  const original = source.loaded.job.context;
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
    book = root.data();
  if (
    !root.exists ||
    book.authorId !== uid ||
    !bornEqual(root, source.source.book.snapshot) ||
    (Object.hasOwn(book, 'deleting') && book.deleting !== false) ||
    (Object.hasOwn(book, 'hasLoreResources') && typeof book.hasLoreResources !== 'boolean')
  )
    conflict();
  const privacy = source.metadata.isPublic,
    revoked = privacy.present && privacy.value === true;
  return { intent, startHash, c, source, root, book, privacy, revoked, previous: null };
}
function frame(candidates, now) {
  const first = candidates[0],
    book = first.book;
  for (const c of candidates)
    if (
      c.intent.bookId !== first.intent.bookId ||
      !bornEqual(c.root, first.root) ||
      digest(c.book) !== digest(book)
    )
      conflict();
  const revoked = candidates.some((c) => c.revoked),
    epoch = Object.hasOwn(book, 'publicationPrivacyVersion') ? book.publicationPrivacyVersion : 0;
  integer(epoch);
  const publicationPrivacyVersion = epoch + (revoked ? 1 : 0);
  integer(publicationPrivacyVersion);
  const value = now();
  return {
    timestamp: Math.max(
      ...candidates.map((c) => timestamp(() => value, c.book, c.source.metadata)),
    ),
    localLoreVersion: nextBookLocalLoreVersion(book),
    publicationPrivacyVersion,
    revoked,
  };
}
async function prepareCandidate(tx, c, f) {
  const context = {
    schemaVersion: 1,
    ownerId: c.c.uid,
    intent: c.intent,
    startHash: c.startHash,
    bookBirth: born(c.root),
    sourceBirth: born(c.source.source.opened.snapshot),
    sourceUpdate: born({ createTime: c.source.source.opened.snapshot.updateTime }),
    inspectionBirth: born(c.source.loaded.snapshot),
    metadataHash: digest(c.source.metadata),
    privacy: c.privacy,
    revoked: c.revoked,
    timestamp: f.timestamp,
    localLoreVersion: f.localLoreVersion,
    publicationPrivacyVersion: f.publicationPrivacyVersion,
  };
  const initial = await initializeBookLoreRemoval(tx, c.c, context);
  return {
    context,
    commit() {
      initial.commit();
      tx.delete(c.source.source.opened.snapshot.ref);
    },
  };
}
function commitBook(tx, c, f) {
  tx.update(c.root.ref, {
    localLoreVersion: f.localLoreVersion,
    hasLoreResources: true,
    updatedAt: f.timestamp,
    ...(f.revoked
      ? { status: 'draft', publicationPrivacyVersion: f.publicationPrivacyVersion }
      : {}),
  });
  if (f.revoked) tx.delete(c.c.db.doc('publicBooks/' + c.intent.bookId));
}
async function settled(reads) {
  const results = await Promise.allSettled(reads),
    failure = results.find((r) => r.status === 'rejected');
  if (failure) throw failure.reason;
  return results.map((r) => r.value);
}
/** Reads only until commit; the singular service preserves its original format. */
export async function prepareBookLoreRemovalStart(tx, { db, now = () => Date.now() }, uid, input) {
  const c = await openCandidate(tx, db, uid, input);
  if (c.previous) {
    const result = await removalProgress(tx, c.previous);
    return { result, commit: () => result };
  }
  const f = frame([c], now),
    plan = await prepareCandidate(tx, c, f);
  return {
    result: null,
    commit() {
      plan.commit();
      commitBook(tx, c, f);
      return null;
    },
  };
}
/** One bounded transaction unit; never a cap on the user's full selection. */
export async function prepareBookLoreRemovalBatch(tx, { db, now = () => Date.now() }, uid, input) {
  const intent = removalBatchIntent(uid, input),
    c = removalBatchPaths(db, uid, intent.requests[0].removalId, intent.batchId),
    previous = await readRemovalBatch(tx, c, removalBatchHash(uid, intent));
  if (previous) {
    const result = await removalBatchProgress(tx, previous);
    return { result, commit: () => result };
  }
  const candidates = await settled(intent.requests.map((r) => openCandidate(tx, db, uid, r)));
  if (candidates.some((v) => v.previous)) conflict();
  const f = frame(candidates, now),
    plans = await settled(candidates.map((v) => prepareCandidate(tx, v, f))),
    batch = prepareRemovalBatchReceipt(
      tx,
      c,
      intent,
      candidates,
      f,
      plans.map((p) => p.context),
    );
  return {
    result: null,
    commit() {
      for (const plan of plans) plan.commit();
      commitBook(tx, candidates[0], f);
      batch.commit();
      return null;
    },
  };
}
