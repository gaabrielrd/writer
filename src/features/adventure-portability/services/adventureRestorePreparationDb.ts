import {
  readAdventureRestoreRecoveryContext,
  readAdventureRestoreRecoveryRequest,
  type AdventureRestoreRecoveryIdentity,
  type AdventureRestoreRecoveryContext,
} from './adventureRestoreRecoveryContracts';
import {
  readAdventureRestorePreparationEnvelope,
  sameAdventureRestorePreparationEnvelope,
  type AdventureRestorePreparationEnvelope,
} from './adventureRestorePreparationCrypto';
import { adventurePreparationCheck as check } from './adventureRestorePreparationContracts';
export const ADVENTURE_RESTORE_PREPARATION_DB = 'writer.adventure-restore.preparation';
const store = 'pending';
const storageError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error('Não foi possível usar a recuperação protegida.');
export const adventureRestorePreparationStorageAvailable = () =>
  !!globalThis.indexedDB &&
  !!globalThis.crypto?.subtle &&
  typeof globalThis.navigator?.locks?.request === 'function' &&
  globalThis.isSecureContext !== false;
const key = (context: Pick<AdventureRestoreRecoveryContext, 'ownerId' | 'restoreId'>) => [
  context.ownerId,
  context.restoreId,
];
async function open(guard: () => void): Promise<IDBDatabase> {
  guard();
  check(adventureRestorePreparationStorageAvailable());
  return new Promise((resolve, reject) => {
    let failed = false,
      cause: Error | null = null;
    const request = indexedDB.open(ADVENTURE_RESTORE_PREPARATION_DB, 1);
    request.onblocked = () => {
      failed = true;
      reject(new Error('Feche outras abas para abrir a recuperação protegida.'));
    };
    request.onupgradeneeded = () => {
      try {
        guard();
        if (!request.result.objectStoreNames.contains(store))
          request.result.createObjectStore(store);
      } catch (error) {
        cause = storageError(error);
        request.transaction?.abort();
      }
    };
    request.onerror = () => {
      failed = true;
      reject(cause ?? new Error('Não foi possível abrir a recuperação protegida.'));
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
      } catch (error) {
        db.close();
        reject(storageError(error));
      }
    };
  });
}
export async function readStoredAdventureRestorePreparationMetadata(
  expectedContext: AdventureRestoreRecoveryIdentity,
  guard: () => void,
): Promise<unknown> {
  guard();
  const context = readAdventureRestoreRecoveryRequest({
      ownerId: expectedContext.ownerId,
      restoreId: expectedContext.restoreId,
      adventureId: expectedContext.adventureId,
      jobToken: expectedContext.jobToken,
      reviewHash: expectedContext.reviewHash,
    }),
    db = await open(guard);
  try {
    guard();
    return await new Promise((resolve, reject) => {
      let value: unknown = null,
        cause: Error | null = null;
      const tx = db.transaction(store, 'readonly'),
        request = tx.objectStore(store).get(key(context));
      request.onsuccess = () => {
        value = request.result ?? null;
      };
      tx.onerror = () => {
        cause = new Error('Não foi possível ler a recuperação protegida.');
      };
      tx.onabort = () => reject(cause ?? new Error('Leitura protegida interrompida.'));
      tx.oncomplete = () => {
        try {
          guard();
          resolve(value);
        } catch (error) {
          reject(storageError(error));
        }
      };
    });
  } finally {
    db.close();
  }
}
export async function readStoredAdventureRestorePreparation(
  expectedContext: AdventureRestoreRecoveryContext,
  guard: () => void,
): Promise<unknown> {
  guard();
  return readStoredAdventureRestorePreparationMetadata(
    readAdventureRestoreRecoveryContext(expectedContext),
    guard,
  );
}
export async function compareStoredAdventureRestorePreparation(
  expectedContext: AdventureRestoreRecoveryContext,
  expected: AdventureRestorePreparationEnvelope | null,
  next: AdventureRestorePreparationEnvelope | null,
  guard: () => void,
): Promise<boolean> {
  guard();
  const context = readAdventureRestoreRecoveryContext(expectedContext),
    before = expected === null ? null : readAdventureRestorePreparationEnvelope(expected, context),
    after = next === null ? null : readAdventureRestorePreparationEnvelope(next, context),
    db = await open(guard);
  try {
    guard();
    return await new Promise((resolve, reject) => {
      let matched = false,
        cause: Error | null = null;
      const tx = db.transaction(store, 'readwrite'),
        records = tx.objectStore(store),
        request = records.get(key(context));
      request.onsuccess = () => {
        try {
          guard();
          matched = sameAdventureRestorePreparationEnvelope(
            request.result ?? null,
            before,
            context,
          );
          if (!matched) return;
          if (after === null) records.delete(key(context));
          else records.put(after, key(context));
        } catch (error) {
          cause = storageError(error);
          tx.abort();
        }
      };
      tx.onerror = () => {
        cause ??= new Error('Não foi possível salvar a recuperação protegida.');
      };
      tx.onabort = () => reject(cause ?? new Error('Gravação protegida interrompida.'));
      tx.oncomplete = () => {
        try {
          guard();
          resolve(matched);
        } catch (error) {
          reject(storageError(error));
        }
      };
    });
  } finally {
    db.close();
  }
}
