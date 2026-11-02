import { capture, expect, expectDialogWithinViewport, test } from './support';
import type { Page } from '@playwright/test';
const fixturePath = '/e2e/visual/fixtures/adventureDeletionDialogFixture.ts';
const route = '/e2e/visual/adventure-deletion-dialog.html';
async function inspect(page: Page) {
  return page.evaluate(
    async (path) =>
      (
        (await import(path)) as typeof import('./fixtures/adventureDeletionDialogFixture')
      ).fixtureDeletionInspect(),
    fixturePath,
  );
}
async function hold(page: Page) {
  await page.evaluate(
    async (path) =>
      (
        (await import(path)) as typeof import('./fixtures/adventureDeletionDialogFixture')
      ).fixtureHoldDeletionStep(),
    fixturePath,
  );
}
async function release(page: Page) {
  await page.evaluate(
    async (path) =>
      (
        (await import(path)) as typeof import('./fixtures/adventureDeletionDialogFixture')
      ).fixtureReleaseDeletionStep(),
    fixturePath,
  );
}
async function open(page: Page) {
  await page.getByRole('button', { name: 'Abrir exclusão de aventura' }).click();
  await expect(page.getByRole('dialog', { name: 'Excluir aventura', exact: true })).toBeVisible();
}
test('confirmação responsiva, teclado e retorno de foco sem iniciar exclusão', async ({
  page,
}, testInfo) => {
  await page.goto(route);
  await open(page);
  await expect(
    page.getByRole('button', { name: 'Excluir aventura definitivamente' }),
  ).toBeEnabled();
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'aventura-confirmacao');
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(
    true,
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Abrir exclusão de aventura' })).toBeFocused();
  expect((await inspect(page)).calls).toHaveLength(0);
});
test('pausa após uma unidade e reabertura sem execução automática', async ({ page }, testInfo) => {
  await page.goto(route);
  await hold(page);
  await open(page);
  await page.getByRole('button', { name: 'Excluir aventura definitivamente' }).click();
  await expect
    .poll(async () => (await inspect(page)).calls.filter((c) => c.method === 'advance').length)
    .toBe(1);
  await page.getByRole('button', { name: 'Pausar após esta etapa' }).click();
  await release(page);
  await expect(page.getByRole('button', { name: 'Continuar limpeza' })).toBeEnabled();
  expect((await inspect(page)).job?.checkpoint).toBe(1);
  await page.keyboard.press('Escape');
  await open(page);
  await expect(page.getByRole('button', { name: 'Continuar limpeza' })).toBeEnabled();
  expect((await inspect(page)).calls.filter((c) => c.method === 'advance')).toHaveLength(1);
  await page.getByRole('button', { name: 'Continuar limpeza' }).click();
  await expect(page.getByRole('heading', { name: 'Aventura excluída' })).toBeVisible();
  expect((await inspect(page)).calls.filter((c) => c.method === 'advance')).toHaveLength(3);
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'aventura-excluida');
});
test('reload mantém pedido exato no diário nativo e só continua por confirmação explícita', async ({
  page,
}) => {
  await page.goto(route);
  await hold(page);
  await open(page);
  await page.getByRole('button', { name: 'Excluir aventura definitivamente' }).click();
  await expect
    .poll(async () => (await inspect(page)).calls.filter((c) => c.method === 'advance').length)
    .toBe(1);
  const before = (await inspect(page)).calls.find((c) => c.method === 'advance')!;
  await page.reload();
  await open(page);
  const confirm = page.getByRole('button', { name: 'Confirmar pedido e continuar' });
  await expect(confirm).toBeEnabled();
  expect((await inspect(page)).calls.filter((c) => c.method === 'advance')).toHaveLength(1);
  await confirm.click();
  await expect(page.getByRole('heading', { name: 'Aventura excluída' })).toBeVisible();
  const data = await inspect(page),
    requests = data.calls.filter((c) => c.method === 'advance');
  expect(requests[1]).toEqual(before);
  expect(Object.keys(data.receipts)).toHaveLength(4);
  const journal = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.startsWith('writer:adventure-deletion:'))
      .map((k) => localStorage.getItem(k))
      .join('\n'),
  );
  expect(journal).not.toContain(data.job?.title);
  expect(journal).toContain(data.job!.deletionId);
});
