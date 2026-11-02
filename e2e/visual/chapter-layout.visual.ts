import { capture, expect, expectNoHorizontalOverflow, test } from './support';
import { FIXTURE_BOOK_ID, FIXTURE_CHAPTER_ID } from './fixtures/data';
import { chooseDropdown } from '../dropdown';

test('preferência limita a prosa sem limitar ferramentas e permanece em tela cheia', async ({
  page,
}) => {
  await page.setViewportSize({ width: 3200, height: 1000 });
  for (const [label, width] of [
    ['Pequeno', 640],
    ['Médio', 760],
    ['Grande', 880],
  ] as const) {
    await page.goto('/settings/preferences');
    await chooseDropdown(page.getByRole('combobox', { name: 'Largura do conteúdo' }), label);
    await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
    const editor = page.getByLabel('Área de escrita do capítulo');
    await expect(editor).toBeVisible();
    const paragraph = editor.locator('p').first();
    await expect.poll(async () => Math.round((await paragraph.boundingBox())!.width)).toBe(width);
    const area = await page.locator('[data-editor-scroll-area]').boundingBox();
    const prose = await paragraph.boundingBox();
    expect(Math.abs(prose!.x + prose!.width / 2 - area!.x - area!.width / 2)).toBeLessThan(2);
    expect(
      (await page.getByRole('toolbar', { name: 'Ferramentas de escrita' }).boundingBox())!.width,
    ).toBeGreaterThan(2000);
    await page.getByRole('button', { name: 'Entrar em tela cheia' }).click();
    await expect.poll(async () => Math.round((await paragraph.boundingBox())!.width)).toBe(width);
    await page.getByRole('button', { name: 'Sair da tela cheia' }).click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page, 'Largura preferida em tela estreita');
});

test('capítulo separa largura da prosa e alterna o painel direito', async ({ page }, testInfo) => {
  await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
  const editor = page.getByLabel('Área de escrita do capítulo');
  await expect(editor).toBeVisible();
  await editor.fill('Lia voltou ao Porto das Lanternas. Lia consultou o Atlas das Marés.');
  const lore = page.locator('[data-editor-mentioned-lore]');
  await expect(lore.getByRole('button', { name: 'Lia (2)', exact: true })).toBeVisible();
  const desktop = testInfo.project.name.startsWith('desktop');
  if (desktop) {
    await page.setViewportSize({ width: 2400, height: 1000 });
    const workspace = page.locator('[data-editor-page]');
    expect((await workspace.boundingBox())!.width).toBeGreaterThan(1800);
    expect(Math.round((await editor.boundingBox())!.width)).toBe(760);
    expect((await lore.boundingBox())!.x).toBeGreaterThan(
      (await editor.boundingBox())!.x + (await editor.boundingBox())!.width,
    );
    const scrollArea = page.locator('[data-editor-scroll-area]');
    const prosa = await editor.boundingBox();
    const area = await scrollArea.boundingBox();
    expect(Math.abs(prosa!.x + prosa!.width / 2 - area!.x - area!.width / 2)).toBeLessThan(2);
    const toolbar = page.getByRole('toolbar', { name: 'Ferramentas de escrita' });
    expect((await toolbar.boundingBox())!.height).toBeLessThanOrEqual(44);
    const chapterHeader = page.locator('[data-editor-page] > header');
    expect((await chapterHeader.boundingBox())!.height).toBeLessThanOrEqual(44);
    await capture(page, testInfo, 'capitulo-desktop-lore');
  } else {
    expect((await lore.boundingBox())!.y).toBeLessThan((await editor.boundingBox())!.y);
    await capture(page, testInfo, 'capitulo-mobile-ribbon');
  }
  const originalEditor = await editor.elementHandle();
  await page.getByRole('button', { name: 'Abrir Assistente Criativo de IA' }).click();
  await expect(page.getByLabel('Mensagem para o Assistente IA')).toBeVisible();
  if (desktop) await expect(lore).toBeHidden();
  await page.getByRole('button', { name: /^Compêndio(?: \d+)?$/ }).click();
  await expect(page.getByRole('button', { name: 'Fechar painel de lore' })).toBeVisible();
  await expect(page.getByLabel('Mensagem para o Assistente IA')).toBeHidden();
  if (desktop) await expect(lore).toBeHidden();
  await page.getByRole('button', { name: 'Fechar painel de lore' }).click();
  await expect(lore).toBeVisible();
  expect(await editor.evaluate((element, original) => element === original, originalEditor)).toBe(
    true,
  );
  await expect(editor).toHaveText(
    'Lia voltou ao Porto das Lanternas. Lia consultou o Atlas das Marés.',
  );
  await expectNoHorizontalOverflow(page, 'Editor de capítulo');
  await editor.fill('Um capítulo sem referências.');
  await expect(lore.getByText('Nenhum item de lore mencionado neste capítulo.')).toBeVisible();
});
