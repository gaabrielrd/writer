import { test, expect, capture, expectNoHorizontalOverflow } from './support';

test('ajuda por navegação, busca global, artigo e histórico do navegador', async ({
  page,
}, testInfo) => {
  await page.goto('/studio');
  await page.getByRole('link', { name: 'Ajuda', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Central de ajuda' })).toBeVisible();
  await capture(page, testInfo, 'help-desktop');

  await page.getByRole('link', { name: 'Organizar uma campanha', exact: true }).click();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Quero organizar minha campanha' }),
  ).toBeFocused();
  await page.getByRole('link', { name: 'O que é a base congelada de uma campanha?' }).click();
  await expect(
    page.getByRole('heading', { level: 2, name: 'O que é a base congelada de uma campanha?' }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Quero organizar minha campanha' }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Central de ajuda' })).toBeInViewport();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Quero organizar minha campanha' }),
  ).toBeVisible();
  await capture(page, testInfo, 'help-article');

  const search = page.getByRole('searchbox', { name: 'Buscar na ajuda' });
  await search.fill('PREVIA jogadores');
  await page.getByRole('link', { name: /Conferir as prévias de Mestre e Jogadores/ }).click();
  await expect(page.getByRole('heading', { name: 'Prévia não é convite' })).toBeVisible();
  await search.fill('nenhum-termo-assim');
  await expect(page.getByText('Nenhum artigo encontrado')).toBeVisible();
  await page.getByRole('button', { name: 'Limpar busca', exact: true }).click();
  await expect(search).toHaveValue('');

  for (const width of [1024, 800]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoHorizontalOverflow(page, `ajuda ${width}`);
  }
  await capture(page, testInfo, 'help-laptop');
});

test.describe('acesso público à ajuda', () => {
  test.use({ authenticated: false });
  test('abre sem login e permite navegar por teclado', async ({ page }) => {
    await page.goto('/help?article=backup');
    await expect(page.getByRole('heading', { level: 1, name: 'Central de ajuda' })).toBeVisible();
    await page.getByRole('link', { name: 'Ajuda', exact: true }).click();
    await expect(page).toHaveURL('/help');
    const topic = page
      .getByRole('navigation', { name: 'Assuntos da ajuda' })
      .getByRole('link', { name: 'Livros e escrita', exact: true });
    await topic.focus();
    await page.keyboard.press('Enter');
    await expect(topic).toHaveAttribute('aria-current', 'page');
    await expect(
      page.getByRole('link', { name: /Atos, capítulos, cenas e manuscrito/ }),
    ).toBeVisible();
  });
});
