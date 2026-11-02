export const BOOK_STRUCTURE_LIMITS: Readonly<{
  version: 1;
  pageItems: 50;
  chunkBytes: 65536;
  itemBytes: number;
}>;
export type BookStructureKind = 'book' | 'act' | 'chapter';
export interface BookStructureSource {
  schemaVersion: 1;
  bookId: string;
  sourceToken: string;
}
export interface BookStructureItem {
  id: string;
  itemToken: string;
}
export interface BookStructurePage extends BookStructureSource {
  kind: 'act' | 'chapter';
  items: BookStructureItem[];
  nextCursor: string | null;
}
export interface BookStructureChunk extends BookStructureSource, BookStructureItem {
  kind: BookStructureKind;
  index: number;
  chunkCount: number;
  byteLength: number;
  contentHash: string;
  chunkBase64: string;
}
export interface BookStructureApi {
  getSource(
    this: void,
    input: { bookId: string; expectedSourceToken?: string },
  ): Promise<BookStructureSource>;
  list(
    this: void,
    input: {
      bookId: string;
      sourceToken: string;
      kind: 'act' | 'chapter';
      cursor: string | null;
      limit: number;
    },
  ): Promise<BookStructurePage>;
  read(
    this: void,
    input: {
      bookId: string;
      sourceToken: string;
      kind: BookStructureKind;
      id: string;
      itemToken: string;
      index: number;
    },
  ): Promise<BookStructureChunk>;
}
export function serializeBookBackupStructure(
  kind: BookStructureKind,
  value: Record<string, unknown>,
  control?: Record<string, unknown>,
): { json: string; bytes: Uint8Array };

export function encodeBookBackupJSON(value: unknown): { json: string; bytes: Uint8Array };
