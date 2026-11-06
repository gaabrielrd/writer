import {
  resolveLoreEvidence,
  normalizeLoreClaims,
} from '../../../../functions/src/loreClaimProtocol.mjs';
import type { LoreClaimSet } from '../../../../functions/src/loreClaimProtocol.mjs';
export type {
  LoreClaim,
  LoreClaimKind,
  LoreClaimSet,
} from '../../../../functions/src/loreClaimProtocol.mjs';
import type { ChatGenerationRequest } from '@/features/ai-assistant';
import type { LoreCategory, LoreEntity } from './loreEntity';
export interface LoreAnalysisEditorialContext {
  version: 1;
  bookId: string;
  chapterId: string;
  scope: 'editorial-contract-only';
  wholeBook: false;
  present: boolean;
  revision: number;
  contextToken: string;
  instruction: string;
}
export interface LoreAnalysisRequest {
  editorialContextToken?: string;
  bookId: string;
  chapterId: string;
  text: string;
  requestId: string;
  content: string;
  loreVersions: Array<[string, number]>;
  generation?: ChatGenerationRequest;
}

export interface DetectedLoreEntity {
  claims?: LoreClaimSet;
  name: string;
  category: LoreCategory;
  summary: string;
  details: string;
  aliases: string[];
  evidence: string;
}
export interface LoreAnalysis {
  editorialContext?: LoreAnalysisEditorialContext;
  id: string;
  provider: 'platform' | 'byok';
  entities: DetectedLoreEntity[];
}
export interface LoreChange {
  scope: 'local' | 'global';
  entityId?: string;
  input: Partial<Pick<DetectedLoreEntity, 'name' | 'category' | 'summary' | 'details' | 'aliases'>>;
}
export const loreChangeFields = ['name', 'category', 'summary', 'details', 'aliases'] as const;
const normalized = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('pt-BR');

export function matchingLoreEntities(detected: DetectedLoreEntity, entities: LoreEntity[]) {
  const terms = [detected.name, ...detected.aliases].map(normalized);
  return entities.filter((entity) =>
    [entity.name, ...entity.aliases].some((term) => terms.includes(normalized(term))),
  );
}

export function parseDetectedLore(text: string, source: string): DetectedLoreEntity[] {
  const parsed: unknown = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  const items = (parsed as { entities?: unknown })?.entities;
  if (!Array.isArray(items) || items.length > 50)
    throw new Error('Resposta de entidades inválida. Tente analisar novamente.');
  return items.map((item: DetectedLoreEntity) => {
    if (
      !item ||
      typeof item.name !== 'string' ||
      !item.name.trim() ||
      item.name.length > 200 ||
      !['character', 'location', 'concept', 'other'].includes(item.category) ||
      typeof item.summary !== 'string' ||
      !item.summary.trim() ||
      item.summary.length > 140 ||
      typeof item.details !== 'string' ||
      item.details.length > 8000 ||
      !Array.isArray(item.aliases) ||
      item.aliases.length > 20 ||
      item.aliases.some(
        (alias) => typeof alias !== 'string' || !alias.trim() || alias.length > 200,
      ) ||
      typeof item.evidence !== 'string' ||
      !item.evidence.trim() ||
      item.evidence.length > 1000
    ) {
      throw new Error('A análise contém dados ou evidências inválidas. Tente novamente.');
    }
    const evidence = resolveLoreEvidence(source, item.evidence);
    const claims = normalizeLoreClaims(item.claims, item, source);
    return {
      name: item.name.trim(),
      category: item.category,
      summary: item.summary.trim(),
      details: item.details,
      aliases: item.aliases,
      ...(claims ? { claims } : {}),
      evidence,
    };
  });
}
