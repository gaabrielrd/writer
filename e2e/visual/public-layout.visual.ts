import { test, expect, capture, expectNoHorizontalOverflow } from './support';

test.use({ authenticated: false });

test('rotas públicas compartilham a moldura compacta da home', async ({ page }, testInfo) => {
  for (const path of [
    '/login',
    '/catalog',
    '/read/visual-public-atlas',
    '/rota-inexistente',
    '/styleguide',
    '/library',
    '/settings/ai',
    '/universes',
    '/books/new/assisted',
  ]) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    const header = page.getByRole('banner');
    await expect(header.getByRole('link', { name: 'Writer Assistant Início' })).toBeVisible();
    const appearance = await header.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        height: element.getBoundingClientRect().height,
        blur: style.backdropFilter,
        shadow: style.boxShadow,
        radius: parseFloat(style.borderTopLeftRadius),
        background: getComputedStyle(element.parentElement!.parentElement!).backgroundImage,
      };
    });
    expect(appearance.height).toBeLessThanOrEqual(56);
    expect(appearance.blur).toBe('none');
    expect(appearance.shadow).toBe('none');
    expect(appearance.radius).toBeLessThanOrEqual(8);
    expect(appearance.background).toBe('none');
    await expectNoHorizontalOverflow(page, path);
    if (['/catalog', '/read/visual-public-atlas', '/rota-inexistente'].includes(path)) {
      if (path.startsWith('/read/')) {
        await expect(page.getByRole('navigation', { name: 'Sumário' })).toBeVisible();
      }
      await capture(page, testInfo, path.slice(1).replaceAll('/', '-'));
    }
  }
});

test('login e cadastro mantêm ações acessíveis em notebooks', async ({ page }, testInfo) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Entrar no Writer Assistant' })).toBeVisible();
  await page.getByLabel('E-mail', { exact: true }).fill('autor@example.test');
  await page.getByLabel('Senha', { exact: true }).fill('senha-ficticia');
  for (const width of [1440, 1024, 800]) {
    await page.setViewportSize({ width, height: 768 });
    const submit = page.locator('form').getByRole('button', { name: 'Entrar', exact: true });
    const box = await submit.boundingBox();
    expect(box!.y + box!.height).toBeLessThan(768);
    await capture(page, testInfo, `login-${width}`);
  }
  await page.getByRole('button', { name: 'Cadastre-se gratuitamente' }).click();
  await expect(page.getByLabel('Nome de Autor')).toBeVisible();
  await expect(page.getByLabel('E-mail', { exact: true })).toHaveValue('autor@example.test');
  await expect(page.getByLabel('Senha', { exact: true })).toHaveValue('senha-ficticia');
  const create = page.getByRole('button', { name: 'Criar conta gratuita', exact: true });
  const box = await create.boundingBox();
  expect(box!.y + box!.height).toBeLessThan(768);
  await capture(page, testInfo, 'cadastro-800');
  await page.getByLabel('Senha', { exact: true }).fill('123');
  await create.click();
  await expect(page.getByRole('alert')).toContainText(
    'A senha deve conter no mínimo 6 caracteres.',
  );
  await page.getByRole('button', { name: 'Entrar', exact: true }).last().click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel('Nome de Autor')).toHaveCount(0);
  await expectNoHorizontalOverflow(page, 'login após cadastro');
});

test('formulário de login segue para o Estúdio com a conta fictícia', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill('autor@example.test');
  await page.getByLabel('Senha', { exact: true }).fill('senha-ficticia');
  const email = page.getByLabel('E-mail', { exact: true });
  await email.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Senha', { exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.locator('form').getByRole('button', { name: 'Entrar', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/studio$/);
  await expect(page.locator('[data-writer-workspace]')).toBeVisible();
});
