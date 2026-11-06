import { test, expect, capture, expectNoHorizontalOverflow } from './support';
const bookId = 'visual-managed-guide';
test.describe('Guia literário publicado', () => {
  test.use({ authenticated: false });
  test('revelações por capítulo, homônimos, retomada e nova edição nos três temas e 320 px', async ({
    page,
  }, testInfo) => {
    await page.goto('/read/visual-public-atlas');
    await page.evaluate(async (id) => {
      const path = '/e2e/visual/fixtures/publicBookService.ts';
      const { setFixturePublication } = (await import(
        path
      )) as typeof import('./fixtures/publicBookService');
      const reveal = (chapterId: string) => ({
        version: 1 as const,
        bookId: id,
        revisionId: 'guide-edition-one',
        chapterId,
      });
      setFixturePublication(id, {
        book: {
          id,
          title: 'A carta de Ana',
          authorName: 'Autora',
          revisionId: 'guide-edition-one',
          readerGuideVersion: 1,
          publishedAt: 1,
        },
        content: {
          chapters: [
            {
              id: 'first',
              title: 'A praça',
              order: 1,
              content: '<p>Ana espera. A carta não chegou.</p>',
            },
            {
              id: 'last',
              title: 'A resposta',
              order: 2,
              content: '<p>Ana encontra outra Ana.</p>',
            },
          ],
          lore: [
            {
              id: 'traveler',
              name: 'Ana',
              aliases: ['Viajante'],
              category: 'character',
              summary: 'Espera na praça.',
              isPublic: true,
              readerGuide: reveal('first'),
              certainty: 'uncertain',
              disambiguation: 'Viajante',
              facts: [
                {
                  text: 'Talvez espere uma carta.',
                  certainty: 'uncertain',
                  readerGuide: reveal('first'),
                },
                { text: 'Reconhece sua irmã.', certainty: 'fact', readerGuide: reveal('last') },
              ],
              relationships: [
                {
                  targetId: 'sister',
                  description: 'Irmã',
                  certainty: 'fact',
                  readerGuide: reveal('last'),
                },
              ],
              appearances: [{ kind: 'document', readerGuide: reveal('last') }],
            },
            {
              id: 'sister',
              name: 'Ana',
              aliases: [],
              category: 'character',
              summary: 'Uma irmã reencontrada.',
              isPublic: true,
              readerGuide: reveal('last'),
              certainty: 'fact',
              disambiguation: 'Irmã',
              facts: [],
              relationships: [],
              appearances: [],
            },
          ],
        },
      });
    }, bookId);
    await page.goto(`/read/${bookId}`);
    const guide = page.getByRole('region', { name: 'Guia do leitor', exact: true });
    await expect(guide).toBeVisible();
    await expect(guide.getByText('Ana · Viajante', { exact: true })).toBeVisible();
    await expect(guide.getByText('Ana · Irmã', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ver resumo de Ana' })).toHaveCount(0);
    await guide.locator('summary').first().click();
    await expect(
      guide.getByText('Talvez espere uma carta. (incerto)', { exact: false }),
    ).toBeVisible();
    await expect(guide.getByText('Reconhece sua irmã.', { exact: false })).toHaveCount(0);
    await capture(page, testInfo, 'guide-first-no-spoilers');
    await page.getByRole('button', { name: 'Próximo', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'A resposta', level: 2 })).toBeVisible();
    await expect(guide.getByText('Ana · Irmã', { exact: true })).toBeVisible();
    await expect(guide.getByText('Reconhece sua irmã.', { exact: false })).toBeVisible();
    await expect(guide.getByText('Transmissão documental', { exact: false })).toBeVisible();
    await expect(guide.getByText('Ana · Irmã: Irmã', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Anterior', exact: true }).click();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'A praça', level: 2 })).toBeVisible();
    await expect(guide.getByText('Ana · Irmã', { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 320, height: 740 });
    await guide.getByText('Ana · Viajante', { exact: true }).click();
    const revealedFact = guide.getByText('Reconhece sua irmã.', { exact: false });
    await revealedFact.scrollIntoViewIfNeeded();
    await expect(revealedFact).toBeVisible();
    await expectNoHorizontalOverflow(page, 'managed-guide-320px');
    await capture(page, testInfo, 'guide-resumed-320px');
    await page.evaluate(async (id) => {
      const path = '/e2e/visual/fixtures/publicBookService.ts';
      const api = (await import(path)) as typeof import('./fixtures/publicBookService');
      const current = await api.getPublicBook(id);
      if (!current) throw new Error('Fixture não encontrada.');
      const content = await api.getPublicBookContent(current);
      api.setFixturePublication(id, {
        book: { ...current, revisionId: 'guide-edition-two' },
        content: JSON.parse(
          JSON.stringify(content).replaceAll('guide-edition-one', 'guide-edition-two'),
        ) as typeof content,
      });
    }, bookId);
    await expect(guide.getByText('Ana · Irmã', { exact: true })).toHaveCount(0);
    await expect(guide.getByText('Ana · Viajante', { exact: true })).toBeVisible();
  });
});
