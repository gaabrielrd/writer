import { capture, expect, expectNoHorizontalOverflow, test } from './support';

test('assistente flutua fora da caixa do modal e conserva posição e foco', async ({
  page,
}, testInfo) => {
  await page.goto('/universes');
  const dock = page.getByRole('complementary', { name: 'Assistente da página' });
  await dock.getByRole('button', { name: 'Assistente da página', exact: true }).click();
  await expect
    .poll(async () => {
      const current = (await dock.boundingBox())!;
      return current.y + current.height;
    })
    .toBeCloseTo(page.viewportSize()!.height - 12, 0);
  const initial = (await dock.boundingBox())!;
  await page.getByRole('button', { name: 'Criar primeiro universo' }).click();
  const modal = page.getByRole('dialog', { name: 'Criar universo', exact: true });
  const name = page.getByLabel('Nome do universo');
  await expect(name).toBeFocused();
  await expect
    .poll(async () => {
      const current = (await dock.boundingBox())!;
      return current.y + current.height;
    })
    .toBeCloseTo(initial.y + initial.height, 0);
  const box = (await modal.boundingBox())!;
  expect((await dock.boundingBox())!.y).toBeGreaterThan(box.y + box.height);
  const prompt = dock.getByRole('textbox');
  await prompt.fill('Uma pergunta preservada');
  await expect(prompt).toBeFocused();
  await expect(modal).toBeVisible();
  await name.fill('Universo novo');
  const grip = dock.getByRole('button', { name: 'Mover assistente' });
  await grip.focus();
  await grip.press('ArrowRight');
  await expect.poll(async () => (await dock.boundingBox())!.x).toBeGreaterThan(initial.x);
  await capture(page, testInfo, 'assistente-fora-do-modal');
  await prompt.focus();
  await prompt.press('Escape');
  await expect(modal).toBeVisible();
  await expect(dock).toHaveAttribute('data-mode', 'minimized');
  await dock.getByRole('button', { name: 'Assistente da página', exact: true }).click();
  await modal.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(prompt).toHaveValue('Uma pergunta preservada');
});

test('controles compactos do universo e compositor contextual do assistente', async ({
  page,
}, testInfo) => {
  await page.goto('/universes');
  await page.getByRole('button', { name: 'Criar primeiro universo' }).click();
  await page.getByLabel('Nome do universo').fill('Universo das Marés');
  await page.getByRole('button', { name: 'Salvar universo' }).click();
  await page.getByRole('link', { name: 'Abrir lore' }).click();
  await expect(page.getByRole('heading', { name: 'Universo das Marés' })).toBeVisible();
  const list = page.getByRole('button', { name: 'Visualização em lista' });
  await list.click();
  await expect(list).toHaveAttribute('aria-pressed', 'true');
  const grid = page.getByRole('button', { name: 'Visualização em grid' });
  await grid.focus();
  await grid.press('Space');
  await expect(grid).toHaveAttribute('aria-pressed', 'true');
  const dock = page.getByRole('complementary', { name: 'Assistente da página' });
  await dock.getByRole('button', { name: 'Assistente da página', exact: true }).click();
  const prompt = dock.getByRole('textbox', { name: 'Pedido ao assistente da página' });
  await expect(prompt).toHaveAttribute(
    'placeholder',
    /personagens, locais ou conceitos deste universo/,
  );
  await expect(dock.locator('label')).toHaveCount(0);
  const send = dock.getByRole('button', { name: 'Enviar pedido' });
  await expect(send).toBeDisabled();
  await prompt.fill('Ajude a organizar os personagens');
  await expect(send).toBeEnabled();
  await expect(send).toHaveText('');
  const fieldBounds = (await prompt.boundingBox())!;
  const sendBounds = (await send.boundingBox())!;
  expect(sendBounds.x + sendBounds.width).toBeLessThan(fieldBounds.x + fieldBounds.width);
  expect(sendBounds.y + sendBounds.height).toBeLessThan(fieldBounds.y + fieldBounds.height);
  const context = dock.locator('p').filter({ hasText: 'Contexto: Universo' });
  expect((await context.boundingBox())!.y).toBeGreaterThan(fieldBounds.y + fieldBounds.height);
  await expectNoHorizontalOverflow(page, 'universo-controles');
  await capture(page, testInfo, 'universo-controles');
});
