import { beforeEach, describe, it, expect } from 'vitest';
import {
  readChatRecovery,
  writeChatRecovery,
  type ChatPendingRequest,
} from '../services/chatDraftStorage';
import type { ChatContext } from '../model/chapterChat';
const context: ChatContext = {
  source: 'cursor',
  text: 'Texto',
  surrounding: '',
  title: '',
  bookTitle: '',
  persona: { instruction: '', version: '' },
  lore: [],
  target: null,
  truncated: false,
};
const args = ['author', 'book', 'chapter', 'conversation'] as const;
beforeEach(() => localStorage.clear());
describe('identidade da recuperação legada', () => {
  it('retém a instância estável e descarta tentativa efêmera e campos de credencial', () => {
    const request = {
      requestId: 'request',
      messageInstance: 'instance',
      text: 'Pedido',
      context,
      generationAttempt: 'ephemeral-attempt',
      apiKey: 'do-not-store',
    } as ChatPendingRequest;
    writeChatRecovery(...args, { draft: 'Rascunho', request });
    expect(readChatRecovery(...args)?.request?.messageInstance).toBe('instance');
    const raw = localStorage.getItem('writer:chapter-chat:author:book:chapter:conversation')!;
    expect(raw).not.toContain('ephemeral-attempt');
    expect(raw).not.toContain('do-not-store');
  });
  it('mantém compatibilidade com recuperação antiga sem instância e rejeita identidade inválida', () => {
    writeChatRecovery(...args, {
      draft: 'Rascunho',
      request: { requestId: 'request', text: 'Pedido', context },
    });
    expect(readChatRecovery(...args)?.request?.requestId).toBe('request');
    expect(() =>
      writeChatRecovery(...args, {
        draft: '',
        request: { requestId: 'request', messageInstance: 'wrong/path', text: 'Pedido', context },
      }),
    ).toThrow();
    expect(readChatRecovery('other', 'book', 'chapter', 'conversation')).toBeNull();
  });
});
