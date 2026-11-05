import { capture, expect, test } from './support';

test('guia arrasta pelo texto e espacos livres, preserva controles e respeita a janela', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => sessionStorage.setItem('writer.visual.onboarding-new', 'true'));
  await page.goto('/studio');
  const intro = page.getByRole('dialog', { name: 'Vamos organizar seu espaço de criação' });
  await intro.getByRole('button', { name: 'Livros', exact: true }).click();
  await intro.getByRole('button', { name: 'Salvar e continuar' }).click();
  const guide = page.getByRole('dialog', { name: 'Guia do Writer' });
  await expect(guide).toBeVisible();
  const profile = () =>
    page.evaluate(() => {
      for (let index = 0; index < sessionStorage.length; index++) {
        const key = sessionStorage.key(index);
        if (key?.startsWith('writer.visual.onboarding:')) return sessionStorage.getItem(key);
      }
      return null;
    });
  const savedProfile = await profile();
  const dragFrom = async (x: number, y: number, dx: number, dy: number) => {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 6 });
    await page.mouse.up();
  };
  for (const target of [
    guide.getByRole('heading'),
    guide.locator('p'),
    guide.locator('span').filter({ hasText: 'Seu primeiro percurso' }),
  ]) {
    const before = (await guide.boundingBox())!;
    const area = (await target.boundingBox())!;
    await dragFrom(area.x + 6, area.y + area.height / 2, 60, 35);
    await expect.poll(async () => (await guide.boundingBox())!.x).toBeCloseTo(before.x + 60, 0);
    await expect.poll(async () => (await guide.boundingBox())!.y).toBeCloseTo(before.y + 35, 0);
  }
  let before = (await guide.boundingBox())!;
  await dragFrom(before.x + 8, before.y + 8, 60, 35);
  await expect.poll(async () => (await guide.boundingBox())!.x).toBeCloseTo(before.x + 60, 0);
  expect(await profile()).toBe(savedProfile);

  // Descendants of buttons and links keep their native interaction, including icons.
  before = (await guide.boundingBox())!;
  const arrow = (await guide
    .getByRole('button', { name: 'Próxima dica' })
    .locator('svg')
    .boundingBox())!;
  await dragFrom(arrow.x + arrow.width / 2, arrow.y + arrow.height / 2, 80, 0);
  expect((await guide.boundingBox())!.x).toBeCloseTo(before.x, 0);
  await guide.getByRole('button', { name: 'Próxima dica' }).click();
  await expect(guide).toContainText('Seu primeiro percurso · 2 de 6');
  await guide.getByRole('link', { name: 'Conhecer a criação' }).click();
  await expect(page).toHaveURL(/\/studio\/new/);
  expect((await guide.boundingBox())!.x).toBeCloseTo(before.x, 0);

  await guide.getByRole('button', { name: /Mover guia/ }).focus();
  before = (await guide.boundingBox())!;
  await guide.press('ArrowRight');
  await expect.poll(async () => (await guide.boundingBox())!.x).toBeCloseTo(before.x + 16, 0);
  const origin = (await guide.boundingBox())!;
  await page.mouse.move(origin.x + 8, origin.y + 8);
  await page.mouse.down();
  await page.mouse.move(origin.x + 100, origin.y + 80, { steps: 4 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect.poll(async () => (await guide.boundingBox())!.x).toBeCloseTo(origin.x, 0);
  await expect.poll(async () => (await guide.boundingBox())!.y).toBeCloseTo(origin.y, 0);
  await expect(guide).toBeVisible();

  await page.mouse.move(origin.x + 8, origin.y + 8);
  await page.mouse.down();
  await page.mouse.move(origin.x + 80, origin.y + 60, { steps: 4 });
  await guide.dispatchEvent('pointercancel', { pointerId: 1 });
  await page.mouse.up();
  await expect.poll(async () => (await guide.boundingBox())!.x).toBeCloseTo(origin.x, 0);
  await expect.poll(async () => (await guide.boundingBox())!.y).toBeCloseTo(origin.y, 0);

  await dragFrom(origin.x + 8, origin.y + 8, 2000, 2000);
  const edge = (await guide.boundingBox())!;
  await page.mouse.move(edge.x + 8, edge.y + 8);
  await page.mouse.down();
  await page.setViewportSize({ width: 1100, height: 620 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect
    .poll(async () => {
      const box = (await guide.boundingBox())!;
      return box.x >= 12 && box.y >= 12 && box.x + box.width <= 1088 && box.y + box.height <= 608;
    })
    .toBe(true);
  await capture(page, testInfo, 'guia-reposicionado');
  await guide.getByRole('button', { name: 'Pausar guia' }).click();
  await expect(guide).toHaveCount(0);
});
