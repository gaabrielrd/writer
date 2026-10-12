import { capture, expect, expectNoHorizontalOverflow, test } from './support';
import { author, FIXTURE_BOOK_ID, FIXTURE_CHAPTER_ID } from './fixtures/data';

test('Escape cancela drag com foco no manuscrito antes de sair da tela cheia', async ({ page }) => {
  await page.setViewportSize({ width: 2160, height: 900 });
  await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
  const editor = page.getByLabel('Área de escrita do capítulo');
  await editor.fill('Texto para conferir drag e foco.');
  await editor.press('End');
  await page.getByRole('button', { name: 'Abrir Assistente Criativo de IA' }).click();
  await expect(page.getByLabel('Mensagem para o Assistente IA')).toBeEnabled();
  await editor.focus();
  await page.getByRole('button', { name: 'Entrar em tela cheia' }).click();
  const handle = page.getByRole('separator', { name: 'Largura do painel lateral' });
  await expect(handle).toHaveAttribute('aria-valuenow', '40');
  const before = await page.evaluate(
    (uid) => localStorage.getItem(`writer:editor-workspace:${encodeURIComponent(uid)}`),
    author.uid,
  );
  const rect = (await handle.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  try {
    await expect(handle).toHaveAttribute('data-dragging', 'true');
    await page.mouse.move(rect.x - 100, rect.y + rect.height / 2, { steps: 5 });
    await expect(editor).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Sair da tela cheia' })).toBeVisible();
    await expect(handle).not.toHaveAttribute('data-dragging', 'true');
    await expect(handle).toHaveAttribute('aria-valuenow', '40');
    await expect(editor).toBeFocused();
  } finally {
    await page.mouse.up();
  }
  expect(
    await page.evaluate(
      (uid) => localStorage.getItem(`writer:editor-workspace:${encodeURIComponent(uid)}`),
      author.uid,
    ),
  ).toBe(before);
  await expect(editor).toHaveText('Texto para conferir drag e foco.');
});

test('cancelar drag sob limite temporário restaura a proporção preferida ao ampliar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 2160, height: 900 });
  await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
  await page.getByRole('button', { name: 'Abrir Assistente Criativo de IA' }).click();
  await page.getByRole('button', { name: 'Entrar em tela cheia' }).click();
  const handle = page.getByRole('separator', { name: 'Largura do painel lateral' });
  await handle.focus();
  await handle.press('End');
  await expect(handle).toHaveAttribute('aria-valuenow', '70');
  await page.setViewportSize({ width: 900, height: 900 });
  await expect
    .poll(async () => Number(await handle.getAttribute('aria-valuenow')))
    .toBeLessThan(70);
  await handle.focus();
  const constrained = await handle.getAttribute('aria-valuenow');
  const rect = (await handle.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  try {
    await expect(handle).toHaveAttribute('data-dragging', 'true');
    await page.mouse.move(rect.x + 40, rect.y + rect.height / 2, { steps: 4 });
    await page.keyboard.press('Escape');
    await expect(handle).toHaveAttribute('aria-valuenow', constrained!);
  } finally {
    await page.mouse.up();
  }
  await page.setViewportSize({ width: 2160, height: 900 });
  await expect(handle).toHaveAttribute('aria-valuenow', '70');
  const stored = await page.evaluate(
    (uid) =>
      JSON.parse(localStorage.getItem(`writer:editor-workspace:${encodeURIComponent(uid)}`)!) as {
        panelPercent: number;
      },
    author.uid,
  );
  expect(stored.panelPercent).toBe(70);
});

test('tela cheia mantém caret visível dentro de um único parágrafo longo', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 720 });
  await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
  const editor = page.getByLabel('Área de escrita do capítulo');
  await editor.fill(
    'Uma passagem extensa muda de linha quando a largura disponível aumenta. '.repeat(600),
  );
  await editor.focus();
  const offset = await editor.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const node = walker.nextNode()!;
    const position = Math.floor(node.textContent!.length * 0.6);
    const range = document.createRange();
    range.setStart(node, position);
    range.collapse(true);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    return position;
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await editor.evaluate((element) => {
    let owner: HTMLElement | null = element as HTMLElement;
    while (
      owner &&
      !(
        /auto|scroll/.test(getComputedStyle(owner).overflowY) &&
        owner.scrollHeight > owner.clientHeight + 1
      )
    )
      owner = owner.parentElement;
    owner ??= document.scrollingElement as HTMLElement;
    const range = window.getSelection()!.getRangeAt(0);
    const top = owner === document.scrollingElement ? 0 : owner.getBoundingClientRect().top;
    owner.scrollTop += range.getBoundingClientRect().top - top - owner.clientHeight / 2;
  });
  const caretVisible = () =>
    editor.evaluate((element) => {
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.setStart(selection.focusNode!, selection.focusOffset);
      range.collapse(true);
      let owner: HTMLElement | null = element as HTMLElement;
      while (
        owner &&
        !(
          /auto|scroll/.test(getComputedStyle(owner).overflowY) &&
          owner.scrollHeight > owner.clientHeight + 1
        )
      )
        owner = owner.parentElement;
      owner ??= document.scrollingElement as HTMLElement;
      const top = owner === document.scrollingElement ? 0 : owner.getBoundingClientRect().top;
      const caret = range.getBoundingClientRect();
      return {
        visible: caret.top >= top && caret.bottom <= top + owner.clientHeight,
        offset: selection.focusOffset,
      };
    });
  await expect.poll(async () => (await caretVisible()).visible).toBe(true);
  expect((await caretVisible()).offset).toBe(offset);
  await page.getByRole('button', { name: 'Entrar em tela cheia' }).click();
  await expect.poll(async () => (await caretVisible()).visible).toBe(true);
  expect((await caretVisible()).offset).toBe(offset);
  // Escape alterna sem o scroll automático do Playwright até o botão no cabeçalho.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Entrar em tela cheia' })).toBeVisible();
  await expect.poll(async () => (await caretVisible()).visible).toBe(true);
  expect((await caretVisible()).offset).toBe(offset);
});

