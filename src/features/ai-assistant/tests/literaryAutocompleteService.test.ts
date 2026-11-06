import { webcrypto } from 'node:crypto';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import {
  generateLiteraryAutocomplete,
  applyLiteraryAutocomplete,
  abandonLiteraryAutocompleteApplication,
} from '../services/literaryAutocompleteService';
import * as ai from '../services/aiClient';
import * as byok from '../services/byokStorage';
import { resolveChatGeneration } from '../model/chatGeneration';
import { chatDocumentHash } from '../model/chapterChat';
const mocks = vi.hoisted(() => ({
  call: vi.fn<(name: string, data: { requestId: string }) => Promise<{ data: unknown }>>(),
}));
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(),
  httpsCallable: (_functions: unknown, name: string) => (data: { requestId: string }) =>
    mocks.call(name, data),
}));
vi.mock('@/shared/lib', () => ({ getFirebaseApp: vi.fn() }));
vi.mock('../services/aiClient');
vi.mock('../services/byokStorage');
const scope = { bookId: 'book', chapterId: 'chapter' },
  before = '<p>Uma carta chegou.</p>';
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('crypto', webcrypto);
});
afterEach(() => vi.unstubAllGlobals());
it('uses the canonical server offer, freezes public configuration and leaves its nonce alive for acceptance', async () => {
  let requestId = '';
  const beforeHash = await chatDocumentHash(before);
  mocks.call.mockImplementation((_name: string, data: { requestId: string }) => {
    requestId = data.requestId;
    return Promise.resolve({
      data: {
        requestId,
        state: 'ready',
        chapterId: 'chapter',
        beforeHash,
        text: 'Ela abriu a carta.',
        expiresAt: Date.now() + 60000,
        applyCost: 1,
        editorial: null,
      },
    });
  });
  const controller = new AbortController();
  const offer = await generateLiteraryAutocomplete(
    { ...scope, before, textBeforeCursor: 'Uma carta chegou.', planIds: ['brief'] },
    { provider: 'firebase_ai' },
    controller.signal,
  );
  controller.abort();
  expect(mocks.call).toHaveBeenCalledTimes(1);
  expect(mocks.call).toHaveBeenCalledWith(
    'prepareLiteraryAutocomplete',
    expect.objectContaining({
      planIds: ['brief'],
      beforeHash,
      generation: expect.objectContaining({ provider: 'platform' }) as unknown,
    }),
  );
  expect(offer.requestId).toBe(requestId);
  expect(ai.generateAIResponse).not.toHaveBeenCalled();
});
it('reauthorizes before BYOK delivery and never sends local credentials to a callable', async () => {
  const beforeHash = await chatDocumentHash(before),
    generation = resolveChatGeneration({
      version: 1,
      provider: 'openai_byok',
      model: 'gpt-6-luna',
      reasoning: 'auto',
    });
  generation.effective.maxOutputTokens = 1024;
  vi.mocked(byok.getBYOKConfig).mockReturnValue({
    provider: 'gemini_byok',
    openaiApiKey: 'local-secret',
    geminiApiKey: 'other-secret',
  });
  vi.mocked(ai.generateAIResponse).mockResolvedValue('{"text":"Ela abriu a carta."}');
  mocks.call.mockImplementation((name: string, data: { requestId: string }) =>
    Promise.resolve({
      data:
        name === 'completeLiteraryAutocomplete'
          ? {
              state: 'ready',
              requestId: data.requestId,
              chapterId: 'chapter',
              beforeHash,
              text: 'Ela abriu a carta.',
              expiresAt: Date.now() + 60000,
              applyCost: 0,
            }
          : {
              state: 'prepared',
              requestId: data.requestId,
              generation,
              prompt: 'canonical-private-context',
              systemInstruction: 'canonical-guide',
            },
    }),
  );
  const offer = await generateLiteraryAutocomplete(
    { ...scope, before, textBeforeCursor: 'Uma carta chegou.' },
    { provider: 'openai_byok', openaiApiKey: 'original-local-secret', customModel: 'gpt-6-luna' },
    new AbortController().signal,
  );
  expect(mocks.call.mock.calls.map(([name]) => name)).toEqual([
    'prepareLiteraryAutocomplete',
    'getLiteraryAutocomplete',
    'completeLiteraryAutocomplete',
  ]);
  expect(ai.generateAIResponse).toHaveBeenCalledWith(
    expect.objectContaining({
      prompt: 'canonical-private-context',
      frozenGeneration: generation,
      byokConfig: expect.objectContaining({
        provider: 'openai_byok',
        customModel: 'gpt-6-luna',
        openaiApiKey: 'local-secret',
      }) as unknown,
    }),
  );
  expect(JSON.stringify(mocks.call.mock.calls)).not.toContain('secret');
  expect(JSON.stringify(offer)).not.toContain('secret');
});
it('uses stable metadata identities to resolve the same application without re-sending the manuscript', async () => {
  mocks.call.mockResolvedValue({ data: { state: 'canceled' } });
  await abandonLiteraryAutocompleteApplication(scope, 'request-0000000001', 'operation-00000001');
  expect(mocks.call).toHaveBeenLastCalledWith('abandonLiteraryAutocompleteApplication', {
    target: { kind: 'book', id: 'book' },
    requestId: 'request-0000000001',
    operationId: 'operation-00000001',
  });
  await applyLiteraryAutocomplete(
    scope,
    'request-0000000001',
    'operation-00000001',
    '<p>Texto aceito</p>',
  );
  expect(mocks.call).toHaveBeenLastCalledWith(
    'applyLiteraryAutocomplete',
    expect.objectContaining({ after: '<p>Texto aceito</p>' }),
  );
});
