import { capture, expect, test } from './support';
import { FIXTURE_BOOK_ID, FIXTURE_CHAPTER_ID } from './fixtures/data';

test('barras de rolagem seguem o tema em página, campo, portal e editor', async ({
  page,
  visualTheme,
}, testInfo) => {
  await page.goto('/styleguide');
  const themeSelect = page.getByRole('combobox', { name: 'Selecionar tema visual' });
  await expect(themeSelect).toBeVisible();
  const expectedColors = () =>
    page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d')!;
      const theme = getComputedStyle(document.documentElement);
      const resolve = (token: string) => {
        context.fillStyle = `hsl(${theme.getPropertyValue(token)})`;
        context.fillRect(0, 0, 1, 1);
        const color = context.getImageData(0, 0, 1, 1).data;
        return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
      };
      return `${resolve('--muted-foreground')} ${resolve('--background')}`;
    });
  const check = async (selector: string) => {
    await expect(page.locator(selector)).toHaveCSS('scrollbar-color', await expectedColors());
    await expect(page.locator(selector)).toHaveCSS('scrollbar-width', 'auto');
  };
  await check('html');
  const textarea = page.getByLabel('Resumo / Sinopse');
  await textarea.fill('Uma linha do manuscrito.\n'.repeat(40));
  await expect(textarea).toHaveCSS('scrollbar-color', await expectedColors());
  const originalColors = await expectedColors();
  await themeSelect.selectOption(visualTheme === 'dark' ? 'light' : 'dark');
  await expect(page.locator('html')).toHaveAttribute(
    'data-theme',
    visualTheme === 'dark' ? 'light' : 'dark',
  );
  await check('html');
  await expect(textarea).toHaveCSS('scrollbar-color', await expectedColors());
  expect(await expectedColors()).not.toBe(originalColors);
  await themeSelect.selectOption(visualTheme);
  await expect(page.locator('html')).toHaveAttribute('data-theme', visualTheme);
  await page.getByRole('button', { name: 'Abrir Modal de Demonstração' }).click();
  await check('[role="dialog"]');
  await page.keyboard.press('Escape');

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
    expect(scroller.width).toBe('auto');
  }
  await capture(page, testInfo, 'scrollbar-editor-tema');
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(editor).toHaveCSS('scrollbar-color', 'auto');
});
