import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { type Theme } from './themeConfig';
import { COLOR_TOKENS, hexToChannels, type ThemeAppearance } from './themeTokens';
import { ThemeContext } from './ThemeContext';
import { getStoredTheme, saveStoredTheme } from '../services/themeStorage';
function getSystemTheme(): 'light' | 'dark' {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}
export function ThemeProvider({
  children,
  defaultTheme = 'system',
}: {
  children: ReactNode;
  defaultTheme?: Theme;
}) {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme(defaultTheme));
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);
  const [customTheme, setCustomTheme] = useState<ThemeAppearance | null>(null);
  const [preview, previewTheme] = useState<ThemeAppearance | null>(null);
  const appearance = preview ?? customTheme;
  const resolvedTheme = appearance?.base ?? (theme === 'system' ? systemTheme : theme);
  const setTheme = useCallback((next: Theme) => {
    setCustomTheme(null);
    previewTheme(null);
    setThemeState(next);
    saveStoredTheme(next);
  }, []);
  const requestHandler = useRef<((theme: Theme) => void) | null>(null);
  const registerThemeRequest = useCallback((handler: ((theme: Theme) => void) | null) => {
    requestHandler.current = handler;
  }, []);
  const requestTheme = useCallback(
    (next: Theme) => {
      if (requestHandler.current) requestHandler.current(next);
      else setTheme(next);
    },
    [setTheme],
  );
  const toggleTheme = useCallback(() => {
    const order: Array<'light' | 'dark' | 'sepia'> = ['light', 'dark', 'sepia'];
    const next = order[(order.indexOf(resolvedTheme) + 1) % order.length];
    requestTheme(next ?? 'light');
  }, [resolvedTheme, requestTheme]);
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const change = (event: MediaQueryListEvent) => setSystemTheme(event.matches ? 'dark' : 'light');
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark', 'sepia');
    root.classList.add(resolvedTheme);
    root.setAttribute('data-theme', resolvedTheme);
    root.style.colorScheme = resolvedTheme === 'dark' ? 'dark' : 'light';
    for (const token of COLOR_TOKENS) {
      if (appearance)
        root.style.setProperty('--' + token, hexToChannels(appearance.palette[token]));
      else root.style.removeProperty('--' + token);
    }
    if (appearance) {
      root.setAttribute('data-custom-theme', appearance.id);
      root.style.setProperty('--badge-success-background', 'hsl(var(--success))');
      root.style.setProperty('--badge-success-foreground', 'hsl(var(--success-foreground))');
    } else {
      root.removeAttribute('data-custom-theme');
      root.style.removeProperty('--badge-success-background');
      root.style.removeProperty('--badge-success-foreground');
    }
    return () => {
      for (const token of COLOR_TOKENS) root.style.removeProperty('--' + token);
      root.style.removeProperty('--badge-success-background');
      root.style.removeProperty('--badge-success-foreground');
      root.style.removeProperty('color-scheme');
      root.removeAttribute('data-custom-theme');
    };
  }, [resolvedTheme, appearance]);
  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        customTheme,
        setTheme,
        requestTheme,
        registerThemeRequest,
        toggleTheme,
        setCustomTheme,
        previewTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
