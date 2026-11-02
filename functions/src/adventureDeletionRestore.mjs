import { adventureIdentityToken } from './campaignLoreOrigin.mjs';
import { createAdventureRestoreStore } from './adventureRestoreStore.mjs';
import { createAdventureRestoreMediaStore } from './adventureRestoreMediaStore.mjs';
import { createAdventureRestoreArchiveStore } from './adventureRestoreArchiveStore.mjs';
import { prepareDeletedAdventureRestoreMedia } from './adventureRestoreMediaRead.mjs';
import { prepareAdventureRestoreArchiveCleanup } from './adventureRestoreArchive.mjs';
import { assertAdventureRestoreArchiveCollected } from './adventureRestoreArchiveUnits.mjs';
import { validateMediaControl } from './adventureRestoreMediaContracts.mjs';
import { sum, restoreDate } from './adventureRestoreContracts.mjs';
import { bookRestoreStorageProof } from './bookRestoreCoverStorageContracts.mjs';
import { adventureDeletionInconsistent as invalid, digest } from './adventureDeletionContracts.mjs';

export const adventureDeletionSourceOperationId = (p, operationId, kind) =>
  digest({
    domain: 'writer-adventure-deletion-source-v1',
    ownerId: p.ownerId,
    deletionId: p.deletionId,
    operationId,
    kind,
  });

async function readSource(tx, db, p, now) {
  const rows = await tx.get(
    db
      .collection('users/' + p.ownerId + '/adventureRestores')
      .where('adventureId', '==', p.adventureId)
      .select('schemaVersion', 'ownerId', 'state')
      .orderBy('__name__')
      .limit(2),
  );
  if (!rows.docs.length) {
    const reserved = (
      await tx.getAll(db.doc('adventureRestoreReservations/' + p.adventureId), {
        fieldMask: ['kind'],
      })
    )[0];
    if (reserved.exists && reserved.data()?.kind === 'job') invalid();
    return null;
  }
  if (
    rows.docs.length !== 1 ||
    rows.docs[0].data()?.ownerId !== p.ownerId ||
    rows.docs[0].data()?.state !== 'activated'
  )
    invalid();
  const store = createAdventureRestoreStore({ db, now }),
    l = await store.load(tx, p.ownerId, rows.docs[0].id);
  if (
    l.job.adventureId !== p.adventureId ||
    adventureIdentityToken(p.ownerId, p.adventureId, l.snapshot) !== p.adventureToken
  )
    invalid();
  return { store, l };
}

/** One original media or archive checkpoint, atomically composed with deletion. */
export async function prepareAdventureDeletionRestore(tx, db, p, now, operationId, io) {
  const source = await readSource(tx, db, p, now);
  if (!source) {
    if (io) invalid();
    return { value: { ...p, part: 3, cursor: null } };
  }
  const { store, l } = source;
  const mediaStore = createAdventureRestoreMediaStore(store),
    media = await mediaStore.load(tx, l);
  if (!media.value.complete) {
    const pending = await prepareDeletedAdventureRestoreMedia(store, tx, l, media.value, p);
    if (pending && !io)
      return {
        pending: {
          token: pending.token,
          context: pending.context,
          sourceProof: pending.sourceProof,
        },
      };
    if ((pending?.token ?? null) !== (io?.token ?? null)) invalid();
    const proof = pending ? bookRestoreStorageProof(io.proof) : null;
    if (proof && proof.generation === pending.sourceProof.generation) invalid();
    const next = validateMediaControl(
      {
        ...media.value,
        checkpoint: sum(media.value.checkpoint, 1),
        processed: sum(media.value.processed, Number(Boolean(pending))),
        unavailable: sum(media.value.unavailable, Number(Boolean(pending))),
        cursor: pending?.after ?? media.value.cursor,
        complete: pending === null,
        firstOperationId:
          media.value.firstOperationId ??
          adventureDeletionSourceOperationId(p, operationId, 'media'),
        lastOperationId: adventureDeletionSourceOperationId(p, operationId, 'media'),
        updatedAt: restoreDate(now, media.value.updatedAt),
      },
      l,
    );
    mediaStore.commit(
      tx,
      l,
      media,
      {
        restoreId: l.id,
        jobToken: l.view.jobToken,
        operationId: next.lastOperationId,
        expectedCheckpoint: media.value.checkpoint,
      },
      next,
      pending,
      proof,
      null,
    );
    return {
      value: {
        ...p,
        deletedDocuments: sum(p.deletedDocuments, pending?.retirementUses.length ?? 0),
      },
    };
  }
  if (io) invalid();
  const archiveStore = createAdventureRestoreArchiveStore(store),
    archive = await archiveStore.load(tx, l, media);
  if (archive.value?.phase === 'done') {
    await assertAdventureRestoreArchiveCollected(store, tx, l);
    return { value: { ...p, part: 3, cursor: null } };
  }
  const unit = await prepareAdventureRestoreArchiveCleanup(store, tx, l, media, archive, {
    restoreId: l.id,
    jobToken: l.view.jobToken,
    operationId: adventureDeletionSourceOperationId(p, operationId, 'archive'),
    expectedCheckpoint: archive.value?.checkpoint ?? 0,
  });
  return { value: { ...p, deletedDocuments: sum(p.deletedDocuments, unit.removedDocuments) } };
}

/** Read-only gate: neither a historical job nor its counters authorize new media. */
export async function assertAdventureDeletionRestoreClosed(tx, db, p, now) {
  const source = await readSource(tx, db, p, now);
  if (!source) return;
  const { store, l } = source,
    media = await createAdventureRestoreMediaStore(store).load(tx, l);
  if (!media.value.complete) invalid();
  const archive = await createAdventureRestoreArchiveStore(store).load(tx, l, media);
  if (archive.value?.phase !== 'done') invalid();
  await assertAdventureRestoreArchiveCollected(store, tx, l);
}
