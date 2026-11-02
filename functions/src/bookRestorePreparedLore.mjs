import { createBookLoreReadOperations } from './bookLoreRead.mjs';
import { loreChanged } from './bookLoreReadContracts.mjs';
import { readBookLoreRecordPart, openBookLoreRelationPage } from './bookLoreStorageRead.mjs';
import { readBookRestoreArtifact } from './bookRestoreArtifacts.mjs';
import { lorePayloadSegmentId } from './bookRestoreLorePayloadContracts.mjs';
import {
  authorize,
  closed,
  restoreId,
  restoreHash,
  chunkId,
  born,
  inconsistent,
  restoreFail as fail,
} from './bookRestoreUploadContracts.mjs';
import { digest } from './sceneContracts.mjs';

function available(loaded) {
  const p = loaded.job.preparation;
  if (
    loaded.job.state !== 'content-verified' ||
    loaded.job.cleanupVersion < 8 ||
    p?.schemaVersion < 4 ||
    p?.counts?.step !== 'done' ||
    (loaded.job.payloadInventoryVersion === 1 && p.loreStaging?.step !== 'done')
  )
    fail('failed-precondition', 'prepared-lore-unavailable');
}
/** Internal server port only. Every C1-shaped operation reauthorizes the original native job. */
export function createBookRestorePreparedLoreService({ db, load }) {
  return {
    async openPreparedBookRestoreLore(uid, input) {
      authorize(uid);
      closed(input, ['restoreId', 'jobToken']);
      const id = restoreId(input.restoreId),
        jobToken = restoreHash(input.jobToken),
        initial = await db.runTransaction(async (tx) => {
          const loaded = await load(tx, uid, id, jobToken);
          available(loaded);
          return loaded;
        }),
        bookId = initial.job.bookId,
        tokenScope = digest({
          domain: 'prepared-book-restore-lore',
          uid,
          restoreId: id,
          jobToken,
          bookId,
          validationCheckpoint: initial.job.validationCheckpoint,
        });
      async function readBook({ tx, c }) {
        if (c.uid !== uid || c.bookId !== bookId) fail('not-found', 'prepared-lore-unavailable');
        const loaded = await load(tx, uid, id, jobToken);
        available(loaded);
        if (loaded.job.bookId !== bookId) inconsistent();
        return {
          loaded,
          snapshot: loaded.snapshot,
          version: loaded.job.checkpoint,
          tokenScope,
          listToken: digest({
            domain: 'prepared-book-restore-lore-list',
            tokenScope,
            birth: born(loaded.snapshot),
            checkpoint: loaded.job.checkpoint,
          }),
        };
      }
      async function readEntity({ tx, c, book, id: entityId, snapshot }) {
        if (!/^restore-[a-f0-9]{64}$/.test(entityId)) loreChanged();
        const artifact = await readBookRestoreArtifact(tx, db, book.loaded, 'lore', entityId, {
          optional: !snapshot,
          metadataOnly: Boolean(snapshot),
        });
        if (artifact) return artifact.snapshot;
        // Only simultaneous native absence of target and journal can return a missing snapshot.
        return tx.get(db.doc(c.path + '/lore/' + entityId));
      }
      async function readPart({ tx, book, opened, section, page, index, field }) {
        const result = await readBookLoreRecordPart(tx, opened, section, page, index, field);
        if (opened.mode === 'payload') {
          let pointer;
          if (section === 'relations') {
            const relation = await openBookLoreRelationPage(tx, opened, page);
            await readBookRestoreArtifact(
              tx,
              db,
              book.loaded,
              'lore-segment',
              lorePayloadSegmentId(
                opened.storage.relations.generationId ?? opened.storage.generationId,
                page * 64,
              ),
              { metadataOnly: true },
            );
            pointer = relation.pointer;
          } else pointer = section === 'field' ? opened.storage.fields[field] : opened.storage.base;
          if (!pointer) inconsistent();
          await readBookRestoreArtifact(
            tx,
            db,
            book.loaded,
            'payload-body',
            pointer.manifest.bodyId,
            { metadataOnly: true },
          );
          await readBookRestoreArtifact(
            tx,
            db,
            book.loaded,
            'payload-chunk',
            pointer.manifest.bodyId + ':' + chunkId(index),
            { metadataOnly: true },
          );
        }
        return result;
      }
      return Object.freeze({
        bookId,
        ...createBookLoreReadOperations({ db, readBook, readEntity, readPart }),
      });
    },
  };
}
