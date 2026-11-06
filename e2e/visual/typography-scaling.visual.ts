import { chooseDropdown } from '../dropdown';
import { capture, expect, test } from './support';
import { FIXTURE_BOOK_ID, FIXTURE_CHAPTER_ID } from './fixtures/data';

test('prosa acompanha ampliação de texto e o painel usa a fonte da interface', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/settings/preferences');
  await chooseDropdown(page.getByLabel('Preset de fontes'), 'Poético');
  await page.getByRole('button', { name: 'Salvar fontes', exact: true }).click();
  for (const [index, size] of [20, 18].entries()) {
    if (index === 1) {
      await page.goto('/settings/preferences');
      await chooseDropdown(page.getByLabel('Fonte do editor de texto'), 'Literata');
      await page.getByRole('button', { name: 'Salvar fontes', exact: true }).click();
    }
    await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
    const editor = page.getByRole('textbox', { name: 'Área de escrita do capítulo' });
    await expect(editor).toHaveCSS('font-size', `${size}px`);
    const text = await editor.textContent();
    await page.getByRole('button', { name: /^Compêndio(?: \d+)?$/ }).click();
    await expect(page.locator('[data-side-panel-header] h2').first()).toHaveCSS(
      'font-family',
      /IBM Plex Sans/,
    );
    await page.getByRole('button', { name: 'Fechar painel de lore' }).click();
    // Font scaling is separate from browser zoom; verify the actual computed prose size.
    await page.evaluate(() => document.documentElement.style.setProperty('font-size', '200%'));
    await expect(editor).toHaveCSS('font-size', `${size * 2}px`);
    await expect(editor).toHaveText(text!);
    await capture(page, testInfo, `texto-ampliado-${index}`);
    await page.evaluate(() => document.documentElement.style.removeProperty('font-size'));
    await expect(editor).toHaveCSS('font-size', `${size}px`);
    await expect(editor).toHaveText(text!);
  }
});
