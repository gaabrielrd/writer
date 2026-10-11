import type { Locator, Page } from '@playwright/test';
import {
  capture,
  expect,
  expectDialogWithinViewport,
  expectNoHorizontalOverflow,
  test,
} from './support';
import { FIXTURE_BOOK_ID, FIXTURE_CHAPTER_ID } from './fixtures/data';

const selectionToolbarName = 'Assistente IA para o texto selecionado';
const manuscript = 'Um trecho simples para revisão.';

async function openEditor(page: Page) {
  await page.goto(`/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`);
  const editor = page.getByLabel('Área de escrita do capítulo');
  await expect(editor).toBeVisible();
  return editor;
}

async function selectManuscript(editor: Locator) {
  await editor.press('Control+A');
}

async function resize(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

test('compêndio compacto mantém busca, filtros e ações nos três temas', async ({
  page,
}, testInfo) => {
  await openEditor(page);
  await page.getByRole('button', { name: /^Compêndio(?: \d+)?$/ }).click();
  const panel = page.getByRole('complementary', { name: 'Painel lateral do Compêndio de Lore' });
  await expect(panel).toBeVisible();
  const height = await panel.evaluate(
    (element) =>
      element.children[2].getBoundingClientRect().top - element.getBoundingClientRect().top,
  );
  // Baseline measured before implementation at 1440 x 1000: 313 px in all themes.
  if (testInfo.project.name.startsWith('desktop')) expect(height).toBeLessThanOrEqual(313 * 0.7);
  await testInfo.attach('altura-dos-controles', {
    body: JSON.stringify({ height, baselineDesktop: 313 }),
    contentType: 'application/json',
  });
  await expect(panel.getByRole('heading', { name: 'Compêndio', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Nova Entidade' })).toBeVisible();
  await expect(
    panel.getByRole('button', { name: 'Atualizar compêndio com base no texto' }),
  ).toBeVisible();
  await panel.getByLabel('Buscar no compêndio').fill('Lia');
  await expect(panel.getByText('Lia', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Locais', exact: true }).click();
  await expect(panel.getByText('Nenhuma entidade encontrada.')).toBeVisible();
  await panel.getByRole('button', { name: 'Todos', exact: true }).click();
  await capture(page, testInfo, 'compendio-compacto');
  await resize(page, 320, 640);
  await expectNoHorizontalOverflow(page, 'compêndio em 320px');
  await panel.getByRole('button', { name: 'Nova Entidade' }).click();
  await expectDialogWithinViewport(page);
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await panel.getByRole('button', { name: 'Fechar painel de lore' }).click();
  await expect(panel).toHaveCount(0);
});

test('assistente sem footer usa opções, campo e botão em uma coluna', async ({
  page,
}, testInfo) => {
  await openEditor(page);
  await page.getByRole('button', { name: 'Abrir Assistente Criativo de IA' }).click();
  const dialog = page.getByRole('dialog', { name: 'Assistente Criativo de IA' });
  await expectDialogWithinViewport(page);
  await expect(dialog.locator('[data-slot="dialog-footer"]')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /BYOK/ })).toHaveCount(0);
  const controls = [
    dialog.getByRole('button', { name: /^Continuar Cena/ }),
    dialog.getByRole('button', { name: /^Aprimorar Estilo/ }),
    dialog.getByRole('button', { name: /^Coerência com Lore/ }),
    dialog.getByLabel('Ou dê uma instrução personalizada à IA'),
    dialog.getByRole('button', { name: 'Executar', exact: true }),
  ];
  const boxes = await Promise.all(controls.map((control) => control.boundingBox()));
  for (let i = 1; i < boxes.length; i++) {
    expect(boxes[i]!.y).toBeGreaterThanOrEqual(boxes[i - 1]!.y + boxes[i - 1]!.height);
    expect(boxes[i]!.x).toBeCloseTo(boxes[0]!.x, 0);
    expect(boxes[i]!.width).toBeCloseTo(boxes[0]!.width, 0);
  }
  await capture(page, testInfo, 'assistente-em-coluna');
  await resize(page, 320, 480);
  await expectDialogWithinViewport(page);
  await controls[3].fill('Descreva o cenário');
  await expect(controls[4]).toBeEnabled();
  await controls[4].scrollIntoViewIfNeeded();
  await expect(controls[4]).toBeInViewport();
  await expectNoHorizontalOverflow(page, 'assistente em 320px');
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(page.getByLabel('Área de escrita do capítulo')).toBeFocused();
});

test('seleção abre ações acima do trecho e aplica somente após aceite', async ({
  page,
}, testInfo) => {
  const editor = await openEditor(page);
  await page.evaluate(() => sessionStorage.setItem('writer_fixture_ai_actions', 'true'));
  await editor.fill(manuscript);
  await selectManuscript(editor);
  const toolbar = page.getByRole('toolbar', { name: selectionToolbarName });
  await expect(toolbar).toBeVisible();
  const position = await page.evaluate(() => {
    const bar = document.querySelector('[data-editor-selection-actions]')!.getBoundingClientRect();
    const selection = window.getSelection()!.getRangeAt(0).getBoundingClientRect();
    return {
      bar: { top: bar.top, bottom: bar.bottom, left: bar.left, right: bar.right },
      selectionTop: selection.top,
    };
  });
  expect(position.bar.bottom).toBeLessThanOrEqual(position.selectionTop);
  expect(position.bar.left).toBeGreaterThanOrEqual(0);
  expect(position.bar.right).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(await editor.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('none');
  expect(
    await page.evaluate(() => sessionStorage.getItem('writer_fixture_ai_action_calls')),
  ).toBeNull();
  await capture(page, testInfo, 'acoes-acima-da-selecao');
  await toolbar.getByRole('button', { name: 'Aprimorar Estilo', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Assistente Criativo de IA' });
  await expect(dialog.getByText('O trecho ganhou novos detalhes.', { exact: true })).toBeVisible();
  await expect(editor).toHaveText(manuscript);
  expect(
    await page.evaluate(() => sessionStorage.getItem('writer_fixture_ai_action_prompt')),
  ).toContain(manuscript);
  await dialog.getByRole('button', { name: 'Substituir Seleção' }).click();
  await expect(editor).toHaveText('O trecho ganhou novos detalhes.');
  await expect(editor).toBeFocused();
  await editor.fill(manuscript);
  await selectManuscript(editor);
  await expect(toolbar).toBeVisible();
  await editor.press('Alt+Enter');
  await expect(toolbar.getByRole('button', { name: 'Continuar Cena', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(
    toolbar.getByRole('button', { name: 'Aprimorar Estilo', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toolbar).toHaveCount(0);
  await expect(editor).toBeFocused();
  await selectManuscript(editor);
  await expect(toolbar).toBeVisible();
  await toolbar.getByRole('button', { name: 'Instrução personalizada' }).click();
  await expect(dialog.getByLabel('Ou dê uma instrução personalizada à IA')).toBeFocused();
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('link', { name: 'Voltar para o livro' }).focus();
  await expect(toolbar).toHaveCount(0);
});

test('menção ativa tem contraste e indicador, com navegação em 320px', async ({
  page,
}, testInfo) => {
  const editor = await openEditor(page);
  await editor.fill('@');
  const menu = page.getByRole('listbox', { name: 'Sugestões de menção do compêndio' });
  await expect(menu).toBeVisible();
  const active = menu.locator('[aria-selected="true"]');
  const contrast = await active.evaluate((element) => {
    const background = getComputedStyle(element).backgroundColor;
    const text = getComputedStyle(element.querySelector('strong')!).color;
    const luminance = (color: string) => {
      const rgb = color
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number)
        .map((value) => {
          const s = value / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    const a = luminance(background),
      b = luminance(text);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await expect(active.locator('strong svg')).toBeVisible();
  const first = await active.getAttribute('id');
  await editor.press('ArrowDown');
  await expect(active).not.toHaveAttribute('id', first!);
  await expect(editor).toHaveAttribute('aria-activedescendant', (await active.getAttribute('id'))!);
  await capture(page, testInfo, 'mencao-com-contraste');
  await resize(page, 320, 640);
  await editor.scrollIntoViewIfNeeded();
  await expectNoHorizontalOverflow(page, 'menção em 320px');
  const selectedName = await active.locator('strong').innerText();
  await editor.press('Enter');
  await expect(menu).toHaveCount(0);
  await expect(editor).toContainText(selectedName);
});

test('seleção parcial por mouse acompanha rolagem e cabe em 320px', async ({ page }, testInfo) => {
  const editor = await openEditor(page);
  await editor.fill('');
  await page.getByRole('button', { name: 'Título Principal', exact: true }).click();
  await editor.fill(
    manuscript +
      '\n\n' +
      Array.from({ length: 50 }, () => 'A escrita continua em outro parágrafo.').join('\n\n'),
  );
  // Settle the editor's caret scrolling before measuring the mouse drag target.
  await editor.press('Control+Home');
  await editor.getByText(manuscript, { exact: true }).scrollIntoViewIfNeeded();
  const points = await editor.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const node = walker.nextNode()!;
    const range = document.createRange();
    range.setStart(node, 3);
    range.setEnd(node, 4);
    const start = range.getBoundingClientRect();
    range.setStart(node, 8);
    range.setEnd(node, 9);
    const end = range.getBoundingClientRect();
    // Drag inside the first/last glyphs instead of relying on zero-width caret boundaries.
    return {
      start: { x: start.left + start.width / 4, y: (start.top + start.bottom) / 2 },
      end: { x: end.right - end.width / 4, y: (end.top + end.bottom) / 2 },
    };
  });
  await page.mouse.move(points.start.x, points.start.y);
  await page.mouse.down();
  await page.mouse.move(points.end.x, points.end.y, { steps: 8 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('trecho');
  const toolbar = page.getByRole('toolbar', { name: selectionToolbarName });
  await expect(toolbar).toBeVisible();
  const scrollArea = page.locator('[data-editor-scroll-area]');
  if (testInfo.project.name.startsWith('mobile')) {
    await page.evaluate(() => window.scrollBy(0, 300));
  } else {
    await scrollArea.evaluate((element) => {
      element.scrollTop = 300;
    });
  }
  await expect(toolbar).toHaveCount(0);
  if (testInfo.project.name.startsWith('mobile')) {
    await page.evaluate(() => window.scrollBy(0, -300));
  } else {
    await scrollArea.evaluate((element) => {
      element.scrollTop = 0;
    });
  }
  await expect(toolbar).toBeVisible();
  await resize(page, 320, 480);
  await editor.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await expect(toolbar).toBeVisible();
  const box = (await toolbar.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(480);
  await expectNoHorizontalOverflow(page, 'ações em 320px');
  await page.getByRole('link', { name: 'Voltar para o livro' }).focus();
  await expect(toolbar).toHaveCount(0);
});
