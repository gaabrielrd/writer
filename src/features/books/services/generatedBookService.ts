import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/shared/lib';
import type { Book, CreateBookInput, UpdateBookInput } from '../model/book';

export async function createBookWithGeneratedCover(input: CreateBookInput): Promise<Book> {
  try {
    const callable = httpsCallable<CreateBookInput, Book>(
      getFunctions(getFirebaseApp(), 'us-central1'),
      'createBookWithCover',
    );
    return (await callable(input)).data;
  } catch (error) {
    throw new Error(
      'Não foi possível salvar o livro com a capa. Seus dados foram mantidos; tente novamente.',
      { cause: error },
    );
  }
}

export async function saveBookLibraryCover(bookId: string, input: UpdateBookInput): Promise<void> {
  try {
    await httpsCallable(
      getFunctions(getFirebaseApp(), 'us-central1'),
      'saveBookImage',
    )({ ...input, bookId });
  } catch (error) {
    throw new Error('Não foi possível salvar a capa. Seus dados foram mantidos; tente novamente.', {
      cause: error,
    });
  }
}
