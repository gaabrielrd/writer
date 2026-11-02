import { capture, expect, expectNoHorizontalOverflow, test } from './support';
import { FIXTURE_BOOK_ID, FIXTURE_CHAPTER_ID } from './fixtures/data';

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
    expect((await editor.boundingBox())!.width).toBeLessThanOrEqual(720);
    expect((await lore.boundingBox())!.x).toBeGreaterThan(
      (await editor.boundingBox())!.x + (await editor.boundingBox())!.width,
    );
    const scrollArea = page.locator('[data-editor-scroll-area]');
    const prosa = await editor.boundingBox();
    const area = await scrollArea.boundingBox();
    expect(Math.abs(prosa!.x + prosa!.width / 2 - area!.x - area!.width / 2)).toBeLessThan(2);
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
