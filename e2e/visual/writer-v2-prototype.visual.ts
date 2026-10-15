import {
  capture,
  expect,
  expectDialogWithinViewport,
  expectNoHorizontalOverflow,
  test,
} from './support';

const url = '/e2e/visual/writer-v2.html';

test('protótipo retoma escrita, restaura com confirmação e prepara edição por teclado', async ({
  page,
}, testInfo) => {
  await page.goto(url);
  await capture(page, testInfo, 'v2-estudio');
  const resume = page.getByRole('button', { name: 'Continuar escrita', exact: true });
  await resume.focus();
  await page.keyboard.press('Enter');
  const manuscript = page.getByLabel('Texto do capítulo');
  const original = await manuscript.inputValue();
  await manuscript.fill(`${original} A luz voltou à oficina.`);
  await page.getByRole('button', { name: 'Salvar rascunho' }).click();
  await page.getByRole('button', { name: 'Voltar ao Estúdio' }).click();
  await resume.click();
  await expect(manuscript).toHaveValue(`${original} A luz voltou à oficina.`);
  const restore = page.getByRole('button', { name: 'Restaurar versão anterior' });
  await restore.click();
  await expectDialogWithinViewport(page);
  await page.keyboard.press('Escape');
  await expect(restore).toBeFocused();
  await expect(manuscript).toHaveValue(`${original} A luz voltou à oficina.`);
  await restore.click();
  await page.getByRole('button', { name: 'Confirmar demonstração' }).click();
  await expect(manuscript).toHaveValue(original);
  await page.getByRole('button', { name: 'Abrir revisão' }).click();
  await page.getByRole('button', { name: 'Marcar para resolver' }).click();
  await page.getByRole('button', { name: 'Voltar ao manuscrito' }).click();
  await expect(manuscript).toHaveValue(original);
  await page.getByRole('button', { name: 'Publicações', exact: true }).click();
  await page.getByRole('button', { name: 'Conferir e preparar edição' }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'visitantes recebem somente a amostra do capítulo 1',
  );
  await capture(page, testInfo, 'v2-conferencia-edicao');
  await page.getByRole('button', { name: 'Confirmar demonstração' }).click();
  await expect(page.getByText('Edição preparada · demonstração', { exact: true })).toBeVisible();
});

