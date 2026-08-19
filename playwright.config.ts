import { createServer } from 'node:net';
import { defineConfig, devices } from '@playwright/test';

async function availablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Não foi possível reservar uma porta para o teste E2E.'));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

const port = process.env.PLAYWRIGHT_E2E_PORT
  ? Number(process.env.PLAYWRIGHT_E2E_PORT)
  : await availablePort();
process.env.PLAYWRIGHT_E2E_PORT = String(port);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  // Imagens de referência por plataforma: a fonte do sistema muda o
  // resultado, então a imagem do macOS não serve para o Linux do CI.
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{arg}{ext}',
  expect: {
    // Estreito de propósito: na mesma plataforma a renderização é
    // determinística, e uma tolerância folgada deixaria passar troca de cor
    // em elementos pequenos numa página longa.
    toHaveScreenshot: { maxDiffPixelRatio: 0.0005 },
  },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run build:bundle && npx vite preview --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
