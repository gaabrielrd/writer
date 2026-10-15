import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { FutureSpacePage } from '../components/FutureSpacePage';

describe('espaços em preparação', () => {
  it.each(['publications', 'catalog'] as const)(
    'explica disponibilidade de %s e oferece o Estúdio',
    (space) => {
      render(
        <MemoryRouter>
          <FutureSpacePage space={space} />
        </MemoryRouter>,
      );
      expect(screen.getByRole('link', { name: 'Abrir Estúdio' })).toHaveAttribute(
        'href',
        '/studio',
      );
      expect(
        screen.queryByRole('button', { name: /comprar|pagar|publicar/i }),
      ).not.toBeInTheDocument();
    },
  );

  it('distingue aquisições futuras da biblioteca de imagens existente', () => {
    render(
      <MemoryRouter>
        <FutureSpacePage space="library" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Biblioteca' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir Biblioteca de Imagens' })).toHaveAttribute(
      'href',
      '/library',
    );
    expect(
      screen.getByText(/biblioteca de edições estará disponível junto das compras/i),
    ).toBeInTheDocument();
  });
});
