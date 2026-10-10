import { books, chapters, FIXTURE_BOOK_ID, FIXTURE_CHAPTER_ID, lore } from './fixtures/data';
import { capture, expect, expectNoHorizontalOverflow, test } from './support';
const publishedPath = '/read/visual-public-atlas';

test.describe('Leitor público e publicação', () => {
  test.use({ authenticated: false });

  test('leitura anônima, sumário, histórico e lore público em todos os temas', async ({
    page,
  }, testInfo) => {
    await page.goto(publishedPath);
    await expect(page.getByRole('heading', { name: books[0].title, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: chapters[0].title, level: 2 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Anterior', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Ver resumo de Atlas das Marés' })).toHaveCount(
      0,
    );
    const publicTerm = page.getByRole('button', { name: 'Ver resumo de Lia', exact: true }).first();
    await publicTerm.click();
    await expect(page.getByRole('tooltip')).toContainText(lore[0].summary);
    await expect(page.getByRole('tooltip')).not.toContainText(lore[0].details);
    await capture(page, testInfo, 'reader-public-lore');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await page.getByRole('button', { name: 'Próximo', exact: true }).click();
    await expect(page).toHaveURL(/chapter=visual-chapter-2$/);
    await expect(page.getByRole('heading', { name: chapters[1].title, level: 2 })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { name: chapters[0].title, level: 2 })).toBeVisible();
    await page.goForward();
    const secondChapterHeading = page.getByRole('heading', { name: chapters[1].title, level: 2 });
    await expect(secondChapterHeading).toBeVisible();
    // Shortcuts apply to the reading surface, never to focused controls.
    await secondChapterHeading.focus();
    await expect(secondChapterHeading).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    const firstChapterHeading = page.getByRole('heading', { name: chapters[0].title, level: 2 });
    await expect(firstChapterHeading).toBeVisible();
    await firstChapterHeading.focus();
    await expect(firstChapterHeading).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('heading', { name: chapters[1].title, level: 2 })).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Sumário' })
      .getByRole('link', { name: chapters[2].title })
      .click();
    await expect(page.getByRole('button', { name: 'Próximo', exact: true })).toBeDisabled();
    await capture(page, testInfo, 'reader-last-chapter');
    await page.setViewportSize({ width: 320, height: 740 });
    await expectNoHorizontalOverflow(page, 'reader-320px');
  });

  test('link direto, rascunho, inexistente e retirada de publicação removem o texto', async ({
    page,
  }, testInfo) => {
    await page.goto(`${publishedPath}?chapter=visual-chapter-2`);
    await expect(page.getByRole('heading', { name: chapters[1].title, level: 2 })).toBeVisible();
    await page.evaluate(async () => {
      const path = '/e2e/visual/fixtures/publicationService.ts';
      const service = (await import(path)) as typeof import('./fixtures/publicationService');
      await service.unpublishBook('visual-public-atlas');
    });
    await expect(page.getByText('Obra indisponível')).toBeVisible();
    await expect(page.getByRole('heading', { name: books[0].title, exact: true })).toHaveCount(0);
    await capture(page, testInfo, 'reader-unpublished');
    await page.goto(`/read/${FIXTURE_BOOK_ID}`);
    await expect(page.getByText('Obra indisponível')).toBeVisible();
    await page.goto('/read/unknown-book');
    await expect(page.getByText('Obra indisponível')).toBeVisible();
  });

  test('uma nova revisão atualiza o leitor sem expor edições privadas antes de republicar', async ({
    page,
  }) => {
    await page.goto(`/read/${FIXTURE_BOOK_ID}`);
    await expect(page.getByText('Obra indisponível')).toBeVisible();
    await page.evaluate(async (id) => {
      const path = '/e2e/visual/fixtures/publicationService.ts';
      const service = (await import(path)) as typeof import('./fixtures/publicationService');
      await service.publishBook(id, 'Nome público escolhido');
    }, FIXTURE_BOOK_ID);
    await page.getByRole('button', { name: 'Verificar novamente', exact: true }).click();
    await expect(page.getByText('Por Nome público escolhido')).toBeVisible();
    await page.evaluate(
      async ({ bookId, chapterId }) => {
        const path = '/e2e/visual/fixtures/bookService.ts';
        const service = (await import(path)) as typeof import('./fixtures/bookService');
        await service.updateChapter(bookId, chapterId, {
          content: '<p>Uma nova edição revisada.</p>',
        });
      },
      { bookId: FIXTURE_BOOK_ID, chapterId: FIXTURE_CHAPTER_ID },
    );
    await expect(page.getByText('Uma nova edição revisada.')).toHaveCount(0);
    await page.evaluate(async (id) => {
      const path = '/e2e/visual/fixtures/publicationService.ts';
      const service = (await import(path)) as typeof import('./fixtures/publicationService');
      await service.publishBook(id, 'Nome público escolhido');
    }, FIXTURE_BOOK_ID);
    await expect(page.getByText('Uma nova edição revisada.')).toBeVisible();
  });
});
