import { chooseDropdown } from '../dropdown';
import { capture, expect, expectDialogWithinViewport, test } from './support';
import { FIXTURE_BOOK_ID, lore } from './fixtures/data';
import { installNativeBookLore } from './nativeBookLore.mjs';
const nativeSessions = new WeakMap<
  import('@playwright/test').Page,
  Awaited<ReturnType<typeof installNativeBookLore>>
>();
test.beforeEach(async ({ page }) => {
  nativeSessions.set(page, await installNativeBookLore(page));
});
test.afterEach(async ({ page }, info) => {
  await info.attach('native-lore-calls', {
    body: JSON.stringify(nativeSessions.get(page)?.calls ?? [], null, 2),
    contentType: 'application/json',
  });
});

test('compêndio compacto com lista, seleção e confirmação de ações', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
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
  const readerOpener = page.getByRole('button', {
    name: `Ver ficha de ${entity.name}`,
    exact: true,
  });
  await readerOpener.click();
  const readerDialog = page.getByRole('dialog', { name: entity.name, exact: true });
  await expect(readerDialog).toBeVisible();
  if (entity.details) await expect(readerDialog).toContainText(entity.details.split('\n')[0]);
  await page.keyboard.press('Escape');
  await expect(readerOpener).toBeFocused();
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
  await expect(page.getByRole('button', { name: 'Revisar seleção' })).toBeDisabled();
  await chooseDropdown(page.getByLabel('Nova visibilidade'), 'Privado');
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'compendio-confirmar-visibilidade');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(check).toBeChecked();
  await bar.getByRole('button', { name: 'Alterar visibilidade' }).click();
  await chooseDropdown(page.getByLabel('Nova visibilidade'), 'Privado');
  await page.getByRole('button', { name: 'Revisar seleção' }).click();
  await page.getByRole('button', { name: 'Conferir seleção', exact: true }).click();
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'compendio-origens-de-visibilidade');
  await page
    .getByRole('button', { name: 'Confirmar visibilidade da seleção', exact: true })
    .click();
  await expect(page.getByText(/Visibilidade concluída./)).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Fechar', exact: true })
    .first()
    .click();
  await expect(check).not.toBeChecked();
  await expect(check.locator('xpath=ancestor::tr')).toContainText('Privado');
  await check.check();
  await bar.getByRole('button', { name: 'Excluir', exact: true }).click();
  await expectDialogWithinViewport(page);
  await page.getByRole('button', { name: 'Conferir seleção', exact: true }).click();
  await capture(page, testInfo, 'compendio-confirmar-exclusao');
  await page.keyboard.press('Escape');
  await expect(check).toBeChecked();
  await bar.getByRole('button', { name: 'Excluir', exact: true }).click();
  await page.getByRole('button', { name: 'Conferir seleção', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar retirada da seleção', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByText('1 de 1 fichas retiradas.', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Fechar', exact: true })
    .first()
    .click();
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
  test.setTimeout(120_000);
  await page.goto(`/books/${FIXTURE_BOOK_ID}`);
  await page.getByRole('tab', { name: 'Compêndio', exact: true }).click();
  await page.getByRole('button', { name: 'Visualização em lista' }).click();
  await page.getByRole('checkbox', { name: 'Selecionar todas as entidades exibidas' }).check();
  const bar = page.getByRole('region', { name: 'Ações da seleção' });
  await expect(bar).toBeVisible();
  await expect
    .poll(async () => {
      await page
        .locator('#main-content')
        .evaluate((element) => element.scrollTo(0, element.scrollHeight));
      const lastRow = await page.getByRole('table').getByRole('row').last().boundingBox();
      const selection = await bar.boundingBox();
      if (!lastRow || !selection) throw new Error('Lista e barra de seleção devem estar visíveis.');
      return lastRow.y + lastRow.height - selection.y;
    })
    // Bounding boxes may differ by a fractional CSS pixel at a shared border.
    .toBeLessThanOrEqual(1);
  await capture(page, testInfo, 'compendio-lista-320px');
  await page
    .getByRole('region', { name: 'Ações da seleção' })
    .getByRole('button', { name: 'Excluir', exact: true })
    .click();
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'compendio-modal-320px');
});

test('criação, edição e recuperação usam os protocolos nativos no compêndio', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.goto(`/books/${FIXTURE_BOOK_ID}`);
  await page.getByRole('tab', { name: 'Compêndio', exact: true }).click();
  await page.getByRole('button', { name: 'Nova Entidade', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome', { exact: true }).fill('Novo lore nativo');
  await dialog.getByRole('button', { name: 'Preparar ficha', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Criar ficha', exact: true })).toBeEnabled({
    timeout: 60_000,
  });
  await capture(page, testInfo, 'compendio-criacao-protegida');
  await dialog.getByRole('button', { name: 'Criar ficha', exact: true }).click();
  await expect(dialog.getByText('Ficha criada no livro.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).first().click();
  await page.getByRole('button', { name: 'Visualização em lista' }).click();
  await page.getByRole('button', { name: 'Editar Novo lore nativo', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome', { exact: true }).fill('Novo lore revisado');
  await dialog.getByRole('button', { name: 'Preparar alterações', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Aplicar alterações', exact: true }),
  ).toBeEnabled();
  await dialog.getByRole('button', { name: 'Aplicar alterações', exact: true }).click();
  await expect(dialog.getByText('Alterações aplicadas à ficha.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).first().click();
  await dialog.getByRole('button', { name: 'Fechar e manter recuperação', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Ver ficha de Novo lore revisado', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Retomadas', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Retomadas do compêndio' });
  await expect(
    dialog.getByRole('region', { name: 'Recuperações de lore', exact: true }),
  ).toBeVisible();
  await capture(page, testInfo, 'compendio-retomadas');
  await dialog.getByRole('button', { name: 'Abrir recuperação 1', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Editar lore do livro' });
  await dialog.getByRole('button', { name: 'Retomar preparação', exact: true }).click();
  await expect(dialog.getByLabel('Nome', { exact: true })).toHaveValue('Novo lore revisado');
  await expect(dialog.getByText('Alterações aplicadas à ficha.', { exact: true })).toBeVisible();
  await capture(page, testInfo, 'compendio-retomada-conferida');
});
