import { validateComplement, type PersonaComplement } from '@/features/ai-assistant';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  runTransaction,
  onSnapshot,
} from 'firebase/firestore';
import { firestore } from '@/shared/lib';
import { deleteSceneBook, deleteSceneGroup } from '@/features/scenes';
import { resolveChapterContent } from './chapterCompositionService';
import {
  createOrganizedChapter,
  MAX_CHAPTER_SELECTION,
  listActs,
} from './chapterOrganizationService';
import { createBookWithGeneratedCover, saveBookLibraryCover } from './generatedBookService';
import {
  beginBookDeletion,
  deletePublicationRevisions,
  finishBookDeletion,
  unpublishBook,
} from './publicationService';
import { groupChapters } from '../model/act';
import type { Book, CreateBookInput, UpdateBookInput } from '../model/book';
import {
  countWords,
  type Chapter,
  type CreateChapterInput,
  type UpdateChapterInput,
} from '../model/chapter';

interface StoredBookDoc {
  deleting?: boolean;
  hasSceneResources?: boolean;
  sceneRevision?: number;
  hasNarrativeResources?: boolean;
  narrativeRevision?: number;
  universeId?: string | null;
  personaId?: string | null;
  authorId: string;
  title: string;
  genre?: string;
  synopsis?: string;
  coverUrl?: string | null;
  coverImageId?: string | null;
  status: 'draft' | 'published';
  wordCount: number;
  createdAt: number;
  updatedAt: number;
}

