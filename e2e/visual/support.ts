import { expect, test as base, type Page, type TestInfo } from '@playwright/test';
import {
  FIXTURE_LABEL,
  FIXTURE_LIBRARY_STATE_KEY,
  FIXTURE_SESSION_KEY,
  FIXTURE_TIME,
} from './fixtures/data';
import type { VisualOptions } from './options';

export const test = base.extend<VisualOptions>({
  visualTheme: ['dark', { option: true }],
  authenticated: [true, { option: true }],
  libraryState: ['populated', { option: true }],
});
export { expect };

test.beforeEach(
  async ({ context, page, baseURL, visualTheme, authenticated, libraryState }, testInfo) => {
    const blockedRequests: string[] = [];
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    // Defense in depth: fixture aliases and a same-origin CSP are also installed by Vite.
    await context.route('**/*', async (route) => {
      if (new URL(route.request().url()).origin !== baseURL) {
        blockedRequests.push(route.request().url());
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });
    await context.addInitScript(
      ({ theme, isAuthenticated, sessionKey, dataState, dataStateKey }) => {
        localStorage.setItem('writer_theme', theme);
        localStorage.removeItem('writer_byok_config');
        sessionStorage.setItem(sessionKey, String(isAuthenticated));
        sessionStorage.setItem(dataStateKey, dataState);
      },
      {
        theme: visualTheme,
        isAuthenticated: authenticated,
        sessionKey: FIXTURE_SESSION_KEY,
        dataState: libraryState,
        dataStateKey: FIXTURE_LIBRARY_STATE_KEY,
      },
    );
    await page.clock.setFixedTime(new Date(FIXTURE_TIME));
    await testInfo.attach('contexto-da-previa', {
      body: JSON.stringify(
        {
          label: FIXTURE_LABEL,
          source:
            'Componentes e rotas reais; autenticação, livros, capítulos, lore e IA fictícios.',
          theme: visualTheme,
          libraryState,
          viewport: testInfo.project.use.viewport,
          productionBackend: 'desativado; rede externa bloqueada',
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
    // Arrays are checked in a test-scoped teardown even when an earlier assertion fails.
    testInfo.annotations.push({ type: 'preview', description: FIXTURE_LABEL });
    networkEvidence.set(page, { blockedRequests, runtimeErrors });
  },
);

const networkEvidence = new WeakMap<Page, { blockedRequests: string[]; runtimeErrors: string[] }>();

test.afterEach(async ({ page }, testInfo) => {
  const evidence = networkEvidence.get(page);
  if (!evidence) return;
  await testInfo.attach('isolamento-e-erros', {
    body: JSON.stringify(evidence, null, 2),
    contentType: 'application/json',
  });
  expect.soft(evidence.blockedRequests, 'Nenhuma chamada externa deve ser necessária.').toEqual([]);
  expect.soft(evidence.runtimeErrors, 'A interface deve renderizar sem exceções.').toEqual([]);
});

export async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.evaluate(async (label) => {
    await document.fonts.ready;
    let marker = document.getElementById('visual-fixture-label');
    if (!marker) {
      marker = document.createElement('div');
      marker.id = 'visual-fixture-label';
      marker.setAttribute('aria-hidden', 'true');
      marker.style.cssText =
        'position:fixed;right:8px;bottom:8px;z-index:2147483647;max-width:calc(100vw - 16px);padding:5px 9px;border:1px solid #c2ad76;border-radius:6px;background:#17191d;color:#f1e6c5;font:11px/1.4 sans-serif;pointer-events:none;box-sizing:border-box';
      document.body.appendChild(marker);
    }
    marker.textContent = label;
  }, FIXTURE_LABEL);
  const path = testInfo.outputPath(`${name}.png`);
  const hasDialog = (await page.getByRole('dialog').count()) > 0;
  await page.screenshot({ path, fullPage: !hasDialog, animations: 'disabled', caret: 'hide' });
  await testInfo.attach(`${name} — ${FIXTURE_LABEL}`, { path, contentType: 'image/png' });
  await expectNoHorizontalOverflow(page, name);
}

export async function expectNoHorizontalOverflow(page: Page, name: string): Promise<void> {
  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect
    .soft(overflow.content, `${name}: a página não deve transbordar horizontalmente.`)
    .toBeLessThanOrEqual(overflow.viewport + 1);
}

export async function expectDialogWithinViewport(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (!bounds || !viewport) return;
  expect.soft(bounds.x).toBeGreaterThanOrEqual(0);
  expect.soft(bounds.y).toBeGreaterThanOrEqual(0);
  expect.soft(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
  expect.soft(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
}
