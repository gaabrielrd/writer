import { born, bornEqual, closed } from './bookRestoreUploadContracts.mjs';
import { digest, readWorkMetadata } from './workProgressContracts.mjs';
import { nextBookLocalLoreVersion } from './bookLoreVersion.mjs';
import { deletionAtMost } from './bookLoreDeletionStore.mjs';
import {
  creationConflict as conflict,
  creationIntent,
  creationStartHash,
  creationLoreId,
  creationView,
} from './bookLoreCreationContracts.mjs';
import { loadCreationAdoption, creationAdoptionPaths } from './bookLoreCreationAdoption.mjs';
import { loadCreationCancelRequest } from './bookLoreCreationCancelRequest.mjs';
const records = new WeakMap();
export const assertCreationRecord = (tx, l) => {
  if (records.get(l) !== tx) conflict();
};
async function nativeRecord(tx, l) {
  l.cancelRequest = await loadCreationCancelRequest(tx, l);
  l.adoption = await loadCreationAdoption(tx, l);
  records.set(l, tx);
  return l;
}
const immutable = (s) => s.exists && bornEqual(s, { createTime: s.updateTime }),
  openings = new WeakMap();
export const assertCreationOpening = (tx, l) => {
  if (openings.get(l) !== tx) conflict();
};
const token = (c, s, context) =>
  digest({
    domain: 'book-lore-creation-reservation',
    uid: c.uid,
    path: c.path,
    birth: born(s),
    context,
  });
