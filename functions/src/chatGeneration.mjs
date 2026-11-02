// Pure contract shared by the authenticated service and browser UI; no credentials or I/O.
// Explicit IDs verified in Firebase AI Logic documentation on 2026-11-02.
export const PLATFORM_TEXT_MODELS = Object.freeze([
  Object.freeze({
    id: 'gemini-3.8-flash',
    label: 'Gemini 3.8 Flash',
    description: 'Equilibrado para uso geral',
  }),
  Object.freeze({
    id: 'gemini-3.5-flash-lite',
    label: 'Gemini 3.5 Flash-Lite',
    description: 'Menor custo do provedor',
  }),
  Object.freeze({
    id: 'gemini-4-argon',
    label: 'Gemini 4 Argon',
    description: 'Raciocínio avançado',
  }),
]);
export const DEFAULT_PLATFORM_MODEL = 'gemini-3.8-flash';
export const DEFAULT_PLATFORM_REASONING = 'medium';
export function isPlatformTextModel(model) {
  return PLATFORM_TEXT_MODELS.some((item) => item.id === model);
}
// New platform preferences are strict; legacy chat snapshots retain their original levels.
export function resolvePlatformTextGeneration(value) {
  const requested =
    value === undefined
      ? {
          version: 1,
          provider: 'platform',
          model: DEFAULT_PLATFORM_MODEL,
          reasoning: DEFAULT_PLATFORM_REASONING,
        }
      : normalizeChatGenerationRequest(value);
  if (
    !requested ||
    requested.provider !== 'platform' ||
    !isPlatformTextModel(requested.model) ||
    !['medium', 'high'].includes(requested.reasoning)
  )
    throw new Error('Modelo ou raciocínio da plataforma inválido.');
  return resolveChatGeneration(requested);
}
export function geminiTextGenerationOptions(generation, maxOutputTokens) {
  return {
    maxOutputTokens,
    ...(generation?.effective.reasoning && generation.effective.reasoning !== 'auto'
      ? {
          thinkingConfig: { thinkingLevel: generation.effective.reasoning, includeThoughts: false },
        }
      : {}),
  };
}

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
  const gemini =
    provider === 'gemini' &&
    [...PLATFORM_TEXT_MODELS.map((item) => item.id), 'gemini-3.7-flash'].includes(name);
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
    defaultReasoning:
      (gemini && name !== 'gemini-3.5-flash-lite') || (openai && name !== 'gpt-6-astra')
        ? 'medium'
        : 'auto',
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
  const model =
    requested.provider === 'platform' ? (requested.model ?? platformModel) : requested.model;
  if (
    requested.provider === 'platform' &&
    requested.model !== null &&
    !isPlatformTextModel(model) &&
    model !== 'gemini-3.7-flash'
  )
    throw new Error('Modelo da plataforma indisponível.');
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
