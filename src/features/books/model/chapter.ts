export interface ChapterPersonaComplement {
  personaId: string;
  overrides: { traitId: string; value: number }[];
}

export interface Chapter {
  actId?: string | null;
  id: string;
  bookId: string;
  personaComplement?: ChapterPersonaComplement | null;
  title: string;
  order: number;
  wordCount: number;
  content: string;
  contentMode?: 'legacy' | 'scenes';
  assemblyRevision?: number;
  structureRevision?: number;
  deleting?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CreateChapterInput {
  creationId?: string;
  actId?: string | null;
  personaComplement?: ChapterPersonaComplement | null;
  title: string;
  order?: number;
  content?: string;
}

export interface UpdateChapterInput {
  /** Captured saved prose; used for server CAS when word progress is enabled. */
  expectedContent?: string;
  operationId?: string;
  expectedOwnerId?: string;
  personaComplement?: ChapterPersonaComplement | null;
  title?: string;
  order?: number;
  content?: string;
  wordCount?: number;
}

export { countWords } from '@/shared/lib/countWords';