const marker = (context) => ({
  schemaVersion: 1,
  ownerId: context.ownerId,
  intent: context.intent,
  loreId: context.loreId,
  startHash: context.startHash,
  bookBirth: context.bookBirth,
  contextHash: digest(context),
});
export async function loadCreationReservation(tx, c, request = {}) {
  const snapshot = await tx.get(c.ref);
  if (!snapshot.exists) return null;
  const context = snapshot.data();
  closed(context, [
    'schemaVersion',
    'kind',
    'ownerId',
    'intent',
    'startHash',
    'loreId',
    'bookBirth',
  ]);
  const intent = creationIntent(c.uid, context.intent);
  if (
    !immutable(snapshot) ||
    context.schemaVersion !== 1 ||
    !['reservation', 'fence'].includes(context.kind) ||
    context.ownerId !== c.uid ||
    digest(intent) !== digest(c.intent) ||
    context.startHash !== creationStartHash(intent) ||
    context.loreId !== creationLoreId(c.uid, intent)
  )
    conflict();
  if (context.kind === 'fence') {
    if (context.bookBirth !== null) conflict();
  } else {
    closed(context.bookBirth, ['seconds', 'nanoseconds']);
    born({ createTime: context.bookBirth });
    const s = await tx.get(c.reservationRef);
    if (!immutable(s) || !bornEqual(s, snapshot) || digest(s.data()) !== digest(marker(context)))
      conflict();
  }
  const value = token(c, snapshot, context),
    loaded = { c, snapshot, context, token: value, cancellation: null };
  if (request.jobToken !== undefined && (context.kind === 'fence' || request.jobToken !== value))
    conflict();
  const event = await tx.get(c.cancelRef),
    proof = await tx.get(c.proofRef);
  if (!event.exists && !proof.exists) {
    if (context.kind === 'fence') conflict();
    return nativeRecord(tx, loaded);
  }
  if (
    !immutable(event) ||
    !immutable(proof) ||
    !bornEqual(event, proof) ||
    !deletionAtMost(born(snapshot), born(event))
  )
    conflict();
  const r = event.data(),
    p = proof.data();
  closed(r, [
    'schemaVersion',
    'ownerId',
    'creationId',
    'startHash',
    'jobToken',
    'operationId',
    'requestHash',
    'contextHash',
  ]);
  closed(p, ['schemaVersion', 'cancellationHash']);
  if (
    r.schemaVersion !== 1 ||
    p.schemaVersion !== 1 ||
    r.ownerId !== c.uid ||
    r.creationId !== intent.creationId ||
    r.startHash !== context.startHash ||
    r.jobToken !== (context.kind === 'fence' ? null : value) ||
    r.contextHash !== digest(context) ||
    p.cancellationHash !== digest(r) ||
    (context.kind === 'fence' && !bornEqual(event, snapshot))
  )
    conflict();
  creationIntent(c.uid, { bookId: intent.bookId, creationId: r.creationId });
  if (typeof r.operationId !== 'string' || !/^[a-f0-9]{64}$/.test(r.requestHash)) conflict();
  loaded.cancellation = r;
  loaded.cancellationSnapshot = event;
  return nativeRecord(tx, loaded);
}
export async function creationBook(tx, c) {
  const root = await readWorkMetadata(tx, c.db.doc('books/' + c.intent.bookId), [
      'authorId',
      'deleting',
      'hasLoreResources',
      'localLoreVersion',
    ]),
    v = root.data();
  if (
    !root.exists ||
    v.authorId !== c.uid ||
    (Object.hasOwn(v, 'deleting') && v.deleting !== false)
  )
    conflict();
  nextBookLocalLoreVersion(v);
  if (Object.hasOwn(v, 'hasLoreResources') && typeof v.hasLoreResources !== 'boolean') conflict();
  return root;
}
export async function assertCreationEmpty(tx, c) {
  const base = 'books/' + c.intent.bookId + '/',
    queries = [
      c.db
        .collection(base + 'bookResourceBodies')
        .where('resource.kind', '==', 'lore')
        .where('resource.id', '==', c.loreId),
      ...[
        'bookLoreSegments',
        'bookLoreGenerations',
        'bookResourceInventory',
        'bookResourceLeases',
      ].map((n) => c.db.collection(base + n).where('loreId', '==', c.loreId)),
      c.db
        .collection('users/' + c.uid + '/bookLoreFieldUploads')
        .where('context.loreId', '==', c.loreId),
      c.db
        .collection('users/' + c.uid + '/bookLoreEdits')
        .where('context.intent.loreId', '==', c.loreId),
    ];
  if (
    (await Promise.all(queries.map((q) => tx.get(q.select().limit(1))))).some((p) => p.docs.length)
  )
    conflict();
}
export async function creationSlots(tx, c) {
  const adoptionAt = creationAdoptionPaths(c);
  const [reservation, cancel, proof, head, tombstone, adoption, adoptionProof] = await Promise.all([
    tx.get(c.reservationRef),
    tx.get(c.cancelRef),
    tx.get(c.proofRef),
    readWorkMetadata(tx, c.db.doc('books/' + c.intent.bookId + '/lore/' + c.loreId), []),
    readWorkMetadata(
      tx,
      c.db.doc('books/' + c.intent.bookId + '/bookLoreTombstones/' + c.loreId),
      [],
    ),
    tx.get(adoptionAt.record),
    tx.get(adoptionAt.proof),
  ]);
  return { reservation, cancel, proof, head, tombstone, adoption, adoptionProof };
}
export function createCreationContext(tx, c, bookBirth = null) {
  const context = {
    schemaVersion: 1,
    kind: bookBirth ? 'reservation' : 'fence',
    ownerId: c.uid,
    intent: c.intent,
    startHash: creationStartHash(c.intent),
    loreId: c.loreId,
    bookBirth,
  };
  tx.create(c.ref, context);
  if (bookBirth) tx.create(c.reservationRef, marker(context));
  return context;
}
export function writeCreationCancellation(
  tx,
  c,
  context,
  jobToken,
  request,
  frozenRequestHash = null,
) {
  const event = {
    schemaVersion: 1,
    ownerId: c.uid,
    creationId: c.intent.creationId,
    startHash: context.startHash,
    jobToken,
    operationId: request.operationId,
    requestHash: frozenRequestHash ?? digest(request),
    contextHash: digest(context),
  };
  tx.create(c.cancelRef, event);
  tx.create(c.proofRef, { schemaVersion: 1, cancellationHash: digest(event) });
}
export async function cancelCreationInTransaction(tx, l, request) {
  if (l.cancellation) {
    if (
      l.cancellation.operationId === request.operationId &&
      l.cancellation.requestHash !== digest(request)
    )
      conflict();
    return creationView(l);
  }
  if (l.context.kind !== 'reservation' || l.cancelRequest || l.adoption) conflict();
  const head = await readWorkMetadata(
    tx,
    l.c.db.doc('books/' + l.c.intent.bookId + '/lore/' + l.c.loreId),
    [],
  );
  if (head.exists) conflict();
  await assertCreationEmpty(tx, l.c);
  writeCreationCancellation(tx, l.c, l.context, l.token, request);
  return { ...creationView(l), phase: 'cancelled', cancellationOperationId: request.operationId };
}
/** Future producers must consume this native opening, not a client token alone. */
export async function openCreationReservation(tx, c, request) {
  const l = await loadCreationReservation(tx, c, request);
  if (!l || l.context.kind !== 'reservation' || l.cancellation || l.cancelRequest || l.adoption)
    conflict();
  const root = await creationBook(tx, c),
    head = await readWorkMetadata(
      tx,
      c.db.doc('books/' + c.intent.bookId + '/lore/' + c.loreId),
      [],
    ),
    tombstone = await readWorkMetadata(
      tx,
      c.db.doc('books/' + c.intent.bookId + '/bookLoreTombstones/' + c.loreId),
      [],
    );
  if (
    !bornEqual(root, { createTime: l.context.bookBirth }) ||
    root.data().hasLoreResources !== true ||
    head.exists ||
    tombstone.exists
  )
    conflict();
  l.root = root;
  openings.set(l, tx);
  return l;
}
