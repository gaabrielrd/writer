// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { COLOR_TOKENS, hexToChannels } from '@/shared/theme';
import {
  generatePalette,
  contrast,
  ensureContrast,
  paletteIssues,
  repairPalette,
  newTheme,
  validateTheme,
  validateCatalog,
  emptyCatalog,
  STYLES,
} from '../model/customTheme';
describe('paletas personalizadas', () => {
  for (const base of ['light', 'dark'] as const)
    for (const color of [
      '#000000',
      '#ffffff',
      '#ff0000',
      '#00ff00',
      '#0000ff',
      '#888888',
      '#8a5830',
    ])
      for (const style of STYLES) {
        it(`gera ${base} / ${color} / ${style} com contraste e tokens completos`, () => {
          const palette = generatePalette(base, color, style);
          expect(Object.keys(palette)).toHaveLength(24);
          expect(COLOR_TOKENS.every((key) => /^#[a-f0-9]{6}$/.test(palette[key]))).toBe(true);
          expect(paletteIssues(palette)).toEqual([]);
          expect(generatePalette(base, color, style)).toEqual(palette);
        });
      }
  it('diferencia sugestões e corrige ajustes de baixo contraste', () => {
    expect(generatePalette('light', '#28795a', 'neutral').background).not.toBe(
      generatePalette('light', '#28795a', 'expressive').background,
    );
    const bad = {
      ...generatePalette('light', '#28795a', 'tonal'),
      foreground: '#ffffff',
      ring: '#ffffff',
    };
    expect(paletteIssues(bad).length).toBeGreaterThan(0);
    expect(paletteIssues(repairPalette(bad))).toEqual([]);
    expect(contrast('#000000', '#ffffff')).toBe(21);
    expect(ensureContrast('#111111', '#ffffff')).toBe('#111111');
    expect(hexToChannels('#ffffff')).toBe('0.00 0.00% 100.00%');
    expect(hexToChannels('#ff0000')).toBe('0.00 100.00% 50.00%');
    expect(hexToChannels('#00ff00')).toBe('120.00 100.00% 50.00%');
    expect(hexToChannels('#0000ff')).toBe('240.00 100.00% 50.00%');
    expect(() => generatePalette('light', 'red', 'neutral')).toThrow('hexadecimal');
  });
  it('valida nome, cores, revisão, limite e duplicações do catálogo', () => {
    const theme = { ...newTheme(), name: '  Floresta  ' };
    expect(validateTheme(theme).name).toBe('Floresta');
    expect(validateCatalog(emptyCatalog()).themes).toEqual([]);
    for (const patch of [
      { name: '' },
      { base: 'sepia' },
      { id: 'native' },
      { palette: {} },
      { overrides: { background: 'url(test)' } },
      { createdAt: -1 },
      { revision: 0.5 },
      { highlight: 'red' },
    ])
      expect(() => validateTheme({ ...theme, ...patch })).toThrow();
    expect(() => validateTheme(null)).toThrow();
    expect(() => validateCatalog({ ...emptyCatalog(), themes: Array(6).fill(theme) })).toThrow();
    expect(() =>
      validateCatalog({
        ...emptyCatalog(),
        themes: [theme, { ...theme, id: 'custom-other', name: 'floresta' }],
      }),
    ).toThrow('duplicados');
    expect(() => validateCatalog({})).toThrow();
  });
});
