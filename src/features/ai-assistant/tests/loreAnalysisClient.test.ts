import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeLoreWithBYOK } from '../services/loreAnalysisClient';
import { generateAIResponse } from '../services/aiClient';
vi.mock('../services/aiClient');
const config = { provider: 'openai_byok' as const, openaiApiKey: 'test' };
const entity = {
  name: 'Arthur',
  category: 'character',
  summary: 'Rei',
  details: 'Chegou.',
  aliases: [],
  evidence: 'Arthur chegou.',
};
beforeEach(() => vi.resetAllMocks());
describe('análise BYOK', () => {
  it('cannot generate through the platform while preparing a BYOK batch', async () => {
    await expect(
      analyzeLoreWithBYOK('texto', [], { provider: 'firebase_ai' }, new AbortController().signal),
    ).rejects.toThrow('BYOK válida');
    expect(generateAIResponse).not.toHaveBeenCalled();
  });
  it('covers the complete chapter and consolidates repeated entities from chunks', async () => {
    const source = 'Arthur chegou.' + 'x'.repeat(12000) + 'Arthur chegou.';
    vi.mocked(generateAIResponse)
      .mockResolvedValueOnce(JSON.stringify({ entities: [entity] }))
      .mockResolvedValueOnce(
        JSON.stringify({ entities: [{ ...entity, details: 'Chegou duas vezes.' }] }),
      );
    const result = await analyzeLoreWithBYOK(source, [], config, new AbortController().signal);
    expect(result).toHaveLength(1);
    expect(result[0]?.details).toBe('Chegou duas vezes.');
    expect(generateAIResponse).toHaveBeenCalledTimes(2);
    expect(generateAIResponse).toHaveBeenCalledWith(
      expect.objectContaining({ json: true, maxOutputTokens: 12000, byokConfig: config }),
    );
  });
  it('rejects excessive input and incomplete responses instead of returning partial results', async () => {
    await expect(
      analyzeLoreWithBYOK('x'.repeat(120001), [], config, new AbortController().signal),
    ).rejects.toThrow('120 mil');
    vi.mocked(generateAIResponse)
      .mockResolvedValueOnce('{"entities":[]}')
      .mockRejectedValueOnce(new Error('interrompida'));
    await expect(
      analyzeLoreWithBYOK('x'.repeat(12001), [], config, new AbortController().signal),
    ).rejects.toThrow('interrompida');
  });
});
