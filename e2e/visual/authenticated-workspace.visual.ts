import { test, expect, capture, expectNoHorizontalOverflow, navigateWorkspace } from './support';
import { FIXTURE_BOOK_ID, FIXTURE_CHAPTER_ID } from './fixtures/data';

test('área de trabalho ocupa a tela e a lateral recolhe sem perder o conteúdo', async ({
  page,
}, testInfo) => {
  await page.goto('/studio');
  const shell = page.locator('[data-writer-workspace]');
  await expect(shell).toBeVisible();
  const box = await shell.boundingBox();
  expect(box?.width).toBe(page.viewportSize()!.width);
  expect(box?.height).toBe(page.viewportSize()!.height);
  const desktop = page.viewportSize()!.width > 760;
  if (desktop) {
    const sidebar = page.getByRole('complementary', { name: 'Barra lateral do Writer' });
    const expectBrandAlignment = async () => {
      await expect
        .poll(async () => {
          const logo = await sidebar
            .getByRole('link', { name: 'Writer Assistant Início' })
            .locator('svg')
            .boundingBox();
          const header = await page.locator('[data-writer-workspace] > div > header').boundingBox();
          return Math.abs(logo!.y + logo!.height / 2 - header!.y - header!.height / 2);
        })
        .toBeLessThanOrEqual(1);
    };
    const panel = page.locator('[data-writer-workspace] > div').first();
    const panelBox = await panel.boundingBox();
    expect(panelBox!.y).toBeGreaterThan(0);
    expect(panelBox!.x + panelBox!.width).toBeLessThan(page.viewportSize()!.width);
    expect(panelBox!.y + panelBox!.height).toBeLessThan(page.viewportSize()!.height);
    expect(
      await panel.evaluate((element) => parseFloat(getComputedStyle(element).borderRadius)),
    ).toBeGreaterThan(0);
    await expect(sidebar).toBeVisible();
    expect((await sidebar.boundingBox())?.width).toBe(240);
    await expectBrandAlignment();
    await sidebar.getByRole('button', { name: 'Recolher navegação' }).click();
    await expect(sidebar).toBeVisible();
    expect((await sidebar.boundingBox())?.width).toBe(64);
    await expectBrandAlignment();
    await expect(sidebar.getByRole('link', { name: 'Writer Assistant Início' })).toBeVisible();
    await expect(
      sidebar.getByRole('link', { name: 'Writer Assistant Início' }).locator('svg'),
    ).toBeVisible();
    const expand = sidebar.getByRole('button', { name: 'Expandir navegação', exact: true });
    await expect(expand).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
    for (const name of ['Livros', 'Aventuras', 'Campanhas']) {
      const shortcut = sidebar.getByRole('link', { name, exact: true });
      await expect(shortcut.locator('svg')).toBeVisible();
      await expect(shortcut.locator('span')).toBeHidden();
    }
    const universes = sidebar.getByRole('link', { name: 'Universos', exact: true });
    await universes.hover();
    await expect(page.getByRole('tooltip')).toHaveText('Universos');
    const tooltip = await page.getByRole('tooltip').boundingBox();
    const iconBox = await universes.boundingBox();
    expect(tooltip!.x).toBeGreaterThan(iconBox!.x + iconBox!.width);
    await universes.focus();
    await capture(page, testInfo, 'sidebar-recolhida-com-icones');
    await universes.press('Enter');
    await expect(page).toHaveURL(/\/universes$/);
    await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
    const account = sidebar.getByRole('button', { name: /Sua conta: Marina de Exemplo/ });
    await account.hover();
    await expect(page.getByRole('tooltip')).toHaveText('Marina de Exemplo');
    await account.click();
    await expect(page.getByRole('menuitem', { name: 'Sair', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(account).toBeFocused();
    await sidebar.getByRole('button', { name: 'Todas as ferramentas', exact: true }).click();
    await expect(sidebar.getByRole('link', { name: 'Catálogo', exact: true })).toBeVisible();
    await expand.focus();
    await expand.press('Enter');
    await expect(sidebar).toBeVisible();
    expect((await sidebar.boundingBox())?.width).toBe(240);
    await expectBrandAlignment();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const duration = await sidebar.evaluate(
      (element) => getComputedStyle(element).transitionDuration,
    );
    expect(duration.split(',').some((value) => parseFloat(value) > 0)).toBe(true);
    await sidebar.getByRole('button', { name: 'Recolher navegação' }).click();
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(64);
    await expectBrandAlignment();
    const lineCounts = await sidebar
      .getByRole('button', { name: 'Expandir navegação' })
      .evaluate((button) => {
        if (!(button instanceof HTMLButtonElement))
          throw new Error('Controle de navegação inválido');
        button.click();
        return new Promise<number[]>((resolve) => {
          const started = performance.now();
          const counts: number[] = [];
          const sample = () => {
            for (const label of document.querySelectorAll('#writer-sidebar nav a > span')) {
              const range = document.createRange();
              range.selectNodeContents(label);
              counts.push(range.getClientRects().length);
            }
            if (performance.now() - started < 250) requestAnimationFrame(sample);
            else resolve(counts);
          };
          requestAnimationFrame(sample);
        });
      });
    expect(lineCounts.length).toBeGreaterThan(0);
    expect(lineCounts.every((count) => count === 1)).toBe(true);
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(240);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reducedDuration = await sidebar.evaluate(
      (element) => getComputedStyle(element).transitionDuration,
    );
    expect(reducedDuration.split(',').every((value) => parseFloat(value) < 0.001)).toBe(true);
    await expect(shell.getByRole('button', { name: /84 créditos/ })).toBeVisible();
  } else {
    const trigger = page.getByRole('button', { name: 'Abrir navegação' });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Navegação do Writer' });
    await expect(dialog).toBeVisible();
    await expect.poll(async () => (await dialog.boundingBox())?.x).toBe(0);
    await expect.poll(async () => (await dialog.boundingBox())?.y).toBe(0);
    expect((await dialog.boundingBox())!.height).toBe(page.viewportSize()!.height);
    const close = dialog.getByRole('button', { name: 'Fechar', exact: true });
    expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await close.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    await close.focus();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('link', { name: 'Estúdio', exact: true })).toBeFocused();
    await capture(page, testInfo, 'gaveta-de-navegacao');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    const original = page.viewportSize()!;
    await trigger.click();
    await page.setViewportSize({ width: 1024, height: 800 });
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole('complementary', { name: 'Barra lateral do Writer' }),
    ).toBeVisible();
    await page.setViewportSize(original);
  }
  await capture(page, testInfo, 'estudio-compacto');
  await navigateWorkspace(page, 'Universos');
  await expect(page).toHaveURL(/\/universes$/);
  await navigateWorkspace(page, 'Biblioteca de Imagens');
  await expect(
    page.getByRole('region', { name: 'Biblioteca de Imagens', exact: true }),
  ).toBeVisible();
  await capture(page, testInfo, 'imagens-compactas');
  await page.setViewportSize({ width: 320, height: 740 });
  await navigateWorkspace(page, 'Inteligência artificial');
  await expect(page.getByRole('region', { name: 'Inteligência artificial' })).toBeVisible();
  await expectNoHorizontalOverflow(page, 'configurações-320');
  await capture(page, testInfo, 'configuracoes-320');
  await page.getByRole('button', { name: 'Abrir navegação' }).click();
  await page.getByRole('button', { name: /Marina de Exemplo/ }).click();
  await page.getByRole('menuitem', { name: 'Inteligência artificial', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Navegação do Writer' })).toBeHidden();
  await expect(page.getByRole('region', { name: 'Inteligência artificial' })).toBeVisible();
});

test('editor usa o espaço restante e preserva manuscrito ao recolher navegação', async ({
  page,
}, testInfo) => {
  await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
  const editor = page.locator('[contenteditable="true"]').first();
  await expect(editor).toBeVisible();
  const text = await editor.innerText();
  if (page.viewportSize()!.width > 760) {
    const area = page.locator('[data-writer-workspace] main');
    const before = await area.boundingBox();
    await page
      .getByRole('complementary')
      .getByRole('button', { name: 'Recolher navegação' })
      .click();
    expect((await area.boundingBox())!.width).toBeGreaterThan(before!.width);
    await expect(editor).toHaveText(text, { useInnerText: true });
    await page.getByRole('button', { name: 'Entrar em tela cheia' }).click();
    await expect(page.getByRole('complementary', { name: 'Barra lateral do Writer' })).toBeHidden();
    const expandedPanel = await page.locator('[data-writer-workspace] > div').first().boundingBox();
    expect(expandedPanel!.x).toBe(0);
    expect(expandedPanel!.y).toBe(0);
    expect(expandedPanel!.width).toBe(page.viewportSize()!.width);
    await page.getByRole('button', { name: 'Sair da tela cheia' }).click();
    await expect(
      page.getByRole('complementary', { name: 'Barra lateral do Writer' }),
    ).toHaveAttribute('data-collapsed', 'true');
    await expect(editor).toHaveText(text, { useInnerText: true });
  }
  await expectNoHorizontalOverflow(page, 'editor-compacto');
  await capture(page, testInfo, 'editor-compacto');
});
