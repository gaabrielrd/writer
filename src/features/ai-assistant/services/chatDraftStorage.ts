import type { ChatContext } from '../model/chapterChat';
import {
  normalizeChatGenerationRequest,
  type ChatGenerationRequest,
} from '../model/chatGeneration';

export interface ChatPendingRequest {
  requestId: string;
  messageInstance?: string;
  text: string;
  context: ChatContext;
  generation?: ChatGenerationRequest;
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
    if (!value || typeof value.draft !== 'string' || value.draft.length > 4000) return null;
    const pending = value.request;
    if (!pending) return { draft: value.draft };
    const generation = pending.generation
      ? normalizeChatGenerationRequest(pending.generation)
      : null;
    if (pending.generation && !generation) return { draft: value.draft };
    if (
      typeof pending.requestId !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(pending.requestId) ||
      (pending.messageInstance !== undefined &&
        (typeof pending.messageInstance !== 'string' ||
          !/^[a-zA-Z0-9_-]{1,128}$/.test(pending.messageInstance))) ||
      typeof pending.text !== 'string' ||
      pending.text.length > 4000 ||
      !pending.context ||
      typeof pending.context !== 'object'
    )
      return { draft: value.draft };
    return {
      draft: value.draft,
      request: {
        requestId: pending.requestId,
        ...(pending.messageInstance ? { messageInstance: pending.messageInstance } : {}),
        text: pending.text,
        context: pending.context,
        ...(generation ? { generation } : {}),
      },
    };
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
  const generation = value.request?.generation
    ? normalizeChatGenerationRequest(value.request.generation)
    : null;
  if (value.request?.generation && !generation)
    throw new Error('Configuração de recuperação inválida.');
  if (
    value.request?.messageInstance !== undefined &&
    !/^[a-zA-Z0-9_-]{1,128}$/.test(value.request.messageInstance)
  )
    throw new Error('Identidade de recuperação inválida.');
  const request = value.request
    ? {
        requestId: value.request.requestId,
        ...(value.request.messageInstance
          ? { messageInstance: value.request.messageInstance }
          : {}),
        text: value.request.text,
        context: value.request.context,
        ...(generation ? { generation } : {}),
      }
    : undefined;
  localStorage.setItem(
    key(uid, bookId, chapterId, conversationId),
    JSON.stringify({ draft: value.draft, ...(request ? { request } : {}) }),
  );
}
export function clearChatRecovery(
  uid: string,
  bookId: string,
  chapterId: string,
  conversationId: string,
) {
  localStorage.removeItem(key(uid, bookId, chapterId, conversationId));
}
