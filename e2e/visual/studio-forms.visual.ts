import {
  capture,
  expect,
  expectDialogWithinViewport,
  expectNoHorizontalOverflow,
  openBookCreation,
  test,
} from './support';
import { FIXTURE_BOOK_ID, FIXTURE_CHAPTER_ID, lore } from './fixtures/data';
import { installNativeBookLore } from './nativeBookLore.mjs';
import { chooseDropdown } from '../dropdown';

test('livro cria pelos dados essenciais e mantém detalhes opcionais ao recolher', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await openBookCreation(page);
  const form = page.locator('#main-content');
  await form.getByLabel('Título do projeto').fill('');
  await expect(form.getByRole('button', { name: 'Criar livro', exact: true })).toBeDisabled();
  await form
    .getByLabel('Título do projeto')
    .fill('As histórias que atravessam as estações e voltam para casa');
  await chooseDropdown(form.getByLabel('Gênero ou estilo'), 'Fantasia');
  const details = form.getByRole('button', { name: /^Premissa e detalhes/ });
  await details.click();
  await expect(form.getByLabel('Premissa', { exact: true })).not.toBeVisible();
  await details.focus();
  await page.keyboard.press('Enter');
  await form
    .getByLabel('Premissa', { exact: true })
    .fill('Uma história que permanece durante todas as estações.');
  await details.click();
  await expect(details).toHaveAttribute('aria-expanded', 'false');
  await expect(form.getByLabel('Premissa', { exact: true })).toHaveValue(
    'Uma história que permanece durante todas as estações.',
  );
  await capture(page, testInfo, 'livro-essenciais');
  await form.getByRole('button', { name: 'Criar livro', exact: true }).click();
  await expect(page).toHaveURL(/\/books\/[^/]+$/);
  await expect(
    page.getByRole('heading', {
      name: 'As histórias que atravessam as estações e voltam para casa',
    }),
  ).toBeVisible();
});

test('ficha prepara alteração direta, preserva detalhes e mostra visibilidade privada', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await installNativeBookLore(page);
  await page.goto(`/books/${FIXTURE_BOOK_ID}`);
  await page.getByRole('tab', { name: 'Compêndio', exact: true }).click();
  const trigger = page.getByRole('button', { name: 'Editar Lia', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Editar lore do livro' });
  await expect(dialog.getByLabel('Nome', { exact: true })).toHaveValue('Lia');
  const navigation = dialog.getByRole('tablist', { name: 'Campos da ficha' });
  const editor = dialog.getByRole('tabpanel', { name: 'Edição de Nome', exact: true });
  await expect(navigation).toHaveAttribute('aria-orientation', 'vertical');
  expect(
    (await navigation.boundingBox())!.x + (await navigation.boundingBox())!.width,
  ).toBeLessThan((await editor.boundingBox())!.x);
  await dialog.getByRole('tab', { name: 'Nome', exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(dialog.getByRole('tab', { name: 'Categoria', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(dialog.getByRole('tab', { name: 'Nome', exact: true })).toBeFocused();
  await capture(page, testInfo, 'lore-essenciais');
  await dialog.getByRole('tab', { name: 'Resumo', exact: true }).click();
  await dialog.getByLabel('Resumo', { exact: true }).fill('Cartógrafa das ilhas esquecidas.');
  await dialog.getByRole('tab', { name: 'Visibilidade', exact: true }).click();
  await chooseDropdown(
    dialog.getByRole('combobox', { name: 'Visibilidade', exact: true }),
    'Privado',
  );
  await capture(page, testInfo, 'lore-visibilidade-privada');
  await dialog.getByRole('button', { name: 'Preparar alterações', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Aplicar alterações', exact: true })).toBeEnabled(
    { timeout: 60_000 },
  );
  await dialog.getByRole('button', { name: 'Aplicar alterações', exact: true }).click();
  await expect(dialog.getByText('Alterações aplicadas à ficha.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).first().click();
  await dialog.getByRole('button', { name: 'Fechar e manter recuperação', exact: true }).click();
  // Refresh replaces the original card; the native collection uses its stable list control.
  await expect(
    page.getByRole('button', { name: 'Visualização em lista', exact: true }),
  ).toBeFocused();
  await trigger.click();
  await expect(dialog.getByLabel('Nome', { exact: true })).toHaveValue('Lia');
  await dialog.getByRole('tab', { name: 'Resumo', exact: true }).click();
  await expect(dialog.getByLabel('Resumo', { exact: true })).toHaveValue(
    'Cartógrafa das ilhas esquecidas.',
  );
  await dialog.getByRole('tab', { name: 'Visibilidade', exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Visibilidade', exact: true })).toHaveText(
    'Privado',
  );
  await dialog.getByRole('tab', { name: 'Detalhes', exact: true }).click();
  await expect(dialog.getByLabel('Detalhes', { exact: true })).toHaveValue(lore[0].details);
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'lore-secoes');
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).first().click();
  await expect(trigger).toBeFocused();
});

test('sidebar prepara lore protegido em 320px e conserva rodapé ao revisar detalhes', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await installNativeBookLore(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
  await page.getByRole('button', { name: /^Compêndio(?: \d+)?$/ }).click();
  await page.getByRole('button', { name: 'Nova Entidade', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome', { exact: true }).fill('Estação das Cartas');
  await dialog.getByRole('tab', { name: 'Resumo', exact: true }).click();
  await dialog.getByRole('button', { name: 'Adicionar resumo', exact: true }).click();
  await dialog.getByLabel('Resumo', { exact: true }).fill('Um refúgio entre as ilhas.');
  await dialog.getByRole('tab', { name: 'Características e notas', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Adicionar características e notas', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Adicionar aparência', exact: true }).click();
  await dialog.getByLabel('Aparência', { exact: true }).fill('Uma casa de janelas azuis.');
  await dialog.getByRole('tab', { name: 'Nome', exact: true }).click();
  await expect(dialog.getByLabel('Aparência', { exact: true })).not.toBeVisible();
  const submit = dialog.getByRole('button', { name: 'Preparar ficha', exact: true });
  await expect(submit).toBeInViewport();
  await expectDialogWithinViewport(page);
  await expectNoHorizontalOverflow(page, 'lore-320');
  await capture(page, testInfo, 'lore-320');
  await submit.click();
  const create = dialog.getByRole('button', { name: 'Criar ficha', exact: true });
  await expect(create).toBeEnabled({ timeout: 60_000 });
  await create.click();
  await expect(dialog.getByText('Ficha criada no livro.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).first().click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Estação das Cartas', { exact: true })).toBeVisible();
});

test('catálogo demonstra seções opcionais por teclado e feedback associado aos campos', async ({
  page,
}, testInfo) => {
  await page.goto('/styleguide');
  const notes = page.getByRole('button', { name: /^Anotações/ });
  await notes.focus();
  await page.keyboard.press('Enter');
  await expect(notes).toHaveAttribute('aria-expanded', 'true');
  await page.getByLabel('Notas do projeto').fill('Uma ideia preservada.');
  await page.keyboard.press('Shift+Tab');
  await expect(notes).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Notas do projeto')).not.toBeVisible();
  await expect(page.getByLabel('Nome do projeto')).toHaveAccessibleDescription(
    'Campo essencial; detalhes podem ser preenchidos depois.',
  );
  await capture(page, testInfo, 'catalogo-estudio');
});
