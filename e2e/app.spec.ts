import { expect, test } from '@playwright/test';

test('executa o fluxo principal e preserva a rota de fallback', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('textbox', { name: 'Título da nota' }).fill('Nota pelo navegador');
  await page.getByRole('button', { name: 'Adicionar' }).click();
  await expect(page.getByText('Nota pelo navegador')).toBeVisible();

  await page.getByRole('button', { name: 'Remover nota: Nota pelo navegador' }).click();
  await expect(page.getByText('Nota pelo navegador')).toBeHidden();
  await expect(page.getByText(/Nenhuma nota ainda/)).toBeVisible();

  await page.goto('/rota-que-nao-existe');
  await expect(page.getByRole('heading', { name: /pagina nao encontrada/i })).toBeVisible();
});
