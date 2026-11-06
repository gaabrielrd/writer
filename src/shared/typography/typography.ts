export const FONT_FAMILIES = [
  'Libre Baskerville',
  'Source Sans 3',
  'Source Serif 4',
  'EB Garamond',
  'IBM Plex Sans',
  'Lora',
  'Nunito Sans',
  'Literata',
  'Cormorant Garamond',
  'Crimson Pro',
] as const;
export type FontFamily = (typeof FONT_FAMILIES)[number];

// Calibrate prose by its actual family, including custom combinations.
export function readingMetrics(font: FontFamily) {
  if (font === 'EB Garamond' || font === 'Crimson Pro') {
    return { size: '1.25rem', measure: '36rem', leading: '1.65' };
  }
  return { size: '1.125rem', measure: '38rem', leading: '1.7' };
}

export interface TypographyFonts {
  titles: FontFamily;
  interface: FontFamily;
  editor: FontFamily;
}
export const TYPOGRAPHY_PRESETS = [
  {
    id: 'classic',
    name: 'Clássico editorial',
    description: 'Títulos clássicos, interface discreta e prosa sóbria.',
    fonts: { titles: 'Libre Baskerville', interface: 'Source Sans 3', editor: 'Source Serif 4' },
  },
  {
    id: 'romance',
    name: 'Romance humanista',
    description: 'A delicadeza do romance impresso, com controles bem definidos.',
    fonts: { titles: 'EB Garamond', interface: 'IBM Plex Sans', editor: 'EB Garamond' },
  },
  {
    id: 'contemporary',
    name: 'Contemporâneo acolhedor',
    description: 'Serifas expressivas e uma interface de formas suaves.',
    fonts: { titles: 'Lora', interface: 'Nunito Sans', editor: 'Lora' },
  },
  {
    id: 'digital',
    name: 'Leitura digital',
    description: 'Uma composição contida para colocar a leitura no centro.',
    fonts: { titles: 'Literata', interface: 'Source Sans 3', editor: 'Literata' },
  },
  {
    id: 'poetic',
    name: 'Poético',
    description: 'Títulos expressivos e prosa delicada para uma voz autoral.',
    fonts: { titles: 'Cormorant Garamond', interface: 'IBM Plex Sans', editor: 'Crimson Pro' },
  },
] as const satisfies readonly {
  id: string;
  name: string;
  description: string;
  fonts: TypographyFonts;
}[];
export type TypographyPresetId = (typeof TYPOGRAPHY_PRESETS)[number]['id'];
export interface TypographyPreferences {
  version: 1;
  preset: TypographyPresetId | 'custom';
  customFonts: TypographyFonts;
}
export function defaultTypography(): TypographyPreferences {
  return { version: 1, preset: 'classic', customFonts: { ...TYPOGRAPHY_PRESETS[0].fonts } };
}
export function isFontFamily(value: unknown): value is FontFamily {
  return FONT_FAMILIES.some((font) => font === value);
}
export function parseTypography(value: unknown): TypographyPreferences | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    record.version !== 1 ||
    (record.preset !== 'custom' && !TYPOGRAPHY_PRESETS.some((p) => p.id === record.preset))
  )
    return null;
  const fonts = record.customFonts;
  if (!fonts || typeof fonts !== 'object' || Array.isArray(fonts)) return null;
  const fields = fonts as Record<string, unknown>;
  if (
    !isFontFamily(fields.titles) ||
    !isFontFamily(fields.interface) ||
    !isFontFamily(fields.editor)
  )
    return null;
  return {
    version: 1,
    preset: record.preset as TypographyPreferences['preset'],
    customFonts: { titles: fields.titles, interface: fields.interface, editor: fields.editor },
  };
}
export function typographyFonts(preferences: TypographyPreferences): TypographyFonts {
  return preferences.preset === 'custom'
    ? preferences.customFonts
    : (TYPOGRAPHY_PRESETS.find((p) => p.id === preferences.preset) ?? TYPOGRAPHY_PRESETS[0]).fonts;
}
export function fontStack(font: FontFamily): string {
  const sans = font === 'Source Sans 3' || font === 'IBM Plex Sans' || font === 'Nunito Sans';
  return `"${font}", ${sans ? '"Segoe UI", sans-serif' : 'Georgia, "Times New Roman", serif'}`;
}
