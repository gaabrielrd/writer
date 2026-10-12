import { capture, expect, expectNoHorizontalOverflow, test } from './support';
import { FIXTURE_BOOK_ID, FIXTURE_CHAPTER_ID } from './fixtures/data';

test('chat compartilha espaço, prepara comandos, mantém histórico e aplica com aceite', async ({
  page,
}, testInfo) => {
  await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
  const editor = page.getByLabel('Área de escrita do capítulo');
  await expect(editor).toBeVisible();
  await editor.fill('Lia observa o porto.');
  await editor.press('Control+A');
  await page.getByRole('button', { name: /^Compêndio(?: \d+)?$/ }).click();
  const lore = page.getByRole('complementary', { name: 'Painel lateral do Compêndio de Lore' });
  await expect(lore).toBeVisible();
  const before = await lore.boundingBox();
  await page.getByRole('button', { name: 'Abrir Assistente Criativo de IA' }).click();
  const chat = page.getByRole('complementary', { name: 'Painel lateral do Assistente IA' });
  await expect(chat).toBeVisible();
  await expect(lore).toHaveCount(0);
  const after = await chat.boundingBox();
  expect(after!.width).toBeCloseTo(before!.width, 0);
  expect(after!.height).toBeCloseTo(before!.height, 0);
  const composer = chat.getByLabel('Mensagem para o Assistente IA');
  await composer.fill('/est');
  await expect(chat.getByRole('listbox', { name: 'Comandos do assistente' })).toBeVisible();
  await composer.press('Enter');
  await expect(composer).toHaveValue('/estilo ');
  expect(
    await page.evaluate(() => sessionStorage.getItem('writer_fixture_ai_action_calls')),
  ).toBeNull();
  await composer.press('Enter');
  await expect(chat.getByText('O trecho ganhou novos detalhes.', { exact: true })).toBeVisible();
  await expect(editor).toHaveText('Lia observa o porto.');
  await capture(page, testInfo, 'chat-com-sugestao');
  await chat.getByRole('button', { name: 'Substituir trecho', exact: true }).click();
  await expect(editor).toHaveText('O trecho ganhou novos detalhes.');
  await editor.press('Control+z');
  await expect(editor).toHaveText('Lia observa o porto.');
  await expect(chat.getByText('Sugestão já paga: reaplicar sem débito.')).toBeVisible();
  await expect(page.getByText('Salvo', { exact: true })).toBeVisible();
  await composer.fill('Meu pedido ainda não enviado');
  await page.reload();
  await page.getByRole('button', { name: 'Abrir Assistente Criativo de IA' }).click();
  await expect(composer).toHaveValue('Meu pedido ainda não enviado');
  await expect(chat.getByText('O trecho ganhou novos detalhes.', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 640 });
  await expectNoHorizontalOverflow(page, 'chat em 320px');
  await capture(page, testInfo, 'chat-320');
});
test('cursor fora da passagem visível usa viewport e geração pode ser interrompida', async ({
  page,
}) => {
  await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
  const editor = page.getByLabel('Área de escrita do capítulo');
  await expect(editor).toBeVisible();
  await editor.fill(
    Array.from(
      { length: 60 },
      (_, i) => `Parágrafo ${i}: Lia observa o horizonte e pensa na viagem.`,
    ).join('\n\n'),
  );
  await editor.press('Control+Home');
  await page.evaluate(() => {
    const area = document.querySelector('[data-editor-scroll-area]')!;
    if (
      area.scrollHeight > area.clientHeight + 1 &&
      /auto|scroll/.test(getComputedStyle(area).overflowY)
    )
      area.scrollTop = area.scrollHeight / 2;
    else window.scrollTo(0, document.scrollingElement!.scrollHeight / 2);
  });
  // Capture before opening: the panel resize must preserve the working passage.
  await page.getByRole('button', { name: 'Abrir Assistente Criativo de IA' }).click();
  const chat = page.getByRole('complementary', { name: 'Painel lateral do Assistente IA' });
  const composer = chat.getByLabel('Mensagem para o Assistente IA');
  await composer.fill('Resuma esta passagem');
  await composer.press('Enter');
  await expect(chat.getByText('Analisei a passagem atual.', { exact: true })).toBeVisible();
  const context = await page.evaluate(
    () =>
      JSON.parse(sessionStorage.getItem('writer_fixture_chat_context')!) as {
        source: string;
        text: string;
      },
  );
  expect(context.source).toBe('viewport');
  expect(context.text).not.toContain('Parágrafo 0:');
  await page.evaluate(() => sessionStorage.setItem('writer_fixture_chat_slow', 'true'));
  await composer.fill('/continuar ');
  await composer.press('Enter');
  await chat.getByRole('button', { name: 'Parar', exact: true }).click();
  await expect(chat.getByText('Resposta interrompida; sem débito.')).toBeVisible();
});
