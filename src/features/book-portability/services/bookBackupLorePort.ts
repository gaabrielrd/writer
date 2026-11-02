import type { BookLorePortableProof, BookLorePortableWrite } from '@/features/lore';
export interface BookBackupLorePort {
  guard(this: void): void;
  writePortable(
    this: void,
    bookId: string,
    id: string,
    write: BookLorePortableWrite,
    signal?: AbortSignal,
  ): Promise<BookLorePortableProof>;
  portableMetadata(
    this: void,
    bookId: string,
    id: string,
    signal?: AbortSignal,
  ): Promise<BookLorePortableProof['source']>;
}
type Session = ReturnType<(typeof import('@/features/lore'))['bookLoreReadSession']>;
/** One lazy actor-bound session for capture and final metadata; no Auth/App Check on import. */
export function createBookBackupLorePort(): BookBackupLorePort {
  let session: Session | undefined, pending: Promise<Session> | undefined;
  async function open() {
    pending ??= import('@/features/lore').then(({ bookLoreReadSession }) => {
      session = bookLoreReadSession(() => true, { tokenVersion: 1 });
      return session;
    });
    const value = await pending;
    value.guard();
    return value;
  }
  return {
    guard: () => session?.guard(),
    writePortable: async (bookId, id, write, signal) =>
      (await open()).writePortable(bookId, id, write, signal),
    portableMetadata: async (bookId, id, signal) =>
      (await open()).portableMetadata(bookId, id, signal),
  };
}
