import type {
  PersonaGenerationContext,
  PersonaGenerationEditable,
  PersonaGenerationResult,
} from '../../../src/features/ai-assistant/model/personaGeneration';
import type { ChatGenerationRequest } from '../../../src/features/ai-assistant/model/chatGeneration';
import { resolvePlatformTextGeneration } from '../../../src/features/ai-assistant/model/chatGeneration';
import { STANDARD_TRAITS } from '../../../src/features/ai-assistant/model/persona';
import { getUniverse } from './universeService';
import { listLoreEntities } from './loreService';
import { savePersona } from './personaService';
import { author } from './data';
const proposals = new Map<string, PersonaGenerationResult>();
export async function preparePersonaContext(
  universeId: string,
  entityIds: string[],
): Promise<PersonaGenerationContext> {
  const world = await getUniverse(universeId);
  if (!world) throw new Error('Universo indisponível.');
  const entities = (await listLoreEntities({ kind: 'universe', id: universeId }))
    .filter((entity) => entityIds.includes(entity.id.split(':').at(-1)!))
    .map((entity) => ({
      id: entity.id.split(':').at(-1)!,
      name: entity.name,
      category: entity.category,
      aliases: entity.aliases,
      summary: entity.summary,
      details: entity.details,
      structuredDetails: entity.structuredDetails ? { ...entity.structuredDetails } : null,
      relations: entity.relations,
    }));
  return {
    universe: { id: universeId, name: world.name, description: world.description },
    entities,
    bytes: JSON.stringify(entities).length,
    contextToken: 'fixture-context',
  };
}
export function generatePersona(
  _context: PersonaGenerationContext,
  _intention: string,
  requestId: string,
  generation: ChatGenerationRequest,
): Promise<PersonaGenerationResult> {
  const result: PersonaGenerationResult = {
    requestId,
    state: 'ready',
    generation: resolvePlatformTextGeneration(generation),
    persona: {
      id: `custom-${requestId}`,
      schemaVersion: 1,
      name: 'Voz das marés',
      description: 'Uma voz sensorial com mistério contido.',
      instructions:
        'Use imagens sensoriais e revelações graduais, preservando os fatos recebidos em cada operação.',
      traits: STANDARD_TRAITS.map((trait) => ({ ...trait, value: trait.id === 'humor' ? 0 : 65 })),
      revision: 1,
      archived: false,
      createdAt: 0,
      updatedAt: 0,
    },
    rationale: 'O contexto sugere ritmo pausado e tensão sutil; os valores podem ser ajustados.',
  };
  proposals.set(requestId, result);
  return Promise.resolve(result);
}
export function getPersonaGeneration(requestId: string) {
  const row = proposals.get(requestId);
  if (!row) return Promise.reject(new Error('Pedido ausente.'));
  return Promise.resolve(row);
}
export async function acceptPersonaGeneration(
  requestId: string,
  persona: PersonaGenerationEditable,
) {
  const result = await getPersonaGeneration(requestId);
  if (result.state !== 'accepted') {
    await savePersona(author.uid, { ...result.persona!, ...persona }, null);
    result.state = 'accepted';
    result.personaId = result.persona!.id;
  }
  return result;
}
export function discardPersonaGeneration(requestId: string) {
  proposals.delete(requestId);
  return Promise.resolve({ discarded: true });
}
