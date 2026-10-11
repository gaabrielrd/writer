import type { LoreAnalysisRequest } from '../../../src/features/lore/model/loreAnalysis';
import type {
  DetectedLoreEntity,
  LoreAnalysis,
  LoreChange,
} from '../../../src/features/lore/model/loreAnalysis';
import { author } from './data';
import { createLoreEntity, updateLoreEntity } from './loreService';
const tickets = new Map<string, LoreAnalysisRequest & LoreAnalysis>();
const applied = new Map<string, { credits: number; applied: number }>();
export const fixtureDetections: DetectedLoreEntity[] = [
  {
    name: 'Nara',
    category: 'character',
    summary: 'Navegadora do porto.',
    details: 'Nara encontra o Farol do Norte.',
    aliases: [],
    evidence: 'Nara encontra o Farol do Norte.',
  },
  {
    name: 'Farol do Norte',
    category: 'location',
    summary: 'Farol encontrado por Nara.',
    details: 'Fica no caminho de Nara.',
    aliases: [],
    evidence: 'Nara encontra o Farol do Norte.',
  },
];
export function prepareBYOKLore(request: LoreAnalysisRequest, entities: DetectedLoreEntity[]) {
  const result: LoreAnalysis = { id: request.requestId, provider: 'byok', entities };
  tickets.set(result.id, { ...request, ...result });
  return Promise.resolve(result);
}
export function analyzeChapterLore(request: LoreAnalysisRequest) {
  const result: LoreAnalysis = {
    id: request.requestId,
    provider: 'platform',
    entities: fixtureDetections,
  };
  tickets.set(result.id, { ...request, ...result });
  return Promise.resolve(result);
}
export async function applyLoreAnalysis(id: string, text: string, changes: LoreChange[]) {
  if (applied.has(id)) return applied.get(id)!;
  const ticket = tickets.get(id);
  if (!ticket || ticket.text !== text) throw new Error('Análise fictícia inválida.');
  for (const change of changes) {
    if (change.entityId) await updateLoreEntity(ticket.bookId, change.entityId, change.input);
    else
      await createLoreEntity(ticket.bookId, {
        name: change.input.name!,
        category: change.input.category!,
        summary: change.input.summary!,
        details: change.input.details,
        aliases: change.input.aliases,
        isPublic: false,
      });
  }
  const result = {
    credits: author.credits - (ticket.provider === 'platform' ? 1 : 0),
    applied: changes.length,
  };
  applied.set(id, result);
  return result;
}
