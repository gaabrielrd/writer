import { webcrypto } from 'node:crypto';
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  CHAT_COMMANDS,
  chatDocumentHash,
  parseChatCommand,
  relevantChatLore,
  type ChatContext,
} from '../model/chapterChat';
import {
  readChatRecovery,
  writeChatRecovery,
  clearChatRecovery,
} from '../services/chatDraftStorage';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});
describe('contexto e comandos do chat', () => {
  it('conserva snapshot público e legado na recuperação, sem gravar credenciais acidentais', () => {
    const context: ChatContext = {
      source: 'cursor',
      text: '',
      surrounding: '',
      title: '',
      bookTitle: '',
      target: null,
      truncated: false,
      persona: { instruction: '', version: '' },
      lore: [],
    };
    const generation = {
      version: 1,
      provider: 'openai_byok',
      model: 'gpt-6-luna',
      reasoning: 'max',
    } as const;
    const request = { requestId: 'pending', text: 'Pedido', context, generation };
    const extended = { ...request, apiKey: 'fake-private-key' };
    writeChatRecovery('author', 'book', 'chapter', 'conversation', {
      draft: 'Rascunho',
      request: extended,
    });
    const storageKey = 'writer:chapter-chat:author:book:chapter:conversation';
    expect(localStorage.getItem(storageKey)).not.toContain('fake-private-key');
    expect(readChatRecovery('author', 'book', 'chapter', 'conversation')?.request).toEqual(request);
    const invalid = { ...request, generation: { ...generation, apiKey: 'fake-key' } };
    expect(() =>
      writeChatRecovery('author', 'book', 'chapter', 'conversation', {
        draft: '',
        request: invalid,
      }),
    ).toThrow('recuperação inválida');
    localStorage.setItem(storageKey, JSON.stringify({ draft: 'Conservar', request: invalid }));
    expect(readChatRecovery('author', 'book', 'chapter', 'conversation')).toEqual({
      draft: 'Conservar',
    });
    const legacy = { requestId: 'old', text: 'Pedido antigo', context };
    writeChatRecovery('author', 'book', 'chapter', 'conversation', { draft: '', request: legacy });
    expect(readChatRecovery('author', 'book', 'chapter', 'conversation')?.request).toEqual(legacy);
  });
  it('resolve todos os comandos e preserva pedidos livres e parâmetros', () => {
    for (const command of CHAT_COMMANDS)
      expect(parseChatCommand(`/${command.name} minhas orientações`)).toEqual({
        command: command.name,
        instruction: 'minhas orientações',
      });
    expect(parseChatCommand('Ajude com a cena')).toEqual({
      command: null,
      instruction: 'Ajude com a cena',
    });
    expect(parseChatCommand('/ajuda')).toEqual({ command: 'ajuda', instruction: '' });
    expect(() => parseChatCommand('/desconhecido')).toThrow('Comando desconhecido');
  });
  it('prioriza somente menções e aliases presentes, com limite de 12 fichas', () => {
    const entities = Array.from({ length: 15 }, (_, index) => ({
      name: `Lia ${index}`,
      aliases: ['Lia'],
      category: 'character',
      summary: 'Viajante',
    }));
    expect(relevantChatLore(entities, 'LIA chegou')).toHaveLength(12);
    expect(relevantChatLore(entities, 'Outra cena')).toEqual([]);
    expect(relevantChatLore([{ name: '', category: 'other', summary: '' }], 'Texto')).toEqual([]);
  });
  it('identifica alterações no documento por hash SHA-256', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const value = await chatDocumentHash('<p>Texto</p>');
    expect(value).toMatch(/^[a-f0-9]{64}$/);
    expect(await chatDocumentHash('<p>Outro</p>')).not.toBe(value);
  });
  it('isola rascunhos e pedidos por conta, capítulo e conversa e lida com dados inválidos', () => {
    writeChatRecovery('author', 'book', 'chapter', 'conversation', { draft: 'Rascunho' });
    expect(readChatRecovery('author', 'book', 'chapter', 'conversation')).toEqual({
      draft: 'Rascunho',
    });
    expect(readChatRecovery('intruder', 'book', 'chapter', 'conversation')).toBeNull();
    expect(readChatRecovery('author', 'book', 'other', 'conversation')).toBeNull();
    clearChatRecovery('author', 'book', 'chapter', 'conversation');
    expect(readChatRecovery('author', 'book', 'chapter', 'conversation')).toBeNull();
    localStorage.setItem('writer:chapter-chat:author:book:chapter:conversation', 'invalid');
    expect(readChatRecovery('author', 'book', 'chapter', 'conversation')).toBeNull();
  });
});
