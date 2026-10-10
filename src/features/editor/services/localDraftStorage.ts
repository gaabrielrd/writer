interface LocalDraft {
  content: string;
  updatedAt: number;
}
const key = (ownerId: string, bookId: string, chapterId: string) =>
  `writer:draft:${ownerId}:${bookId}:${chapterId}`;

export function readLocalDraft(
  ownerId: string,
  bookId: string,
  chapterId: string,
): LocalDraft | null {
  try {
    const raw = localStorage.getItem(key(ownerId, bookId, chapterId));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (
      typeof value !== 'object' ||
      value === null ||
      !('content' in value) ||
      typeof value.content !== 'string' ||
      !('updatedAt' in value) ||
      typeof value.updatedAt !== 'number' ||
      !Number.isFinite(value.updatedAt)
    )
      return null;
    return { content: value.content, updatedAt: value.updatedAt };
  } catch {
    return null;
  }
}

export function writeLocalDraft(
  ownerId: string,
  bookId: string,
  chapterId: string,
  content: string,
): void {
  localStorage.setItem(
    key(ownerId, bookId, chapterId),
    JSON.stringify({ content, updatedAt: Date.now() }),
  );
}

export function clearLocalDraft(
  ownerId: string,
  bookId: string,
  chapterId: string,
  savedContent: string,
): void {
  if (readLocalDraft(ownerId, bookId, chapterId)?.content === savedContent)
    localStorage.removeItem(key(ownerId, bookId, chapterId));
}
