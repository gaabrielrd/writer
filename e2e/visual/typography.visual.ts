import { chooseDropdown } from '../dropdown';
import { capture, expect, expectNoHorizontalOverflow, test } from './support';
import { FIXTURE_BOOK_ID, FIXTURE_CHAPTER_ID } from './fixtures/data';

test('cinco presets literários aplicam fontes reais com Clássico editorial como padrão', async ({
  page,
}, testInfo) => {
  await page.goto('/settings/preferences');
  await expect(page.getByLabel('Preset de fontes')).toHaveText('Clássico editorial');
  const presets = [
    ['Romance humanista', 'EB Garamond', 'IBM Plex Sans', 'EB Garamond'],
    ['Contemporâneo acolhedor', 'Lora', 'Nunito Sans', 'Lora'],
    ['Leitura digital', 'Literata', 'Source Sans 3', 'Literata'],
    ['Poético', 'Cormorant Garamond', 'IBM Plex Sans', 'Crimson Pro'],
    ['Clássico editorial', 'Libre Baskerville', 'Source Sans 3', 'Source Serif 4'],
  ];
  for (const [label, title, ui, editor] of presets) {
    await chooseDropdown(page.getByLabel('Preset de fontes'), label);
    await expect(page.getByRole('heading', { name: 'Tipografia literária' })).toHaveCSS(
      'font-family',
      new RegExp(title),
    );
    await expect(page.locator('body')).toHaveCSS('font-family', new RegExp(ui));
    await expect(page.getByLabel('Prévia da tipografia').locator('p').first()).toHaveCSS(
      'font-family',
      new RegExp(editor),
    );
    expect(
      await page.evaluate(
        async (family) => (await document.fonts.load('18px "' + family + '"')).length,
        editor,
      ),
    ).toBeGreaterThan(0);
  }
  const loaded = await page.evaluate(async () => {
    const families = [
      'Libre Baskerville',
      'Source Sans 3',
      'Source Serif 4',
      'EB Garamond',
      'IBM Plex Sans',
      'Lora',
      'Nunito Sans',
      'Literata',
      'Cormorant Garamond',
      'Crimson Pro',
    ];
    return Promise.all(
      families.flatMap((family) =>
        ['normal', 'italic'].map(
          async (style) =>
            (await document.fonts.load(`${style} 700 18px "${family}"`, 'Ação, ficção e memória.'))
              .length,
        ),
      ),
    );
  });
  expect(loaded).toHaveLength(20);
  expect(loaded.every((count) => count > 0)).toBe(true);
  await capture(page, testInfo, 'classico-editorial');
});

test('fontes personalizadas sobrevivem à recarga e ficam isoladas por conta', async ({ page }) => {
  await page.goto('/settings/preferences');
  await expect(page.getByLabel('Preset de fontes')).toHaveText('Clássico editorial');
  await chooseDropdown(page.getByLabel('Fonte dos títulos'), 'Cormorant Garamond');
  await chooseDropdown(page.getByLabel('Fonte da interface'), 'Nunito Sans');
  await chooseDropdown(page.getByLabel('Fonte do editor de texto'), 'Literata');
  await expect(page.getByLabel('Preset de fontes')).toHaveText('Personalizado');
  await page.getByRole('button', { name: 'Salvar fontes', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Fontes salvas' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Fonte dos títulos')).toHaveText('Cormorant Garamond');
  await expect(page.getByLabel('Fonte da interface')).toHaveText('Nunito Sans');
  await expect(page.getByLabel('Fonte do editor de texto')).toHaveText('Literata');
  await chooseDropdown(page.getByLabel('Preset de fontes'), 'Clássico editorial');
  await page.getByRole('button', { name: 'Cancelar prévia' }).click();
  await expect(page.getByLabel('Preset de fontes')).toHaveText('Personalizado');
  await chooseDropdown(page.getByLabel('Preset de fontes'), 'Romance humanista');
  await page.goto('/styleguide');
  await expect(page.getByLabel('Preset de fontes')).toHaveText('Personalizado');
  await expectNoHorizontalOverflow(page, 'styleguide com fontes personalizadas');
  await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
  const editor = page.getByRole('textbox', { name: 'Área de escrita do capítulo' });
  await expect(editor).toHaveCSS('font-family', /Literata/);
  await page.evaluate(() => {
    sessionStorage.setItem('writer.visual.account', 'second');
    window.dispatchEvent(new Event('writer.visual.auth-change'));
  });
  await page.goto('/settings/preferences');
  await expect(page.getByLabel('Preset de fontes')).toHaveText('Clássico editorial');
});

test('presets mantêm prosa legível no shell compacto e no leitor sem alterar o manuscrito', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const presets = [
    ['Clássico editorial', '18px'],
    ['Romance humanista', '20px'],
    ['Contemporâneo acolhedor', '18px'],
    ['Leitura digital', '18px'],
    ['Poético', '20px'],
  ];
  let manuscript: string | null = null;
  for (const [index, [label, size]] of presets.entries()) {
    await page.goto('/settings/preferences');
    await chooseDropdown(page.getByLabel('Preset de fontes'), label);
    const sample = page.getByLabel('Prévia da tipografia');
    await expect(sample.locator('p').first()).toHaveCSS('font-size', size);
    await expect(sample.locator('h3')).toHaveCSS('font-size', '24px');
    await expect(sample.locator('h3')).toHaveCSS('font-weight', '600');
    await expect(sample.locator('em')).toHaveCSS('font-style', 'italic');
    await expect(sample.locator('strong')).toHaveCSS('font-weight', '700');
    const save = page.getByRole('button', { name: 'Salvar fontes', exact: true });
    if (await save.isEnabled()) await save.click();
    await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
    const editor = page.getByRole('textbox', { name: 'Área de escrita do capítulo' });
    await expect(editor).toHaveCSS('font-size', size);
    const text = await editor.textContent();
    manuscript ??= text;
    expect(text).toBe(manuscript);
    await page.evaluate(() => document.fonts.ready);
    // Count actual characters on wrapped lines, rather than assuming 1ch = 1 character.
    const fullLines = async (paragraph: import('@playwright/test').Locator) =>
      paragraph.evaluate((element) => {
        const lines = new Map<number, number>();
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          for (let offset = 0; offset < (node.textContent?.length ?? 0); offset++) {
            const range = document.createRange();
            range.setStart(node, offset);
            range.setEnd(node, offset + 1);
            const top = Math.round(range.getBoundingClientRect().top);
            lines.set(top, (lines.get(top) ?? 0) + 1);
          }
        }
        return [...lines.values()].slice(0, -1);
      });
    const editorLines = await fullLines(editor.locator('p').first());
    expect(editorLines.length).toBeGreaterThan(0);
    for (const length of editorLines) {
      expect(length).toBeGreaterThanOrEqual(45);
      expect(length).toBeLessThanOrEqual(80);
    }
    await capture(page, testInfo, `legibility-${index}-editor`);
    await page.goto('/read/visual-public-atlas');
    await page.waitForLoadState('networkidle');
    const reader = page.locator('article > div').first();
    await expect(reader).toHaveCSS('font-size', size);
    await page.evaluate(() => document.fonts.ready);
    const readerLines = await fullLines(reader.locator('p').first());
    expect(readerLines.length).toBeGreaterThan(0);
    for (const length of readerLines) {
      expect(length).toBeGreaterThanOrEqual(45);
      expect(length).toBeLessThanOrEqual(80);
    }
    await capture(page, testInfo, `legibility-${index}-reader`);
  }
});
