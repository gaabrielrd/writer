import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { firestore } from '@/shared/lib';
import type { Book, CreateBookInput, UpdateBookInput } from '../model/book';
import {
  countWords,
  type Chapter,
  type CreateChapterInput,
  type UpdateChapterInput,
} from '../model/chapter';

interface StoredBookDoc {
  authorId: string;
  title: string;
  genre?: string;
  synopsis?: string;
  coverUrl?: string | null;
  status: 'draft' | 'published';
  wordCount: number;
  createdAt: number;
  updatedAt: number;
}

interface StoredChapterDoc {
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
      title: data.title,
      genre: data.genre ?? '',
      synopsis: data.synopsis ?? '',
      coverUrl: data.coverUrl ?? null,
      status: data.status ?? 'draft',
      wordCount: data.wordCount ?? 0,
      createdAt: data.createdAt ?? Date.now(),
      updatedAt: data.updatedAt ?? Date.now(),
    };
  });

  return books.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getBook(bookId: string): Promise<Book | null> {
  const bookRef = doc(firestore, 'books', bookId);
  const snapshot = await getDoc(bookRef);

  if (!snapshot.exists()) return null;

  const data = snapshot.data() as StoredBookDoc;
  return {
    id: snapshot.id,
    authorId: data.authorId,
    title: data.title,
    genre: data.genre ?? '',
    synopsis: data.synopsis ?? '',
    coverUrl: data.coverUrl ?? null,
    status: data.status ?? 'draft',
    wordCount: data.wordCount ?? 0,
    createdAt: data.createdAt ?? Date.now(),
    updatedAt: data.updatedAt ?? Date.now(),
  };
}

export async function createBook(authorId: string, input: CreateBookInput): Promise<Book> {
  const booksRef = collection(firestore, 'books');
  const newDocRef = doc(booksRef);
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

  await setDoc(newDocRef, newBook);
  return newBook;
}

export async function updateBook(bookId: string, input: UpdateBookInput): Promise<void> {
  const bookRef = doc(firestore, 'books', bookId);
  const dataToUpdate: Partial<StoredBookDoc> = {
    ...input,
    updatedAt: Date.now(),
  };
  await updateDoc(bookRef, dataToUpdate);
}

export async function deleteBook(bookId: string): Promise<void> {
  // Exclui capítulos do sub-nível primeiro
  const chapters = await listChapters(bookId);
  await Promise.all(chapters.map((ch) => deleteChapter(bookId, ch.id)));

  const bookRef = doc(firestore, 'books', bookId);
  await deleteDoc(bookRef);
}

export async function listChapters(bookId: string): Promise<Chapter[]> {
  const chaptersRef = collection(firestore, 'books', bookId, 'chapters');
  const q = query(chaptersRef, orderBy('order', 'asc'));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data() as StoredChapterDoc;
    return {
      id: docSnap.id,
      bookId,
      title: data.title,
      order: data.order ?? 0,
      wordCount: data.wordCount ?? 0,
      content: data.content ?? '',
      createdAt: data.createdAt ?? Date.now(),
      updatedAt: data.updatedAt ?? Date.now(),
    };
  });
}

export async function getChapter(bookId: string, chapterId: string): Promise<Chapter | null> {
  const chapterRef = doc(firestore, 'books', bookId, 'chapters', chapterId);
  const snapshot = await getDoc(chapterRef);

  if (!snapshot.exists()) return null;

  const data = snapshot.data() as StoredChapterDoc;
  return {
    id: snapshot.id,
    bookId,
    title: data.title,
    order: data.order ?? 0,
    wordCount: data.wordCount ?? 0,
    content: data.content ?? '',
    createdAt: data.createdAt ?? Date.now(),
    updatedAt: data.updatedAt ?? Date.now(),
  };
}

export async function createChapter(bookId: string, input: CreateChapterInput): Promise<Chapter> {
  const existingChapters = await listChapters(bookId);
  const nextOrder =
    typeof input.order === 'number'
      ? input.order
      : existingChapters.length > 0
        ? Math.max(...existingChapters.map((c) => c.order)) + 1
        : 1;

  const chaptersRef = collection(firestore, 'books', bookId, 'chapters');
  const newDocRef = doc(chaptersRef);
  const now = Date.now();
  const content = input.content ?? '';
  const wordCount = countWords(content);

  const newChapter: Chapter = {
    id: newDocRef.id,
    bookId,
    title: input.title.trim() || `Capítulo ${nextOrder}`,
    order: nextOrder,
    wordCount,
    content,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(newDocRef, newChapter);
  await recalculateBookWordCount(bookId);
  return newChapter;
}

export async function updateChapter(
  bookId: string,
  chapterId: string,
  input: UpdateChapterInput,
): Promise<void> {
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

  await updateDoc(chapterRef, updateData);

  if (wordCount !== undefined) {
    await recalculateBookWordCount(bookId);
  }
}

export async function deleteChapter(bookId: string, chapterId: string): Promise<void> {
  const chapterRef = doc(firestore, 'books', bookId, 'chapters', chapterId);
  await deleteDoc(chapterRef);
  await recalculateBookWordCount(bookId);
}

export async function reorderChapters(bookId: string, orderedChapterIds: string[]): Promise<void> {
  await Promise.all(
    orderedChapterIds.map((chapterId, index) => {
      const chapterRef = doc(firestore, 'books', bookId, 'chapters', chapterId);
      return updateDoc(chapterRef, { order: index + 1, updatedAt: Date.now() });
    }),
  );
}

export async function recalculateBookWordCount(bookId: string): Promise<number> {
  const chapters = await listChapters(bookId);
  const totalWords = chapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0);

  const bookRef = doc(firestore, 'books', bookId);
  await updateDoc(bookRef, { wordCount: totalWords, updatedAt: Date.now() });

  return totalWords;
}
