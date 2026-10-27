export const ADVENTURE_CONTENT_LIMITS: Readonly<{
  itemBytes: number;
  checkpointBytes: number;
  stepItems: number;
}>;
export class AdventureContentError extends Error {
  readonly code: 'adventure-backup-invalid-content';
}
export function contentInvalid(): never;
export function contentObject(value: unknown): value is Record<string, unknown>;
export function contentClosed(
  value: unknown,
  required: readonly string[],
  optional?: readonly string[],
): value is Record<string, unknown>;
export function contentCount(value: unknown): value is number;
export function contentHash(value: unknown): value is string;
export function contentText(value: unknown, max?: number): value is string;
export function contentDate(value: unknown): value is number;
export function contentId(value: unknown): value is string;
export function decodeAdventureContentJSON(bytes: Uint8Array): unknown;
export interface AdventureUtf8State {
  readonly needed: number;
  readonly minimum: number;
  readonly maximum: number;
}
export function createAdventureUtf8State(): AdventureUtf8State;
export function advanceAdventureUtf8(
  state: AdventureUtf8State,
  bytes: Uint8Array,
  final?: boolean,
): AdventureUtf8State;
