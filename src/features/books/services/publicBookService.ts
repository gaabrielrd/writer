import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  onSnapshot,
  type DocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { firestore, renderRichText } from '@/shared/lib';

import type {
  PublicBook,
  PublicBookContent,
  PublicChapter,
  PublicLoreEntity,
} from '../model/publicBook';
export type {
  PublicBook,
  PublicBookContent,
  PublicChapter,
  PublicLoreEntity,
} from '../model/publicBook';

export function isPublicBookUnavailable(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    ['permission-denied', 'not-found'].includes(String(error.code).replace('firestore/', ''))
  );
}

function mapBook(snapshot: DocumentSnapshot): PublicBook | null {
  if (!snapshot.exists()) return null;
  const data: Record<string, unknown> = snapshot.data();
  if (
    data.schemaVersion !== 1 ||
    typeof data.title !== 'string' ||
    typeof data.authorName !== 'string' ||
    typeof data.revisionId !== 'string' ||
    !data.revisionId ||
    data.revisionId.includes('/') ||
    typeof data.publishedAt !== 'number' ||
    !Number.isFinite(data.publishedAt)
  )
    return null;
  return {
    id: snapshot.id,
    title: data.title,
    authorName: data.authorName,
    revisionId: data.revisionId,
    publishedAt: data.publishedAt,
  };
}

export async function getPublicBook(bookId: string): Promise<PublicBook | null> {
  try {
    return mapBook(await getDocFromServer(doc(firestore, 'publicBooks', bookId)));
  } catch (error) {
    if (isPublicBookUnavailable(error)) return null;
    throw error;
  }
}

/** Cached snapshots cannot reinstate a revoked publication. The caller starts with a server read. */
export function subscribePublicBook(
  bookId: string,
  onChange: (book: PublicBook | null) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    doc(firestore, 'publicBooks', bookId),
    { includeMetadataChanges: true },
    (snapshot) => {
      if (!snapshot.metadata.fromCache) onChange(mapBook(snapshot));
    },
    (error) => {
      if (isPublicBookUnavailable(error)) onChange(null);
      else onError(error);
    },
  );
}

/** No reads of private books, chapters, profiles or lore occur on the public route. */
export async function getPublicBookContent(book: PublicBook): Promise<PublicBookContent> {
  const path = ['publicBooks', book.id, 'revisions', book.revisionId] as const;
  const [chapterSnapshot, loreSnapshot] = await Promise.all([
    getDocsFromServer(collection(firestore, ...path, 'chapters')),
    getDocsFromServer(collection(firestore, ...path, 'lore')),
  ]);
  const chapters = chapterSnapshot.docs
    .map((snapshot): PublicChapter => {
      const data: Record<string, unknown> = snapshot.data();
      if (
        typeof data.title !== 'string' ||
        typeof data.content !== 'string' ||
        typeof data.order !== 'number' ||
        !Number.isFinite(data.order)
      ) {
        throw new Error('Publicação inválida.');
      }
      return {
        id: snapshot.id,
        title: data.title,
        order: data.order,
        content: renderRichText(data.content),
      };
    })
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const lore = loreSnapshot.docs.flatMap((snapshot): PublicLoreEntity[] => {
    const data: Record<string, unknown> = snapshot.data();
    if (
      data.isPublic === false ||
      typeof data.name !== 'string' ||
      !data.name.trim() ||
      typeof data.summary !== 'string' ||
      !['character', 'location', 'concept', 'other'].includes(String(data.category))
    )
      return [];
    return [
      {
        id: snapshot.id,
        name: data.name,
        summary: data.summary,
        category: data.category as PublicLoreEntity['category'],
        aliases: Array.isArray(data.aliases)
          ? data.aliases.filter(
              (alias): alias is string => typeof alias === 'string' && !!alias.trim(),
            )
          : [],
        isPublic: true,
      },
    ];
  });
  return { chapters, lore };
}

export function publicReadingPath(bookId: string, chapterId?: string): string {
  const path = `/read/${encodeURIComponent(bookId)}`;
  return chapterId ? `${path}?chapter=${encodeURIComponent(chapterId)}` : path;
}

export function publicReadingUrl(bookId: string, chapterId?: string): string {
  return new URL(publicReadingPath(bookId, chapterId), window.location.origin).href;
}

export async function copyPublicReadingLink(bookId: string, chapterId?: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error('Clipboard indisponível.');
  await navigator.clipboard.writeText(publicReadingUrl(bookId, chapterId));
}
