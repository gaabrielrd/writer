import { capture, expect, expectDialogWithinViewport, test } from './support';
import { books, chapters } from './fixtures/data';

test('universo, lore por etapas e vínculo compartilhado entre livros', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Meus Livros', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Lore compartilhado' }).click();
  await expect(page.getByRole('heading', { name: 'Lore compartilhado' })).toBeVisible();
  await page.getByRole('button', { name: 'Criar primeiro universo' }).click();
  await page.getByLabel('Nome do universo').fill('Universo das Marés');
  await page
    .getByLabel('Descrição do universo')
    .fill('Personagens e locais compartilhados entre livros.');
  await page.getByRole('button', { name: 'Salvar universo' }).click();
  await page.getByRole('button', { name: 'Abrir lore' }).click();
  await page.getByRole('button', { name: 'Nova Entidade' }).click();
  await page.getByLabel('Nome da Entidade').fill('Guardião das Marés');
  await page.getByLabel(/Resumo Curto/).fill('Guarda os caminhos entre as ilhas.');
  await expect(page.getByLabel('Notas privadas')).toHaveCount(0);
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'universo-lore-identificacao');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByLabel('Aparência').fill('Manto azul e bússola de bronze.');
  await page.getByLabel('Personalidade').fill('Reservado e paciente.');
  await expectDialogWithinViewport(page);
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByLabel('Notas privadas').fill('Identidade secreta do guardião.');
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await expect(page.getByLabel('Aparência')).toHaveValue('Manto azul e bússola de bronze.');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByLabel('Notas privadas')).toHaveValue('Identidade secreta do guardião.');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'universo-lore-relacoes');
  await page.getByRole('button', { name: 'Cadastrar Entidade' }).click();
  await expect(page.getByRole('heading', { name: 'Guardião das Marés' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Lore compartilhado', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Meus Livros' }).click();
  await page.getByRole('button', { name: 'Novo Livro', exact: true }).click();
  await page.getByLabel('Universo compartilhado').selectOption({ label: 'Universo das Marés' });
  await page.getByLabel('Título da Obra').fill('Histórias do Guardião');
  await page.getByLabel('Gênero Literário').fill('Fantasia');
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'universo-criacao-livro');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Criar Livro', exact: true }).click();
  await page.getByRole('link', { name: /Histórias do Guardião/ }).click();
  await page.getByRole('tab', { name: 'Compêndio', exact: true }).click();
  await page.getByLabel('Escopo do compêndio').selectOption('global');
  await expect(page.getByRole('heading', { name: 'Guardião das Marés' })).toBeVisible();
  await capture(page, testInfo, 'universo-compendio-global');
  await page.getByLabel('Escopo do compêndio').selectOption('local');
  await expect(page.getByRole('heading', { name: 'Guardião das Marés' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Meus Livros', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Meus Livros' }).click();
  await page.getByRole('link', { name: new RegExp(books[0].title) }).click();
  const bookOptions = page.getByRole('button', { name: 'Opções do livro', exact: true });
  if (await bookOptions.count()) {
    await bookOptions.click();
    await page.getByRole('menuitem', { name: 'Editar', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Editar', exact: true }).first().click();
  }
  await page.getByLabel('Universo compartilhado').selectOption({ label: 'Universo das Marés' });
  await page.getByRole('button', { name: 'Salvar Alterações' }).click();
  await page.getByRole('tab', { name: 'Compêndio', exact: true }).click();
  await page.getByLabel('Escopo do compêndio').selectOption('global');
  await expect(page.getByRole('heading', { name: 'Guardião das Marés' })).toBeVisible();
  await page.getByRole('tab', { name: 'Capítulos', exact: true }).click();
  await page.getByRole('button', { name: `Escrever ${chapters[0].title}`, exact: true }).click();
  const editor = page.getByLabel(/área de escrita do capítulo/i);
  await editor.fill('O Guardião das Marés aguarda no porto.');
  await page.locator('[data-lore-id^="universe:"]').first().click();
  await expect(page.getByLabel('Escopo do lore')).toHaveValue('global');
  await expect(
    page.getByText('Guarda os caminhos entre as ilhas.', { exact: true }).last(),
  ).toBeVisible();
  await capture(page, testInfo, 'universo-editor-global');
});
