import { test, expect, capture, navigateWorkspace } from './support';
import { chooseDropdown } from '../dropdown';
import { FIXTURE_BOOK_ID } from './fixtures/data';
test('cria tema com prévia navegável, modo avançado, edição e remoção', async ({
  page,
}, testInfo) => {
  await page.goto('/styleguide');
  await page.getByRole('button', { name: 'Temas personalizados', exact: true }).click();
  await page.getByRole('button', { name: 'Criar novo', exact: true }).click();
  const panel = page.getByRole('region', { name: /Criar tema/ });
  await expect(panel).toBeVisible();
  await panel.getByLabel('Nome do tema').fill('Floresta pessoal');
  await panel.getByLabel('Cor de destaque', { exact: true }).fill('#28795a');
  await panel.getByRole('button', { name: /Tonal/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-custom-theme', /custom-/);
  await panel.getByRole('button', { name: /Modo avançado/ }).click();
  await panel.getByLabel('Fundo da página', { exact: true }).fill('#f5f7f5');
  await panel.getByRole('button', { name: /Expressiva/ }).click();
  await expect(panel.getByLabel('Fundo da página', { exact: true })).toHaveValue('#f5f7f5');
  await panel.getByRole('button', { name: 'Restaurar Fundo da página', exact: true }).click();
  await panel.getByRole('button', { name: /Modo avançado/ }).click();
  await capture(page, testInfo, 'criacao-tema-flutuante');
  await panel.getByRole('button', { name: 'Recolher painel de tema' }).click();
  // SPA navigation must preserve the panel and preview, including in the real editor.
  await navigateWorkspace(page, 'Projetos');
  await expect(panel).toBeVisible();
  await page
    .locator('a[href="/books/' + FIXTURE_BOOK_ID + '"]')
    .first()
    .click();
  await page
    .getByRole('button', { name: /Escrever/ })
    .first()
    .click();
  const manuscript = page.getByLabel('Área de escrita do capítulo');
  await expect(manuscript).toBeVisible();
  const before = await manuscript.innerHTML();
  await panel.getByRole('button', { name: 'Expandir painel de tema' }).click();
  await panel.getByRole('button', { name: 'Comparar com o tema anterior' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-custom-theme');
  await panel.getByRole('button', { name: 'Voltar à prévia' }).click();
  await expect(manuscript).toHaveJSProperty('innerHTML', before);
  await panel.getByRole('button', { name: 'Salvar tema', exact: true }).click();
  await expect(panel).not.toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-custom-theme', /custom-/);
  await page.getByRole('button', { name: 'Temas personalizados', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Aplicar tema Floresta pessoal' })).toBeVisible();
  await capture(page, testInfo, 'lista-temas-personalizados');
  await page.getByRole('button', { name: 'Opções do tema Floresta pessoal' }).click();
  await page.getByRole('menuitem', { name: 'Editar', exact: true }).click();
  const editor = page.getByRole('region', { name: /Editar tema/ });
  await editor.getByLabel('Nome do tema').fill('Floresta revisada');
  await editor.getByRole('button', { name: 'Salvar tema', exact: true }).click();
  await page.getByRole('button', { name: 'Temas personalizados', exact: true }).click();
  await page.getByRole('button', { name: 'Opções do tema Floresta revisada' }).click();
  await page.getByRole('menuitem', { name: 'Remover', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Remover tema', exact: true })
    .getByRole('button', { name: 'Remover tema', exact: true })
    .click();
  await expect(page.locator('html')).not.toHaveAttribute('data-custom-theme');
});
test('painel cabe em 320 px, move por teclado e mantém foco e navegação', async ({
  page,
}, testInfo) => {
  await page.goto('/styleguide');
  await page.getByRole('button', { name: 'Temas personalizados', exact: true }).click();
  await page.getByRole('button', { name: 'Criar novo', exact: true }).click();
  const panel = page.getByRole('region', { name: /Criar tema/ });
  await expect(panel).toBeVisible();
  await panel.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  if ((page.viewportSize()?.width ?? 0) > 600) {
    const original = await panel.boundingBox();
    const grip = await panel.getByRole('button', { name: 'Mover painel de tema' }).boundingBox();
    await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + grip!.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip!.x - 100, grip!.y + 20, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await panel.boundingBox())!.x).toBeLessThan(original!.x);
    const before = await panel.boundingBox();
    await panel.getByRole('button', { name: 'Mover painel de tema' }).focus();
    await page.keyboard.press('ArrowLeft');
    const after = await panel.boundingBox();
    expect(after!.x).toBeLessThan(before!.x);
  }
  await page.setViewportSize({ width: 320, height: 640 });
  await panel.getByRole('button', { name: /Modo avançado/ }).click();
  await capture(page, testInfo, 'modo-avancado-320');
  await panel.getByLabel('Nome do tema').fill('Cor inválida');
  await panel.getByLabel('Fundo da página', { exact: true }).fill('#zzzzzz');
  await panel.getByRole('button', { name: /Modo avançado/ }).click();
  await panel.getByRole('button', { name: 'Salvar tema', exact: true }).click();
  await expect(panel.getByLabel('Fundo da página', { exact: true })).toBeFocused();
  await panel.getByRole('button', { name: 'Recolher painel de tema' }).click();
  await navigateWorkspace(page, 'Projetos');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Expandir painel de tema' }).click();
  await panel.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-custom-theme');
});

test('base escura acompanha os portais e salvar pela confirmação preserva o fluxo', async ({
  page,
}) => {
  await page.goto('/styleguide');
  await page.getByRole('button', { name: 'Temas personalizados', exact: true }).click();
  await page.getByRole('button', { name: 'Criar novo', exact: true }).click();
  const panel = page.getByRole('region', { name: /Criar tema/ });
  await panel.getByLabel('Nome do tema').fill('Meu tema escuro');
  await chooseDropdown(panel.getByRole('combobox', { name: 'Base do tema' }), 'Escuro');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await panel.getByRole('button', { name: 'Recolher painel de tema' }).click();
  await page.getByRole('button', { name: 'Abrir Modal de Demonstração', exact: true }).click();
  await expect(page.locator('[data-floating-panel]')).toHaveAttribute('inert', '');
  const modal = page.getByRole('dialog', { name: 'Modal do Design System', exact: true });
  await expect(modal).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).not.toHaveAttribute('inert');
  await panel.getByRole('button', { name: 'Expandir painel de tema' }).click();
  await panel.getByRole('button', { name: 'Fechar editor de tema' }).click();
  const confirmation = page.getByRole('dialog', { name: 'Alterações no tema' });
  await confirmation.getByRole('button', { name: 'Salvar e continuar' }).click();
  await expect(panel).not.toBeVisible();
  await expect(confirmation).not.toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-custom-theme', /custom-/);
});

test('pickers e controles de fundo respeitam a base atual e persistem os ajustes', async ({
  page,
  visualTheme,
}, testInfo) => {
  await page.goto('/styleguide');
  await page.getByRole('button', { name: 'Temas personalizados', exact: true }).click();
  await page.getByRole('button', { name: 'Criar novo', exact: true }).click();
  const panel = page.getByRole('region', { name: /Criar tema/ });
  const dark = visualTheme === 'dark';
  await expect(panel.getByRole('combobox', { name: 'Base do tema' })).toContainText(
    dark ? 'Escuro' : 'Claro',
  );
  await expect(panel.getByText('Base do tema', { exact: true })).toHaveCount(0);
  await panel.getByPlaceholder('Nome', { exact: true }).fill('Controles do fundo');
  const intensity = panel.getByRole('slider', { name: 'Intensidade', exact: true });
  await expect(panel.getByText('Intensidade', { exact: true })).not.toBeVisible();
  await expect(panel.locator('output')).not.toBeVisible();
  await expect(
    panel.getByText(dark ? '0 · Preto' : '0 · Branco', { exact: true }),
  ).not.toBeVisible();
  const start = panel.getByTitle('Cor inicial do fundo');
  const end = panel.getByTitle('Cor final do fundo');
  await expect(start).toHaveCSS('background-color', dark ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)');
  await expect(end).toHaveCSS('background-color', dark ? 'rgb(48, 48, 48)' : 'rgb(224, 224, 224)');
  const startBounds = await start.boundingBox(),
    endBounds = await end.boundingBox(),
    rangeBounds = await intensity.boundingBox();
  expect(startBounds!.x + startBounds!.width).toBeLessThan(rangeBounds!.x);
  expect(endBounds!.x).toBeGreaterThan(rangeBounds!.x + rangeBounds!.width);
  await intensity.focus();
  await page.keyboard.press('Home');
  await expect(page.locator('html')).toHaveCSS(
    '--background',
    dark ? '0.00 0.00% 0.00%' : '0.00 0.00% 100.00%',
  );
  await page.keyboard.press('End');
  const original = await page
    .locator('html')
    .evaluate((el) => el.style.getPropertyValue('--background'));
  await panel.getByLabel('Matiz do fundo', { exact: true }).fill('#336699');
  await expect(intensity).toHaveValue('100');
  await expect
    .poll(() => page.locator('html').evaluate((el) => el.style.getPropertyValue('--background')))
    .not.toBe(original);
  const sliderBounds = await intensity.boundingBox(),
    hueBounds = await panel.getByLabel('Matiz do fundo', { exact: true }).boundingBox();
  expect(hueBounds!.x).toBeGreaterThan(sliderBounds!.x + sliderBounds!.width);
  await panel.getByLabel('Escolher cor: Cor de destaque', { exact: true }).fill('#28795a');
  await expect(panel.getByLabel('Cor de destaque', { exact: true })).toHaveValue('#28795a');
  await panel.getByRole('button', { name: /Modo avançado/ }).click();
  await panel.getByLabel('Escolher cor: Fundo da página', { exact: true }).fill('#112233');
  await expect(panel.getByLabel('Fundo da página', { exact: true })).toHaveValue('#112233');
  await expect(panel.locator('input[type="color"]')).toHaveCount(26);
  await intensity.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(panel.getByLabel('Fundo da página', { exact: true })).not.toHaveValue('#112233');
  await panel.getByRole('button', { name: /Modo avançado/ }).click();
  await panel.getByPlaceholder('Nome', { exact: true }).scrollIntoViewIfNeeded();
  await panel.screenshot({ path: testInfo.outputPath('controles-do-painel.png') });
  await capture(page, testInfo, 'pickers-e-controles-de-fundo');
  await panel.getByRole('button', { name: 'Salvar tema', exact: true }).click();
  await expect(panel).not.toBeVisible();
  await page.getByRole('button', { name: 'Temas personalizados', exact: true }).click();
  await page.getByRole('button', { name: 'Opções do tema Controles do fundo' }).click();
  await page.getByRole('menuitem', { name: 'Editar', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Intensidade', exact: true })).toHaveValue('99');
  await expect(page.getByLabel('Matiz do fundo', { exact: true })).toHaveValue('#336699');
});
