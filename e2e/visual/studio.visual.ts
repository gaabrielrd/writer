import type { Page } from '@playwright/test';
import { chooseDropdown } from '../dropdown';
import { books } from './fixtures/data';
import {
  capture,
  expect,
  expectDialogWithinViewport,
  expectNoHorizontalOverflow,
  test,
} from './support';

async function newProject(page: Page, kind: 'Aventura' | 'Campanha') {
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click();
  await page.getByRole('menuitem', { name: kind, exact: true }).click();
  const dialog = page.getByRole('dialog', {
    name: `Criar ${kind.toLocaleLowerCase('pt-BR')}`,
    exact: true,
  });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('Estúdio retoma livros e abre os cinco espaços com teclado em 320px', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  await expect(page).toHaveURL(/\/studio$/);
  await expect(page.getByRole('heading', { name: 'Estúdio', exact: true })).toBeVisible();
  for (const section of ['Livros', 'Aventuras', 'Campanhas']) {
    await expect(page.getByRole('region', { name: section, exact: true })).toBeVisible();
  }
  await page.getByRole('link', { name: new RegExp(books[0].title) }).click();
  await expect(page).toHaveURL(/\/books\/visual-atlas$/);
  await expect(page.getByRole('heading', { name: books[0].title, exact: true })).toBeVisible();
  const navigation = page.getByRole('navigation', { name: 'Navegação principal' });
  await expect(page.getByLabel('Livro atual', { exact: true })).toContainText(books[0].title);
  await navigation.getByRole('button', { name: 'Estúdio', exact: true }).focus();
  await page.keyboard.press('Enter');
  for (const name of ['Universos', 'Estúdio', 'Publicações', 'Catálogo', 'Biblioteca']) {
    await expect(page.getByRole('menuitem', { name, exact: true })).toBeVisible();
  }
  await page.getByRole('menuitem', { name: 'Estúdio', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/studio$/);
  await capture(page, testInfo, 'estudio-320');
  for (const [name, route] of [
    ['Publicações', '/publications'],
    ['Catálogo', '/catalog'],
    ['Biblioteca', '/biblioteca'],
  ]) {
    await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button').click();
    await page.getByRole('menuitem', { name, exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(route + '$'));
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Comprar|Pagar|Publicar agora/ })).toHaveCount(0);
    await expectNoHorizontalOverflow(page, name + '-320');
  }
  await capture(page, testInfo, 'biblioteca-indisponivel-320');
});

