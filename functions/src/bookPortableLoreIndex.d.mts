export const BOOK_PORTABLE_LORE_FIELDS: readonly [
  'name',
  'aliases',
  'category',
  'summary',
  'details',
  'structuredDetails',
  'isPublic',
  'createdAt',
  'updatedAt',
  'relations',
];
export type BookPortableLoreField = (typeof BOOK_PORTABLE_LORE_FIELDS)[number];
export const BOOK_PORTABLE_LORE_INDEX_BYTES: number;
export interface BookPortableLoreRange {
  readonly offset: number;
  readonly byteLength: number;
}
export interface BookPortableLoreIndexState {
  readonly schemaVersion: 1;
  readonly phase: 'open' | 'firstKey' | 'key' | 'keyText' | 'colon' | 'value' | 'after' | 'done';
  readonly mask: number;
  readonly key: number | null;
  readonly keyText: string;
  readonly child: unknown | null;
  readonly small: string;
  readonly valueStart: number | null;
  readonly valueBytes: number;
  readonly byteLength: number;
  readonly ranges: Readonly<Partial<Record<BookPortableLoreField, BookPortableLoreRange>>>;
  readonly isPublic: boolean | null;
  readonly dates: Readonly<Partial<Record<'createdAt' | 'updatedAt', number>>>;
  readonly relationCount: number | null;
  readonly referenceCount: number;
  readonly target: string;
}
export interface BookPortableLoreReference {
  readonly index: number;
  readonly targetEntityId: string;
}
export interface BookPortableLoreMetadata {
  readonly schemaVersion: 1;
  readonly fields: readonly BookPortableLoreField[];
  readonly ranges: BookPortableLoreIndexState['ranges'];
  readonly dates: BookPortableLoreIndexState['dates'];
  readonly isPublic: { readonly present: boolean; readonly value: boolean | null };
  readonly relations: { readonly present: boolean; readonly count: number };
}
export function createBookPortableLoreIndex(): BookPortableLoreIndexState;
export function advanceBookPortableLoreIndex(
  input: BookPortableLoreIndexState,
  bytes: Uint8Array,
): { state: BookPortableLoreIndexState; references: readonly BookPortableLoreReference[] };
export function finishBookPortableLoreIndex(
  input: BookPortableLoreIndexState,
): BookPortableLoreMetadata;
