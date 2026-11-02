import assert from 'node:assert/strict';
import { adventureImportDb } from './adventureImportDb.mjs';
const compare = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
export function adventureDeletionDb(database) {
  const f = database ?? adventureImportDb({ nativeUpdates: true }),
    run = f.db.runTransaction.bind(f.db),
    groupReads = [];
  const query = (group, options = {}) => ({
    deletionGroup: true,
    group,
    options,
    where: (field, op, value) => {
      assert.equal(op, '==');
      return query(group, { ...options, filters: [...(options.filters ?? []), [field, value]] });
    },
    orderBy: (field, direction = 'asc') => {
      assert.equal(field, '__name__');
      assert.equal(direction, 'asc');
      return query(group, { ...options, ordered: true });
    },
    startAt: (ref) => query(group, { ...options, lower: ref.path }),
    startAfter: (ref) => query(group, { ...options, lower: ref.path, exclusive: true }),
    endBefore: (ref) => query(group, { ...options, upper: ref.path }),
    select: (...fields) => query(group, { ...options, fields }),
    limit: (maximum) => query(group, { ...options, maximum }),
  });
  f.db.collectionGroup = (group) => query(group);
  f.db.runTransaction = (callback) =>
    run((tx) =>
      callback({
        ...tx,
        get: async (ref) => {
          if (!ref.deletionGroup) return tx.get(ref);
          const { lower, upper, maximum, fields, ordered } = ref.options;
          assert.equal(ordered, true);
          assert.ok(lower && upper);
          assert.ok(Number.isInteger(maximum) && maximum > 0 && maximum <= 25);
          assert.ok(Array.isArray(fields));
          const paths = [...f.records.keys()]
            .filter(
              (path) =>
                path.split('/').at(-2) === ref.group &&
                (ref.options.exclusive ? compare(path, lower) > 0 : compare(path, lower) >= 0) &&
                compare(path, upper) < 0 &&
                (ref.options.filters ?? []).every(
                  ([field, value]) =>
                    field.split('.').reduce((v, k) => v?.[k], f.records.get(path)) === value,
                ),
            )
            .sort(compare)
            .slice(0, maximum);
          groupReads.push({ group: ref.group, lower, upper, maximum, fields, count: paths.length });
          const docs = [];
          for (const path of paths)
            docs.push((await tx.getAll(f.db.doc(path), { fieldMask: fields }))[0]);
          return { docs };
        },
      }),
    );
  return { ...f, groupReads };
}
