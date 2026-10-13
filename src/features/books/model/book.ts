export type BookStatus = 'draft' | 'published';

export interface Book {
  id: string;
  universeId?: string | null;
  personaId?: string | null;
  authorId: string;
  title: string;
  genre?: string;
  synopsis?: string;
  coverUrl?: string | null;
  coverImageId?: string | null;
  status: BookStatus;
  wordCount: number;
  hasSceneResources?: boolean;
  sceneRevision?: number;
  hasNarrativeResources?: boolean;
  narrativeRevision?: number;
  deleting?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CreateBookInput {
  universeId?: string | null;
  creationId?: string;
  coverGenerationId?: string;
  title: string;
  genre?: string;
  synopsis?: string;
  coverUrl?: string | null;
  coverImageId?: string | null;
}

export interface UpdateBookInput {
  universeId?: string | null;
  personaId?: string | null;
  title?: string;
  genre?: string;
  synopsis?: string;
  coverUrl?: string | null;
  coverImageId?: string | null;
  status?: BookStatus;
}
