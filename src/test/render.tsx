import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

/**
 * Wrapper para providers globais usados nos testes.
 * Adicione aqui os mesmos providers da aplicacao (tema, store, etc.).
 */
function AllProviders({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

/**
 * Helper de render que ja embrulha o componente com os providers da app
 * e retorna uma instancia de userEvent pronta para uso.
 */
export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return {
    user: userEvent.setup(),
    ...render(ui, { wrapper: AllProviders, ...options }),
  };
}

// Reexporta os utilitarios do Testing Library por conveniencia.
export * from '@testing-library/react';
