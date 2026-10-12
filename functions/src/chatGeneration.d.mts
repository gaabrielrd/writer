export type ChatReasoningLevel = 'auto' | 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type ChatModelProvider = 'gemini' | 'openai';
export interface ChatModelCapabilities {
  version: 1;
  provider: ChatModelProvider;
  model: string;
  levels: ChatReasoningLevel[];
  defaultReasoning: ChatReasoningLevel;
  api: 'gemini-content' | 'openai-chat' | 'automatic';
  maxOutputTokens: number;
  providerTimeoutMs: number;
  requestTimeoutMs: number;
}
export const CHAT_REASONING_LEVELS: readonly ChatReasoningLevel[];
export const CHAT_GENERATION_LIMITS: Readonly<{
  maxOutputTokens: number;
  providerTimeoutMs: number;
  requestTimeoutMs: number;
}>;
export const DEFAULT_BYOK_CHAT_MODELS: Readonly<{ openai_byok: string; gemini_byok: string }>;
export function isChatReasoning(value: unknown): value is ChatReasoningLevel;
export function normalizeChatReasoning(value: unknown): ChatReasoningLevel;
export function getChatModelCapabilities(
  provider: ChatModelProvider,
  model?: string,
): ChatModelCapabilities;
export function resolveChatReasoning(
  requested: unknown,
  capabilities: ChatModelCapabilities,
): ChatReasoningLevel;

export interface ChatGenerationRequest {
  version: 1;
  provider: 'platform' | 'gemini_byok' | 'openai_byok';
  model: string | null;
  reasoning: ChatReasoningLevel;
}
export interface ChatGeneration {
  version: 1;
  requested: ChatGenerationRequest;
  effective: Omit<ChatModelCapabilities, 'version' | 'levels' | 'defaultReasoning'> & {
    reasoning: ChatReasoningLevel;
  };
}
export function normalizeChatGenerationRequest(value: unknown): ChatGenerationRequest | null;
export function resolveChatGeneration(
  value: ChatGenerationRequest,
  platformModel?: string,
): ChatGeneration;
export function chatProviderGenerationOptions(generation: ChatGeneration): {
  max_tokens?: number;
  max_completion_tokens?: number;
  reasoning_effort?: ChatReasoningLevel;
  maxOutputTokens?: number;
  thinkingConfig?: { thinkingLevel: ChatReasoningLevel; includeThoughts: false };
};
