import { describe, expect, it, vi } from 'vitest';
import { parseWorkspacePreferences } from '../model/workspacePreferences';
import {
  readWorkspacePreferences,
  saveWorkspacePreferences,
  subscribeWorkspacePreferences,
} from '../services/workspacePreferencesStorage';

describe('preferências do espaço de escrita', () => {
  it('conserva a proporção após reler e isola usuários sem alterar rascunhos', () => {
    localStorage.setItem('writer:draft:author:book:chapter', 'rascunho');
    expect(readWorkspacePreferences('author')).toEqual({ panelPercent: 40 });
    expect(saveWorkspacePreferences('author', { panelPercent: 52 })).toBe(true);
    expect(readWorkspacePreferences('author')).toEqual({ panelPercent: 52 });
    expect(readWorkspacePreferences('other')).toEqual({ panelPercent: 40 });
    expect(localStorage.getItem('writer:draft:author:book:chapter')).toBe('rascunho');
  });

  it('recupera a versão anterior sem regravar ou remover a preferência', () => {
    const previous = JSON.stringify({ version: 0, widthPercent: 35 });
    localStorage.setItem('writer:editor-workspace:author', previous);
    expect(readWorkspacePreferences('author')).toEqual({ panelPercent: 35 });
    expect(localStorage.getItem('writer:editor-workspace:author')).toBe(previous);
    saveWorkspacePreferences('author', { panelPercent: 36 });
    expect(readWorkspacePreferences('author')).toEqual({ panelPercent: 36 });
  });

  it.each([
    null,
    '40',
    { version: 2, panelPercent: 40 },
    { version: 1, panelPercent: 0 },
    { version: 1, panelPercent: 71 },
    { version: 1, panelPercent: NaN },
    { version: 1, panelPercent: '40' },
    { version: 0, widthPercent: Infinity },
  ])('usa o padrão para dados inválidos: %j', (value) => {
    expect(parseWorkspacePreferences(value)).toEqual({ panelPercent: 40 });
  });

  it('preserva dados ilegíveis e rejeita gravações inválidas', () => {
    localStorage.setItem('writer:editor-workspace:author', '{broken');
    expect(readWorkspacePreferences('author')).toEqual({ panelPercent: 40 });
    expect(localStorage.getItem('writer:editor-workspace:author')).toBe('{broken');
    expect(saveWorkspacePreferences('', { panelPercent: 40 })).toBe(false);
    expect(saveWorkspacePreferences('author', { panelPercent: 80 })).toBe(false);
    expect(readWorkspacePreferences('')).toEqual({ panelPercent: 40 });
  });

  it('informa falhas de gravação e tolera leitura indisponível', () => {
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('indisponível');
    });
    expect(readWorkspacePreferences('author')).toEqual({ panelPercent: 40 });
    read.mockRestore();
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('sem espaço');
    });
    expect(saveWorkspacePreferences('author', { panelPercent: 45 })).toBe(false);
    write.mockRestore();
  });

  it('observa apenas o usuário atual, inclusive outras abas, e libera listeners', () => {
    const callback = vi.fn();
    const unsubscribe = subscribeWorkspacePreferences('author', callback);
    saveWorkspacePreferences('other', { panelPercent: 30 });
    expect(callback).not.toHaveBeenCalled();
    saveWorkspacePreferences('author', { panelPercent: 30 });
    expect(callback).toHaveBeenCalledTimes(1);
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'writer:editor-workspace:other',
        storageArea: localStorage,
      }),
    );
    expect(callback).toHaveBeenCalledTimes(1);
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'writer:editor-workspace:author',
        storageArea: localStorage,
      }),
    );
    window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage }));
    expect(callback).toHaveBeenCalledTimes(3);
    unsubscribe();
    saveWorkspacePreferences('author', { panelPercent: 50 });
    expect(callback).toHaveBeenCalledTimes(3);
  });
});