test('painéis mantêm cabeçalhos consistentes, filtros e leitura em altura baixa', async ({
  page,
}, testInfo) => {
  await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
  await page.getByRole('button', { name: /^Compêndio(?: \d+)?$/ }).click();
  const lore = page.getByRole('complementary', { name: 'Painel lateral do Compêndio de Lore' });
  await expect(lore.getByRole('heading', { level: 2, name: 'Compêndio' })).toBeVisible();
  const loreHeader = await lore.locator('[data-side-panel-header]').boundingBox();
  await lore.getByLabel('Buscar no compêndio').fill('zzz-sem-entidade');
  await expect(lore.getByText('Nenhuma entidade encontrada.')).toBeVisible();
  await page.getByRole('button', { name: 'Abrir Assistente Criativo de IA' }).click();
  const chat = page.getByRole('complementary', { name: 'Painel lateral do Assistente IA' });
  const chatHeader = await chat.locator('[data-side-panel-header]').boundingBox();
  expect(chatHeader!.height).toBeCloseTo(loreHeader!.height, 0);
  await expect(chat.getByRole('group', { name: 'Ações de Assistente IA' })).toBeVisible();
  await chat.getByLabel('Mensagem para o Assistente IA').fill('Conservar ao fechar');
  await chat.getByRole('button', { name: 'Fechar painel de IA' }).click();
  await expect(page.getByLabel('Área de escrita do capítulo')).toBeFocused();
  await page.getByRole('button', { name: /^Compêndio(?: \d+)?$/ }).click();
  await expect(lore.getByLabel('Buscar no compêndio')).toHaveValue('zzz-sem-entidade');
  await page.getByRole('button', { name: 'Abrir Assistente Criativo de IA' }).click();
  await expect(chat.getByLabel('Mensagem para o Assistente IA')).toHaveValue('Conservar ao fechar');
  await page.setViewportSize({ width: 1440, height: 440 });
  await page.getByRole('button', { name: 'Entrar em tela cheia' }).click();
  const messages = chat.getByRole('region', { name: 'Mensagens da conversa' });
  await expect.poll(async () => (await messages.boundingBox())!.height).toBeGreaterThan(40);
  await chat.getByRole('button', { name: 'Enviar', exact: true }).scrollIntoViewIfNeeded();
  await expect(chat.getByRole('button', { name: 'Enviar', exact: true })).toBeInViewport();
  await expect(chat.getByRole('heading', { name: 'Assistente IA', exact: true })).toBeInViewport();
  await expect(
    chat.getByRole('heading', { name: 'Converse sobre este capítulo', exact: true }),
  ).toBeInViewport();
  await expectNoHorizontalOverflow(page, 'painéis em altura baixa');
  await capture(page, testInfo, 'paineis-altura-baixa');
});

