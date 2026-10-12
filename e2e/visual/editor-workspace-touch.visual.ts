import { expect, test } from './support';
import { FIXTURE_BOOK_ID, FIXTURE_CHAPTER_ID } from './fixtures/data';

test('divisor aceita drag por toque na área ampliada sem perder foco ou texto', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'O gesto verifica a emulação de toque e pointer: coarse.');
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto('/books/' + FIXTURE_BOOK_ID + '/editor/' + FIXTURE_CHAPTER_ID);
  const editor = page.getByLabel('Área de escrita do capítulo');
  await editor.fill('Texto preservado durante o gesto de toque.');
  await editor.press('End');
  await page.getByRole('button', { name: 'Abrir Assistente Criativo de IA' }).click();
  await expect(page.getByLabel('Mensagem para o Assistente IA')).toBeEnabled();
  await page.getByRole('button', { name: 'Entrar em tela cheia' }).click();
  await editor.focus();
  const handle = page.getByRole('separator', { name: 'Largura do painel lateral' });
  await expect(handle).toHaveAttribute('aria-valuenow', '40');
  expect(await handle.evaluate((element) => getComputedStyle(element, '::after').width)).toBe(
    '44px',
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const rect = (await handle.boundingBox())!;
  // Começa fora da faixa visível de 8px, mas dentro do alvo de toque de 44px.
  const x = rect.x + rect.width / 2 + 16;
  const y = rect.y + rect.height / 2;
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y, id: 1 }],
    });
    await expect(handle).toHaveAttribute('data-dragging', 'true');
    for (const delta of [20, 40, 60, 80]) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x - delta, y, id: 1 }],
      });
    }
    await expect
      .poll(async () => Number(await handle.getAttribute('aria-valuenow')))
      .toBeGreaterThan(40);
  } finally {
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  }
  await expect(handle).not.toHaveAttribute('data-dragging', 'true');
  await expect(editor).toBeFocused();
  await expect(editor).toHaveText('Texto preservado durante o gesto de toque.');
  const value = await handle.getAttribute('aria-valuenow');
  await expect(page.getByText('Salvo', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Abrir Assistente Criativo de IA' }).click();
  await page.getByRole('button', { name: 'Entrar em tela cheia' }).click();
  await expect(page.getByRole('separator', { name: 'Largura do painel lateral' })).toHaveAttribute(
    'aria-valuenow',
    value!,
  );
});
