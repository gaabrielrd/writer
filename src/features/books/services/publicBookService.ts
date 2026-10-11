import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  onSnapshot,
  type DocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { groupChapters, type ActHeading } from '../model/act';
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
    (data.schemaVersion !== 1 && data.schemaVersion !== 2) ||
    (data.schemaVersion === 2 &&
      (typeof data.universeId !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,128}$/.test(data.universeId) ||
        !Number.isInteger(data.universePrivacyVersion) ||
        Number(data.universePrivacyVersion) < 0)) ||
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
    ...(data.hasActs === true ? { hasActs: true as const } : {}),
    title: data.title,
    authorName: data.authorName,
    revisionId: data.revisionId,
    publishedAt: data.publishedAt,
    ...(data.schemaVersion === 2
      ? {
          universeId: data.universeId as string,
          universePrivacyVersion: data.universePrivacyVersion as number,
        }
      : {}),
  };
}

export async function getPublicBook(bookId: string): Promise<PublicBook | null> {
  try {
    const book = mapBook(await getDocFromServer(doc(firestore, 'publicBooks', bookId)));
    if (book?.universeId) {
      const privacy = (
        await getDocFromServer(doc(firestore, 'publicUniversePrivacy', book.universeId))
      ).data();
      if (!privacy || privacy.active !== true || privacy.version !== book.universePrivacyVersion)
        return null;
    }
    return book;
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
  let stopPrivacy: Unsubscribe | undefined;
  let active = true;
  let currentKey: string | undefined;
  const stopRoot = onSnapshot(
    doc(firestore, 'publicBooks', bookId),
    { includeMetadataChanges: true },
    (snapshot) => {
      if (snapshot.metadata.fromCache || !active) return;
      const book = mapBook(snapshot);
      const key = book?.universeId
        ? `${book.universeId}:${book.universePrivacyVersion}:${book.revisionId}`
        : undefined;
      if (key !== currentKey) {
        stopPrivacy?.();
        stopPrivacy = undefined;
        currentKey = key;
      }
      if (!book?.universeId) {
        onChange(book);
        return;
      }
      if (!stopPrivacy) {
        stopPrivacy = onSnapshot(
          doc(firestore, 'publicUniversePrivacy', book.universeId),
          { includeMetadataChanges: true },
          (privacySnapshot) => {
            if (!active || key !== currentKey || privacySnapshot.metadata.fromCache) return;
            const privacy = privacySnapshot.data();
            onChange(
              privacy?.active === true && privacy.version === book.universePrivacyVersion
                ? book
                : null,
            );
          },
          (error) => {
            if (active && key === currentKey) {
              if (isPublicBookUnavailable(error)) onChange(null);
              else onError(error);
            }
          },
        );
      }
    },
    (error) => {
      stopPrivacy?.();
      stopPrivacy = undefined;
      currentKey = undefined;
      if (isPublicBookUnavailable(error)) onChange(null);
      else onError(error);
    },
  );
  return () => {
    active = false;
    stopRoot();
    stopPrivacy?.();
  };
}

/** No reads of private books, chapters, profiles or lore occur on the public route. */
export async function getPublicBookContent(book: PublicBook): Promise<PublicBookContent> {
  const path = ['publicBooks', book.id, 'revisions', book.revisionId] as const;
  const [chapterSnapshot, loreSnapshot] = await Promise.all([
    getDocsFromServer(collection(firestore, ...path, 'chapters')),
    getDocsFromServer(collection(firestore, ...path, 'lore')),
  ]);
  const acts: ActHeading[] = [];
  if (book.hasActs) {
    const actSnapshot = await getDocsFromServer(collection(firestore, ...path, 'acts'));
    for (const snapshot of actSnapshot.docs) {
      const data = snapshot.data();
      if (
        typeof data.name !== 'string' ||
        !data.name.trim() ||
        data.name.length > 300 ||
        !Number.isSafeInteger(data.order) ||
        data.order < 1
      )
        throw new Error('Publicação inválida.');
      acts.push({ id: snapshot.id, name: data.name, order: data.order as number });
    }
  }
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
        ...(typeof data.actId === 'string' ? { actId: data.actId } : {}),
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
  if (chapters.some((chapter) => chapter.actId && !acts.some((act) => act.id === chapter.actId)))
    throw new Error('Publicação inválida.');
  return {
    chapters: groupChapters(chapters, acts).flatMap((group) => group.chapters),
    lore,
    ...(book.hasActs ? { acts } : {}),
  };
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
