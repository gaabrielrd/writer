import type { BookRestoreStartIntent } from '../model/bookRestoreTransfer';
import { readBookRestoreStartIntent } from './bookRestoreTransferContracts';
import { restorePreparationCheck as check } from './bookRestorePreparationContracts';
import { createBookRestoreMetadataStore } from './bookRestoreMetadataStore';
export type BookRestoreBootstrapRecord = {
  schemaVersion: 1;
  stamp: string;
  intent: BookRestoreStartIntent;
};
export const BOOK_RESTORE_BOOTSTRAP_DB = 'writer.book-restore.starts';

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

const storage = createBookRestoreMetadataStore(
  BOOK_RESTORE_BOOTSTRAP_DB,
  'attempts',
  readBookRestoreBootstrapRecord,
);
export const readStoredBookRestoreStart = storage.read;
export const compareStoredBookRestoreStart = storage.compare;
export const listStoredBookRestoreStarts = storage.list;
