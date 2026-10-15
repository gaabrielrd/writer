import { createBrowserRouter, type RouteObject } from 'react-router';
import { UniversePage, UniverseLorePage } from '@/features/universes';
import { StyleguidePage } from '@/shared/ui';
import { App } from '@/app/App';
import { NotFound, RouteErrorFallback } from '@/app/components/RouteErrorFallback';
import { ImageLibraryPage } from '@/features/image-library';
import { HomePage } from '@/features/home';
import { LoginPage } from '@/features/auth';
import { AuthorBookRoute } from '@/app/components/AuthorBookRoute';
import { AssistedBookPage, BookPage, ReaderView } from '@/features/books';
import { LorePage } from '@/features/lore';
import { EditorPage } from '@/features/editor';
import { AISettingsPage } from '@/features/ai-assistant';
import { StudioPage } from '@/features/studio';
import { AdventurePage } from '@/features/adventures';
import { AdventureBlockEditorPage } from '@/features/adventure-blocks';
import { SceneEditorPage } from '@/features/scenes';
import { CampaignPage } from '@/features/campaigns';
import { SignedInRoute } from '@/app/components/SignedInRoute';
import { FutureSpacePage } from '@/app/components/FutureSpacePage';

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
        path: 'studio',
        element: (
          <SignedInRoute>
            <StudioPage />
          </SignedInRoute>
        ),
      },
      {
        path: 'adventures/:adventureId',
        element: (
          <SignedInRoute>
            <AdventurePage />
          </SignedInRoute>
        ),
      },
      {
        path: 'campaigns/:campaignId',
        element: (
          <SignedInRoute>
            <CampaignPage />
          </SignedInRoute>
        ),
      },
      {
        path: 'adventures/:adventureId/scenes/:sceneId',
        element: (
          <SignedInRoute>
            <SceneEditorPage />
          </SignedInRoute>
        ),
      },
      {
        path: 'adventures/:adventureId/scenes/:sceneId/blocks/:blockId',
        element: (
          <SignedInRoute>
            <AdventureBlockEditorPage />
          </SignedInRoute>
        ),
      },
      {
        path: 'books/:bookId/scenes/:sceneId',
        element: (
          <AuthorBookRoute>
            <SceneEditorPage />
          </AuthorBookRoute>
        ),
      },
      {
        path: 'publications',
        element: (
          <SignedInRoute>
            <FutureSpacePage space="publications" />
          </SignedInRoute>
        ),
      },
      { path: 'catalog', element: <FutureSpacePage space="catalog" /> },
      {
        path: 'biblioteca',
        element: (
          <SignedInRoute>
            <FutureSpacePage space="library" />
          </SignedInRoute>
        ),
      },
      {
        path: 'books/:bookId',
        element: (
          <AuthorBookRoute>
            <BookPage />
          </AuthorBookRoute>
        ),
      },
      {
        path: 'books/:bookId/lore',
        element: (
          <AuthorBookRoute>
            <LorePage />
          </AuthorBookRoute>
        ),
      },
      {
        path: 'books/:bookId/editor/:chapterId',
        element: (
          <AuthorBookRoute>
            <EditorPage />
          </AuthorBookRoute>
        ),
      },
      { path: 'library', element: <ImageLibraryPage /> },
      { path: 'settings/ai', element: <AISettingsPage /> },
      { path: 'books/new/assisted', element: <AssistedBookPage /> },
      { path: 'universes', element: <UniversePage /> },
      { path: 'universes/:universeId/lore', element: <UniverseLorePage /> },
      { path: 'read/:bookId', element: <ReaderView /> },
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
