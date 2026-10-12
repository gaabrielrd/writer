import { capture, expect, expectNoHorizontalOverflow, test } from './support';
import { FIXTURE_BOOK_ID, FIXTURE_CHAPTER_ID } from './fixtures/data';

test('divisor do styleguide responde a drag, teclado e restauração', async ({ page }, testInfo) => {
  await page.goto('/styleguide');
  const handle = page.getByRole('separator', { name: 'Largura do painel de demonstração' });
  await handle.scrollIntoViewIfNeeded();
  await handle.focus();
  await handle.press('ArrowLeft');
  await expect(handle).toHaveAttribute('aria-valuenow', '42');
  await handle.press('Shift+ArrowRight');
  await expect(handle).toHaveAttribute('aria-valuenow', '32');
  await handle.press('End');
  await expect(handle).toHaveAttribute('aria-valuenow', '70');
  await handle.press('Home');
  await expect(handle).toHaveAttribute('aria-valuenow', '20');
  await handle.dblclick();
  await expect(handle).toHaveAttribute('aria-valuenow', '40');
  const rect = await handle.boundingBox();
  await page.mouse.move(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect!.x - 30, rect!.y + rect!.height / 2, { steps: 5 });
  await page.mouse.up();
  expect(Number(await handle.getAttribute('aria-valuenow'))).toBeGreaterThan(40);
  await expectNoHorizontalOverflow(page, 'divisor do styleguide');
  await capture(page, testInfo, 'divisor-redimensionavel');
});

test('painéis compartilham largura persistida e preservam seleção, texto e rascunho', async ({
  page,
}, testInfo) => {
  await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
  const editor = page.getByLabel('Área de escrita do capítulo');
  await editor.fill('Lia observa o porto.');
  await page.getByRole('button', { name: /^Compêndio(?: \d+)?$/ }).click();
  const lore = page.getByRole('complementary', { name: 'Painel lateral do Compêndio de Lore' });
  await expect(lore).toBeVisible();
  const handle = page.getByRole('separator', { name: 'Largura do painel lateral' });
  const desktop = testInfo.project.name.startsWith('desktop');
  if (desktop) {
    await expect(handle).toBeVisible();
    const before = await lore.boundingBox();
    await editor.press('Control+A');
    const selection = await page.evaluate(() => window.getSelection()!.toString());
    expect(selection).toBe('Lia observa o porto.');
    const rect = await handle.boundingBox();
    await page.mouse.move(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect!.x - 100, rect!.y + rect!.height / 2, { steps: 8 });
    await page.mouse.up();
    expect((await lore.boundingBox())!.width).toBeGreaterThan(before!.width + 80);
    expect(await page.evaluate(() => window.getSelection()!.toString())).toBe(selection);
  } else {
    await expect(handle).toHaveCount(0);
    expect((await lore.boundingBox())!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  const loreRect = await lore.boundingBox();
  const savedPercent = desktop ? await handle.getAttribute('aria-valuenow') : null;
  await page.getByRole('button', { name: 'Abrir Assistente Criativo de IA' }).click();
  const chat = page.getByRole('complementary', { name: 'Painel lateral do Assistente IA' });
  await expect(chat).toBeVisible();
  expect((await chat.boundingBox())!.width).toBeCloseTo(loreRect!.width, 0);
  expect((await chat.boundingBox())!.height).toBeCloseTo(loreRect!.height, 0);
  const draft = chat.getByLabel('Mensagem para o Assistente IA');
  await draft.fill('Conservar este rascunho.');
  await page.getByRole('button', { name: /^Compêndio(?: \d+)?$/ }).click();
  await page.getByRole('button', { name: 'Abrir Assistente Criativo de IA' }).click();
  await expect(draft).toHaveValue('Conservar este rascunho.');
  await expect(editor).toHaveText('Lia observa o porto.');
  await expect(page.getByText('Salvo', { exact: true })).toBeVisible();
  await capture(page, testInfo, 'painel-com-largura-ajustada');
  await page.reload();
  await page.getByRole('button', { name: 'Abrir Assistente Criativo de IA' }).click();
  await expect(draft).toHaveValue('Conservar este rascunho.');
  if (desktop) await expect(handle).toHaveAttribute('aria-valuenow', savedPercent!);
  await page.setViewportSize({ width: 320, height: 640 });
  await expect(handle).toHaveCount(0);
  await expectNoHorizontalOverflow(page, 'painel compartilhado em 320px');
});
