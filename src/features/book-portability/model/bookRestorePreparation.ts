export const BOOK_RESTORE_PREPARATION_COMMANDS = Object.freeze([
  'advanceBookRestoreIntegrity',
  'advanceBookRestoreValidation',
  'advanceBookRestoreStructure',
  'advanceBookRestoreLore',
  'advanceBookRestoreResources',
  'advanceBookRestoreCounts',
  'advanceBookRestorePersonas',
  'advanceBookRestoreUniverse',
  'advanceBookRestoreHistory',
  'advanceBookRestoreDraft',
  'finalizeBookRestoreDraft',
  'advanceBookRestoreCover',
  'reserveBookRestoreCover',
  'materializeBookRestoreCover',
  'advanceBookRestorePersonaLibrary',
  'advanceBookRestoreSourceIndexes',
  'advanceBookRestoreAudit',
] as const);
export type BookRestorePreparationCommand = (typeof BOOK_RESTORE_PREPARATION_COMMANDS)[number];
export type BookRestoreIdentity = {
  ownerId: string;
  restoreId: string;
  jobToken: string;
  bookId: string;
};
export type BookRestorePreparationPhase =
  | 'structure'
  | 'resources'
  | 'scenes'
  | 'resource-counts'
  | 'personas'
  | 'universe'
  | 'history'
  | 'draft'
  | 'draft-finalize'
  | 'cover'
  | 'cover-finalize'
  | 'personas-integrate'
  | 'resources-finalize'
  | 'resources-audit'
  | 'activation-ready';
export type BookRestoreState =
  | 'uploading'
  | 'uploaded'
  | 'checking'
  | 'bytes-verified'
  | 'rejected'
  | 'validating'
  | 'content-verified'
  | 'content-rejected'
  | 'activated'
  | 'cancelling'
  | 'cancelled';
export type BookRestorePreparationProgress = BookRestoreIdentity & {
  schemaVersion: 1;
  state: BookRestoreState;
  checkpoint: number;
  preparation: null | {
    schemaVersion: number;
    phase: BookRestorePreparationPhase;
    coverStorageState: null | 'reserved' | 'prepared';
    sourceIndexesComplete: boolean | null;
  };
};
export type BookRestorePreparationInput = {
  restoreId: string;
  jobToken: string;
  operationId: string;
  expectedCheckpoint: number;
  limit?: 16;
};
export type BookRestorePreparationIntent = BookRestoreIdentity & {
  schemaVersion: 1;
  action: BookRestorePreparationCommand;
  operationId: string;
  expectedCheckpoint: number;
  limit: 16 | null;
};
export interface BookRestorePreparationApi {
  get(input: { restoreId: string; jobToken: string }): Promise<unknown>;
  advance(
    action: BookRestorePreparationCommand,
    input: BookRestorePreparationInput,
  ): Promise<unknown>;
}
/** Implementations must compare the entire intent atomically, never just operationId. */
export interface BookRestorePreparationJournal {
  read(): Promise<BookRestorePreparationIntent | null>;
  compareAndSet(
    expected: BookRestorePreparationIntent | null,
    next: BookRestorePreparationIntent | null,
  ): Promise<boolean>;
}
export type BookRestorePreparationPause =
  'file-required' | 'review-required' | 'rejected' | 'cancelling' | 'cancelled' | 'activated';
export type BookRestorePreparationStep =
  | {
      kind: 'advanced';
      action: BookRestorePreparationCommand;
      progress: BookRestorePreparationProgress;
    }
  | {
      kind: 'paused';
      reason: BookRestorePreparationPause;
      progress: BookRestorePreparationProgress;
    };
