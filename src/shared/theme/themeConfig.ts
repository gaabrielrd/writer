export type Theme = 'light' | 'dark' | 'sepia' | 'system';

export interface ThemeOption {
  id: Theme;
  label: string;
  iconName: 'sun' | 'moon' | 'book' | 'laptop';
}

export const THEME_STORAGE_KEY = 'writer_theme';

export const THEME_OPTIONS: ThemeOption[] = [
  { id: 'light', label: 'Claro', iconName: 'sun' },
  { id: 'dark', label: 'Escuro', iconName: 'moon' },
  { id: 'sepia', label: 'Sépia (Pergaminho)', iconName: 'book' },
  { id: 'system', label: 'Sistema', iconName: 'laptop' },
];
