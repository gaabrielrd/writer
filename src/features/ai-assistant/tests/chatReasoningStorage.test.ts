import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readChatReasoningDefault,
  writeChatReasoningDefault,
} from '../services/chatReasoningStorage';
beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});
describe('padrão de raciocínio privado por usuário/navegador', () => {
  it('começa em Auto, conserva a escolha e isola usuários', () => {
    expect(readChatReasoningDefault('author')).toBe('auto');
    expect(writeChatReasoningDefault('author', 'max')).toBe(true);
    expect(readChatReasoningDefault('author')).toBe('max');
    expect(readChatReasoningDefault('other')).toBe('auto');
    expect(writeChatReasoningDefault('other', 'none')).toBe(true);
    expect(readChatReasoningDefault('author')).toBe('max');
  });
  it.each([
    '{',
    '{"version":2,"reasoning":"max"}',
    '{"version":1,"reasoning":"invalid"}',
    'null',
    '[]',
  ])('usa Auto para persistência inválida: %s', (raw) => {
    localStorage.setItem('writer:chat-reasoning:author', raw);
    expect(readChatReasoningDefault('author')).toBe('auto');
  });
  it('tolera armazenamento indisponível e permite nova tentativa de salvar', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readChatReasoningDefault('author')).toBe('auto');
    get.mockRestore();
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(writeChatReasoningDefault('author', 'high')).toBe(false);
    set.mockRestore();
    expect(writeChatReasoningDefault('author', 'high')).toBe(true);
    expect(readChatReasoningDefault('author')).toBe('high');
  });
});