interface StoredChapterDoc {
  contentMode?: 'legacy' | 'scenes';
  assemblyRevision?: number;
  structureRevision?: number;
  deleting?: boolean;
  actId?: string | null;
  personaComplement?: PersonaComplement | null;
  bookId: string;
  title: string;
  order: number;
  wordCount: number;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export async function listBooksByAuthor(authorId: string): Promise<Book[]> {
  const booksRef = collection(firestore, 'books');
  const q = query(booksRef, where('authorId', '==', authorId));
  const snapshot = await getDocs(q);

  const books = snapshot.docs.map((docSnap) => {
    const data = docSnap.data() as StoredBookDoc;
    return {
      id: docSnap.id,
      authorId: data.authorId,
      ...(data.personaId ? { personaId: data.personaId } : {}),
      ...(data.universeId ? { universeId: data.universeId } : {}),
      title: data.title,
      genre: data.genre ?? '',
      synopsis: data.synopsis ?? '',
      coverUrl: data.coverUrl ?? null,
      ...(data.coverImageId ? { coverImageId: data.coverImageId } : {}),
      status: data.status ?? 'draft',
      wordCount: data.wordCount ?? 0,
      ...(data.hasSceneResources
        ? { hasSceneResources: true, sceneRevision: data.sceneRevision ?? 0 }
        : {}),
      ...(data.deleting ? { deleting: true } : {}),
      ...(data.hasNarrativeResources
        ? { hasNarrativeResources: true, narrativeRevision: data.narrativeRevision ?? 0 }
        : {}),
      createdAt: data.createdAt ?? Date.now(),
      updatedAt: data.updatedAt ?? Date.now(),
    };
  });

  return books.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getBook(
  bookId: string,
  options: { source?: 'server' | 'default' } = {},
): Promise<Book | null> {
  const bookRef = doc(firestore, 'books', bookId);
  const snapshot = await (options.source === 'server'
    ? getDocFromServer(bookRef)
    : getDoc(bookRef));

  if (!snapshot.exists()) return null;

  const data = snapshot.data() as StoredBookDoc;
  return {
    id: snapshot.id,
    authorId: data.authorId,
    ...(data.personaId ? { personaId: data.personaId } : {}),
    ...(data.universeId ? { universeId: data.universeId } : {}),
    title: data.title,
    genre: data.genre ?? '',
    synopsis: data.synopsis ?? '',
    coverUrl: data.coverUrl ?? null,
    ...(data.coverImageId ? { coverImageId: data.coverImageId } : {}),
    status: data.status ?? 'draft',
    wordCount: data.wordCount ?? 0,
    ...(data.hasSceneResources
      ? { hasSceneResources: true, sceneRevision: data.sceneRevision ?? 0 }
      : {}),
    ...(data.deleting ? { deleting: true } : {}),
    ...(data.hasNarrativeResources
      ? { hasNarrativeResources: true, narrativeRevision: data.narrativeRevision ?? 0 }
      : {}),
    createdAt: data.createdAt ?? Date.now(),
    updatedAt: data.updatedAt ?? Date.now(),
  };
}

export async function createBook(authorId: string, input: CreateBookInput): Promise<Book> {
  if (input.coverGenerationId || input.coverImageId || input.universeId)
    return createBookWithGeneratedCover({
      ...input,
      creationId: input.creationId ?? crypto.randomUUID(),
    });
  const booksRef = collection(firestore, 'books');
  if (input.creationId && !/^[a-zA-Z0-9-]{16,80}$/.test(input.creationId))
    throw new Error('Identificador de criação inválido.');
  const newDocRef = input.creationId ? doc(booksRef, input.creationId) : doc(booksRef);
  const now = Date.now();

  const newBook: Book = {
    id: newDocRef.id,
    authorId,
    title: input.title.trim(),
    genre: input.genre?.trim() ?? '',
    synopsis: input.synopsis?.trim() ?? '',
    coverUrl: input.coverUrl ?? null,
    status: 'draft',
    wordCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  if (input.creationId) {
    return runTransaction(firestore, async (transaction) => {
      const existing = await transaction.get(newDocRef);
      if (existing.exists()) {
        const book = existing.data() as Book;
        if (book.authorId !== authorId) throw new Error('Livro indisponível.');
        return book;
      }
      transaction.set(newDocRef, newBook);
      return newBook;
    });
  }
  await setDoc(newDocRef, newBook);
  return newBook;
}

export async function updateBook(bookId: string, input: UpdateBookInput): Promise<void> {
  if (input.status === 'published') {
    throw new Error('Use a publicação para revisar e disponibilizar uma cópia pública do livro.');
  }
  if (input.status === 'draft') await unpublishBook(bookId);
  if ('coverImageId' in input || 'universeId' in input) {
    await saveBookLibraryCover(bookId, input);
    return;
  }
  const bookRef = doc(firestore, 'books', bookId);
  const dataToUpdate: Partial<StoredBookDoc> = {
    ...input,
    updatedAt: Date.now(),
  };
  await updateDoc(bookRef, dataToUpdate);
}

export async function deleteBook(bookId: string): Promise<void> {
  // Revoke public access first, even if a later cleanup operation fails.
  await beginBookDeletion(bookId);
  const parent = await getDocFromServer(doc(firestore, 'books', bookId));
  if (parent.exists() && (parent.data().hasSceneResources || parent.data().hasNarrativeResources)) {
    const request = {
      target: { kind: 'book' as const, id: bookId },
      operationId: crypto.randomUUID(),
      limit: 50,
    };
    while (!(await deleteSceneBook(request)).complete) {
      /* Server checkpoint resumes after interruption. */
    }
    return;
  }
  await deletePublicationRevisions(bookId);
  const [chapters, lore, acts] = await Promise.all([
    getDocs(collection(firestore, 'books', bookId, 'chapters')),
    getDocs(collection(firestore, 'books', bookId, 'lore')),
    getDocs(collection(firestore, 'books', bookId, 'acts')),
  ]);
  for (const snapshot of [...chapters.docs, ...lore.docs, ...acts.docs]) {
    await deleteDoc(snapshot.ref);
  }
  await finishBookDeletion(bookId);
}

export async function listChapters(
  bookId: string,
  options: { includeContent?: boolean } = {},
): Promise<Chapter[]> {
  const chaptersRef = collection(firestore, 'books', bookId, 'chapters');
  const q = query(chaptersRef, orderBy('order', 'asc'));
  const snapshot = await getDocs(q);

  const chapters = snapshot.docs.map((docSnap) => {
    const data = docSnap.data() as StoredChapterDoc;
    return {
      id: docSnap.id,
      bookId,
      ...(data.actId ? { actId: data.actId } : {}),
      ...(data.personaComplement
        ? { personaComplement: validateComplement(data.personaComplement) }
        : {}),
      title: data.title,
      order: data.order ?? 0,
      wordCount: data.wordCount ?? 0,
      content: data.content ?? '',
      ...(data.contentMode === 'scenes'
        ? {
            contentMode: 'scenes' as const,
            assemblyRevision: data.assemblyRevision,
            structureRevision: data.structureRevision,
          }
        : {}),
      ...(data.deleting ? { deleting: true } : {}),
      createdAt: data.createdAt ?? Date.now(),
      updatedAt: data.updatedAt ?? 0,
    };
  });
  const ordered = groupChapters(
    chapters.filter((chapter) => !chapter.deleting),
    await listActs(bookId),
  ).flatMap((group) => group.chapters);
  return options.includeContent === false
    ? ordered.map((chapter) =>
        chapter.contentMode === 'scenes' ? { ...chapter, content: '' } : chapter,
      )
    : Promise.all(ordered.map((chapter) => resolveChapterContent(bookId, chapter)));
}

export async function getChapter(bookId: string, chapterId: string): Promise<Chapter | null> {
  const chapterRef = doc(firestore, 'books', bookId, 'chapters', chapterId);
  const snapshot = await getDoc(chapterRef);

  if (!snapshot.exists()) return null;

  const data = snapshot.data() as StoredChapterDoc;
  if (data.deleting) return null;
  return resolveChapterContent(bookId, {
    id: snapshot.id,
    bookId,
    ...(data.actId ? { actId: data.actId } : {}),
    ...(data.personaComplement
      ? { personaComplement: validateComplement(data.personaComplement) }
      : {}),
    title: data.title,
    order: data.order ?? 0,
    wordCount: data.wordCount ?? 0,
    content: data.content ?? '',
    ...(data.contentMode === 'scenes'
      ? {
          contentMode: 'scenes' as const,
          assemblyRevision: data.assemblyRevision,
          structureRevision: data.structureRevision,
        }
      : {}),
    createdAt: data.createdAt ?? Date.now(),
    updatedAt: data.updatedAt ?? 0,
  });
}

export async function createChapter(bookId: string, input: CreateChapterInput): Promise<Chapter> {
  return createOrganizedChapter(bookId, {
    ...input,
    ...(input.personaComplement
      ? { personaComplement: validateComplement(input.personaComplement) }
      : {}),
  });
}

export async function updateChapter(
  bookId: string,
  chapterId: string,
  input: UpdateChapterInput,
): Promise<void> {
  if ('personaComplement' in input)
    input = { ...input, personaComplement: validateComplement(input.personaComplement) };
  const chapterRef = doc(firestore, 'books', bookId, 'chapters', chapterId);
  const content = input.content;
  const wordCount =
    typeof input.wordCount === 'number'
      ? input.wordCount
      : content !== undefined
        ? countWords(content)
        : undefined;

  const updateData: Partial<StoredChapterDoc> = {
    ...input,
    ...(wordCount !== undefined ? { wordCount } : {}),
    updatedAt: Date.now(),
  };

  const bookRef = doc(firestore, 'books', bookId);
  await runTransaction(firestore, async (transaction) => {
    const [book, chapter] = await Promise.all([
      transaction.get(bookRef),
      transaction.get(chapterRef),
    ]);
    if (!book.exists() || book.data().deleting || !chapter.exists())
      throw new Error('Capítulo indisponível.');
    if (
      chapter.data().contentMode === 'scenes' &&
      (content !== undefined || wordCount !== undefined)
    )
      throw new Error('Este capítulo reúne cenas. Abra a cena para alterar seu texto.');
    const now = Math.max(
      Date.now(),
      ((book.data().updatedAt as number) ?? 0) + 1,
      ((chapter.data().updatedAt as number) ?? 0) + 1,
    );
    transaction.update(chapterRef, { ...updateData, updatedAt: now });
    transaction.update(bookRef, {
      updatedAt: now,
      ...(wordCount !== undefined
        ? {
            wordCount: Math.max(
              0,
              ((book.data().wordCount as number) ?? 0) +
                wordCount -
                ((chapter.data().wordCount as number) ?? 0),
            ),
          }
        : {}),
    });
  });
}

export async function deleteChapter(
  bookId: string,
  chapterId: string,
  expectedUpdatedAt?: number,
): Promise<void> {
  const chapterRef = doc(firestore, 'books', bookId, 'chapters', chapterId);
  const snapshot = await getDocFromServer(chapterRef);
  if (snapshot.exists() && snapshot.data().contentMode === 'scenes') {
    if (expectedUpdatedAt === undefined || snapshot.data().updatedAt !== expectedUpdatedAt)
      throw new Error('O capítulo mudou. Atualize a lista e confirme a remoção novamente.');
    const request = {
      target: { kind: 'book' as const, id: bookId },
      parentId: chapterId,
      expectedUpdatedAt,
      operationId: crypto.randomUUID(),
      limit: 50,
    };
    while (!(await deleteSceneGroup(request)).complete) {
      /* Preserve scenes while detaching bounded pages. */
    }
    return;
  }
  const bookRef = doc(firestore, 'books', bookId);
  await runTransaction(firestore, async (transaction) => {
    const [book, chapter] = await Promise.all([
      transaction.get(bookRef),
      transaction.get(chapterRef),
    ]);
    if (!book.exists() || book.data().deleting || !chapter.exists())
      throw new Error('Capítulo indisponível.');
    if (
      chapter.data().contentMode === 'scenes' ||
      (expectedUpdatedAt !== undefined && (chapter.data().updatedAt ?? 0) !== expectedUpdatedAt)
    )
      throw new Error('O capítulo mudou. Atualize a lista antes de remover.');
    transaction.delete(chapterRef);
    transaction.update(bookRef, {
      wordCount: Math.max(
        0,
        ((book.data().wordCount as number) ?? 0) - ((chapter.data().wordCount as number) ?? 0),
      ),
      updatedAt: Math.max(Date.now(), ((book.data().updatedAt as number) ?? 0) + 1),
    });
  });
}

export async function reorderChapters(bookId: string, orderedChapterIds: string[]): Promise<void> {
  if (!orderedChapterIds.length) return;
  if (
    orderedChapterIds.length > MAX_CHAPTER_SELECTION ||
    new Set(orderedChapterIds).size !== orderedChapterIds.length
  )
    throw new Error('Reordene no máximo 200 capítulos por operação.');
  const bookRef = doc(firestore, 'books', bookId);
  await runTransaction(firestore, async (transaction) => {
    const book = await transaction.get(bookRef);
    const chapters = await Promise.all(
      orderedChapterIds.map((id) => transaction.get(doc(bookRef, 'chapters', id))),
    );
    if (!book.exists() || book.data().deleting || chapters.some((chapter) => !chapter.exists()))
      throw new Error('Capítulo indisponível.');
    const actId = (chapters[0]!.data()!.actId as string | null | undefined) ?? null;
    if (chapters.some((chapter) => (chapter.data()!.actId ?? null) !== actId))
      throw new Error('Reordene capítulos dentro do mesmo ato.');
    const now = Math.max(Date.now(), (book.data().updatedAt as number) + 1);
    chapters.forEach((chapter, index) =>
      transaction.update(chapter.ref, { order: index + 1, updatedAt: now }),
    );
    transaction.update(bookRef, { updatedAt: now });
  });
}

export async function recalculateBookWordCount(bookId: string): Promise<number> {
  const bookRef = doc(firestore, 'books', bookId);
  const observed = await getDocFromServer(bookRef);
  if (!observed.exists() || observed.data().deleting) throw new Error('Livro indisponível.');
  const chapters = await listChapters(bookId, { includeContent: false });
  const totalWords = chapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0);

  await runTransaction(firestore, async (transaction) => {
    const current = await transaction.get(bookRef);
    if (
      !current.exists() ||
      current.data().deleting ||
      current.data().updatedAt !== observed.data().updatedAt ||
      (current.data().sceneRevision ?? 0) !== (observed.data().sceneRevision ?? 0)
    )
      throw new Error('O livro mudou durante a contagem. Atualize antes de recalcular.');
    transaction.update(bookRef, {
      wordCount: totalWords,
      updatedAt: Math.max(Date.now(), ((current.data().updatedAt as number) ?? 0) + 1),
    });
  });

  return totalWords;
}
export function subscribeWritingBindings(
  bookId: string,
  chapterId: string | null,
  onChange: (settings: {
    personaId?: string | null;
    personaComplement?: PersonaComplement | null;
  }) => void,
  onError: (error: Error) => void,
): () => void {
  let bookReady = false;
  let chapterReady = chapterId === null;
  let failed = false;
  let personaId: string | null = null;
  let personaComplement: PersonaComplement | null = null;
  const failure = (error: Error) => {
    failed = true;
    onError(error);
  };
  const notify = () => {
    if (!failed && bookReady && chapterReady)
      onChange(chapterId ? { personaId, personaComplement } : { personaId });
  };
  const stopBook = onSnapshot(
    doc(firestore, 'books', bookId),
    (snapshot) => {
      if (!snapshot.exists()) {
        failure(new Error('Livro indisponível.'));
        return;
      }
      personaId = (snapshot.data() as StoredBookDoc).personaId ?? null;
      bookReady = true;
      notify();
    },
    failure,
  );
  const stopChapter = chapterId
    ? onSnapshot(
        doc(firestore, 'books', bookId, 'chapters', chapterId),
        (snapshot) => {
          try {
            if (!snapshot.exists()) throw new Error('Capítulo indisponível.');
            personaComplement = validateComplement(snapshot.data().personaComplement);
            chapterReady = true;
            notify();
          } catch (error) {
            failure(error instanceof Error ? error : new Error('Vínculo inválido.'));
          }
        },
        failure,
      )
    : () => undefined;
  return () => {
    stopBook();
    stopChapter();
  };
}