test('ferramentas agrupadas e opções do capítulo mantêm ações e foco', async ({
  page,
}, testInfo) => {
  await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
  const toolbar = page.getByRole('toolbar', { name: 'Ferramentas de escrita' });
  await expect(toolbar.getByRole('group', { name: 'Formatação' }).getByRole('button')).toHaveCount(
    7,
  );
  await expect(
    toolbar.getByRole('group', { name: 'Histórico de edição' }).getByRole('button'),
  ).toHaveCount(2);
  await expect(toolbar.getByRole('group', { name: 'Painéis do editor' })).toBeVisible();
  const editor = page.getByLabel('Área de escrita do capítulo');
  await editor.fill('Uma passagem em edição.');
  await editor.press('Control+A');
  await toolbar.getByRole('button', { name: 'Negrito', exact: true }).click();
  await expect(editor.locator('strong')).toHaveText('Uma passagem em edição.');
  const options = page.getByRole('button', { name: 'Opções do capítulo' });
  await options.focus();
  await options.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Persona' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Exportar' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(options).toBeFocused();
  await expect(editor).toHaveText('Uma passagem em edição.');
  await capture(page, testInfo, 'ferramentas-compactas');
  await page.setViewportSize({ width: 320, height: 480 });
  await expectNoHorizontalOverflow(page, 'ferramentas compactas em 320px');
  await capture(page, testInfo, 'ferramentas-compactas-320');
});

