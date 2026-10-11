import { expect, test } from './support';
import { FIXTURE_BOOK_ID, FIXTURE_CHAPTER_ID } from './fixtures/data';

test('autocomplete começa após digitação e pausa, nunca por foco ou seleção', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('writer_fixture_autocomplete', 'true'));
  await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
  const editor = page.getByLabel('Área de escrita do capítulo');
  const calls = () =>
    page.evaluate(() => Number(sessionStorage.getItem('writer_fixture_autocomplete_calls') ?? 0));
  const suggestion = page.getByLabel('Sugestão de IA para continuação do texto');
  await expect(editor).toBeVisible();
  const now = await page.evaluate(() => Date.now());
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now + 1000);
  await editor.click();
  await editor.press('ControlOrMeta+a');
  await editor.press('ArrowRight');
  await page.clock.runFor(850);
  expect(await calls()).toBe(0);
  await expect(suggestion).toHaveCount(0);

  await editor.pressSequentially(' O vento mudou.', { delay: 30 });
  await page.clock.runFor(650);
  await expect(suggestion).toBeVisible();
  expect(await calls()).toBe(1);
  await editor.press('ArrowLeft');
  await editor.press('Shift+ArrowLeft');
  await editor.press('ArrowRight');
  await page.clock.runFor(850);
  await expect(suggestion).toHaveCount(0);
  expect(await calls()).toBe(1);

  await editor.pressSequentially(' Mais texto.', { delay: 20 });
  await page.clock.runFor(50);
  await editor.press('Shift+ArrowLeft');
  await editor.press('ArrowRight');
  await page.clock.runFor(850);
  expect(await calls()).toBe(1);
  await editor.pressSequentially(' A história continua.', { delay: 20 });
  await page.clock.runFor(650);
  await expect(suggestion).toBeVisible();
  expect(await calls()).toBe(2);
  await page.getByRole('button', { name: 'Aceitar sugestão', exact: true }).click();
  await expect(editor).toContainText('A noite trouxe uma nova descoberta.');
  await page.clock.runFor(850);
  expect(await calls()).toBe(2);
});
