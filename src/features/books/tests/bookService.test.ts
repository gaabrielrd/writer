import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as firestoreModule from 'firebase/firestore';
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
} from '../services/bookService';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...pathSegments: string[]) => ({ pathSegments })),
  doc: vi.fn((_db: unknown, ...pathSegments: string[]) => ({
    id: pathSegments[pathSegments.length - 1] || 'mock-id-123',
    pathSegments,
  })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn((coll: unknown) => coll),
  where: vi.fn(),
  orderBy: vi.fn(),
  getFirestore: vi.fn(() => ({})),
}));

describe('bookService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Books CRUD', () => {
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
      await updateBook('book-1', { title: 'Novo Título', status: 'published' });

      expect(firestoreModule.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ title: 'Novo Título', status: 'published' }),
      );
    });

    it('exclui livro e todos os seus capitulos associados', async () => {
      vi.mocked(firestoreModule.getDocs).mockResolvedValue({
        docs: [
          {
            id: 'ch-1',
            data: () => ({ title: 'Cap 1', order: 1, wordCount: 100 }),
          },
        ],
      } as unknown as firestoreModule.QuerySnapshot);

      await deleteBook('book-1');

      expect(firestoreModule.deleteDoc).toHaveBeenCalledTimes(2); // 1 capitulo + 1 livro
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

      expect(firestoreModule.updateDoc).toHaveBeenCalledTimes(2);
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
});
