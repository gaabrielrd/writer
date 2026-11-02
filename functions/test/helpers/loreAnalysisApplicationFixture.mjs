import { loreLogicalFixture } from './bookLoreLogicalFixture.mjs';
import { digest } from '../../src/workProgressContracts.mjs';
export async function analysisApplicationFixture(
  db,
  { mode = 'v1', globals = false, changes = null, analyze = true } = {},
) {
  const f = await loreLogicalFixture(db, { mode });
  if (globals) {
    await db.runTransaction(async (tx) => {
      tx.create(db.doc('universes/world'), { authorId: f.uid, loreVersion: 0, deleting: false });
      tx.create(db.doc('universes/world/lore/global'), {
        name: 'Global original',
        category: 'other',
        summary: 'Global summary',
        details: 'Global private body',
        createdAt: 1000,
        updatedAt: 1000,
      });
      tx.update(db.doc('books/book'), { universeId: 'world' });
    });
    f.request.loreVersions.push(['universe:world:global', 1000]);
  }
  changes ??= [{ scope: 'local', entityId: f.entityId, input: { summary: 'Confirmed' } }];
  if (analyze) await f.analyze();
  const input = { id: f.request.requestId, text: f.request.text, changes },
    control = { id: input.id, requestHash: digest([input.text, changes]) },
    path = 'users/' + f.uid + '/loreAnalysisApplications/' + input.id;
  return {
    ...f,
    input,
    control,
    path,
    reserve: () => f.service.reserveLoreAnalysisApplication(f.uid, input),
    get: () => f.service.getLoreAnalysisApplication(f.uid, control),
    cancel: (operationId = 'cancel-analysis-application') =>
      f.service.cancelLoreAnalysisApplication(f.uid, { ...control, operationId }),
  };
}
