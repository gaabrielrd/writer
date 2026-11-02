import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readContentWidth, saveContentWidth } from '../workspacePreferencesStorage';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('preferência de largura dos painéis', () => {
  it('usa médio por padrão e ignora valores desconhecidos', () => {
    expect(readContentWidth()).toBe('medium');
    localStorage.setItem('writer:workspace-content-width', 'invalid');
    expect(readContentWidth()).toBe('medium');
  });

  it.each(['small', 'medium', 'large'] as const)('recupera a escolha %s', (width) => {
    saveContentWidth(width);
    expect(readContentWidth()).toBe(width);
  });

  it('mantém o padrão quando o navegador bloqueia o armazenamento', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readContentWidth()).toBe('medium');
    expect(() => saveContentWidth('large')).not.toThrow();
  });
});
