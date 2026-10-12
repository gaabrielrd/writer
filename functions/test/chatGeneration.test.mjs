import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getChatModelCapabilities,
  resolveChatReasoning,
  normalizeChatReasoning,
} from '../src/chatGeneration.mjs';
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
