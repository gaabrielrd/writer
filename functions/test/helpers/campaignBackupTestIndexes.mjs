export function campaignBackupTestIndexes(opened) {
  return async (stage) => {
    const rows = new Map(),
      state = { stage, disposed: 0 };
    opened.push(state);
    return {
      write: async (r) => rows.set(r.index, { ...r, payload: Buffer.from(r.payload) }),
      seal: async () => {},
      read: async (start, n) => Array.from({ length: n }, (_, i) => rows.get(start + i)),
      lookup: async (family, key) => {
        if (stage === 'own')
          return [...rows.values()].find((r) => r.family === family && r.id === key);
        const list = [...rows.values()]
          .filter((r) => r.section === family)
          .sort((a, b) => a.position - b.position);
        return (
          list.find((r) => r.key === key) ?? {
            before: list.filter((r) => r.key < key).at(-1) ?? null,
            after: list.find((r) => r.key > key) ?? null,
          }
        );
      },
      reverse: async (kind, key) =>
        [...rows.values()].find((r) => {
          const v = JSON.parse(Buffer.from(r.payload).toString());
          return kind === 'image'
            ? r.section === 'base:item' && v.meta?.image === key
            : kind === 'ledger'
              ? r.section === 'base:loreReferences' && v.meta?.targetKey === key
              : r.section === 'base:links' && v.meta?.target?.sourceKey === key;
        }),
      dispose: async () => {
        state.disposed++;
        rows.clear();
      },
    };
  };
}
