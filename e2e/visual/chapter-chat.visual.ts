import { capture, expect, expectNoHorizontalOverflow, test } from './support';
import { FIXTURE_BOOK_ID, FIXTURE_CHAPTER_ID } from './fixtures/data';

test('geração registra parâmetros solicitados e usados e regeneração usa a nova escolha', async ({
  page,
}, testInfo) => {
  await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
  await expect(page.getByLabel('Área de escrita do capítulo')).toBeVisible();
  await page.getByRole('button', { name: 'Abrir Assistente Criativo de IA' }).click();
  const chat = page.getByRole('complementary', { name: 'Painel lateral do Assistente IA' });
  const reasoning = chat.getByRole('combobox', { name: 'Raciocínio do assistente' });
  await reasoning.click();
  await page.getByRole('option', { name: 'Alto', exact: true }).click();
  await expect(reasoning).toHaveText('Alto');
  const composer = chat.getByLabel('Mensagem para o Assistente IA');
  await composer.fill('Analise a passagem com cuidado');
  await composer.press('Enter');
  const replies = chat.getByRole('article', { name: 'Resposta do assistente', exact: true });
  await expect(replies).toHaveCount(1);
  await expect(
    replies.first().getByText('Analisei a passagem atual.', { exact: true }),
  ).toBeVisible();
  await replies.first().getByText('Modelo e raciocínio', { exact: true }).click();
  await expect(replies.first()).toContainText('Solicitado: gemini-3.7-flash · Alto');
  await expect(replies.first()).toContainText('Usado: gemini-3.7-flash · Alto');
  const original = await page.evaluate(
    () =>
      JSON.parse(sessionStorage.getItem('writer_fixture_chat_generation')!) as {
        requested: { reasoning: string };
        effective: { reasoning: string };
      },
  );
  expect(original.requested.reasoning).toBe('high');
  expect(original.effective.reasoning).toBe('high');
  await reasoning.click();
  await page.getByRole('option', { name: 'Baixo', exact: true }).click();
  await expect(reasoning).toHaveText('Baixo');
  await chat.getByRole('button', { name: 'Regenerar resposta', exact: true }).click();
  await expect(replies).toHaveCount(2);
  await expect(
    replies.last().getByText('Analisei a passagem atual.', { exact: true }),
  ).toBeVisible();
  await replies.last().getByText('Modelo e raciocínio', { exact: true }).click();
  await expect(replies.last()).toContainText('Usado: gemini-3.7-flash · Baixo');
  await expect(replies.first()).toContainText('Usado: gemini-3.7-flash · Alto');
  await page.reload();
  await page.getByRole('button', { name: 'Abrir Assistente Criativo de IA' }).click();
  await expect(reasoning).toHaveText('Baixo');
  await replies.first().getByText('Modelo e raciocínio', { exact: true }).click();
  await expect(replies.first()).toContainText('Usado: gemini-3.7-flash · Alto');
  await page.setViewportSize({ width: 320, height: 480 });
  await expectNoHorizontalOverflow(page, 'metadados da geração em 320px');
  await capture(page, testInfo, 'geracao-raciocinio-320');
});

