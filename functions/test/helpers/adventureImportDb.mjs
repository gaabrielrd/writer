import { studioDb } from './studioDb.mjs';

// Firestore gives documents created by one commit the same createTime. studioDb's
// generic double assigns per-document nanos; adapt only this import-specific fixture.
export function adventureImportDb({ nativeUpdates = false } = {}) {
  const f = studioDb(),
    run = f.db.runTransaction.bind(f.db),
    commits = [];
  let stamp = 0;
  f.db.runTransaction = (operation) => {
    const created = [],
      writes = [];
    return run(async (tx) => {
      const wrapped = { ...tx };
      for (const method of ['create', 'set', 'update', 'delete'])
        wrapped[method] = (ref, ...args) => {
          writes.push({ method, path: ref.path });
          if (method === 'create' || (method === 'set' && !f.records.has(ref.path)))
            created.push(ref.path);
          return tx[method](ref, ...args);
        };
      return operation(wrapped);
    }).then((result) => {
      const born = ++stamp;
      for (const path of created)
        f.metadata.set(path, { createdAt: 1000, createdAtNanoseconds: born });
      if (nativeUpdates)
        for (const write of writes) {
          if (['create', 'set', 'update'].includes(write.method) && f.records.has(write.path))
            f.metadata.set(write.path, {
              ...f.metadata.get(write.path),
              updatedAt: 1000,
              updatedAtNanoseconds: born,
            });
        }
      commits.push(writes);
      return result;
    });
  };
  return { ...f, commits };
}
