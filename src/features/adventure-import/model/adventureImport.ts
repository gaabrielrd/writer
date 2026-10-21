export type SourceMediaType =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'text/markdown'
  | 'text/plain'
  | 'text/html';
export type ImportProject = { title: string; synopsis: string; universeId: string | null };
export type ImportSource = { mediaType: SourceMediaType; sha256: string; byteLength: number };
export type ImportSection = { title: string; content: string };
export type ConfirmedReview = {
  schemaVersion: 1;
  project: ImportProject;
  source: ImportSource;
  sections: ImportSection[];
};
export type ImportIdentity = {
  schemaVersion: 1;
  ownerId: string;
  importId: string;
  jobToken: string;
  adventureId: string;
};
export type ImportState =
  'uploading' | 'preparing' | 'ready' | 'activated' | 'deleting' | 'deleted';
export type ImportPhase = 'upload' | 'materialize' | 'ready' | 'complete' | 'cleanup' | 'deleted';
export type ImportAction =
  | 'startAdventureImport'
  | 'appendAdventureImportSection'
  | 'advanceAdventureImport'
  | 'activateAdventureImport'
  | 'cancelAdventureImport';
export type ImportProgress = ImportIdentity & {
  state: ImportState;
  phase: ImportPhase;
  checkpoint: number;
  title: string;
  universeId: string | null;
  source: ImportSource;
  keyId: string;
  recoveryKeyReady: boolean;
  reviewHash: string;
  sectionCount: number;
  totalBodyBytes: number;
  uploadedSections: number;
  uploadedBodyBytes: number;
  uploadedChainHash: string;
  preparedSections: number;
  wordCount: number;
  cleanedSections: number;
  cleanupComplete: boolean;
  result: { adventureId: string; revision: 1 } | null;
  createdAt: number;
  updatedAt: number;
};
export type ImportReceipt = {
  operationId: string;
  action: ImportAction;
  expectedCheckpoint: number | null;
  checkpoint: number;
  state: ImportState;
  phase: ImportPhase;
  index: number | null;
};
export type ImportConfirmed = {
  kind: 'confirmed';
  receipt: ImportReceipt;
  progress: ImportProgress;
};
export type ImportCanceledStart = {
  schemaVersion: 1;
  ownerId: string;
  importId: string;
  adventureId: string;
  kind: 'canceled';
};
export type ImportStartResult = ImportConfirmed | ImportCanceledStart;
export type StartImportInput = {
  operationId: string;
  project: ImportProject;
  source: ImportSource;
  sectionCount: number;
  totalBodyBytes: number;
  reviewHash: string;
};
export type ResolveImportStartInput = {
  operationId: string;
  requestHash: string;
  intent: 'cancel';
};
export type ImportMutationInput = {
  importId: string;
  jobToken: string;
  operationId: string;
  expectedCheckpoint: number;
};
export type AppendImportInput = ImportMutationInput & { index: number; section: ImportSection };
export type ImportPage = { items: ImportProgress[]; nextCursor: string | null };
export type ListImportsInput = { view?: 'pending' | 'all'; limit?: number; cursor?: string | null };
export type ImportKeyInput = {
  importId: string;
  jobToken: string;
  reviewHash: string;
  expectedKeyId?: string;
};
export type ImportRecoveryKey = ImportIdentity & {
  reviewHash: string;
  keyId: string;
  algorithm: 'AES-GCM';
  keyBase64: string;
};
export type ProtectedReviewSnapshot = {
  schemaVersion: 1;
  ownerId: string;
  importId: string;
  jobToken: string;
  keyId: string;
  reviewHash: string;
  sectionCount: number;
  nonce: Uint8Array;
  ciphertext: ArrayBuffer;
};
export type ImportJournal = {
  schemaVersion: 1;
  ownerId: string;
  importId: string;
  jobToken: string | null;
  action: ImportAction;
  operationId: string;
  expectedCheckpoint: number | null;
  index: number | null;
  fingerprint: string;
  intent: 'send' | 'cancel';
  stamp: string;
};
export type LocalImportRecord = {
  schemaVersion: 1;
  ownerId: string;
  importId: string;
  stamp: string;
  journal: ImportJournal | null;
  snapshot: ProtectedReviewSnapshot | null;
};
