import {
  LORE_CATEGORIES,
  type LoreCategory,
  type LoreDetails,
  type LoreMentionEntity,
  type LoreRelation,
} from './loreEntity';
import type { BookLoreEditSource } from '../services/bookLoreWritePlan';

/** Listing projection only; never a complete C1 source or editor input. */
export interface BookLoreSummary extends LoreMentionEntity {
  bookId: string;
  sourceToken: string;
  isPublic: boolean;
  relationCount: number;
}

/** Read-only presentation of a complete C1 source. Never a writer source. */
export interface BookLorePresentation extends LoreMentionEntity {
  bookId: string;
  sourceToken: string;
  details: string;
  structuredDetails?: Partial<LoreDetails>;
  relations: LoreRelation[];
  isPublic: boolean;
}
export function presentBookLore(source: BookLoreEditSource): BookLorePresentation {
  const d = source.data;
  if (typeof d.name !== 'string' || !LORE_CATEGORIES.some((c) => c.value === d.category))
    throw Error('Não foi possível apresentar a ficha completa. Atualize o compêndio.');
  return {
    id: source.id,
    bookId: source.bookId,
    sourceToken: source.sourceToken,
    name: d.name,
    category: d.category as LoreCategory,
    aliases: (d.aliases ?? []) as string[],
    summary: (d.summary ?? '') as string,
    details: (d.details ?? '') as string,
    ...(Object.hasOwn(d, 'structuredDetails')
      ? { structuredDetails: d.structuredDetails as Partial<LoreDetails> }
      : {}),
    relations: (d.relations ?? []) as LoreRelation[],
    isPublic: d.isPublic === true,
  };
}
