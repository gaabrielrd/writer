export type PortableUniverseOrigin =
  | { kind: 'none' }
  | { kind: 'unavailable'; id: string }
  | { kind: 'reference'; id: string; created: { seconds: number; nanoseconds: number } };
export function validatePortableUniverseOrigin(value: unknown): PortableUniverseOrigin;
