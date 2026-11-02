import { COLOR_TOKENS, type ColorToken, type ThemeBase, type ThemePalette } from '@/shared/theme';
export const MAX_THEMES = 5;
export const STYLES = ['neutral', 'tonal', 'expressive'] as const;
export type PaletteStyle = (typeof STYLES)[number];
export interface CustomTheme {
  id: string;
  name: string;
  base: ThemeBase;
  highlight: string;
  style: PaletteStyle;
  overrides: Partial<ThemePalette>;
  palette: ThemePalette;
  generatorVersion: 1;
  revision: number;
  createdAt: number;
  updatedAt: number;
}
export interface ThemeCatalog {
  schemaVersion: 1;
  revision: number;
  themes: CustomTheme[];
}
export const emptyCatalog = (): ThemeCatalog => ({ schemaVersion: 1, revision: 0, themes: [] });
export const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[\da-f]{6}$/i.test(v);
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
export function mix(a: string, b: string, amount: number): string {
  const other = rgb(b);
  return (
    '#' +
    rgb(a)
      .map((v, i) =>
        Math.round(v * (1 - amount) + other[i]! * amount)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
const luminance = (hex: string) =>
  rgb(hex)
    .map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i]!, 0);
export function contrast(a: string, b: string): number {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export const readableText = (bg: string) =>
  contrast(bg, '#000000') >= contrast(bg, '#ffffff') ? '#000000' : '#ffffff';
export function ensureContrast(color: string, bg: string, target = 4.5): string {
  if (contrast(color, bg) >= target) return color;
  const destination = readableText(bg);
  for (let i = 1; i <= 100; i++) {
    const c = mix(color, destination, i / 100);
    if (contrast(c, bg) >= target) return c;
  }
  return destination;
}
export function generatePalette(
  base: ThemeBase,
  highlight: string,
  style: PaletteStyle,
): ThemePalette {
  if (!isHex(highlight)) throw new Error('Use uma cor hexadecimal com seis dígitos.');
  const dark = base === 'dark',
    tint = style === 'neutral' ? 0 : style === 'tonal' ? 0.035 : 0.09;
  const background = mix(dark ? '#151515' : '#fafafa', highlight, tint);
  const card = mix(dark ? '#222222' : '#ffffff', highlight, tint);
  const secondary = mix(dark ? '#303030' : '#ededed', highlight, tint * 2);
  const muted = mix(dark ? '#292929' : '#f1f1f1', highlight, tint);
  const accent = mix(
    dark ? '#383838' : '#e6e6e6',
    highlight,
    style === 'expressive' ? 0.25 : tint * 2,
  );
  const foreground = dark ? '#f5f5f5' : '#202020';
  const primary = ensureContrast(highlight, background, 4.6),
    primaryText = readableText(primary);
  const success = ensureContrast('#228b52', background, 3),
    warning = ensureContrast('#ac7200', background, 3),
    destructive = ensureContrast('#cb3737', background, 3);
  return {
    background,
    foreground,
    card,
    'card-foreground': foreground,
    popover: card,
    'popover-foreground': foreground,
    primary,
    'primary-hover': mix(primary, primaryText === '#ffffff' ? '#000000' : '#ffffff', 0.1),
    'primary-foreground': primaryText,
    secondary,
    'secondary-foreground': foreground,
    muted,
    'muted-foreground': ensureContrast(dark ? '#aaaaaa' : '#707070', muted, 4.7),
    accent,
    'accent-foreground': foreground,
    destructive,
    'destructive-foreground': readableText(destructive),
    border: mix(background, foreground, 0.25),
    input: ensureContrast(mix(background, foreground, 0.4), background, 3.1),
    ring: ensureContrast(primary, card, 3.1),
    success,
    'success-foreground': readableText(success),
    warning,
    'warning-foreground': readableText(warning),
  };
}
export const TOKEN_GROUPS: { title: string; tokens: ColorToken[] }[] = [
  { title: 'Página', tokens: ['background', 'foreground'] },
  { title: 'Superfícies', tokens: ['card', 'card-foreground', 'popover', 'popover-foreground'] },
  { title: 'Ações principais', tokens: ['primary', 'primary-hover', 'primary-foreground'] },
  {
    title: 'Áreas secundárias',
    tokens: [
      'secondary',
      'secondary-foreground',
      'muted',
      'muted-foreground',
      'accent',
      'accent-foreground',
    ],
  },
  { title: 'Controles', tokens: ['border', 'input', 'ring'] },
  {
    title: 'Estados',
    tokens: [
      'success',
      'success-foreground',
      'warning',
      'warning-foreground',
      'destructive',
      'destructive-foreground',
    ],
  },
];
export const TOKEN_LABELS: Record<ColorToken, string> = {
  background: 'Fundo da página',
  foreground: 'Texto principal',
  card: 'Fundo dos cards',
  'card-foreground': 'Texto dos cards',
  popover: 'Fundo dos menus',
  'popover-foreground': 'Texto dos menus',
  primary: 'Cor principal',
  'primary-hover': 'Cor principal ao passar o mouse',
  'primary-foreground': 'Texto sobre a cor principal',
  secondary: 'Fundo secundário',
  'secondary-foreground': 'Texto secundário',
  muted: 'Fundo discreto',
  'muted-foreground': 'Texto discreto',
  accent: 'Fundo de seleção',
  'accent-foreground': 'Texto da seleção',
  border: 'Bordas',
  input: 'Bordas dos campos',
  ring: 'Indicador de foco',
  success: 'Sucesso',
  'success-foreground': 'Texto de sucesso',
  warning: 'Aviso',
  'warning-foreground': 'Texto de aviso',
  destructive: 'Erro',
  'destructive-foreground': 'Texto de erro',
};
const PAIRS: [ColorToken, ColorToken, number][] = [
  ['foreground', 'background', 4.5],
  ['card-foreground', 'card', 4.5],
  ['popover-foreground', 'popover', 4.5],
  ['primary-foreground', 'primary', 4.5],
  ['primary-foreground', 'primary-hover', 4.5],
  ['secondary-foreground', 'secondary', 4.5],
  ['muted-foreground', 'muted', 4.5],
  ['muted-foreground', 'background', 4.5],
  ['accent-foreground', 'accent', 4.5],
  ['success-foreground', 'success', 4.5],
  ['warning-foreground', 'warning', 4.5],
  ['destructive-foreground', 'destructive', 4.5],
  ['ring', 'background', 3],
  ['ring', 'card', 3],
  ['input', 'background', 3],
];
export function paletteIssues(p: ThemePalette) {
  return PAIRS.filter(([a, b, r]) => contrast(p[a], p[b]) < r).map(([a, b, ratio]) => ({
    a,
    b,
    ratio,
  }));
}
export function repairPalette(palette: ThemePalette): ThemePalette {
  const p = { ...palette };
  for (let pass = 0; pass < 3; pass++)
    for (const [a, b, r] of PAIRS) p[a] = ensureContrast(p[a], p[b], r + 0.05);
  p['primary-foreground'] = readableText(p.primary);
  p['primary-hover'] = ensureContrast(p['primary-hover'], p['primary-foreground'], 4.55);
  return p;
}
export function validateTheme(v: unknown): CustomTheme {
  if (!v || typeof v !== 'object') throw new Error('Tema inválido.');
  const t = v as CustomTheme;
  if (
    Object.keys(t).length !== 11 ||
    !/^custom-[a-zA-Z0-9-]{1,64}$/.test(t.id) ||
    typeof t.name !== 'string' ||
    !t.name.trim() ||
    t.name.trim().length > 40 ||
    !['light', 'dark'].includes(t.base) ||
    !STYLES.includes(t.style) ||
    !isHex(t.highlight) ||
    t.generatorVersion !== 1 ||
    !Number.isInteger(t.revision) ||
    t.revision < 0 ||
    !Number.isSafeInteger(t.createdAt) ||
    t.createdAt < 0 ||
    !Number.isSafeInteger(t.updatedAt) ||
    t.updatedAt < t.createdAt ||
    !t.palette ||
    !t.overrides ||
    Object.keys(t.palette).length !== COLOR_TOKENS.length ||
    !COLOR_TOKENS.every((k) => isHex(t.palette[k])) ||
    !Object.entries(t.overrides).every(
      ([k, c]) =>
        COLOR_TOKENS.includes(k as ColorToken) && isHex(c) && t.palette[k as ColorToken] === c,
    )
  )
    throw new Error('Tema inválido.');
  return { ...t, name: t.name.trim() };
}
export function validateCatalog(v: unknown): ThemeCatalog {
  const c = v as ThemeCatalog;
  if (
    !c ||
    c.schemaVersion !== 1 ||
    !Number.isInteger(c.revision) ||
    c.revision < 0 ||
    !Array.isArray(c.themes) ||
    c.themes.length > MAX_THEMES
  )
    throw new Error('Catálogo de temas inválido.');
  const themes = c.themes.map(validateTheme);
  if (
    new Set(themes.map((t) => t.id)).size !== themes.length ||
    new Set(themes.map((t) => t.name.toLocaleLowerCase())).size !== themes.length
  )
    throw new Error('Existem temas duplicados.');
  return { ...c, themes };
}
export function newTheme(): CustomTheme {
  return {
    id: `custom-${crypto.randomUUID()}`,
    name: '',
    base: 'light',
    highlight: '#8a5830',
    style: 'neutral',
    overrides: {},
    palette: generatePalette('light', '#8a5830', 'neutral'),
    generatorVersion: 1,
    revision: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

export function sameThemeContent(a: CustomTheme, b: CustomTheme): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.base === b.base &&
    a.highlight === b.highlight &&
    a.style === b.style &&
    a.generatorVersion === b.generatorVersion &&
    COLOR_TOKENS.every(
      (key) => a.palette[key] === b.palette[key] && a.overrides[key] === b.overrides[key],
    )
  );
}
