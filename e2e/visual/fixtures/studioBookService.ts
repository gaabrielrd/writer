import type {
  StudioBookListInput,
  StudioBookPage,
  StudioBooksPreparation,
} from '../../../src/features/books/services/studioBookService';
import { FIXTURE_LIBRARY_STATE_KEY } from './data';
import { fixtureStudioBooks, fixtureWriteBook } from './bookService';
import { fixtureEditorialState, fixtureOwner, fixtureStudioPage } from './studioStore';

if (sessionStorage.getItem('writer.visual.studio-editorial-scenario') === 'true') {
  const [first, second] = fixtureStudioBooks(fixtureOwner());
  if (first) fixtureWriteBook(first.id, { editorialState: 'review' });
  if (second) fixtureWriteBook(second.id, { editorialState: 'ready' });
}

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
  const page = fixtureStudioPage('book', items, input);
  return Promise.resolve({
    items: page.items.map((book) => ({
      id: book.id,
      kind: 'book',
      title: book.title,
      status: book.status,
      revision: 1,
      universeId: book.universeId ?? null,
      coverUrl: book.coverUrl ?? null,
      wordCount: book.wordCount,
      editorialState: fixtureEditorialState('book', book),
      genre: book.genre,
      synopsis: book.synopsis,
      createdAt: book.createdAt,
      updatedAt: book.updatedAt,
    })),
    nextCursor: page.nextCursor,
  });
}
