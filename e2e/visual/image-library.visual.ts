import { test, expect, capture, expectNoHorizontalOverflow } from './support';
import { books, FIXTURE_BOOK_ID } from './fixtures/data';

test('header compacto, menus por teclado e gerenciamento da biblioteca', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const credits = page.getByRole('button', { name: '84 créditos de IA, plano free' });
  await expect(credits).toHaveText('84');
  await credits.focus();
  await expect(page.getByRole('tooltip')).toContainText('Plano FREE');
  await page.keyboard.press('Escape');
  const account = page.getByRole('button', { name: /Marina de Exemplo/ });
  await account.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('autora@example.test', { exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Sair' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(account).toBeFocused();
  const nav = page.getByRole('button', { name: 'Meus Livros' });
  await nav.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: 'Biblioteca de Imagens' }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole('button', { name: 'Biblioteca de Imagens' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Meus Livros' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toHaveText(
    '/Biblioteca de Imagens',
  );
  await expect(page.getByRole('heading', { name: 'Biblioteca de Imagens' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Excluir Capa em uso' })).toBeDisabled();
  await capture(page, testInfo, 'biblioteca-de-imagens');
  await page.getByRole('button', { name: 'Renomear Capa do Atlas' }).click();
  await page.getByLabel('Nome da imagem').fill('Marés');
  await page.getByRole('button', { name: 'Salvar nome' }).click();
  await expect(page.getByText('Marés', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Excluir Marés' }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Excluir Marés' }).click();
  await page.getByRole('button', { name: 'Confirmar exclusão' }).click();
  await expect(page.getByText('Marés', { exact: true })).toHaveCount(0);
  await page.goto(`/books/${FIXTURE_BOOK_ID}`);
  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toContainText(
    books[0].title,
  );
  await page.setViewportSize({ width: 320, height: 844 });
  await expectNoHorizontalOverflow(page, 'header 320px');
});

test('wizard seleciona capa da biblioteca sem consumir créditos', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Novo Livro', exact: true }).click();
  await page.getByLabel('Título da Obra').fill('Minha obra');
  await page.getByLabel('Gênero Literário').fill('Fantasia');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Selecionar da biblioteca' }).click();
  await page.getByRole('button', { name: 'Selecionar Capa do Atlas' }).click();
  await expect(page.getByAltText('Capa selecionada de Minha obra')).toBeVisible();
  await page.getByRole('button', { name: 'Criar Livro', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Minha obra' })).toBeVisible();
  await expect(page.getByRole('button', { name: '84 créditos de IA, plano free' })).toBeVisible();
});