test('campanha independente persiste descrição e não cria um livro auxiliar', async ({
  page,
}, testInfo) => {
  await page.goto('/studio');
  const dialog = await newProject(page, 'Campanha');
  await expect(dialog.getByRole('button', { name: 'Criar campanha', exact: true })).toBeDisabled();
  await dialog.getByLabel('Título da campanha').fill('Jornada particular das lanternas');
  await dialog
    .getByLabel('Descrição da campanha')
    .fill('Guardar as consequências da jornada em minhas notas.');
  await expect(dialog.getByLabel('Universo compartilhado')).toContainText('Sem universo');
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'campanha-independente-formulario');
  await dialog.getByRole('button', { name: 'Criar campanha', exact: true }).click();
  await expect(page).toHaveURL(/\/campaigns\/visual-created-campaign-/);
  await expect(
    page.getByRole('heading', { name: 'Jornada particular das lanternas', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Guardar as consequências da jornada em minhas notas.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Projeto independente, sem universo vinculado.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Em preparação', { exact: true })).toBeVisible();
  await capture(page, testInfo, 'campanha-independente-detalhes');
  await page.getByRole('link', { name: 'Voltar ao Estúdio', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Livros', exact: true }).getByRole('heading', { level: 3 }),
  ).toHaveCount(3);
  await expect(
    page
      .getByRole('region', { name: 'Campanhas', exact: true })
      .getByRole('link', { name: /Jornada particular das lanternas/ }),
  ).toHaveCount(1);
});

test('aventura vinculada a um universo mantém sinopse e acesso ao contexto', async ({
  page,
}, testInfo) => {
  await page.goto('/universes');
  await page.getByRole('button', { name: 'Criar primeiro universo' }).click();
  await page.getByLabel('Nome do universo').fill('Ilhas das lanternas');
  await page.getByLabel('Descrição do universo').fill('Um mundo para livros e aventuras.');
  await page.getByRole('button', { name: 'Salvar universo' }).click();
  await page.getByRole('button', { name: 'Universos', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Estúdio', exact: true }).click();
  const dialog = await newProject(page, 'Aventura');
  await dialog.getByLabel('Título da aventura').fill('O mapa das lanternas perdidas');
  await dialog.getByLabel('Sinopse da aventura').fill('Uma expedição em busca da cidade submersa.');
  await chooseDropdown(dialog.getByLabel('Universo compartilhado'), 'Ilhas das lanternas');
  await capture(page, testInfo, 'aventura-universo-formulario');
  await dialog.getByRole('button', { name: 'Criar aventura', exact: true }).click();
  await expect(page).toHaveURL(/\/adventures\/visual-created-adventure-/);
  await expect(
    page.getByRole('heading', { name: 'O mapa das lanternas perdidas', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Uma expedição em busca da cidade submersa.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Rascunho', { exact: true })).toBeVisible();
  await capture(page, testInfo, 'aventura-universo-detalhes');
  await page.getByRole('link', { name: 'Abrir universo vinculado' }).click();
  await expect(page).toHaveURL(/\/universes\/[^/]+\/lore$/);
});

test('falha depois da gravação preserva formulário e verifica a mesma criação', async ({
  page,
}, testInfo) => {
  await page.goto('/studio');
  await page.evaluate(() =>
    sessionStorage.setItem('writer.visual.studio-lost-response', 'campaign'),
  );
  let dialog = await newProject(page, 'Campanha');
  await dialog.getByLabel('Título da campanha').fill('Campanha com resposta perdida');
  await dialog.getByLabel('Descrição da campanha').fill('Minhas notas não desaparecem no retry.');
  await dialog.getByRole('button', { name: 'Criar campanha', exact: true }).click();
  const failure = dialog.getByRole('alert').filter({ hasText: 'A resposta se perdeu.' });
  await expect(failure).toBeFocused();
  await expect(dialog.getByLabel('Título da campanha')).toHaveValue(
    'Campanha com resposta perdida',
  );
  await expect(dialog.getByLabel('Descrição da campanha')).toHaveValue(
    'Minhas notas não desaparecem no retry.',
  );
  await expect(dialog.getByLabel('Título da campanha')).toBeDisabled();
  await expect(page).toHaveURL(/\/studio$/);
  await capture(page, testInfo, 'criacao-resposta-perdida');
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  dialog = await newProject(page, 'Campanha');
  await expect(dialog.getByLabel('Título da campanha')).toHaveValue(
    'Campanha com resposta perdida',
  );
  await dialog.getByRole('button', { name: 'Verificar criação', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Campanha com resposta perdida', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Voltar ao Estúdio', exact: true }).click();
  await expect(page.getByRole('link', { name: /Campanha com resposta perdida/ })).toHaveCount(1);
});

test('troca de conta durante criação pendente descarta formulário e resposta antiga', async ({
  page,
}, testInfo) => {
  await page.goto('/studio');
  await page.evaluate(() => sessionStorage.setItem('writer.visual.studio-hold-create', 'campaign'));
  const dialog = await newProject(page, 'Campanha');
  await dialog.getByLabel('Título da campanha').fill('Anotações particulares da primeira conta');
  await dialog.getByRole('button', { name: 'Criar campanha', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Criando...', exact: true })).toBeDisabled();
  await expect(dialog.getByLabel('Título da campanha')).toBeDisabled();
  await page.evaluate(() => {
    sessionStorage.setItem('writer.visual.account', 'second');
    window.dispatchEvent(new Event('writer.visual.auth-change'));
  });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Outro Autor de Exemplo/ })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('writer.visual.release-create')));
  await expect(page).toHaveURL(/\/studio$/);
  await expect(
    page.getByRole('heading', { name: 'Anotações particulares da primeira conta', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('heading', { name: books[0].title, exact: true })).toHaveCount(0);
  const fresh = await newProject(page, 'Campanha');
  await expect(fresh.getByLabel('Título da campanha')).toHaveValue('');
  await expect(fresh.getByLabel('Descrição da campanha')).toHaveValue('');
  await fresh.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.goto('/campaigns/visual-campaign-1');
  await expect(
    page.getByRole('heading', { name: 'Campanha indisponível', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Anotações particulares para a próxima jornada.', { exact: true }),
  ).toHaveCount(0);
  await capture(page, testInfo, 'campanha-outra-conta-indisponivel');
});

test('falha parcial mantém livros e campanhas, e retry recupera aventuras', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    sessionStorage.setItem('writer.visual.studio-error-kind', 'adventure'),
  );
  await page.goto('/studio');
  const adventures = page.getByRole('region', { name: 'Aventuras', exact: true });
  await expect(
    adventures.getByRole('heading', { name: 'Não foi possível carregar aventuras' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: books[0].title, exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Crônicas do Porto das Lanternas', exact: true }),
  ).toBeVisible();
  await capture(page, testInfo, 'estudio-falha-parcial');
  await page.evaluate(() => sessionStorage.removeItem('writer.visual.studio-error-kind'));
  await adventures.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(
    adventures.getByRole('heading', { name: 'O farol entre as ilhas', exact: true }),
  ).toBeVisible();
  await expect(
    adventures.getByRole('button', { name: 'Tentar novamente', exact: true }),
  ).toHaveCount(0);
});

test('preparação dos livros informa carregamento sem anunciar lista vazia', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    sessionStorage.setItem('writer.visual.studio-hold-preparation', 'true'),
  );
  await page.goto('/studio');
  const section = page.getByRole('region', { name: 'Livros', exact: true });
  await expect(
    section.getByText('Preparando e carregando seus livros...', { exact: true }),
  ).toBeVisible();
  await expect(section.getByRole('heading', { name: 'Nenhum projeto nesta lista' })).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'O farol entre as ilhas', exact: true }),
  ).toBeVisible();
  await capture(page, testInfo, 'estudio-preparacao-pendente');
  await page.evaluate(() => {
    sessionStorage.removeItem('writer.visual.studio-hold-preparation');
    window.dispatchEvent(new Event('writer.visual.release-preparation'));
  });
  await expect(section.getByRole('heading', { name: books[0].title, exact: true })).toBeVisible();
});

test('paginação e filtros de tipo e estado conservam listas independentes', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('writer.visual.studio-pagination', 'true');
    sessionStorage.setItem('writer.visual.studio-editorial-scenario', 'true');
    sessionStorage.setItem(
      'writer.visual.studio-patches',
      JSON.stringify({
        'adventure:visual-adventure-27': { status: 'ready', editorialState: 'review' },
        'adventure:visual-adventure-28': { status: 'draft', editorialState: 'ready' },
      }),
    );
  });
  await page.goto('/studio');
  const adventures = page.getByRole('region', { name: 'Aventuras', exact: true });
  const campaigns = page.getByRole('region', { name: 'Campanhas', exact: true });
  await expect(adventures.getByRole('heading', { level: 3 })).toHaveCount(25);
  await expect(campaigns.getByRole('heading', { level: 3 })).toHaveCount(25);
  await adventures.getByRole('button', { name: 'Carregar mais aventuras', exact: true }).click();
  await expect(adventures.getByRole('heading', { level: 3 })).toHaveCount(28);
  await expect(
    adventures.getByRole('button', { name: 'Carregar mais aventuras', exact: true }),
  ).toHaveCount(0);
  await expect(campaigns.getByRole('heading', { level: 3 })).toHaveCount(25);
  await chooseDropdown(adventures.getByLabel('Estado editorial de Aventuras'), 'Rascunho');
  await expect(adventures.getByRole('heading', { level: 3 })).toHaveCount(1);
  await expect(
    adventures.getByRole('heading', { name: 'O farol entre as ilhas', exact: true }),
  ).toBeVisible();
  await expect(campaigns.getByRole('heading', { level: 3 })).toHaveCount(25);
  await chooseDropdown(adventures.getByLabel('Estado editorial de Aventuras'), 'Em revisão');
  await expect(adventures.getByRole('heading', { level: 3 })).toHaveCount(1);
  await expect(
    adventures.getByRole('heading', { name: 'Aventura das marés 27', exact: true }),
  ).toBeVisible();
  await chooseDropdown(adventures.getByLabel('Estado editorial de Aventuras'), 'Pronto');
  await expect(adventures.getByRole('heading', { level: 3 })).toHaveCount(24);
  await adventures.getByRole('button', { name: 'Carregar mais aventuras', exact: true }).click();
  await expect(adventures.getByRole('heading', { level: 3 })).toHaveCount(26);
  await expect(
    adventures.getByRole('heading', { name: 'Aventura das marés 28', exact: true }),
  ).toBeVisible();
  await expect(
    adventures.getByRole('heading', { name: 'Aventura das marés 27', exact: true }),
  ).toHaveCount(0);
  const bookSection = page.getByRole('region', { name: 'Livros', exact: true });
  await chooseDropdown(bookSection.getByLabel('Publicação de Livros'), 'Não publicado');
  await chooseDropdown(bookSection.getByLabel('Estado editorial de Livros'), 'Em revisão');
  await expect(bookSection.getByRole('heading', { level: 3 })).toHaveCount(1);
  await expect(
    bookSection.getByRole('heading', { name: books[0].title, exact: true }),
  ).toBeVisible();
  await chooseDropdown(bookSection.getByLabel('Publicação de Livros'), 'Publicado');
  await expect(bookSection.getByRole('heading', { level: 3 })).toHaveCount(0);
  await chooseDropdown(bookSection.getByLabel('Estado editorial de Livros'), 'Pronto');
  await expect(
    bookSection.getByRole('heading', { name: books[1].title, exact: true }),
  ).toBeVisible();
  await expect(campaigns.getByRole('heading', { level: 3 })).toHaveCount(25);
  await page.setViewportSize({ width: 320, height: 740 });
  await bookSection.getByLabel('Publicação de Livros').scrollIntoViewIfNeeded();
  const bookFilters = testInfo.outputPath('estudio-publicacao-editorial-320.png');
  await page.screenshot({ path: bookFilters, animations: 'disabled', caret: 'hide' });
  await testInfo.attach('Publicação e estado editorial em 320px', {
    path: bookFilters,
    contentType: 'image/png',
  });
  await chooseDropdown(adventures.getByLabel('Estado editorial de Aventuras'), 'Em revisão');
  await expect(
    adventures.getByRole('heading', { name: 'Aventura das marés 27', exact: true }),
  ).toBeVisible();
  await adventures.getByLabel('Estado editorial de Aventuras').scrollIntoViewIfNeeded();
  const adventureFilters = testInfo.outputPath('estudio-condicao-editorial-320.png');
  await page.screenshot({ path: adventureFilters, animations: 'disabled', caret: 'hide' });
  await testInfo.attach('Condição e estado editorial em 320px', {
    path: adventureFilters,
    contentType: 'image/png',
  });
  await chooseDropdown(
    page.getByRole('combobox', { name: 'Tipo de projeto', exact: true }),
    'Campanhas',
  );
  await expect(page.getByRole('region', { name: 'Livros', exact: true })).toHaveCount(0);
  await expect(adventures).toHaveCount(0);
  await chooseDropdown(campaigns.getByLabel('Estado de Campanhas'), 'Em preparação');
  await expect(campaigns.getByRole('heading', { level: 3 })).toHaveCount(1);
  await page.setViewportSize({ width: 320, height: 740 });
  await capture(page, testInfo, 'estudio-filtros-campanhas-320');
});
