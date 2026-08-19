import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { type Theme } from './themeConfig';
import { ThemeContext } from './ThemeContext';
import { getStoredTheme, saveStoredTheme } from '../services/themeStorage';

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
}: {
  children: ReactNode;
  defaultTheme?: Theme;
}) {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme(defaultTheme));
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() => getSystemTheme());

  const resolvedTheme: 'light' | 'dark' | 'sepia' = theme === 'system' ? systemTheme : theme;

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    saveStoredTheme(newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const order: Array<'light' | 'dark' | 'sepia'> = ['light', 'dark', 'sepia'];
      const currentResolved = current === 'system' ? systemTheme : current;
      const nextIndex = (order.indexOf(currentResolved) + 1) % order.length;
      const next = order[nextIndex] ?? 'light';
      saveStoredTheme(next);
      return next;
    });
  }, [systemTheme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark', 'sepia');

    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
    } else if (resolvedTheme === 'sepia') {
      root.classList.add('sepia');
    } else {
      root.classList.add('light');
    }

    root.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
