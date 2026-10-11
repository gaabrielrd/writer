import {
  books,
  author,
  chapters,
  FIXTURE_BOOK_ID,
  FIXTURE_CHAPTER_ID,
  FIXTURE_LIBRARY_STATE_KEY,
} from './fixtures/data';
import {
  capture,
  expect,
  expectDialogWithinViewport,
  expectNoHorizontalOverflow,
  test,
} from './support';
import type { Page } from '@playwright/test';

const bookTitle = books[0].title;
const chapterTitle = chapters[0].title;
const secondChapterTitle = chapters[1].title;
const bookPath = `/books/${FIXTURE_BOOK_ID}`;
const editorPath = `${bookPath}/editor/${FIXTURE_CHAPTER_ID}`;

async function expectPortraitBooks(page: Page, count: number) {
  const cards = page
    .locator('a[href^="/books/"]')
    .filter({ has: page.getByRole('heading', { level: 3 }) });
  await expect(cards).toHaveCount(count);
  for (const card of await cards.all()) {
    const bounds = await card.boundingBox();
    expect(bounds).not.toBeNull();
    if (!bounds) throw new Error('O livro deve ter dimensões visíveis.');
    expect(bounds.width).toBeLessThanOrEqual(300);
    expect(bounds.height).toBeGreaterThan(bounds.width);
    const cover = (await card.locator('img').count())
      ? card.locator('img')
      : card.getByText('Sem capa', { exact: true }).locator('..').locator('..');
    const coverBounds = await cover.boundingBox();
    expect(coverBounds).not.toBeNull();
    if (!coverBounds) throw new Error('A capa deve ter dimensões visíveis.');
    expect(coverBounds.width / coverBounds.height).toBeCloseTo(2 / 3, 2);
  }
}

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
  await expectPortraitBooks(page, 3);
  await capture(page, testInfo, '04-biblioteca-populada');

  const trigger = page.getByRole('button', { name: 'Novo Livro', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Criar Novo Livro' });
  await expect(dialog).toBeVisible();
  await page.getByLabel('Título da Obra').fill(books[1].title);
  await page.getByLabel('Gênero Literário').fill('Fantasia');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
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
  const expand = page.getByRole('button', { name: 'Expandir sinopse' });
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  const synopsisId = await expand.getAttribute('aria-controls');
  const synopsis = page.locator(`[id="${synopsisId}"]`);
  const collapsed = await synopsis.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
  }));
  expect(collapsed.height).toBeLessThanOrEqual(collapsed.lineHeight * 2 + 1);
  await capture(page, testInfo, '06-obra-capitulos');
  await expand.click();
  await expect(page.getByRole('button', { name: 'Recolher sinopse' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await page.getByRole('button', { name: 'Recolher sinopse' }).click();

  const newChapter = page.getByRole('button', { name: 'Novo capítulo', exact: true });
  await newChapter.click();
  const chapterDialog = page.getByRole('dialog', { name: 'Novo capítulo', exact: true });
  await expect(chapterDialog.getByLabel('Título do capítulo')).toBeFocused();
  await expect(chapterDialog.getByRole('button', { name: 'Criar capítulo' })).toBeDisabled();
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'modal-novo-capitulo');
  await page.keyboard.press('Escape');
  await expect(newChapter).toBeFocused();
  await newChapter.click();
  await chapterDialog.getByLabel('Título do capítulo').fill('Um novo começo');
  await chapterDialog.getByRole('button', { name: 'Criar capítulo' }).click();
  await expect(
    page.getByRole('list', { name: 'Capítulos' }).getByText('Um novo começo'),
  ).toBeVisible();
  await expect(chapterDialog).toHaveCount(0);
  await expect(newChapter).toBeFocused();

  await page.getByRole('tab', { name: 'Compêndio', exact: true }).click();
  await expect(page.getByText('Porto das Lanternas', { exact: true })).toBeVisible();
  await capture(page, testInfo, '07-obra-compendio');

  const options = page.getByRole('button', { name: 'Opções do livro', exact: true });
  await options.click();
  const edit = page.getByRole('menuitem', { name: 'Editar', exact: true });
  await edit.click();
  const dialog = page.getByRole('dialog', { name: 'Editar Obra' });
  await expect(dialog).toBeVisible();
  await page.getByLabel('Título da Obra').fill(books[1].title);
  await capture(page, testInfo, '08-modal-editar-obra');
  await expectDialogWithinViewport(page);
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(options).toBeFocused();
  await expect(page.getByRole('heading', { name: bookTitle, exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Capítulos', exact: true }).click();
  await page.setViewportSize({ width: 320, height: 740 });
  await expectNoHorizontalOverflow(page, 'detalhes-do-livro-320px');
  const chapterRows = page.getByRole('list', { name: 'Capítulos' }).getByRole('listitem');
  for (const row of await chapterRows.all()) {
    const centers = await row.evaluate((element) =>
      Array.from(element.children).map((child) => {
        const bounds = child.getBoundingClientRect();
        return bounds.y + bounds.height / 2;
      }),
    );
    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(1);
  }
  await capture(page, testInfo, 'detalhes-do-livro-320px');
});

test('editor, painel de lore e configurações de IA', async ({ page }, testInfo) => {
  await page.goto(editorPath);
  await expect(
    page.getByRole('heading', { name: chapterTitle, exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Área de escrita do capítulo' })).toHaveText(
    chapters[0].content.replace(/^#{1,6} /gm, ''),
    { useInnerText: true },
  );
  const manuscript = page.getByRole('textbox', { name: 'Área de escrita do capítulo' });
  await manuscript.focus();
  await expect(manuscript).toBeFocused();
  await expect(manuscript).toHaveCSS('outline-style', 'none');
  await capture(page, testInfo, '09-editor');

  await page.getByRole('button', { name: /Compêndio/ }).click();
  const sidebar = page.getByRole('complementary', { name: 'Painel lateral do Compêndio de Lore' });
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByText('Porto das Lanternas', { exact: true })).toBeVisible();
  await capture(page, testInfo, '10-editor-com-lore');
  await sidebar.getByLabel('Buscar no compêndio').fill('Lia');
  await expect(sidebar.getByText('Lia', { exact: true })).toBeVisible();
  await sidebar.getByLabel('Buscar no compêndio').fill('');

  const settings = page.getByRole('button', { name: new RegExp(author.displayName!) });
  await settings.click();
  await page.getByRole('menuitem', { name: 'Configurar inteligência artificial' }).click();
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
    await expect(
      page.getByRole('heading', { name: chapterTitle, exact: true }).first(),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Próximo capítulo', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: secondChapterTitle, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Área de escrita do capítulo' })).toHaveText(
      chapters[1].content.replace(/^#{1,6} /gm, ''),
      { useInnerText: true },
    );
    await page.goBack();
    await expect(
      page.getByRole('heading', { name: chapterTitle, exact: true }).first(),
    ).toBeVisible();
    await page.goForward();
    await expect(
      page.getByRole('heading', { name: secondChapterTitle, exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Capítulo anterior', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: chapterTitle, exact: true }).first(),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Voltar para o livro', exact: true }).click();
    await expect(page.getByRole('heading', { name: bookTitle, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Meus Livros', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Meus Livros', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Minhas Obras' })).toBeVisible();
  }
});

test.describe('Biblioteca vazia', () => {
  test.use({ libraryState: 'empty' });

  test('wizard gera sinopse e capa, confirma créditos e cria a obra', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Criar Primeiro Livro' }).click();
    await page.getByLabel('Título da Obra').fill('Atlas de Outono');
    await page.getByLabel('Gênero Literário').fill('Fantasia');
    await capture(page, testInfo, '18-criacao-livro');
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByRole('button', { name: 'Gerar sinopse com IA' }).click();
    await expect(page.getByLabel('Sinopse / Premissa')).toHaveValue('');
    await page.getByRole('button', { name: /Usar sinopse/ }).click();
    await expect(page.getByLabel('Sinopse / Premissa')).toHaveValue(/Atlas de Outono/);
    await capture(page, testInfo, '19-criacao-sinopse');
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByRole('button', { name: 'Gerar capa com IA' }).click();
    const image = page.getByAltText('Sugestão de capa de Atlas de Outono');
    await expect(image).toBeVisible();
    await expect
      .poll(() =>
        image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0),
      )
      .toBe(true);
    await page.getByRole('button', { name: /Usar capa/ }).click();
    await expect(page.getByAltText('Capa selecionada de Atlas de Outono')).toBeVisible();
    await capture(page, testInfo, '20-criacao-capa');
    await expectDialogWithinViewport(page);
    await expect(page.getByText('78', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Criar Livro', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Atlas de Outono', exact: true })).toBeVisible();
    await expectPortraitBooks(page, 1);
  });

  test('estado vazio mantém ações para começar ou importar', async ({ page }, testInfo) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Nenhum livro cadastrado' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Criar Primeiro Livro' })).toBeEnabled();
    await expect(
      page.getByRole('button', { name: 'Importar Documento', exact: true }),
    ).toBeEnabled();
    await capture(page, testInfo, '12-biblioteca-vazia');
  });

  test('um único livro mantém capa vertical sem ocupar toda a linha', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Criar Primeiro Livro' }).click();
    await page.getByLabel('Título da Obra').fill('Livro vertical');
    await page.getByLabel('Gênero Literário').fill('Fantasia');
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByRole('button', { name: 'Criar Livro', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Livro vertical', exact: true })).toBeVisible();
    await expectPortraitBooks(page, 1);
    await capture(page, testInfo, '17-biblioteca-um-livro');
    await page.setViewportSize({ width: 320, height: 740 });
    await expectPortraitBooks(page, 1);
    await expectNoHorizontalOverflow(page, 'um-livro-320px');
  });
});

test.describe('Falha de serviço simulada', () => {
  test.use({ libraryState: 'error' });

  test('mostra erro e recupera os livros ao tentar novamente', async ({ page }, testInfo) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Não foi possível carregar os livros' }),
    ).toBeVisible();
    await expect(page.getByText('Falha simulada de conexão. Tente novamente.')).toBeVisible();
    await capture(page, testInfo, '13-biblioteca-erro');
    // Recover only the fake service; the real error UI and retry handler remain unchanged.
    await page.evaluate(
      (key) => sessionStorage.setItem(key, 'populated'),
      FIXTURE_LIBRARY_STATE_KEY,
    );
    await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Minhas Obras' })).toBeVisible();
    await expect(page.getByRole('heading', { name: bookTitle, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tentar novamente', exact: true })).toHaveCount(
      0,
    );
  });
});

test('preferência por menos transparência usa superfícies opacas e sem desfoque', async ({
  page,
  context,
}, testInfo) => {
  const session = await context.newCDPSession(page);
  try {
    await session.send('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-reduced-transparency', value: 'reduce' },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Minhas Obras' })).toBeVisible();
    const computed = await page
      .locator('.glass-surface')
      .first()
      .evaluate((element) => {
        const style = getComputedStyle(element);
        const root = getComputedStyle(document.documentElement);
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Não foi possível verificar a opacidade computada.');
        context.fillStyle = style.backgroundColor;
        context.fillRect(0, 0, 1, 1);
        return {
          mediaMatches: matchMedia('(prefers-reduced-transparency: reduce)').matches,
          glassOpacity: root.getPropertyValue('--glass-opacity').trim(),
          panelOpacity: root.getPropertyValue('--panel-opacity').trim(),
          blur: style.backdropFilter,
          backgroundAlpha: context.getImageData(0, 0, 1, 1).data[3],
        };
      });
    await testInfo.attach('superficie-com-transparencia-reduzida', {
      body: JSON.stringify(computed, null, 2),
      contentType: 'application/json',
    });
    expect(computed.mediaMatches).toBe(true);
    expect(computed.glassOpacity).toBe('1');
    expect(computed.panelOpacity).toBe('1');
    expect(computed.blur).toMatch(/^(none|blur\(0px\))$/);
    expect(computed.backgroundAlpha).toBe(255);
    await capture(page, testInfo, '14-transparencia-reduzida');
  } finally {
    await session.detach();
  }
});

test('largura mínima de 320px mantém biblioteca, obra e editor sem transbordamento', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await testInfo.attach('viewport-minima', {
    body: JSON.stringify({ width: 320, height: 740 }),
    contentType: 'application/json',
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: books[1].title, exact: true })).toBeVisible();
  await capture(page, testInfo, '15-biblioteca-320px');
  await page.locator(`a[href="${bookPath}"]`).click();
  await expect(page.getByText(secondChapterTitle, { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page, 'obra-320px');
  await page.getByRole('button', { name: `Escrever ${chapterTitle}`, exact: true }).click();
  await expect(
    page.getByRole('heading', { name: chapterTitle, exact: true }).first(),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page, 'editor-320px');
  await page.getByRole('button', { name: /Compêndio/ }).click();
  await expect(
    page.getByRole('complementary', { name: 'Painel lateral do Compêndio de Lore' }),
  ).toBeVisible();
  await capture(page, testInfo, '16-editor-lore-320px');
  await page.getByRole('button', { name: new RegExp(author.displayName!) }).click();
  await page.getByRole('menuitem', { name: 'Configurar inteligência artificial' }).click();
  await expectDialogWithinViewport(page);
  await expectNoHorizontalOverflow(page, 'configuracoes-320px');
});

test('WYSIWYG preserva seleção, desfaz, salva ao navegar e consulta lore durante escrita', async ({
  page,
}) => {
  await page.goto(editorPath);
  const manuscript = page.getByRole('textbox', { name: 'Área de escrita do capítulo' });
  // A real pointer focus distinguishes deliberate Home navigation from the
  // browser's transient selection reset when contenteditable first receives focus.
  await manuscript.getByRole('heading', { name: chapterTitle, exact: true }).click();
  await manuscript.fill('Lia observa o porto.');
  await manuscript.press('Control+Home');
  await expect
    .poll(() =>
      manuscript.evaluate((element) => {
        const selection = window.getSelection();
        if (!selection?.anchorNode || !element.contains(selection.anchorNode)) return null;
        const beforeCaret = document.createRange();
        beforeCaret.selectNodeContents(element);
        beforeCaret.setEnd(selection.anchorNode, selection.anchorOffset);
        return { collapsed: selection.isCollapsed, before: beforeCaret.toString() };
      }),
    )
    .toEqual({ collapsed: true, before: '' });
  await manuscript.press('Shift+ArrowRight');
  await manuscript.press('Shift+ArrowRight');
  await manuscript.press('Shift+ArrowRight');
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('Lia');
  await page.getByRole('button', { name: 'Negrito', exact: true }).click();
  await expect(manuscript.locator('strong')).toHaveText('Lia');
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('Lia');
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click();
  await expect(manuscript.locator('strong')).toHaveCount(0);
  await page.getByRole('button', { name: 'Refazer', exact: true }).click();
  await expect(manuscript.locator('strong')).toHaveText('Lia');
  const term = manuscript.getByRole('button', { name: 'Ver ficha de Lia' });
  await term.hover();
  await expect(page.getByRole('tooltip')).toContainText('Cartógrafa');
  await term.click();
  const sidebar = page.getByRole('complementary', { name: 'Painel lateral do Compêndio de Lore' });
  await expect(sidebar.getByRole('region', { name: 'Ficha completa de Lia' })).toBeVisible();
  await sidebar.getByRole('button', { name: 'Fechar painel de lore' }).click();
  await expect(manuscript).toBeFocused();
  await manuscript.press('Control+End');
  await manuscript.pressSequentially(' Texto final.');
  // Navigate before the one-second debounce; pending content must be flushed.
  await page.getByRole('button', { name: 'Próximo capítulo', exact: true }).click();
  await expect(page.getByRole('heading', { name: secondChapterTitle, exact: true })).toBeVisible();
  await page.goBack();
  await expect(manuscript).toHaveText('Lia observa o porto. Texto final.');
  await expect(manuscript.locator('strong')).toHaveText('Lia');
  await expect(page.getByRole('button', { name: 'Desfazer', exact: true })).toBeDisabled();
  await page.goForward();
  await expect(manuscript).toContainText('Lia e Tomás partiram');
});

test('menções @ permitem criação cancelável e seleção sem trocar de capítulo', async ({ page }) => {
  await page.goto(editorPath);
  const manuscript = page.getByRole('textbox', { name: 'Área de escrita do capítulo' });
  await manuscript.fill('@Avalon');
  await expect(page.getByRole('option', { name: /Criar “Avalon”/ })).toBeVisible();
  await manuscript.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Cadastrar Nova Entidade no Compêndio' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Nome da Entidade')).toHaveValue('Avalon');
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(manuscript).toHaveText('@Avalon');
  await manuscript.fill('@Li');
  await manuscript.press('Enter');
  await expect(manuscript).toHaveText('Lia');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${editorPath}$`));
});
