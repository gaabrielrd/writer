export type BookStatus = 'draft' | 'published';

export interface Book {
  id: string;
  authorId: string;
  title: string;
  genre?: string;
  synopsis?: string;
  coverUrl?: string | null;
  status: BookStatus;
  wordCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreateBookInput {
  title: string;
  genre?: string;
  synopsis?: string;
  coverUrl?: string | null;
}

export interface UpdateBookInput {
  title?: string;
  genre?: string;
  synopsis?: string;
  coverUrl?: string | null;
  status?: BookStatus;
}
