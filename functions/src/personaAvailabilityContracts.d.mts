export interface BookPersonaRestoreOrigin {
  schemaVersion: 1;
  bookId: string;
  restoreId: string;
  jobToken: string;
}
export interface AdventurePersonaRestoreOrigin {
  schemaVersion: 2;
  target: { kind: 'adventure'; id: string };
  restoreId: string;
  jobToken: string;
}
export type PersonaRestoreOrigin = BookPersonaRestoreOrigin | AdventurePersonaRestoreOrigin;
export type PersonaRestoreBatch = PersonaRestoreOrigin & {
  ownerId: string;
  state: 'preparing' | 'active' | 'cancelled';
  profileCount: number;
  createdByOperationId: string;
  lastOperationId: string;
};
export function personaRestoreProjectId(origin: PersonaRestoreOrigin): string;
export function projectPersonaRestoreOrigin(record: unknown): PersonaRestoreOrigin | null;
export function parsePersonaRestoreOrigin(value: unknown): PersonaRestoreOrigin;
export function projectPersonaRestoreBatch(value: unknown): PersonaRestoreBatch;
export function isPersonaRestoreBatchAvailable(
  ownerId: string,
  origin: PersonaRestoreOrigin | null,
  batch: unknown,
): boolean;
