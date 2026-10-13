import type { Locator, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { chooseDropdown } from '../dropdown';
import { FIXTURE_BOOK_ID } from './fixtures/data';
import {
  capture,
  expect,
  expectDialogWithinViewport,
  expectNoHorizontalOverflow,
  test,
} from './support';

type Kind = 'arco' | 'evento' | 'marco';
const bookPath = `/books/${FIXTURE_BOOK_ID}`;
const adventurePath = '/adventures/visual-adventure-1';
const privateObjective = 'OBJETIVO PRIVADO: a cartógrafa encontra o farol.';
const privateNotes = 'NOTAS PRIVADAS: a tempestade foi provocada pelo guardião.';

async function openPlanner(page: Page, path = bookPath) {
  await page.goto(`${path}?tab=narrative`);
  await expect(page.getByRole('tab', { name: 'Arcos e cronologia', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const planner = page.getByRole('region', { name: 'Arcos e cronologia', exact: true });
  await expect(planner.getByRole('navigation', { name: 'Visões do planejamento' })).toBeVisible();
  return planner;
}
async function view(planner: Locator, name: 'Arcos' | 'Cronologia' | 'Entidades') {
  await planner
    .getByRole('navigation', { name: 'Visões do planejamento' })
    .getByRole('button', { name, exact: true })
    .click();
}
function sequence(planner: Locator, kind: Kind) {
  return planner.getByRole('region', {
    name: { arco: 'Arcos', evento: 'Cronologia', marco: 'Marcos' }[kind],
    exact: true,
  });
}
function row(planner: Locator, kind: Kind, title: string) {
  return sequence(planner, kind)
    .getByRole('listitem')
    .filter({
      has: planner.page().getByText(title, { exact: true }),
    });
}
function detail(page: Page) {
  return page.getByRole('region', { name: 'Detalhes do planejamento', exact: true });
}
async function create(page: Page, planner: Locator, kind: Kind, title: string, date?: string) {
  await sequence(planner, kind)
    .getByRole('button', { name: `Novo ${kind}`, exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: `Novo ${kind}`, exact: true });
  await dialog.getByLabel('Título', { exact: true }).fill(title);
  if (kind === 'arco') {
    await dialog.getByLabel('Estado inicial', { exact: true }).fill('Lia desconhece as marés.');
    await dialog.getByLabel('Objetivo', { exact: true }).fill(privateObjective);
    await dialog
      .getByLabel('Desfecho planejado', { exact: true })
      .fill('DESFECHO PRIVADO: o mapa volta.');
  } else if (kind === 'evento') {
    await dialog.getByLabel('Descrição', { exact: true }).fill(privateNotes);
    if (date !== undefined) await dialog.getByLabel('Data livre (opcional)').fill(date);
  } else await dialog.getByLabel('Notas do marco', { exact: true }).fill(privateNotes);
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row(planner, kind, title)).toBeVisible();
}
async function openItem(page: Page, planner: Locator, kind: Kind, title: string) {
  await row(planner, kind, title)
    .getByRole('button', { name: `Abrir ${kind}`, exact: true })
    .click();
  await expect(detail(page).getByRole('heading', { name: title, exact: true })).toBeVisible();
  return detail(page);
}
async function addReference(
  page: Page,
  type: 'Cena' | 'Evento' | 'Entidade de lore',
  title: string,
  chapter?: string,
  origin?: 'Universo',
) {
  await detail(page).getByRole('button', { name: 'Vincular referência', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Selecionar referência', exact: true });
  await chooseDropdown(picker.getByLabel('Tipo de referência'), type);
  if (chapter) await chooseDropdown(picker.getByLabel('Capítulo', { exact: true }), chapter);
  if (origin) await chooseDropdown(picker.getByLabel('Origem da entidade'), origin);
  await chooseDropdown(
    picker.getByLabel(type === 'Entidade de lore' ? 'Entidade' : type, { exact: true }),
    title,
  );
  await picker
    .getByRole('button', {
      name:
        type === 'Cena'
          ? 'Selecionar cena'
          : type === 'Evento'
            ? 'Selecionar evento'
            : 'Selecionar entidade',
      exact: true,
    })
    .click();
  const confirmation = page.getByRole('dialog', { name: 'Confirmar referência', exact: true });
  await confirmation.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(
    detail(page)
      .getByRole('region', { name: 'Referências do item' })
      .getByText(title, { exact: true }),
  ).toBeVisible();
}
async function scenePlanner(page: Page, path = bookPath) {
  await page.goto(path);
  await page.getByRole('tab', { name: 'Cenas', exact: true }).click();
  const planner = page.getByRole('region', { name: 'Planejamento de cenas', exact: true });
  await expect(planner.getByRole('button', { name: 'Nova cena', exact: true })).toBeEnabled();
  return planner;
}
async function createScene(page: Page, title: string, path = bookPath, chapter?: string) {
  const planner = await scenePlanner(page, path);
  if (chapter) {
    await planner.getByRole('button', { name: 'Novo capítulo', exact: true }).click();
    const group = page.getByRole('dialog', { name: 'Novo capítulo', exact: true });
    await group.getByLabel('Título do capítulo').fill(chapter);
    await group.getByRole('button', { name: 'Novo capítulo', exact: true }).click();
    await expect(group).toHaveCount(0);
    await chooseDropdown(planner.getByLabel('Capítulo', { exact: true }), chapter);
  }
  await planner.getByRole('button', { name: 'Nova cena', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova cena', exact: true });
  await dialog.getByLabel('Título da cena').fill(title);
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await planner.getByRole('link', { name: title, exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Área de escrita da cena', exact: true });
  await editor.fill('Lia abriu o mapa. PROSA CANÔNICA DO FAROL.');
  await expect(page.getByRole('status').filter({ hasText: /^Salvo$/ })).toBeVisible();
  return page.url();
}
async function downloadBook(page: Page, format: string) {
  await page.getByRole('button', { name: 'Opções do livro', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Exportar', exact: true }).click();
  await chooseDropdown(page.getByLabel('Formato do arquivo'), format);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Baixar arquivo', exact: true }).click(),
  ]);
  const path = await download.path();
  if (!path) throw new Error('O arquivo exportado deve existir.');
  const content = await readFile(path, 'utf8');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Fechar', exact: true })
    .first()
    .click();
  return content;
}

test('autor cria arco e marcos, edita objetivo e conserva notas após recarregar', async ({
  page,
}, testInfo) => {
  const planner = await openPlanner(page);
  await expect(
    sequence(planner, 'arco').getByRole('heading', { name: 'Nenhum arco planejado' }),
  ).toBeVisible();
  await create(page, planner, 'arco', 'A cartógrafa e o farol');
  await openItem(page, planner, 'arco', 'A cartógrafa e o farol');
  await expect(detail(page).getByText(privateObjective, { exact: true })).toBeVisible();
  await create(page, planner, 'marco', 'A carta chega');
  await create(page, planner, 'marco', 'O farol responde');
  await openItem(page, planner, 'marco', 'A carta chega');
  await expect(detail(page).getByText(privateNotes, { exact: true })).toBeVisible();
  await detail(page).getByRole('button', { name: 'Voltar à lista', exact: true }).click();
  await detail(page).getByRole('button', { name: 'Editar', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar arco', exact: true });
  await dialog
    .getByLabel('Objetivo', { exact: true })
    .fill('OBJETIVO PRIVADO REVISADO: preservar o mapa.');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(
    detail(page).getByText('OBJETIVO PRIVADO REVISADO: preservar o mapa.', { exact: true }),
  ).toBeVisible();
  await expect(sequence(planner, 'marco').getByRole('listitem')).toHaveCount(2);
  await capture(page, testInfo, 'arco-marcos-objetivo');
});

test('mestre planeja eventos com data livre e marcos independentes em aventura sem livro', async ({
  page,
}, testInfo) => {
  const planner = await openPlanner(page, adventurePath);
  await view(planner, 'Cronologia');
  await create(
    page,
    planner,
    'evento',
    'As lanternas se apagam',
    'Na terceira lua, antes do inverno',
  );
  await create(page, planner, 'evento', 'O porto desperta');
  await expect(row(planner, 'evento', 'O porto desperta')).toContainText('Sem data');
  await openItem(page, planner, 'evento', 'As lanternas se apagam');
  await expect(detail(page)).toContainText('Na terceira lua, antes do inverno');
  await view(planner, 'Arcos');
  await create(page, planner, 'arco', 'O pacto do porto');
  await openItem(page, planner, 'arco', 'O pacto do porto');
  await create(page, planner, 'marco', 'A testemunha aparece');
  await openItem(page, planner, 'marco', 'A testemunha aparece');
  await addReference(page, 'Evento', 'As lanternas se apagam');
  await detail(page).getByRole('button', { name: 'Abrir evento vinculado', exact: true }).click();
  await expect(
    detail(page).getByRole('heading', { name: 'As lanternas se apagam', exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(adventurePath));
  await capture(page, testInfo, 'aventura-evento-data-livre');
});

test('ordem manual de eventos ignora datas e preserva manuscrito exportado', async ({
  page,
}, testInfo) => {
  await createScene(page, 'Prosa do farol', bookPath, 'Capítulo do manuscrito');
  await page.goto(bookPath);
  const before = await downloadBook(page, 'Markdown (.md)');
  const planner = await openPlanner(page);
  await view(planner, 'Cronologia');
  await create(page, planner, 'evento', 'Chegada', 'Depois do fim');
  await create(page, planner, 'evento', 'Partida', 'Antes do início');
  await openItem(page, planner, 'evento', 'Partida');
  await detail(page).getByRole('button', { name: 'Mover', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Mover item', exact: true });
  await chooseDropdown(dialog.getByLabel('Item vizinho'), 'Chegada');
  await chooseDropdown(dialog.getByLabel('Posição', { exact: true }), 'Antes');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await detail(page).getByRole('button', { name: 'Voltar à lista', exact: true }).click();
  await expect(sequence(planner, 'evento').locator('ol > li strong')).toHaveText([
    'Partida',
    'Chegada',
  ]);
  await page.reload();
  await expect(sequence(planner, 'evento').locator('ol > li strong')).toHaveText([
    'Partida',
    'Chegada',
  ]);
  await capture(page, testInfo, 'cronologia-ordem-manual');
  await page.goto(bookPath);
  expect(await downloadBook(page, 'Markdown (.md)')).toBe(before);
  expect(before).toContain('PROSA CANÔNICA DO FAROL');
  expect(before).not.toContain(privateNotes);
});

test('arco aceita referências de cena evento e lore e retorna ao contexto original', async ({
  page,
}, testInfo) => {
  const sceneUrl = await createScene(page, 'Carta da cartógrafa');
  const planner = await openPlanner(page);
  await view(planner, 'Cronologia');
  await create(page, planner, 'evento', 'A carta foi enviada', 'Ontem');
  await view(planner, 'Arcos');
  await create(page, planner, 'arco', 'A resposta do farol');
  await openItem(page, planner, 'arco', 'A resposta do farol');
  await addReference(page, 'Cena', 'Carta da cartógrafa');
  await addReference(page, 'Evento', 'A carta foi enviada');
  await addReference(page, 'Entidade de lore', 'Lia');
  const references = detail(page).getByRole('region', { name: 'Referências do item' });
  await expect(references.getByRole('listitem')).toHaveCount(3);
  const contextUrl = page.url();
  await references.getByRole('link', { name: 'Abrir cena', exact: true }).click();
  await expect(page).toHaveURL(sceneUrl);
  await expect(page.getByRole('textbox', { name: 'Área de escrita da cena' })).toContainText(
    'PROSA CANÔNICA DO FAROL',
  );
  await page.getByRole('link', { name: 'Voltar ao planejamento', exact: true }).click();
  await expect(page).toHaveURL(contextUrl);
  await expect(page.getByRole('tab', { name: 'Arcos e cronologia', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(references.getByRole('listitem')).toHaveCount(3);
  await capture(page, testInfo, 'arco-multiplas-referencias');
});

test('menção textual não produz cenas vinculadas e vínculo explícito aparece na consulta', async ({
  page,
}, testInfo) => {
  await createScene(page, 'Lia no mapa');
  const planner = await openPlanner(page);
  await view(planner, 'Entidades');
  const entities = planner.getByRole('region', { name: 'Entidades relacionadas', exact: true });
  await chooseDropdown(entities.getByLabel('Entidade', { exact: true }), 'Lia');
  await entities.getByRole('button', { name: 'Selecionar entidade', exact: true }).click();
  await expect(entities.getByRole('status')).toContainText('A consulta ainda não está completa');
  await expect(
    entities.getByRole('heading', { name: 'Nenhuma cena vinculada a esta entidade' }),
  ).toHaveCount(0);
  await entities.getByRole('button', { name: 'Preparar cenas vinculadas', exact: true }).click();
  const job = page.getByRole('dialog', { name: 'Preparar cenas vinculadas', exact: true });
  await job.getByRole('button', { name: 'Iniciar', exact: true }).click();
  await expect(job).toHaveCount(0);
  await chooseDropdown(entities.getByLabel('Entidade', { exact: true }), 'Lia');
  await entities.getByRole('button', { name: 'Selecionar entidade', exact: true }).click();
  await expect(
    entities.getByRole('heading', { name: 'Nenhuma cena vinculada a esta entidade' }),
  ).toBeVisible();
  const scenes = await scenePlanner(page);
  await scenes.getByRole('button', { name: 'Ações da cena Lia no mapa', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Editar planejamento', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar planejamento', exact: true });
  await chooseDropdown(dialog.getByLabel('Lore para vincular'), 'Lia · Livro');
  await dialog.getByRole('button', { name: 'Vincular referência', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Vincular referência', exact: true })
    .getByRole('button', { name: 'Confirmar referência', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await openPlanner(page);
  await view(planner, 'Entidades');
  await chooseDropdown(entities.getByLabel('Entidade', { exact: true }), 'Lia');
  await entities.getByRole('button', { name: 'Selecionar entidade', exact: true }).click();
  await expect(
    entities.getByRole('link', { name: 'Abrir cena vinculada', exact: true }),
  ).toHaveCount(1);
  await expect(entities.getByText('Lia no mapa', { exact: true })).toBeVisible();
  await capture(page, testInfo, 'entidade-vinculo-explicito');
});

test('referência indisponível oculta nome anterior e pode ser removida sem bloquear item', async ({
  page,
}, testInfo) => {
  await page.goto('/universes');
  await page.getByRole('button', { name: 'Criar primeiro universo' }).click();
  await page.getByLabel('Nome do universo').fill('Universo do guardião');
  await page.getByLabel('Descrição do universo').fill('Lore compartilhado do planejamento.');
  await page.getByRole('button', { name: 'Salvar universo' }).click();
  await page.getByRole('button', { name: 'Abrir lore' }).click();
  await page.getByRole('button', { name: 'Nova Entidade' }).click();
  await page.getByLabel('Nome da Entidade').fill('Guardião do farol');
  await page.getByLabel(/Resumo Curto/).fill('Guarda o mapa compartilhado.');
  await page.getByRole('button', { name: 'Cadastrar Entidade' }).click();
  await page.getByRole('button', { name: 'Universos', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Estúdio', exact: true }).click();
  await page.getByRole('link', { name: /O Atlas das Marés Esquecidas/ }).click();
  await page.getByRole('button', { name: 'Opções do livro', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Editar', exact: true }).click();
  await chooseDropdown(page.getByLabel('Universo compartilhado'), 'Universo do guardião');
  await page.getByRole('button', { name: 'Salvar Alterações', exact: true }).click();
  await page.getByRole('tab', { name: 'Arcos e cronologia', exact: true }).click();
  const planner = page.getByRole('region', { name: 'Arcos e cronologia', exact: true });
  await create(page, planner, 'arco', 'O mapa incompleto');
  await openItem(page, planner, 'arco', 'O mapa incompleto');
  await addReference(page, 'Entidade de lore', 'Guardião do farol', undefined, 'Universo');
  await page.getByRole('button', { name: 'Opções do livro', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Editar', exact: true }).click();
  await chooseDropdown(page.getByLabel('Universo compartilhado'), 'Sem universo');
  await page.getByRole('button', { name: 'Salvar Alterações', exact: true }).click();
  const refs = detail(page).getByRole('region', { name: 'Referências do item' });
  await expect(refs.getByText('Referência indisponível', { exact: true })).toBeVisible();
  await expect(refs.getByText('Guardião do farol', { exact: true })).toHaveCount(0);
  await refs.getByRole('button', { name: 'Remover referência indisponível', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Remover referência', exact: true });
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(refs.getByRole('heading', { name: 'Nenhuma referência vinculada' })).toBeVisible();
  await expect(detail(page).getByText(privateObjective, { exact: true })).toBeVisible();
  await capture(page, testInfo, 'referencia-indisponivel-removida');
});

test('cena movida e arquivada mantém identidade no arco e prosa no editor privado', async ({
  page,
}, testInfo) => {
  const sceneUrl = await createScene(page, 'Cena que muda de capítulo');
  const planner = await openPlanner(page);
  await create(page, planner, 'arco', 'A mesma carta');
  await openItem(page, planner, 'arco', 'A mesma carta');
  await addReference(page, 'Cena', 'Cena que muda de capítulo');
  const contextUrl = page.url();
  const scenes = await scenePlanner(page);
  await scenes.getByRole('button', { name: 'Novo capítulo', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Novo capítulo', exact: true });
  await dialog.getByLabel('Título do capítulo').fill('Capítulo do porto');
  await dialog.getByRole('button', { name: 'Novo capítulo', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await chooseDropdown(scenes.getByLabel('Capítulo', { exact: true }), 'Sem capítulo');
  await scenes
    .getByRole('button', { name: 'Ações da cena Cena que muda de capítulo', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Mover cena', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Mover cena', exact: true });
  await chooseDropdown(dialog.getByLabel('Destino', { exact: true }), 'Capítulo do porto');
  await dialog.getByRole('button', { name: 'Mover cena', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await chooseDropdown(scenes.getByLabel('Capítulo', { exact: true }), 'Capítulo do porto');
  await scenes
    .getByRole('button', { name: 'Ações da cena Cena que muda de capítulo', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Arquivar cena', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Arquivar cena', exact: true });
  await dialog.getByRole('button', { name: 'Arquivar cena', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.goto(contextUrl);
  const refs = detail(page).getByRole('region', { name: 'Referências do item' });
  await expect(refs).toContainText('Cena arquivada');
  await refs.getByRole('link', { name: 'Abrir cena', exact: true }).click();
  await expect(page).toHaveURL(sceneUrl);
  await expect(page.getByRole('textbox', { name: 'Área de escrita da cena' })).toContainText(
    'PROSA CANÔNICA DO FAROL',
  );
  await page.getByRole('link', { name: 'Voltar ao planejamento', exact: true }).click();
  await expect(page).toHaveURL(contextUrl);
  await capture(page, testInfo, 'arco-cena-movida-arquivada');
});

test('página adicional com falha conserva itens carregados e recupera lista sem duplicações', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    sessionStorage.setItem('writer.visual.narrative-pagination', 'true'),
  );
  const planner = await openPlanner(page);
  const arcs = sequence(planner, 'arco');
  await expect(arcs.getByRole('listitem')).toHaveCount(25);
  await page.evaluate(() => sessionStorage.setItem('writer.visual.narrative-list-error', 'arc'));
  await arcs.getByRole('button', { name: 'Carregar mais arcos', exact: true }).click();
  await expect(arcs.getByRole('listitem')).toHaveCount(25);
  await expect(arcs.getByText('Arco das marés 1', { exact: true })).toBeVisible();
  await expect(arcs.getByRole('button', { name: 'Tentar novamente', exact: true })).toBeVisible();
  await capture(page, testInfo, 'arcos-pagina-falha-preserva-lista');
  await page.evaluate(() => sessionStorage.removeItem('writer.visual.narrative-list-error'));
  await arcs.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(arcs.getByRole('listitem')).toHaveCount(28);
  await expect(arcs.getByText('Arco das marés 1', { exact: true })).toHaveCount(1);
  await expect(arcs.getByRole('button', { name: 'Carregar mais arcos', exact: true })).toHaveCount(
    0,
  );
  await view(planner, 'Cronologia');
  await expect(sequence(planner, 'evento').getByRole('listitem')).toHaveCount(25);
});

test('resposta perdida congela preenchimento e repetição confirma uma única criação', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    sessionStorage.setItem('writer.visual.narrative-lost-response', 'createNarrativeItem'),
  );
  const planner = await openPlanner(page);
  await sequence(planner, 'arco').getByRole('button', { name: 'Novo arco', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Novo arco', exact: true });
  await dialog.getByLabel('Título', { exact: true }).fill('Uma única resposta');
  await dialog.getByLabel('Objetivo', { exact: true }).fill(privateObjective);
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Tentar novamente', exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Título', { exact: true })).toBeDisabled();
  await expect(dialog.getByLabel('Objetivo', { exact: true })).toHaveValue(privateObjective);
  await expect(dialog.getByRole('button', { name: 'Cancelar', exact: true })).toBeDisabled();
  await capture(page, testInfo, 'arco-resposta-perdida');
  await dialog.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(sequence(planner, 'arco').getByRole('listitem')).toHaveCount(1);
  await page.reload();
  await expect(row(planner, 'arco', 'Uma única resposta')).toHaveCount(1);
});

test('conflito de revisão preserva texto local e exige comparar dados atuais', async ({
  page,
}, testInfo) => {
  const planner = await openPlanner(page);
  await create(page, planner, 'arco', 'Título inicial');
  await openItem(page, planner, 'arco', 'Título inicial');
  await detail(page).getByRole('button', { name: 'Editar', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar arco', exact: true });
  await dialog.getByLabel('Título', { exact: true }).fill('Título escolhido pelo autor');
  await dialog.getByLabel('Objetivo', { exact: true }).fill('OBJETIVO LOCAL PRESERVADO');
  await page.evaluate(() => sessionStorage.setItem('writer.visual.narrative-conflict', 'true'));
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Comparar com dados atuais', exact: true }),
  ).toBeVisible();
  await expect(dialog.getByLabel('Título', { exact: true })).toHaveValue(
    'Título escolhido pelo autor',
  );
  await expect(dialog.getByRole('button', { name: 'Salvar', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Comparar com dados atuais', exact: true }).click();
  await expect(dialog.getByRole('region', { name: 'Dados atuais' })).toContainText(
    'Título remoto confirmado',
  );
  await expect(dialog.getByLabel('Objetivo', { exact: true })).toHaveValue(
    'OBJETIVO LOCAL PRESERVADO',
  );
  await capture(page, testInfo, 'arco-comparar-revisao');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    detail(page).getByRole('heading', { name: 'Título escolhido pelo autor', exact: true }),
  ).toBeVisible();
  await expect(detail(page)).toContainText('OBJETIVO LOCAL PRESERVADO');
});

test('troca de conta descarta resposta tardia e oculta planejamento da conta anterior', async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem('writer.visual.narrative-delay-create', 'true'),
  );
  const planner = await openPlanner(page);
  await sequence(planner, 'arco').getByRole('button', { name: 'Novo arco', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Novo arco', exact: true });
  await dialog.getByLabel('Título', { exact: true }).fill('PLANO PRIVADO DA PRIMEIRA CONTA');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.evaluate(() => {
    sessionStorage.setItem('writer.visual.account', 'second');
    window.dispatchEvent(new Event('writer.visual.auth-change'));
  });
  await expect(page.getByRole('button', { name: /Outro Autor de Exemplo/ })).toBeVisible();
  await expect(page.getByText('PLANO PRIVADO DA PRIMEIRA CONTA', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Novo arco', exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    sessionStorage.removeItem('writer.visual.account');
    sessionStorage.removeItem('writer.visual.narrative-delay-create');
    window.dispatchEvent(new Event('writer.visual.auth-change'));
  });
  await expect(page.getByRole('button', { name: /Marina de Exemplo/ })).toBeVisible();
  await page.getByRole('link', { name: /O Atlas das Marés Esquecidas/ }).click();
  await page.getByRole('tab', { name: 'Arcos e cronologia', exact: true }).click();
  await expect(planner).toBeVisible();
  await expect
    .poll(async () => {
      await planner.getByRole('button', { name: 'Atualizar planejamento', exact: true }).click();
      return row(planner, 'arco', 'PLANO PRIVADO DA PRIMEIRA CONTA').count();
    })
    .toBe(1);
  await expect(sequence(planner, 'arco').getByRole('listitem')).toHaveCount(1);
  await expect(row(planner, 'arco', 'PLANO PRIVADO DA PRIMEIRA CONTA')).toBeVisible();
});

test('reorganização interrompida retoma após recarregar e mantém ordem e datas', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('writer.visual.narrative-pagination', 'true');
    sessionStorage.setItem('writer.visual.narrative-job-pages', 'true');
  });
  const planner = await openPlanner(page, adventurePath);
  await view(planner, 'Cronologia');
  const events = sequence(planner, 'evento');
  const titles = await events.locator('ol > li strong').allTextContents();
  await page.evaluate(() =>
    sessionStorage.setItem('writer.visual.narrative-job-interrupted', 'rebalance'),
  );
  await events.getByRole('button', { name: 'Reorganizar posições', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Reorganizar posições', exact: true });
  await dialog.getByRole('button', { name: 'Iniciar', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Tentar novamente', exact: true })).toBeVisible();
  await page.reload();
  await expect(events.getByRole('button', { name: 'Novo evento', exact: true })).toBeDisabled();
  await events.getByRole('button', { name: 'Retomar reorganização', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Reorganizar posições', exact: true });
  await expect(dialog.getByRole('status')).toContainText('50 itens processados');
  await capture(page, testInfo, 'cronologia-retomada-reorganizacao');
  await dialog.getByRole('button', { name: 'Retomar operação', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(events.getByRole('button', { name: 'Novo evento', exact: true })).toBeEnabled();
  await expect(events.locator('ol > li strong')).toHaveText(titles);
  await expect(row(planner, 'evento', 'Evento das marés 1')).toContainText('3º dia do inverno');
});

test('excluir arco retoma limpeza dos marcos e conserva eventos independentes', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('writer.visual.narrative-pagination', 'true');
    sessionStorage.setItem('writer.visual.narrative-job-pages', 'true');
  });
  const planner = await openPlanner(page, adventurePath);
  await openItem(page, planner, 'arco', 'Arco das marés 1');
  await expect(sequence(planner, 'marco').getByRole('listitem')).toHaveCount(25);
  await page.evaluate(() =>
    sessionStorage.setItem('writer.visual.narrative-job-interrupted', 'delete-item'),
  );
  await detail(page).getByRole('button', { name: 'Excluir', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Excluir item', exact: true });
  await expect(dialog).toContainText('eventos independentes permanecem');
  await dialog.getByRole('button', { name: 'Confirmar exclusão', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Tentar novamente', exact: true })).toBeVisible();
  await page.reload();
  await expect(detail(page).getByRole('button', { name: 'Editar', exact: true })).toHaveCount(0);
  await detail(page).getByRole('button', { name: 'Retomar exclusão', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Excluir item', exact: true });
  await expect(dialog.getByRole('status')).toContainText('50 itens processados');
  await capture(page, testInfo, 'arco-retomada-exclusao');
  await dialog.getByRole('button', { name: 'Retomar operação', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row(planner, 'arco', 'Arco das marés 1')).toHaveCount(0);
  await view(planner, 'Cronologia');
  await expect(sequence(planner, 'evento').getByRole('listitem')).toHaveCount(25);
  await expect(row(planner, 'evento', 'Evento das marés 1')).toBeVisible();
});

test('preparação do índice existente retoma lote confirmado sem anunciar vazio prematuro', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('writer.visual.scene-pagination', 'true');
    sessionStorage.setItem('writer.visual.scene-job-pages', 'true');
    sessionStorage.setItem('writer.visual.narrative-legacy-index', 'true');
  });
  const planner = await openPlanner(page);
  await view(planner, 'Entidades');
  const entities = planner.getByRole('region', { name: 'Entidades relacionadas', exact: true });
  await chooseDropdown(entities.getByLabel('Entidade', { exact: true }), 'Lia');
  await entities.getByRole('button', { name: 'Selecionar entidade', exact: true }).click();
  await expect(entities.getByRole('status')).toContainText('A consulta ainda não está completa');
  await page.evaluate(() =>
    sessionStorage.setItem('writer.visual.narrative-job-interrupted', 'prepare-entity-scenes'),
  );
  await entities.getByRole('button', { name: 'Preparar cenas vinculadas', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Preparar cenas vinculadas', exact: true });
  await dialog.getByRole('button', { name: 'Iniciar', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Tentar novamente', exact: true })).toBeVisible();
  await page.reload();
  await entities.getByRole('button', { name: 'Retomar preparação', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Preparar cenas vinculadas', exact: true });
  await expect(dialog.getByRole('status')).toContainText('50 itens processados');
  await capture(page, testInfo, 'indice-cenas-retomada');
  await dialog.getByRole('button', { name: 'Retomar operação', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await chooseDropdown(entities.getByLabel('Entidade', { exact: true }), 'Lia');
  await entities.getByRole('button', { name: 'Selecionar entidade', exact: true }).click();
  await expect(
    entities.getByRole('link', { name: 'Abrir cena vinculada', exact: true }),
  ).toHaveCount(25);
  await entities
    .getByRole('button', { name: 'Carregar mais cenas vinculadas', exact: true })
    .click();
  await expect(
    entities.getByRole('link', { name: 'Abrir cena vinculada', exact: true }),
  ).toHaveCount(50);
  await entities
    .getByRole('button', { name: 'Carregar mais cenas vinculadas', exact: true })
    .click();
  await expect(
    entities.getByRole('link', { name: 'Abrir cena vinculada', exact: true }),
  ).toHaveCount(64);
  await expect(
    entities.getByRole('heading', { name: 'Nenhuma cena vinculada a esta entidade' }),
  ).toHaveCount(0);
});

test('backup real inclui planejamento privado e exportação de leitura inclui somente prosa', async ({
  page,
}, testInfo) => {
  await createScene(page, 'Cena publicada do farol', bookPath, 'Capítulo publicado');
  const planner = await openPlanner(page);
  await view(planner, 'Cronologia');
  await create(page, planner, 'evento', 'EVENTO PRIVADO DO PORTO', 'Próxima lua');
  await view(planner, 'Arcos');
  await create(page, planner, 'arco', 'ARCO PRIVADO DO MAPA');
  await openItem(page, planner, 'arco', 'ARCO PRIVADO DO MAPA');
  await create(page, planner, 'marco', 'MARCO PRIVADO DA CARTA');
  await addReference(page, 'Cena', 'Cena publicada do farol', 'Capítulo publicado');
  await page.goto(bookPath);
  const backup = await downloadBook(page, 'Backup completo (.json)');
  const parsed = JSON.parse(backup) as { version: number };
  expect(parsed.version).toBe(6);
  expect(backup).toContain(privateObjective);
  expect(backup).toContain(privateNotes);
  expect(backup).toContain('MARCO PRIVADO DA CARTA');
  expect(backup).toContain('EVENTO PRIVADO DO PORTO');
  expect(backup).toContain('PROSA CANÔNICA DO FAROL');
  expect(backup).not.toContain('visual-author');
  expect(backup).not.toContain('sceneLoreLinks');
  expect(backup).not.toContain('rebalanceOperationId');
  const markdown = await downloadBook(page, 'Markdown (.md)');
  expect(markdown).toContain('PROSA CANÔNICA DO FAROL');
  for (const text of [
    privateObjective,
    privateNotes,
    'ARCO PRIVADO DO MAPA',
    'EVENTO PRIVADO DO PORTO',
    'MARCO PRIVADO DA CARTA',
  ])
    expect(markdown).not.toContain(text);
  await page.getByRole('tab', { name: 'Publicação', exact: true }).click();
  await page.getByRole('button', { name: 'Publicar Obra', exact: true }).click();
  const publication = page.getByRole('dialog', { name: 'Publicar versão da obra', exact: true });
  await publication.getByLabel('Nome de autor público').fill('Autora do farol');
  await publication.getByRole('button', { name: 'Confirmar publicação', exact: true }).click();
  await expect(publication).toHaveCount(0);
  await page.getByRole('link', { name: 'Abrir leitor público', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Sumário' })
    .getByRole('link', { name: 'Capítulo publicado', exact: true })
    .click();
  await expect(page.getByText('PROSA CANÔNICA DO FAROL.', { exact: false })).toBeVisible();
  for (const text of [
    privateObjective,
    privateNotes,
    'ARCO PRIVADO DO MAPA',
    'EVENTO PRIVADO DO PORTO',
    'MARCO PRIVADO DA CARTA',
  ])
    await expect(page.getByText(text, { exact: false })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Arcos e cronologia', exact: true })).toHaveCount(
    0,
  );
  await capture(page, testInfo, 'leitor-publico-sem-planejamento-privado');
});

test('teclado e largura de 320px permitem navegar e preencher planejamento nos temas', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const planner = await openPlanner(page, adventurePath);
  const tab = page.getByRole('tab', { name: 'Arcos e cronologia', exact: true });
  await tab.focus();
  await tab.press('Home');
  await expect(page.getByRole('tab', { name: 'Cenas', exact: true })).toBeFocused();
  await page.getByRole('tab', { name: 'Cenas', exact: true }).press('End');
  await expect(tab).toBeFocused();
  await tab.press('Enter');
  await sequence(planner, 'arco').getByRole('button', { name: 'Novo arco', exact: true }).focus();
  await sequence(planner, 'arco')
    .getByRole('button', { name: 'Novo arco', exact: true })
    .press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Novo arco', exact: true });
  await dialog.getByLabel('Título', { exact: true }).fill('Um arco acessível nas marés');
  await dialog.getByLabel('Objetivo', { exact: true }).fill(privateObjective);
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'arco-formulario-320');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).focus();
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).press('Enter');
  await expect(dialog).toHaveCount(0);
  await openItem(page, planner, 'arco', 'Um arco acessível nas marés');
  await expectNoHorizontalOverflow(page, 'arco-detalhe-320');
  await capture(page, testInfo, 'arco-detalhe-320');
});
