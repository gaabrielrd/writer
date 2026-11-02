import { loreLogicalFixture } from './bookLoreLogicalFixture.mjs';
import { createBookLoreReadService } from '../../src/bookLoreRead.mjs';
import { createBookLoreWriteRecoveryService } from '../../src/bookLoreWriteRecovery.mjs';
import { recoveryPaths, recoveryRequestHash } from '../../src/bookLoreWriteRecoveryContracts.mjs';
export async function bookLoreWriteRecoveryFixture(
  db,
  { mode = 'inline', writeId = 'private-draft' } = {},
) {
  const seed = await loreLogicalFixture(db, { mode }),
    view = await createBookLoreReadService({ db }).getBookLoreRead(seed.uid, {
      bookId: seed.bookId,
      id: seed.entityId,
    }),
    intent = {
      writeId,
      bookId: seed.bookId,
      loreId: seed.entityId,
      sourceToken: view.readToken,
      intentHash: 'c'.repeat(64),
    },
    service = createBookLoreWriteRecoveryService({ db, now: () => 8000 }),
    c = recoveryPaths(db, seed.uid, writeId),
    requestHash = recoveryRequestHash(seed.uid, intent);
  return { ...seed, db, intent, service, c, requestHash };
}
export const recoveryControl = (progress) => ({
  writeId: progress.writeId,
  requestHash: progress.requestHash,
  jobToken: progress.jobToken,
});
