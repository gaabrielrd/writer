import { describe, expect, it, beforeEach } from 'vitest';
import { getStoredTheme, saveStoredTheme } from '../themeStorage';
import { THEME_STORAGE_KEY } from '../../theme/themeConfig';

describe('themeStorage service', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('retorna o tema padrao se nao houver valor no localStorage', () => {
    expect(getStoredTheme('dark')).toBe('dark');
  });

  it('retorna o tema gravado se for valido', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    expect(getStoredTheme('light')).toBe('sepia');
  });

  it('grava o tema no localStorage', () => {
    saveStoredTheme('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });
});
