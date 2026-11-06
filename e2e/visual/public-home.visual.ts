import { test, expect, capture, expectNoHorizontalOverflow } from './support';

test.describe('homepage pública', () => {
  test.use({ authenticated: false });

  test('apresentação e acesso cabem na janela de desktop', async ({ page }, testInfo) => {
    await page.goto('/');
    const title = page.getByRole('heading', { level: 1 });
    const start = page.getByRole('link', { name: 'Começar a Escrever Gratuitamente' });
    await expect(title).toHaveText('Assistente para Autores de Ficção');
    await expect(start).toHaveAttribute('href', '/login');
    await expect(page.getByRole('link', { name: 'Entrar', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Comece sua história' })).toBeVisible();

    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 1280, height: 720 },
      { width: 1024, height: 768 },
      { width: 800, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => document.fonts.ready);
      const bounds = await start.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.y).toBeGreaterThan(0);
      expect(bounds!.y + bounds!.height).toBeLessThan(viewport.height);
      await expectNoHorizontalOverflow(page, `homepage ${viewport.width}`);
      await capture(page, testInfo, `homepage-${viewport.width}`);
    }
  });

  test('teclado alcança o conteúdo e a ação abre o login', async ({ page }) => {
    await page.goto('/');
    const title = page.getByRole('heading', { level: 1 });
    await expect(title).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Pular para o conteúdo' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
    await page.keyboard.press('Tab');
    const start = page.getByRole('link', { name: 'Começar a Escrever Gratuitamente' });
    await expect(start).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel('E-mail', { exact: true })).toBeVisible();
    await expect(page.locator('[data-public-home="true"]')).toHaveCount(0);
  });
});

test('conta autenticada segue da raiz ao Estúdio', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/studio$/);
  await expect(page.locator('[data-writer-workspace]')).toBeVisible();
  await expect(page.locator('[data-public-home="true"]')).toHaveCount(0);
});
