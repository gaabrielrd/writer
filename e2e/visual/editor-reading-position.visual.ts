import { expect, test } from './support';
import { FIXTURE_BOOK_ID, FIXTURE_CHAPTER_ID } from './fixtures/data';

test('tela cheia conserva a passagem lida quando o cursor está fora da viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 720 });
  await page.goto('/books/' + FIXTURE_BOOK_ID + '/editor/' + FIXTURE_CHAPTER_ID);
  const editor = page.getByLabel('Área de escrita do capítulo');
  await editor.fill(
    'Uma passagem extensa muda de linha quando a largura disponível aumenta. '.repeat(600),
  );
  await editor.focus();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await editor.evaluate((element) => {
    const area = element.closest<HTMLElement>('[data-editor-scroll-area]')!;
    area.scrollTop = (area.scrollHeight - area.clientHeight) * 0.6;
  });
  const passage = () =>
    editor.evaluate((element) => {
      const area = element.closest<HTMLElement>('[data-editor-scroll-area]')!;
      const rect = area.getBoundingClientRect();
      const bounds = element.getBoundingClientRect();
      const range = document.caretRangeFromPoint(
        bounds.left + bounds.width / 2,
        rect.top + area.clientHeight / 2,
      );
      const selection = window.getSelection()!;
      const caret = document.createRange();
      caret.setStart(selection.focusNode!, selection.focusOffset);
      caret.collapse(true);
      const caretRect = caret.getBoundingClientRect();
      return {
        inside: Boolean(range && element.contains(range.startContainer)),
        position: range?.startOffset ?? -1,
        caret: selection.focusOffset,
        caretVisible: caretRect.top >= rect.top && caretRect.bottom <= rect.bottom,
      };
    });
  await expect.poll(async () => (await passage()).position).toBeGreaterThan(20000);
  const before = await passage();
  expect(before.inside).toBe(true);
  expect(before.caretVisible).toBe(false);
  await page.getByRole('button', { name: 'Entrar em tela cheia' }).click();
  await expect
    .poll(async () => {
      const current = await passage();
      return current.inside && Math.abs(current.position - before.position) < 500;
    })
    .toBe(true);
  expect((await passage()).caret).toBe(before.caret);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Entrar em tela cheia' })).toBeVisible();
  await expect
    .poll(async () => {
      const current = await passage();
      return current.inside && Math.abs(current.position - before.position) < 500;
    })
    .toBe(true);
  expect((await passage()).caret).toBe(before.caret);
});
