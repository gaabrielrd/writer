import { digest } from '../../src/workProgressContracts.mjs';
import { born } from '../../src/bookRestoreUploadContracts.mjs';
import { lorePayloadSegmentId } from '../../src/bookRestoreLorePayloadContracts.mjs';
import { createBookLoreResourceInventoryService } from '../../src/bookLoreResourceInventory.mjs';
import { createBookLoreReadService } from '../../src/bookLoreRead.mjs';
import { seedBookLoreRead } from './bookLoreReadFixture.mjs';
import { seedBookLoreGeneration } from './bookLoreGenerationFixture.mjs';
export async function resourceInventoryFixture(
  db,
  {
    uid = 'author',
    bookId = 'book',
    id = 'entity',
    mode = 'v1',
    selector = { section: 'base', page: 0 },
    data = { name: 'Original', category: 'other', details: 'PRIVATE_PROSE' },
    ...options
  } = {},
) {
  const seed =
      mode === 'v2'
        ? await seedBookLoreGeneration(db, { uid, bookId, id, baseData: data, ...options })
        : await seedBookLoreRead(db, { uid, bookId, id, data, ...options }),
    factory = () => createBookLoreResourceInventoryService({ db }),
    view = await createBookLoreReadService({ db }).getBookLoreRead(uid, { bookId, id }),
    request = { bookId, loreId: id, sourceToken: view.readToken, selector },
    body =
      selector.section === 'base'
        ? seed.base
        : selector.section === 'field'
          ? seed.bodies[selector.field]
          : mode === 'v2' && options.relations !== undefined
            ? seed.newSegments[selector.page].body
            : seed.segments[selector.page].payload,
    bodyId = body.prepared.manifest.bodyId,
    generationId = seed.storage.generationId,
    controlPath = 'books/' + bookId + '/bookResourceInventory/' + bodyId,
    generationPath = 'books/' + bookId + '/bookLoreGenerations/' + generationId;
  return {
    db,
    uid,
    bookId,
    id,
    selector,
    seed,
    body,
    bodyId,
    generationId,
    controlPath,
    generationPath,
    request,
    factory,
  };
}
export async function registerInventorySource(f, request = f.request) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const value = await f.factory().registerBookLoreSourceReference(f.uid, request);
    if (value.registered) return value;
  }
  throw Error('Inventory initialization did not converge');
}
export async function replaceInventorySource(f) {
  // Explicit next-head harness only, not an editing or adoption implementation.
  await f.db.runTransaction(async (tx) =>
    tx.set(f.db.doc(f.seed.path), {
      bookId: f.bookId,
      name: 'Replacement',
      category: 'other',
      updatedAt: 3000,
    }),
  );
}
export const retireInventoryGeneration = (f, generationId = f.generationId) =>
  f.factory().retireBookLoreInventoryGeneration(f.uid, { bookId: f.bookId, generationId });
export const collectInventoryBody = (f, limit = 16) =>
  f.factory().collectBookLoreInventoryBody(f.uid, {
    bookId: f.bookId,
    bodyId: f.bodyId,
    limit,
  });
export async function drainInventoryBody(f, limit = 16) {
  const steps = [];
  for (let attempt = 0; attempt < 1000; attempt++) {
    const value = await collectInventoryBody(f, limit);
    steps.push(value);
    if (value.complete) return steps;
    if (value.deferred) throw Error('Unexpected deferred collection: ' + value.reason);
  }
  throw Error('Collection did not converge');
}

/** Raw current-head harness to exercise reachability across arbitrary page positions. */
export async function installInventoryRelationHead(f, entries, key = 'relocated') {
  const generationId = digest(['inventory-head', f.bookId, f.id, key]),
    relationId = digest(['inventory-relations', generationId]),
    paths = [];
  let sealBirth = f.seed.storage.sealBirth;
  for (let page = 0; page < entries.length; page++) {
    const path =
      f.seed.bookPath + '/bookLoreSegments/' + lorePayloadSegmentId(relationId, page * 64);
    await f.db.runTransaction(async (tx) =>
      tx.create(f.db.doc(path), {
        schemaVersion: 2,
        ownerId: f.uid,
        bookId: f.bookId,
        loreId: f.id,
        generationId: relationId,
        offset: page * 64,
        count: entries[page].count,
        payload: entries[page].pointer,
      }),
    );
    sealBirth = born(await f.db.runTransaction((tx) => tx.get(f.db.doc(path))));
    paths.push(path);
  }
  const storage = {
    ...f.seed.storage,
    generationId,
    sealBirth,
    relations: {
      present: true,
      count: entries.reduce((n, row) => n + row.count, 0),
      pages: entries.length,
      generationId: relationId,
      sealBirth,
    },
  };
  await f.db.runTransaction(async (tx) =>
    tx.set(f.db.doc(f.seed.path), {
      bookId: f.bookId,
      ...storage.dates,
      payloadStorage: storage,
    }),
  );
  return { storage, paths };
}
