import type { BookLoreFieldState } from './bookLoreFieldValidation.mjs';
import type {
  BookPortableLoreIndexState,
  BookPortableLoreMetadata,
  BookPortableLoreReference,
} from './bookPortableLoreIndex.mjs';
export const BOOK_PORTABLE_LORE_ITEM_INDEX_BYTES: number;
export interface BookPortableLoreItemIndexState {
  readonly schemaVersion: 1;
  readonly phase: 'open' | 'firstKey' | 'key' | 'keyText' | 'colon' | 'value' | 'after' | 'done';
  readonly mask: number;
  readonly key: 'schemaVersion' | 'kind' | 'parentId' | 'id' | 'data' | null;
  readonly keyText: string;
  readonly literalAt: number;
  readonly id: string;
  readonly child: BookLoreFieldState | null;
  readonly data: BookPortableLoreIndexState | null;
  readonly dataOffset: number | null;
  readonly byteLength: number;
}
export interface BookPortableLoreItemMetadata {
  readonly schemaVersion: 1;
  readonly kind: 'lore';
  readonly parentId: null;
  readonly id: string;
  readonly byteLength: number;
  readonly dataOffset: number;
  readonly dataByteLength: number;
  readonly index: BookPortableLoreMetadata;
}
export function createBookPortableLoreItemIndex(): BookPortableLoreItemIndexState;
export function advanceBookPortableLoreItemIndex(
  input: BookPortableLoreItemIndexState,
  bytes: Uint8Array,
  referenceLimit?: number,
): {
  state: BookPortableLoreItemIndexState;
  consumed: number;
  references: readonly BookPortableLoreReference[];
};
export function finishBookPortableLoreItemIndex(
  input: BookPortableLoreItemIndexState,
): BookPortableLoreItemMetadata;
