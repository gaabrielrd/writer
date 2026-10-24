import { seedCreationBook, creationFixture } from './bookLoreCreationFixture.mjs';
import { createBookLoreWriteRecoveryService } from '../../src/bookLoreWriteRecovery.mjs';
import { recoveryPaths, recoveryRequestHash } from '../../src/bookLoreWriteRecoveryContracts.mjs';

export async function bookLoreCreationRecoveryFixture(
  db,
  {
    uid = 'author',
    bookId = 'book',
    creationId = 'lore-creation-' + 'c'.repeat(64),
    writeId = 'new-ficha-draft',
  } = {},
) {
  const root = await db.runTransaction((tx) => tx.get(db.doc('books/' + bookId)));
  if (!root.exists) await seedCreationBook(db, bookId, uid);
  const parent = creationFixture(db, { uid, bookId, creationId }),
    progress = await parent.start(),
    intent = {
      writeId,
      bookId,
      loreId: progress.loreId,
      sourceToken: progress.jobToken,
      intentHash: 'd'.repeat(64),
      creation: {
        creationId,
        startHash: progress.startHash,
        jobToken: progress.jobToken,
      },
    },
    service = createBookLoreWriteRecoveryService({ db, now: () => 8000 }),
    c = recoveryPaths(db, uid, writeId);
  return {
    db,
    uid,
    bookId,
    parent,
    progress,
    intent,
    service,
    c,
    requestHash: recoveryRequestHash(uid, intent),
  };
}
