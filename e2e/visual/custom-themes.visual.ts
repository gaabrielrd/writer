import { test, expect, capture } from './support';
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
  await page.getByRole('link', { name: 'Writer Assistant Início' }).click();
  await expect(panel).toBeVisible();
  await page
    .locator('a[href="/books/' + FIXTURE_BOOK_ID + '"]')
    .first()
    .click();
  await page
    .getByRole('button', { name: /Abrir capítulo/ })
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
  await expect(page.getByRole('link', { name: 'Writer Assistant Início' })).toBeVisible();
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
