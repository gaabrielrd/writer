import assert from 'node:assert/strict';

// A bounded query/transaction double; actual lock/retry behavior is covered in the emulator.
export function studioDb() {
  const records = new Map(),
    metadata = new Map(),
    versions = new Map(),
    reads = [];
  let queue = Promise.resolve();
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
          ? Object.fromEntries(
              fields.filter((key) => key in record).map((key) => [key, record[key]]),
            )
          : record,
      );
    },
    createTime: stamp(metadata.get(path)?.createdAt ?? 10),
    updateTime: stamp(
      metadata.get(path)?.updatedAt ?? 20,
      metadata.get(path)?.updatedAtNanoseconds ?? versions.get(path) ?? 0,
    ),
  });
  const field = (path, key) =>
    key === '__name__' ? path.split('/').at(-1) : records.get(path)[key];
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
          get: async (ref) => {
            assert.equal(writes.length, 0, 'Reads precede writes');
            return ref.collectionPath ? execute(ref) : snapshot(ref.path);
          },
          set: (ref, value) =>
            writes.push(() => {
              records.set(ref.path, structuredClone(value));
              versions.set(ref.path, (versions.get(ref.path) ?? 0) + 1);
            }),
          create: (ref, value) =>
            writes.push(() => {
              assert.ok(!records.has(ref.path));
              records.set(ref.path, structuredClone(value));
              versions.set(ref.path, (versions.get(ref.path) ?? 0) + 1);
            }),
          update: (ref, value) =>
            writes.push(() => {
              assert.ok(records.has(ref.path));
              records.set(ref.path, { ...records.get(ref.path), ...structuredClone(value) });
              versions.set(ref.path, (versions.get(ref.path) ?? 0) + 1);
            }),
          delete: (ref) => writes.push(() => records.delete(ref.path)),
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
        if (path === ref.path || path.startsWith(ref.path + '/')) records.delete(path);
    },
  };
  return { db, records, metadata, reads };
}
