import type { BookStructureSource, BookStructureItem } from './bookBackupStructure.mjs';
export type BookResourceKind =
  | 'lore'
  | 'scene-control'
  | 'scene-source'
  | 'scene'
  | 'scene-body'
  | 'scene-planning'
  | 'scene-reference'
  | 'narrative-control'
  | 'arc'
  | 'milestone'
  | 'event'
  | 'narrative-link';
export const BOOK_RESOURCE_KINDS: readonly BookResourceKind[];
export const BOOK_RESOURCE_CHILDREN: Readonly<
  Partial<Record<BookResourceKind, readonly BookResourceKind[]>>
>;
export const BOOK_RESOURCE_SINGLETONS: Readonly<Partial<Record<BookResourceKind, string>>>;
export const BOOK_RESOURCE_ROOTS: readonly BookResourceKind[];
export interface BookResourceScope {
  kind: BookResourceKind;
  parentId: string | null;
}
export interface BookResourcePage extends BookStructureSource, BookResourceScope {
  items: BookStructureItem[];
  nextCursor: string | null;
}
export interface BookResourceChunk
  extends BookStructureSource, BookResourceScope, BookStructureItem {
  index: number;
  chunkCount: number;
  byteLength: number;
  contentHash: string;
  chunkBase64: string;
}
export interface BookResourceApi {
  getSource(
    this: void,
    input: { bookId: string; expectedSourceToken?: string },
  ): Promise<BookStructureSource>;
  list(
    this: void,
    input: BookResourceScope & {
      bookId: string;
      sourceToken: string;
      cursor: string | null;
      limit: number;
    },
  ): Promise<BookResourcePage>;
  read(
    this: void,
    input: BookResourceScope & {
      bookId: string;
      sourceToken: string;
      id: string;
      itemToken: string;
      index: number;
    },
  ): Promise<BookResourceChunk>;
}
export function serializeBookBackupResource(
  kind: BookResourceKind,
  parentId: string | null,
  id: string,
  value: Record<string, unknown>,
): { json: string; bytes: Uint8Array };

export function projectBookBackupResource(
  kind: BookResourceKind,
  value: Record<string, unknown>,
): Record<string, unknown>;
