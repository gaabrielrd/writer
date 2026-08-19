import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter, type RouteObject } from 'react-router';
import { App } from '@/app/App';
import { RouteErrorFallback } from '@/app/components/RouteErrorFallback';
import { routes } from '@/app/routes';

function renderAt(path: string, definitions: RouteObject[] = routes) {
  const router = createMemoryRouter(definitions, { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

/**
 * Smoke test da composicao: rotas, layout e paginas montam juntos.
 * Se um provider ou uma rota quebrar, falha aqui antes de chegar ao build.
 */
describe('composicao da aplicacao', () => {
  it('monta a rota raiz com o layout e a pagina inicial', async () => {
    renderAt('/');

    expect(await screen.findByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('mostra a tela de nao encontrado para um endereco desconhecido', async () => {
    renderAt('/rota-que-nao-existe');

    expect(await screen.findByRole('heading', { name: /nao encontrada/i })).toBeInTheDocument();
    // O layout continua visivel: o erro nao derruba a aplicacao inteira.
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });
});

describe('errorElement das rotas', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('substitui uma rota que lanca erro pela tela de falha', async () => {
    function Explode(): never {
      throw new Error('falha na rota');
    }

    renderAt('/', [
      {
        path: '/',
        element: <App />,
        errorElement: <RouteErrorFallback />,
        children: [{ index: true, element: <Explode /> }],
      },
    ]);

    expect(
      await screen.findByRole('heading', { name: /nao foi possivel carregar/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('falha na rota')).toBeInTheDocument();
  });

  it('trata uma resposta 404 lancada por um loader como pagina nao encontrada', async () => {
    renderAt('/', [
      {
        path: '/',
        element: <App />,
        errorElement: <RouteErrorFallback />,
        children: [
          {
            index: true,
            element: <p>nunca renderiza</p>,
            loader: () => {
              // Lancar uma Response e o idioma do react-router para sinalizar
              // status HTTP a partir de um loader.
              // eslint-disable-next-line @typescript-eslint/only-throw-error
              throw new Response(null, { status: 404 });
            },
          },
        ],
      },
    ]);

    expect(await screen.findByRole('heading', { name: /nao encontrada/i })).toBeInTheDocument();
  });
});
