import { capture, expect, expectNoHorizontalOverflow, test } from './support';

test('Home visual mantém retomada compacta e atalhos funcionais', async ({ page }, testInfo) => {
  await page.addInitScript(() => sessionStorage.setItem('writer.visual.work-resume-pages', 'true'));
  await page.goto('/studio');
  const recent = page.getByRole('region', { name: 'Continuar meu trabalho', exact: true });
  await expect(
    recent.getByRole('heading', { name: 'Projeto recente 1', exact: true }),
  ).toBeVisible();
  const cards = recent.getByRole('article');
  await expect(recent.getByRole('button', { name: 'Continuar projeto' })).toHaveCount(4);
  const card = cards.first();
  expect((await card.boundingBox())!.height).toBeLessThan(220);
  await expectNoHorizontalOverflow(page, 'Home visual');
  await capture(page, testInfo, 'home-visual');
  await recent.getByRole('button', { name: 'Continuar projeto' }).first().click();
  await expect(page).toHaveURL(/\/books\/work-recent-01$/);
  await page.goto('/studio');
  const create = page.getByRole('link', { name: 'Criar com IA', exact: true });
  await create.focus();
  await create.press('Enter');
  await expect(page.getByRole('heading', { name: 'Como deseja começar?' })).toBeVisible();
  await page.getByRole('button', { name: /^Com ajuda da IA/ }).click();
  await page.getByRole('button', { name: /^Livro/ }).click();
  await expect(page.getByLabel('Sua ideia')).toBeVisible();
  await page.goto('/studio/projects');
  await expect(page.getByRole('region', { name: 'Livros', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page, 'Projetos');
  await capture(page, testInfo, 'projetos-visuais');
  await page.goto('/studio/import');
  await expect(
    page.getByRole('heading', { name: 'Importar e restaurar', exact: true }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page, 'Importar e restaurar');
  await capture(page, testInfo, 'importacao-compacta');
  await page.goto('/studio/operations');
  await expect(page.getByRole('heading', { name: 'Em andamento', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page, 'Operações');
});
