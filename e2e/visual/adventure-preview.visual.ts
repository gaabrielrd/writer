import type { Page } from '@playwright/test';
import {
  capture,
  expect,
  expectDialogWithinViewport,
  expectNoHorizontalOverflow,
  test,
} from './support';

const principal = '/adventures/visual-adventure-1/scenes/visual-scene-1';
const preview = (page: Page) => page.getByRole('dialog', { name: 'Prévia da cena', exact: true });
const imageDialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Ilustração do bloco', exact: true });
async function open(page: Page, seed = false, pagination = false) {
  await page.addInitScript(
    ({ seed, pagination }) => {
      sessionStorage.setItem('writer.visual.scene-pagination', 'true');
      if (seed) sessionStorage.setItem('writer.visual.preview-seed', 'true');
      if (pagination) sessionStorage.setItem('writer.visual.preview-pagination', 'true');
    },
    { seed, pagination },
  );
  await page.goto(principal);
  await expect(
    page.getByRole('textbox', { name: 'Área de escrita da cena', exact: true }),
  ).toBeVisible();
  if (seed) {
    await expect(page.getByRole('link', { name: 'Pista na praia', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('link', { name: 'Pista na praia', exact: true })).toBeVisible();
  }
}
async function showPreview(page: Page) {
  await page.getByRole('button', { name: 'Conferir prévia da cena', exact: true }).click();
  await expect(
    preview(page).getByRole('heading', { name: 'Texto principal', exact: true }),
  ).toBeVisible();
  return preview(page);
}
async function mode(page: Page, label: string) {
  await preview(page).getByRole('combobox', { name: 'Modo da prévia', exact: true }).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}
async function chooseImage(page: Page) {
  await page.getByRole('button', { name: 'Ilustração do bloco', exact: true }).click();
  const dialog = imageDialog(page);
  await dialog.getByRole('button', { name: 'Escolher imagem da biblioteca', exact: true }).click();
  await page.getByRole('button', { name: 'Selecionar Capa do Atlas', exact: true }).click();
  await dialog
    .getByLabel('Texto alternativo da ilustração', { exact: true })
    .fill('Farol ilustrado');
  await dialog.getByLabel('Legenda da ilustração', { exact: true }).fill('Uma luz sobre as ilhas.');
  return dialog;
}

test('prévia Original, Mestre e Jogadores conserva somente conteúdo e mídia permitidos', async ({
  page,
}, info) => {
  await open(page, true);
  const dialog = await showPreview(page);
  await expect(dialog.getByText(/SEGREDO_DO_CRIADOR_TEXTO/)).toBeVisible();
  await expect(dialog.getByText(/SEGREDO_DO_MESTRE/)).toBeVisible();
  await expect(dialog.getByRole('img', { name: 'IMAGEM_PRIVADA', exact: true })).toBeVisible();
  await mode(page, 'Mestre');
  await expect(dialog.getByText(/SEGREDO_DO_MESTRE/)).toBeVisible();
  await expect(dialog.locator('article')).toHaveCount(2);
  expect(await dialog.innerHTML()).not.toMatch(/SEGREDO_DO_CRIADOR|IMAGEM_PRIVADA|LEGENDA_PRIVADA/);
  await mode(page, 'Jogadores');
  await expect(dialog.getByText('O caminho leva ao farol.', { exact: true })).toBeVisible();
  await expect(dialog.locator('article')).toHaveCount(1);
  const illustration = dialog.getByRole('img', { name: 'Farol sobre a praia', exact: true });
  await expect(illustration).toHaveAttribute('src', /^data:image\/webp;base64,/);
  await expect
    .poll(() => illustration.evaluate((node) => (node as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  expect(await dialog.innerHTML()).not.toMatch(
    /SEGREDO_|FICHA_SECRETA|ALIAS_SECRETO|TOKEN_SECRETO|data-lore/,
  );
  expect(await dialog.locator('article').innerHTML()).not.toMatch(/https?:\/\//);
  await capture(page, info, 'previa-jogadores-sem-segredos');
});

test('ilustração do principal preserva texto e confirma a revisão da próxima escrita', async ({
  page,
}, info) => {
  await open(page);
  const editor = page.getByRole('textbox', { name: 'Área de escrita da cena', exact: true });
  const original = await editor.textContent();
  const dialog = await chooseImage(page);
  await dialog.getByRole('button', { name: 'Salvar ilustração', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(editor).toHaveText(original!);
  await editor.fill('O farol permanece aceso durante a noite.');
  await expect(page.getByText('Salvo', { exact: true })).toBeVisible();
  const read = await showPreview(page);
  await expect(
    read.getByText('O farol permanece aceso durante a noite.', { exact: true }),
  ).toBeVisible();
  await expect(read.getByRole('img', { name: 'Farol ilustrado', exact: true })).toBeVisible();
  await expect(read.getByText('Uma luz sobre as ilhas.', { exact: true })).toBeVisible();
  await capture(page, info, 'ilustracao-principal-e-texto-confirmados');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Ilustração do bloco', exact: true }).click();
  await imageDialog(page).getByRole('button', { name: 'Remover ilustração', exact: true }).click();
  await imageDialog(page).getByRole('button', { name: 'Salvar ilustração', exact: true }).click();
  await expect(imageDialog(page)).toHaveCount(0);
  const without = await showPreview(page);
  await expect(without.getByRole('img')).toHaveCount(0);
  await expect(
    without.getByText('O farol permanece aceso durante a noite.', { exact: true }),
  ).toBeVisible();
});

test('resposta perdida da ilustração mantém reserva e reconcilia o mesmo pedido', async ({
  page,
}) => {
  await open(page);
  const dialog = await chooseImage(page);
  await page.evaluate(() =>
    sessionStorage.setItem('writer.visual.block-lost-response', 'setAdventureBlockImage'),
  );
  await dialog.getByRole('button', { name: 'Salvar ilustração', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Cancelar', exact: true })).toBeDisabled();
  await expect(
    page.getByRole('textbox', {
      name: 'Área de escrita da cena',
      exact: true,
      includeHidden: true,
    }),
  ).toHaveAttribute('contenteditable', 'false');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Confirmar mesmo pedido de ilustração', exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const editor = page.getByRole('textbox', { name: 'Área de escrita da cena', exact: true });
  await editor.fill('Texto após a confirmação da imagem.');
  await expect(page.getByText('Salvo', { exact: true })).toBeVisible();
  const read = await showPreview(page);
  await expect(read.getByRole('img', { name: 'Farol ilustrado', exact: true })).toHaveCount(1);
  await expect(
    read.getByText('Texto após a confirmação da imagem.', { exact: true }),
  ).toBeVisible();
});

test('paginação da prévia mantém blocos públicos sem revelar itens privados', async ({ page }) => {
  await open(page, true, true);
  const dialog = await showPreview(page);
  await mode(page, 'Jogadores');
  await expect(dialog.locator('article')).toHaveCount(25);
  await dialog.getByRole('button', { name: 'Carregar mais blocos da prévia', exact: true }).click();
  await expect(dialog.locator('article')).toHaveCount(29);
  await expect(
    dialog.getByRole('heading', { name: 'Passagem pública 28', exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Carregar mais blocos da prévia', exact: true }),
  ).toHaveCount(0);
  expect(await dialog.innerHTML()).not.toMatch(/SEGREDO_|FICHA_SECRETA|IMAGEM_PRIVADA/);
});

test('ilustração do adicional conserva audiência e a próxima edição usa a revisão confirmada', async ({
  page,
}) => {
  await open(page, true);
  await page.getByRole('link', { name: 'Pista na praia', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Área de escrita do bloco', exact: true });
  await expect(editor).toBeVisible();
  const dialog = await chooseImage(page);
  await dialog.getByRole('button', { name: 'Salvar ilustração', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await editor.fill('A luz alcança o barco dos aventureiros.');
  await expect(page.getByText('Salvo', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Prévia da cena', exact: true }).click();
  await mode(page, 'Jogadores');
  const read = preview(page);
  await expect(
    read.getByText('A luz alcança o barco dos aventureiros.', { exact: true }),
  ).toBeVisible();
  await expect(read.getByRole('img', { name: 'Farol ilustrado', exact: true })).toBeVisible();
  await expect(read.getByText('Uma luz sobre as ilhas.', { exact: true })).toBeVisible();
  await expect(read.locator('article')).toHaveCount(1);
  expect(await read.innerHTML()).not.toMatch(/SEGREDO_DO_CRIADOR|SEGREDO_DO_MESTRE|IMAGEM_PRIVADA/);
});

test('trocar o modo descarta resposta tardia e revogação da mídia limpa a composição', async ({
  page,
}) => {
  await open(page, true);
  await page.evaluate(() =>
    sessionStorage.setItem('writer.visual.preview-hold', 'readAdventureScenePreview'),
  );
  await page.getByRole('button', { name: 'Conferir prévia da cena', exact: true }).click();
  await expect(preview(page).getByText('Preparando prévia…', { exact: true })).toBeVisible();
  await mode(page, 'Jogadores');
  await expect(preview(page).getByText('O caminho leva ao farol.', { exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('writer.visual.release-preview')));
  expect(await preview(page).innerHTML()).not.toMatch(
    /SEGREDO_DO_CRIADOR|SEGREDO_DO_MESTRE|IMAGEM_PRIVADA/,
  );
  await page.keyboard.press('Escape');
  await page.evaluate(() =>
    sessionStorage.setItem('writer.visual.preview-hold', 'readAdventurePreviewImage'),
  );
  await showPreview(page);
  await expect(
    preview(page).getByText('Preparando ilustração…', { exact: true }).first(),
  ).toBeVisible();
  await page.evaluate(() => {
    sessionStorage.setItem('writer.visual.preview-revoked-target', 'true');
    window.dispatchEvent(new Event('writer.visual.release-preview'));
  });
  await expect(preview(page).getByText('Prévia indisponível', { exact: true })).toBeVisible();
  await expect(preview(page).locator('article')).toHaveCount(0);
  await expect(preview(page).getByRole('img')).toHaveCount(0);
});

test('prévia em 320px permite escolher audiência por teclado e conserva foco', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await open(page, true);
  const trigger = page.getByRole('button', { name: 'Conferir prévia da cena', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(preview(page)).toBeVisible();
  const select = preview(page).getByRole('combobox', { name: 'Modo da prévia', exact: true });
  await select.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('option', { name: 'Original completo', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option', { name: 'Mestre', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option', { name: 'Jogadores', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(select).toContainText('Jogadores');
  await expect(preview(page).getByText('O caminho leva ao farol.', { exact: true })).toBeVisible();
  await expectDialogWithinViewport(page);
  await expectNoHorizontalOverflow(page, 'Prévia em 320px');
  await capture(page, info, 'previa-jogadores-teclado-320');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});
