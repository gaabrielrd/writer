import {
  capture,
  expect,
  expectDialogWithinViewport,
  expectNoHorizontalOverflow,
  test,
} from './support';
import { FIXTURE_BOOK_ID, FIXTURE_CHAPTER_ID, lore } from './fixtures/data';

test('livro cria pelos dados essenciais e mantém detalhes opcionais ao recolher', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Novo Livro', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Criar Novo Livro' });
  await expect(dialog.getByRole('button', { name: 'Criar Livro', exact: true })).toBeDisabled();
  await dialog
    .getByLabel('Título da Obra')
    .fill('As histórias que atravessam as estações e voltam para casa');
  await dialog.getByLabel('Gênero Literário').fill('Fantasia');
  await expect(dialog.getByLabel('Sinopse / Premissa')).not.toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Continuar', exact: true })).toHaveCount(0);
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'livro-essenciais');
  const synopsis = dialog.getByRole('button', { name: /^Sinopse/ });
  await synopsis.focus();
  await page.keyboard.press('Enter');
  await dialog
    .getByLabel('Sinopse / Premissa')
    .fill('Uma história que permanece durante todas as estações.');
  await synopsis.click();
  await expect(synopsis).toHaveAttribute('aria-expanded', 'false');
  await expect(dialog.getByLabel('Sinopse / Premissa')).toHaveValue(
    'Uma história que permanece durante todas as estações.',
  );
  await dialog.getByRole('button', { name: 'Criar Livro', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(
    page.getByRole('heading', {
      name: 'As histórias que atravessam as estações e voltam para casa',
    }),
  ).toBeVisible();
});

test('ficha salva uma alteração direta, preserva detalhes e mostra impacto na publicação', async ({
  page,
}, testInfo) => {
  await page.goto(`/books/${FIXTURE_BOOK_ID}`);
  await page.getByRole('tab', { name: 'Compêndio', exact: true }).click();
  const trigger = page.getByRole('button', { name: 'Editar Lia', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Editar Entidade: Lia' });
  await capture(page, testInfo, 'lore-essenciais');
  await dialog.getByLabel('Resumo Curto').fill('Cartógrafa das ilhas esquecidas.');
  await expect(dialog.getByLabel('Aparência')).not.toBeVisible();
  await expect(dialog.getByLabel(/Tornar visível/)).toBeVisible();
  await dialog.getByLabel(/Tornar visível/).uncheck();
  await expect(dialog.getByRole('alert')).toContainText('A publicação será retirada');
  await capture(page, testInfo, 'lore-aviso-publicacao');
  await dialog.getByRole('button', { name: 'Salvar Alterações' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(dialog.getByLabel('Resumo Curto')).toHaveValue('Cartógrafa das ilhas esquecidas.');
  await dialog.getByRole('button', { name: /^História e notas/ }).click();
  await expect(dialog.getByLabel('Ficha Detalhada / Lore Completo (opcional)')).toHaveValue(
    lore[0].details,
  );
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'lore-secoes');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('sidebar cria lore sem etapas em 320px e conserva rodapé ao abrir detalhes', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
  await page.getByRole('button', { name: /^Compêndio(?: \d+)?$/ }).click();
  await page.getByRole('button', { name: 'Nova Entidade', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome da Entidade').fill('Estação das Cartas');
  await dialog.getByLabel('Resumo Curto').fill('Um refúgio entre as ilhas.');
  await dialog.getByRole('button', { name: /^Características/ }).click();
  await dialog.getByLabel('Aparência').fill('Uma casa de janelas azuis.');
  await dialog.getByRole('button', { name: /^Características/ }).click();
  await expect(dialog.getByLabel('Aparência')).not.toBeVisible();
  const submit = dialog.getByRole('button', { name: 'Cadastrar Entidade' });
  await expect(submit).toBeInViewport();
  await expectDialogWithinViewport(page);
  await expectNoHorizontalOverflow(page, 'lore-320');
  await capture(page, testInfo, 'lore-320');
  await submit.click();
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
