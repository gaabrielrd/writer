import { capture, expect, expectNoHorizontalOverflow, test } from './support';

test('operações usa abas com URL, histórico e navegação por teclado', async ({
  page,
}, testInfo) => {
  await page.goto('/studio/operations?tab=invalid&source=shortcut');
  const tabs = page.getByRole('tablist', { name: 'Operações em andamento' });
  const imports = tabs.getByRole('tab', { name: 'Importações e restaurações' });
  const campaigns = tabs.getByRole('tab', { name: 'Campanhas' });
  const deletions = tabs.getByRole('tab', { name: 'Exclusões' });
  await expect(imports).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Importações e restaurações' })).toBeVisible();
  await capture(page, testInfo, 'operacoes-importacoes');
  await campaigns.click();
  await expect(page).toHaveURL(/tab=campaigns&source=shortcut$/);
  await expect(page.getByRole('region', { name: 'Operações de campanhas' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Importações e restaurações' })).toBeHidden();
  await capture(page, testInfo, 'operacoes-campanhas');
  await campaigns.press('End');
  await expect(deletions).toBeFocused();
  await expect(deletions).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/tab=deletions&source=shortcut$/);
  await expect(page.getByRole('region', { name: 'Exclusões em andamento' })).toBeVisible();
  await capture(page, testInfo, 'operacoes-exclusoes');
  await page.goBack();
  await expect(campaigns).toHaveAttribute('aria-selected', 'true');
  await page.goForward();
  await expect(deletions).toHaveAttribute('aria-selected', 'true');
  await page.reload();
  await expect(deletions).toHaveAttribute('aria-selected', 'true');
  await deletions.focus();
  await deletions.press('Home');
  await expect(imports).toBeFocused();
  await imports.press('ArrowRight');
  await expect(campaigns).toHaveAttribute('aria-selected', 'true');
  await expectNoHorizontalOverflow(page, 'Abas de operações');
  await page.setViewportSize({ width: 1100, height: 720 });
  await expectNoHorizontalOverflow(page, 'Abas de operações em laptop');
});

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
  const create = page.getByRole('link', { name: 'Começar um projeto', exact: true });
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
