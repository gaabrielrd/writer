export interface BookPersonaAvailability {
  schemaVersion: 1;
  personaId: string;
  reason: 'profile-not-recorded' | 'legacy-overrides';
}
export function readBookPersonaAvailability(value: unknown): BookPersonaAvailability | null;
export function currentBookPersonaAvailability(
  value: unknown,
  personaId: unknown,
): BookPersonaAvailability | null;
