import type { AIProvider } from './byokConfig';

export const DEFAULT_BYOK_CHAT_MODELS: Record<Exclude<AIProvider, 'firebase_ai'>, string> = {
  openai_byok: 'gpt-4o-mini',
  gemini_byok: 'gemini-3.7-flash',
};
