import { chooseDropdown, themeLabels } from '../dropdown';
import { capture, expect, test } from './support';
import { FIXTURE_BOOK_ID, FIXTURE_CHAPTER_ID } from './fixtures/data';

// Headless Chromium hides scrollbars by default; this scenario must render them.
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

test('barras de rolagem seguem o tema em página, campo, portal e editor', async ({
  page,
  visualTheme,
}, testInfo) => {
  await page.goto('/styleguide');
  const themeSelect = page.getByRole('combobox', { name: 'Selecionar tema visual' });
  await expect(themeSelect).toBeVisible();
  const expectedColors = () =>
    page.evaluate(() => {
      const sample = document.createElement('span');
      sample.style.color = 'hsl(var(--muted-foreground) / 0.8)';
      document.body.appendChild(sample);
      const color = getComputedStyle(sample).color;
      sample.remove();
      return `${color} rgba(0, 0, 0, 0)`;
    });
  const check = async (selector: string) => {
    await expect(page.locator(selector)).toHaveCSS('scrollbar-color', await expectedColors());
    await expect(page.locator(selector)).toHaveCSS('scrollbar-width', 'thin');
  };
  await check('html');
  const textarea = page.getByLabel('Resumo / Sinopse');
  await textarea.fill('Uma linha do manuscrito.\n'.repeat(40));
  await expect(textarea).toHaveCSS('scrollbar-color', await expectedColors());
  await expect(textarea).toHaveCSS('scrollbar-width', 'thin');
  await textarea.hover();
  await page.mouse.wheel(0, 200);
  await expect.poll(() => textarea.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await testInfo.attach('scrollbar-campo-tema', {
    body: await textarea.screenshot(),
    contentType: 'image/png',
  });
  const originalColors = await expectedColors();
  await chooseDropdown(themeSelect, themeLabels[visualTheme === 'dark' ? 'light' : 'dark']);
  await expect(page.locator('html')).toHaveAttribute(
    'data-theme',
    visualTheme === 'dark' ? 'light' : 'dark',
  );
  await check('html');
  await expect(textarea).toHaveCSS('scrollbar-color', await expectedColors());
  expect(await expectedColors()).not.toBe(originalColors);
  await chooseDropdown(themeSelect, themeLabels[visualTheme]);
  await expect(page.locator('html')).toHaveAttribute('data-theme', visualTheme);
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: viewport.width, height: 620 });
  await page.getByRole('button', { name: 'Abrir Modal de Demonstração' }).click();
  await check('[data-slot="dialog-body"]');
  const dialogBody = page.locator('[data-slot="dialog-body"]');
  expect(await dialogBody.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
    true,
  );
  await dialogBody.hover();
  await page.mouse.wheel(0, 100);
  await expect.poll(() => dialogBody.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await capture(page, testInfo, 'scrollbar-dialogo-tema');
  await page.keyboard.press('Escape');
  await page.setViewportSize(viewport);

  await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
  const editor = page.getByLabel('Área de escrita do capítulo');
  await expect(editor).toBeVisible();
  await editor.fill('Uma linha longa do manuscrito para conferir a rolagem.\n'.repeat(100));
  const scrollers = await editor.evaluate((element) => {
    const result = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      if (
        node.scrollHeight > node.clientHeight &&
        ['auto', 'scroll'].includes(getComputedStyle(node).overflowY)
      )
        result.push({
          color: getComputedStyle(node).scrollbarColor,
          width: getComputedStyle(node).scrollbarWidth,
        });
    }
    const viewport = document.scrollingElement;
    if (viewport && viewport.scrollHeight > viewport.clientHeight) {
      result.push({
        color: getComputedStyle(viewport).scrollbarColor,
        width: getComputedStyle(viewport).scrollbarWidth,
      });
    }
    return result;
  });
  expect(scrollers.length).toBeGreaterThan(0);
  for (const scroller of scrollers) {
    expect(scroller.color).toBe(await expectedColors());
    expect(scroller.width).toBe('thin');
  }
  await capture(page, testInfo, 'scrollbar-editor-tema');
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(editor).toHaveCSS('scrollbar-color', 'auto');
  await expect(editor).toHaveCSS('scrollbar-width', 'auto');
});
