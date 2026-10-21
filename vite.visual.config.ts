import { resolve } from 'node:path';
import { defineConfig, normalizePath, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = import.meta.dirname;
const replacements = new Map(
  [
    ['src/features/auth/services/authService.ts', 'authService.ts'],
    ['src/features/image-library/services/imageLibraryService.ts', 'imageLibraryService.ts'],
    ['src/features/books/services/bookNavigationService.ts', 'bookNavigationService.ts'],
    ['src/features/books/services/bookService.ts', 'bookService.ts'],
    ['src/features/books/services/studioBookService.ts', 'studioBookService.ts'],
    ['src/features/adventures/services/adventureService.ts', 'adventureService.ts'],
    [
      'src/features/adventure-import/services/adventureImportCallables.ts',
      'adventureImportFixture.ts',
    ],
    [
      'src/features/adventure-import/services/adventureImportKeyClient.ts',
      'adventureImportFixture.ts',
    ],
    ['src/features/campaigns/services/campaignService.ts', 'campaignService.ts'],
    ['src/features/campaign-bases/services/campaignBaseCallables.ts', 'campaignBaseFixture.ts'],
    ['src/features/campaign-notes/services/campaignNotesCallables.ts', 'campaignNotesFixture.ts'],
    [
      'src/features/campaign-preparation/services/campaignPreparationCallables.ts',
      'campaignPreparationFixture.ts',
    ],
    [
      'src/features/campaign-sessions/services/campaignSessionCallables.ts',
      'campaignSessionFixture.ts',
    ],
    [
      'src/features/campaign-session-references/services/sessionReferenceCallables.ts',
      'campaignSessionReferenceFixture.ts',
    ],
    [
      'src/features/campaign-deletions/services/campaignDeletionCallables.ts',
      'campaignDeletionFixture.ts',
    ],
    ['src/features/campaign-lore/services/campaignLoreCallables.ts', 'campaignLoreFixture.ts'],
    [
      'src/features/campaign-adoptions/services/campaignAdoptionCallables.ts',
      'campaignAdoptionFixture.ts',
    ],
    [
      'src/features/campaign-lore/services/campaignLoreRemoteCallables.ts',
      'campaignAdoptionFixture.ts',
    ],
    [
      'src/features/campaign-comparisons/services/campaignComparisonCallables.ts',
      'campaignComparisonFixture.ts',
    ],
    [
      'src/features/campaigns/services/campaignManagementCallables.ts',
      'campaignManagementFixture.ts',
    ],
    ['src/features/scenes/services/sceneService.ts', 'sceneService.ts'],
    ['src/features/work-progress/services/workProgressService.ts', 'workProgressFixture.ts'],
    ['src/features/manuscript-history/services/workHistoryCallables.ts', 'workHistoryFixture.ts'],
    [
      'src/features/adventure-blocks/services/adventureBlockCallables.ts',
      'adventureBlocksFixture.ts',
    ],
    [
      'src/features/adventure-blocks/services/adventurePreviewCallables.ts',
      'adventurePreviewFixture.ts',
    ],
    [
      'src/features/narrative-planning/services/narrativePlanningService.ts',
      'narrativePlanningService.ts',
    ],
    ['src/features/books/services/chapterOrganizationService.ts', 'bookService.ts'],
    ['src/features/books/services/publicBookService.ts', 'publicBookService.ts'],
    ['src/features/books/services/publicationService.ts', 'publicationService.ts'],
    ['src/features/lore/services/loreService.ts', 'loreService.ts'],
    ['src/features/lore/services/adventureLoreCallables.ts', 'adventureLoreFixture.ts'],
    ['src/features/lore/services/adventureLoreContext.ts', 'adventureLoreFixture.ts'],
    ['src/features/lore/services/loreAnalysisService.ts', 'loreAnalysisService.ts'],
    ['src/features/universes/services/universeService.ts', 'universeService.ts'],
    ['src/features/ai-assistant/services/personaService.ts', 'personaService.ts'],
    ['src/features/ai-assistant/services/aiClient.ts', 'aiService.ts'],
    ['src/features/ai-assistant/services/creditsService.ts', 'aiService.ts'],
    ['src/features/ai-assistant/services/bookGenerationService.ts', 'bookGenerationService.ts'],
    ['src/features/ai-assistant/services/assistedBookService.ts', 'assistedBookService.ts'],
    ['src/features/ai-assistant/services/chapterChatService.ts', 'chapterChatService.ts'],
    ['src/shared/lib/firebase.ts', 'firebase.ts'],
  ].map(([source, fixture]) => [
    normalizePath(resolve(root, source)),
    resolve(root, 'e2e/visual/fixtures', fixture),
  ]),
);

function fixtureServices(): Plugin {
  return {
    name: 'writer-visual-fixtures-only',
    apply: 'serve',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || source.startsWith('\0')) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return resolved ? (replacements.get(normalizePath(resolved.id)) ?? null) : null;
    },
    transformIndexHtml: {
      order: 'pre',
      handler() {
        return [
          {
            tag: 'meta',
            attrs: {
              'http-equiv': 'Content-Security-Policy',
              content:
                "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'",
            },
            injectTo: 'head-prepend',
          },
          {
            tag: 'script',
            attrs: { type: 'module', src: '/e2e/visual/fixtures/browser-safety.ts' },
            injectTo: 'head-prepend',
          },
        ];
      },
    },
  };
}

// This separate config is never imported by vite.config.ts. Refuse a fixture production build.
export default defineConfig(({ command }) => {
  if (command !== 'serve') {
    throw new Error('Use esta configuração somente no servidor local de testes visuais.');
  }
  return {
    plugins: [fixtureServices(), react(), tailwindcss()],
    resolve: { alias: { '@': resolve(root, './src') }, dedupe: ['react', 'react-dom'] },
    server: { host: '127.0.0.1', port: 4177, strictPort: true, hmr: false },
  };
});
