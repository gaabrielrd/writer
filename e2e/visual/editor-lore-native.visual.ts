import { capture, expect, test } from './support';
import { FIXTURE_BOOK_ID, FIXTURE_CHAPTER_ID, lore } from './fixtures/data';
import { installNativeBookLore } from './nativeBookLore.mjs';

test('menção cria, edita e retoma lore protegido sem alterar o texto do capítulo', async ({
  page,
}, info) => {
  test.setTimeout(150_000);
  const native = await installNativeBookLore(page),
    warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('blocker'))
      warnings.push(message.text());
  });
  await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
  const manuscript = page.getByRole('textbox', { name: 'Área de escrita do capítulo' });
  await manuscript.fill('@Avalon');
  await page.getByRole('option', { name: /Criar “Avalon”/ }).waitFor();
  await manuscript.press('Enter');
  let dialog = page.getByRole('dialog', { name: 'Nova ficha de lore' });
  await expect(dialog.getByLabel('Nome', { exact: true })).toHaveValue('Avalon');
  await dialog.getByRole('button', { name: 'Preparar ficha', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Criar ficha', exact: true })).toBeEnabled({
    timeout: 60_000,
  });
  // Request an actual SPA route transition while the protected form owns navigation.
  await page.evaluate(() =>
    document.querySelector<HTMLAnchorElement>('a[href="/studio"]')?.click(),
  );
  await expect(dialog.getByRole('button', { name: 'Continuar aqui', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Continuar aqui', exact: true }).click();
  await capture(page, info, 'sidebar-criacao-protegida');
  await dialog.getByRole('button', { name: 'Criar ficha', exact: true }).click();
  await expect(dialog.getByText('Ficha criada no livro.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).first().click();
  const sidebar = page.getByRole('complementary', { name: 'Painel lateral do Compêndio de Lore' });
  await expect(sidebar.getByRole('group', { name: 'Entidade Avalon', exact: true })).toBeVisible();
  await expect(manuscript).toHaveText('@Avalon');
  await expect(manuscript).toBeFocused();
  await sidebar
    .getByRole('group', { name: 'Entidade Avalon', exact: true })
    .getByRole('button', { name: 'Ver Ficha', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Avalon', exact: true })
    .getByRole('button', { name: 'Editar Ficha', exact: true })
    .click();
  dialog = page.getByRole('dialog', { name: 'Editar lore do livro' });
  await dialog.getByLabel('Nome', { exact: true }).fill('Avalon revisada');
  await dialog.getByRole('button', { name: 'Preparar alterações', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Aplicar alterações', exact: true })).toBeEnabled(
    { timeout: 60_000 },
  );
  await dialog.getByRole('button', { name: 'Aplicar alterações', exact: true }).click();
  await expect(dialog.getByText('Alterações aplicadas à ficha.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).first().click();
  await dialog.getByRole('button', { name: 'Fechar e manter recuperação', exact: true }).click();
  await expect(
    sidebar.getByRole('group', { name: 'Entidade Avalon revisada', exact: true }),
  ).toBeVisible();
  await expect(manuscript).toHaveText('@Avalon');
  const adoptions = () =>
    native.calls.filter(
      (c) =>
        c.name === 'bookLoreEdit' &&
        c.input &&
        typeof c.input === 'object' &&
        'method' in c.input &&
        c.input.method === 'adoptBookLoreEditGeneration',
    );
  const beforeRecovery = adoptions().length;
  expect(beforeRecovery).toBe(2);
  await page.reload();
  await expect(manuscript).toHaveText('@Avalon');
  await page.getByRole('button', { name: /^Compêndio(?: \d+)?$/ }).click();
  await expect(
    sidebar.getByRole('group', { name: 'Entidade Avalon revisada', exact: true }),
  ).toBeVisible();
  await sidebar.getByRole('button', { name: 'Retomadas do compêndio', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Retomadas do compêndio' });
  await capture(page, info, 'sidebar-retomadas');
  await dialog.getByRole('button', { name: 'Abrir recuperação 1', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Editar lore do livro' });
  await dialog.getByRole('button', { name: 'Retomar preparação', exact: true }).click();
  await expect(dialog.getByLabel('Nome', { exact: true })).toHaveValue('Avalon revisada');
  await expect(dialog.getByText('Alterações aplicadas à ficha.', { exact: true })).toBeVisible();
  expect(adoptions()).toHaveLength(beforeRecovery);
  expect(warnings).toEqual([]);
  await capture(page, info, 'sidebar-retomada-conferida');
  await info.attach('native-lore-calls', {
    body: JSON.stringify(native.calls, null, 2),
    contentType: 'application/json',
  });
});

test('seleção de termo mantém detalhes completos reautorizados na lateral', async ({
  page,
}, info) => {
  await installNativeBookLore(page);
  await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
  const entity = lore.find((e) => e.bookId === FIXTURE_BOOK_ID && e.name === 'Lia')!;
  await page
    .getByRole('button', { name: /^Lia(?: |$)/ })
    .first()
    .click();
  const sidebar = page.getByRole('complementary', { name: 'Painel lateral do Compêndio de Lore' }),
    details = sidebar.getByRole('region', { name: 'Ficha completa de Lia', exact: true });
  await expect(details).toContainText(entity.details);
  await capture(page, info, 'sidebar-detalhes-autorizados');
});
