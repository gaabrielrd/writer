export {
  CHAT_REASONING_LEVELS,
  CHAT_GENERATION_LIMITS,
  DEFAULT_BYOK_CHAT_MODELS,
  getChatModelCapabilities,
  isChatReasoning,
  normalizeChatReasoning,
  resolveChatReasoning,
  type ChatReasoningLevel,
  type ChatModelCapabilities,
} from '../../../../functions/src/chatGeneration.mjs';

import type { ChatReasoningLevel } from '../../../../functions/src/chatGeneration.mjs';
export const CHAT_REASONING_LABELS: Record<ChatReasoningLevel, string> = {
  auto: 'Auto',
  none: 'Nenhum',
  low: 'Baixo',
  medium: 'Médio',
  high: 'Alto',
  xhigh: 'Muito alto',
  max: 'Máximo',
};
