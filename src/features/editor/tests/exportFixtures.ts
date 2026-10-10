import type { Book, Chapter } from '@/features/books';

export const exportBook: Book = {
  id: 'book-1',
  authorId: 'private-user-id',
  title: 'Crônicas: ação & memória',
  genre: 'Fantasia',
  synopsis: 'Uma viagem com dragões.',
  status: 'draft',
  wordCount: 20,
  createdAt: 1,
  updatedAt: 2,
};
export const exportChapter: Chapter = {
  id: 'chapter-1',
  bookId: 'book-1',
  title: 'O início',
  order: 1,
  content: '<p>Olá, <strong>ação</strong> e <em>memória</em>!<br>Segunda linha — café ☕.</p>',
  wordCount: 12,
  createdAt: 1,
  updatedAt: 2,
};

export function readBlob(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('Failed to read test artifact'));
    reader.readAsArrayBuffer(blob);
  });
}
