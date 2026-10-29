import assert from 'node:assert/strict';
import { studioDb } from './studioDb.mjs';
/** Collection-group metadata query semantics on the same native-timestamp fixture. */
export function campaignBackupLoreDb() {
  const f = studioDb(),
    run = f.db.runTransaction.bind(f.db),
    groupReads = [];
  function query(
    name,
    filters = [],
    orders = [],
    maximum = Infinity,
    cursor = null,
    fields = null,
  ) {
    const value = { groupName: name, filters, orders, maximum, cursor, fields };
    return {
      ...value,
      where: (key, op, v) =>
        query(name, [...filters, [key, op, v]], orders, maximum, cursor, fields),
      orderBy: (key, direction = 'asc') =>
        query(name, filters, [...orders, [key, direction]], maximum, cursor, fields),
      limit: (n) => query(name, filters, orders, n, cursor, fields),
      startAfter: (ref) => query(name, filters, orders, maximum, ref.path ?? ref, fields),
      select: (...mask) => query(name, filters, orders, maximum, cursor, mask),
    };
  }
  f.db.collectionGroup = (name) => query(name);
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        get: async (q) => {
          if (!q.groupName) return tx.get(q);
          assert.equal(q.groupName, 'loreVariantBodies');
          assert.ok(Number.isSafeInteger(q.maximum) && q.maximum >= 1 && q.maximum <= 26);
          assert.deepEqual(q.orders, [['__name__', 'asc']]);
          assert.equal(q.filters.length, 1);
          assert.equal(q.filters[0][0], 'campaignToken');
          assert.equal(q.filters[0][1], '==');
          assert.ok(Array.isArray(q.fields) && !q.fields.includes('content'));
          const paths = [...f.records.keys()]
            .filter(
              (path) =>
                path.split('/').at(-2) === q.groupName &&
                q.filters.every(([field, , v]) => f.records.get(path)[field] === v) &&
                (q.cursor === null || path > q.cursor),
            )
            .sort()
            .slice(0, q.maximum);
          groupReads.push({ maximum: q.maximum, cursor: q.cursor, fields: q.fields, paths });
          const docs = [];
          for (const path of paths)
            docs.push((await tx.getAll(f.db.doc(path), { fieldMask: q.fields }))[0]);
          return { docs };
        },
      }),
    );
  return { ...f, groupReads };
}
