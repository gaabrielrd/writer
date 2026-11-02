// @vitest-environment node
import { expect, it } from 'vitest';
import {
  backgroundColor,
  backgroundSettings,
  DEFAULT_BACKGROUND,
  generatePalette,
  newTheme,
  paletteIssues,
  sameThemeContent,
  validateTheme,
} from '../model/customTheme';
for (const base of ['light', 'dark'] as const)
  for (const intensity of [0, 50, 100])
    for (const hue of ['#808080', '#ff0000', '#00ff00', '#0000ff'])
      for (const style of ['neutral', 'tonal', 'expressive'] as const) {
        it(`gera fundo ${base} ${intensity} ${hue} ${style} preservando contraste`, () => {
          const settings = { backgroundIntensity: intensity, backgroundHue: hue };
          const palette = generatePalette(base, '#28795a', style, settings);
          expect(palette.background).toBe(backgroundColor(base, settings));
          expect(paletteIssues(palette)).toEqual([]);
          if (intensity === 0)
            expect(palette.background).toBe(base === 'dark' ? '#000000' : '#ffffff');
        });
      }
it('mantém os extremos neutros e permite tingir sem mudar a intensidade', () => {
  expect(backgroundColor('light', { backgroundIntensity: 100, backgroundHue: '#808080' })).toBe(
    '#e0e0e0',
  );
  expect(backgroundColor('dark', { backgroundIntensity: 100, backgroundHue: '#808080' })).toBe(
    '#303030',
  );
  expect(newTheme('dark').base).toBe('dark');
  const theme = { ...newTheme(), name: 'Meu tema' };
  expect(backgroundSettings(theme)).toEqual(DEFAULT_BACKGROUND);
  expect(sameThemeContent(theme, { ...theme, backgroundIntensity: 70 })).toBe(false);
  expect(sameThemeContent(theme, { ...theme, backgroundHue: '#00ff00' })).toBe(false);
  for (const patch of [
    { backgroundIntensity: -1 },
    { backgroundIntensity: 101 },
    { backgroundIntensity: 0.1 },
    { backgroundHue: 'red' },
    { generatorVersion: 3 },
  ])
    expect(() => validateTheme({ ...theme, ...patch })).toThrow();
  expect(() =>
    generatePalette('light', '#28795a', 'neutral', {
      backgroundIntensity: 101,
      backgroundHue: '#808080',
    }),
  ).toThrow('fundo');
});
it('abre temas antigos preservando a paleta salva e deriva controles sem alterar o registro', () => {
  const rest = newTheme();
  delete rest.backgroundIntensity;
  delete rest.backgroundHue;
  const legacy = {
    ...rest,
    name: 'Antigo',
    generatorVersion: 1 as const,
    palette: generatePalette('light', '#28795a', 'tonal'),
  };
  const original = structuredClone(legacy);
  expect(validateTheme(legacy)).toEqual(legacy);
  expect(backgroundSettings(legacy).backgroundIntensity).toBeGreaterThanOrEqual(0);
  expect(
    backgroundSettings({
      ...legacy,
      base: 'dark',
      palette: generatePalette('dark', '#28795a', 'tonal'),
    }).backgroundIntensity,
  ).toBeGreaterThanOrEqual(0);
  expect(legacy).toEqual(original);
});
