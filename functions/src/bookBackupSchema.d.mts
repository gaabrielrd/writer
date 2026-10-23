export interface RecoveredBookDraft {
  schemaVersion: 1;
  chapter: Record<string, unknown>;
  persona: Record<string, unknown> | null;
}
export function projectBookVersionDraft(
  value: unknown,
  resource?: { kind: string; id: string },
): RecoveredBookDraft;