test('raciocínio privado retoma por conversa e fornece o padrão das novas', async ({
  page,
}, testInfo) => {
  await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
  await expect(page.getByLabel('Área de escrita do capítulo')).toBeVisible();
  await page.getByRole('button', { name: 'Abrir Assistente Criativo de IA' }).click();
  const chat = page.getByRole('complementary', { name: 'Painel lateral do Assistente IA' });
  const reasoning = chat.getByRole('combobox', { name: 'Raciocínio do assistente' });
  await expect(reasoning).toHaveText('Auto');
  await reasoning.click();
  await expect(page.getByRole('option', { name: 'Máximo', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expect(page.getByRole('option', { name: 'Nenhum', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.getByRole('option', { name: 'Alto', exact: true }).click();
  await expect(reasoning).toHaveText('Alto');
  await chat.getByLabel('Mensagem para o Assistente IA').fill('Rascunho com raciocínio alto');
  await page.reload();
  await page.getByRole('button', { name: 'Abrir Assistente Criativo de IA' }).click();
  await expect(reasoning).toHaveText('Alto');
  await expect(chat.getByLabel('Mensagem para o Assistente IA')).toHaveValue(
    'Rascunho com raciocínio alto',
  );
  await chat.getByRole('button', { name: 'Nova conversa', exact: true }).click();
  await expect(reasoning).toHaveText('Alto');
  await reasoning.click();
  await page.getByRole('option', { name: 'Baixo', exact: true }).click();
  await expect(reasoning).toHaveText('Baixo');
  await chat.getByRole('combobox', { name: 'Conversas deste capítulo' }).click();
  await page.getByRole('option', { name: 'Nova conversa', exact: true }).nth(1).click();
  await expect(reasoning).toHaveText('Alto');
  await expect(chat.getByLabel('Mensagem para o Assistente IA')).toHaveValue(
    'Rascunho com raciocínio alto',
  );
  await chat.getByRole('button', { name: 'Nova conversa', exact: true }).click();
  await expect(reasoning).toHaveText('Baixo');
  await page.setViewportSize({ width: 320, height: 480 });
  await reasoning.scrollIntoViewIfNeeded();
  const modelBox = (await chat
    .getByRole('button', { name: 'Configurar modelo do assistente' })
    .boundingBox())!;
  const reasoningBox = (await reasoning.boundingBox())!;
  expect(Math.abs(modelBox.y - reasoningBox.y)).toBeLessThan(1);
  await reasoning.click();
  await expect(page.getByRole('option', { name: 'Médio', exact: true })).toBeInViewport();
  await expectNoHorizontalOverflow(page, 'raciocínio em 320px');
  await capture(page, testInfo, 'raciocinio-320');
  await page.keyboard.press('Escape');
  await expect(chat).toBeVisible();
});

test('compositor mantém controles no campo, contexto expansível e acesso ao modelo', async ({
  page,
}, testInfo) => {
  await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
  await expect(page.getByLabel('Área de escrita do capítulo')).toBeVisible();
  await page.getByRole('button', { name: 'Abrir Assistente Criativo de IA' }).click();
  const chat = page.getByRole('complementary', { name: 'Painel lateral do Assistente IA' });
  const composer = chat.getByLabel('Mensagem para o Assistente IA');
  await composer.fill('Pedido ainda não enviado');
  await composer.press('Shift+Enter');
  await expect(composer).toHaveValue('Pedido ainda não enviado\n');
  const inputBox = (await composer.boundingBox())!;
  const sendBox = (await chat.getByRole('button', { name: 'Enviar', exact: true }).boundingBox())!;
  expect(sendBox.x).toBeGreaterThan(inputBox.x);
  expect(sendBox.y).toBeGreaterThan(inputBox.y);
  expect(sendBox.x + sendBox.width).toBeLessThan(inputBox.x + inputBox.width);
  expect(sendBox.y + sendBox.height).toBeLessThan(inputBox.y + inputBox.height);
  const model = chat.getByRole('button', { name: 'Configurar modelo do assistente' });
  expect((await model.boundingBox())!.y).toBeGreaterThanOrEqual(inputBox.y + inputBox.height);
  const toggle = chat.locator('button[aria-controls][aria-expanded]');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  const details = chat.getByRole('region', { name: 'Contexto e comandos' });
  await expect(details).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await details.getByRole('button', { name: 'Fixar contexto', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(details).toHaveCount(0);
  await expect(composer).toBeFocused();
  await expect(chat).toBeVisible();
  await model.click();
  await expect(page).toHaveURL(/\/settings\/ai\?tab=provider$/);
  await expect(page.getByRole('tab', { name: 'Provedor' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('link', { name: 'Voltar ao editor' }).click();
  await page.getByRole('button', { name: 'Abrir Assistente Criativo de IA' }).click();
  await expect(composer).toHaveValue('Pedido ainda não enviado\n');
  await page.setViewportSize({ width: 320, height: 480 });
  await toggle.click();
  await expect(details).toBeVisible();
  await expect.poll(async () => (await details.boundingBox())!.height).toBeGreaterThan(96);
  await details.scrollIntoViewIfNeeded();
  await expect(details.getByText('Contexto e comandos', { exact: true })).toBeInViewport();
  await expectNoHorizontalOverflow(page, 'compositor com contexto em 320px');
  await capture(page, testInfo, 'compositor-contexto-320');
  await details.getByRole('button', { name: 'Recolher detalhes do contexto' }).click();
  await expect(composer).toBeFocused();
  await composer.fill('/');
  await expect(chat.getByRole('listbox', { name: 'Comandos do assistente' })).toBeVisible();
  await composer.press('Escape');
  await expect(chat.getByRole('listbox', { name: 'Comandos do assistente' })).toHaveCount(0);
  await expect(chat).toBeVisible();
});

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
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await editor.press('Control+Home');
  await expect
    .poll(() =>
      editor.evaluate((element) => {
        const selection = window.getSelection()!;
        const before = selection.getRangeAt(0).cloneRange();
        before.selectNodeContents(element);
        before.setEnd(selection.anchorNode!, selection.anchorOffset);
        return before.toString().length;
      }),
    )
    .toBe(0);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.evaluate(() => {
    const area = document.querySelector('[data-editor-scroll-area]')!;
    if (
      area.scrollHeight > area.clientHeight + 1 &&
      /auto|scroll/.test(getComputedStyle(area).overflowY)
    )
      area.scrollTop = area.scrollHeight / 2;
    else window.scrollTo(0, document.scrollingElement!.scrollHeight / 2);
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
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
