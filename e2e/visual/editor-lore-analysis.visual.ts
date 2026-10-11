import { capture, expect, expectDialogWithinViewport, test } from './support';
import { FIXTURE_BOOK_ID, FIXTURE_CHAPTER_ID, books, author } from './fixtures/data';

test('editor discreto, configurações no usuário e revisão do compêndio por lote', async ({
  page,
}, testInfo) => {
  await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
  const editor = page.getByLabel('Área de escrita do capítulo');
  await expect(editor).toBeVisible();
  expect(
    await page
      .locator('main header')
      .evaluate((header) => getComputedStyle(header).borderBottomWidth),
  ).toBe('0px');
  const credits = page.getByRole('button', {
    name: `${author.credits} créditos de IA, plano free`,
  });
  await expect(
    page
      .getByRole('banner')
      .getByRole('button', { name: `${author.credits} créditos de IA, plano free` }),
  ).toBeVisible();
  await expect(credits).toHaveCount(1);
  await expect(page.getByRole('group', { name: 'Modo do editor' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Preview', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edição', exact: true })).toHaveCount(0);
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await expect(editor).toHaveAttribute('aria-readonly', 'false');
  expect(
    await page
      .getByRole('link', { name: 'Voltar para o livro' })
      .evaluate((link) => getComputedStyle(link).borderWidth),
  ).toBe('0px');
  await expect(page.getByRole('link', { name: 'Voltar para o livro' })).toHaveAttribute(
    'href',
    `/books/${FIXTURE_BOOK_ID}`,
  );
  await expect(
    page.getByRole('button', { name: 'Configurações de IA e Chaves de API', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: new RegExp(author.displayName!) }).click();
  await page.getByRole('menuitem', { name: 'Configurar inteligência artificial' }).click();
  await expect(page.getByRole('heading', { name: 'Inteligência artificial' })).toBeVisible();
  await page.getByRole('link', { name: 'Voltar ao editor' }).click();
  await expect(editor).toBeVisible();
  await editor.fill('Nara encontra o Farol do Norte.');
  await page.getByRole('button', { name: 'Compêndio', exact: true }).click();
  await capture(page, testInfo, 'editor-profissional');
  await page.getByRole('button', { name: 'Atualizar compêndio com base no texto' }).click();
  await page.getByRole('button', { name: 'Analisar capítulo', exact: true }).click();
  await expect(page.getByLabel('Sugestão: Nara')).toBeVisible();
  await expect(
    page.getByText(
      '1 crédito por lote aplicado. Analisar, cancelar ou descartar não consome créditos.',
    ),
  ).toBeVisible();
  await page.getByLabel('Sugestão: Nara').getByText('Revisar campos').click();
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'compendio-revisao-de-campos');
  await page.getByLabel('Sugestão: Nara').getByText('Revisar campos').click();
  await page.getByRole('button', { name: 'Aplicar 2 alterações' }).click();
  await expect(page.getByText('Lote aplicado. O compêndio foi atualizado.')).toBeVisible();
  await page.getByRole('button', { name: 'Concluir', exact: true }).click();
  await expect(page.locator('[data-lore-id]').filter({ hasText: 'Nara' })).toBeVisible();
  await page.getByRole('link', { name: 'Voltar para o livro' }).click();
  await expect(page.getByRole('heading', { name: books[0].title, exact: true })).toBeVisible();
});

test('BYOK aplica o lote sem consumir créditos da plataforma', async ({ page }) => {
  await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
  await expect(page.getByLabel('Área de escrita do capítulo')).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem(
      'writer_byok_config',
      JSON.stringify({ provider: 'openai_byok', openaiApiKey: 'fixture-key' }),
    );
    window.dispatchEvent(new StorageEvent('storage', { key: 'writer_byok_config' }));
  });
  await page.getByLabel('Área de escrita do capítulo').fill('Nara encontra o Farol do Norte.');
  await page.getByRole('button', { name: 'Compêndio', exact: true }).click();
  await page.getByRole('button', { name: 'Atualizar compêndio com base no texto' }).click();
  await page.getByRole('button', { name: 'Analisar capítulo', exact: true }).click();
  await expect(page.getByLabel('Sugestão: Nara')).toBeVisible();
  await expect(page.getByText(/BYOK: sem consumir créditos/)).toBeVisible();
  await page.getByRole('button', { name: 'Aplicar 2 alterações' }).click();
  await expect(page.getByText('Lote aplicado. O compêndio foi atualizado.')).toBeVisible();
  await page.getByRole('button', { name: 'Concluir', exact: true }).click();
  await expect(page.getByLabel(`${author.credits} créditos de IA, plano free`)).toBeVisible();
});
