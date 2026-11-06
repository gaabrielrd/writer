import { beforeEach, it, expect } from 'vitest';
import {
  writeChatApplyRecovery,
  readChatApplyRecovery,
  type ChatApplyRecovery,
} from '../services/chatApplyStorage';
const hash = 'a'.repeat(64),
  identity = { bookId: 'book', chapterId: 'chapter', conversationId: 'conversation' };
const pending: ChatApplyRecovery = {
  identity,
  requestId: 'accept',
  messageId: 'message',
  messageInstance: 'instance',
  generationAttempt: 'attempt',
  suggestionHash: hash,
  expectedHash: hash,
  sourceHash: hash,
  after: '<p>Texto aceito</p>',
  retarget: false,
};
beforeEach(() => localStorage.clear());
it('preserves exact accepted attempt and strips credentials and unrelated fields', () => {
  writeChatApplyRecovery('author', {
    ...pending,
    apiKey: 'PRIVATE KEY',
    extra: 'PRIVATE EXTRA',
  } as ChatApplyRecovery);
  expect(readChatApplyRecovery('author', 'book', 'chapter')).toEqual(pending);
  expect(localStorage.getItem('writer:chapter-chat-apply:author:book:chapter')).not.toContain(
    'PRIVATE',
  );
  expect(readChatApplyRecovery('other', 'book', 'chapter')).toBeNull();
});
it('keeps old receipt replay compatible without minting missing source tokens', () => {
  const { messageInstance, generationAttempt, suggestionHash, ...old } = pending;
  void messageInstance;
  void generationAttempt;
  void suggestionHash;
  writeChatApplyRecovery('author', old);
  expect(readChatApplyRecovery('author', 'book', 'chapter')).toEqual(old);
});
it('rejects partially lost source identities and malformed source hashes', () => {
  for (const bad of [
    { ...pending, generationAttempt: undefined },
    { ...pending, suggestionHash: 'invalid' },
  ]) {
    expect(() => writeChatApplyRecovery('author', bad)).toThrow();
    localStorage.setItem('writer:chapter-chat-apply:author:book:chapter', JSON.stringify(bad));
    expect(readChatApplyRecovery('author', 'book', 'chapter')).toBeNull();
  }
});
