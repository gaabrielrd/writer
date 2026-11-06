import type { ChatIdentity } from './chapterChatService';
export interface ChatApplyRecovery {
  identity: ChatIdentity;
  requestId: string;
  messageId: string;
  messageInstance?: string;
  generationAttempt?: string;
  suggestionHash?: string;
  expectedHash: string;
  sourceHash: string;
  after: string;
  retarget: boolean;
}
const validId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const validHash = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function normalize(value: ChatApplyRecovery): ChatApplyRecovery | null {
  if (
    !value ||
    !validId(value.identity?.bookId) ||
    !validId(value.identity.chapterId) ||
    (value.identity.conversationId !== undefined && !validId(value.identity.conversationId)) ||
    !validId(value.requestId) ||
    !validId(value.messageId) ||
    !validHash(value.expectedHash) ||
    !validHash(value.sourceHash) ||
    typeof value.after !== 'string' ||
    value.after.length > 900000 ||
    typeof value.retarget !== 'boolean' ||
    [value.messageInstance, value.generationAttempt].some(
      (token) => token !== undefined && !validId(token),
    ) ||
    (value.messageInstance === undefined) !== (value.generationAttempt === undefined) ||
    (value.suggestionHash !== undefined && !validHash(value.suggestionHash))
  )
    return null;
  return {
    identity: {
      bookId: value.identity.bookId,
      chapterId: value.identity.chapterId,
      ...(value.identity.conversationId === undefined
        ? {}
        : { conversationId: value.identity.conversationId }),
    },
    requestId: value.requestId,
    messageId: value.messageId,
    expectedHash: value.expectedHash,
    sourceHash: value.sourceHash,
    after: value.after,
    retarget: value.retarget,
    ...(value.messageInstance === undefined
      ? {}
      : { messageInstance: value.messageInstance, generationAttempt: value.generationAttempt }),
    ...(value.suggestionHash === undefined ? {} : { suggestionHash: value.suggestionHash }),
  };
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
    const value = normalize(JSON.parse(raw) as ChatApplyRecovery);
    return value?.identity.bookId === bookId && value.identity.chapterId === chapterId
      ? value
      : null;
  } catch {
    return null;
  }
}
export function writeChatApplyRecovery(uid: string, value: ChatApplyRecovery) {
  const stored = normalize(value);
  if (!stored) throw new Error('Não foi possível preservar este aceite. Reabra a sugestão.');
  localStorage.setItem(
    key(uid, stored.identity.bookId, stored.identity.chapterId),
    JSON.stringify(stored),
  );
}
export function clearChatApplyRecovery(uid: string, bookId: string, chapterId: string) {
  localStorage.removeItem(key(uid, bookId, chapterId));
}
