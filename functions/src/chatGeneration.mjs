// Pure contract shared by the authenticated service and browser UI; no credentials or I/O.
export const CHAT_REASONING_LEVELS = Object.freeze([
  'auto',
  'none',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);
export const CHAT_GENERATION_LIMITS = Object.freeze({
  maxOutputTokens: 4000,
  providerTimeoutMs: 90000,
  requestTimeoutMs: 120000,
});
export const DEFAULT_BYOK_CHAT_MODELS = Object.freeze({
  openai_byok: 'gpt-4o-mini',
  gemini_byok: 'gemini-3.7-flash',
});
const geminiLevels = ['auto', 'low', 'medium', 'high'];
const openaiLevels = ['auto', 'none', 'low', 'medium', 'high', 'xhigh', 'max'];
export function isChatReasoning(value) {
  return CHAT_REASONING_LEVELS.includes(value);
}
export function normalizeChatReasoning(value) {
  return isChatReasoning(value) ? value : 'auto';
}
export function getChatModelCapabilities(provider, model) {
  const name = typeof model === 'string' ? model.trim() : '';
  const gemini = provider === 'gemini' && ['gemini-3.7-flash', 'gemini-3.8-flash'].includes(name);
  const openai =
    provider === 'openai' &&
    ['gpt-6-luna', 'gpt-6-sol', 'gpt-6.1-sol', 'gpt-6-astra'].includes(name);
  const levels = gemini
    ? geminiLevels
    : openai
      ? openaiLevels.filter(
          (level) => level !== 'none' || ['gpt-6-luna', 'gpt-6-sol'].includes(name),
        )
      : ['auto'];
  return {
    version: 1,
    provider,
    model: name,
    levels: [...levels],
    defaultReasoning: gemini || (openai && name !== 'gpt-6-astra') ? 'medium' : 'auto',
    api: gemini ? 'gemini-content' : openai ? 'openai-chat' : 'automatic',
    ...CHAT_GENERATION_LIMITS,
  };
}
export function resolveChatReasoning(requested, capabilities) {
  const choice = normalizeChatReasoning(requested);
  const supported = capabilities.levels.includes(choice) ? choice : 'auto';
  return supported === 'auto' ? capabilities.defaultReasoning : supported;
}

export function normalizeChatGenerationRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (
    Object.keys(value).some((key) => !['version', 'provider', 'model', 'reasoning'].includes(key))
  )
    return null;
  if (
    value.version !== 1 ||
    !['platform', 'gemini_byok', 'openai_byok'].includes(value.provider) ||
    !isChatReasoning(value.reasoning)
  )
    return null;
  const model = typeof value.model === 'string' ? value.model.trim() : null;
  if (model !== null && !/^[a-zA-Z0-9._:-]{1,120}$/.test(model)) return null;
  if (value.provider !== 'platform' && !model) return null;
  if (value.model !== null && typeof value.model !== 'string') return null;
  return { version: 1, provider: value.provider, model, reasoning: value.reasoning };
}

export function resolveChatGeneration(value, platformModel = 'gemini-3.7-flash') {
  const requested = normalizeChatGenerationRequest(value);
  if (!requested) throw new Error('Configuração de geração inválida.');
  const provider = requested.provider === 'openai_byok' ? 'openai' : 'gemini';
  const model = requested.provider === 'platform' ? platformModel : requested.model;
  if (typeof model !== 'string' || !/^[a-zA-Z0-9._:-]{1,120}$/.test(model))
    throw new Error('Modelo de geração inválido.');
  const capabilities = getChatModelCapabilities(provider, model);
  return {
    version: 1,
    requested,
    effective: {
      provider,
      model: capabilities.model,
      reasoning: resolveChatReasoning(requested.reasoning, capabilities),
      api: capabilities.api,
      ...CHAT_GENERATION_LIMITS,
    },
  };
}

export function chatProviderGenerationOptions(generation) {
  const effective = generation.effective;
  const reasoning = effective.reasoning === 'auto' ? null : effective.reasoning;
  if (effective.provider === 'openai')
    return effective.api === 'openai-chat'
      ? {
          max_completion_tokens: CHAT_GENERATION_LIMITS.maxOutputTokens,
          ...(reasoning ? { reasoning_effort: reasoning } : {}),
        }
      : { max_tokens: CHAT_GENERATION_LIMITS.maxOutputTokens };
  return {
    maxOutputTokens: CHAT_GENERATION_LIMITS.maxOutputTokens,
    ...(effective.api === 'gemini-content' && reasoning
      ? { thinkingConfig: { thinkingLevel: reasoning, includeThoughts: false } }
      : {}),
  };
}
