import type { BookStructureSource, BookStructureChunk } from './bookBackupStructure.mjs';
export type BookPersonaScope = 'book' | 'chapter' | 'scene-source';
export const BOOK_PERSONA_SCOPES: readonly BookPersonaScope[];
export interface BookPersonaBinding {
  id: string;
  personaId: string | null;
  itemToken: string;
}
export interface BookPersonaPage extends BookStructureSource {
  kind: BookPersonaScope;
  items: BookPersonaBinding[];
  nextCursor: string | null;
}
export interface BookPersonaApi {
  getSource(
    this: void,
    input: { bookId: string; expectedSourceToken?: string },
  ): Promise<BookStructureSource>;
  list(
    this: void,
    input: {
      bookId: string;
      sourceToken: string;
      kind: BookPersonaScope;
      cursor: string | null;
      limit: number;
    },
  ): Promise<BookPersonaPage>;
  read(
    this: void,
    input: {
      bookId: string;
      sourceToken: string;
      kind: BookPersonaScope;
      id: string;
      itemToken: string;
      index: number;
    },
  ): Promise<Omit<BookStructureChunk, 'kind'> & { kind: BookPersonaScope }>;
}
export function projectBookBackupPersona(value: Record<string, unknown>): Record<string, unknown>;
export function serializeBookBackupPersona(
  scope: BookPersonaScope,
  ownerId: string,
  personaId: string,
  profile: Record<string, unknown>,
): { json: string; bytes: Uint8Array };
