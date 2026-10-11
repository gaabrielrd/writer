import { defineConfig, devices } from '@playwright/test';
import type { VisualOptions } from './e2e/visual/options';

const port = Number(process.env.WRITER_VISUAL_PORT ?? 4177);
const baseURL = `http://127.0.0.1:${port}`;
const themes = ['dark', 'light', 'sepia'] as const;

export default defineConfig<VisualOptions>({
  testDir: './e2e/visual',
  // Deliberately not *.spec.ts: the production E2E configuration must not discover these.
  testMatch: '**/*.visual.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  outputDir: 'visual-test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'visual-playwright-report', open: 'never' }],
    ['json', { outputFile: 'visual-test-results/results.json' }],
  ],
  use: {
    baseURL,
    locale: 'pt-BR',
    timezoneId: 'UTC',
    contextOptions: { reducedMotion: 'reduce' },
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: themes.flatMap((visualTheme) => [
    {
      name: `desktop-${visualTheme}`,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 1,
        visualTheme,
      },
    },
    {
      name: `mobile-${visualTheme}`,
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        visualTheme,
      },
    },
  ]),
  webServer: {
    command: `npx vite --config vite.visual.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
