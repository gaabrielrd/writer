import { capture, expect, expectDialogWithinViewport, test } from './support';
import type { Page } from '@playwright/test';
import { books } from './fixtures/data';
const fixturePath = '/e2e/visual/fixtures/adventureDeletionDialogFixture.ts';
const id = 'visual-adventure-1',
  title = 'O farol entre as ilhas';
async function inspect(page: Page) {
  return page.evaluate(
    async ({ path, id }) =>
      (
        (await import(path)) as typeof import('./fixtures/adventureDeletionDialogFixture')
      ).fixtureDeletionInspect(id),
    { path: fixturePath, id },
  );
}
async function step(page: Page, method: 'hold' | 'release') {
  await page.evaluate(
    async ({ path, method }) => {
      const fixture = (await import(
        path
      )) as typeof import('./fixtures/adventureDeletionDialogFixture');
      if (method === 'hold') fixture.fixtureHoldDeletionStep();
      else fixture.fixtureReleaseDeletionStep();
    },
    { path: fixturePath, method },
  );
}
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Excluir aventura', exact: true });
const catalog = (page: Page) => page.getByRole('button', { name: new RegExp(title + ' ·') });
async function otherProjects(page: Page) {
  await page.goto('/studio/projects');
  await expect(
    page
      .getByRole('region', { name: 'Livros', exact: true })
      .getByRole('heading', { name: books[0].title, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /Aventura das marés 2/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Crônicas do Porto das Lanternas/ })).toBeVisible();
}
test('página revoga original, pausa no Estúdio e mantém consulta pela URL antiga após excluir', async ({
  page,
}, testInfo) => {
  await page.goto('/adventures/' + id);
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await step(page, 'hold');
  await page.getByRole('button', { name: 'Excluir aventura', exact: true }).click();
  await page.getByRole('button', { name: 'Excluir aventura definitivamente' }).click();
  await expect
    .poll(async () => (await inspect(page)).calls.filter((c) => c.method === 'advance').length)
    .toBe(1);
  await expect(dialog(page)).toBeVisible();
  await expect(
    page.getByText('Uma passagem perdida entre as ilhas aguarda os aventureiros.'),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Pausar após esta etapa' }).click();
  await step(page, 'release');
  await expect(page.getByRole('button', { name: 'Continuar limpeza' })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/studio$/);
  await otherProjects(page);
  await expect(page.getByRole('link', { name: new RegExp(title) })).toHaveCount(0);
  await page.goto('/studio/operations');
  await catalog(page).click();
  await expect(page.getByRole('button', { name: 'Continuar limpeza' })).toBeEnabled();
  expect((await inspect(page)).calls.filter((c) => c.method === 'advance')).toHaveLength(1);
  await page.getByRole('button', { name: 'Continuar limpeza' }).click();
  await expect(page.getByRole('heading', { name: 'Aventura excluída' })).toBeVisible();
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'exclusao-na-rota-do-estudio');
  await page.keyboard.press('Escape');
  await page.goto('/adventures/' + id);
  await expect(page.getByText('Aventura indisponível')).toBeVisible();
  await page.getByRole('button', { name: 'Consultar exclusão desta aventura' }).click();
  await expect(page.getByRole('heading', { name: 'Aventura excluída' })).toBeVisible();
  expect((await inspect(page)).calls.filter((c) => c.method === 'advance')).toHaveLength(3);
});
test('cartão inicia, reload conserva pedido e catálogo confirma exatamente a unidade pendente', async ({
  page,
}) => {
  await otherProjects(page);
  await step(page, 'hold');
  const section = page.getByRole('region', { name: 'Aventuras', exact: true });
  await section
    .getByRole('button', { name: 'Ações do projeto ' + title, exact: true })
    .first()
    .click();
  await page.getByRole('menuitem', { name: 'Excluir aventura', exact: true }).click();
  await page.getByRole('button', { name: 'Excluir aventura definitivamente' }).click();
  await expect
    .poll(async () => (await inspect(page)).calls.filter((c) => c.method === 'advance').length)
    .toBe(1);
  await expect(dialog(page)).toBeVisible();
  await expect(section.getByRole('link', { name: new RegExp(title) })).toHaveCount(0);
  const before = (await inspect(page)).calls.find((c) => c.method === 'advance')!;
  await page.reload();
  await page.goto('/studio/operations');
  await catalog(page).click();
  await expect(page.getByRole('button', { name: 'Confirmar pedido e continuar' })).toBeEnabled();
  expect((await inspect(page)).calls.filter((c) => c.method === 'advance')).toHaveLength(1);
  await page.getByRole('button', { name: 'Confirmar pedido e continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Aventura excluída' })).toBeVisible();
  const after = await inspect(page);
  expect(after.calls.filter((c) => c.method === 'advance')[1]).toEqual(before);
  expect(Object.keys(after.receipts)).toHaveLength(4);
  await page.keyboard.press('Escape');
  await otherProjects(page);
});
test('troca de conta esconde o catálogo anterior e retorno consulta sem repetir efeitos', async ({
  page,
}) => {
  await page.goto('/adventures/' + id);
  await page.getByRole('button', { name: 'Excluir aventura', exact: true }).click();
  await page.getByRole('button', { name: 'Excluir aventura definitivamente' }).click();
  await expect(page.getByRole('heading', { name: 'Aventura excluída' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.goto('/studio/operations');
  await expect(catalog(page)).toBeVisible();
  const count = (await inspect(page)).calls.length;
  await page.evaluate(() => {
    sessionStorage.setItem('writer.visual.account', 'second');
    window.dispatchEvent(new Event('writer.visual.auth-change'));
  });
  await expect(catalog(page)).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Exclusões de aventuras', exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    sessionStorage.removeItem('writer.visual.account');
    window.dispatchEvent(new Event('writer.visual.auth-change'));
  });
  await page.goto('/studio/operations');
  await catalog(page).click();
  await expect(page.getByRole('heading', { name: 'Aventura excluída' })).toBeVisible();
  expect((await inspect(page)).calls).toHaveLength(count);
});
