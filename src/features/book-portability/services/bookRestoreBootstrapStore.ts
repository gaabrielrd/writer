import type { BookRestoreStartIntent } from '../model/bookRestoreTransfer';
import { readBookRestoreStartIntent } from './bookRestoreTransferContracts';
import {
  restorePreparationCheck as check,
  restorePreparationId,
  restorePreparationOperationId,
} from './bookRestorePreparationContracts';
import { bookRestorePreparationStorageAvailable } from './bookRestorePreparationDb';
export type BookRestoreBootstrapRecord = {
  schemaVersion: 1;
  stamp: string;
  intent: BookRestoreStartIntent;
};
export const BOOK_RESTORE_BOOTSTRAP_DB = 'writer.book-restore.starts';
const store = 'attempts',
  error = (cause: unknown) =>
    cause instanceof Error
      ? cause
      : new Error('Não foi possível usar a recuperação do início da restauração.');
const closed = (v: unknown, names: string[]): v is Record<string, unknown> =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).length === names.length &&
  names.every((k) => Object.hasOwn(v, k));
export function readBookRestoreBootstrapRecord(
  raw: unknown,
  ownerId: string,
  operationId?: string,
): BookRestoreBootstrapRecord {
  check(
    closed(raw, ['schemaVersion', 'stamp', 'intent']) &&
      raw.schemaVersion === 1 &&
      typeof raw.stamp === 'string' &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(raw.stamp),
  );
  const intent = readBookRestoreStartIntent(raw.intent, ownerId);
  check(operationId === undefined || intent.operationId === operationId);
  return Object.freeze({ schemaVersion: 1, stamp: raw.stamp, intent });
}
export function createBookRestoreBootstrapRecord(
  intent: BookRestoreStartIntent,
): BookRestoreBootstrapRecord {
  return readBookRestoreBootstrapRecord(
    { schemaVersion: 1, stamp: crypto.randomUUID(), intent },
    intent.ownerId,
  );
}
async function open(guard: () => void): Promise<IDBDatabase> {
  guard();
  check(bookRestorePreparationStorageAvailable());
  return new Promise((resolve, reject) => {
    let failed = false,
      cause: Error | null = null;
    const request = indexedDB.open(BOOK_RESTORE_BOOTSTRAP_DB, 1);
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
export async function readStoredBookRestoreStart(
  ownerId: string,
  operationId: string,
  guard: () => void,
): Promise<BookRestoreBootstrapRecord | null> {
  check(restorePreparationId(ownerId) && restorePreparationOperationId(operationId));
  const db = await open(guard);
  try {
    guard();
    return await new Promise((resolve, reject) => {
      let record: BookRestoreBootstrapRecord | null = null,
        cause: Error | null = null;
      const tx = db.transaction(store, 'readonly'),
        request = tx.objectStore(store).get([ownerId, operationId]);
      request.onsuccess = () => {
        try {
          record =
            request.result == null
              ? null
              : readBookRestoreBootstrapRecord(request.result, ownerId, operationId);
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
export async function compareStoredBookRestoreStart(
  ownerId: string,
  operationId: string,
  previous: BookRestoreBootstrapRecord | null,
  next: BookRestoreBootstrapRecord | null,
  guard: () => void,
): Promise<boolean> {
  check(restorePreparationId(ownerId) && restorePreparationOperationId(operationId));
  const expected =
      previous === null ? null : readBookRestoreBootstrapRecord(previous, ownerId, operationId),
    value = next === null ? null : readBookRestoreBootstrapRecord(next, ownerId, operationId),
    db = await open(guard);
  try {
    guard();
    return await new Promise((resolve, reject) => {
      let matched = false,
        cause: Error | null = null;
      const tx = db.transaction(store, 'readwrite'),
        records = tx.objectStore(store),
        request = records.get([ownerId, operationId]);
      request.onsuccess = () => {
        try {
          guard();
          const current =
            request.result == null
              ? null
              : readBookRestoreBootstrapRecord(request.result, ownerId, operationId);
          matched = JSON.stringify(current) === JSON.stringify(expected);
          if (!matched) return;
          if (value === null) records.delete([ownerId, operationId]);
          else records.put(value, [ownerId, operationId]);
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
export async function listStoredBookRestoreStarts(
  ownerId: string,
  guard: () => void,
  options: { cursor?: string | null; limit?: number } = {},
): Promise<{ items: BookRestoreBootstrapRecord[]; nextCursor: string | null }> {
  const cursor = options.cursor ?? null,
    limit = options.limit ?? 25;
  check(
    restorePreparationId(ownerId) &&
      (cursor === null || restorePreparationOperationId(cursor)) &&
      Number.isSafeInteger(limit) &&
      limit >= 1 &&
      limit <= 50,
  );
  const db = await open(guard);
  try {
    guard();
    return await new Promise((resolve, reject) => {
      const items: BookRestoreBootstrapRecord[] = [];
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
          items.push(readBookRestoreBootstrapRecord(row.value, ownerId, row.primaryKey[1]));
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
          const last = items.at(limit - 1);
          resolve({
            items: items.slice(0, limit),
            nextCursor: items.length > limit && last ? last.intent.operationId : null,
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
