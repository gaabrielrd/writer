import { capture, expect, expectNoHorizontalOverflow, test } from './support';

test('perfil de campanha, guia retomável e barra persistente por teclado', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => sessionStorage.setItem('writer.visual.onboarding-new', 'true'));
  await page.goto('/studio');
  const intro = page.getByRole('dialog', { name: 'Vamos organizar seu espaço de criação' });
  await expect(intro).toBeVisible();
  await intro.getByRole('button', { name: 'Campanhas', exact: true }).click();
  await intro.getByRole('button', { name: 'Salvar e continuar' }).click();
  const guide = page.getByRole('dialog', { name: 'Guia do Writer' });
  await expect(guide).toBeVisible();
  await guide.getByRole('button', { name: 'Pausar guia' }).click();
  await expect(guide).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Prepare a próxima sessão da sua mesa.' }),
  ).toBeVisible();
  await page.reload();
  await expect(intro).toHaveCount(0);
  const dock = page.getByRole('complementary', { name: 'Assistente da página' });
  await expect(dock).toBeVisible();
  await page.getByLabel('Pedido ao assistente da página').fill('Uma pergunta ainda em elaboração');
  await page.getByRole('link', { name: 'Todos os projetos', exact: true }).click();
  await expect(page.getByLabel('Pedido ao assistente da página')).toHaveValue(
    'Uma pergunta ainda em elaboração',
  );
  const grip = dock.getByRole('button', { name: 'Mover assistente' });
  await grip.focus();
  const original = (await dock.boundingBox())!;
  await grip.press('ArrowUp');
  await expect.poll(async () => (await dock.boundingBox())!.y).toBeLessThan(original.y);
  await dock.getByRole('button', { name: 'Restaurar posição do assistente' }).click();
  await dock.getByRole('button', { name: 'Minimizar assistente' }).click();
  await expect(page.getByLabel('Pedido ao assistente da página')).toBeHidden();
  await dock.getByRole('button', { name: 'Assistente da página', exact: true }).click();
  await expect(page.getByLabel('Pedido ao assistente da página')).toHaveValue(
    'Uma pergunta ainda em elaboração',
  );
  await expectNoHorizontalOverflow(page, 'perfil-e-assistente');
  await capture(page, testInfo, 'perfil-e-assistente');
});
