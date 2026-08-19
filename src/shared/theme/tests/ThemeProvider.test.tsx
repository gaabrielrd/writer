import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
import { ThemeProvider, useTheme, ThemeToggle, ThemeSelect } from '../index';
import { THEME_STORAGE_KEY } from '../themeConfig';

function ThemeConsumer() {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button onClick={() => setTheme('dark')}>Set Dark</button>
      <button onClick={() => setTheme('sepia')}>Set Sepia</button>
      <button onClick={() => setTheme('light')}>Set Light</button>
      <button onClick={toggleTheme}>Toggle</button>
      <ThemeToggle showLabel />
      <ThemeSelect />
    </div>
  );
}

describe('ThemeProvider & Theme Hooks', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
  });

  it('inicializa com tema padrao e aplica atributos no html', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <ThemeConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(screen.getByTestId('resolved')).toHaveTextContent('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });

  it('permite mudar tema para dark e sepia com persistencia no localStorage', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <ThemeConsumer />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByText('Set Dark'));
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    fireEvent.click(screen.getByText('Set Sepia'));
    expect(screen.getByTestId('theme')).toHaveTextContent('sepia');
    expect(document.documentElement.getAttribute('data-theme')).toBe('sepia');
    expect(document.documentElement.classList.contains('sepia')).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('sepia');
  });

  it('alterna sequencialmente entre os temas com toggleTheme', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <ThemeConsumer />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByText('Toggle'));
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');

    fireEvent.click(screen.getByText('Toggle'));
    expect(screen.getByTestId('resolved')).toHaveTextContent('sepia');

    fireEvent.click(screen.getByText('Toggle'));
    expect(screen.getByTestId('resolved')).toHaveTextContent('light');
  });

  it('renderiza ThemeToggle e ThemeSelect sem erros', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <ThemeConsumer />
      </ThemeProvider>,
    );

    const toggleBtn = screen.getByRole('button', {
      name: /Alternar tema/i,
    });
    expect(toggleBtn).toBeInTheDocument();
    fireEvent.click(toggleBtn);

    const select = screen.getByRole('combobox', {
      name: /Selecionar tema visual/i,
    });
    expect(select).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'sepia' } });
    expect(screen.getByTestId('resolved')).toHaveTextContent('sepia');
  });
});
