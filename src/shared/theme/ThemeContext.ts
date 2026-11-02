import { createContext } from 'react';
import type { Theme } from './themeConfig';
import type { ThemeAppearance } from './themeTokens';
export interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: 'light' | 'dark' | 'sepia';
  customTheme: ThemeAppearance | null;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  requestTheme: (theme: Theme) => void;
  registerThemeRequest: (handler: ((theme: Theme) => void) | null) => void;
  setCustomTheme: (appearance: ThemeAppearance | null) => void;
  previewTheme: (appearance: ThemeAppearance | null) => void;
}
export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
