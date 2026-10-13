import {
  capture,
  expect,
  expectDialogWithinViewport,
  expectNoHorizontalOverflow,
  openBookCreation,
  test,
} from './support';

test('prévia acompanha os campos e a capa com a hierarquia da biblioteca', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.startsWith('mobile'), 'Prévia lateral exclusiva do desktop.');
  await page.goto('/');
  const libraryTitle = page.getByRole('heading', { name: 'O Atlas das Marés Esquecidas' });
  const typography = await libraryTitle.evaluate((element) => {
    const css = getComputedStyle(element);
    return {
      font: css.fontFamily,
      size: css.fontSize,
      weight: css.fontWeight,
      lineHeight: css.lineHeight,
    };
  });
  const trigger = page.getByRole('button', { name: 'Novo projeto', exact: true });
  await openBookCreation(page);
  const dialog = page.getByRole('dialog', { name: 'Criar Novo Livro' });
  const preview = dialog.getByRole('complementary', { name: 'Prévia do livro' });
  await expect(preview.getByRole('heading', { name: 'Título da sua obra' })).toBeVisible();
  await capture(page, testInfo, 'previa-vazia');
  const title = 'O jardim das histórias esquecidas';
  await dialog.getByLabel('Título da Obra').fill(title);
  await dialog.getByLabel('Gênero Literário').fill('Fantasia literária');
  const previewTitle = preview.getByRole('heading', { name: title });
  await expect(previewTitle).toBeVisible();
  expect(
    await previewTitle.evaluate((element) => {
      const css = getComputedStyle(element);
      return {
        font: css.fontFamily,
        size: css.fontSize,
        weight: css.fontWeight,
        lineHeight: css.lineHeight,
      };
    }),
  ).toEqual(typography);
  await dialog.getByRole('button', { name: /^Sinopse/ }).focus();
  await page.keyboard.press('Enter');
  await dialog
    .getByLabel('Sinopse / Premissa')
    .fill('Uma cartógrafa encontra um jardim onde cada árvore guarda uma história perdida.');
  await dialog.getByRole('button', { name: /^Sinopse/ }).click();
  await expect(preview.getByText(/Uma cartógrafa/)).toBeVisible();
  const formBounds = await dialog.locator('form').boundingBox();
  const previewBounds = await preview.boundingBox();
  const dialogBounds = await dialog.boundingBox();
  expect(dialogBounds!.width).toBe(960);
  expect(previewBounds!.x).toBeGreaterThan(formBounds!.x + formBounds!.width);
  await dialog.getByRole('button', { name: /^Capa/ }).click();
  await dialog.getByRole('button', { name: 'Selecionar da biblioteca' }).click();
  await page.getByRole('button', { name: 'Selecionar Capa do Atlas' }).click();
  const cover = preview.getByRole('img', { name: `Prévia da capa de ${title}` });
  await expect(cover).toBeVisible();
  await expect
    .poll(() => cover.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  const coverBounds = await cover.boundingBox();
  expect(coverBounds!.width / coverBounds!.height).toBeCloseTo(2 / 3, 2);
  await dialog.getByRole('button', { name: /^Capa/ }).click();
  await expectDialogWithinViewport(page);
  await dialog.locator('[data-slot="dialog-body"]').evaluate((element) => {
    element.scrollTop = 0;
  });
  await capture(page, testInfo, 'previa-livro-preenchido');
  await dialog.getByRole('button', { name: /^Capa/ }).click();
  await dialog.getByRole('button', { name: 'Remover capa' }).click();
  await expect(preview.getByText('Sem capa')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('modal conserva ações, uma rolagem e layout compacto em 320px', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1100, height: 600 });
  await page.goto('/');
  await openBookCreation(page);
  const dialog = page.getByRole('dialog', { name: 'Criar Novo Livro' });
  await dialog.getByLabel('Título da Obra').fill('UmaHistória'.repeat(27));
  await dialog.getByLabel('Gênero Literário').fill('UmGênero'.repeat(15));
  await dialog.getByRole('button', { name: /^Sinopse/ }).click();
  await dialog.getByLabel('Sinopse / Premissa').fill('Uma premissa longa. '.repeat(100));
  const body = dialog.locator('[data-slot="dialog-body"]');
  expect(await body.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(
    dialog.getByRole('heading', { name: 'Criar Novo Livro', exact: true }),
  ).toBeInViewport();
  await expect(dialog.getByRole('button', { name: 'Criar Livro', exact: true })).toBeInViewport();
  expect(
    await dialog.evaluate(
      (element) =>
        Array.from(element.querySelectorAll('*')).filter((child) => {
          const css = getComputedStyle(child);
          return (
            ['auto', 'scroll'].includes(css.overflowY) &&
            child.scrollHeight > child.clientHeight &&
            !['TEXTAREA', 'INPUT'].includes(child.tagName)
          );
        }).length,
    ),
  ).toBe(1);
  await expectDialogWithinViewport(page);
  await expectNoHorizontalOverflow(page, 'desktop-baixo');
  await capture(page, testInfo, 'previa-desktop-baixo');
  await page.setViewportSize({ width: 901, height: 800 });
  await expect(dialog.getByRole('complementary', { name: 'Prévia do livro' })).toBeVisible();
  await expectNoHorizontalOverflow(page, 'desktop-limite');
  await page.setViewportSize({ width: 900, height: 800 });
  await expect(dialog.getByLabel('Prévia do livro')).not.toBeVisible();
  expect((await dialog.boundingBox())!.width).toBe(512);
  await page.setViewportSize({ width: 320, height: 640 });
  await expect(dialog.getByRole('complementary', { name: 'Prévia do livro' })).toHaveCount(0);
  await expect(dialog.getByLabel('Prévia do livro')).not.toBeVisible();
  await expect(dialog.getByLabel('Título da Obra')).toHaveValue('UmaHistória'.repeat(27));
  await expect(dialog.getByRole('button', { name: 'Criar Livro', exact: true })).toBeInViewport();
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'criacao-320');
});
