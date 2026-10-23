import { prepareRestoredBookSceneSource } from '../../src/bookSceneSourceText.mjs';
import { digest } from '../../src/sceneContracts.mjs';
export async function seedIndexedSceneSource(
  db,
  content,
  { indexed = true, bookId = 'source-encoding-book' } = {},
) {
  const uid = 'author',
    sourceId = 'chapter',
    source = {
      hash: digest(content),
      createdAt: 7,
      original: {
        title: '  \ufeff "content":"" 🌙 \\\\  ',
        order: 1,
        content,
        createdAt: 3,
        updatedAt: 4,
      },
    },
    plan = prepareRestoredBookSceneSource({
      uid,
      bookId,
      sourceId,
      operationId: 'source-encoding-op01',
      timestamp: 7,
      source,
    });
  if (!plan.writes.length) throw new Error('Fixture must use an external body');
  if (!indexed) delete plan.writes[0].value.sceneSourceEncoding;
  await db.runTransaction(async (tx) => {
    tx.create(db.doc('books/' + bookId), {
      authorId: uid,
      title: 'Encoding fixture',
      createdAt: 1,
      updatedAt: 2,
    });
    tx.create(db.doc('books/' + bookId + '/sceneSources/' + sourceId), plan.value);
    for (const write of plan.writes) {
      const [bodyId, index] = write.id.split(':');
      tx.create(
        db.doc('books/' + bookId + '/bookTextBodies/' + bodyId + (index ? '/chunks/' + index : '')),
        write.value,
      );
    }
  });
  return {
    uid,
    bookId,
    sourceId,
    source,
    plan,
    bodyPath: 'books/' + bookId + '/bookTextBodies/' + plan.value.original.contentStorage.bodyId,
  };
}
/** Counts SDK transaction get requests for raw parts, never billing or cache activity. */
export function observeSceneSourcePartReads(db) {
  const original = db.runTransaction,
    run = original.bind(db),
    counts = [];
  db.runTransaction = async (operation, ...options) => {
    let reads = 0;
    try {
      return await run(
        async (tx) =>
          operation(
            new Proxy(tx, {
              get(target, property) {
                const value = Reflect.get(target, property, target);
                if (property === 'get')
                  return (ref, ...args) => {
                    if (ref.path?.includes('/bookTextBodies/') && ref.path.includes('/chunks/'))
                      reads++;
                    return value.call(target, ref, ...args);
                  };
                return typeof value === 'function' ? value.bind(target) : value;
              },
            }),
          ),
        ...options,
      );
    } finally {
      counts.push(reads);
    }
  };
  return {
    counts,
    stop: () => {
      db.runTransaction = original;
    },
  };
}
