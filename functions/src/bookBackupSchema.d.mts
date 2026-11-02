export interface RecoveredBookDraft {
  schemaVersion: 1;
  chapter: Record<string, unknown>;
  persona: Record<string, unknown> | null;
}
export function projectBookVersionDraft(
  value: unknown,
  resource?: { kind: string; id: string },
): RecoveredBookDraft;
export function bookContentId(value: unknown): string;
export function validateBookBackupJSONItem(kind: string, value: unknown, bookId: string): unknown;
