export interface PublicBook {
  id: string;
  title: string;
  authorName: string;
  revisionId: string;
  publishedAt: number;
}
export interface PublicChapter {
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
  chapters: PublicChapter[];
  lore: PublicLoreEntity[];
}
