import { sourceInspectionFixture } from './bookLoreSourceInspectionFixture.mjs';
import { removalFixture } from './bookLoreRemovalFixture.mjs';
import { createBookLoreRemovalBatchService } from '../../src/bookLoreRemovalBatch.mjs';
import { removalBatchHash, removalBatchPaths } from '../../src/bookLoreRemovalBatchContracts.mjs';
export async function removalBatchFixture(
  db,
  {
    count = 3,
    batchId = 'remove-batch-0001',
    publicIndices = [0],
    modes = ['inline', 'v1', 'v2'],
    uid = 'author',
    bookId = 'book',
  } = {},
) {
  const seeds = [];
  for (let n = 0; n < count; n++) {
    const source = await sourceInspectionFixture(db, {
      uid,
      bookId,
      id: 'entity-' + n,
      mode: modes[n % modes.length],
      data: {
        name: 'PRIVATE_NAME_' + n,
        category: 'other',
        details: n === 0 ? 'PRIVATE_PROSE'.repeat(8000) : 'Tiny',
        ...(publicIndices.includes(n) ? { isPublic: true } : n % 2 ? { isPublic: false } : {}),
        createdAt: 1000,
        updatedAt: n === 0 ? 10000 : 1001,
      },
    });
    seeds.push(source.seed);
  }
  const sibling = await sourceInspectionFixture(db, {
    uid,
    bookId,
    id: 'unselected',
    mode: 'inline',
    data: {
      name: 'Unselected',
      category: 'other',
      details: 'PRESERVE_UNSELECTED',
      isPublic: false,
    },
  });
  await db.runTransaction(async (tx) => {
    const user = db.doc('users/' + uid),
      previous = await tx.get(user);
    tx.update(db.doc('books/' + bookId), {
      createdAt: 500,
      updatedAt: 9000,
      localLoreVersion: 10,
      publicationPrivacyVersion: 4,
      status: 'published',
    });
    tx.create(db.doc('publicBooks/' + bookId), { revisionId: 'old' });
    if (!previous.exists) tx.create(user, { credits: 20 });
  });
  const members = [];
  for (let n = 0; n < count; n++) {
    const source = await sourceInspectionFixture(db, {
      uid,
      bookId,
      id: seeds[n].id,
      inspectionId: 'bulk-source-' + n,
      existingSeed: seeds[n],
    });
    members.push(await removalFixture(db, { source, removalId: 'bulk-removal-' + n }));
  }
  const input = { batchId, requests: members.map((m) => m.intent) },
    control = {
      leaderRemovalId: members[0].intent.removalId,
      batchId,
      intentHash: removalBatchHash(uid, input),
    },
    c = removalBatchPaths(db, uid, control.leaderRemovalId, batchId),
    factory = () => createBookLoreRemovalBatchService({ db, now: () => 3000 });
  return {
    db,
    uid,
    bookId,
    members,
    sibling,
    input,
    control,
    c,
    factory,
    start: () => factory().startBookLoreRemovalBatch(uid, input),
    get: () => factory().getBookLoreRemovalBatch(uid, control),
  };
}
