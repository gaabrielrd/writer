import { expect, test } from '@playwright/test';

test('executa a navegacao principal, tela de login e rota de fallback', async ({ page }) => {
  await page.goto('/');

  const landing = page.getByRole('heading', { name: 'Assistente para Autores de Ficção' });
  await expect(landing).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Writer Assistant Início', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Entrar no Writer Assistant' })).toBeVisible();
  await expect(page.getByLabel('E-mail', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Senha', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar com Google' })).toBeEnabled();

  // A troca de modo não autentica nem depende de um serviço externo.
  await page.getByRole('button', { name: 'Cadastre-se gratuitamente' }).click();
  await expect(page.getByRole('heading', { name: 'Criar sua conta de autor' })).toBeVisible();
  await expect(page.getByLabel('Nome de Autor')).toBeVisible();
  await page.getByRole('main').getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Entrar no Writer Assistant' })).toBeVisible();
  await expect(page.getByLabel('Nome de Autor')).toHaveCount(0);

  await page.goBack();
  await expect(landing).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Entrar no Writer Assistant' })).toBeVisible();

  await page.goto('/rota-que-nao-existe');
  await expect(page.getByRole('heading', { name: 'Pagina nao encontrada' })).toBeVisible();
  await page.getByRole('link', { name: 'Voltar para o inicio' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(landing).toBeVisible();
});
