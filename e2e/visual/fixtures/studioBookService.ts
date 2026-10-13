import type {
  StudioBookListInput,
  StudioBookPage,
  StudioBooksPreparation,
} from '../../../src/features/books/services/studioBookService';
import { FIXTURE_LIBRARY_STATE_KEY } from './data';
import { fixtureStudioBooks } from './bookService';
import { fixtureOwner } from './studioStore';

let preparationCalls = 0;
export async function prepareStudioBooks(): Promise<StudioBooksPreparation> {
  if (sessionStorage.getItem(FIXTURE_LIBRARY_STATE_KEY) === 'error') {
    throw new Error('Falha simulada de conexão. Tente novamente.');
  }
  preparationCalls += 1;
  if (sessionStorage.getItem('writer.visual.studio-hold-preparation') === 'true') {
    await new Promise<void>((resolve) =>
      window.addEventListener('writer.visual.release-preparation', () => resolve(), { once: true }),
    );
  }
  return { complete: true, processed: fixtureStudioBooks(fixtureOwner()).length };
}

export function listStudioBooks(input: StudioBookListInput = {}): Promise<StudioBookPage> {
  if (preparationCalls === 0)
    return Promise.reject(new Error('Prepare os livros antes da listagem.'));
  if (sessionStorage.getItem(FIXTURE_LIBRARY_STATE_KEY) === 'error') {
    return Promise.reject(new Error('Falha simulada de conexão. Tente novamente.'));
  }
  const items = fixtureStudioBooks(fixtureOwner())
    .filter((book) => !input.status || input.status === 'all' || book.status === input.status)
    .sort((left, right) => right.updatedAt - left.updatedAt || right.id.localeCompare(left.id));
  const offset = Number(input.cursor ?? 0);
  const limit = input.limit ?? 25;
  return Promise.resolve({
    items: items.slice(offset, offset + limit).map((book) => ({
      id: book.id,
      kind: 'book',
      title: book.title,
      status: book.status,
      revision: 1,
      universeId: book.universeId ?? null,
      coverUrl: book.coverUrl ?? null,
      wordCount: book.wordCount,
      genre: book.genre,
      synopsis: book.synopsis,
      createdAt: book.createdAt,
      updatedAt: book.updatedAt,
    })),
    nextCursor: offset + limit < items.length ? String(offset + limit) : null,
  });
}
