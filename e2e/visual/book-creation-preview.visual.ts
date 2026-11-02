import { capture, expect, expectNoHorizontalOverflow, openBookCreation, test } from './support';
test('revisão de livro preserva campos e imagem da biblioteca sem obrigar capa', async ({
  page,
}, testInfo) => {
  await page.goto('/studio/projects');
  await openBookCreation(page);
  await page.getByLabel('Título do projeto').fill('O jardim das histórias');
  await page.getByLabel('Gênero ou estilo').fill('Fantasia literária');
  await page.getByLabel('Premissa', { exact: true }).fill('Uma cartógrafa explora as ilhas.');
  await page.getByRole('button', { name: /^Capa opcional/ }).click();
  await page.getByRole('button', { name: 'Escolher imagem da biblioteca' }).click();
  await page.getByRole('button', { name: 'Selecionar Capa do Atlas' }).click();
  await expect(page.getByText('Imagem selecionada: Capa do Atlas')).toBeVisible();
  await page.getByRole('button', { name: 'Sem capa', exact: true }).click();
  await expect(page.getByText('Imagem selecionada: Capa do Atlas')).toHaveCount(0);
  await expect(page.getByLabel('Título do projeto')).toHaveValue('O jardim das histórias');
  await expectNoHorizontalOverflow(page, 'revisao-livro');
  await capture(page, testInfo, 'revisao-livro-campos');
});
test('revisão longa preserva conteúdo ao alternar desktop baixo e 320px', async ({
  page,
}, testInfo) => {
  await page.goto('/studio/projects');
  await openBookCreation(page);
  await page.getByLabel('Título do projeto').fill('UmaHistória'.repeat(27));
  await page.getByLabel('Premissa', { exact: true }).fill('Uma premissa longa. '.repeat(100));
  await page.setViewportSize({ width: 1100, height: 560 });
  await expectNoHorizontalOverflow(page, 'desktop-baixo');
  await page.setViewportSize({ width: 320, height: 640 });
  await expect(page.getByLabel('Título do projeto')).toHaveValue('UmaHistória'.repeat(27));
  await page.getByRole('button', { name: 'Criar livro', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Criar livro', exact: true })).toBeInViewport();
  await expectNoHorizontalOverflow(page, 'revisao-320');
  await capture(page, testInfo, 'revisao-livro-320');
});
