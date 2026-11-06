import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 640, height: 480 },
]) {
  test(`CSS de produção mantém modal e filho flutuante na viewport ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/styleguide');
    const opener = page.getByRole('button', { name: 'Abrir Modal de Demonstração' });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Modal do Design System' });
    const inside = async () => {
      const box = (await dialog.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
      expect(box.x + box.width / 2).toBeCloseTo(viewport.width / 2, 0);
      expect(box.y + box.height / 2).toBeCloseTo(viewport.height / 2, 0);
    };
    await expect(inside).toPass();
    // Exercise the public viewport-child slot against the real minified CSS.
    // A fixed child must stay in the modal focus scope without a transformed parent.
    await dialog.evaluate((element) => {
      const child = document.createElement('button');
      child.dataset.dialogViewportChild = '';
      child.textContent = 'Controle flutuante';
      Object.assign(child.style, { position: 'fixed', right: '12px', bottom: '12px' });
      element.append(child);
      const body = element.querySelector('[data-slot="dialog-body"]')!;
      const content = document.createElement('p');
      content.textContent = 'Conteúdo carregado depois da abertura. '.repeat(80);
      body.append(content);
    });
    await expect(inside).toPass();
    const floating = dialog.getByRole('button', { name: 'Controle flutuante' });
    const childBox = (await floating.boundingBox())!;
    expect(childBox.x + childBox.width).toBeCloseTo(viewport.width - 12, 0);
    expect(childBox.y + childBox.height).toBeCloseTo(viewport.height - 12, 0);
    await expect(dialog.getByRole('button', { name: 'Confirmar', exact: true })).toBeInViewport();
    await dialog.locator('[data-slot="dialog-body"]').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(inside).toPass();
    await floating.evaluate((element) => element.remove());
    await expect(inside).toPass();
    await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
}