test('protótipo prepara sessão e revela só o material escolhido, em 320px', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(url);
  await page.getByRole('button', { name: 'Ver portal dos jogadores' }).click();
  await expect(page.getByRole('heading', { name: 'Nenhum material revelado' })).toBeVisible();
  await expect(page.getByText(/Um canal subterrâneo/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Voltar à visão do mestre' }).click();
  await page
    .getByLabel('Notas e consequências próprias')
    .fill('Mesa A decidiu preservar a passagem.');
  await page.getByRole('button', { name: 'Registrar consequência local' }).click();
  await page.getByRole('button', { name: 'Revelar Mara e a pista' }).click();
  await expectDialogWithinViewport(page);
  await expect(page.getByRole('dialog')).toContainText('jogadores da Mesa A');
  await capture(page, testInfo, 'v2-conferencia-revelacao-320');
  await page.getByRole('button', { name: 'Confirmar demonstração' }).click();
  await page.getByRole('button', { name: 'Conferir portal dos jogadores' }).click();
  await expect(page.getByRole('heading', { name: 'Mara e a pista' })).toBeVisible();
  await expect(page.getByText(/Um canal subterrâneo/)).toHaveCount(0);
  await expect(page.getByText('Mesa A decidiu preservar a passagem.')).toHaveCount(0);
  await capture(page, testInfo, 'v2-portal-320');
  await page.getByRole('button', { name: 'Voltar à visão do mestre' }).click();
  await expect(page.getByLabel('Notas e consequências próprias')).toHaveValue(
    'Mesa A decidiu preservar a passagem.',
  );
});

test('protótipo diferencia pagamento pendente, suspensão e revogação preservando notas', async ({
  page,
}, testInfo) => {
  await page.goto(url);
  await page.getByRole('button', { name: 'Catálogo', exact: true }).click();
  await page.getByRole('button', { name: 'Iniciar compra simulada' }).click();
  await page.getByRole('button', { name: 'Consultar biblioteca' }).click();
  await expect(page.getByText('Compra: pagamento pendente', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Obter pacote demonstrativo' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Simular confirmação do pagamento' }).click();
  await expect(page.getByRole('button', { name: 'Obter pacote demonstrativo' })).toBeVisible();
  await page.getByRole('button', { name: 'Usar na campanha própria' }).click();
  await page
    .getByLabel('Notas e consequências próprias')
    .fill('Nota pessoal da campanha adquirida.');
  await page.getByRole('button', { name: 'Revelar Mara e a pista' }).click();
  await page.getByRole('button', { name: 'Confirmar demonstração' }).click();
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await page.getByRole('button', { name: 'Simular disputa aberta' }).click();
  await expect(page.getByRole('button', { name: 'Obter pacote demonstrativo' })).toHaveCount(0);
  await expect(
    page.getByText('Nota pessoal da campanha adquirida.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Estúdio', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir campanha adquirida' }).click();
  await expect(page.getByText(/Um canal subterrâneo/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Revelar Mara e a pista' })).toHaveCount(0);
  await expect(page.getByLabel('Notas e consequências próprias')).toHaveValue(
    'Nota pessoal da campanha adquirida.',
  );
  await page.getByRole('button', { name: 'Conferir portal dos jogadores' }).click();
  await expect(page.getByRole('heading', { name: 'Mara e a pista' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Voltar à visão do mestre' }).click();
  await expect(page.getByText(/Um canal subterrâneo/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await page.getByRole('button', { name: 'Simular disputa ganha' }).click();
  await expect(page.getByRole('button', { name: 'Obter pacote demonstrativo' })).toBeVisible();
  await page.getByRole('button', { name: 'Simular reembolso integral' }).click();
  await expect(page.getByRole('button', { name: 'Obter pacote demonstrativo' })).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Notas próprias da mesa adquirida' }),
  ).toBeVisible();
  await capture(page, testInfo, 'v2-biblioteca-revogada');
  await page.getByRole('button', { name: 'Estúdio', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir campanha adquirida' }).click();
  await expect(page.getByText(/Um canal subterrâneo/)).toHaveCount(0);
  await expect(page.getByLabel('Notas e consequências próprias')).toHaveValue(
    'Nota pessoal da campanha adquirida.',
  );
});

test('disputa perdida informa o motivo correto e preserva campanha autoral separada', async ({
  page,
}) => {
  await page.goto(url);
  await page.getByRole('button', { name: 'Catálogo', exact: true }).click();
  await page.getByRole('button', { name: 'Iniciar compra simulada' }).click();
  await page.getByRole('button', { name: 'Simular confirmação do pagamento' }).click();
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await page.getByRole('button', { name: 'Usar na campanha própria' }).click();
  await page.getByRole('button', { name: 'Simular disputa aberta' }).click();
  await page.getByRole('button', { name: 'Simular disputa perdida' }).click();
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await expect(page.getByText('Compra: disputa perdida · revogado', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Estúdio', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir campanha adquirida' }).click();
  await expect(page.getByText(/Um canal subterrâneo/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Voltar ao Estúdio' }).click();
  await page.getByRole('button', { name: 'Preparar sessão', exact: true }).click();
  await expect(page.getByText(/Um canal subterrâneo/)).toBeVisible();
  await expect(page.getByLabel('Notas e consequências próprias')).toHaveValue(
    'Mesa A: preservar a passagem e anunciar manutenção.',
  );
});

test('protótipo navega pelos cinco espaços e recupera estados sem perder escrita', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(url);
  await page.getByRole('button', { name: 'Continuar escrita', exact: true }).click();
  await page
    .getByLabel('Texto do capítulo')
    .fill('Rascunho fictício preservado durante os estados.');
  for (const space of ['Universos', 'Estúdio', 'Publicações', 'Catálogo', 'Biblioteca']) {
    await page.getByRole('button', { name: space, exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: space, level: 1, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Carregando', exact: true }).click();
    await expect(page.getByText('Carregando este espaço...', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Vazio', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Este espaço ainda está vazio' })).toBeVisible();
    await page.getByRole('button', { name: 'Erro', exact: true }).click();
    await page.getByRole('button', { name: 'Tentar novamente' }).click();
    await expect(page.getByRole('button', { name: 'Sucesso', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expectNoHorizontalOverflow(page, space);
  }
  await capture(page, testInfo, 'v2-navegacao-320');
  await page.getByRole('button', { name: 'Estúdio', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar escrita', exact: true }).click();
  await expect(page.getByLabel('Texto do capítulo')).toHaveValue(
    'Rascunho fictício preservado durante os estados.',
  );
});
