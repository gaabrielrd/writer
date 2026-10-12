import { capture, expect, expectNoHorizontalOverflow, test } from './support';

test('divisor do styleguide responde a drag, teclado e restauração', async ({ page }, testInfo) => {
  await page.goto('/styleguide');
  const handle = page.getByRole('separator', { name: 'Largura do painel de demonstração' });
  await handle.scrollIntoViewIfNeeded();
  await handle.focus();
  await handle.press('ArrowLeft');
  await expect(handle).toHaveAttribute('aria-valuenow', '42');
  await handle.press('Shift+ArrowRight');
  await expect(handle).toHaveAttribute('aria-valuenow', '32');
  await handle.press('End');
  await expect(handle).toHaveAttribute('aria-valuenow', '70');
  await handle.press('Home');
  await expect(handle).toHaveAttribute('aria-valuenow', '20');
  await handle.dblclick();
  await expect(handle).toHaveAttribute('aria-valuenow', '40');
  const rect = await handle.boundingBox();
  await page.mouse.move(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect!.x - 30, rect!.y + rect!.height / 2, { steps: 5 });
  await page.mouse.up();
  expect(Number(await handle.getAttribute('aria-valuenow'))).toBeGreaterThan(40);
  await expectNoHorizontalOverflow(page, 'divisor do styleguide');
  await capture(page, testInfo, 'divisor-redimensionavel');
});
