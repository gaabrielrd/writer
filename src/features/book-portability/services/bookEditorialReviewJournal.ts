import type { EditorialReviewWire } from '../model/bookEditorialReview';
import { editorialReviewWire, reviewCheck, reviewClosed, reviewHash, reviewWireHash, stableReviewJSON } from './bookEditorialReviewContracts';
export interface EditorialReviewScope { actorId: string; bookId: string }
export interface EditorialReviewPending extends EditorialReviewScope {
  version: 1; ticket: string; revision: number; intent: 'apply' | 'withdraw';
  phase: 'prepared' | 'sent' | 'checking' | 'unconfirmed' | 'uncertain' | 'withdrawing';
  wire: EditorialReviewWire; wireHash: string;
}
export interface EditorialReviewJournal {
  read(): Promise<unknown>;
  compare(expected: unknown, next: EditorialReviewPending | null): Promise<boolean>;
}
export const EDITORIAL_REVIEW_DB = 'writer.book-editorial-review.metadata';
export const editorialReviewStorageAvailable = () => !!globalThis.indexedDB && !!globalThis.crypto?.subtle &&
  typeof globalThis.navigator?.locks?.request === 'function' && globalThis.isSecureContext !== false;
export async function parseEditorialReviewPending(raw: unknown, scope: EditorialReviewScope): Promise<EditorialReviewPending | null> {
  if (raw === null) return null;
  const value = reviewClosed(raw, ['version', 'actorId', 'bookId', 'ticket', 'revision', 'intent', 'phase', 'wire', 'wireHash']);
  reviewCheck(value.version === 1 && value.actorId === scope.actorId && value.bookId === scope.bookId &&
    typeof value.ticket === 'string' && value.ticket.length > 0 && Number.isSafeInteger(value.revision) && (value.revision as number) >= 0 &&
    ['apply', 'withdraw'].includes(String(value.intent)) && ['prepared', 'sent', 'checking', 'unconfirmed', 'uncertain', 'withdrawing'].includes(String(value.phase)));
  const wire = editorialReviewWire(value.wire); reviewHash(value.wireHash);
  reviewCheck(wire.bookId === scope.bookId && await reviewWireHash(wire) === value.wireHash);
  reviewCheck(new TextEncoder().encode(stableReviewJSON(value)).length <= 65536);
  return structuredClone(value) as unknown as EditorialReviewPending;
}
export function createEditorialReviewJournal(scope: EditorialReviewScope, guard: () => void): EditorialReviewJournal {
  const key = [scope.actorId, scope.bookId];
  async function open(): Promise<IDBDatabase> {
    guard(); reviewCheck(editorialReviewStorageAvailable());
    return new Promise((resolve, reject) => {
      let failed = false; const request = indexedDB.open(EDITORIAL_REVIEW_DB, 1);
      request.onupgradeneeded = () => { try { guard(); request.result.createObjectStore('pending'); } catch (error) { request.transaction?.abort(); reject(error); } };
      request.onblocked = () => { failed = true; reject(new Error('Feche outras abas para abrir o acompanhamento desta revisão.')); };
      request.onerror = () => { failed = true; reject(request.error ?? new Error('A recuperação local não abriu.')); };
      request.onsuccess = () => {
        const db = request.result; db.onversionchange = () => db.close();
        if (failed) { db.close(); return; }
        try { guard(); resolve(db); } catch (error) { db.close(); reject(error); }
      };
    });
  }
  async function transact(write: boolean, expected?: unknown, next?: EditorialReviewPending | null): Promise<unknown> {
    const db = await open();
    try { guard(); return await new Promise((resolve, reject) => {
      const tx = db.transaction('pending', write ? 'readwrite' : 'readonly');
      const store = tx.objectStore('pending'), request = store.get(key);
      let result: unknown = null, cause: unknown;
      request.onsuccess = () => {
        try { guard(); const current = request.result ?? null;
          if (!write) { result = current; return; }
          result = stableReviewJSON(current) === stableReviewJSON(expected);
          if (result) { if (next === null) store.delete(key); else store.put(structuredClone(next), key); }
        } catch (error) { cause = error; tx.abort(); }
      };
      tx.onerror = () => { cause ??= tx.error ?? new Error('O acompanhamento local não foi gravado.'); };
      tx.onabort = () => reject(cause ?? new Error('O acompanhamento local foi interrompido.'));
      tx.oncomplete = () => { try { guard(); resolve(result); } catch (error) { reject(error); } };
    }); } finally { db.close(); }
  }
  return { read: () => transact(false), compare: async (expected, next) => (await transact(true, expected, next)) === true };
}
