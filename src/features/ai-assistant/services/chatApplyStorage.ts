import type { ChatIdentity } from './chapterChatService';
export interface ChatApplyRecovery {
  identity: ChatIdentity;
  requestId: string;
  messageId: string;
  expectedHash: string;
  sourceHash: string;
  after: string;
  retarget: boolean;
}
const key = (uid: string, bookId: string, chapterId: string) =>
  `writer:chapter-chat-apply:${uid}:${bookId}:${chapterId}`;
export function readChatApplyRecovery(
  uid: string,
  bookId: string,
  chapterId: string,
): ChatApplyRecovery | null {
  try {
    const raw = localStorage.getItem(key(uid, bookId, chapterId));
    if (!raw) return null;
    const value = JSON.parse(raw) as ChatApplyRecovery;
    return value.identity?.bookId === bookId &&
      value.identity.chapterId === chapterId &&
      typeof value.after === 'string' &&
      typeof value.requestId === 'string'
      ? value
      : null;
  } catch {
    return null;
  }
}
export function writeChatApplyRecovery(uid: string, value: ChatApplyRecovery) {
  localStorage.setItem(
    key(uid, value.identity.bookId, value.identity.chapterId),
    JSON.stringify(value),
  );
}
export function clearChatApplyRecovery(uid: string, bookId: string, chapterId: string) {
  localStorage.removeItem(key(uid, bookId, chapterId));
}
