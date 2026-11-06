import { capture, expect, test } from './support';

for (const inModal of [false, true]) {
  test(`busca de dropdown mantém o assistente no host original: modal=${inModal}`, async ({
    page,
  }, testInfo) => {
    const modal = page.locator('[role="dialog"]').filter({
      has: page.locator('h2', { hasText: 'Editar campanha' }),
    });
    if (inModal) {
      await page.goto('/campaigns/visual-campaign-1');
      await page.getByRole('button', { name: 'Editar campanha', exact: true }).click();
      await expect(modal.locator('aside[data-page-assistant]')).toHaveCount(1);
    } else {
      await page.goto('/studio/new');
      await page.getByRole('button', { name: /^Manualmente/ }).click();
      await page.getByRole('button', { name: /^Livro/ }).click();
      await page.getByRole('button', { name: /^Universo e persona/ }).click();
    }
    const dock = page.locator('aside[data-page-assistant]');
    await expect(dock).toBeVisible();
    const before = await dock.boundingBox();
    const trigger = page.getByRole('combobox', { name: 'Universo compartilhado', exact: true });
    await trigger.click();
    const popup = page.getByRole('dialog', { name: 'Universo compartilhado', exact: true });
    const search = page.getByRole('textbox', {
      name: 'Buscar em Universo compartilhado',
      exact: true,
    });
    await expect(search).toBeFocused();
    await search.fill('Sem');
    await expect(page.getByRole('option', { name: 'Sem universo', exact: true })).toBeVisible();
    await expect(popup.locator('[data-page-assistant]')).toHaveCount(0);
    const after = await dock.boundingBox();
    expect(after!.x).toBeCloseTo(before!.x, 0);
    expect(after!.y).toBeCloseTo(before!.y, 0);
    if (inModal) await expect(modal.locator('aside[data-page-assistant]')).toHaveCount(1);
    else expect(await dock.evaluate((el) => el.parentElement === document.body)).toBe(true);
    await capture(page, testInfo, `assistente-fora-da-busca-modal-${inModal}`);
    await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);
    await expect(trigger).toBeFocused();
    if (inModal)
      await expect(
        page.getByRole('dialog', { name: 'Editar campanha', exact: true }),
      ).toBeVisible();
  });
}
