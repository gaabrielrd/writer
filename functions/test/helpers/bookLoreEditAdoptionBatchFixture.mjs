import { adoptionFixture } from './bookLoreEditAdoptionFixture.mjs';
import { creationAdoptionFixture } from './bookLoreCreationAdoptionFixture.mjs';
import { createBookLoreResourceInventoryService } from '../../src/bookLoreResourceInventory.mjs';
import { prepareBookLoreEditAdoptionBatch } from '../../src/bookLoreEditAdoption.mjs';
export async function adoptionBatchFixture(
  db,
  {
    uid = 'author',
    bookId = 'book',
    prefix = 'batch',
    concurrency = 1,
    members = [{ mode: 'inline' }, { creating: true }],
  } = {},
) {
  const fixtures = [];
  async function prepare(options, index) {
    const { creating = false, registerOld = false, ...rest } = options,
      common = { uid, bookId, editId: prefix + '-edit-' + index, ...rest },
      f = creating
        ? await creationAdoptionFixture(db, {
            creationId: prefix + '-creation-' + index,
            ...common,
          })
        : await adoptionFixture(db, { loreId: prefix + '-entity-' + index, ...common });
    if (registerOld) {
      const api = createBookLoreResourceInventoryService({ db });
      let registered = false;
      for (let attempt = 0; attempt < 5 && !registered; attempt++)
        registered = (
          await api.registerBookLoreSourceReference(uid, {
            bookId,
            loreId: f.loreId,
            sourceToken: f.source.view.readToken,
            selector: { section: 'base', page: 0 },
          })
        ).registered;
      if (!registered) throw Error('Source registration did not finish');
    }
    return f;
  }
  // Establish the common book before parallel independent preparations.
  fixtures.push(await prepare(members[0], 0));
  for (let start = 1; start < members.length; start += concurrency)
    fixtures.push(
      ...(await Promise.all(
        members
          .slice(start, start + concurrency)
          .map((member, offset) => prepare(member, start + offset)),
      )),
    );
  return {
    db,
    uid,
    bookId,
    members: fixtures,
    request: { batchId: prefix + '-adoption', requests: fixtures.map((f) => f.adoptRequest) },
  };
}
export const applyAdoptionBatch = (f, input = f.request, uid = f.uid) =>
  f.db.runTransaction(async (tx) =>
    (
      await prepareBookLoreEditAdoptionBatch(tx, { db: f.db, now: () => 2000 }, uid, input)
    ).commit(),
  );
