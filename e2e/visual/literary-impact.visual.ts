import { test, expect, capture, expectNoHorizontalOverflow } from './support';
import { FIXTURE_BOOK_ID, author } from './fixtures/data';
test('impacto: abertura sem produção, consulta por teclado e resolução privada nos temas e tela estreita', async ({
  page,
}, testInfo) => {
  if (testInfo.project.name.startsWith('mobile-'))
    await page.setViewportSize({ width: 320, height: 844 });
  await page.addInitScript(
    ({ uid, bookId }) => {
      localStorage.setItem(
        'writer:literary-impact:' + encodeURIComponent(uid) + ':' + encodeURIComponent(bookId),
        JSON.stringify({
          version: 1,
          actorId: uid,
          bookId,
          sessionId: 'visual-impact-session',
          jobId: 'impact-visual-map',
          bookToken: 'b'.repeat(64),
          originToken: 'f'.repeat(64),
          start: null,
          pending: null,
          cancelRequested: false,
          cancel: null,
          revision: 0,
        }),
      );
    },
    { uid: author.uid, bookId: FIXTURE_BOOK_ID },
  );
  await page.goto('/books/' + FIXTURE_BOOK_ID);
  await page.getByRole('tab', { name: 'Produção literária' }).click();
  await expect(
    page.getByRole('button', { name: 'Assistente da página', exact: true }),
  ).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Impacto editorial', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Mapa de impacto editorial' });
  const calls = () =>
    page.evaluate(
      () => JSON.parse(localStorage.getItem('fixture:impact-calls') ?? '[]') as string[],
    );
  expect(await calls()).toEqual([]);
  await panel.getByRole('button', { name: 'Consultar estado atual' }).focus();
  await page.keyboard.press('Enter');
  await expect(panel.getByText(/Inventário parcial encerrado/)).toBeVisible();
  expect(await calls()).toEqual(['get']);
  await panel.getByRole('button', { name: 'Consultar vínculos' }).click();
  await panel.getByRole('button', { name: 'Revisar este vínculo' }).click();
  await panel
    .getByLabel('Justificativa')
    .fill('A mudança de perspectiva exige reconferir a informação desta passagem.');
  await panel
    .getByLabel('Evidência da decisão')
    .fill('A ficha do capítulo foi comparada com o contrato pelo autor.');
  await panel.getByRole('button', { name: 'Salvar resolução' }).scrollIntoViewIfNeeded();
  await expectNoHorizontalOverflow(page, 'impacto-revisao');
  await capture(page, testInfo, 'impacto-revisao');
  await panel.getByRole('button', { name: 'Salvar resolução' }).focus();
  await page.keyboard.press('Enter');
  await expect(panel.getByText(/Resolução salva/)).toBeVisible();
  const metadata = await page.evaluate(
    ({ uid, bookId }) =>
      localStorage.getItem(
        'writer:literary-impact:' + encodeURIComponent(uid) + ':' + encodeURIComponent(bookId),
      ),
    { uid: author.uid, bookId: FIXTURE_BOOK_ID },
  );
  expect(metadata).not.toContain('perspectiva');
  expect(metadata).not.toContain('comparada');
  expect(await calls()).not.toContain('start');
  expect(await calls()).not.toContain('advance');
  await expectNoHorizontalOverflow(page, 'impacto-resolvido');
});
