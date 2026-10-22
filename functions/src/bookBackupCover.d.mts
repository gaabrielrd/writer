import type { BookStructureSource } from './bookBackupStructure.mjs';
export const BOOK_COVER_LIMITS: Readonly<{ imageBytes: number; chunkBytes: 65536 }>;
export const BOOK_COVER_PNG_SIGNATURE: string;
export function validBookCoverId(value: unknown): boolean;
export type BookCoverDescriptor =
  | { kind: 'none' | 'legacy-unavailable' }
  | {
      kind: 'library';
      imageId: string;
      contentType: 'image/png';
      byteLength: number;
      chunkCount: number;
      contentHash: string;
      name?: string;
      createdAt?: number;
      updatedAt?: number;
    };
export function validateBookBackupCover(value: unknown): BookCoverDescriptor;
export interface BookCoverSource extends BookStructureSource {
  coverToken: string;
  cover: BookCoverDescriptor;
}
export interface BookCoverChunk extends BookStructureSource {
  coverToken: string;
  index: number;
  chunkBase64: string;
  chunkHash: string;
}
export interface BookCoverApi {
  getSource(
    this: void,
    input: { bookId: string; expectedSourceToken?: string },
  ): Promise<BookStructureSource>;
  cover(this: void, input: { bookId: string; sourceToken: string }): Promise<BookCoverSource>;
  read(
    this: void,
    input: { bookId: string; sourceToken: string; coverToken: string; index: number },
  ): Promise<BookCoverChunk>;
  verify(
    this: void,
    input: { bookId: string; sourceToken: string; coverToken: string },
  ): Promise<BookStructureSource & { coverToken: string }>;
}
