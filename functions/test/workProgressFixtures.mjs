import { studioDb } from './helpers/studioDb.mjs';
import { createWorkProgressService } from '../src/workProgress.mjs';
import { createWorkProgressLedger } from '../src/workProgressLedger.mjs';
export const operation = (n) => 'work-operation-' + String(n).padStart(5, '0');
export const book = { kind: 'book', id: 'book' },
  adventure = { kind: 'adventure', id: 'adventure' },
  campaign = { kind: 'campaign', id: 'campaign' };
export function workFixture() {
  const base = studioDb(),
    metadataReads = [];
  const maskSnapshot = (snapshot, fields) => ({
    ...snapshot,
    data: () => {
      const value = snapshot.data();
      return !value
        ? value
        : Object.fromEntries(fields.filter((key) => key in value).map((key) => [key, value[key]]));
    },
  });
  function wrap(query, fields = null) {
    return {
      ...query,
      selectedFields: fields,
      where: (...args) => wrap(query.where(...args), fields),
      orderBy: (...args) => wrap(query.orderBy(...args), fields),
      limit: (value) => wrap(query.limit(value), fields),
      startAfter: (...args) => wrap(query.startAfter(...args), fields),
      select: (...keys) => wrap(query, keys),
    };
  }
  const db = {
    ...base.db,
    collection: (path) => wrap(base.db.collection(path)),
    runTransaction: (work) =>
      base.db.runTransaction((tx) =>
        work({
          ...tx,
          get: async (ref) => {
            const result = await tx.get(ref);
            if (ref.selectedFields) {
              metadataReads.push({ path: ref.collectionPath, fields: ref.selectedFields });
              return {
                ...result,
                docs: result.docs.map((snapshot) => maskSnapshot(snapshot, ref.selectedFields)),
              };
            }
            return result;
          },
          getAll: async (...args) => {
            const { fieldMask } = args.pop();
            return Promise.all(
              args.map(async (ref) => {
                metadataReads.push({ path: ref.path, fields: fieldMask });
                return maskSnapshot(await tx.get(ref), fieldMask);
              }),
            );
          },
        }),
      ),
  };
  base.records.set('books/book', {
    authorId: 'author',
    title: 'Livro atual',
    status: 'published',
    wordCount: 999,
    updatedAt: 100,
  });
  base.records.set('adventures/adventure', {
    ownerId: 'author',
    title: 'Aventura',
    status: 'ready',
    updatedAt: 100,
  });
  base.records.set('campaigns/campaign', {
    ownerId: 'author',
    title: 'Campanha',
    status: 'planning',
    updatedAt: 100,
  });
  return {
    ...base,
    db,
    metadataReads,
    api: createWorkProgressService({ db, now: () => 200 }),
    ledger: createWorkProgressLedger({ db }),
  };
}
export async function activate(f, target = book) {
  return f.api.updateWorkProgress('author', {
    target,
    operationId: operation(1),
    expectedRevision: 0,
    patch: { wordGoal: 100 },
  });
}
export async function prepare(f, target = book, limit = 1, n = 2) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await f.api.prepareWorkWordCount('author', {
      target,
      operationId: operation(n),
      limit,
    });
    if (result.complete) return result;
  }
  throw new Error('A preparação não terminou.');
}