test('tela cheia usa toda a largura sem remontar texto, seleção, undo ou chat', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 2160, height: 900 });
  await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
  const editor = page.getByLabel('Área de escrita do capítulo');
  await editor.fill('Lia observa o porto.');
  await editor.press('End');
  await editor.press('Space');
  await editor.press('X');
  await page.getByRole('button', { name: 'Abrir Assistente Criativo de IA' }).click();
  const draft = page.getByLabel('Mensagem para o Assistente IA');
  await draft.fill('Rascunho antes de expandir');
  await editor.press('Control+A');
  const selected = await page.evaluate(() => window.getSelection()!.toString());
  const normalWidth = (await page.locator('#main-content').boundingBox())!.width;
  expect(normalWidth).toBeLessThanOrEqual(1440);
  await editor.evaluate((element) => {
    element.setAttribute('data-original-editor', 'true');
  });
  await page.getByRole('button', { name: 'Entrar em tela cheia' }).click();
  await expect(page.getByRole('button', { name: 'Sair da tela cheia' })).toBeVisible();
  expect((await page.locator('#main-content').boundingBox())!.width).toBeGreaterThan(2100);
  await expect(editor).toHaveAttribute('data-original-editor', 'true');
  expect(await page.evaluate(() => window.getSelection()!.toString())).toBe(selected);
  await expect(draft).toHaveValue('Rascunho antes de expandir');
  const area = page.locator('[data-editor-scroll-area]');
  expect(await area.evaluate((element) => getComputedStyle(element).maxWidth)).toBe('none');
  expect((await area.boundingBox())!.width).toBeGreaterThan(860);
  await page.getByRole('button', { name: 'Opções do capítulo', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Persona', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Opções do capítulo' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Sair da tela cheia' })).toBeVisible();
  await editor.press('Control+z');
  await expect(editor).not.toHaveText(/X$/);
  await editor.press('ArrowRight');
  await page.mouse.move(4, 4);
  await expect(page.locator('[data-editor-selection-actions]')).toHaveCount(0);
  await capture(page, testInfo, 'editor-tela-cheia');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Entrar em tela cheia' })).toBeVisible();
  await page.getByRole('button', { name: 'Entrar em tela cheia' }).click();
  await page.setViewportSize({ width: 320, height: 480 });
  await expectNoHorizontalOverflow(page, 'tela cheia em 320px e altura baixa');
  await expect(page.getByRole('separator', { name: 'Largura do painel lateral' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sair da tela cheia' }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Sair da tela cheia' }).click();
  await expect(draft).toHaveValue('Rascunho antes de expandir');
});

test('tela cheia conserva o trecho visível e restaura o shell ao sair da edição', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1700, height: 750 });
  await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
  const editor = page.getByLabel('Área de escrita do capítulo');
  await editor.fill('');
  for (let index = 0; index < 20; index += 1) {
    await page.keyboard.insertText(
      `Passagem ${index + 1}. ${'Lia caminha pelo porto e observa as marés. '.repeat(12)}`,
    );
    await page.keyboard.press('Enter');
  }
  const area = page.locator('[data-editor-scroll-area]');
  const passage = await area.evaluate((element) => {
    element.scrollTop = element.scrollHeight / 2;
    const top = element.getBoundingClientRect().top;
    const blocks = Array.from(element.querySelectorAll('[contenteditable] > p'));
    const block = blocks.find((candidate) => candidate.getBoundingClientRect().bottom > top)!;
    return {
      index: blocks.indexOf(block),
      text: block.textContent,
      offset: block.getBoundingClientRect().top - top,
    };
  });
  await page.getByRole('button', { name: 'Entrar em tela cheia' }).click();
  await expect
    .poll(async () =>
      area.evaluate((element, index) => {
        const block = element.querySelectorAll('[contenteditable] > p')[index];
        return block.getBoundingClientRect().top - element.getBoundingClientRect().top;
      }, passage.index),
    )
    .toBeCloseTo(passage.offset, 0);
  await expect(editor.locator(':scope > p').nth(passage.index)).toHaveText(passage.text);
  await expect(page.getByRole('navigation', { name: 'Minimapa do capítulo' })).toBeVisible();
  await page.getByRole('button', { name: 'Próximo capítulo' }).click();
  await expect(page.getByRole('button', { name: 'Sair da tela cheia' })).toBeVisible();
  await editor.press('Control+A');
  await expect(page.locator('[data-editor-selection-actions]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-editor-selection-actions]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sair da tela cheia' })).toBeVisible();
  await page.getByRole('link', { name: 'Voltar para o livro' }).click();
  await expect(page.locator('#main-content')).not.toHaveAttribute(
    'data-workspace-expanded',
    'true',
  );
  expect((await page.locator('#main-content').boundingBox())!.width).toBeLessThanOrEqual(1440);
  await capture(page, testInfo, 'shell-restaurado');
});

