import type { Locator, Page } from '@playwright/test';
import { FIXTURE_BOOK_ID, FIXTURE_CHAPTER_ID } from './fixtures/data';
import {
  capture,
  expect,
  expectDialogWithinViewport,
  expectNoHorizontalOverflow,
  test,
} from './support';

const bookPath = `/books/${FIXTURE_BOOK_ID}`;
const editorPath = `${bookPath}/editor/${FIXTURE_CHAPTER_ID}`;
const firstText = 'A cartógrafa encontra o mapa sob a luz da lua.';
const secondText = 'As lanternas iluminam outro caminho entre as ilhas.';
async function flag(page: Page, key: string, value: string) {
  await page.evaluate(({ key, value }) => sessionStorage.setItem(key, value), { key, value });
}
async function write(page: Page, editor: Locator, value: string) {
  await editor.fill(value);
  await expect(page.getByText('Salvo', { exact: true })).toBeVisible();
}
async function history(page: Page, kind: 'chapter' | 'scene' | 'book' = 'chapter') {
  if (kind === 'chapter') {
    await page.getByRole('button', { name: 'Opções do capítulo', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Histórico do texto', exact: true }).click();
  } else if (kind === 'book') {
    await page.getByRole('button', { name: 'Opções do livro', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Histórico do texto', exact: true }).click();
  } else await page.getByRole('button', { name: 'Histórico do texto', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Histórico do texto', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}
async function createVersion(dialog: Locator, label: string) {
  await dialog.getByLabel('Nome da versão (opcional)', { exact: true }).fill(label);
  await expect(dialog.getByRole('button', { name: 'Criar versão', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Criar versão', exact: true }).click();
  await expect(
    dialog.getByText('Versão guardada. O texto do manuscrito permanece igual.', { exact: true }),
  ).toBeVisible();
}
async function selectVersion(dialog: Locator, label: string) {
  await dialog
    .getByRole('region', { name: 'Versões guardadas', exact: true })
    .getByRole('button', { name: new RegExp('^' + label) })
    .click();
  await expect(
    dialog.getByRole('region', { name: 'Texto da versão guardada', exact: true }),
  ).toBeVisible();
}
async function restore(dialog: Locator) {
  await dialog.getByRole('button', { name: 'Restaurar esta versão', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirmar restauração', exact: true }).click();
}
async function openChapter(page: Page) {
  await page.goto(editorPath);
  const editor = page.getByRole('textbox', { name: 'Área de escrita do capítulo', exact: true });
  await expect(editor).toBeVisible();
  return editor;
}

test('autor guarda e restaura texto com cópia anterior, undo próprio e sem versões de autosave', async ({
  page,
}, testInfo) => {
  const editor = await openChapter(page);
  await write(page, editor, firstText);
  let dialog = await history(page);
  await createVersion(dialog, 'Ponto da lua');
  await dialog.getByRole('button', { name: 'Fechar histórico', exact: true }).click();
  await write(page, editor, secondText);
  dialog = await history(page);
  await selectVersion(dialog, 'Ponto da lua');
  await expect(
    dialog.getByRole('region', { name: 'Texto atual confirmado', exact: true }),
  ).toContainText(secondText);
  await restore(dialog);
  await expect(
    dialog.getByText('Texto restaurado. A versão anterior foi guardada para recuperação.', {
      exact: true,
    }),
  ).toBeVisible();
  await selectVersion(dialog, 'Antes da restauração');
  await expect(
    dialog.getByRole('region', { name: 'Texto da versão guardada', exact: true }),
  ).toContainText(secondText);
  await dialog.getByRole('button', { name: 'Fechar histórico', exact: true }).click();
  await expect(editor).toHaveText(firstText);
  await editor.focus();
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveText(secondText);
  await expect(page.getByText('Salvo', { exact: true })).toBeVisible();
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toHaveText(firstText);
  await expect(page.getByText('Salvo', { exact: true })).toBeVisible();
  await page.goto(bookPath);
  await page.goto(editorPath);
  await expect(
    page.getByRole('textbox', { name: 'Área de escrita do capítulo', exact: true }),
  ).toHaveText(firstText);
  dialog = await history(page);
  await expect(
    dialog.getByRole('region', { name: 'Versões guardadas', exact: true }).getByRole('listitem'),
  ).toHaveCount(2);
  await capture(page, testInfo, 'historico-autor-copia-anterior');
});

test('mestre restaura cena sem alterar planejamento e a próxima edição usa a revisão confirmada', async ({
  page,
}, testInfo) => {
  await page.goto('/adventures/visual-adventure-1');
  const planner = page.getByRole('region', { name: 'Planejamento de cenas', exact: true });
  await planner.getByRole('button', { name: 'Nova cena', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Nova cena', exact: true });
  await dialog.getByLabel('Título da cena').fill('Encontro da cartógrafa');
  await dialog
    .getByLabel('Objetivo', { exact: true })
    .fill('NOTA PRIVADA: conservar o segredo do mapa.');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await planner.getByRole('link', { name: 'Encontro da cartógrafa', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Área de escrita da cena', exact: true });
  await write(page, editor, firstText);
  dialog = await history(page, 'scene');
  await createVersion(dialog, 'Antes do encontro');
  await dialog.getByRole('button', { name: 'Fechar histórico', exact: true }).click();
  await write(page, editor, secondText);
  dialog = await history(page, 'scene');
  await selectVersion(dialog, 'Antes do encontro');
  await restore(dialog);
  await expect(
    dialog.getByText('Texto restaurado. A versão anterior foi guardada para recuperação.', {
      exact: true,
    }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Fechar histórico', exact: true }).click();
  await expect(editor).toHaveText(firstText);
  await write(page, editor, 'A cartógrafa aceita ajudar a expedição.');
  await page.reload();
  await expect(
    page.getByRole('textbox', { name: 'Área de escrita da cena', exact: true }),
  ).toHaveText('A cartógrafa aceita ajudar a expedição.');
  await page.getByRole('link', { name: 'Voltar ao planejamento', exact: true }).click();
  await planner
    .getByRole('button', { name: 'Ações da cena Encontro da cartógrafa', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Editar planejamento', exact: true }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Editar planejamento', exact: true })
      .getByLabel('Objetivo', { exact: true }),
  ).toHaveValue('NOTA PRIVADA: conservar o segredo do mapa.');
  await capture(page, testInfo, 'historico-mestre-planejamento-preservado');
});

test('resposta perdida mantém bloqueio após fechar e confirma a mesma restauração uma única vez', async ({
  page,
}) => {
  const editor = await openChapter(page);
  await write(page, editor, firstText);
  let dialog = await history(page);
  await createVersion(dialog, 'Versão segura');
  await dialog.getByRole('button', { name: 'Fechar histórico', exact: true }).click();
  await write(page, editor, secondText);
  dialog = await history(page);
  await selectVersion(dialog, 'Versão segura');
  await flag(page, 'writer.visual.history-lost-response', 'restore');
  await restore(dialog);
  await expect(
    dialog.getByRole('button', { name: 'Confirmar operação pendente', exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Fechar histórico', exact: true }).click();
  await expect(editor).toHaveAttribute('contenteditable', 'false');
  dialog = await history(page);
  await dialog.getByRole('button', { name: 'Confirmar operação pendente', exact: true }).click();
  await expect(
    dialog.getByText('Texto restaurado. A versão anterior foi guardada para recuperação.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('region', { name: 'Versões guardadas', exact: true }).getByRole('listitem'),
  ).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Fechar histórico', exact: true }).click();
  await expect(editor).toHaveText(firstText);
  await expect(editor).toHaveAttribute('contenteditable', 'true');
});

test('mudança remota exige comparação e preserva o texto local sem criar cópia de restauração', async ({
  page,
}) => {
  const editor = await openChapter(page);
  await write(page, editor, firstText);
  const dialog = await history(page);
  await createVersion(dialog, 'Estado observado');
  await selectVersion(dialog, 'Estado observado');
  await page.evaluate(
    async ({ bookId, chapterId, text }) => {
      const path = '/e2e/visual/fixtures/bookService.ts';
      const fixture = (await import(path)) as {
        fixtureReadChapters: (id: string) => { id: string; updatedAt: number }[];
        fixtureWriteChapter: (chapter: unknown) => void;
      };
      const current = fixture.fixtureReadChapters(bookId).find((item) => item.id === chapterId)!;
      fixture.fixtureWriteChapter({
        ...current,
        content: '<p>' + text + '</p>',
        updatedAt: current.updatedAt + 1,
        wordCount: 9,
      });
    },
    { bookId: FIXTURE_BOOK_ID, chapterId: FIXTURE_CHAPTER_ID, text: secondText },
  );
  await restore(dialog);
  await expect(
    dialog.getByRole('button', { name: 'Atualizar comparação', exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Atualizar comparação', exact: true }).click();
  await expect(
    dialog.getByRole('region', { name: 'Texto atual confirmado', exact: true }),
  ).toContainText(secondText);
  await expect(
    dialog.getByRole('button', { name: 'Restaurar esta versão', exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole('region', { name: 'Versões guardadas', exact: true }).getByRole('listitem'),
  ).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Fechar histórico', exact: true }).click();
  await expect(editor).toHaveText(firstText);
});

test('histórico do projeto pagina sem duplicar e permite consultar e excluir origem removida em 320px', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('writer.visual.history-pages', 'true');
    sessionStorage.setItem('writer.visual.history-orphan', 'true');
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(bookPath);
  const dialog = await history(page, 'book');
  const versions = dialog.getByRole('region', { name: 'Versões guardadas', exact: true });
  await expect(versions.getByRole('listitem')).toHaveCount(25);
  await dialog.getByRole('button', { name: 'Carregar mais versões', exact: true }).click();
  await expect(versions.getByRole('listitem')).toHaveCount(29);
  await selectVersion(dialog, 'Capítulo removido');
  await expect(dialog.getByText(/A origem desta versão não está disponível/)).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Restaurar esta versão', exact: true }),
  ).toBeDisabled();
  await expectDialogWithinViewport(page);
  await expectNoHorizontalOverflow(page, 'Histórico de origem removida');
  await capture(page, testInfo, 'historico-origem-removida-320');
  await dialog.getByRole('button', { name: 'Excluir esta versão', exact: true }).click();
  await dialog.getByRole('button', { name: 'Cancelar exclusão', exact: true }).click();
  await expect(versions.getByRole('listitem')).toHaveCount(29);
  await dialog.getByRole('button', { name: 'Excluir esta versão', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirmar exclusão da versão', exact: true }).click();
  await expect(dialog.getByText('Versão excluída.', { exact: true })).toBeVisible();
  await expect(versions.getByRole('listitem')).toHaveCount(28);
});

test('comparação em 320px navega por teclado e cancelamento conserva o manuscrito', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const editor = await openChapter(page);
  await write(page, editor, firstText);
  const dialog = await history(page);
  await createVersion(dialog, 'Memória da lua');
  await selectVersion(dialog, 'Memória da lua');
  const restoreButton = dialog.getByRole('button', { name: 'Restaurar esta versão', exact: true });
  await restoreButton.focus();
  await page.keyboard.press('Enter');
  await dialog.getByRole('button', { name: 'Cancelar restauração', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Confirmar restauração', exact: true }),
  ).toHaveCount(0);
  await expectDialogWithinViewport(page);
  await expectNoHorizontalOverflow(page, 'Comparação do histórico');
  await capture(page, testInfo, 'historico-comparacao-teclado-320');
  await dialog.getByRole('button', { name: 'Fechar histórico', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(editor).toHaveText(firstText);
});
