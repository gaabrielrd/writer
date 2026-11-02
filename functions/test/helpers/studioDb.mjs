import assert from 'node:assert/strict';

// A bounded query/transaction double; actual lock/retry behavior is covered in the emulator.
export function studioDb() {
  const records = new Map(),
    metadata = new Map(),
    versions = new Map(),
    creations = new Map(),
    reads = [],
    metadataReads = [];
  let queue = Promise.resolve(),
    creationSequence = 0;
  const stamp = (value, nanos = 0) => ({
    toMillis: () => value,
    seconds: Math.floor(value / 1000),
    nanoseconds: Math.round((value % 1000) * 1e6) + nanos,
  });
  const snapshot = (path, fields = null) => ({
    id: path.split('/').at(-1),
    ref: db.doc(path),
    exists: records.has(path),
    data: () => {
      const record = records.get(path);
      return structuredClone(
        fields && record
          ? fields.reduce((result, field) => {
              const keys = field.split('.');
              let source = record,
                target = result;
              for (let index = 0; index < keys.length; index++) {
                const key = keys[index];
                if (!source || !Object.hasOwn(source, key)) break;
                if (index === keys.length - 1) target[key] = source[key];
                else {
                  target[key] ??= {};
                  target = target[key];
                  source = source[key];
                }
              }
              return result;
            }, {})
          : record,
      );
    },
    createTime: stamp(
      metadata.get(path)?.createdAt ?? 10,
      metadata.get(path)?.createdAtNanoseconds ?? creations.get(path) ?? 0,
    ),
    updateTime: stamp(
      metadata.get(path)?.updatedAt ?? 20,
      metadata.get(path)?.updatedAtNanoseconds ?? versions.get(path) ?? 0,
    ),
  });
  const field = (path, key) =>
    key === '__name__'
      ? path.split('/').at(-1)
      : key.split('.').reduce((value, part) => value?.[part], records.get(path));
  const compare = (a, b) => (a === b ? 0 : a < b ? -1 : 1);
  function query(
    path,
    filters = [],
    orders = [],
    maximum = Infinity,
    cursor = null,
    fields = null,
  ) {
    const definition = { collectionPath: path, filters, orders, maximum, cursor, fields };
    return {
      ...definition,
      where: (key, op, value) => {
        assert.ok(['==', 'in'].includes(op));
        return query(path, [...filters, [key, value, op]], orders, maximum, cursor, fields);
      },
      orderBy: (key, direction = 'asc') =>
        query(path, filters, [...orders, [key, direction]], maximum, cursor, fields),
      limit: (value) => query(path, filters, orders, value, cursor, fields),
      startAfter: (...value) => query(path, filters, orders, maximum, value, fields),
      select: (...value) => query(path, filters, orders, maximum, cursor, value),
      get: async () => execute(definition),
    };
  }
  function execute(definition) {
    const { collectionPath, filters, orders, maximum, cursor, fields } = definition;
    assert.ok(Number.isFinite(maximum), 'Every query must have a bounded limit');
    const comparator = (a, b) => {
      for (const [key, direction] of orders) {
        const value = compare(field(a, key), field(b, key)) * (direction === 'desc' ? -1 : 1);
        if (value) return value;
      }
      return 0;
    };
    const paths = [...records.keys()].filter(
      (path) =>
        path.startsWith(collectionPath + '/') &&
        !path.slice(collectionPath.length + 1).includes('/') &&
        filters.every(([key, value, op]) =>
          op === 'in' ? value.includes(field(path, key)) : field(path, key) === value,
        ) &&
        orders.every(([key]) => field(path, key) !== undefined),
    );
    paths.sort(comparator);
    const selected = paths
      .filter(
        (path) =>
          !cursor ||
          (() => {
            for (let i = 0; i < orders.length; i++) {
              const value =
                compare(field(path, orders[i][0]), cursor[i]) * (orders[i][1] === 'desc' ? -1 : 1);
              if (value) return value > 0;
            }
            return false;
          })(),
      )
      .slice(0, maximum);
    reads.push({ collectionPath, maximum, count: selected.length, fields });
    return { docs: selected.map((path) => snapshot(path, fields)) };
  }
  const db = {
    doc: (path) => ({ path, id: path.split('/').at(-1), get: async () => snapshot(path) }),
    collection: (path) => query(path),
    runTransaction(operation) {
      const result = queue.then(async () => {
        const writes = [];
        const tx = {
          getAll: async (ref, options) => {
            assert.equal(writes.length, 0, 'Reads precede writes');
            metadataReads.push({ path: ref.path, fields: options.fieldMask });
            return [snapshot(ref.path, options.fieldMask)];
          },
          get: async (ref) => {
            assert.equal(writes.length, 0, 'Reads precede writes');
            return ref.collectionPath ? execute(ref) : snapshot(ref.path);
          },
          set: (ref, value) =>
            writes.push(() => {
              if (!records.has(ref.path)) creations.set(ref.path, ++creationSequence);
              records.set(ref.path, structuredClone(value));
              versions.set(ref.path, (versions.get(ref.path) ?? 0) + 1);
            }),
          create: (ref, value) =>
            writes.push(() => {
              assert.ok(!records.has(ref.path));
              creations.set(ref.path, ++creationSequence);
              records.set(ref.path, structuredClone(value));
              versions.set(ref.path, (versions.get(ref.path) ?? 0) + 1);
            }),
          update: (ref, value) =>
            writes.push(() => {
              assert.ok(records.has(ref.path));
              records.set(ref.path, { ...records.get(ref.path), ...structuredClone(value) });
              versions.set(ref.path, (versions.get(ref.path) ?? 0) + 1);
            }),
          delete: (ref) =>
            writes.push(() => {
              records.delete(ref.path);
              creations.delete(ref.path);
            }),
        };
        const value = await operation(tx);
        writes.forEach((write) => write());
        return value;
      });
      queue = result.catch(() => {});
      return result;
    },
    recursiveDelete: async (ref) => {
      for (const path of records.keys())
        if (path === ref.path || path.startsWith(ref.path + '/')) {
          records.delete(path);
          creations.delete(path);
        }
    },
  };
  return { db, records, metadata, reads, metadataReads };
}
