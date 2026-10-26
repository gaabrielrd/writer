import { createBookRestoreMetadataStore } from './bookRestoreMetadataStore';
import { readBookRestoreEffectRecord } from './bookRestoreEffectContracts';
export const BOOK_RESTORE_EFFECT_DB = 'writer.book-restore.effects';
const storage = createBookRestoreMetadataStore(
  BOOK_RESTORE_EFFECT_DB,
  'pending',
  readBookRestoreEffectRecord,
);
export const readStoredBookRestoreEffect = storage.read;
export const compareStoredBookRestoreEffect = storage.compare;
export const listStoredBookRestoreEffects = storage.list;