test('divisor do styleguide responde a drag, teclado e restauração', async ({ page }, testInfo) => {
  await page.goto('/styleguide');
  const handle = page.getByRole('separator', { name: 'Largura do painel de demonstração' });
  await handle.scrollIntoViewIfNeeded();
  await handle.focus();
  await handle.press('ArrowLeft');
  await expect(handle).toHaveAttribute('aria-valuenow', '42');
  await handle.press('Shift+ArrowRight');
  await expect(handle).toHaveAttribute('aria-valuenow', '32');
  await handle.press('End');
  await expect(handle).toHaveAttribute('aria-valuenow', '70');
  await handle.press('Home');
  await expect(handle).toHaveAttribute('aria-valuenow', '20');
  await handle.dblclick();
  await expect(handle).toHaveAttribute('aria-valuenow', '40');
  await handle.scrollIntoViewIfNeeded();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const rect = await handle.boundingBox();
  await page.mouse.move(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
  await page.mouse.down();
  await expect(handle).toHaveAttribute('data-dragging', 'true');
  await page.mouse.move(rect!.x - 30, rect!.y + rect!.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(async () => Number(await handle.getAttribute('aria-valuenow')))
    .toBeGreaterThan(40);
  await expectNoHorizontalOverflow(page, 'divisor do styleguide');
  await capture(page, testInfo, 'divisor-redimensionavel');
});

test('painéis compartilham largura persistida e preservam seleção, texto e rascunho', async ({
  page,
}, testInfo) => {
  await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
  const editor = page.getByLabel('Área de escrita do capítulo');
  await editor.fill('Lia observa o porto.');
  await page.getByRole('button', { name: /^Compêndio(?: \d+)?$/ }).click();
  const lore = page.getByRole('complementary', { name: 'Painel lateral do Compêndio de Lore' });
  await expect(lore).toBeVisible();
  const handle = page.getByRole('separator', { name: 'Largura do painel lateral' });
  const desktop = testInfo.project.name.startsWith('desktop');
  if (desktop) {
    await expect(handle).toBeVisible();
    const before = await lore.boundingBox();
    await editor.press('Control+A');
    const selection = await page.evaluate(() => window.getSelection()!.toString());
    expect(selection).toBe('Lia observa o porto.');
    const rect = await handle.boundingBox();
    const initialPercent = Number(await handle.getAttribute('aria-valuenow'));
    const workspaceWidth = await page
      .locator('[data-editor-workspace]')
      .evaluate((element) => element.getBoundingClientRect().width);
    const finalPercent =
      Math.round((initialPercent + ((100 + rect!.width / 2) / workspaceWidth) * 100) * 10) / 10;
    await page.mouse.move(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect!.x - 100, rect!.y + rect!.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(handle).toHaveAttribute('aria-valuenow', String(finalPercent));
    await expect(handle).not.toHaveAttribute('data-dragging');
    await expect
      .poll(async () => (await lore.boundingBox())!.width)
      .toBeGreaterThan(before!.width + 80);
    expect(await page.evaluate(() => window.getSelection()!.toString())).toBe(selection);
  } else {
    await expect(handle).toHaveCount(0);
    expect((await lore.boundingBox())!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  const loreRect = await lore.boundingBox();
  const savedPercent = desktop ? await handle.getAttribute('aria-valuenow') : null;
  await page.getByRole('button', { name: 'Abrir Assistente Criativo de IA' }).click();
  const chat = page.getByRole('complementary', { name: 'Painel lateral do Assistente IA' });
  await expect(chat).toBeVisible();
  expect((await chat.boundingBox())!.width).toBeCloseTo(loreRect!.width, 0);
  expect((await chat.boundingBox())!.height).toBeCloseTo(loreRect!.height, 0);
  const draft = chat.getByLabel('Mensagem para o Assistente IA');
  await draft.fill('Conservar este rascunho.');
  await page.getByRole('button', { name: /^Compêndio(?: \d+)?$/ }).click();
  await page.getByRole('button', { name: 'Abrir Assistente Criativo de IA' }).click();
  await expect(draft).toHaveValue('Conservar este rascunho.');
  await expect(editor).toHaveText('Lia observa o porto.');
  await expect(page.getByText('Salvo', { exact: true })).toBeVisible();
  await capture(page, testInfo, 'painel-com-largura-ajustada');
  await page.reload();
  await page.getByRole('button', { name: 'Abrir Assistente Criativo de IA' }).click();
  await expect(draft).toHaveValue('Conservar este rascunho.');
  if (desktop) await expect(handle).toHaveAttribute('aria-valuenow', savedPercent!);
  await page.setViewportSize({ width: 320, height: 640 });
  await expect(handle).toHaveCount(0);
  await expectNoHorizontalOverflow(page, 'painel compartilhado em 320px');
});
