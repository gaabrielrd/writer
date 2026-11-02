export function loreMetadataDatabase<const N extends readonly string[]>(
  databaseName: string,
  names: N,
) {
  type Stores = Record<N[number], IDBObjectStore>;
  const unavailable = () => Error('Não foi possível gravar a seleção neste dispositivo.');
  function open(guard: () => void): Promise<IDBDatabase> {
    guard();
    if (
      !globalThis.indexedDB ||
      !globalThis.navigator?.locks?.request ||
      globalThis.isSecureContext === false
    )
      return Promise.reject(unavailable());
    return new Promise((resolve, reject) => {
      let failed = false;
      const r = indexedDB.open(databaseName, 1);
      r.onupgradeneeded = () => {
        for (const name of names)
          if (!r.result.objectStoreNames.contains(name)) r.result.createObjectStore(name);
      };
      r.onerror = () => {
        failed = true;
        reject(unavailable());
      };
      r.onblocked = () => {
        failed = true;
        reject(Error('Feche outras versões do Writer para retomar a seleção.'));
      };
      r.onsuccess = () => {
        const db = r.result;
        try {
          if (failed) {
            db.close();
            return;
          }
          guard();
          db.onversionchange = () => db.close();
          resolve(db);
        } catch (e) {
          db.close();
          reject(e instanceof Error ? e : unavailable());
        }
      };
    });
  }
  async function run<T>(
    mode: IDBTransactionMode,
    guard: () => void,
    work: (
      stores: Stores,
      read: (s: IDBObjectStore, key: IDBValidKey, then: (v: unknown) => void) => void,
      wrap: (f: () => void) => () => void,
      done: (v: T) => void,
    ) => void,
  ): Promise<T> {
    const db = await open(guard);
    return new Promise((resolve, reject) => {
      let result: T,
        ready = false,
        error: unknown,
        tx: IDBTransaction;
      try {
        guard();
        tx = db.transaction([...names], mode);
      } catch (e) {
        db.close();
        reject(e instanceof Error ? e : unavailable());
        return;
      }
      const fail = (e: unknown) => {
        error = e;
        tx.abort();
      };
      const wrap = (f: () => void) => () => {
        try {
          guard();
          f();
        } catch (e) {
          fail(e);
        }
      };
      tx.onerror = () => {
        error ??= unavailable();
      };
      tx.onabort = () => {
        db.close();
        reject(error instanceof Error ? error : unavailable());
      };
      tx.oncomplete = () => {
        db.close();
        try {
          guard();
          if (!ready) throw unavailable();
          resolve(result);
        } catch (e) {
          reject(e instanceof Error ? e : unavailable());
        }
      };
      const stores = Object.fromEntries(
        names.map((name) => [name, tx.objectStore(name)]),
      ) as Stores;
      const read = (s: IDBObjectStore, key: IDBValidKey, then: (v: unknown) => void) => {
        const r: IDBRequest<unknown> = s.get(key);
        r.onsuccess = wrap(() => then(r.result));
      };
      try {
        guard();
        work(stores, read, wrap, (value) => {
          result = value;
          ready = true;
        });
      } catch (e) {
        fail(e);
      }
    });
  }
  return { run, unavailable };
}
