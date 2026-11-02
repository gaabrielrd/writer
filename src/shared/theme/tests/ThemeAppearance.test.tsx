import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ThemeProvider, useTheme, COLOR_TOKENS, type ThemePalette } from '../index';
const palette = Object.fromEntries(
  COLOR_TOKENS.map((key) => [key, key.includes('foreground') ? '#ffffff' : '#123456']),
) as ThemePalette;
function Consumer() {
  const { setCustomTheme, previewTheme, registerThemeRequest, requestTheme, setTheme } = useTheme();
  return (
    <>
      <button onClick={() => setCustomTheme({ id: 'saved', base: 'dark', palette })}>
        Aplicar
      </button>
      <button
        onClick={() =>
          previewTheme({
            id: 'draft',
            base: 'light',
            palette: { ...palette, background: '#fafafa' },
          })
        }
      >
        Prévia
      </button>
      <button onClick={() => previewTheme(null)}>Cancelar</button>
      <button onClick={() => setTheme('sepia')}>Nativo</button>
      <button onClick={() => registerThemeRequest(() => setTheme('dark'))}>Interceptar</button>
      <button onClick={() => requestTheme('light')}>Solicitar</button>
    </>
  );
}
it('restaura o tema salvo após a prévia e remove todos os overrides ao aplicar nativo', () => {
  const view = render(
    <ThemeProvider defaultTheme="light">
      <Consumer />
    </ThemeProvider>,
  );
  fireEvent.click(screen.getByText('Aplicar'));
  expect(document.documentElement).toHaveAttribute('data-custom-theme', 'saved');
  expect(document.documentElement.style.colorScheme).toBe('dark');
  fireEvent.click(screen.getByText('Prévia'));
  expect(document.documentElement).toHaveAttribute('data-custom-theme', 'draft');
  fireEvent.click(screen.getByText('Cancelar'));
  expect(document.documentElement).toHaveAttribute('data-custom-theme', 'saved');
  fireEvent.click(screen.getByText('Nativo'));
  for (const key of COLOR_TOKENS)
    expect(document.documentElement.style.getPropertyValue('--' + key)).toBe('');
  expect(document.documentElement).not.toHaveAttribute('data-custom-theme');
  fireEvent.click(screen.getByText('Interceptar'));
  fireEvent.click(screen.getByText('Solicitar'));
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  view.unmount();
  expect(document.documentElement.style.colorScheme).toBe('');
});
