import type { Locator, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { countVisibleWords } from '../../functions/src/visibleWordCount.mjs';
import { chooseDropdown } from '../dropdown';
import { books, chapters, FIXTURE_BOOK_ID, FIXTURE_CHAPTER_ID } from './fixtures/data';
import {
  capture,
  expect,
  expectDialogWithinViewport,
  expectNoHorizontalOverflow,
  test,
} from './support';

const bookPath = `/books/${FIXTURE_BOOK_ID}`;
const adventurePath = '/adventures/visual-adventure-1';
const campaignPath = '/campaigns/visual-campaign-1';
const initialWords = chapters
  .filter((c) => c.bookId === FIXTURE_BOOK_ID)
  .reduce((sum, c) => sum + countVisibleWords(c.content), 0);
async function flags(page: Page, entries: Record<string, string>) {
  await page.addInitScript((values) => {
    for (const [key, value] of Object.entries(values))
      if (!sessionStorage.getItem(key + ':installed')) {
        sessionStorage.setItem(key, value);
        sessionStorage.setItem(key + ':installed', 'true');
      }
  }, entries);
}
async function flag(page: Page, key: string, value: string) {
  await page.evaluate(({ key, value }) => sessionStorage.setItem(key, value), { key, value });
}
async function progress(page: Page, path = bookPath) {
  await page.goto(path + (path === campaignPath ? '' : '?tab=progress'));
  const panel = page.getByRole('region', {
    name: path === campaignPath ? 'Preparação do projeto' : 'Progresso do projeto',
    exact: true,
  });
  await expect(panel).toBeVisible();
  return panel;
}
async function prepare(panel: Locator) {
  await panel.getByRole('button', { name: /^(Verificar contagem|Retomar verificação)$/ }).click();
  await expect(panel.getByText(/palavras confirmadas$/)).toBeVisible();
}
async function saveGoal(panel: Locator, value: string) {
  await panel.getByLabel('Meta total de palavras').fill(value);
  await panel.getByRole('button', { name: 'Salvar progresso', exact: true }).click();
  await expect(panel.getByText('Progresso salvo.', { exact: true })).toBeVisible();
}
async function studio(page: Page) {
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button').click();
  await page.getByRole('menuitem', { name: 'Estúdio', exact: true }).click();
  const region = page.getByRole('region', { name: 'Continuar meu trabalho', exact: true });
  await expect(region).toBeVisible();
  return region;
}
async function sceneAction(page: Page, planner: Locator, title: string, action: string) {
  await planner.getByRole('button', { name: `Ações da cena ${title}`, exact: true }).click();
  await page.getByRole('menuitem', { name: action, exact: true }).click();
  return page.getByRole('dialog', { name: action, exact: true });
}

test('contador canônico coincide com o texto visível nativo em todo o corpus', async ({ page }) => {
  const corpus = JSON.parse(
    await readFile(
      new URL('../../functions/test/fixtures/visible-prose.json', import.meta.url),
      'utf8',
    ),
  ) as { id: string; content: string; wordCount: number }[];
  await page.goto('/studio');
  const native = await page.evaluate(async (entries) => {
    const modulePath = '/src/features/books/model/chapter.ts';
    const { countWords } = (await import(modulePath)) as {
      countWords: (content: string) => number;
    };
    return entries.map((entry) => ({ id: entry.id, count: countWords(entry.content) }));
  }, corpus);
  expect(native).toEqual(corpus.map((entry) => ({ id: entry.id, count: entry.wordCount })));
  expect(native).toEqual(
    corpus.map((entry) => ({ id: entry.id, count: countVisibleWords(entry.content) })),
  );
});

test('autor valida meta, separa estado editorial da publicação e limita a barra em 320px', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const panel = await progress(page);
  await expect(
    panel.getByText('O total ainda precisa ser verificado.', { exact: true }),
  ).toBeVisible();
  for (const invalid of ['0', '1.5', '9007199254740992']) {
    await panel.getByLabel('Meta total de palavras').fill(invalid);
    await panel.getByRole('button', { name: 'Salvar progresso', exact: true }).click();
    await expect(
      panel.getByText('Informe um número inteiro positivo de palavras.', { exact: true }),
    ).toBeVisible();
  }
  await chooseDropdown(panel.getByLabel('Estado editorial'), 'Pronto');
  await saveGoal(panel, '1');
  await expect(page.getByText('Não publicado', { exact: true })).toBeVisible();
  await prepare(panel);
  await expect(
    panel.getByText(`${initialWords.toLocaleString('pt-BR')} de 1 palavras confirmadas`, {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    panel.getByRole('progressbar', { name: 'Progresso da meta de palavras' }),
  ).toHaveAttribute('value', '1');
  await expect(panel.getByText('Meta atingida', { exact: true })).toBeVisible();
  await expect(
    page.getByText(initialWords.toLocaleString('pt-BR') + ' palavras', { exact: true }),
  ).toBeVisible();
  await panel.getByLabel('Estado editorial').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('option', { name: 'Em revisão', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await capture(page, testInfo, 'progresso-meta-320');
  await saveGoal(panel, '');
  await expect(panel.getByRole('progressbar')).toHaveCount(0);
  await expect(
    panel.getByText('Nenhuma meta definida. Você pode continuar escrevendo.', { exact: true }),
  ).toBeVisible();
});

test('verificação interrompida preserva checkpoint e permite escrever antes de retomar', async ({
  page,
}, testInfo) => {
  await flags(page, {
    'writer.visual.work-prepare-pages': 'true',
    'writer.visual.work-prepare-interrupted': 'true',
  });
  let panel = await progress(page);
  await panel.getByRole('button', { name: 'Verificar contagem', exact: true }).click();
  await expect(panel.getByText('25 fontes verificadas', { exact: true })).toBeVisible();
  await expect(panel.getByText(/Verificação interrompida/)).toBeVisible();
  await expect(panel.getByText(/palavras confirmadas$/)).toHaveCount(0);
  await page.reload();
  panel = page.getByRole('region', { name: 'Progresso do projeto', exact: true });
  await expect(panel.getByText('25 fontes verificadas', { exact: true })).toBeVisible();
  await capture(page, testInfo, 'contagem-checkpoint-pendente');
  await page.goto(`${bookPath}/editor/${FIXTURE_CHAPTER_ID}`);
  await page
    .getByRole('textbox', { name: 'Área de escrita do capítulo' })
    .fill('A lua anuncia outra jornada.');
  await expect(page.getByText('Salvo', { exact: true })).toBeVisible();
  panel = await progress(page);
  await prepare(panel);
  const expected =
    initialWords -
    countVisibleWords(chapters.find((c) => c.id === FIXTURE_CHAPTER_ID)!.content) +
    countVisibleWords('A lua anuncia outra jornada.') +
    28 * countVisibleWords('<p>Lua <strong>cheia</strong> do capítulo 1.</p>');
  await expect(
    panel.getByText(`${expected.toLocaleString('pt-BR')} palavras confirmadas`, { exact: true }),
  ).toBeVisible();
});

test('conflito de progresso compara a versão atual e preserva o preenchimento local', async ({
  page,
}) => {
  const panel = await progress(page);
  await panel.getByLabel('Meta total de palavras').fill('123');
  await chooseDropdown(panel.getByLabel('Estado editorial'), 'Pronto');
  await flag(page, 'writer.visual.work-conflict', 'progress');
  await panel.getByRole('button', { name: 'Salvar progresso', exact: true }).click();
  await panel.getByRole('button', { name: 'Comparar versão atual', exact: true }).click();
  await expect(panel.getByText(/Versão atual: Em revisão; meta 700/)).toBeVisible();
  await expect(panel.getByLabel('Meta total de palavras')).toHaveValue('123');
  await expect(panel.getByLabel('Estado editorial')).toContainText('Pronto');
  await panel.getByRole('button', { name: 'Salvar progresso', exact: true }).click();
  await expect(panel.getByText('Progresso salvo.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Meta total de palavras')).toHaveValue('123');
});

test('resposta perdida confirma a mesma alteração sem liberar campos incertos', async ({
  page,
}) => {
  const panel = await progress(page);
  await panel.getByLabel('Meta total de palavras').fill('321');
  await flag(page, 'writer.visual.work-lost-response', 'updateWorkProgress');
  await panel.getByRole('button', { name: 'Salvar progresso', exact: true }).click();
  await expect(panel.getByLabel('Meta total de palavras')).toBeDisabled();
  await expect(panel.getByLabel('Estado editorial')).toBeDisabled();
  await panel.getByRole('button', { name: 'Confirmar progresso novamente', exact: true }).click();
  await expect(panel.getByText('Progresso salvo.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Meta total de palavras')).toHaveValue('321');
});

test('aventura conta apenas cena agrupada, exclui notas e acompanha arquivo e restauração', async ({
  page,
}) => {
  await page.goto(adventurePath);
  const planner = page.getByRole('region', { name: 'Planejamento de cenas', exact: true });
  await chooseDropdown(planner.getByLabel('Parte', { exact: true }), 'Sem parte');
  await planner.getByRole('button', { name: 'Nova cena', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Nova cena', exact: true });
  await dialog.getByLabel('Título da cena').fill('Cena fora da parte');
  await dialog
    .getByLabel('Objetivo', { exact: true })
    .fill('Estas notas privadas nunca integram o manuscrito confirmado.');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await planner.getByRole('link', { name: 'Cena fora da parte', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Área de escrita da cena' })
    .fill('O farol ilumina as ilhas.');
  await expect(page.getByRole('status').filter({ hasText: /^Salvo$/ })).toBeVisible();
  let panel = await progress(page, adventurePath);
  await prepare(panel);
  await expect(panel.getByText('0 palavras confirmadas', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Cenas', exact: true }).click();
  await planner.getByRole('button', { name: 'Nova parte', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Nova parte', exact: true });
  await dialog.getByLabel('Título da parte').fill('Parte do farol');
  await dialog.getByRole('button', { name: 'Nova parte', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await chooseDropdown(planner.getByLabel('Parte', { exact: true }), 'Sem parte');
  dialog = await sceneAction(page, planner, 'Cena fora da parte', 'Mover cena');
  await chooseDropdown(dialog.getByLabel('Destino'), 'Parte do farol');
  await dialog.getByRole('button', { name: 'Mover cena', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  panel = await progress(page, adventurePath);
  await expect(panel.getByText('5 palavras confirmadas', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Cenas', exact: true }).click();
  await chooseDropdown(planner.getByLabel('Parte', { exact: true }), 'Parte do farol');
  dialog = await sceneAction(page, planner, 'Cena fora da parte', 'Arquivar cena');
  await dialog.getByRole('button', { name: 'Arquivar cena', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  panel = await progress(page, adventurePath);
  await expect(panel.getByText('0 palavras confirmadas', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Cenas', exact: true }).click();
  await chooseDropdown(planner.getByLabel('Parte', { exact: true }), 'Parte do farol');
  await chooseDropdown(planner.getByLabel('Arquivo de cenas'), 'Arquivadas');
  dialog = await sceneAction(page, planner, 'Cena fora da parte', 'Restaurar cena');
  await dialog.getByRole('button', { name: 'Restaurar cena', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  panel = await progress(page, adventurePath);
  await expect(panel.getByText('5 palavras confirmadas', { exact: true })).toBeVisible();
});

test('converter capítulo conserva total e não soma a fonte preservada', async ({ page }) => {
  let panel = await progress(page);
  await prepare(panel);
  await expect(
    panel.getByText(`${initialWords.toLocaleString('pt-BR')} palavras confirmadas`, {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Cenas', exact: true }).click();
  const planner = page.getByRole('region', { name: 'Planejamento de cenas', exact: true });
  await chooseDropdown(
    planner.getByLabel('Capítulo', { exact: true }),
    `${chapters[0].title} · legado`,
  );
  await planner.getByRole('button', { name: 'Converter em cenas', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Converter em cenas', exact: true });
  await dialog.getByRole('button', { name: 'Converter em cenas', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  panel = await progress(page);
  await expect(
    panel.getByText(`${initialWords.toLocaleString('pt-BR')} palavras confirmadas`, {
      exact: true,
    }),
  ).toBeVisible();
});

test('mestre prepara campanha com checklist completo por teclado em 320px', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const panel = await progress(page, campaignPath);
  await expect(panel.getByLabel('Meta total de palavras')).toHaveCount(0);
  await expect(panel.getByLabel('Estado editorial')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Adicionar tarefa', exact: true }).focus();
  await page.keyboard.press('Enter');
  let dialog = page.getByRole('dialog', { name: 'Nova tarefa de preparação', exact: true });
  await dialog.getByLabel('Título da tarefa').fill('Preparar mapas da sessão');
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'checklist-formulario-320');
  await dialog.getByRole('button', { name: 'Salvar tarefa', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await panel
    .getByRole('button', { name: 'Concluir tarefa Preparar mapas da sessão', exact: true })
    .click();
  await expect(panel.getByText('1 de 1 tarefas concluídas', { exact: true })).toBeVisible();
  await panel
    .getByRole('button', { name: 'Reabrir tarefa Preparar mapas da sessão', exact: true })
    .click();
  await panel
    .getByRole('button', { name: 'Editar tarefa Preparar mapas da sessão', exact: true })
    .click();
  dialog = page.getByRole('dialog', { name: 'Editar tarefa', exact: true });
  await dialog.getByLabel('Título da tarefa').fill('Mapas e consequências');
  await dialog.getByRole('button', { name: 'Salvar tarefa', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await capture(page, testInfo, 'checklist-campanha-320');
  await panel
    .getByRole('button', { name: 'Remover tarefa Mapas e consequências', exact: true })
    .click();
  dialog = page.getByRole('dialog', { name: 'Remover tarefa', exact: true });
  await dialog.getByRole('button', { name: 'Remover tarefa', exact: true }).click();
  await expect(panel.getByText('0 de 0 tarefas concluídas', { exact: true })).toBeVisible();
});

test('checklist paginado conserva totais globais, página anterior e filtros após falha', async ({
  page,
}) => {
  await flags(page, { 'writer.visual.work-checklist-pages': 'true' });
  const panel = await progress(page, adventurePath);
  await expect(panel.getByRole('listitem')).toHaveCount(25);
  await expect(panel.getByText('14 de 28 tarefas concluídas', { exact: true })).toBeVisible();
  await flag(page, 'writer.visual.work-list-error', 'checklist');
  await panel.getByRole('button', { name: 'Carregar mais tarefas', exact: true }).click();
  await expect(panel.getByRole('listitem')).toHaveCount(25);
  await panel
    .getByRole('button', { name: 'Tentar carregar tarefas novamente', exact: true })
    .click();
  await expect(panel.getByRole('listitem')).toHaveCount(28);
  await chooseDropdown(panel.getByLabel('Mostrar tarefas'), 'Concluídas');
  await expect(panel.getByRole('listitem')).toHaveCount(14);
  await chooseDropdown(panel.getByLabel('Mostrar tarefas'), 'Pendentes');
  await expect(panel.getByRole('listitem')).toHaveCount(14);
  await expect(panel.getByText('14 de 28 tarefas concluídas', { exact: true })).toBeVisible();
});

test('checklist resolve resposta perdida e conflito sem duplicar ou apagar título local', async ({
  page,
}) => {
  const panel = await progress(page, campaignPath);
  await panel.getByRole('button', { name: 'Adicionar tarefa', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Nova tarefa de preparação', exact: true });
  await dialog.getByLabel('Título da tarefa').fill('Revisar encontro');
  await flag(page, 'writer.visual.work-lost-response', 'createWorkChecklistItem');
  await dialog.getByRole('button', { name: 'Salvar tarefa', exact: true }).click();
  await expect(dialog.getByLabel('Título da tarefa')).toBeDisabled();
  await dialog.getByRole('button', { name: 'Confirmar operação novamente', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(panel.getByRole('listitem')).toHaveCount(1);
  await panel.getByRole('button', { name: 'Editar tarefa Revisar encontro', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Editar tarefa', exact: true });
  await dialog.getByLabel('Título da tarefa').fill('Meu encontro revisado');
  await flag(page, 'writer.visual.work-conflict', 'checklist');
  await dialog.getByRole('button', { name: 'Salvar tarefa', exact: true }).click();
  await dialog.getByRole('button', { name: 'Conferir versão atual', exact: true }).click();
  await expect(dialog.getByText(/Versão atual: Título atualizado em outra aba/)).toBeVisible();
  await expect(dialog.getByLabel('Título da tarefa')).toHaveValue('Meu encontro revisado');
  await dialog.getByRole('button', { name: 'Salvar tarefa', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(panel.getByRole('listitem')).toHaveCount(1);
  await expect(panel.getByText('Meu encontro revisado', { exact: true })).toBeVisible();
});

test('retomada reautoriza capítulo e usa aviso genérico para recurso removido e projeto revogado', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(`${bookPath}/editor/${FIXTURE_CHAPTER_ID}`);
  await expect(page.getByRole('textbox', { name: 'Área de escrita do capítulo' })).toBeVisible();
  let region = await studio(page);
  await capture(page, testInfo, 'retomada-capitulo-320');
  await region.getByRole('button', { name: 'Continuar capítulo', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/editor/${FIXTURE_CHAPTER_ID}$`));
  region = await studio(page);
  await flag(page, 'writer.visual.work-missing-resource', 'chapter');
  await region.getByRole('button', { name: 'Continuar capítulo', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${bookPath}\\?tab=progress$`));
  await expect(
    page.getByText('O recurso anterior está indisponível. Você pode continuar pelo projeto.', {
      exact: true,
    }),
  ).toBeVisible();
  await capture(page, testInfo, 'retomada-recurso-indisponivel-320');
  region = await studio(page);
  await flag(page, 'writer.visual.work-revoked-target', `book:${FIXTURE_BOOK_ID}`);
  await region.getByRole('button', { name: 'Continuar projeto', exact: true }).click();
  await expect(
    region.getByText('Este projeto não está mais disponível para sua conta.', { exact: true }),
  ).toBeVisible();
  await expect(region.getByRole('heading', { name: books[0].title, exact: true })).toHaveCount(0);
});

test('falha no registro de atividade mantém autosave e permite registrar retomada depois', async ({
  page,
}) => {
  await flags(page, { 'writer.visual.work-activity-error': 'true' });
  await page.goto(`${bookPath}/editor/${FIXTURE_CHAPTER_ID}`);
  await expect(page.getByText('Retomada não atualizada', { exact: true })).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Área de escrita do capítulo' })
    .fill('Texto salvo apesar da falha de retomada.');
  await expect(page.getByText('Salvo', { exact: true })).toBeVisible();
  await page.evaluate(() => sessionStorage.removeItem('writer.visual.work-activity-error'));
  await page.getByRole('button', { name: 'Tentar registrar novamente', exact: true }).click();
  await expect(page.getByText('Retomada não atualizada', { exact: true })).toHaveCount(0);
  const region = await studio(page);
  await region.getByRole('button', { name: 'Continuar capítulo', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Área de escrita do capítulo' })).toHaveText(
    'Texto salvo apesar da falha de retomada.',
  );
});

test('troca de conta ignora resultado tardio e mantém progresso privado por UID', async ({
  page,
}) => {
  const panel = await progress(page);
  await panel.getByLabel('Meta total de palavras').fill('987');
  await flag(page, 'writer.visual.work-delay', 'updateWorkProgress');
  await panel.getByRole('button', { name: 'Salvar progresso', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Salvando…', exact: true })).toBeVisible();
  await page.evaluate(() => {
    sessionStorage.setItem('writer.visual.account', 'second');
    window.dispatchEvent(new Event('writer.visual.auth-change'));
  });
  await expect(page.getByRole('button', { name: /Outro Autor de Exemplo/ })).toBeVisible();
  await page.evaluate(() => {
    sessionStorage.removeItem('writer.visual.work-delay');
    window.dispatchEvent(new Event('writer.visual.work-release'));
  });
  await expect(page.getByLabel('Meta total de palavras')).toHaveCount(0);
  await page.goto('/studio');
  const region = page.getByRole('region', { name: 'Continuar meu trabalho', exact: true });
  await expect(region.getByRole('heading', { name: books[0].title, exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    sessionStorage.removeItem('writer.visual.account');
    window.dispatchEvent(new Event('writer.visual.auth-change'));
  });
  await expect(page.getByRole('button', { name: /Marina de Exemplo/ })).toBeVisible();
  await progress(page);
  await expect(page.getByLabel('Meta total de palavras')).toHaveValue('987');
});

test('preferência existente vence inicialização de outro dispositivo e meta não reinicia no dia seguinte', async ({
  page,
}, testInfo) => {
  await flags(page, { 'writer.visual.work-preference-race': 'true' });
  const panel = await progress(page);
  const zone = panel.getByRole('region', { name: 'Fuso horário', exact: true });
  await expect(zone.getByLabel('Fuso horário')).toContainText('Europe/Lisbon');
  await saveGoal(panel, '432');
  await chooseDropdown(zone.getByLabel('Fuso horário'), 'Europe/Paris');
  await zone.getByRole('button', { name: 'Salvar fuso', exact: true }).click();
  await expect(zone.getByText('Fuso horário salvo.', { exact: true })).toBeVisible();
  await page.clock.setSystemTime(new Date('2026-09-19T14:30:00Z'));
  await page.reload();
  await expect(page.getByLabel('Meta total de palavras')).toHaveValue('432');
  await expect(page.getByRole('combobox', { name: 'Fuso horário', exact: true })).toContainText(
    'Europe/Paris',
  );
  await page.setViewportSize({ width: 320, height: 844 });
  await expectNoHorizontalOverflow(page, 'fuso-progresso-320');
  await capture(page, testInfo, 'fuso-progresso-320');
});

test('retomada pagina sem duplicar projetos e filtra apenas o tipo solicitado', async ({
  page,
}) => {
  await flags(page, { 'writer.visual.work-resume-pages': 'true' });
  await page.goto('/studio');
  const region = page.getByRole('region', { name: 'Continuar meu trabalho', exact: true });
  await expect(region.getByRole('heading', { level: 3 })).toHaveCount(25);
  await region
    .getByRole('button', { name: 'Carregar mais projetos recentes', exact: true })
    .click();
  await expect(region.getByRole('heading', { level: 3 })).toHaveCount(28);
  await expect(
    region.getByRole('heading', { name: 'Projeto recente 28', exact: true }),
  ).toBeVisible();
  await chooseDropdown(region.getByLabel('Retomar tipo de projeto'), 'Aventuras');
  await expect(region.getByText('Nenhum trabalho recente', { exact: true })).toBeVisible();
  await chooseDropdown(region.getByLabel('Retomar tipo de projeto'), 'Livros');
  await expect(region.getByRole('heading', { level: 3 })).toHaveCount(25);
  await region
    .getByRole('button', { name: 'Carregar mais projetos recentes', exact: true })
    .click();
  await expect(region.getByRole('heading', { level: 3 })).toHaveCount(28);
});
