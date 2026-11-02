import type { BookStructureSource } from './bookBackupStructure.mjs';
export type BookUniverseOrigin =
  | { kind: 'none' }
  | { kind: 'unavailable'; id: string }
  | { kind: 'reference'; id: string; created: { seconds: number; nanoseconds: number } };
export function validateBookBackupUniverseOrigin(value: unknown): BookUniverseOrigin;
export interface BookUniverseCapture extends BookStructureSource {
  origin: BookUniverseOrigin;
  universeToken: string;
}
export interface BookUniverseApi {
  getSource(
    this: void,
    input: { bookId: string; expectedSourceToken?: string },
  ): Promise<BookStructureSource>;
  read(
    this: void,
    input: { bookId: string; sourceToken: string; expectedUniverseToken?: string },
  ): Promise<BookUniverseCapture>;
}
