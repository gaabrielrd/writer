import {
  authorize,
  closed,
  restoreId,
  restoreHash,
  sum,
  inconsistent,
  restoreFail as fail,
} from './bookRestoreUploadContracts.mjs';
import { digest } from './sceneContracts.mjs';
import { createVerifiedBookRestoreContent } from './bookRestoreContentRead.mjs';
import { readBookRestoreArtifact } from './bookRestoreArtifacts.mjs';
import { readBookRestorePersonaLibraryBatch } from './bookRestorePersonaLibraryBatch.mjs';
import { inspectBookRestoreUniverse } from './bookRestoreUniverse.mjs';
import { nativeRestoreToken } from './bookRestoreIntegrityRead.mjs';
import { bookBackupIdentity } from './bookBackupContext.mjs';
import { validateBookBackupCover } from './bookBackupCover.mjs';
import { BOOK_RESTORE_AUDIT_LAYOUT, verifyAuditAnchor } from './bookRestoreAuditInventory.mjs';

import { verifyBookRestoreEditorialAudit } from './bookRestoreEditorialAudit.mjs';
import {
  isBookRestoreEditorial,
  prepareBookRestoreEditorialActivation,
} from './bookRestoreEditorialActivation.mjs';

function available(loaded, editorialActivation = false) {
  const editorial = isBookRestoreEditorial(loaded.job);
  if (editorial && !editorialActivation)
    fail('failed-precondition', 'editorial-activation-unavailable');
  const p = loaded.job.preparation;
  if (
    loaded.job.state !== 'content-verified' ||
    loaded.job.cleanupVersion !== (editorial ? 15 : 14) ||
    p?.schemaVersion !== 13 ||
    p.phase !== 'activation-ready' ||
    p.audit.phase !== 'done' ||
    p.audit.family !== BOOK_RESTORE_AUDIT_LAYOUT.length ||
    p.cleanedArtifacts !== 0 ||
    p.personaLibrary.revoked ||
    p.coverStorage.state !== 'prepared' ||
    p.coverStorage.fence !== null
  )
    fail('failed-precondition', 'activation-review-phase-conflict');
}
function preview(title) {
  let result = title.slice(0, 300);
  const last = result.charCodeAt(result.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) result = result.slice(0, -1);
  return { titlePreview: result, titleTruncated: result.length !== title.length };
}
function same(a, b) {
  return digest(a) === digest(b);
}
function proof(artifact) {
  return {
    target: nativeRestoreToken(artifact.snapshot),
    journal: nativeRestoreToken(artifact.journal),
  };
}
/** Certifies the current frozen audit seal before review or atomic retirement. */
export async function verifyBookRestoreActivationAudit(
  tx,
  db,
  loaded,
  readOp,
  editorialActivation = false,
) {
  available(loaded, editorialActivation);
  if (isBookRestoreEditorial(loaded.job))
    return (await verifyBookRestoreEditorialAudit(tx, db, loaded, readOp)).seal;
  const p = loaded.job.preparation;
  await verifyAuditAnchor(tx, db, loaded, p.audit.anchor);
  const seal = await tx.get(
    db.doc('users/' + loaded.job.ownerId + '/bookRestoreOperations/' + p.audit.sealOperationId),
  );
  if (!seal.exists) inconsistent();
  const sealReceipt = readOp(
    seal,
    loaded.job.ownerId,
    loaded.job.restoreId,
    restoreHash(seal.data().fingerprint),
    loaded,
  );
  const sealIdentity = bookBackupIdentity(seal),
    jobIdentity = bookBackupIdentity(loaded.snapshot);
  if (
    !['advanceBookRestoreAudit', 'retireBookRestoreActivation'].includes(sealReceipt.action) ||
    sealReceipt.state !== 'content-verified' ||
    sealReceipt.checkpoint !== loaded.job.checkpoint ||
    !same(sealReceipt.preparation, p) ||
    !same(sealIdentity.created, sealIdentity.updated) ||
    sealIdentity.created.seconds > jobIdentity.updated.seconds ||
    (sealIdentity.created.seconds === jobIdentity.updated.seconds &&
      sealIdentity.created.nanoseconds > jobIdentity.updated.nanoseconds)
  )
    inconsistent();
  return seal;
}

