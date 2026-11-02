import type { BookStructureSource } from './bookBackupStructure.mjs';
export const BOOK_DRAFT_PROFILE_BYTES: 262144;
export function encodeBookBackupDraftPersona(value: Record<string, unknown>): {
  profile: Record<string, unknown>;
  json: string;
  bytes: Uint8Array;
};
export interface BookDraftPersonaCapture extends BookStructureSource {
  personaId: string;
  personaToken: string;
  profileHash: string;
  profile: Record<string, unknown>;
}
export interface BookDraftApi {
  getSource(
    this: void,
    input: { bookId: string; expectedSourceToken?: string },
  ): Promise<BookStructureSource>;
  persona(
    this: void,
    input: {
      bookId: string;
      sourceToken: string;
      personaId: string;
      expectedPersonaToken?: string;
    },
  ): Promise<BookDraftPersonaCapture>;
}
