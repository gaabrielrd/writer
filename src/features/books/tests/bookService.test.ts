import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as firestoreModule from 'firebase/firestore';
import { deleteSceneBook, deleteSceneGroup } from '@/features/scenes';
import {
  beginBookDeletion,
  finishBookDeletion,
  deletePublicationRevisions,
  unpublishBook,
} from '../services/publicationService';

vi.mock('@/shared/lib', () => ({ firestore: {} }));
vi.mock('@/features/scenes', () => ({ deleteSceneBook: vi.fn(), deleteSceneGroup: vi.fn() }));

vi.mock('../services/publicationService', () => ({
  unpublishBook: vi.fn(),
  beginBookDeletion: vi.fn(),
  finishBookDeletion: vi.fn(),
  deletePublicationRevisions: vi.fn(),
}));
import {
  listBooksByAuthor,
  getBook,
  createBook,
  updateBook,
  deleteBook,
  listChapters,
  getChapter,
  createChapter,
  updateChapter,
  deleteChapter,
  reorderChapters,
  recalculateBookWordCount,
  subscribeWritingBindings,
} from '../services/bookService';
import * as generatedService from '../services/generatedBookService';
import type { Book } from '../model/book';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...pathSegments: string[]) => ({ pathSegments })),
  doc: vi.fn((_db: unknown, ...pathSegments: string[]) => ({
    id: pathSegments[pathSegments.length - 1] || 'mock-id-123',
    pathSegments,
  })),
  getDoc: vi.fn(),
  getDocFromServer: vi.fn(),
  getDocsFromServer: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn((coll: unknown) => coll),
  where: vi.fn(),
  orderBy: vi.fn(),
  getFirestore: vi.fn(() => ({})),
  runTransaction: vi.fn(),
  onSnapshot: vi.fn(),
}));

it('observa vínculos sem sobrescrever prosa e libera as duas assinaturas ao sair', () => {
  const callbacks: ((snapshot: unknown) => void)[] = [];
  const stop = vi.fn();
  vi.mocked(firestoreModule.onSnapshot).mockImplementation((_reference, callback) => {
    callbacks.push(callback as unknown as (snapshot: unknown) => void);
    return stop;
  });
  const changed = vi.fn();
  const failed = vi.fn();
  const unsubscribe = subscribeWritingBindings('book', 'chapter', changed, failed);
  callbacks[0]!({
    exists: () => true,
    data: () => ({
      personaId: 'preset-incisive',
      title: 'Livro',
      content: 'Não deve ser propagado',
    }),
  });
  callbacks[1]!({
    exists: () => true,
    data: () => ({
      personaComplement: {
        personaId: 'preset-unsettling',
        overrides: [{ traitId: 'tension', value: 0 }],
      },
      content: 'Outra prosa',
    }),
  });
  expect(changed).toHaveBeenLastCalledWith({
    personaId: 'preset-incisive',
    personaComplement: {
      personaId: 'preset-unsettling',
      overrides: [{ traitId: 'tension', value: 0 }],
    },
  });
  callbacks[1]!({
    exists: () => true,
    data: () => ({
      personaComplement: {
        personaId: 'preset-incisive',
        overrides: [{ traitId: 'tension', value: 101 }],
      },
    }),
  });
  expect(failed).toHaveBeenCalledWith(expect.any(Error));
  unsubscribe();
  expect(stop).toHaveBeenCalledTimes(2);
});

it('observa somente o livro e relata remoções remotas sem fabricar configuração', () => {
  const callbacks: ((snapshot: unknown) => void)[] = [];
  vi.mocked(firestoreModule.onSnapshot).mockImplementation((_reference, callback) => {
    callbacks.push(callback as unknown as (snapshot: unknown) => void);
    return vi.fn();
  });
  const changed = vi.fn();
  const failed = vi.fn();
  const stop = subscribeWritingBindings('book', null, changed, failed);
  callbacks[0]!({ exists: () => true, data: () => ({}) });
  expect(changed).toHaveBeenCalledWith({ personaId: null });
  callbacks[0]!({ exists: () => false });
  expect(failed).toHaveBeenCalledWith(expect.objectContaining({ message: 'Livro indisponível.' }));
  stop();
});

