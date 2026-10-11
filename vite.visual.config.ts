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
    ['src/features/books/services/chapterOrganizationService.ts', 'bookService.ts'],
    ['src/features/books/services/publicBookService.ts', 'publicBookService.ts'],
    ['src/features/books/services/publicationService.ts', 'publicationService.ts'],
    ['src/features/lore/services/loreService.ts', 'loreService.ts'],
    ['src/features/lore/services/loreAnalysisService.ts', 'loreAnalysisService.ts'],
    ['src/features/universes/services/universeService.ts', 'universeService.ts'],
    ['src/features/ai-assistant/services/aiClient.ts', 'aiService.ts'],
    ['src/features/ai-assistant/services/creditsService.ts', 'aiService.ts'],
    ['src/features/ai-assistant/services/bookGenerationService.ts', 'bookGenerationService.ts'],
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
