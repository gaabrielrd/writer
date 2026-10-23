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
  commitEditReservation,
} from './bookLoreEditReservationStore.mjs';
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
export function createBookLoreEditAdoptionService({ db, now = () => Date.now() }) {
  return {
    async adoptBookLoreEditGeneration(uid, input) {
      const r = editReservationRequest(uid, input, [], true, true),
        c = editReservationPaths(db, uid, r.editId);
      return db.runTransaction(async (tx) => {
        const l = await loadEditReservation(tx, c, r);
        if (!l || l.job.kind === 'fence') conflict();
        const replay = await replayEditReservation(tx, l, 'adoptBookLoreEditGeneration', r);
        if (replay) return replay;
        if (l.job.phase !== 'preparing' || l.job.revision !== r.expectedRevision) conflict();
        const compiled = await openBookLoreEditCompilation(tx, l),
          intent = l.job.context.intent,
          root = await readWorkMetadata(tx, db.doc('books/' + intent.bookId), [
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
          after = await finalPrivacy(tx, l, compiled),
          localLoreVersion = nextBookLocalLoreVersion(book),
          privacyVersion = epoch(
            Object.hasOwn(book, 'publicationPrivacyVersion') ? book.publicationPrivacyVersion : 0,
          ),
          revoked =
            before.present && before.value === true && !(after.present && after.value === true),
          publicationPrivacyVersion = revoked ? privacyVersion + 1 : privacyVersion,
          timestamp = nextTimestamp(now, compiled, book);
        integer(publicationPrivacyVersion);
        if (Object.hasOwn(book, 'hasLoreResources') && typeof book.hasLoreResources !== 'boolean')
          conflict();
        const storage = loreGenerationStorage({
            ...compiled.storage,
            dates: { ...compiled.storage.dates, updatedAt: timestamp },
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
          );
        active.commit();
        old?.commit();
        tx.set(db.doc('books/' + intent.bookId + '/lore/' + intent.loreId), {
          bookId: intent.bookId,
          ...storage.dates,
          payloadStorage: storage,
          ...(after.present ? { isPublic: after.value } : {}),
        });
        tx.update(db.doc('books/' + intent.bookId), {
          localLoreVersion,
          hasLoreResources: true,
          updatedAt: timestamp,
          ...(revoked ? { status: 'draft', publicationPrivacyVersion } : {}),
        });
        if (revoked) tx.delete(db.doc('publicBooks/' + intent.bookId));
        return commitEditReservation(tx, l, 'adoptBookLoreEditGeneration', r, {
          phase: 'adopted',
          adoption,
        });
      });
    },
  };
}
