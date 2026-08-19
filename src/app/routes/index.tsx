import { createBrowserRouter, type RouteObject } from 'react-router';
import { StyleguidePage } from '@vitru/styleguide/showcase';
import { App } from '@/app/App';
import { NotFound, RouteErrorFallback } from '@/app/components/RouteErrorFallback';
import { HomePage } from '@/features/home';
import { LoginPage } from '@/features/auth';
import { LorePage } from '@/features/lore';
import { EditorPage } from '@/features/editor';

/**
 * Definicao das rotas, separada do router para permitir montar a mesma
 * arvore com um router de memoria nos testes.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <App />,
    // Captura erros do layout e de qualquer rota filha sem errorElement proprio.
    errorElement: <RouteErrorFallback />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: 'login',
        element: <LoginPage />,
      },
      {
        path: 'books/:bookId/lore',
        element: <LorePage />,
      },
      {
        path: 'books/:bookId/editor/:chapterId',
        element: <EditorPage />,
      },
      {
        // Referência viva fornecida pelo pacote compartilhado.
        path: 'styleguide',
        element: <StyleguidePage />,
      },
      {
        // Qualquer endereco desconhecido cai aqui, dentro do layout.
        path: '*',
        element: <NotFound />,
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
