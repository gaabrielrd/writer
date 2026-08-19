import { type Theme, THEME_STORAGE_KEY } from '../theme/themeConfig';

export function getStoredTheme(defaultTheme: Theme): Theme {
  if (typeof window === 'undefined') return defaultTheme;
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    if (
      saved &&
      (saved === 'light' || saved === 'dark' || saved === 'sepia' || saved === 'system')
    ) {
      return saved;
    }
  } catch {
    // Ignora erro
  }
  return defaultTheme;
}

export function saveStoredTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignora erro
  }
}
