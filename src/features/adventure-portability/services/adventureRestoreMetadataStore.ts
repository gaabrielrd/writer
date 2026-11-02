import {
  recoveryCheck as check,
  recoveryOwner,
  recoveryOperationId,
} from './adventureRestoreRecoveryContracts';
import { adventureRestorePreparationStorageAvailable } from './adventureRestorePreparationDb';
const error = (cause: unknown): Error =>
  cause instanceof Error
    ? cause
    : new Error('Não foi possível usar a recuperação local da restauração.');
/** Metadata only. The synchronous codec must bind account/key and reject unknown fields. */
export function createAdventureRestoreMetadataStore<R extends { schemaVersion: 1 }>(
  dbName: string,
  store: string,
  readRecord: (raw: unknown, ownerId: string, recordId?: string) => R,
) {
  async function open(guard: () => void): Promise<IDBDatabase> {
    guard();
    check(adventureRestorePreparationStorageAvailable());
    return new Promise((resolve, reject) => {
      let failed = false,
        cause: Error | null = null;
      const request = indexedDB.open(dbName, 1);
      request.onblocked = () => {
        failed = true;
        reject(new Error('Feche outras abas para recuperar esta tentativa.'));
      };
      request.onupgradeneeded = () => {
        try {
          guard();
          if (!request.result.objectStoreNames.contains(store))
            request.result.createObjectStore(store);
        } catch (failure) {
          cause = error(failure);
          request.transaction?.abort();
        }
      };
      request.onerror = () => {
        failed = true;
        reject(cause ?? new Error('Não foi possível abrir as tentativas de restauração.'));
      };
      request.onsuccess = () => {
        const db = request.result;
        if (failed) {
          db.close();
          return;
        }
        try {
          guard();
          resolve(db);
        } catch (failure) {
          db.close();
          reject(error(failure));
        }
      };
    });
  }
  async function read(ownerId: string, recordId: string, guard: () => void): Promise<R | null> {
    check(recoveryOwner(ownerId) && recoveryOperationId(recordId));
    const db = await open(guard);
    try {
      guard();
      return await new Promise((resolve, reject) => {
        let record: R | null = null,
          cause: Error | null = null;
        const tx = db.transaction(store, 'readonly'),
          request = tx.objectStore(store).get([ownerId, recordId]);
        request.onsuccess = () => {
          try {
            record = request.result == null ? null : readRecord(request.result, ownerId, recordId);
          } catch (failure) {
            cause = error(failure);
            tx.abort();
          }
        };
        tx.onerror = () => {
          cause ??= new Error('Não foi possível ler a tentativa de restauração.');
        };
        tx.onabort = () => reject(cause ?? new Error('Leitura interrompida.'));
        tx.oncomplete = () => {
          try {
            guard();
            resolve(record);
          } catch (failure) {
            reject(error(failure));
          }
        };
      });
    } finally {
      db.close();
    }
  }
  async function compare(
    ownerId: string,
    recordId: string,
    previous: R | null,
    next: R | null,
    guard: () => void,
  ): Promise<boolean> {
    check(recoveryOwner(ownerId) && recoveryOperationId(recordId));
    const expected = previous === null ? null : readRecord(previous, ownerId, recordId),
      value = next === null ? null : readRecord(next, ownerId, recordId),
      db = await open(guard);
    try {
      guard();
      return await new Promise((resolve, reject) => {
        let matched = false,
          cause: Error | null = null;
        const tx = db.transaction(store, 'readwrite'),
          records = tx.objectStore(store),
          request = records.get([ownerId, recordId]);
        request.onsuccess = () => {
          try {
            guard();
            const current =
              request.result == null ? null : readRecord(request.result, ownerId, recordId);
            matched = JSON.stringify(current) === JSON.stringify(expected);
            if (!matched) return;
            if (value === null) records.delete([ownerId, recordId]);
            else records.put(value, [ownerId, recordId]);
          } catch (failure) {
            cause = error(failure);
            tx.abort();
          }
        };
        tx.onerror = () => {
          cause ??= new Error('Não foi possível salvar a tentativa de restauração.');
        };
        tx.onabort = () => reject(cause ?? new Error('Gravação interrompida.'));
        tx.oncomplete = () => {
          try {
            guard();
            resolve(matched);
          } catch (failure) {
            reject(error(failure));
          }
        };
      });
    } finally {
      db.close();
    }
  }
  async function list(
    ownerId: string,
    guard: () => void,
    options: { cursor?: string | null; limit?: number } = {},
  ): Promise<{ items: R[]; nextCursor: string | null }> {
    const cursor = options.cursor ?? null,
      limit = options.limit ?? 25;
    check(
      recoveryOwner(ownerId) &&
        (cursor === null || recoveryOperationId(cursor)) &&
        Number.isSafeInteger(limit) &&
        limit >= 1 &&
        limit <= 50,
    );
    const db = await open(guard);
    try {
      guard();
      return await new Promise((resolve, reject) => {
        const items: R[] = [];
        let lastKey: string | null = null;
        let cause: Error | null = null;
        const tx = db.transaction(store, 'readonly'),
          range = IDBKeyRange.bound([ownerId, cursor ?? ''], [ownerId, '\uffff'], cursor !== null),
          request = tx.objectStore(store).openCursor(range);
        request.onsuccess = () => {
          try {
            guard();
            const row = request.result;
            if (!row) return;
            check(
              Array.isArray(row.primaryKey) &&
                row.primaryKey[0] === ownerId &&
                typeof row.primaryKey[1] === 'string',
            );
            items.push(readRecord(row.value, ownerId, row.primaryKey[1]));
            if (items.length === limit) lastKey = row.primaryKey[1];
            if (items.length <= limit) row.continue();
          } catch (failure) {
            cause = error(failure);
            tx.abort();
          }
        };
        tx.onerror = () => {
          cause ??= new Error('Não foi possível listar as tentativas de restauração.');
        };
        tx.onabort = () => reject(cause ?? new Error('Listagem interrompida.'));
        tx.oncomplete = () => {
          try {
            guard();
            resolve({
              items: items.slice(0, limit),
              nextCursor: items.length > limit ? lastKey : null,
            });
          } catch (failure) {
            reject(error(failure));
          }
        };
      });
    } finally {
      db.close();
    }
  }

  return Object.freeze({ read, compare, list });
}
