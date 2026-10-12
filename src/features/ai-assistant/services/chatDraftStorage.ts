import type { ChatContext } from '../model/chapterChat';

export interface ChatPendingRequest {
  requestId: string;
  text: string;
  context: ChatContext;
}
const key = (uid: string, bookId: string, chapterId: string, conversationId: string) =>
  `writer:chapter-chat:${uid}:${bookId}:${chapterId}:${conversationId}`;
export function readChatRecovery(
  uid: string,
  bookId: string,
  chapterId: string,
  conversationId: string,
): { draft: string; request?: ChatPendingRequest } | null {
  try {
    const raw = localStorage.getItem(key(uid, bookId, chapterId, conversationId));
    const value = raw
      ? (JSON.parse(raw) as { draft?: unknown; request?: ChatPendingRequest })
      : null;
    return value && typeof value.draft === 'string' && value.draft.length <= 4000
      ? { draft: value.draft, ...(value.request ? { request: value.request } : {}) }
      : null;
  } catch {
    return null;
  }
}
export function writeChatRecovery(
  uid: string,
  bookId: string,
  chapterId: string,
  conversationId: string,
  value: { draft: string; request?: ChatPendingRequest },
) {
  localStorage.setItem(key(uid, bookId, chapterId, conversationId), JSON.stringify(value));
}
export function clearChatRecovery(
  uid: string,
  bookId: string,
  chapterId: string,
  conversationId: string,
) {
  localStorage.removeItem(key(uid, bookId, chapterId, conversationId));
}
