export interface PersonaRestoreOrigin {
  schemaVersion: 1;
  bookId: string;
  restoreId: string;
  jobToken: string;
}
export interface PersonaRestoreBatch extends PersonaRestoreOrigin {
  ownerId: string;
  state: 'preparing' | 'active' | 'cancelled';
  profileCount: number;
  createdByOperationId: string;
  lastOperationId: string;
}
export function projectPersonaRestoreOrigin(record: unknown): PersonaRestoreOrigin | null;
export function projectPersonaRestoreBatch(value: unknown): PersonaRestoreBatch;
export function isPersonaRestoreBatchAvailable(
  ownerId: string,
  origin: PersonaRestoreOrigin | null,
  batch: unknown,
): boolean;
