import { createContext } from 'react';
import type { Theme } from './themeConfig';

export interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: 'light' | 'dark' | 'sepia';
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
