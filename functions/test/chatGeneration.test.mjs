import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getChatModelCapabilities,
  resolveChatReasoning,
  normalizeChatReasoning,
  normalizeChatGenerationRequest,
  resolveChatGeneration,
  chatProviderGenerationOptions,
} from '../src/chatGeneration.mjs';
test('configuração aceita somente campos públicos e mantém limites fora do controle do cliente', () => {
  const value = { version: 1, provider: 'platform', model: null, reasoning: 'high' };
  for (const extra of [
    { apiKey: 'private' },
    { maxOutputTokens: 90000 },
    { timeoutMs: 0 },
    { reasoning: 'ultra' },
    { version: 2 },
    { provider: 'other' },
    { model: '../secret' },
  ])
    assert.equal(normalizeChatGenerationRequest({ ...value, ...extra }), null);
  assert.equal(normalizeChatGenerationRequest(null), null);
  assert.equal(normalizeChatGenerationRequest({ ...value, provider: 'openai_byok' }), null);
  const generation = resolveChatGeneration(
    { ...value, model: 'modelo-do-cliente' },
    'gemini-3.7-flash',
  );
  assert.equal(generation.requested.model, 'modelo-do-cliente');
  assert.equal(generation.effective.model, 'gemini-3.7-flash');
  assert.equal(generation.effective.reasoning, 'high');
  assert.equal(generation.effective.maxOutputTokens, 4000);
});
test('opções usam parâmetros específicos da API e Auto conserva fallback seguro', () => {
  for (const reasoning of ['auto', 'none', 'low', 'medium', 'high', 'xhigh', 'max']) {
    const openai = resolveChatGeneration({
      version: 1,
      provider: 'openai_byok',
      model: 'gpt-6-luna',
      reasoning,
    });
    assert.deepEqual(chatProviderGenerationOptions(openai), {
      max_completion_tokens: 4000,
      reasoning_effort: reasoning === 'auto' ? 'medium' : reasoning,
    });
  }
  const gemini = resolveChatGeneration({
    version: 1,
    provider: 'gemini_byok',
    model: 'gemini-3.7-flash',
    reasoning: 'max',
  });
  assert.deepEqual(chatProviderGenerationOptions(gemini), {
    maxOutputTokens: 4000,
    thinkingConfig: { thinkingLevel: 'medium', includeThoughts: false },
  });
  const legacy = resolveChatGeneration({
    version: 1,
    provider: 'openai_byok',
    model: 'gpt-4o-mini',
    reasoning: 'max',
  });
  assert.deepEqual(chatProviderGenerationOptions(legacy), { max_tokens: 4000 });
  const unknown = resolveChatGeneration({
    version: 1,
    provider: 'gemini_byok',
    model: 'modelo-personalizado',
    reasoning: 'high',
  });
  assert.deepEqual(chatProviderGenerationOptions(unknown), { maxOutputTokens: 4000 });
});
test('Gemini Flash oferece somente níveis documentados e Auto usa o padrão médio', () => {
  for (const model of ['gemini-3.7-flash', 'gemini-3.8-flash']) {
    const caps = getChatModelCapabilities('gemini', model);
    assert.deepEqual(caps.levels, ['auto', 'low', 'medium', 'high']);
    assert.equal(resolveChatReasoning('auto', caps), 'medium');
    assert.equal(resolveChatReasoning('max', caps), 'medium');
    assert.equal(resolveChatReasoning('low', caps), 'low');
    assert.equal(caps.maxOutputTokens, 4000);
    assert.equal(caps.providerTimeoutMs, 90000);
  }
});
test('modelos OpenAI têm níveis distintos e Máximo conserva limites', () => {
  for (const model of ['gpt-6-luna', 'gpt-6-sol', 'gpt-6.1-sol', 'gpt-6-astra']) {
    const caps = getChatModelCapabilities('openai', model);
    assert.equal(caps.levels.includes('none'), ['gpt-6-luna', 'gpt-6-sol'].includes(model));
    assert.equal(resolveChatReasoning('max', caps), 'max');
    assert.equal(caps.maxOutputTokens, 4000);
    assert.equal(caps.requestTimeoutMs, 120000);
    assert.equal(resolveChatReasoning('auto', caps), model === 'gpt-6-astra' ? 'auto' : 'medium');
  }
});
test('modelos desconhecidos, legados e nomes de outro provedor conservam Auto', () => {
  for (const [provider, model] of [
    ['gemini', 'custom-model'],
    ['openai', 'gpt-4o-mini'],
    ['gemini', 'gpt-6-luna'],
    ['openai', 'gemini-3.7-flash'],
  ]) {
    const caps = getChatModelCapabilities(provider, model);
    assert.deepEqual(caps.levels, ['auto']);
    assert.equal(resolveChatReasoning('high', caps), 'auto');
    assert.equal(caps.api, 'automatic');
  }
  assert.equal(normalizeChatReasoning(undefined), 'auto');
  assert.equal(normalizeChatReasoning('invalid'), 'auto');
  assert.equal(normalizeChatReasoning('max'), 'max');
});
