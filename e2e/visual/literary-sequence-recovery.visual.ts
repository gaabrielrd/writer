import { test, expect, capture, expectNoHorizontalOverflow } from './support';
import { FIXTURE_BOOK_ID, author } from './fixtures/data';

test('sequência: consulta somente metadata e retoma o passo original por ação explícita no teclado', async ({
  page,
}, testInfo) => {
  if (testInfo.project.name.startsWith('mobile-'))
    await page.setViewportSize({ width: 320, height: 844 });
  await page.addInitScript(
    ({ uid, bookId }) => {
      const entry = {
        version: 1,
        actorId: uid,
        bookId,
        operationId: 'sequence-recovery-operation',
        kind: 'sequence',
        id: 'sequence',
        expectedRevision: 4,
        wireHash: 'a'.repeat(64),
        method: 'advanceLiterarySequence',
      };
      localStorage.setItem(
        'writer:literary-pending:' +
          encodeURIComponent(uid) +
          ':' +
          encodeURIComponent(bookId) +
          ':' +
          entry.operationId,
        JSON.stringify(entry),
      );
    },
    { uid: author.uid, bookId: FIXTURE_BOOK_ID },
  );
  await page.goto('/books/' + FIXTURE_BOOK_ID);
  await page.getByRole('tab', { name: 'Produção literária' }).click();
  await expect(
    page.getByRole('button', { name: 'Assistente da página', exact: true }),
  ).toHaveAttribute('aria-expanded', 'false');
  const recovery = page.getByRole('region', { name: 'Recuperação de salvamentos editoriais' });
  const lookup = recovery.getByRole('button', { name: /Consultar sequência/ });
  await expect(lookup).toBeVisible();
  const calls = () =>
    page.evaluate(
      () => JSON.parse(localStorage.getItem('fixture:sequence-recovery-calls') ?? '[]') as string[],
    );
  expect(await calls()).toEqual([]);
  await lookup.focus();
  await page.keyboard.press('Enter');
  const resume = recovery.getByRole('button', { name: 'Retomar passo original da sequência' });
  await expect(resume).toBeVisible();
  expect(await calls()).toEqual(['lookup']);
  await recovery.scrollIntoViewIfNeeded();
  await expectNoHorizontalOverflow(page, 'sequence-recovery');
  await capture(page, testInfo, 'sequence-recovery');
  await resume.focus();
  await page.keyboard.press('Enter');
  await expect(recovery.getByText(/O passo original foi consultado ou retomado/)).toBeVisible();
  expect(await calls()).toEqual(['lookup', 'resumeOriginal']);
  await expect(lookup).toHaveCount(0);
  await expectNoHorizontalOverflow(page, 'sequence-recovered');
});