/** Internal transaction port shared with atomic activation. No writes or grants. */
export async function prepareBookRestoreActivationReview(
  tx,
  db,
  loaded,
  items,
  readOp,
  editorialActivation = false,
) {
  available(loaded, editorialActivation);
  const p = loaded.job.preparation;
  for (const [key, kind] of [
    ['metadata', 'book-metadata'],
    ['universe', 'book-universe'],
    ['cover', 'book-cover'],
  ]) {
    if (items[key]?.record.kind !== kind || items[key].record.id !== loaded.job.bookId)
      inconsistent();
    await items[key].verify(tx);
  }
  if (!same(items.universe.value.origin, p.universe.origin)) inconsistent();
  const editorial = isBookRestoreEditorial(loaded.job)
    ? await prepareBookRestoreEditorialActivation(tx, db, loaded, readOp)
    : null;
  const seal = editorial?.seal ?? (await verifyBookRestoreActivationAudit(tx, db, loaded, readOp));
  const control = await readBookRestoreArtifact(tx, db, loaded, 'work-control', 'current'),
    index = await readBookRestoreArtifact(tx, db, loaded, 'entity-index-control', 'entity-scenes'),
    coverDefinition = await readBookRestoreArtifact(tx, db, loaded, 'cover-definition', 'current'),
    coverIntent = await readBookRestoreArtifact(tx, db, loaded, 'cover-storage', 'current'),
    draftDefinition = await readBookRestoreArtifact(tx, db, loaded, 'draft-definition', 'current'),
    batch = await readBookRestorePersonaLibraryBatch(tx, db, loaded, 'preparing'),
    cover = validateBookBackupCover(items.cover.value.cover),
    intent = coverIntent.value,
    universe = await inspectBookRestoreUniverse(
      tx,
      db,
      loaded.job.ownerId,
      items.universe.value.origin,
    );
  if (
    control.value.countReady !== false ||
    control.value.wordCount !== p.wordCount ||
    index.value.complete !== true ||
    !same(coverDefinition.value, { schemaVersion: 1, cover }) ||
    !same(intent, {
      schemaVersion: 1,
      cover,
      state: 'prepared',
      storage: p.coverStorage.proof,
      fence: null,
    }) ||
    cover.kind !== p.cover.kind ||
    (cover.kind === 'library' && cover.imageId !== p.cover.imageId) ||
    (draftDefinition.value.state === 'none'
      ? p.draft.outcome !== 'none'
      : draftDefinition.value.outcome !== p.draft.outcome)
  )
    inconsistent();
  const result = {
    schemaVersion: 1,
    bookId: loaded.job.bookId,
    checkpoint: loaded.job.checkpoint,
    summary: {
      ...preview(items.metadata.value.book.title),
      visibility: 'private',
      counts: {
        acts: p.actCount,
        chapters: p.chapterCount,
        words: p.wordCount,
        lore: p.loreCount,
        scenes: p.resourceCounts.scene,
        versions: sum(p.history.versions, p.draft.outcome === 'version' ? 1 : 0),
        profiles: p.personaLibrary.installed,
      },
      universe: {
        originKind: universe.origin.kind,
        observed: universe.observed,
        universeId: universe.universeId,
      },
      cover: { kind: cover.kind },
      draft: { outcome: p.draft.outcome },
      ...(editorial ? { editorial: editorial.summary } : {}),
    },
  };
  const reviewToken = digest({
    schemaVersion: 1,
    domain: 'writer-book-activation-review',
    ownerId: loaded.job.ownerId,
    restoreId: loaded.job.restoreId,
    jobToken: loaded.view.jobToken,
    job: nativeRestoreToken(loaded.snapshot),
    source: loaded.job.source,
    confirmedReviewHash: loaded.job.reviewHash,
    validationCheckpoint: loaded.job.validationCheckpoint,
    preparation: p,
    metadata: digest(items.metadata.value),
    universe,
    cover,
    seal: nativeRestoreToken(seal),
    batch: nativeRestoreToken(batch.snapshot),
    artifacts: [control, index, coverDefinition, coverIntent, draftDefinition].map(proof),
    result,
    ...(editorial ? { editorial: editorial.certificate } : {}),
  });
  return {
    result: { ...result, reviewToken },
    control,
    ...(editorial ? { editorial } : {}),
    batch,
    universe,
    cover,
    storageProof: p.coverStorage.proof,
    storageContext:
      cover.kind !== 'library'
        ? null
        : {
            ownerId: loaded.job.ownerId,
            restoreId: loaded.job.restoreId,
            jobToken: loaded.view.jobToken,
            imageId: cover.imageId,
            contentHash: cover.contentHash,
            byteLength: cover.byteLength,
          },
  };
}
export function createBookRestoreActivationReviewService({
  db,
  load,
  readOp,
  assets,
  editorialActivation = false,
}) {
  return {
    async getBookRestoreActivationReview(uid, input) {
      authorize(uid);
      closed(input, ['restoreId', 'jobToken']);
      const id = restoreId(input.restoreId),
        token = restoreHash(input.jobToken),
        initial = await db.runTransaction(async (tx) => {
          const loaded = await load(tx, uid, id, token);
          available(loaded, editorialActivation);
          return loaded;
        }),
        reader = await createVerifiedBookRestoreContent({ db, uid, id, token, load }),
        items = {
          metadata: await reader.readMappedItem(0),
          universe: await reader.readMappedItem(initial.job.preparation.universe.itemIndex),
          cover: await reader.readMappedItem(initial.job.preparation.cover.startIndex),
        },
        inspect = (tx) =>
          load(tx, uid, id, token).then((loaded) =>
            prepareBookRestoreActivationReview(tx, db, loaded, items, readOp, editorialActivation),
          ),
        before = await db.runTransaction(inspect);
      if (before.storageContext) {
        if (typeof assets?.verify !== 'function')
          fail('failed-precondition', 'cover-storage-unavailable');
        const verified = await assets.verify(before.storageContext, before.storageProof);
        if (!same(verified, before.storageProof)) inconsistent();
      }
      const after = await db.runTransaction(inspect);
      if (after.result.reviewToken !== before.result.reviewToken)
        fail('failed-precondition', 'activation-review-changed');
      return after.result;
    },
  };
}
