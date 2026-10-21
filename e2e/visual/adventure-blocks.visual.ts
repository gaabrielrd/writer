import type { Locator, Page } from '@playwright/test';
import {
  capture,
  expect,
  expectDialogWithinViewport,
  expectNoHorizontalOverflow,
  test,
} from './support';

const principal = '/adventures/visual-adventure-1/scenes/visual-scene-1';
const passage = 'As lanternas indicam um caminho seguro.';
const changed = 'Uma tempestade encobre a passagem entre as ilhas.';
const navigator = (page: Page) => page.getByRole('region', { name: 'Blocos da cena', exact: true });
async function open(page: Page, pagination = false) {
  await page.addInitScript((pagination) => {
    sessionStorage.setItem('writer.visual.scene-pagination', 'true');
    if (pagination) sessionStorage.setItem('writer.visual.block-pagination', 'true');
  }, pagination);
  await page.goto(principal);
  await expect(
    navigator(page).getByRole('link', { name: 'Texto principal', exact: true }),
  ).toBeVisible();
  if (pagination) {
    await page.reload();
    await expect(
      navigator(page).getByRole('link', { name: 'Texto principal', exact: true }),
    ).toBeVisible();
  }
}
async function create(page: Page, title: string, audience = 'Privado do criador') {
  await navigator(page).getByRole('button', { name: 'Novo bloco', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Novo bloco da cena', exact: true });
  await dialog.getByLabel('Título do bloco', { exact: true }).fill(title);
  await expect(
    dialog.getByRole('combobox', { name: 'Audiência do bloco', exact: true }),
  ).toContainText('Privado do criador');
  if (audience !== 'Privado do criador') {
    await dialog.getByRole('combobox', { name: 'Audiência do bloco', exact: true }).click();
    await page.getByRole('option', { name: audience, exact: true }).click();
  }
  await dialog.getByRole('button', { name: 'Confirmar bloco', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(navigator(page).getByRole('link', { name: title, exact: true })).toBeVisible();
}
async function write(page: Page, text: string) {
  const editor = page.getByRole('textbox', { name: 'Área de escrita do bloco', exact: true });
  await editor.fill(text);
  await expect(page.getByText('Salvo', { exact: true })).toBeVisible();
  return editor;
}
async function menu(page: Page, title: string, action: string, last = false) {
  const options = navigator(page).getByRole('button', { name: 'Opções de ' + title, exact: true });
  await (last ? options.last() : options.first()).click();
  await page.getByRole('menuitem', { name: action, exact: true }).click();
}
async function confirm(page: Page, title: string) {
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  await dialog.getByRole('button', { name: 'Confirmar bloco', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
async function history(page: Page, label?: string) {
  await page.getByRole('button', { name: 'Histórico do bloco', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Histórico do texto', exact: true });
  if (label) {
    await dialog.getByLabel('Nome da versão (opcional)', { exact: true }).fill(label);
    await dialog.getByRole('button', { name: 'Criar versão', exact: true }).click();
    await expect(
      dialog.getByText('Versão guardada. O texto do manuscrito permanece igual.', { exact: true }),
    ).toBeVisible();
  }
  return dialog;
}
async function version(dialog: Locator, title: string) {
  await dialog
    .getByRole('region', { name: 'Versões guardadas', exact: true })
    .getByRole('button', { name: new RegExp('^' + title) })
    .click();
  await expect(
    dialog.getByRole('region', { name: 'Texto da versão guardada', exact: true }),
  ).toBeVisible();
}

test('blocos têm texto próprio, padrão privado e contagem preservada ao editar o principal', async ({
  page,
}, info) => {
  await open(page);
  const main = page.getByRole('textbox', { name: 'Área de escrita da cena', exact: true });
  const original = await main.textContent();
  await expect(navigator(page).getByText('Privado do criador', { exact: true })).toBeVisible();
  await create(page, 'Segredo do farol');
  await navigator(page).getByRole('link', { name: 'Segredo do farol', exact: true }).click();
  await write(page, passage);
  await page.reload();
  await expect(
    page.getByRole('textbox', { name: 'Área de escrita do bloco', exact: true }),
  ).toHaveText(passage);
  await navigator(page).getByRole('link', { name: 'Texto principal', exact: true }).click();
  await expect(main).toHaveText(original!);
  await main.fill('Texto principal confirmado.');
  await expect(page.getByText('Salvo', { exact: true })).toBeVisible();
  await expect(
    navigator(page).getByText('9 palavras confirmadas na cena.', { exact: true }),
  ).toBeVisible();
  await navigator(page).getByRole('link', { name: 'Segredo do farol', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Área de escrita do bloco', exact: true }),
  ).toHaveText(passage);
  await capture(page, info, 'bloco-privado-textos-isolados');
});

test('duplicação e movimento preservam a audiência e arquivo mantém o texto', async ({ page }) => {
  await open(page);
  await create(page, 'Leitura do portal', 'Jogadores');
  await navigator(page).getByRole('link', { name: 'Leitura do portal', exact: true }).click();
  await write(page, passage);
  await menu(page, 'Leitura do portal', 'Duplicar bloco');
  await confirm(page, 'Duplicar bloco');
  const links = navigator(page).getByRole('link', { name: 'Leitura do portal', exact: true });
  await expect(links).toHaveCount(2);
  const copyPath = await links.last().getAttribute('href');
  await navigator(page)
    .getByRole('button', { name: 'Subir Leitura do portal', exact: true })
    .last()
    .click();
  await expect(links.first()).toHaveAttribute('href', copyPath!);
  await links.first().click();
  await expect(
    page.getByRole('textbox', { name: 'Área de escrita do bloco', exact: true }),
  ).toHaveText(passage);
  await menu(page, 'Leitura do portal', 'Arquivar bloco');
  await confirm(page, 'Arquivar bloco');
  await expect(page.getByText('Bloco arquivado', { exact: true })).toBeVisible();
  await navigator(page).getByRole('combobox', { name: 'Condição dos blocos', exact: true }).click();
  await page.getByRole('option', { name: 'Arquivados', exact: true }).click();
  const archived = navigator(page).getByRole('listitem');
  await expect(archived).toHaveCount(1);
  await expect(archived.getByText('Jogadores', { exact: true })).toBeVisible();
  await menu(page, 'Leitura do portal', 'Restaurar do arquivo');
  await confirm(page, 'Restaurar bloco do arquivo');
  await expect(page.getByText('Bloco arquivado', { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('textbox', { name: 'Área de escrita do bloco', exact: true }),
  ).toHaveText(passage);
});

test('histórico de adicional conserva audiência e predecessor e a próxima escrita usa a revisão restaurada', async ({
  page,
}) => {
  await open(page);
  await create(page, 'Instruções do encontro', 'Mestre');
  await navigator(page).getByRole('link', { name: 'Instruções do encontro', exact: true }).click();
  await write(page, passage);
  let dialog = await history(page, 'Antes da tempestade');
  await dialog.getByRole('button', { name: 'Fechar histórico', exact: true }).click();
  await write(page, changed);
  dialog = await history(page);
  await version(dialog, 'Antes da tempestade');
  await dialog.getByRole('button', { name: 'Restaurar esta versão', exact: true }).click();
  await expect(dialog.getByText(/Audiência atual: Mestre/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirmar restauração', exact: true }).click();
  await expect(
    dialog.getByText('Texto restaurado. A versão anterior foi guardada para recuperação.', {
      exact: true,
    }),
  ).toBeVisible();
  await version(dialog, 'Antes da restauração');
  await expect(
    dialog.getByRole('region', { name: 'Texto da versão guardada', exact: true }),
  ).toContainText(changed);
  await dialog.getByRole('button', { name: 'Fechar histórico', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Área de escrita do bloco', exact: true }),
  ).toHaveText(passage);
  await write(page, 'O mestre prepara uma consequência distinta.');
  await page.reload();
  await expect(
    page.getByRole('textbox', { name: 'Área de escrita do bloco', exact: true }),
  ).toHaveText('O mestre prepara uma consequência distinta.');
});

test('resposta perdida bloqueia o adicional e confirma o mesmo salvamento', async ({ page }) => {
  await open(page);
  await create(page, 'Resposta da cartógrafa');
  await navigator(page).getByRole('link', { name: 'Resposta da cartógrafa', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Área de escrita do bloco', exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    sessionStorage.setItem('writer.visual.block-lost-response', 'updateAdventureBlock'),
  );
  const editor = page.getByRole('textbox', { name: 'Área de escrita do bloco', exact: true });
  await editor.fill(passage);
  const recover = page.getByRole('button', { name: 'Confirmar operação do bloco', exact: true });
  await expect(recover).toBeVisible();
  await expect(editor).toHaveAttribute('contenteditable', 'false');
  await recover.click();
  await expect(page.getByText('Salvo', { exact: true })).toBeVisible();
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await page.reload();
  await expect(
    page.getByRole('textbox', { name: 'Área de escrita do bloco', exact: true }),
  ).toHaveText(passage);
});

test('paginação mistura o principal e adicionais sem duplicação e verifica total explicitamente', async ({
  page,
}) => {
  await open(page, true);
  const nav = navigator(page);
  await expect(nav.getByRole('listitem')).toHaveCount(25);
  await nav.getByRole('button', { name: 'Carregar mais blocos', exact: true }).click();
  await expect(nav.getByRole('listitem')).toHaveCount(29);
  await expect(nav.getByRole('link', { name: 'Texto principal', exact: true })).toHaveCount(1);
  await nav.getByRole('button', { name: 'Verificar contagem da cena', exact: true }).click();
  await expect(
    nav.getByRole('button', { name: 'Verificar contagem da cena', exact: true }),
  ).toBeEnabled();
  await expect(nav.getByRole('link', { name: 'Texto principal', exact: true })).toHaveCount(1);
});

test('blocos em 320px preservam audiência ao cancelar e operam por teclado', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await open(page);
  await create(page, 'O segredo sob as marés');
  await menu(page, 'O segredo sob as marés', 'Editar detalhes');
  const dialog = page.getByRole('dialog', { name: 'Detalhes do bloco', exact: true });
  await expectDialogWithinViewport(page);
  await expect(
    dialog.getByRole('combobox', { name: 'Audiência do bloco', exact: true }),
  ).toContainText('Privado do criador');
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(navigator(page).getByText('Privado do criador', { exact: true })).toHaveCount(2);
  await expectNoHorizontalOverflow(page, 'Blocos narrativos em 320px');
  await capture(page, info, 'blocos-audiencia-teclado-320');
});
