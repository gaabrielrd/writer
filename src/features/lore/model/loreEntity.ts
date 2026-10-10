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

export interface LoreDetails {
  appearance: string;
  personality: string;
  history: string;
  notes: string;
}

export type LoreScope = { kind: 'book' | 'universe'; id: string };

interface LoreEntityFields {
  id: string;
  name: string;
  aliases: string[];
  category: LoreCategory;
  summary: string;
  details: string;
  structuredDetails?: LoreDetails;
  relations: LoreRelation[];
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
}

export type LoreEntity = LoreEntityFields &
  ({ bookId: string; universeId?: never } | { universeId: string; bookId?: never });

export interface CreateLoreEntityInput {
  creationId?: string;
  name: string;
  aliases?: string[];
  category: LoreCategory;
  summary: string;
  details?: string;
  structuredDetails?: LoreDetails;
  relations?: LoreRelation[];
  isPublic?: boolean;
}

export interface UpdateLoreEntityInput {
  name?: string;
  aliases?: string[];
  category?: LoreCategory;
  summary?: string;
  details?: string;
  structuredDetails?: LoreDetails;
  relations?: LoreRelation[];
  isPublic?: boolean;
}
