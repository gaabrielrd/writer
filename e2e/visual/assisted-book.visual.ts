import { capture, expect, expectDialogWithinViewport, test } from './support';

test('ideia, entrevista, revisão privada, capa e compêndio criado', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Livro com IA', exact: true }).click();
  await expect(page.getByText('Vamos dar vida ao seu próximo livro.')).toBeVisible();
  await capture(page, testInfo, 'criacao-assistida-boas-vindas');
  await page
    .getByLabel('Sua ideia')
    .fill('Uma navegadora descobre que o oceano está desaparecendo.');
  await page.getByLabel('Sua ideia').press('Enter');
  await expect(page.getByText('Que conflito move a protagonista?')).toBeVisible();
  await page.getByLabel('Sua resposta').fill('Ela precisa encontrar água para sua ilha.');
  await page.getByLabel('Sua resposta').press('Enter');
  await expect(page.getByLabel('Sua resposta')).toHaveValue('');
  await capture(page, testInfo, 'criacao-assistida-conversa');
  await page.getByRole('button', { name: 'Revisar ideia' }).click();
  await page
    .getByLabel('Briefing do livro')
    .fill('Aventura marítima sem magia, para jovens adultos.');
  await page.getByRole('button', { name: 'Gerar proposta do livro' }).click();
  await expect(page.getByLabel('Título do livro')).toHaveValue('O último mar');
  await page.getByRole('button', { name: 'Editar Marina', exact: true }).click();
  await page.getByLabel('Nome da Entidade').fill('Marina do Norte');
  await expect(page.getByText('Esta ficha será criada como lore privado do livro.')).toBeVisible();
  await expectDialogWithinViewport(page);
  await page.getByRole('button', { name: 'Salvar Alterações' }).click();
  await expect(page.getByRole('heading', { name: 'Marina do Norte' })).toBeVisible();
  await capture(page, testInfo, 'criacao-assistida-revisao');
  await page.getByRole('button', { name: 'Continuar para capa' }).click();
  await page.getByRole('button', { name: 'Gerar capa com IA' }).click();
  const image = page.getByAltText('Prévia de capa de O último mar');
  await expect(image).toBeVisible();
  const rect = await image.boundingBox();
  expect(rect!.width / rect!.height).toBeCloseTo(2 / 3, 2);
  await capture(page, testInfo, 'criacao-assistida-capa');
  await page.getByRole('button', { name: 'Criar livro · 7 créditos' }).click();
  await expect(page.getByRole('heading', { name: 'O último mar' })).toBeVisible();
  await page.getByRole('tab', { name: 'Compêndio', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Marina do Norte' })).toBeVisible();
  await expect(page.locator('html')).toHaveJSProperty(
    'scrollWidth',
    await page.locator('html').evaluate((element) => element.clientWidth),
  );
});

test('retoma a conversa e mantém 320 px sem transbordamento', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/books/new/assisted');
  await page.getByLabel('Sua ideia').fill('Uma viagem muito longa entre ilhas distantes.');
  await page.getByRole('button', { name: 'Começar conversa' }).click();
  await expect(page.getByLabel('Sua resposta')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Que conflito move a protagonista?')).toBeVisible();
  expect(
    await page.locator('html').evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await capture(page, testInfo, 'criacao-assistida-320-retomada');
});