describe('bookService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const storedBook = { updatedAt: 100, wordCount: 0 };
    vi.mocked(firestoreModule.getDocFromServer).mockResolvedValue({
      exists: () => true,
      data: () => storedBook,
    } as unknown as firestoreModule.DocumentSnapshot);
    vi.mocked(firestoreModule.getDocsFromServer).mockResolvedValue({
      docs: [],
    } as unknown as firestoreModule.QuerySnapshot);
    vi.mocked(firestoreModule.runTransaction).mockImplementation(async (_db, callback) =>
      callback({
        get: (ref: { pathSegments?: string[] }) =>
          Promise.resolve({
            exists: () => true,
            data: () => (ref.pathSegments?.includes('chapters') ? { wordCount: 0 } : storedBook),
            ref,
          }),
        set: firestoreModule.setDoc,
        update: firestoreModule.updateDoc,
        delete: firestoreModule.deleteDoc,
      } as unknown as firestoreModule.Transaction),
    );
  });

  it.each([{ hasSceneResources: true }, { hasNarrativeResources: true }])(
    'livro com recursos %j revoga acesso e limpa no servidor com o mesmo pedido em todas as páginas',
    async (resources) => {
      vi.mocked(firestoreModule.getDocFromServer).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ ...resources, deleting: true }),
      } as unknown as firestoreModule.DocumentSnapshot);
      vi.mocked(deleteSceneBook)
        .mockResolvedValueOnce({ complete: false, processed: 50 })
        .mockResolvedValueOnce({ complete: true, processed: 51 });
      await deleteBook('book-scenes');
      expect(beginBookDeletion).toHaveBeenCalledWith('book-scenes');
      expect(deleteSceneBook).toHaveBeenCalledTimes(2);
      expect(vi.mocked(deleteSceneBook).mock.calls[1]?.[0]).toEqual(
        vi.mocked(deleteSceneBook).mock.calls[0]?.[0],
      );
      expect(vi.mocked(beginBookDeletion).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(deleteSceneBook).mock.invocationCallOrder[0]!,
      );
      expect(deletePublicationRevisions).not.toHaveBeenCalled();
      expect(finishBookDeletion).not.toHaveBeenCalled();
      expect(firestoreModule.deleteDoc).not.toHaveBeenCalled();
    },
  );
  it('falha de limpeza das cenas não executa finish legado nem apaga capítulos por cliente', async () => {
    vi.mocked(firestoreModule.getDocFromServer).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ hasSceneResources: true }),
    } as unknown as firestoreModule.DocumentSnapshot);
    vi.mocked(deleteSceneBook).mockRejectedValueOnce(new Error('Retome a limpeza'));
    await expect(deleteBook('book-scenes')).rejects.toThrow(/Retome/);
    expect(finishBookDeletion).not.toHaveBeenCalled();
    expect(firestoreModule.deleteDoc).not.toHaveBeenCalled();
  });
  it('excluir agrupador composto desvincula por servidor sem apagar suas cenas', async () => {
    vi.mocked(firestoreModule.getDocFromServer).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ contentMode: 'scenes', updatedAt: 42 }),
    } as unknown as firestoreModule.DocumentSnapshot);
    vi.mocked(deleteSceneGroup)
      .mockResolvedValueOnce({ complete: false, processed: 50 })
      .mockResolvedValueOnce({ complete: true, processed: 52 });
    await deleteChapter('book', 'chapter', 42);
    expect(deleteSceneGroup).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 'chapter', expectedUpdatedAt: 42 }),
    );
    expect(vi.mocked(deleteSceneGroup).mock.calls[1]?.[0]).toEqual(
      vi.mocked(deleteSceneGroup).mock.calls[0]?.[0],
    );
    expect(firestoreModule.deleteDoc).not.toHaveBeenCalled();
  });
  it('lista de planejamento não carrega prosa congelada de capítulos compostos', async () => {
    vi.mocked(firestoreModule.getDocs).mockResolvedValueOnce({
      docs: [
        {
          id: 'chapter',
          data: () => ({
            title: 'Capítulo',
            order: 1,
            contentMode: 'scenes',
            assemblyRevision: 3,
            content: 'Fonte privada',
            createdAt: 1,
            updatedAt: 2,
          }),
        },
      ],
    } as unknown as firestoreModule.QuerySnapshot);
    const result = await listChapters('book', { includeContent: false });
    expect(result[0]).toMatchObject({ contentMode: 'scenes', assemblyRevision: 3, content: '' });
  });
  it.each([undefined, 41])(
    'remoção de capítulo composto exige a versão observada, sem adotar a atual (%s)',
    async (expectedUpdatedAt) => {
      vi.mocked(firestoreModule.getDocFromServer).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ contentMode: 'scenes', updatedAt: 42 }),
      } as unknown as firestoreModule.DocumentSnapshot);
      await expect(deleteChapter('book', 'chapter', expectedUpdatedAt)).rejects.toThrow(
        /confirm.*novamente/,
      );
      expect(deleteSceneGroup).not.toHaveBeenCalled();
      expect(firestoreModule.deleteDoc).not.toHaveBeenCalled();
    },
  );
  it('remoção legada aplica delta à contagem atual, preservando edição concorrente de cena', async () => {
    vi.mocked(firestoreModule.runTransaction).mockImplementationOnce(async (_db, callback) =>
      callback({
        get: (ref: { pathSegments: string[] }) =>
          Promise.resolve({
            exists: () => true,
            data: () =>
              ref.pathSegments.includes('chapters')
                ? { wordCount: 4, updatedAt: 42 }
                : { wordCount: 20, sceneRevision: 9, updatedAt: 50 },
          }),
        delete: firestoreModule.deleteDoc,
        update: firestoreModule.updateDoc,
      } as unknown as firestoreModule.Transaction),
    );
    await deleteChapter('book', 'legacy', 42);
    expect(firestoreModule.updateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ wordCount: 16 }),
    );
    expect(firestoreModule.getDocs).not.toHaveBeenCalled();
  });
  it('recálculo recusa captura antiga sem sobrescrever a contagem das cenas', async () => {
    vi.mocked(firestoreModule.getDocs).mockResolvedValueOnce({
      docs: [],
    } as unknown as firestoreModule.QuerySnapshot);
    vi.mocked(firestoreModule.runTransaction).mockImplementationOnce(async (_db, callback) =>
      callback({
        get: () =>
          Promise.resolve({
            exists: () => true,
            data: () => ({ updatedAt: 101, sceneRevision: 1, wordCount: 20 }),
          }),
        update: firestoreModule.updateDoc,
      } as unknown as firestoreModule.Transaction),
    );
    await expect(recalculateBookWordCount('book')).rejects.toThrow(/mudou durante/);
    expect(firestoreModule.updateDoc).not.toHaveBeenCalled();
  });
  it('versão ausente no capítulo legado é estável e não cria gravação durante a leitura', async () => {
    vi.mocked(firestoreModule.getDoc).mockResolvedValueOnce({
      id: 'chapter',
      exists: () => true,
      data: () => ({ title: 'Legado', content: 'Prosa', order: 1 }),
    } as unknown as firestoreModule.DocumentSnapshot);
    expect((await getChapter('book', 'chapter'))?.updatedAt).toBe(0);
    expect(firestoreModule.updateDoc).not.toHaveBeenCalled();
    expect(firestoreModule.setDoc).not.toHaveBeenCalled();
  });
  it('escritor legado não salva prosa em capítulo convertido mesmo após corrida de leitura', async () => {
    vi.mocked(firestoreModule.runTransaction).mockImplementationOnce(async (_db, callback) =>
      callback({
        get: (ref: { pathSegments: string[] }) =>
          Promise.resolve({
            exists: () => true,
            data: () =>
              ref.pathSegments.includes('chapters')
                ? { contentMode: 'scenes', updatedAt: 2 }
                : { updatedAt: 2 },
          }),
        update: firestoreModule.updateDoc,
      } as unknown as firestoreModule.Transaction),
    );
    await expect(
      updateChapter('book', 'chapter', { content: 'Sobrescrita legada' }),
    ).rejects.toThrow(/reúne cenas/);
    expect(firestoreModule.updateDoc).not.toHaveBeenCalled();
  });

  describe('Books CRUD', () => {
    it('reuses a stable ID after a manual creation was already saved', async () => {
      const stored = { id: 'book-0000000000001', authorId: 'author-123', title: 'Atlas' };
      vi.mocked(firestoreModule.runTransaction).mockImplementationOnce(async (_db, callback) =>
        callback({
          get: () => Promise.resolve({ exists: () => true, data: () => stored }),
        } as unknown as firestoreModule.Transaction),
      );
      expect(await createBook('author-123', { title: 'Atlas', creationId: stored.id })).toEqual(
        stored,
      );
      expect(firestoreModule.setDoc).not.toHaveBeenCalled();
    });
    it('creates a manual draft atomically when its ID is absent', async () => {
      const set = vi.fn();
      vi.mocked(firestoreModule.runTransaction).mockImplementationOnce(async (_db, callback) =>
        callback({
          get: () => Promise.resolve({ exists: () => false }),
          set,
        } as unknown as firestoreModule.Transaction),
      );
      const book = await createBook('author-123', {
        title: 'Atlas',
        creationId: 'book-0000000000001',
      });
      expect(set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: book.id, status: 'draft' }),
      );
    });
    it('routes generated covers to the backend rather than writing unverified URLs', async () => {
      const input = { title: 'Atlas', coverGenerationId: 'cover-1' };
      const saved = { id: 'book-1' } as Book;
      vi.spyOn(generatedService, 'createBookWithGeneratedCover').mockResolvedValueOnce(saved);
      expect(await createBook('author-123', input)).toEqual(saved);
    });
    it('lista livros por autor mapeando campos corretamente', async () => {
      vi.mocked(firestoreModule.getDocs).mockResolvedValueOnce({
        docs: [
          {
            id: 'book-1',
            data: () => ({
              authorId: 'author-123',
              title: 'Livro Teste',
              genre: 'Fantasia',
              synopsis: 'Sinopse legal',
              coverUrl: null,
              status: 'draft',
              wordCount: 1500,
              createdAt: 1000,
              updatedAt: 2000,
            }),
          },
        ],
      } as unknown as firestoreModule.QuerySnapshot);

      const books = await listBooksByAuthor('author-123');

      expect(books).toHaveLength(1);
      expect(books[0]?.id).toBe('book-1');
      expect(books[0]?.title).toBe('Livro Teste');
      expect(books[0]?.wordCount).toBe(1500);
    });

    it('recupera um livro por ID existente', async () => {
      vi.mocked(firestoreModule.getDoc).mockResolvedValueOnce({
        id: 'book-99',
        exists: () => true,
        data: () => ({
          authorId: 'author-123',
          title: 'Livro Único',
          genre: 'Sci-Fi',
          synopsis: 'Espaço sideral',
          coverUrl: 'https://exemplo.com/capa.jpg',
          status: 'published',
          wordCount: 3200,
          createdAt: 1000,
          updatedAt: 2000,
        }),
      } as unknown as firestoreModule.DocumentSnapshot);

      const book = await getBook('book-99');
      expect(book).not.toBeNull();
      expect(book?.title).toBe('Livro Único');
      expect(book?.status).toBe('published');
    });

    it('retorna null ao buscar livro inexistente', async () => {
      vi.mocked(firestoreModule.getDoc).mockResolvedValueOnce({
        exists: () => false,
      } as unknown as firestoreModule.DocumentSnapshot);

      const book = await getBook('inexistente');
      expect(book).toBeNull();
    });

    it('preserva marcadores e revisão narrativa na leitura e listagem de livros', async () => {
      const stored = {
        authorId: 'author',
        title: 'Com narrativa',
        wordCount: 0,
        hasNarrativeResources: true,
        narrativeRevision: 7,
        createdAt: 100,
        updatedAt: 200,
      };
      const snapshot = { id: 'book-narrative', exists: () => true, data: () => stored };
      vi.mocked(firestoreModule.getDoc).mockResolvedValueOnce(
        snapshot as unknown as firestoreModule.DocumentSnapshot,
      );
      vi.mocked(firestoreModule.getDocs).mockResolvedValueOnce({
        docs: [snapshot],
      } as unknown as firestoreModule.QuerySnapshot);
      expect(await getBook('book-narrative')).toMatchObject({
        hasNarrativeResources: true,
        narrativeRevision: 7,
      });
      expect(await listBooksByAuthor('author')).toEqual([
        expect.objectContaining({ hasNarrativeResources: true, narrativeRevision: 7 }),
      ]);
      expect(firestoreModule.updateDoc).not.toHaveBeenCalled();
    });

    it('cria novo livro no Firestore com status draft e wordCount zero', async () => {
      const newBook = await createBook('author-123', {
        title: 'O Nome do Vento',
        genre: 'Fantasia',
        synopsis: 'História de Kvothe',
      });

      expect(newBook.authorId).toBe('author-123');
      expect(newBook.title).toBe('O Nome do Vento');
      expect(newBook.status).toBe('draft');
      expect(newBook.wordCount).toBe(0);
      expect(firestoreModule.setDoc).toHaveBeenCalledTimes(1);
    });

    it('atualiza livro no Firestore', async () => {
      await updateBook('book-1', { title: 'Novo Título' });

      expect(firestoreModule.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ title: 'Novo Título' }),
      );
    });

    it('impede publicação pelo antigo campo de status', async () => {
      await expect(updateBook('book-1', { status: 'published' })).rejects.toThrow('publicação');
      expect(firestoreModule.updateDoc).not.toHaveBeenCalled();
    });

    it('retira a publicação antes de mudar para rascunho', async () => {
      await updateBook('book-1', { status: 'draft' });
      expect(unpublishBook).toHaveBeenCalledWith('book-1');
      expect(firestoreModule.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'draft' }),
      );
    });

    it('não apaga originais se falhar a revogação pública', async () => {
      vi.mocked(beginBookDeletion).mockRejectedValueOnce(new Error('offline'));
      await expect(deleteBook('book-1')).rejects.toThrow('offline');
      expect(firestoreModule.deleteDoc).not.toHaveBeenCalled();
      expect(deletePublicationRevisions).not.toHaveBeenCalled();
    });

    it('exclui livro, lore e todos os seus capitulos associados', async () => {
      vi.mocked(firestoreModule.getDocs).mockResolvedValue({
        docs: [
          {
            id: 'ch-1',
            data: () => ({ title: 'Cap 1', order: 1, wordCount: 100 }),
          },
        ],
      } as unknown as firestoreModule.QuerySnapshot);

      vi.mocked(firestoreModule.getDocs).mockResolvedValueOnce({
        docs: [],
      } as unknown as firestoreModule.QuerySnapshot);
      await deleteBook('book-1');

      expect(beginBookDeletion).toHaveBeenCalledWith('book-1');
      expect(deletePublicationRevisions).toHaveBeenCalledWith('book-1');
      expect(firestoreModule.deleteDoc).toHaveBeenCalledTimes(2); // capítulo e lore
      expect(finishBookDeletion).toHaveBeenCalledWith('book-1');
      expect(vi.mocked(beginBookDeletion).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(firestoreModule.deleteDoc).mock.invocationCallOrder[0]!,
      );
    });
  });

  describe('Chapters CRUD', () => {
    it('lista capitulos ordenados', async () => {
      vi.mocked(firestoreModule.getDocs).mockResolvedValueOnce({
        docs: [
          {
            id: 'ch-1',
            data: () => ({ title: 'Capítulo 1', order: 1, wordCount: 450, content: 'Texto' }),
          },
        ],
      } as unknown as firestoreModule.QuerySnapshot);

      const chapters = await listChapters('book-1');
      expect(chapters).toHaveLength(1);
      expect(chapters[0]?.title).toBe('Capítulo 1');
      expect(chapters[0]?.wordCount).toBe(450);
    });

    it('busca capitulo individual por id', async () => {
      vi.mocked(firestoreModule.getDoc).mockResolvedValueOnce({
        id: 'ch-1',
        exists: () => true,
        data: () => ({ title: 'Prólogo', order: 1, wordCount: 300, content: 'Era uma vez' }),
      } as unknown as firestoreModule.DocumentSnapshot);

      const chapter = await getChapter('book-1', 'ch-1');
      expect(chapter).not.toBeNull();
      expect(chapter?.title).toBe('Prólogo');
    });

    it('cria novo capitulo calculando contagem de palavras e atualizando o livro', async () => {
      // getDocs para listChapters antes de criar
      vi.mocked(firestoreModule.getDocs)
        .mockResolvedValueOnce({ docs: [] } as unknown as firestoreModule.QuerySnapshot)
        // getDocs para recalculateBookWordCount
        .mockResolvedValueOnce({
          docs: [
            {
              id: 'ch-1',
              data: () => ({ wordCount: 4 }),
            },
          ],
        } as unknown as firestoreModule.QuerySnapshot);

      const chapter = await createChapter('book-1', {
        title: 'Capítulo 1',
        content: 'Um dois três quatro',
      });

      expect(chapter.title).toBe('Capítulo 1');
      expect(chapter.wordCount).toBe(4);
      expect(chapter.order).toBe(1);
      expect(firestoreModule.setDoc).toHaveBeenCalledTimes(1);
      expect(firestoreModule.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ wordCount: 4 }),
      );
    });

    it('atualiza capitulo e recalcula palavras do livro', async () => {
      vi.mocked(firestoreModule.getDocs).mockResolvedValueOnce({
        docs: [
          {
            id: 'ch-1',
            data: () => ({ wordCount: 2 }),
          },
        ],
      } as unknown as firestoreModule.QuerySnapshot);

      await updateChapter('book-1', 'ch-1', { content: 'Novo conteúdo' });

      expect(firestoreModule.updateDoc).toHaveBeenCalledTimes(2); // updateDoc chapter + updateDoc book wordCount
    });

    it('exclui capitulo e recalcula palavras', async () => {
      vi.mocked(firestoreModule.getDocs).mockResolvedValueOnce({
        docs: [],
      } as unknown as firestoreModule.QuerySnapshot);

      await deleteChapter('book-1', 'ch-1');

      expect(firestoreModule.deleteDoc).toHaveBeenCalledTimes(1);
      expect(firestoreModule.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ wordCount: 0 }),
      );
    });

    it('reordena lista de capitulos', async () => {
      await reorderChapters('book-1', ['ch-2', 'ch-1']);

      expect(firestoreModule.updateDoc).toHaveBeenCalledTimes(3);
      expect(firestoreModule.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ order: 1 }),
      );
      expect(firestoreModule.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ order: 2 }),
      );
    });

    it('recalcula a soma de palavras de todos os capitulos de um livro', async () => {
      vi.mocked(firestoreModule.getDocs).mockResolvedValueOnce({
        docs: [
          { id: 'ch-1', data: () => ({ wordCount: 150 }) },
          { id: 'ch-2', data: () => ({ wordCount: 350 }) },
        ],
      } as unknown as firestoreModule.QuerySnapshot);

      const total = await recalculateBookWordCount('book-1');
      expect(total).toBe(500);
      expect(firestoreModule.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ wordCount: 500 }),
      );
    });
  });
  it('incrementa a versão do capítulo mesmo com duas edições no mesmo milissegundo', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const book = { wordCount: 4, updatedAt: 1000 };
    const chapter = { wordCount: 4, updatedAt: 1000 };
    const writes = vi.fn();
    vi.mocked(firestoreModule.runTransaction).mockImplementation(async (_db, callback) =>
      callback({
        get: (ref: { pathSegments: string[] }) =>
          Promise.resolve({
            exists: () => true,
            data: () => (ref.pathSegments.includes('chapters') ? chapter : book),
            ref,
          }),
        update: (ref: { pathSegments: string[] }, data: Partial<typeof chapter>) => {
          writes(ref, data);
          Object.assign(ref.pathSegments.includes('chapters') ? chapter : book, data);
        },
      } as unknown as firestoreModule.Transaction),
    );
    try {
      await updateChapter('book-1', 'ch-1', { title: 'Primeira edição' });
      expect(chapter.updatedAt).toBe(1001);
      await updateChapter('book-1', 'ch-1', { title: 'Segunda edição' });
      expect(chapter.updatedAt).toBe(1002);
      expect(book.updatedAt).toBe(1002);
      expect(book.wordCount).toBe(4);
    } finally {
      clock.mockRestore();
    }
  });
  it('entrega a mesma sequência de atos a todos os consumidores de capítulos', async () => {
    vi.mocked(firestoreModule.getDocs).mockResolvedValueOnce({
      docs: [
        { id: 'free', data: () => ({ title: 'Livre', order: 1 }) },
        { id: 'second', data: () => ({ title: 'Segundo', order: 1, actId: 'b' }) },
        { id: 'first', data: () => ({ title: 'Primeiro', order: 8, actId: 'a' }) },
      ],
    } as unknown as firestoreModule.QuerySnapshot);
    vi.mocked(firestoreModule.getDocsFromServer).mockResolvedValueOnce({
      docs: [
        { id: 'b', data: () => ({ name: 'Virada', order: 2, createdAt: 1, updatedAt: 1 }) },
        { id: 'a', data: () => ({ name: null, order: 1, createdAt: 1, updatedAt: 1 }) },
      ],
    } as unknown as firestoreModule.QuerySnapshot);
    expect((await listChapters('book-1')).map((chapter) => chapter.title)).toEqual([
      'Primeiro',
      'Segundo',
      'Livre',
    ]);
  });
});

it('recusa a persona complementar inválida antes de criar um capítulo', async () => {
  vi.mocked(firestoreModule.getDocFromServer).mockClear();
  await expect(
    createChapter('book', {
      title: 'Cena',
      actId: 'act',
      personaComplement: {
        personaId: 'preset-unsettling',
        overrides: [{ traitId: 'tension', value: 101 }],
      },
    }),
  ).rejects.toThrow();
  expect(firestoreModule.getDocFromServer).not.toHaveBeenCalled();
});
