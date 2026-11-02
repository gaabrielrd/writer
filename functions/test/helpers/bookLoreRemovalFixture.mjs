import {
  sourceInspectionFixture,
  finishSourceInspection,
} from './bookLoreSourceInspectionFixture.mjs';
import { createBookLoreRemovalService } from '../../src/bookLoreRemoval.mjs';
import { removalStartHash, removalTombstonePath } from '../../src/bookLoreRemovalContracts.mjs';
export async function removalFixture(
  db,
  {
    removalId = 'remove-lore-0001',
    inspectionId = 'removal-inspection',
    source = null,
    ...options
  } = {},
) {
  const inspected =
      source ?? (await sourceInspectionFixture(db, { mode: 'inline', inspectionId, ...options })),
    ready = await finishSourceInspection(inspected),
    intent = {
      bookId: inspected.bookId,
      loreId: inspected.id,
      removalId,
      sourceToken: inspected.view.readToken,
      inspection: {
        inspectionId: inspected.inspectionId,
        startHash: inspected.startHash,
        jobToken: ready.jobToken,
      },
    },
    startHash = removalStartHash(intent),
    path = 'users/' + inspected.uid + '/bookLoreRemovals/' + removalId,
    factory = () => createBookLoreRemovalService({ db, now: () => 3000 });
  return {
    db,
    uid: inspected.uid,
    bookId: inspected.bookId,
    loreId: inspected.id,
    source: inspected,
    intent,
    startHash,
    path,
    tombstonePath: removalTombstonePath(inspected.bookId, inspected.id),
    removalFactory: factory,
    start: () => factory().startBookLoreRemoval(inspected.uid, intent),
    get: () => factory().getBookLoreRemoval(inspected.uid, { removalId, startHash }),
    step: (p) =>
      factory().advanceBookLoreRemoval(inspected.uid, removalControl({ intent, startHash }, p)),
  };
}
export const removalControl = (f, p, operationId = 'advance-removal-' + p.revision) => ({
  removalId: f.intent.removalId,
  startHash: f.startHash,
  jobToken: p.jobToken,
  expectedRevision: p.revision,
  operationId,
});
export async function finishRemoval(f, p = null) {
  p ??= await f.start();
  for (let i = 0; i < 10000 && !p.complete; i++) p = (await f.step(p)).progress;
  if (!p.complete) throw Error('Lore removal did not finish');
  return p;
}
