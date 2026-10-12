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
