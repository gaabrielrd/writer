import type { Locator, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { chooseDropdown } from '../dropdown';
import { chapters, FIXTURE_BOOK_ID, FIXTURE_CHAPTER_ID } from './fixtures/data';
import {
  capture,
  expect,
  expectDialogWithinViewport,
  expectNoHorizontalOverflow,
  test,
} from './support';

const bookPath = `/books/${FIXTURE_BOOK_ID}`;
async function openBookPlanner(page: Page) {
  await page.goto(bookPath);
  await page.getByRole('tab', { name: 'Cenas', exact: true }).click();
  const planner = page.getByRole('region', { name: 'Planejamento de cenas', exact: true });
  await expect(planner.getByLabel('Capítulo', { exact: true })).toBeVisible();
  return planner;
}
async function createGroup(
  page: Page,
  planner: Locator,
  title: string,
  kind: 'capítulo' | 'parte' = 'capítulo',
) {
  const label = kind === 'capítulo' ? 'Novo capítulo' : 'Nova parte';
  await planner.getByRole('button', { name: label, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: label, exact: true });
  await dialog
    .getByLabel(kind === 'capítulo' ? 'Título do capítulo' : 'Título da parte')
    .fill(title);
  await dialog.getByRole('button', { name: label, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await chooseDropdown(
    planner.getByLabel(kind === 'capítulo' ? 'Capítulo' : 'Parte', { exact: true }),
    title,
  );
}
async function createScene(page: Page, planner: Locator, title: string) {
  await planner.getByRole('button', { name: 'Nova cena', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova cena', exact: true });
  await dialog.getByLabel('Título da cena').fill(title);
  await dialog
    .getByLabel('Objetivo', { exact: true })
    .fill('NOTA PRIVADA: revelar a identidade da cartógrafa.');
  await dialog
    .getByLabel('Conflito', { exact: true })
    .fill('CONFLITO PRIVADO: ela esconde o atlas.');
  await dialog.getByLabel('Ponto de vista', { exact: true }).fill('Lia');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(planner.getByRole('article', { name: `Cena ${title}`, exact: true })).toBeVisible();
}
async function sceneAction(page: Page, planner: Locator, title: string, action: string) {
  await planner.getByRole('button', { name: `Ações da cena ${title}`, exact: true }).click();
  await page.getByRole('menuitem', { name: action, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: action, exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}
async function writeScene(page: Page, planner: Locator, title: string, content: string) {
  await planner.getByRole('link', { name: title, exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Área de escrita da cena', exact: true });
  await expect(editor).toBeVisible();
  await editor.fill(content);
  await expect(page.getByRole('status').filter({ hasText: /^Salvo$/ })).toBeVisible();
  return editor;
}
async function returnToBookPlanner(page: Page, groupTitle?: string) {
  await page.getByRole('link', { name: 'Voltar ao planejamento', exact: true }).click();
  await page.getByRole('tab', { name: 'Cenas', exact: true }).click();
  const planner = page.getByRole('region', { name: 'Planejamento de cenas', exact: true });
  if (groupTitle) await chooseDropdown(planner.getByLabel('Capítulo', { exact: true }), groupTitle);
  return planner;
}
async function downloadBook(page: Page, format?: string): Promise<string> {
  await page.getByRole('button', { name: 'Opções do livro', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Exportar', exact: true }).click();
  if (format) await chooseDropdown(page.getByLabel('Formato do arquivo'), format);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Baixar arquivo', exact: true }).click(),
  ]);
  const path = await download.path();
  expect(path).not.toBeNull();
  if (!path) throw new Error('O download deve existir.');
  const content = await readFile(path, 'utf8');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Fechar', exact: true })
    .first()
    .click();
  return content;
}

test('capítulo legado permanece editável e conversão explícita conserva o HTML rico inteiro', async ({
  page,
}, testInfo) => {
  await page.goto(`${bookPath}/editor/${FIXTURE_CHAPTER_ID}`);
  const manuscript = page.getByRole('textbox', { name: 'Área de escrita do capítulo' });
  await manuscript.fill('Ação, memória e café nas ilhas.');
  await manuscript.locator(':scope > :first-child').click({ position: { x: 2, y: 2 } });
  await manuscript.press('Control+Home');
  for (let index = 0; index < 4; index += 1) await manuscript.press('Shift+ArrowRight');
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('Ação');
  await page.getByRole('button', { name: 'Negrito', exact: true }).click();
  await expect(manuscript.locator('strong')).toHaveText('Ação');
  await expect(page.getByText('Salvo', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Voltar para o livro', exact: true }).click();
  await page.getByRole('tab', { name: 'Cenas', exact: true }).click();
  const planner = page.getByRole('region', { name: 'Planejamento de cenas', exact: true });
  await chooseDropdown(
    planner.getByLabel('Capítulo', { exact: true }),
    `${chapters[0].title} · legado`,
  );
  await expect(planner.getByRole('button', { name: 'Nova cena', exact: true })).toBeDisabled();
  await planner.getByRole('button', { name: 'Converter em cenas', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Converter em cenas', exact: true });
  await expect(dialog).toContainText('O corpo inteiro vira uma cena');
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'converter-capitulo-rico');
  await dialog.getByRole('button', { name: 'Converter em cenas', exact: true }).click();
  await expect(planner.getByRole('article')).toHaveCount(1);
  await expect(
    planner.getByRole('button', { name: 'Converter em cenas', exact: true }),
  ).toHaveCount(0);
  await planner.getByRole('link', { name: chapters[0].title, exact: true }).click();
  const sceneEditor = page.getByRole('textbox', { name: 'Área de escrita da cena', exact: true });
  await expect(sceneEditor).toHaveText('Ação, memória e café nas ilhas.');
  await expect(sceneEditor.locator('strong')).toHaveText('Ação');
  await capture(page, testInfo, 'cena-convertida-rica');
  await page.goto(`${bookPath}/editor/${FIXTURE_CHAPTER_ID}`);
  await expect(page.getByRole('textbox', { name: 'Área de escrita do capítulo' })).toHaveCount(0);
  await expect(page.getByText('Ação, memória e café nas ilhas.', { exact: true })).toHaveCount(1);
  await expect(page.locator('strong').filter({ hasText: 'Ação' })).toHaveCount(1);
  await expectNoHorizontalOverflow(page, 'composicao-convertida');
  await page.goto(bookPath);
  const backup = await downloadBook(page, 'Backup completo (.json)');
  expect(backup).toContain('"version": 5');
  expect(backup).toContain('"sources"');
  expect(backup).toContain('Ação');
  expect(backup).toContain('<strong>');
});

test('cena autoral tem escrita manual, undo e autosave próprios em 320px', async ({
  page,
}, testInfo) => {
  let planner = await openBookPlanner(page);
  await createGroup(page, planner, 'Capítulo das cartas');
  await createScene(page, planner, 'O encontro com a cartógrafa');
  await page.setViewportSize({ width: 320, height: 740 });
  const editor = await writeScene(
    page,
    planner,
    'O encontro com a cartógrafa',
    'Lia encontra as cartas esquecidas.',
  );
  await editor.press('Control+Home');
  for (let index = 0; index < 3; index += 1) await editor.press('Shift+ArrowRight');
  await page.getByRole('button', { name: 'Negrito', exact: true }).click();
  await expect(editor.locator('strong')).toHaveText('Lia');
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click();
  await expect(editor.locator('strong')).toHaveCount(0);
  await page.getByRole('button', { name: 'Refazer', exact: true }).click();
  await expect(editor.locator('strong')).toHaveText('Lia');
  await expect(page.getByRole('status').filter({ hasText: /^Salvo$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: '84 créditos de IA, plano free' })).toBeVisible();
  const layout = await editor.evaluate((element) => {
    const paper = element.closest('[class*="paper"]');
    if (!paper) throw new Error('A folha da cena deve estar montada.');
    const measure = (target: Element | null) => {
      if (!(target instanceof HTMLElement)) return null;
      const bounds = target.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        width: bounds.width,
        scrollLeft: target.scrollLeft,
        clientWidth: target.clientWidth,
        scrollWidth: target.scrollWidth,
      };
    };
    return {
      paper: measure(paper),
      container: measure(paper.firstElementChild),
      scrollArea: measure(paper.querySelector('[data-editor-scroll-area]')),
      textbox: measure(element),
      firstWord: measure(element.querySelector('strong')),
    };
  });
  await testInfo.attach('geometria-editor-320', {
    body: JSON.stringify(layout, null, 2),
    contentType: 'application/json',
  });
  expect(layout.container?.width).toBeLessThanOrEqual((layout.paper?.width ?? 0) + 1);
  expect(layout.firstWord?.left).toBeGreaterThanOrEqual(layout.paper?.left ?? 0);
  expect(layout.scrollArea?.scrollWidth).toBeLessThanOrEqual(
    (layout.scrollArea?.clientWidth ?? 0) + 1,
  );
  await capture(page, testInfo, 'editor-cena-320');
  planner = await returnToBookPlanner(page, 'Capítulo das cartas');
  await planner.getByRole('link', { name: 'O encontro com a cartógrafa', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Área de escrita da cena' }).locator('strong'),
  ).toHaveText('Lia');
});

test('rascunho legado anterior à conversão permanece privado e recuperável por cópia explícita', async ({
  page,
  context,
}, testInfo) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const planner = await openBookPlanner(page);
  const draftKey = `writer:draft:visual-author:${FIXTURE_BOOK_ID}:${FIXTURE_CHAPTER_ID}`;
  const localText = 'LOCAL PARTICULAR: uma decisão ainda não confirmada.';
  const draft = JSON.stringify({
    content: `<p><strong>${localText}</strong></p>`,
    updatedAt: 123456,
  });
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: draftKey,
    value: draft,
  });
  await chooseDropdown(
    planner.getByLabel('Capítulo', { exact: true }),
    `${chapters[0].title} · legado`,
  );
  await planner.getByRole('button', { name: 'Converter em cenas', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Converter em cenas', exact: true })
    .getByRole('button', { name: 'Converter em cenas', exact: true })
    .click();
  await expect(planner.getByRole('article')).toHaveCount(1);
  await page.goto(`${bookPath}/editor/${FIXTURE_CHAPTER_ID}`);
  await page.getByText('Rascunho local anterior à conversão', { exact: true }).click();
  const preview = page.getByRole('region', { name: 'Prévia do rascunho anterior', exact: true });
  await expect(preview.locator('strong')).toHaveText(localText);
  await expect(preview.locator('[contenteditable="true"]')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Área de escrita do capítulo' })).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'Composição do capítulo', exact: true }),
  ).not.toContainText(localText);
  await page.getByRole('button', { name: 'Copiar texto formatado', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Texto formatado copiado.' }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(localText);
  expect(await page.evaluate((key) => localStorage.getItem(key), draftKey)).toBe(draft);
  await expect(page.getByRole('button', { name: '84 créditos de IA, plano free' })).toBeVisible();
  await capture(page, testInfo, 'rascunho-legado-preservado');
  await page.goto(bookPath);
  expect(await downloadBook(page)).not.toContain(localText);
  expect(await downloadBook(page, 'Backup completo (.json)')).not.toContain(localText);
  await page.getByRole('tab', { name: 'Publicação', exact: true }).click();
  await page.getByRole('button', { name: 'Publicar Obra', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Publicar versão da obra', exact: true });
  await dialog.getByLabel('Nome de autor público').fill('Marina de Exemplo');
  await dialog.getByRole('button', { name: 'Confirmar publicação', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.goto(`/read/${FIXTURE_BOOK_ID}`);
  await page
    .getByRole('navigation', { name: 'Sumário' })
    .getByRole('link', { name: chapters[0].title, exact: true })
    .click();
  await expect(page.getByText(localText, { exact: true })).toHaveCount(0);
});

test('aventura reúne partes e cenas sem criar livro auxiliar', async ({ page }, testInfo) => {
  await page.goto('/adventures/visual-adventure-1');
  const planner = page.getByRole('region', { name: 'Planejamento de cenas', exact: true });
  await createGroup(page, planner, 'A chegada ao farol', 'parte');
  await createScene(page, planner, 'Uma porta entre as marés');
  const editor = await writeScene(
    page,
    planner,
    'Uma porta entre as marés',
    'O farol abre uma passagem para as ilhas distantes.',
  );
  await expect(editor).toHaveText('O farol abre uma passagem para as ilhas distantes.');
  await expect(page).toHaveURL(/\/adventures\/visual-adventure-1\/scenes\//);
  await capture(page, testInfo, 'aventura-escrita-cena');
  await page.getByRole('link', { name: 'Voltar ao planejamento', exact: true }).click();
  await chooseDropdown(planner.getByLabel('Parte', { exact: true }), 'A chegada ao farol');
  await expect(
    planner.getByRole('article', { name: 'Cena Uma porta entre as marés', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Estúdio', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Estúdio', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Livros', exact: true }).getByRole('heading', { level: 3 }),
  ).toHaveCount(3);
});

test('lista paginada e quadro filtrado permitem mudar estado por teclado', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => sessionStorage.setItem('writer.visual.scene-pagination', 'true'));
  const planner = await openBookPlanner(page);
  await chooseDropdown(
    planner.getByLabel('Capítulo', { exact: true }),
    'As histórias entre as ilhas',
  );
  await expect(planner.getByRole('article')).toHaveCount(25);
  await planner.getByRole('button', { name: 'Carregar mais cenas', exact: true }).click();
  await expect(planner.getByRole('article')).toHaveCount(28);
  await expect(
    planner.getByRole('button', { name: 'Carregar mais cenas', exact: true }),
  ).toHaveCount(0);
  const board = planner.getByRole('button', { name: 'Quadro', exact: true });
  await board.focus();
  await page.keyboard.press('Enter');
  await expect(board).toHaveAttribute('aria-pressed', 'true');
  await chooseDropdown(planner.getByLabel('Estado da cena', { exact: true }), 'Em escrita');
  await expect(planner.getByRole('article')).toHaveCount(1);
  const action = planner.getByRole('button', {
    name: 'Ações da cena Cena das ilhas 1',
    exact: true,
  });
  await action.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: 'Alterar estado', exact: true }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Alterar estado', exact: true });
  await chooseDropdown(dialog.getByLabel('Novo estado da cena'), 'Concluída');
  await dialog.getByRole('button', { name: 'Alterar estado', exact: true }).click();
  await expect(planner.getByRole('article')).toHaveCount(0);
  await chooseDropdown(planner.getByLabel('Estado da cena', { exact: true }), 'Concluída');
  await expect(
    planner.getByRole('article', { name: 'Cena Cena das ilhas 1', exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  await capture(page, testInfo, 'quadro-cena-filtrada-320');
});

test('resposta de criação perdida preserva plano e confirma uma única cena', async ({
  page,
}, testInfo) => {
  const planner = await openBookPlanner(page);
  await page.evaluate(() =>
    sessionStorage.setItem('writer.visual.scene-lost-response', 'createScene'),
  );
  await planner.getByRole('button', { name: 'Nova cena', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova cena', exact: true });
  await dialog.getByLabel('Título da cena').fill('O pedido guardado');
  await dialog
    .getByLabel('Objetivo', { exact: true })
    .fill('Este preenchimento precisa sobreviver ao retry.');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog.getByLabel('Título da cena')).toHaveValue('O pedido guardado');
  await expect(dialog.getByLabel('Objetivo', { exact: true })).toHaveValue(
    'Este preenchimento precisa sobreviver ao retry.',
  );
  await expect(dialog.getByLabel('Título da cena')).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Cancelar', exact: true })).toBeDisabled();
  await capture(page, testInfo, 'cena-resposta-perdida');
  await dialog.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    planner.getByRole('article', { name: 'Cena O pedido guardado', exact: true }),
  ).toHaveCount(1);
});

test('mover cena entre capítulos conserva prosa e referência privada', async ({
  page,
}, testInfo) => {
  let planner = await openBookPlanner(page);
  await createGroup(page, planner, 'Capítulo de origem');
  await createScene(page, planner, 'A carta que viaja');
  await writeScene(
    page,
    planner,
    'A carta que viaja',
    'Uma carta atravessa o oceano e encontra Lia.',
  );
  planner = await returnToBookPlanner(page, 'Capítulo de origem');
  let dialog = await sceneAction(page, planner, 'A carta que viaja', 'Editar planejamento');
  await chooseDropdown(dialog.getByLabel('Lore para vincular'), 'Lia · Livro');
  await dialog.getByRole('button', { name: 'Vincular referência', exact: true }).click();
  const referenceDialog = page.getByRole('dialog', { name: 'Vincular referência', exact: true });
  await referenceDialog.getByRole('button', { name: 'Confirmar referência', exact: true }).click();
  await expect(
    dialog.getByRole('region', { name: 'Referências da cena' }).getByText('Lia', { exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await createGroup(page, planner, 'Capítulo de destino');
  await chooseDropdown(planner.getByLabel('Capítulo', { exact: true }), 'Capítulo de origem');
  dialog = await sceneAction(page, planner, 'A carta que viaja', 'Mover cena');
  await chooseDropdown(dialog.getByLabel('Destino', { exact: true }), 'Capítulo de destino');
  await expect(dialog).toContainText('A cena ativa contribuirá para esse manuscrito');
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'mover-cena-entre-capitulos');
  await dialog.getByRole('button', { name: 'Mover cena', exact: true }).click();
  await expect(planner.getByRole('article')).toHaveCount(0);
  await chooseDropdown(planner.getByLabel('Capítulo', { exact: true }), 'Capítulo de destino');
  await planner.getByRole('link', { name: 'A carta que viaja', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Área de escrita da cena' })).toHaveText(
    'Uma carta atravessa o oceano e encontra Lia.',
  );
  planner = await returnToBookPlanner(page, 'Capítulo de destino');
  dialog = await sceneAction(page, planner, 'A carta que viaja', 'Editar planejamento');
  await expect(
    dialog.getByRole('region', { name: 'Referências da cena' }).getByText('Lia', { exact: true }),
  ).toBeVisible();
});

test('conflito de autosave conserva texto local e exige comparação explícita', async ({
  page,
}, testInfo) => {
  const planner = await openBookPlanner(page);
  await createScene(page, planner, 'Dois caminhos possíveis');
  await planner.getByRole('link', { name: 'Dois caminhos possíveis', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Área de escrita da cena' });
  await expect(editor).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem('writer.visual.scene-conflict', 'true'));
  await editor.fill('Meu texto local continua aqui após o conflito.');
  await expect(page.getByText('Conflito de revisão', { exact: true })).toBeVisible();
  await expect(editor).toHaveText('Meu texto local continua aqui após o conflito.');
  await page.getByRole('button', { name: 'Comparar textos', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Comparar textos da cena', exact: true });
  await expect(dialog).toContainText('Meu texto local continua aqui após o conflito.');
  await expect(dialog).toContainText('Versão remota: outro caminho entre as ilhas.');
  await capture(page, testInfo, 'cena-conflito-comparacao');
  await dialog.getByRole('button', { name: 'Manter meu texto e salvar', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Salvo$/ })).toBeVisible();
  await expect(editor).toHaveText('Meu texto local continua aqui após o conflito.');
});

test('arquivo retira prosa da exportação e restauração devolve a cena ao manuscrito', async ({
  page,
}, testInfo) => {
  let planner = await openBookPlanner(page);
  await createGroup(page, planner, 'Capítulo composto das cartas');
  await createScene(page, planner, 'Título privado do planejamento');
  await writeScene(
    page,
    planner,
    'Título privado do planejamento',
    'PROSA CANÔNICA: uma carta chega ao porto.',
  );
  planner = await returnToBookPlanner(page, 'Capítulo composto das cartas');
  const activeExport = await downloadBook(page);
  expect(activeExport).toContain('PROSA CANÔNICA');
  expect(activeExport).not.toContain('NOTA PRIVADA');
  expect(activeExport).not.toContain('CONFLITO PRIVADO');
  expect(activeExport).not.toContain('Título privado do planejamento');
  const dialog = await sceneAction(
    page,
    planner,
    'Título privado do planejamento',
    'Arquivar cena',
  );
  await expect(dialog).toContainText('sai da composição');
  await dialog.getByRole('button', { name: 'Arquivar cena', exact: true }).click();
  await expect(planner.getByRole('article')).toHaveCount(0);
  expect(await downloadBook(page)).not.toContain('PROSA CANÔNICA');
  await chooseDropdown(planner.getByLabel('Arquivo de cenas'), 'Arquivadas');
  const restore = await sceneAction(
    page,
    planner,
    'Título privado do planejamento',
    'Restaurar cena',
  );
  await restore.getByRole('button', { name: 'Restaurar cena', exact: true }).click();
  await chooseDropdown(planner.getByLabel('Arquivo de cenas'), 'Ativas');
  await expect(
    planner.getByRole('article', { name: 'Cena Título privado do planejamento', exact: true }),
  ).toBeVisible();
  expect(await downloadBook(page)).toContain('PROSA CANÔNICA');
  await capture(page, testInfo, 'cena-restaurada');
});

test('publicação usa prosa composta e não revela notas de planejamento', async ({
  page,
}, testInfo) => {
  let planner = await openBookPlanner(page);
  await createGroup(page, planner, 'Capítulo público de cenas');
  await createScene(page, planner, 'Título confidencial da cena');
  await writeScene(
    page,
    planner,
    'Título confidencial da cena',
    'PROSA PUBLICÁVEL: Lia retorna às ilhas.',
  );
  planner = await returnToBookPlanner(page, 'Capítulo público de cenas');
  await expect(planner.getByRole('article')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Publicação', exact: true }).click();
  await page.getByRole('button', { name: 'Publicar Obra', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Publicar versão da obra', exact: true });
  await dialog.getByLabel('Nome de autor público').fill('Marina de Exemplo');
  await dialog.getByRole('button', { name: 'Confirmar publicação', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.goto(`/read/${FIXTURE_BOOK_ID}`);
  await page
    .getByRole('navigation', { name: 'Sumário' })
    .getByRole('link', { name: 'Capítulo público de cenas', exact: true })
    .click();
  await expect(
    page.getByText('PROSA PUBLICÁVEL: Lia retorna às ilhas.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/NOTA PRIVADA|CONFLITO PRIVADO|Título confidencial/)).toHaveCount(0);
  await capture(page, testInfo, 'publicacao-prosa-composta');
});

test('remover agrupador guarda cena, prosa e aviso de origem em Sem capítulo', async ({
  page,
}, testInfo) => {
  let planner = await openBookPlanner(page);
  await createGroup(page, planner, 'Um capítulo que será removido');
  await createScene(page, planner, 'A cena permanece');
  await writeScene(
    page,
    planner,
    'A cena permanece',
    'O agrupador desaparece, mas esta prosa permanece.',
  );
  planner = await returnToBookPlanner(page, 'Um capítulo que será removido');
  await planner.getByRole('button', { name: 'Remover capítulo', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Remover capítulo', exact: true });
  await expect(dialog).toContainText('sem apagar a prosa');
  await dialog.getByRole('button', { name: 'Remover capítulo', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(planner.getByLabel('Capítulo', { exact: true })).toContainText('Sem capítulo');
  await expect(
    planner.getByRole('article', { name: 'Cena A cena permanece', exact: true }),
  ).toContainText('Agrupador de origem removido');
  await planner.getByRole('link', { name: 'A cena permanece', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Área de escrita da cena' })).toHaveText(
    'O agrupador desaparece, mas esta prosa permanece.',
  );
  await capture(page, testInfo, 'cena-origem-removida');
});

test('rascunho após falha conserva texto e oferece recuperação explícita', async ({
  page,
}, testInfo) => {
  let planner = await openBookPlanner(page);
  await createScene(page, planner, 'A cena ainda não enviada');
  await planner.getByRole('link', { name: 'A cena ainda não enviada', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Área de escrita da cena' });
  await expect(editor).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem('writer.visual.scene-write-error', 'true'));
  await editor.fill('Um rascunho que precisa permanecer até a conexão voltar.');
  await expect(page.getByText('Não confirmado', { exact: true })).toBeVisible();
  await expect(editor).toHaveText('Um rascunho que precisa permanecer até a conexão voltar.');
  await page.getByRole('link', { name: 'Voltar ao planejamento', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Texto ainda não confirmado' })
    .getByRole('button', { name: 'Sair com rascunho', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Cenas', exact: true }).click();
  planner = page.getByRole('region', { name: 'Planejamento de cenas', exact: true });
  await planner.getByRole('link', { name: 'A cena ainda não enviada', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Recuperar rascunho', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Área de escrita da cena' })).toHaveCount(0);
  await capture(page, testInfo, 'cena-recuperacao-explicita');
  await page.evaluate(() => sessionStorage.removeItem('writer.visual.scene-write-error'));
  await page.getByRole('button', { name: 'Recuperar rascunho', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Área de escrita da cena' })).toHaveText(
    'Um rascunho que precisa permanecer até a conexão voltar.',
  );
  await expect(page.getByRole('status').filter({ hasText: /^Salvo$/ })).toBeVisible();
});

test('posição antes de outra cena altera a composição sem usar índice da lista filtrada', async ({
  page,
}, testInfo) => {
  let planner = await openBookPlanner(page);
  await createGroup(page, planner, 'Capítulo da ordem escolhida');
  await createScene(page, planner, 'Primeira cena no planejamento');
  await writeScene(
    page,
    planner,
    'Primeira cena no planejamento',
    'PRIMEIRA PROSA: a chegada ao porto.',
  );
  planner = await returnToBookPlanner(page, 'Capítulo da ordem escolhida');
  await createScene(page, planner, 'Segunda cena no planejamento');
  await writeScene(
    page,
    planner,
    'Segunda cena no planejamento',
    'SEGUNDA PROSA: a partida das ilhas.',
  );
  planner = await returnToBookPlanner(page, 'Capítulo da ordem escolhida');
  const dialog = await sceneAction(page, planner, 'Segunda cena no planejamento', 'Mover cena');
  await chooseDropdown(dialog.getByLabel('Posição', { exact: true }), 'Antes de outra cena');
  await chooseDropdown(
    dialog.getByLabel('Cena de referência da posição'),
    'Primeira cena no planejamento',
  );
  await dialog.getByRole('button', { name: 'Mover cena', exact: true }).click();
  await expect(planner.getByRole('article').getByRole('link')).toHaveText([
    'Segunda cena no planejamento',
    'Primeira cena no planejamento',
  ]);
  const markdown = await downloadBook(page);
  expect(markdown.indexOf('SEGUNDA PROSA')).toBeLessThan(markdown.indexOf('PRIMEIRA PROSA'));
  expect(markdown).not.toContain('NOTA PRIVADA');
  await capture(page, testInfo, 'ordem-escolhida-das-cenas');
});

test('troca de conta oculta prosa e rascunho da sessão anterior', async ({ page }, testInfo) => {
  const planner = await openBookPlanner(page);
  await createScene(page, planner, 'Cena particular da primeira conta');
  await planner
    .getByRole('link', { name: 'Cena particular da primeira conta', exact: true })
    .click();
  const editor = page.getByRole('textbox', { name: 'Área de escrita da cena' });
  await expect(editor).toBeVisible();
  const scenePath = new URL(page.url()).pathname;
  await page.evaluate(() => sessionStorage.setItem('writer.visual.scene-write-error', 'true'));
  await editor.fill('RASCUNHO PARTICULAR da conta original.');
  await expect(page.getByText('Não confirmado', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    sessionStorage.setItem('writer.visual.account', 'second');
    window.dispatchEvent(new Event('writer.visual.auth-change'));
  });
  await expect(page.getByRole('button', { name: /Outro Autor de Exemplo/ })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Área de escrita da cena' })).toHaveCount(0);
  await expect(
    page.getByText('RASCUNHO PARTICULAR da conta original.', { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Recuperar rascunho', exact: true })).toHaveCount(
    0,
  );
  await capture(page, testInfo, 'cena-outra-conta');
  await page.evaluate(() => {
    sessionStorage.removeItem('writer.visual.account');
    window.dispatchEvent(new Event('writer.visual.auth-change'));
  });
  await expect(page.getByRole('button', { name: /Marina de Exemplo/ })).toBeVisible();
  await page.goto(scenePath);
  await expect(page.getByRole('button', { name: 'Recuperar rascunho', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Área de escrita da cena' })).toHaveCount(0);
});

test('referência indisponível conserva identidade sem mostrar o nome antigo', async ({
  page,
}, testInfo) => {
  await page.goto('/universes');
  await page.getByRole('button', { name: 'Criar primeiro universo' }).click();
  await page.getByLabel('Nome do universo').fill('Universo das referências');
  await page.getByLabel('Descrição do universo').fill('Lore compartilhado das cenas.');
  await page.getByRole('button', { name: 'Salvar universo' }).click();
  await page.getByRole('button', { name: 'Abrir lore' }).click();
  await page.getByRole('button', { name: 'Nova Entidade' }).click();
  await page.getByLabel('Nome da Entidade').fill('Guardião das referências');
  await page.getByLabel(/Resumo Curto/).fill('Guarda a identidade compartilhada.');
  await page.getByRole('button', { name: 'Cadastrar Entidade' }).click();
  await page.getByRole('button', { name: 'Universos', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Estúdio', exact: true }).click();
  await page.getByRole('link', { name: /O Atlas das Marés Esquecidas/ }).click();
  await page.getByRole('button', { name: 'Opções do livro', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Editar', exact: true }).click();
  await chooseDropdown(page.getByLabel('Universo compartilhado'), 'Universo das referências');
  await page.getByRole('button', { name: 'Salvar Alterações', exact: true }).click();
  await page.getByRole('tab', { name: 'Cenas', exact: true }).click();
  const planner = page.getByRole('region', { name: 'Planejamento de cenas', exact: true });
  await createScene(page, planner, 'Cena com referência revogada');
  let dialog = await sceneAction(
    page,
    planner,
    'Cena com referência revogada',
    'Editar planejamento',
  );
  await chooseDropdown(
    dialog.getByLabel('Lore para vincular'),
    'Guardião das referências · Universo',
  );
  await dialog.getByRole('button', { name: 'Vincular referência', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Vincular referência', exact: true })
    .getByRole('button', { name: 'Confirmar referência', exact: true })
    .click();
  await expect(
    dialog
      .getByRole('region', { name: 'Referências da cena' })
      .getByText('Guardião das referências', { exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.evaluate(() =>
    sessionStorage.setItem('writer.visual.scene-unavailable-reference', 'true'),
  );
  dialog = await sceneAction(page, planner, 'Cena com referência revogada', 'Editar planejamento');
  const refs = dialog.getByRole('region', { name: 'Referências da cena' });
  await expect(refs.getByText('Referência indisponível', { exact: true })).toBeVisible();
  await expect(refs.getByText('Guardião das referências', { exact: true })).toHaveCount(0);
  await expect(refs.getByRole('button', { name: 'Remover referência indisponível' })).toBeEnabled();
  await capture(page, testInfo, 'cena-referencia-indisponivel');
});

test('reorganização interrompida retoma o pedido original após recarregar', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('writer.visual.scene-pagination', 'true');
    sessionStorage.setItem('writer.visual.scene-job-pages', 'true');
  });
  let planner = await openBookPlanner(page);
  await chooseDropdown(
    planner.getByLabel('Capítulo', { exact: true }),
    'As histórias entre as ilhas',
  );
  await page.evaluate(() =>
    sessionStorage.setItem('writer.visual.scene-job-interrupted', 'rebalance'),
  );
  await planner.getByRole('button', { name: 'Reorganizar posições', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Reorganizar posições', exact: true });
  await dialog.getByRole('button', { name: 'Reorganizar posições', exact: true }).click();
  await expect(
    dialog.getByText('Reorganização interrompida. Retome o mesmo pedido.', { exact: true }),
  ).toBeVisible();
  await capture(page, testInfo, 'cena-reorganizacao-interrompida');
  await page.reload();
  await page.getByRole('tab', { name: 'Cenas', exact: true }).click();
  planner = page.getByRole('region', { name: 'Planejamento de cenas', exact: true });
  await chooseDropdown(
    planner.getByLabel('Capítulo', { exact: true }),
    'As histórias entre as ilhas',
  );
  await expect(planner.getByRole('button', { name: 'Nova cena', exact: true })).toBeDisabled();
  await expect(planner.getByRole('article').getByRole('link').first()).toHaveText(
    'Cena das ilhas 1',
  );
  await planner.getByRole('button', { name: 'Retomar reorganização', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Reorganizar posições', exact: true });
  await expect(dialog.getByRole('status')).toContainText('50 itens processados');
  await dialog.getByRole('button', { name: 'Reorganizar posições', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(planner.getByRole('button', { name: 'Nova cena', exact: true })).toBeEnabled();
  await expect(planner.getByRole('article').getByRole('link').first()).toHaveText(
    'Cena das ilhas 1',
  );
  await capture(page, testInfo, 'cena-reorganizacao-retomada');
});
