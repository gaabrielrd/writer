import { createBookLoreReadService } from '../../src/bookLoreRead.mjs';
import { createBookLoreSourceInspectionService } from '../../src/bookLoreSourceInspection.mjs';
import {
  inspectionPaths,
  inspectionIntent,
  inspectionStartHash,
} from '../../src/bookLoreSourceInspectionContracts.mjs';
import { openBookLoreSourceInspection } from '../../src/bookLoreSourceInspectionStore.mjs';
import { seedBookLoreRead } from './bookLoreReadFixture.mjs';
import { seedBookLoreGeneration } from './bookLoreGenerationFixture.mjs';
export async function sourceInspectionFixture(
  db,
  {
    uid = 'author',
    bookId = 'book',
    id = 'entity',
    inspectionId = 'source-inspection-0001',
    mode = 'v1',
    existingSeed = null,
    data = {
      name: 'Original',
      category: 'other',
      details: 'PRIVATE_PROSE',
      isPublic: true,
      createdAt: 1000,
      updatedAt: 1001,
    },
    ...options
  } = {},
) {
  const seed =
      existingSeed ??
      (mode === 'v2'
        ? await seedBookLoreGeneration(db, { uid, bookId, id, baseData: data, ...options })
        : await seedBookLoreRead(db, {
            uid,
            bookId,
            id,
            data,
            inline: mode === 'inline',
            ...options,
          })),
    view = await createBookLoreReadService({ db }).getBookLoreRead(uid, { bookId, id }),
    intent = inspectionIntent(uid, {
      bookId,
      loreId: id,
      inspectionId,
      sourceToken: view.readToken,
    }),
    startHash = inspectionStartHash(intent),
    c = inspectionPaths(db, uid, inspectionId),
    factory = () => createBookLoreSourceInspectionService({ db, now: () => 2000 });
  return { db, uid, bookId, id, inspectionId, seed, view, intent, startHash, c, factory };
}
export const inspectionControl = (f, p, operationId = 'inspect-' + p.revision) => ({
  inspectionId: f.inspectionId,
  startHash: f.startHash,
  jobToken: p.jobToken,
  operationId,
  expectedRevision: p.revision,
});
export async function finishSourceInspection(f, p) {
  let current = p ?? (await f.factory().startBookLoreSourceInspection(f.uid, f.intent));
  while (['checking', 'base', 'privacy'].includes(current.phase))
    current = (
      await f.factory().advanceBookLoreSourceInspection(f.uid, inspectionControl(f, current))
    ).progress;
  return current;
}
export const sourceInspectionMetadata = (f, p) =>
  f.db.runTransaction(
    async (tx) =>
      (
        await openBookLoreSourceInspection(tx, f.c, {
          startHash: f.startHash,
          jobToken: p.jobToken,
        })
      ).metadata,
  );
export const cancelSourceInspection = (f, p) =>
  f.factory().cancelBookLoreSourceInspection(f.uid, {
    inspectionId: f.inspectionId,
    startHash: f.startHash,
    jobToken: p.jobToken,
    operationId: 'cancel-source',
  });
