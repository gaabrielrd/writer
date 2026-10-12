import { normalizeChatReasoning, type ChatReasoningLevel } from '../model/chatGeneration';
const key = (uid: string) => `writer:chat-reasoning:${encodeURIComponent(uid)}`;
export function readChatReasoningDefault(uid: string): ChatReasoningLevel {
  try {
    const raw = localStorage.getItem(key(uid));
    const value = raw ? (JSON.parse(raw) as { version?: unknown; reasoning?: unknown }) : null;
    return value?.version === 1 ? normalizeChatReasoning(value.reasoning) : 'auto';
  } catch {
    return 'auto';
  }
}
export function writeChatReasoningDefault(uid: string, reasoning: ChatReasoningLevel): boolean {
  try {
    localStorage.setItem(
      key(uid),
      JSON.stringify({ version: 1, reasoning: normalizeChatReasoning(reasoning) }),
    );
    return true;
  } catch {
    return false;
  }
}
