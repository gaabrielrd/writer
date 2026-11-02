import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/shared/lib';
import type { Book, BookStatus } from '../model/book';

export type StudioBookSummary = Pick<
  Book,
  | 'id'
  | 'title'
  | 'status'
  | 'wordCount'
  | 'createdAt'
  | 'updatedAt'
  | 'genre'
  | 'synopsis'
  | 'editorialState'
> & {
  kind: 'book';
  revision: number;
  universeId: string | null;
  coverUrl: string | null;
};
export interface StudioBookPage {
  items: StudioBookSummary[];
  nextCursor: string | null;
}
export interface StudioBooksPreparation {
  complete: boolean;
  processed: number;
}
export interface StudioBookListInput {
  status?: 'all' | BookStatus;
  editorialState?: 'all' | NonNullable<Book['editorialState']>;
  cursor?: string | null;
  limit?: number;
}

async function call<T>(name: string, data: unknown): Promise<T> {
  try {
    return (
      await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), name)(data)
    ).data;
  } catch (cause) {
    const code =
      typeof cause === 'object' && cause !== null && 'code' in cause ? String(cause.code) : '';
    if (
      ['internal', 'unavailable', 'deadline-exceeded', 'cancelled'].includes(
        code.replace(/^functions\//, ''),
      )
    ) {
      throw Object.assign(
        new Error('Não foi possível confirmar esta operação. Tente novamente.', { cause }),
        { code },
      );
    }
    if (cause instanceof Error) throw cause;
    throw new Error('Não foi possível acessar seus livros. Tente novamente.', { cause });
  }
}
export function prepareStudioBooks(
  input: { limit?: number } = {},
): Promise<StudioBooksPreparation> {
  return call('prepareStudioBooks', input);
}
export function listStudioBooks(input: StudioBookListInput = {}): Promise<StudioBookPage> {
  return call('listStudioProjects', { ...input, kind: 'book' });
}
