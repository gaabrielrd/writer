export const BOOK_LORE_BASE_FIELDS: readonly [
  'name',
  'category',
  'summary',
  'details',
  'aliases',
  'structuredDetails',
  'isPublic',
  'bookId',
  'createdAt',
  'updatedAt',
];
export type BookLoreBaseField = (typeof BOOK_LORE_BASE_FIELDS)[number];
export interface BookLoreBaseRange {
  offset: number;
  byteLength: number;
}
export interface BookLoreBaseIndexState {
  schemaVersion: 1;
  bookId: string;
  phase: string;
  mask: number;
  key: number | null;
  keyText: string;
  child: unknown | null;
  small: string;
  valueStart: number | null;
  valueBytes: number;
  byteLength: number;
  ranges: Partial<Record<BookLoreBaseField, BookLoreBaseRange>>;
  isPublic: boolean | null;
  dates: Partial<Record<'createdAt' | 'updatedAt', number>>;
}
export interface BookLoreBaseMetadata {
  schemaVersion: 1;
  fields: readonly BookLoreBaseField[];
  isPublic: { present: boolean; value: boolean | null };
  dates: BookLoreBaseIndexState['dates'];
  ranges: BookLoreBaseIndexState['ranges'];
}
export function createBookLoreBaseIndex(bookId: string): BookLoreBaseIndexState;
export function advanceBookLoreBaseIndex(
  input: BookLoreBaseIndexState,
  bytes: Uint8Array,
  observers?: Partial<
    Record<
      BookLoreBaseField,
      {
        start?(role: string): void;
        text?(code: number, role: string): void;
        end?(role: string): void;
      }
    >
  >,
  valueBytes?: (key: BookLoreBaseField, bytes: Uint8Array, complete: boolean) => void,
): BookLoreBaseIndexState;
export function finishBookLoreBaseIndex(input: BookLoreBaseIndexState): BookLoreBaseMetadata;
