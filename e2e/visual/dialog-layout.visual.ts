import type { Locator, Page } from '@playwright/test';
import { chooseDropdown } from '../dropdown';
import { author, FIXTURE_BOOK_ID, FIXTURE_CHAPTER_ID } from './fixtures/data';
import { capture, expect, expectNoHorizontalOverflow, test } from './support';

async function checkScroll(page: Page, dialog: Locator) {
  await expect(dialog).toBeVisible();
  const header = dialog.locator('[data-slot="dialog-header"]');
  const footer = dialog.locator('[data-slot="dialog-footer"]');
  const body = dialog.locator('[data-slot="dialog-body"]');
  await expect(body).toHaveCSS('overflow-y', 'auto');
  await expect(dialog).toHaveCSS('overflow-y', 'hidden');
  const bounds = (await dialog.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(bounds.height).toBeLessThanOrEqual(viewport.height * 0.8 + 1);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
  const before = { header: (await header.boundingBox())!, footer: (await footer.boundingBox())! };
  for (const box of Object.values(before)) {
    expect(box.y).toBeGreaterThanOrEqual(bounds.y);
    expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height);
  }
  await body.evaluate((element) => {
    element.scrollTop = 0;
  });
  await body.hover();
  await page.mouse.wheel(0, 10000);
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const after = { header: (await header.boundingBox())!, footer: (await footer.boundingBox())! };
  expect(after.header.y).toBeCloseTo(before.header.y, 1);
  expect(after.footer.y).toBeCloseTo(before.footer.y, 1);
  expect(await dialog.evaluate((element) => element.scrollTop)).toBe(0);
  expect(
    await body.evaluate(
      (element) =>
        [...element.querySelectorAll('*')].filter(
          (child) =>
            !child.matches('textarea') &&
            child.scrollHeight > child.clientHeight &&
            ['auto', 'scroll'].includes(getComputedStyle(child).overflowY),
        ).length,
    ),
  ).toBe(0);
}

test('edição de livro mantém header e footer visíveis em viewport baixo', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 480 });
  await page.goto(`/books/${FIXTURE_BOOK_ID}`);
  await page.getByRole('button', { name: 'Opções do livro' }).click();
  await page.getByRole('menuitem', { name: 'Editar', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar Obra' });
  await checkScroll(page, dialog);
  await capture(page, testInfo, 'modal-edicao-corpo-rolado');
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Opções do livro' })).toBeFocused();
});

test('importação extensa usa uma única área de rolagem', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Importar Documento', exact: true }).click();
  await page.getByLabel('Arquivo do manuscrito').setInputFiles({
    name: 'trinta-capitulos.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(
      '# Manuscrito\n\n' +
        Array.from(
          { length: 30 },
          (_, i) =>
            `## Capítulo ${i + 1}\n\nUma história extensa sobre uma cidade e seus habitantes.\n\n`,
        ).join(''),
    ),
  });
  await expect(page.getByText(/30 capítulos encontrados/)).toBeVisible();
  await checkScroll(page, page.getByRole('dialog', { name: 'Importar Livro de Documento' }));
  await expect(page.getByLabel('Título do capítulo 30', { exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Importar 30 Capítulo(s)' })).toBeInViewport();
  await capture(page, testInfo, 'modal-importacao-ultimo-capitulo');
});

test('preferências de IA na página com abas salvam em 320px', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(author.displayName!) }).click();
  await page.getByRole('menuitem', { name: 'Configurar inteligência artificial' }).click();
  await page.getByRole('tab', { name: 'Provedor', exact: true }).click();
  await expect(page).toHaveURL(/settings\/ai\?tab=provider/);
  await chooseDropdown(
    page.getByRole('combobox', { name: 'Provedor de IA' }),
    'OpenAI API (Chave Própria — BYOK)',
  );
  await page.getByLabel('Chave de API da OpenAI').fill('chave-ficticia');
  const dialog = page.getByRole('tabpanel', { name: 'Provedor', exact: true });
  await expectNoHorizontalOverflow(page, 'configuração de IA');
  await dialog.getByRole('button', { name: 'Salvar Preferências' }).scrollIntoViewIfNeeded();
  await dialog.getByRole('button', { name: 'Salvar Preferências' }).click();
  await expect(dialog.getByText('Configurações salvas com sucesso!')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Provedor', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('combobox', { name: 'Provedor de IA' })).toContainText('OpenAI');
  await expect(page.getByLabel('Chave de API da OpenAI')).toHaveValue('chave-ficticia');
  await capture(page, testInfo, 'pagina-ia-abas-provedor');
});

test('assistente lateral mantém Enviar inteiro em 320px', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
  await page.getByRole('button', { name: 'Abrir Assistente Criativo de IA' }).click();
  const dialog = page.getByRole('complementary', { name: 'Painel lateral do Assistente IA' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: /BYOK/ })).toHaveCount(0);
  const body = dialog.getByRole('region', { name: 'Mensagens da conversa' });
  await expect(body).toHaveCSS('overflow-y', 'auto');
  await expect(dialog).toHaveCSS('overflow-y', 'hidden');
  const header = dialog.locator('header');
  await dialog.getByLabel('Mensagem para o Assistente IA').fill('Descreva o cenário');
  const bounds = (await dialog.boundingBox())!;
  const action = dialog.getByRole('button', { name: 'Enviar', exact: true });
  await action.scrollIntoViewIfNeeded();
  await expect(action).toBeInViewport();
  const actionBounds = (await action.boundingBox())!;
  expect(actionBounds.x).toBeGreaterThanOrEqual(bounds.x);
  expect(actionBounds.x + actionBounds.width).toBeLessThanOrEqual(bounds.x + bounds.width);
  expect(actionBounds.y + actionBounds.height).toBeLessThanOrEqual(bounds.y + bounds.height);
  expect((await header.boundingBox())!.width).toBeLessThanOrEqual(320);
  await capture(page, testInfo, 'painel-assistente-ia-320px');
  await dialog.getByRole('button', { name: 'Fechar painel de IA', exact: true }).click();
  await expect(page.getByLabel('Área de escrita do capítulo')).toBeFocused();
});
