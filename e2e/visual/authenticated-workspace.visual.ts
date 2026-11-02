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
    await expect(sidebar).toBeVisible();
    expect((await sidebar.boundingBox())?.width).toBe(240);
    await sidebar.getByRole('button', { name: 'Recolher navegação' }).click();
    await expect(sidebar).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Estúdio', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Abrir navegação' }).press('Enter');
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByRole('button', { name: /84 créditos/ })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'Biblioteca de Imagens' })).toBeVisible();
  await capture(page, testInfo, 'imagens-compactas');
  await page.setViewportSize({ width: 320, height: 740 });
  await navigateWorkspace(page, 'Inteligência artificial');
  await expect(page.getByRole('heading', { name: 'Inteligência artificial' })).toBeVisible();
  await expectNoHorizontalOverflow(page, 'configurações-320');
  await capture(page, testInfo, 'configuracoes-320');
  await page.getByRole('button', { name: 'Abrir navegação' }).click();
  await page.getByRole('button', { name: /Marina de Exemplo/ }).click();
  await page.getByRole('menuitem', { name: 'Configurar inteligência artificial' }).click();
  await expect(page.getByRole('dialog', { name: 'Navegação do Writer' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Inteligência artificial' })).toBeVisible();
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
  }
  await expectNoHorizontalOverflow(page, 'editor-compacto');
  await capture(page, testInfo, 'editor-compacto');
});
