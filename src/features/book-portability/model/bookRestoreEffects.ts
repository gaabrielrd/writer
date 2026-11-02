import type { BookRestoreIdentity } from './bookRestorePreparation';
export const BOOK_RESTORE_EFFECT_ACTIONS = Object.freeze([
  'activateBookRestore',
  'finalizeBookRestoreMedia',
  'advanceBookRestoreArchiveCleanup',
  'cancelBookRestore',
  'advanceBookRestoreCleanup',
] as const);
export type BookRestoreEffectAction = (typeof BOOK_RESTORE_EFFECT_ACTIONS)[number];
export type BookRestoreEffectIntent = BookRestoreIdentity & {
  schemaVersion: 1;
  action: BookRestoreEffectAction;
  operationId: string;
  expectedCheckpoint: number | null;
  expectedRevision: number | null;
  reviewToken: string | null;
};
export type BookRestoreEffectRecord = {
  schemaVersion: 1;
  stamp: string;
  intent: BookRestoreEffectIntent;
};
export type BookRestoreEffectInput = {
  restoreId: string;
  jobToken: string;
  operationId: string;
  expectedCheckpoint?: number;
  limit?: 16;
  expectedRevision?: number;
  reviewToken?: string;
};
