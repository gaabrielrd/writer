import { beforeEach, expect, it, vi } from 'vitest';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { configureCallableRouting } from '@/shared/api/domainCallable';
import {
  FUNCTION_ROUTES,
  STREAMING_FUNCTIONS,
} from '../../../../functions/src/functionDomains.mjs';
import {
  preparePersonaContext,
  generatePersona,
  getPersonaGeneration,
  acceptPersonaGeneration,
  discardPersonaGeneration,
} from '../services/personaGenerationService';
import { DEFAULT_PERSONAS } from '../model/persona';
import { capturePlatformTextGeneration } from '../services/byokStorage';
vi.mock('@/shared/lib', () => ({ getFirebaseApp: () => ({}) }));
vi.mock('firebase/functions', () => ({ getFunctions: vi.fn(() => ({})), httpsCallable: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  configureCallableRouting(FUNCTION_ROUTES, STREAMING_FUNCTIONS);
});
it('usa callable autenticada com IDs e snapshot público, sem enviar corpo de lore ou credenciais', async () => {
  const payloadCall = vi.fn();
  const callable = vi.fn((raw: unknown) => {
    const input = raw as { version: number; action: string; payload: unknown };
    expect(input.version).toBe(1);
    expect(input.action).toBe('personaGeneration');
    payloadCall(input.payload);
    return Promise.resolve({ data: {} });
  });
  vi.mocked(httpsCallable).mockReturnValue(Object.assign(callable, { stream: vi.fn() }));
  await preparePersonaContext('world', ['entity']);
  expect(payloadCall).toHaveBeenLastCalledWith({
    action: 'context',
    universeId: 'world',
    entityIds: ['entity'],
  });
  const context = {
    universe: { id: 'world', name: 'Privado', description: 'Privado' },
    entities: [
      {
        id: 'entity',
        name: 'Privado',
        category: 'other',
        aliases: [],
        summary: 'Privado',
        details: 'Privado',
        structuredDetails: null,
        relations: [],
      },
    ],
    contextToken: 'hash',
    bytes: 100,
  };
  const generation = capturePlatformTextGeneration();
  await generatePersona(context, 'Uma voz íntima.', 'request-id', generation);
  expect(payloadCall).toHaveBeenLastCalledWith({
    action: 'generate',
    universeId: 'world',
    entityIds: ['entity'],
    contextToken: 'hash',
    intention: 'Uma voz íntima.',
    requestId: 'request-id',
    generation,
  });
  await getPersonaGeneration('request-id');
  expect(payloadCall).toHaveBeenLastCalledWith({ action: 'status', requestId: 'request-id' });
  const { name, description, instructions, traits } = DEFAULT_PERSONAS[0]!;
  await acceptPersonaGeneration('request-id', { name, description, instructions, traits });
  expect(payloadCall).toHaveBeenLastCalledWith({
    action: 'accept',
    requestId: 'request-id',
    persona: { name, description, instructions, traits },
  });
  await discardPersonaGeneration('request-id');
  expect(payloadCall).toHaveBeenLastCalledWith({ action: 'discard', requestId: 'request-id' });
  expect(httpsCallable).toHaveBeenLastCalledWith(expect.anything(), 'generationApi', {
    timeout: 120000,
  });
  expect(getFunctions).toHaveBeenCalledWith(expect.anything(), 'us-central1');
});
it('preserva mensagens acionáveis e fornece recuperação para falha sem mensagem', async () => {
  vi.mocked(httpsCallable).mockReturnValue(
    Object.assign(vi.fn().mockRejectedValue(new Error('Contexto mudou')), { stream: vi.fn() }),
  );
  await expect(getPersonaGeneration('request-id')).rejects.toThrow('Contexto mudou');
  vi.mocked(httpsCallable).mockReturnValue(
    Object.assign(vi.fn().mockRejectedValue(null), { stream: vi.fn() }),
  );
  await expect(getPersonaGeneration('request-id')).rejects.toThrow('Consulte o resultado');
});
