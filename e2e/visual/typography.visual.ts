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
