import { getFunctions } from 'firebase/functions';
import { httpsDomainCallable as httpsCallable } from '@/shared/api/domainCallable';
import { getFirebaseApp } from '@/shared/lib';
import type { ChatGenerationRequest } from '../model/chatGeneration';
import type {
  PersonaGenerationContext,
  PersonaGenerationEditable,
  PersonaGenerationResult,
} from '../model/personaGeneration';
async function call<T>(data: unknown): Promise<T> {
  try {
    return (
      await httpsCallable<unknown, T>(
        getFunctions(getFirebaseApp(), 'us-central1'),
        'personaGeneration',
        { timeout: 120000 },
      )(data)
    ).data;
  } catch (cause) {
    throw new Error(
      cause instanceof Error
        ? cause.message
        : 'Não foi possível concluir. Consulte o resultado antes de tentar de novo.',
      { cause },
    );
  }
}
export const preparePersonaContext = (universeId: string, entityIds: string[]) =>
  call<PersonaGenerationContext>({ action: 'context', universeId, entityIds });
export const generatePersona = (
  context: PersonaGenerationContext,
  intention: string,
  requestId: string,
  generation: ChatGenerationRequest,
) =>
  call<PersonaGenerationResult>({
    action: 'generate',
    universeId: context.universe.id,
    entityIds: context.entities.map((entity) => entity.id),
    contextToken: context.contextToken,
    intention,
    requestId,
    generation,
  });
export const getPersonaGeneration = (requestId: string) =>
  call<PersonaGenerationResult>({ action: 'status', requestId });
export const acceptPersonaGeneration = (requestId: string, persona: PersonaGenerationEditable) =>
  call<PersonaGenerationResult>({ action: 'accept', requestId, persona });
export const discardPersonaGeneration = (requestId: string) =>
  call<{ discarded: boolean }>({ action: 'discard', requestId });
