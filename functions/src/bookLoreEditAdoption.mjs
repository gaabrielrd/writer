import { assertAnalysisChildUnit } from './loreAnalysisApplicationChildBindings.mjs';
import { prepareCreationActivation } from './bookLoreCreationActivation.mjs';
import { createHash } from 'node:crypto';
import { date, integer } from './bookRestoreUploadContracts.mjs';
import { digest, readWorkMetadata } from './workProgressContracts.mjs';
import { nextBookLocalLoreVersion } from './bookLoreVersion.mjs';
import { readBookResourcePayload } from './bookResourcePayloadRead.mjs';
import { openBookLoreEditCompilation } from './bookLoreEditCompilationStore.mjs';
import { loreGenerationStorage } from './bookLoreGenerationContracts.mjs';
import { inventoryScope } from './bookLoreResourceInventoryContracts.mjs';
import { loadInventoryControl, prepareInventoryChange } from './bookLoreResourceInventoryStore.mjs';
import { assertPreparedGenerationHead } from './bookLoreEditAdoptionProofs.mjs';
import {
  editReservationPaths,
  editReservationRequest,
  editReservationConflict as conflict,
} from './bookLoreEditReservationContracts.mjs';
import {
  loadEditReservation,
  replayEditReservation,
  prepareEditReservationCommit,
} from './bookLoreEditReservationStore.mjs';
import {
  adoptionBatchScope,
  readAdoptionBatch,
  replayAdoptionBatch,
  prepareAdoptionBatchReceipt,
} from './bookLoreEditAdoptionBatch.mjs';
async function finalPrivacy(tx, l, compiled) {
  const s = compiled.storage,
    source = compiled.source.metadata.isPublic;
  if (!Object.hasOwn(s.fields, 'isPublic')) return source;
  const pointer = s.fields.isPublic;
  if (pointer === null) return { present: false, value: null };
  if (pointer.manifest.byteLength > 5 || pointer.manifest.chunkCount !== 1) conflict();
  const value = await readBookResourcePayload(tx, l.c.db, {
    uid: l.c.uid,
    bookId: l.job.context.intent.bookId,
    resource: { kind: 'lore', parentId: null, id: l.job.context.intent.loreId },
    ...pointer,
  });
  if (
    typeof value !== 'boolean' ||
    createHash('sha256').update(JSON.stringify(value)).digest('hex') !==
      pointer.manifest.contentHash
  )
    conflict();
  return { present: true, value };
}
const epoch = (v) => {
  integer(v);
  return v;
};
function nextTimestamp(now, compiled, book) {
  const values = [date(now), compiled.storage.dates.updatedAt];
  for (const n of [compiled.source.metadata.dates.updatedAt, book.updatedAt])
    if (n !== undefined) {
      integer(n);
      if (!Number.isFinite(new Date(n).getTime()) || !Number.isSafeInteger(n + 1)) conflict();
      values.push(n + 1);
    }
  const result = Math.max(...values);
  if (!Number.isFinite(new Date(result).getTime())) conflict();
  return result;
}
async function oldGeneration(tx, l, compiled) {
  const opened = compiled.source.source.opened;
  if (opened.mode !== 'payload') return null;
  const c = inventoryScope(l.c.db, l.c.uid, l.job.context.intent.bookId),
    old = await loadInventoryControl(tx, c, 'generation', opened.storage.generationId);
  if (!old) return null;
  if (old.state.phase !== 'active') conflict();
  if (old.context.preparation)
    await assertPreparedGenerationHead(tx, c, old, opened.snapshot, opened.storage);
  else if (
    digest(old.context) !==
    digest({
      schemaVersion: 1,
      kind: 'generation',
      ownerId: l.c.uid,
      bookId: c.bookId,
      bookBirth: l.job.context.bookBirth,
      loreId: l.job.context.intent.loreId,
      generationId: opened.storage.generationId,
      sourceBirth: l.job.context.sourceBirth,
      sourceUpdate: l.job.context.sourceUpdate,
      storageHash: l.job.context.sourceStorageHash,
    })
  )
    conflict();
  return prepareInventoryChange(tx, old, 'retire', { phase: 'retired' });
}
// A rejected member must not leave sibling reads running after the SDK rolls back.
async function settleReads(operations) {
  const results = await Promise.allSettled(operations),
    failure = results.find((result) => result.status === 'rejected');
  if (failure) throw failure.reason;
  return results.map((result) => result.value);
}
async function openCandidate(tx, db, uid, r) {
  const c = editReservationPaths(db, uid, r.editId),
    l = await loadEditReservation(tx, c, r);
  if (!l || l.job.kind === 'fence') conflict();
  const replay = await replayEditReservation(tx, l, 'adoptBookLoreEditGeneration', r);
  if (replay) return { l, r, replay };
  assertAnalysisChildUnit(tx, db, uid, 'edit', c.id, 'adopt');
  if (l.job.phase !== 'preparing' || l.job.revision !== r.expectedRevision) conflict();
  const compiled = await openBookLoreEditCompilation(tx, l),
    root = await readWorkMetadata(tx, db.doc('books/' + l.job.context.intent.bookId), [
      'authorId',
      'deleting',
      'localLoreVersion',
      'publicationPrivacyVersion',
      'updatedAt',
      'status',
      'hasLoreResources',
    ]),
    book = root.data(),
    before = compiled.source.metadata.isPublic,
    after = await finalPrivacy(tx, l, compiled);
  if (Object.hasOwn(book, 'hasLoreResources') && typeof book.hasLoreResources !== 'boolean')
    conflict();
  return {
    l,
    r,
    compiled,
    book,
    before,
    after,
    revoked: before.present && before.value === true && !(after.present && after.value === true),
  };
}
function adoptionFrame(candidates, now) {
  const book = candidates[0].book,
    revoked = candidates.some((c) => c.revoked),
    privacyVersion = epoch(
      Object.hasOwn(book, 'publicationPrivacyVersion') ? book.publicationPrivacyVersion : 0,
    ),
    publicationPrivacyVersion = revoked ? privacyVersion + 1 : privacyVersion;
  integer(publicationPrivacyVersion);
  for (const c of candidates) if (digest(c.book) !== digest(book)) conflict();
  return {
    timestamp: Math.max(...candidates.map((c) => nextTimestamp(now, c.compiled, book))),
    localLoreVersion: nextBookLocalLoreVersion(book),
    publicationPrivacyVersion,
    revoked,
  };
}
async function prepareCandidate(tx, candidate, frame) {
  const { l, r, compiled, before, after, revoked } = candidate,
    { timestamp, localLoreVersion, publicationPrivacyVersion } = frame,
    { db } = l.c,
    intent = l.job.context.intent,
    creating = l.job.context.sourceMode === 'creation',
    storage = loreGenerationStorage({
      ...compiled.storage,
      dates: {
        ...compiled.storage.dates,
        ...(creating ? { createdAt: timestamp } : {}),
        updatedAt: timestamp,
      },
    }),
    adoption = {
      schemaVersion: 1,
      operationId: r.operationId,
      generationRevision: 1,
      storage,
      timestamp,
      localLoreVersion,
      publicationPrivacyVersion,
      revoked,
      privacy: { before, after },
    },
    old = await oldGeneration(tx, l, compiled),
    active = await prepareInventoryChange(
      tx,
      l.generation,
      'adopt-preparation',
      { phase: 'active' },
      digest(adoption),
    ),
    creation = creating ? await prepareCreationActivation(tx, l, compiled, adoption) : null,
    edit = prepareEditReservationCommit(tx, l, 'adoptBookLoreEditGeneration', r, {
      phase: 'adopted',
      adoption,
    });
  return {
    result: edit.result,
    commit() {
      creation?.commit();
      active.commit();
      old?.commit();
      const writeHead = creating ? tx.create.bind(tx) : tx.set.bind(tx);
      writeHead(db.doc('books/' + intent.bookId + '/lore/' + intent.loreId), {
        bookId: intent.bookId,
        ...storage.dates,
        payloadStorage: storage,
        ...(after.present ? { isPublic: after.value } : {}),
      });
      return edit.commit();
    },
  };
}
function commitBook(tx, db, bookId, frame) {
  const { timestamp, localLoreVersion, publicationPrivacyVersion, revoked } = frame;
  tx.update(db.doc('books/' + bookId), {
    localLoreVersion,
    hasLoreResources: true,
    updatedAt: timestamp,
    ...(revoked ? { status: 'draft', publicationPrivacyVersion } : {}),
  });
  if (revoked) tx.delete(db.doc('publicBooks/' + bookId));
}
/** Caller owns the transaction; preparing performs reads only, commit performs writes only. */
export async function prepareBookLoreEditAdoption(tx, { db, now = () => Date.now() }, uid, input) {
  const r = editReservationRequest(uid, input, [], true, true),
    candidate = await openCandidate(tx, db, uid, r);
  if (candidate.replay) return { result: candidate.replay, commit: () => candidate.replay };
  const frame = adoptionFrame([candidate], now),
    plan = await prepareCandidate(tx, candidate, frame);
  return {
    result: plan.result,
    commit() {
      const result = plan.commit();
      commitBook(tx, db, candidate.l.job.context.intent.bookId, frame);
      return result;
    },
  };
}
/** Internal all-or-nothing adoption; no credit is charged by this primitive. */
export async function prepareBookLoreEditAdoptionBatch(
  tx,
  { db, now = () => Date.now() },
  uid,
  input,
) {
  const scope = adoptionBatchScope(db, uid, input),
    candidates = await settleReads(
      scope.request.requests.map((r) => openCandidate(tx, db, uid, r)),
    ),
    first = candidates[0].l.job.context,
    ids = new Set();
  for (const { l } of candidates) {
    const context = l.job.context;
    if (
      context.intent.bookId !== first.intent.bookId ||
      digest(context.bookBirth) !== digest(first.bookBirth) ||
      ids.has(context.intent.loreId)
    )
      conflict();
    ids.add(context.intent.loreId);
  }
  const previous = await readAdoptionBatch(tx, scope);
  if (previous) {
    const result = await replayAdoptionBatch(tx, scope, previous, candidates);
    return { result, commit: () => result };
  }
  if (candidates.some((c) => c.replay)) conflict();
  const frame = adoptionFrame(candidates, now),
    plans = await settleReads(candidates.map((c) => prepareCandidate(tx, c, frame))),
    batch = prepareAdoptionBatchReceipt(tx, scope, candidates, frame, plans);
  return {
    result: batch.result,
    commit() {
      for (const plan of plans) plan.commit();
      commitBook(tx, db, first.intent.bookId, frame);
      return batch.commit();
    },
  };
}
export function createBookLoreEditAdoptionService({ db, now = () => Date.now() }) {
  return {
    async adoptBookLoreEditGeneration(uid, input) {
      return db.runTransaction(async (tx) =>
        (await prepareBookLoreEditAdoption(tx, { db, now }, uid, input)).commit(),
      );
    },
  };
}
