import {
  test,
  expect,
  capture,
  expectNoHorizontalOverflow,
  openBookCreation,
  navigateWorkspace,
  openWorkspaceNavigation,
} from './support';
import { books, FIXTURE_BOOK_ID } from './fixtures/data';
import { chooseDropdown } from '../dropdown';

test('header compacto, menus por teclado e gerenciamento da biblioteca', async ({
  page,
}, testInfo) => {
  await page.goto('/studio');
  const credits = page.getByRole('button', { name: '84 créditos de IA, plano free' });
  await expect(credits).toHaveText('84');
  await credits.focus();
  await expect(page.getByRole('tooltip')).toContainText('Plano FREE');
  await page.keyboard.press('Escape');
  await openWorkspaceNavigation(page);
  const account = page.getByRole('button', { name: /Marina de Exemplo/ });
  await account.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('autora@example.test', { exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Sair' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(account).toBeFocused();
  await navigateWorkspace(page, 'Biblioteca de Imagens');
  await expect(page).toHaveURL(/\/library$/);
  await expect(
    page.getByRole('region', { name: 'Biblioteca de Imagens', exact: true }),
  ).toBeVisible();
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
  await expect(page.getByLabel('Livro atual', { exact: true })).toContainText(books[0].title);
  await page.setViewportSize({ width: 320, height: 844 });
  await expectNoHorizontalOverflow(page, 'header 320px');
});

test('wizard seleciona capa da biblioteca sem consumir créditos', async ({ page }) => {
  await page.goto('/');
  await openBookCreation(page);
  await page.getByLabel('Título do projeto').fill('Minha obra');
  await chooseDropdown(page.getByLabel('Gênero ou estilo'), 'Fantasia');
  await page.getByRole('button', { name: /^Capa/ }).click();
  await page.getByRole('button', { name: 'Escolher imagem da biblioteca' }).click();
  await page.getByRole('button', { name: 'Selecionar Capa do Atlas' }).click();
  await expect(page.getByText('Imagem selecionada: Capa do Atlas')).toBeVisible();
  await page.getByRole('button', { name: 'Criar livro', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Minha obra' })).toBeVisible();
  await expect(page.getByRole('button', { name: '84 créditos de IA, plano free' })).toBeVisible();
});
