import { capture, expect, test } from './support';

test('dropdowns com busca, ícones e callbacks se adaptam ao tema e viewport', async ({
  page,
  visualTheme,
}, testInfo) => {
  await page.goto('/styleguide');
  const trigger = page.getByRole('combobox', { name: 'Categoria de Lore' });
  await trigger.click();
  const popup = page.getByRole('dialog', { name: 'Categoria de Lore' });
  const filter = page.getByRole('textbox', { name: 'Buscar em Categoria de Lore' });
  await expect(filter).toBeFocused();
  await expect(popup).toHaveCSS(
    'background-color',
    await popup.evaluate((element) => {
      const probe = document.createElement('span');
      probe.style.color = 'hsl(var(--popover))';
      element.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    }),
  );
  await filter.fill('conceito / magia');
  await expect(page.getByRole('option')).toHaveCount(1);
  await filter.fill('nada encontrado');
  await expect(popup.getByRole('status')).toHaveText('Nenhuma opção encontrada.');
  await filter.fill('local');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveText('Local');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(filter).toHaveValue('');
  await expect(page.getByRole('option', { name: 'Local', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const bounds = await popup.boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds!.height).toBeLessThanOrEqual(viewport.height);
  await capture(page, testInfo, 'dropdown-selecao');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Abrir Modal de Demonstração' }).click();
  const actions = page.getByRole('button', { name: 'Ações com busca', exact: true });
  await actions.click();
  await page.getByRole('textbox', { name: 'Buscar em Ações com busca' }).fill('exportar');
  await page.getByRole('menuitem', { name: 'Exportar exemplo' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Modal do Design System' }).getByRole('status'),
  ).toHaveText('Ação executada: Exportar exemplo');
  await expect(actions).toHaveText('Ações com busca');
  const iconOnly = page.getByRole('button', { name: 'Ações somente com ícone' });
  await expect(iconOnly).toHaveText('');
  await iconOnly.click();
  await page.getByRole('menuitem', { name: 'Editar exemplo' }).click();
  await expect(iconOnly).toBeFocused();
  await expect(
    page.getByRole('dialog', { name: 'Modal do Design System' }).getByRole('status'),
  ).toHaveText('Ação executada: Editar exemplo');
  await expect(page.getByRole('dialog', { name: 'Modal do Design System' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', visualTheme);
  await capture(page, testInfo, 'dropdown-acoes');
  await page.keyboard.press('Escape');
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
});

test('menus fecham ao clicar fora e mantêm o formulário aberto', async ({ page }) => {
  await page.goto('/styleguide');
  await page.getByRole('button', { name: 'Abrir Modal de Demonstração' }).click();
  const heading = await page
    .getByRole('heading', { name: 'Modal do Design System', exact: true })
    .boundingBox();
  await page.getByRole('button', { name: 'Ações com busca', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Buscar em Ações com busca' })).toBeFocused();
  await page.mouse.click(heading!.x + 8, heading!.y + 8);
  await expect(page.getByRole('dialog', { name: 'Ações com busca' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Modal do Design System' })).toBeVisible();
});
