import { capture, expect, expectDialogWithinViewport, test } from './support';
import { FIXTURE_BOOK_ID, lore } from './fixtures/data';

test('compêndio compacto com lista, seleção e confirmação de ações', async ({ page }, testInfo) => {
  await page.goto(`/books/${FIXTURE_BOOK_ID}`);
  await page.getByRole('tab', { name: 'Compêndio', exact: true }).click();
  const create = page.getByRole('button', { name: 'Nova Entidade', exact: true });
  const view = page.getByRole('group', { name: 'Visualização do compêndio' });
  await expect(create).toBeVisible();
  await expect(view).toBeVisible();
  if (testInfo.project.name.startsWith('desktop')) {
    const tabs = await page.getByRole('tab', { name: 'Compêndio', exact: true }).boundingBox();
    const action = await create.boundingBox();
    const toggle = await view.boundingBox();
    expect(tabs).not.toBeNull();
    expect(action).not.toBeNull();
    expect(toggle).not.toBeNull();
    if (tabs && action && toggle) {
      expect(Math.abs(tabs.y + tabs.height / 2 - action.y - action.height / 2)).toBeLessThan(1);
      expect(Math.abs(tabs.y + tabs.height / 2 - toggle.y - toggle.height / 2)).toBeLessThan(1);
    }
    const input = await page.getByRole('textbox', { name: 'Buscar no compêndio' }).boundingBox();
    const categories = await page.getByRole('tab', { name: /Conceitos \/ Itens/ }).boundingBox();
    expect(input).not.toBeNull();
    expect(categories).not.toBeNull();
    if (input && categories)
      expect(
        Math.abs(input.y + input.height / 2 - categories.y - categories.height / 2),
      ).toBeLessThan(1);
  }
  await capture(page, testInfo, 'compendio-grid');
  await page.getByRole('button', { name: 'Visualização em lista' }).click();
  await expect(page.getByRole('table', { name: 'Entidades do compêndio' })).toBeVisible();
  const entity = lore.find((item) => item.bookId === FIXTURE_BOOK_ID)!;
  const check = page.getByRole('checkbox', { name: `Selecionar ${entity.name}`, exact: true });
  await check.focus();
  await page.keyboard.press('Space');
  const bar = page.getByRole('region', { name: 'Ações da seleção' });
  await expect(bar).toContainText('1 selecionada');
  await capture(page, testInfo, 'compendio-lista-selecao');
  const bounds = await bar.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds) expect(bounds.y + bounds.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await bar.getByRole('button', { name: 'Alterar visibilidade' }).click();
  await expect(page.getByRole('button', { name: 'Confirmar visibilidade' })).toBeDisabled();
  await page.getByLabel('Nova visibilidade').selectOption('private');
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'compendio-confirmar-visibilidade');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(check).toBeChecked();
  await bar.getByRole('button', { name: 'Alterar visibilidade' }).click();
  await page.getByLabel('Nova visibilidade').selectOption('private');
  await page.getByRole('button', { name: 'Confirmar visibilidade' }).click();
  await expect(page.getByText('1 de 1 entidade atualizada.', { exact: true })).toBeVisible();
  await expect(check).not.toBeChecked();
  await expect(check.locator('xpath=ancestor::tr')).toContainText('Privado');
  await check.check();
  await bar.getByRole('button', { name: 'Excluir', exact: true }).click();
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'compendio-confirmar-exclusao');
  await page.keyboard.press('Escape');
  await expect(check).toBeChecked();
  await bar.getByRole('button', { name: 'Excluir', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar exclusão' }).click();
  await expect(
    page.getByRole('checkbox', { name: `Selecionar ${entity.name}`, exact: true }),
  ).toHaveCount(0);
  await expect(bar).toHaveCount(0);
  await page.getByRole('tab', { name: 'Capítulos', exact: true }).click();
  await expect(create).toHaveCount(0);
  await expect(view).toHaveCount(0);
});

test('lista e barra de seleção cabem na largura de 320px', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(`/books/${FIXTURE_BOOK_ID}`);
  await page.getByRole('tab', { name: 'Compêndio', exact: true }).click();
  await page.getByRole('button', { name: 'Visualização em lista' }).click();
  await page.getByRole('checkbox', { name: 'Selecionar todas as entidades exibidas' }).check();
  const bar = page.getByRole('region', { name: 'Ações da seleção' });
  await expect(bar).toBeVisible();
  await expect
    .poll(async () => {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const lastRow = await page.getByRole('table').getByRole('row').last().boundingBox();
      const selection = await bar.boundingBox();
      if (!lastRow || !selection) throw new Error('Lista e barra de seleção devem estar visíveis.');
      return lastRow.y + lastRow.height - selection.y;
    })
    .toBeLessThanOrEqual(0);
  await capture(page, testInfo, 'compendio-lista-320px');
  await page
    .getByRole('region', { name: 'Ações da seleção' })
    .getByRole('button', { name: 'Excluir', exact: true })
    .click();
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'compendio-modal-320px');
});
