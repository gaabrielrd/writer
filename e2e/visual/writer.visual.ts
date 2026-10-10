import { books, chapters, FIXTURE_BOOK_ID, FIXTURE_CHAPTER_ID } from './fixtures/data';
import { capture, expect, expectDialogWithinViewport, test } from './support';

const bookTitle = books[0].title;
const chapterTitle = chapters[0].title;
const secondChapterTitle = chapters[1].title;
const bookPath = `/books/${FIXTURE_BOOK_ID}`;
const editorPath = `${bookPath}/editor/${FIXTURE_CHAPTER_ID}`;

test.describe('Páginas públicas', () => {
  test.use({ authenticated: false });

  test('landing, login e navegação pelo histórico', async ({ page }, testInfo) => {
    await page.goto('/');
    const landing = page.getByRole('heading', { name: 'Assistente para Autores de Ficção' });
    await expect(landing).toBeVisible();
    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: 'Pular para o conteúdo' });
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
    await page.goto('/');
    await expect(landing).toBeVisible();
    await capture(page, testInfo, '01-landing');
    await page.getByRole('link', { name: 'Começar a Escrever Gratuitamente' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Entrar no Writer Assistant' })).toBeVisible();
    await expect(page.getByLabel('E-mail', { exact: true })).toBeVisible();
    await capture(page, testInfo, '02-login');
    await page.getByRole('button', { name: 'Cadastre-se gratuitamente' }).click();
    await expect(page.getByLabel('Nome de Autor')).toBeVisible();
    await capture(page, testInfo, '03-cadastro');
    await page.goBack();
    await expect(landing).toBeVisible();
    await page.goForward();
    await expect(page.getByRole('heading', { name: 'Entrar no Writer Assistant' })).toBeVisible();
  });
});

test('biblioteca populada, modal por teclado e devolução de foco', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Minhas Obras' })).toBeVisible();
  await expect(page.getByRole('heading', { name: books[1].title, exact: true })).toBeVisible();
  await capture(page, testInfo, '04-biblioteca-populada');

  const trigger = page.getByRole('button', { name: 'Novo Livro', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Criar Novo Livro' });
  await expect(dialog).toBeVisible();
  await page.getByLabel('Título da Obra').fill(books[1].title);
  await page.getByLabel('Sinopse / Premissa').fill(books[0].synopsis ?? '');
  await capture(page, testInfo, '05-modal-novo-livro');
  await expectDialogWithinViewport(page);
  for (let tab = 0; tab < 10; tab += 1) {
    await page.keyboard.press('Tab');
    await expect
      .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
      .toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('heading', { level: 3 })).toHaveCount(3);
});

test('obra, capítulos longos, compêndio e edição', async ({ page }, testInfo) => {
  await page.goto(bookPath);
  await expect(page.getByRole('heading', { name: bookTitle, exact: true })).toBeVisible();
  await expect(page.getByText(secondChapterTitle, { exact: true })).toBeVisible();
  await capture(page, testInfo, '06-obra-capitulos');

  await page.getByRole('tab', { name: 'Compêndio', exact: true }).click();
  await expect(page.getByText('Porto das Lanternas', { exact: true })).toBeVisible();
  await capture(page, testInfo, '07-obra-compendio');

  const edit = page.getByRole('button', { name: 'Editar', exact: true }).first();
  await edit.click();
  const dialog = page.getByRole('dialog', { name: 'Editar Obra' });
  await expect(dialog).toBeVisible();
  await page.getByLabel('Título da Obra').fill(books[1].title);
  await capture(page, testInfo, '08-modal-editar-obra');
  await expectDialogWithinViewport(page);
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(edit).toBeFocused();
  await expect(page.getByRole('heading', { name: bookTitle, exact: true })).toBeVisible();
});

test('editor, painel de lore e configurações de IA', async ({ page }, testInfo) => {
  await page.goto(editorPath);
  await expect(page.getByRole('heading', { name: chapterTitle, exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Comece a escrever seu capítulo aqui...')).toHaveValue(
    chapters[0].content,
  );
  const manuscript = page.getByPlaceholder('Comece a escrever seu capítulo aqui...');
  await manuscript.focus();
  await expect(manuscript).toBeFocused();
  await expect
    .poll(() =>
      manuscript.evaluate((element) => {
        const style = getComputedStyle(element);
        return style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0;
      }),
    )
    .toBe(true);
  await capture(page, testInfo, '09-editor');

  await page.getByRole('button', { name: /Compêndio/ }).click();
  const sidebar = page.getByRole('complementary', { name: 'Painel lateral do Compêndio de Lore' });
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByText('Porto das Lanternas', { exact: true })).toBeVisible();
  await capture(page, testInfo, '10-editor-com-lore');
  await sidebar.getByLabel('Buscar no compêndio').fill('Lia');
  await expect(sidebar.getByText('Lia', { exact: true })).toBeVisible();
  await sidebar.getByLabel('Buscar no compêndio').fill('');

  const settings = page.getByRole('button', { name: 'Configurações de IA e Chaves de API' });
  await settings.click();
  const dialog = page.getByRole('dialog', { name: 'Configurações de Inteligência Artificial' });
  await expect(dialog).toBeVisible();
  await capture(page, testInfo, '11-configuracoes-ia');
  await expectDialogWithinViewport(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(settings).toBeFocused();
});

test('navegação repetida entre biblioteca, obra e capítulos com voltar e avançar', async ({
  page,
}) => {
  await page.goto('/');
  for (let cycle = 0; cycle < 2; cycle += 1) {
    await page.locator(`a[href="${bookPath}"]`).click();
    await expect(page.getByRole('heading', { name: bookTitle, exact: true })).toBeVisible();
    await page.getByRole('button', { name: `Escrever ${chapterTitle}`, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${editorPath}$`));
    await expect(page.getByRole('heading', { name: chapterTitle, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Próximo capítulo', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: secondChapterTitle, exact: true }),
    ).toBeVisible();
    await expect(page.getByPlaceholder('Comece a escrever seu capítulo aqui...')).toHaveValue(
      chapters[1].content,
    );
    await page.goBack();
    await expect(page.getByRole('heading', { name: chapterTitle, exact: true })).toBeVisible();
    await page.goForward();
    await expect(
      page.getByRole('heading', { name: secondChapterTitle, exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Capítulo anterior', exact: true }).click();
    await expect(page.getByRole('heading', { name: chapterTitle, exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Voltar para a lista de obras', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Minhas Obras' })).toBeVisible();
  }
});
