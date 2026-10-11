import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAct,
  createOrganizedChapter,
  deleteChapters,
  listActs,
  moveChaptersToAct,
} from '../services/chapterOrganizationService';
import type { Chapter } from '../model/chapter';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  query: vi.fn(),
  read: vi.fn(),
  set: vi.fn(),
  update: vi.fn<(ref: { path: string }, data: Record<string, unknown>) => void>(),
  remove: vi.fn(),
}));
vi.mock('@/shared/lib', () => ({ firestore: {} }));
vi.mock('firebase/firestore', () => {
  const ref = (parent: { path?: string }, segments: string[]) => ({
    path: [parent.path, ...segments].filter(Boolean).join('/'),
  });
  return {
    doc: (parent: { path?: string }, ...segments: string[]) => ({
      ...ref(parent, segments.length ? segments : ['new']),
      id: segments.at(-1) ?? 'new',
    }),
    collection: (parent: { path?: string }, ...segments: string[]) => ref(parent, segments),
    getDocFromServer: mocks.get,
    getDocsFromServer: mocks.query,
    runTransaction: async (_db: unknown, callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        get: mocks.read,
        set: mocks.set,
        update: mocks.update,
        delete: mocks.remove,
      }),
  };
});
const chapter: Chapter = {
  id: 'one',
  bookId: 'book',
  title: 'Primeiro',
  order: 1,
  content: 'texto preservado',
  wordCount: 2,
  createdAt: 1,
  updatedAt: 10,
};
const act = { id: 'act', name: null, order: 1, createdAt: 1, updatedAt: 1 };
let storedBook: Record<string, unknown>;
let stored: Chapter[];
function snapshot(data: object | undefined, path: string) {
  return {
    id: path.split('/').at(-1),
    ref: { path },
    exists: () => Boolean(data),
    data: () => data,
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  storedBook = { updatedAt: 10, wordCount: 8 };
  stored = [chapter];
  mocks.get.mockImplementation((ref: { path: string }) =>
    Promise.resolve(snapshot(storedBook, ref.path)),
  );
  mocks.read.mockImplementation((ref: { path: string }) => {
    const value = ref.path.endsWith('/book')
      ? storedBook
      : ref.path.includes('/acts/')
        ? ref.path.endsWith('/act')
          ? act
          : undefined
        : stored.find((item) => ref.path.endsWith('/' + item.id));
    return Promise.resolve(snapshot(value, ref.path));
  });
  mocks.query.mockImplementation((ref: { path: string }) =>
    Promise.resolve({
      docs: (ref.path.endsWith('/acts') ? [act] : stored).map((item) =>
        snapshot(item, ref.path + '/' + item.id),
      ),
    }),
  );
});
describe('persistência de atos e ações em lote', () => {
  it('cria ato vazio ou nomeado e aloca posições pela transação do livro', async () => {
    expect(await createAct('book', '  ')).toMatchObject({ name: null, order: 1 });
    storedBook.actCount = 1;
    expect(await createAct('book', ' Virada ')).toMatchObject({ name: 'Virada', order: 2 });
    expect(mocks.set).toHaveBeenCalledTimes(2);
    expect(mocks.update).toHaveBeenLastCalledWith(
      { path: 'books/book', id: 'book' },
      expect.objectContaining({ actCount: 2 }),
    );
  });
  it('recusa nomes extensos, contadores inválidos e livros em exclusão', async () => {
    await expect(createAct('book', 'a'.repeat(301))).rejects.toThrow('300');
    storedBook.actCount = 3999;
    await expect(createAct('book', '')).rejects.toThrow('3999');
    storedBook.deleting = true;
    await expect(createAct('book', '')).rejects.toThrow('indisponível');
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it('lê atos ordenados e recusa documentos malformados', async () => {
    expect(await listActs('book')).toEqual([act]);
    mocks.query.mockResolvedValue({ docs: [snapshot({ ...act, order: 0 }, 'acts/a')] });
    await expect(listActs('book')).rejects.toThrow('inválido');
  });
  it('cria capítulo no final do grupo e atualiza o total junto com a criação', async () => {
    const created = await createOrganizedChapter('book', {
      title: ' Segundo ',
      actId: 'act',
      content: 'duas palavras',
    });
    expect(created).toMatchObject({ actId: 'act', order: 1, title: 'Segundo', wordCount: 2 });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ wordCount: 10 }),
    );
    await expect(createOrganizedChapter('book', { title: 'X', actId: 'other' })).rejects.toThrow(
      'não pertence',
    );
    await expect(createOrganizedChapter('book', { title: 'X', order: -1 })).rejects.toThrow(
      'Ordem',
    );
  });
  it('move na sequência de leitura, preserva conteúdo e não move quem já está no destino', async () => {
    const later = { ...chapter, id: 'two', order: 2 };
    const destination = { ...chapter, id: 'existing', order: 5, actId: 'act' };
    stored = [chapter, later, destination];
    await moveChaptersToAct('book', [later, destination, chapter], 'act');
    const writes = mocks.update.mock.calls.filter((call) => call[0].path.includes('/chapters/'));
    expect(writes.map((call) => [call[0].path, call[1].order])).toEqual([
      ['books/book/chapters/one', 6],
      ['books/book/chapters/two', 7],
    ]);
    expect(writes.every((call) => !('content' in call[1]))).toBe(true);
    mocks.update.mockClear();
    await moveChaptersToAct('book', [destination], 'act');
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('remove vínculo ao mover para Sem ato e mantém contagens', async () => {
    stored = [{ ...chapter, actId: 'act' }];
    await moveChaptersToAct('book', stored, null);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'books/book/chapters/one' }),
      expect.objectContaining({ actId: null }),
    );
    expect(mocks.update.mock.calls.every((call) => !('wordCount' in call[1]))).toBe(true);
  });
  it('exclui seleção inteira e debita palavras na mesma transação', async () => {
    await deleteChapters('book', [chapter]);
    expect(mocks.remove).toHaveBeenCalledWith({ path: 'books/book/chapters/one' });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ wordCount: 6 }),
    );
  });
  it('recusa seleções vazias, duplicadas, entre livros e acima do limite antes de escrever', async () => {
    for (const selection of [
      [],
      [chapter, chapter],
      [{ ...chapter, bookId: 'other' }],
      Array.from({ length: 201 }, (_, index) => ({ ...chapter, id: String(index) })),
    ]) {
      await expect(deleteChapters('book', selection)).rejects.toThrow();
      await expect(moveChaptersToAct('book', selection, null)).rejects.toThrow();
    }
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('recusa exclusão e movimento sobre capítulos alterados ou removidos sem aplicar parte do lote', async () => {
    stored = [{ ...chapter, updatedAt: 11 }];
    await expect(deleteChapters('book', [chapter])).rejects.toThrow('mudou');
    await expect(moveChaptersToAct('book', [chapter], 'act')).rejects.toThrow('mudou');
    stored = [];
    await expect(deleteChapters('book', [chapter])).rejects.toThrow('mudou');
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('recusa alterações concorrentes no livro e ato de outro livro', async () => {
    mocks.get.mockResolvedValue(snapshot({ ...storedBook, updatedAt: 9 }, 'books/book'));
    await expect(moveChaptersToAct('book', [chapter], 'act')).rejects.toThrow('livro mudou');
    await expect(moveChaptersToAct('book', [chapter], 'other')).rejects.toThrow('não pertence');
    await expect(createOrganizedChapter('book', { title: 'X' })).rejects.toThrow('livro mudou');
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

it('preserva a persona complementar ao criar capítulo dentro de um ato', async () => {
  const personaComplement = {
    personaId: 'preset-unsettling',
    overrides: [{ traitId: 'tension', value: 0 }],
  };
  const created = await createOrganizedChapter('book', {
    title: 'Cena',
    actId: 'act',
    personaComplement,
  });
  expect(created).toMatchObject({ actId: 'act', personaComplement });
  expect(mocks.set).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      actId: 'act',
      personaComplement,
    }),
  );
});
