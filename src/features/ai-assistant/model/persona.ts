export * from '../../../../functions/src/personaProfile.mjs';

export const DEFAULT_PERSONA_AVATARS: Readonly<Record<string, string>> = {
  'preset-atmospheric': '/img/persona/01-atmosferico.png',
  'preset-incisive': '/img/persona/02-incisivo.png',
  'preset-intimate': '/img/persona/03-intimo.png',
  'preset-ironic': '/img/persona/04-ironico.png',
  'preset-epic': '/img/persona/05-epico.png',
  'preset-unsettling': '/img/persona/06-inquietante.png',
};

export const PERSONA_SOURCE_LABELS = {
  book: 'Livro',
  chapter: 'Complemento',
  override: 'Ajuste do capítulo',
} as const;
