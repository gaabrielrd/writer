import type { ActHeading } from './act';
export interface PublicBook {
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
