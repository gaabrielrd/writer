export const INVENTORY_FAMILIES = [
  'structure',
  'resources',
  'lore',
  'personas',
  'history',
  'images',
  'universe',
] as const;
export type AdventureInventoryFamily = (typeof INVENTORY_FAMILIES)[number];
export interface AdventureInventorySource {
  readonly schemaVersion: 1;
  readonly adventureId: string;
  readonly sourceToken: string;
}
export interface AdventureInventoryScope {
  readonly family: AdventureInventoryFamily;
  readonly kind?: string;
  readonly scope?: 'adventure' | 'scene';
  readonly parentId?: string | null;
  readonly parentToken?: string | null;
}
export type AdventureInventoryItem = Readonly<Record<string, unknown> & { id: string }>;
export interface AdventureInventoryProof {
  readonly validation: 'inventory-only';
  readonly source: AdventureInventorySource;
  readonly digest: string;
  readonly counts: Readonly<Record<AdventureInventoryFamily, number>>;
  readonly views: number;
}
export type AdventureInventoryMethod =
  | 'getAdventureBackupSource'
  | 'listAdventureBackupStructure'
  | 'listAdventureBackupResources'
  | 'listAdventureBackupLore'
  | 'listAdventureBackupPersonaBindings'
  | 'listAdventureBackupHistory'
  | 'listAdventureBackupImageBindings'
  | 'getAdventureBackupUniverse';
export interface AdventureInventoryApi {
  call(
    method: AdventureInventoryMethod,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
}
export class AdventureInventoryError extends Error {
  readonly code = 'adventure-backup-invalid-inventory';
  constructor() {
    super('Não foi possível conferir todas as fontes da aventura. Faça um novo backup.');
    this.name = 'AdventureInventoryError';
  }
}
export function invalid(): never {
  throw new AdventureInventoryError();
}
export function closed(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((k) => Object.hasOwn(value, k)),
  );
}
const encoder = new TextEncoder(),
  decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
export function validId(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    v.length > 0 &&
    !['.', '..'].includes(v) &&
    !Array.from(v).some(
      (c) => c === '/' || c === '\\' || c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
    ) &&
    encoder.encode(v).length <= 1500 &&
    decoder.decode(encoder.encode(v)) === v
  );
}
export const validHash = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export const validCount = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
export function compareIds(a: string, b: string): number {
  const left = encoder.encode(a),
    right = encoder.encode(b);
  for (let n = 0; n < Math.min(left.length, right.length); n++)
    if (left[n] !== right[n]) return left[n]! - right[n]!;
  return left.length - right.length;
}
export function source(
  value: unknown,
  adventureId: string,
  expected?: string,
): AdventureInventorySource {
  if (
    !closed(value, ['schemaVersion', 'adventureId', 'sourceToken']) ||
    value.schemaVersion !== 1 ||
    value.adventureId !== adventureId ||
    !validHash(value.sourceToken) ||
    (expected !== undefined && value.sourceToken !== expected)
  )
    invalid();
  return Object.freeze({ schemaVersion: 1, adventureId, sourceToken: value.sourceToken });
}
export function matches(value: Record<string, unknown>, anchor: AdventureInventorySource): boolean {
  return (
    value.schemaVersion === 1 &&
    value.adventureId === anchor.adventureId &&
    value.sourceToken === anchor.sourceToken
  );
}
export function countsCopy(value?: unknown): Record<AdventureInventoryFamily, number> {
  if (
    value !== undefined &&
    (!closed(value, INVENTORY_FAMILIES) || !INVENTORY_FAMILIES.every((k) => validCount(value[k])))
  )
    invalid();
  return Object.fromEntries(
    INVENTORY_FAMILIES.map((k) => [
      k,
      value === undefined ? 0 : (value as Record<string, number>)[k],
    ]),
  ) as Record<AdventureInventoryFamily, number>;
}
