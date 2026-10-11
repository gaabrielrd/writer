import { capture, expect, expectNoHorizontalOverflow, test } from './support';
import { chooseDropdown } from '../dropdown';
import { FIXTURE_BOOK_ID, FIXTURE_CHAPTER_ID } from './fixtures/data';

test('indicadores do minimapa usam as mesmas cores das tags de lore', async ({
  page,
}, testInfo) => {
  await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
  const editor = page.getByLabel('Área de escrita do capítulo');
  await expect(editor).toBeVisible();
  await page.getByRole('button', { name: /^Compêndio(?: \d+)?$/ }).click();
  await page.getByRole('button', { name: 'Nova Entidade', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome da Entidade').fill('Maré Fantasma');
  await chooseDropdown(dialog.getByRole('combobox', { name: 'Categoria' }), 'Outro');
  await dialog
    .getByLabel('Resumo Curto (exibido nos tooltips de leitura e edição)')
    .fill('Fenômeno fictício');
  await dialog.getByRole('button', { name: 'Continuar', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continuar', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continuar', exact: true }).click();
  await dialog.getByRole('button', { name: 'Cadastrar Entidade', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Fechar painel de lore' }).click();
  await editor.fill(
    'Lia consultou o Atlas das Marés.\n\nPorto das Lanternas avistou a Maré Fantasma.\n\n' +
      'Lia voltou ao porto.\n\n'.repeat(400),
  );
  const categories = [
    ['character', 'Lia'],
    ['location', 'Porto das Lanternas'],
    ['concept', 'Atlas das Marés'],
    ['other', 'Maré Fantasma'],
  ];
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    for (const [category, name] of categories) {
      const marker = page.locator(`[data-minimap-category="${category}"]`);
      await expect(marker).toHaveAttribute('d', /M/);
      await expect(marker).toHaveCSS('stroke-width', '1px');
      await expect(marker).toHaveCSS('vector-effect', 'non-scaling-stroke');
      await expect(marker.locator('..').locator('path').first()).toHaveCSS('stroke-width', '2px');
      const tag = page
        .getByRole('button', { name: new RegExp(`^${name}(?: \\(|$)`) })
        .locator('span')
        .first();
      await expect(tag).toBeVisible();
      expect(await marker.evaluate((element) => getComputedStyle(element).stroke)).toBe(
        await tag.evaluate((element) => getComputedStyle(element).backgroundColor),
      );
    }
  }
  const markerGaps = await page
    .locator('[data-minimap-category="character"]')
    .evaluate((element) => {
      const height = element.closest('svg')!.getBoundingClientRect().height;
      const rows = [...element.getAttribute('d')!.matchAll(/M[\d.]+ ([\d.]+)h/g)].map(
        (match) => (Number(match[1]) / 500) * height,
      );
      return rows.slice(1).map((row, index) => row - rows[index]);
    });
  expect(markerGaps.length).toBeGreaterThan(0);
  expect(Math.min(...markerGaps)).toBeGreaterThanOrEqual(2.99);
  const screenshot = testInfo.outputPath('minimapa-cores-das-tags.png');
  await page.screenshot({ path: screenshot, animations: 'disabled', caret: 'hide' });
  await testInfo.attach('minimapa com ocorrências densas', {
    path: screenshot,
    contentType: 'image/png',
  });
});

test('minimapa navega, acompanha viewport e preserva manuscrito na escrita contínua', async ({
  page,
}, testInfo) => {
  await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
  const editor = page.getByLabel('Área de escrita do capítulo');
  await expect(editor).toBeVisible();
  // Paste through the actual ProseMirror DOM handler, including structured headings.
  await editor.press('Control+A');
  await editor.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.setData(
      'text/html',
      '<h1>Partida</h1>' +
        Array.from(
          { length: 60 },
          (_, index) =>
            `<p>Trecho ${index}: Lia caminhou pela Cidade de Vidro. ${'O vento atravessou a praça silenciosa. '.repeat((index % 4) + 1)}</p>`,
        ).join('') +
        '<h2>Chegada</h2><p>Última linha do capítulo.</p>',
    );
    element.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }),
    );
  });
  await expect(editor.locator('h1')).toHaveText('Partida');
  const map = page.getByRole('listbox', { name: 'Trechos do capítulo' });
  const rail = page.getByRole('navigation', { name: 'Minimapa do capítulo' });
  const highlight = rail.locator('[data-minimap-viewport]');
  await expect(map.getByRole('option')).toHaveAttribute('aria-setsize', /^[1-9]\d+$/);
  await expect(rail).toBeVisible();
  const original = await editor.innerHTML();
  const bounds = await Promise.all([rail.boundingBox(), editor.boundingBox()]);
  expect(bounds[0]!.x + bounds[0]!.width).toBeLessThanOrEqual(bounds[1]!.x);
  const expectedHighlight = async () => {
    const difference = await page.evaluate(() => {
      const root = document
        .querySelector('[aria-label="Área de escrita do capítulo"]')!
        .getBoundingClientRect();
      const area = document.querySelector('[data-editor-scroll-area]')!.getBoundingClientRect();
      const indicator = document.querySelector<HTMLElement>('[data-minimap-viewport]')!;
      const clamp = (value: number) => Math.max(0, Math.min(1, value));
      const start = clamp((Math.max(0, area.top) - root.top) / root.height);
      const end = clamp((Math.min(innerHeight, area.bottom) - root.top) / root.height);
      return (
        Math.abs(parseFloat(indicator.style.top) / 100 - start) +
        Math.abs(parseFloat(indicator.style.height) / 100 - Math.max(0, end - start))
      );
    });
    return difference;
  };
  await map.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect(editor.locator('h1')).toBeInViewport();
  await expect.poll(expectedHighlight).toBeLessThan(0.01);
  await map.press('ArrowDown');
  await map.press('ArrowDown');
  await expect(map.getByRole('option')).toContainText('Personagem: Lia');
  await map.press('Enter');
  await expect(editor.locator('p').first()).toBeInViewport();
  await map.press('End');
  await map.press('Enter');
  await expect(editor.locator('p').last()).toBeInViewport();
  await expect.poll(expectedHighlight).toBeLessThan(0.01);
  await expect(highlight).not.toHaveAttribute('style', /height: 0%;/);
  // Mouse navigation must preserve the actual manuscript selection.
  await map.press('Home');
  await map.press('Enter');
  await editor.evaluate((element) => {
    const node = element.querySelector('h1')!.firstChild!;
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, 3);
    element.focus();
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  const box = (await map.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('Par');
  await expect.poll(expectedHighlight).toBeLessThan(0.01);
  expect(await editor.innerHTML()).toBe(original);
  await capture(page, testInfo, 'minimapa-meio-do-capitulo');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await expect(page.getByRole('button', { name: 'Preview', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edição', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /^Compêndio(?: \d+)?$/ }).click();
  await page.setViewportSize({ width: 320, height: 640 });
  await map.focus();
  await map.press('Home');
  await map.press('Enter');
  await expect(editor.locator('h1')).toBeInViewport();
  await map.press('End');
  await map.press('Enter');
  await expect(editor.locator('p').last()).toBeInViewport();
  await expect(map).toBeInViewport();
  const mobileMapBounds = (await map.boundingBox())!;
  expect(mobileMapBounds.y).toBeGreaterThanOrEqual(0);
  expect(mobileMapBounds.y + mobileMapBounds.height).toBeLessThanOrEqual(640);
  await expect.poll(expectedHighlight).toBeLessThan(0.01);
  await expectNoHorizontalOverflow(page, 'minimapa em 320px');
  await capture(page, testInfo, 'minimapa-celular');
  const screenshot = testInfo.outputPath('minimapa-celular-viewport.png');
  await page.screenshot({
    path: screenshot,
    fullPage: false,
    animations: 'disabled',
    caret: 'hide',
  });
  await testInfo.attach('minimapa na viewport de 320px', {
    path: screenshot,
    contentType: 'image/png',
  });
});
