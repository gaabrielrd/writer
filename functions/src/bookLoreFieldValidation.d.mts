export type BookLoreFieldName =
  | 'name'
  | 'category'
  | 'summary'
  | 'details'
  | 'aliases'
  | 'structuredDetails'
  | 'isPublic'
  | 'relations';
export interface BookLoreFieldState {
  readonly schemaVersion: 1;
  readonly field: BookLoreFieldName;
  readonly relationCount: number | null;
  readonly mode: 'syntax' | 'string' | 'escape' | 'unicode' | 'literal' | 'done';
  readonly stack: readonly {
    kind: string;
    phase: string;
    count: number;
    mask: number;
    key: number | null;
  }[];
  readonly role: 'text' | 'key' | 'target' | 'category' | null;
  readonly text: string;
  readonly textBytes: number;
  readonly unicode: string;
  readonly literal: string;
  readonly literalIndex: number;
  readonly byteLength: number;
  readonly utf8: {
    readonly remaining: number;
    readonly code: number;
    readonly min: number;
    readonly max: number;
  };
}
export type BookPortableLoreRelationsState = Omit<BookLoreFieldState, 'schemaVersion' | 'field'> & {
  readonly schemaVersion: 2;
  readonly field: 'relations';
};
export interface BookLoreFieldObserver {
  start?(role: string): void;
  text?(code: number, role: string): void;
  end?(role: string): void;
  /** Absolute field byte offset: opening quote, or exclusive end after closing quote. */
  position?(event: 'start' | 'end', role: string, offset: number): void;
}
export function createBookLoreFieldValidation(
  input: { field: Exclude<BookLoreFieldName, 'relations'> } | { field: 'relations'; count: number },
): BookLoreFieldState;
export function advanceBookLoreFieldValidation(
  input: BookLoreFieldState,
  bytes: Uint8Array,
  observer?: BookLoreFieldObserver,
): BookLoreFieldState;
export function advanceBookLoreFieldPrefixValidation(
  input: BookLoreFieldState,
  bytes: Uint8Array,
  observer?: BookLoreFieldObserver,
): { state: BookLoreFieldState; consumed: number };
export function finishBookLoreFieldValidation(input: BookLoreFieldState): {
  field: BookLoreFieldName;
  byteLength: number;
  count?: number;
};
export function createBookPortableLoreRelationsValidation(): BookPortableLoreRelationsState;
export function advanceBookPortableLoreRelationsPrefixValidation(
  input: BookPortableLoreRelationsState,
  bytes: Uint8Array,
  observer?: BookLoreFieldObserver,
  referenceLimit?: number,
): { state: BookPortableLoreRelationsState; consumed: number };
export function finishBookPortableLoreRelationsValidation(input: BookPortableLoreRelationsState): {
  field: 'relations';
  byteLength: number;
  count: number;
};
