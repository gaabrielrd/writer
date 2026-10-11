import { defineConfig } from '@playwright/test';
import visual from './playwright.visual.config';

// Separate port keeps this worktree independent of another local visual suite.
export default defineConfig({
  ...visual,
  testMatch: '**/assisted-book.visual.ts',
  use: { ...visual.use, baseURL: 'http://127.0.0.1:4179' },
  webServer: {
    ...visual.webServer,
    command: 'npx vite --config vite.visual.config.ts --host 127.0.0.1 --port 4179 --strictPort',
    url: 'http://127.0.0.1:4179',
  },
});
