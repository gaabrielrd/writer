export type LoreCategory = 'character' | 'location' | 'concept' | 'other';

export const LORE_CATEGORIES: { value: LoreCategory; label: string }[] = [
  { value: 'character', label: 'Personagem' },
  { value: 'location', label: 'Local' },
  { value: 'concept', label: 'Conceito / Item' },
  { value: 'other', label: 'Outro' },
];

export interface LoreRelation {
  targetEntityId: string;
  relationType: string;
  description?: string;
}

export interface LoreEntity {
  id: string;
  bookId: string;
  name: string;
  aliases: string[];
  category: LoreCategory;
  summary: string;
  details: string;
  relations: LoreRelation[];
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CreateLoreEntityInput {
  name: string;
  aliases?: string[];
  category: LoreCategory;
  summary: string;
  details?: string;
  relations?: LoreRelation[];
  isPublic?: boolean;
}

export interface UpdateLoreEntityInput {
  name?: string;
  aliases?: string[];
  category?: LoreCategory;
  summary?: string;
  details?: string;
  relations?: LoreRelation[];
  isPublic?: boolean;
}
