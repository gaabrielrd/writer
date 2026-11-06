import type { ActHeading } from './act';
export interface ReaderGuideBoundary {
  version: 1;
  bookId: string;
  revisionId: string;
  chapterId: string;
}
export interface PublicBook {
  readerGuideVersion?: 1;
  literaryManifestHash?: string;
  hasActs?: true;
  universeId?: string;
  universePrivacyVersion?: number;
  id: string;
  title: string;
  authorName: string;
  revisionId: string;
  publishedAt: number;
}
export interface PublicChapter {
  actId?: string;
  id: string;
  title: string;
  order: number;
  content: string;
}
export interface PublicLoreEntity {
  readerGuide?: ReaderGuideBoundary;
  certainty?: 'fact' | 'uncertain';
  disambiguation?: string;
  facts?: Array<{
    text: string;
    certainty: 'fact' | 'uncertain';
    readerGuide: ReaderGuideBoundary;
  }>;
  relationships?: Array<{
    targetId: string;
    targetName?: string;
    description: string;
    certainty: 'fact' | 'uncertain';
    readerGuide: ReaderGuideBoundary;
  }>;
  appearances?: Array<{
    kind: 'direct' | 'document' | 'mention' | 'uncertain';
    chapterTitle?: string;
    readerGuide: ReaderGuideBoundary;
  }>;
  id: string;
  name: string;
  aliases: string[];
  category: 'character' | 'location' | 'concept' | 'other';
  summary: string;
  isPublic: true;
}
export interface PublicBookContent {
  acts?: ActHeading[];
  chapters: PublicChapter[];
  lore: PublicLoreEntity[];
}
