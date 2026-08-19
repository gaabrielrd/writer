import { expect, test } from '@playwright/test';

test('executa a navegacao principal, tela de login e rota de fallback', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Writer Assistant' })).toBeVisible();
  await expect(page.getByRole('button', { name: /entrar/i })).toBeVisible();

  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page.getByRole('heading', { name: /entrar no writer assistant/i })).toBeVisible();

  await page.goto('/rota-que-nao-existe');
  await expect(page.getByRole('heading', { name: /pagina nao encontrada/i })).toBeVisible();
});
