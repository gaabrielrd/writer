import { capture, expect, expectNoHorizontalOverflow, test } from './support';
for (const method of ['manual', 'assisted'] as const)
  for (const kind of ['Livro', 'Aventura', 'Campanha']) {
    test(`novo projeto ${kind}/${method}: concepção, confirmação e continuidade`, async ({
      page,
    }, testInfo) => {
      await page.goto('/studio');
      await page.getByRole('button', { name: 'Novo projeto', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Como deseja começar?' })).toBeFocused();
      await expect(page.getByRole('button', { name: /^Livro/ })).toHaveCount(0);
      await page
        .getByRole('button', { name: method === 'manual' ? /^Manualmente/ : /^Com ajuda da IA/ })
        .click();
      await page.getByRole('button', { name: new RegExp('^' + kind) }).click();
      await page
        .getByLabel(method === 'manual' ? 'Ideia ou título inicial' : 'Sua ideia')
        .fill('Uma viagem pelas ilhas das lanternas.');
      await page.getByRole('button', { name: /^Universo e persona/ }).click();
      await expect(page.getByLabel('Universo compartilhado')).toBeVisible();
      await expect(page.getByLabel('Persona de escrita')).toBeVisible();
      await capture(page, testInfo, `novo-${kind}-${method}-contexto`);
      await page
        .getByRole('button', {
          name: method === 'manual' ? 'Continuar' : 'Começar conversa',
          exact: true,
        })
        .click();
      if (method === 'assisted') {
        await expect(page.getByText('Que conflito move a protagonista?')).toBeVisible();
        await page.getByRole('button', { name: 'Revisar proposta inicial' }).click();
      }
      await page.getByLabel('Título do projeto').fill('Projeto das lanternas');
      await expectNoHorizontalOverflow(page, 'revisao-novo-projeto');
      await capture(page, testInfo, `novo-${kind}-${method}-revisao`);
      await page.getByRole('button', { name: new RegExp('^Criar ' + kind.toLowerCase()) }).click();
      await expect(
        page.getByRole('heading', { name: 'Projeto das lanternas', exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('complementary', { name: 'Assistente da página' })).toBeVisible();
      await page.getByRole('button', { name: 'Fechar assistente da página' }).click();
      await expectNoHorizontalOverflow(page, 'projeto-confirmado');
    });
  }
test('assistente abre ação existente, continua dentro do diálogo e preserva confirmação', async ({
  page,
}, testInfo) => {
  await page.goto('/campaigns/visual-campaign-1');
  await page.getByRole('button', { name: 'Assistente da página', exact: true }).click();
  await page.getByLabel('Pedido ao assistente da página').fill('Editar campanha');
  await page.getByRole('button', { name: 'Enviar pedido' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Executar: Editar campanha' }).click();
  await expect(page.getByRole('dialog', { name: 'Editar campanha' })).toBeVisible();
  await page.getByRole('button', { name: 'Assistente da página', exact: true }).click();
  await expect(page.getByLabel('Pedido ao assistente da página')).toBeVisible();
  await capture(page, testInfo, 'assistente-no-dialogo');
  await page.getByRole('button', { name: 'Fechar assistente da página' }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Crônicas do Porto das Lanternas' }),
  ).toBeVisible();
});

test('concepção chega ao primeiro capítulo e à escrita sem repetir a ideia', async ({
  page,
}, testInfo) => {
  await page.goto('/studio');
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click();
  await page.getByRole('button', { name: /^Com ajuda da IA/ }).click();
  await page.getByRole('button', { name: /^Livro/ }).click();
  await page.getByLabel('Sua ideia').fill('A primeira lanterna de uma ilha perdida.');
  await page.getByRole('button', { name: 'Começar conversa' }).click();
  await page.getByRole('button', { name: 'Revisar proposta inicial' }).click();
  await page.getByRole('button', { name: 'Criar livro · 2 créditos' }).click();
  await expect(
    page
      .getByRole('complementary', { name: 'Assistente da página' })
      .getByText('A primeira lanterna de uma ilha perdida.'),
  ).toBeVisible();
  async function ask(prompt: string, action: string) {
    if (!(await page.getByLabel('Pedido ao assistente da página').isVisible()))
      await page.getByRole('button', { name: 'Assistente da página', exact: true }).click();
    await page.getByLabel('Pedido ao assistente da página').fill(prompt);
    await page.getByRole('button', { name: 'Enviar pedido' }).click();
    await page.getByRole('button', { name: 'Executar: ' + action }).click();
  }
  await ask('Crie o primeiro capítulo', 'Novo capítulo');
  await expect(page.getByRole('dialog', { name: 'Novo capítulo', exact: true })).toBeVisible();
  await ask('Preencha o título do capítulo', 'Título do capítulo');
  await expect(page.getByLabel('Título do capítulo', { exact: true })).toHaveValue(
    'Abertura das ilhas',
  );
  await ask('Salve o capítulo', 'Criar capítulo');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Escrever Abertura das ilhas', exact: true }).click();
  const editor = page.locator('[contenteditable="true"]').first();
  await editor.fill('A primeira lanterna brilhou quando o mar desapareceu.');
  await expect(page.getByText('Salvo', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Assistente da página', exact: true }).click();
  await expect(
    page
      .getByRole('complementary', { name: 'Assistente da página' })
      .getByText('A primeira lanterna de uma ilha perdida.'),
  ).toBeVisible();
  await capture(page, testInfo, 'primeira-escrita-com-concepcao');
});

test('conversa de concepção propõe ações revisáveis sem perder o rascunho', async ({
  page,
}, testInfo) => {
  await page.goto('/studio/new');
  await page.getByRole('button', { name: /^Com ajuda da IA/ }).click();
  await page.getByRole('button', { name: /^Livro/ }).click();
  await page.getByLabel('Sua ideia').fill('Uma navegadora procura o último mar.');
  await page.getByRole('button', { name: 'Começar conversa' }).click();
  async function ask(prompt: string) {
    await page.getByLabel('Sua resposta', { exact: true }).fill(prompt);
    await page.getByRole('button', { name: 'Enviar resposta', exact: true }).click();
  }
  await ask('Gere a proposta');
  await expect(page.getByLabel('Título do projeto')).toHaveCount(0);
  await page.getByRole('button', { name: 'Executar: Revisar proposta inicial' }).click();
  await page.getByLabel('Título do projeto').fill('Meu título preservado');
  await ask('Abra os detalhes');
  await page.getByRole('button', { name: /^Executar: Premissa e detalhes/ }).click();
  await ask('Ajuste o gênero');
  await expect(page.getByLabel('Texto proposto')).toHaveValue('Fantasia marítima');
  await page.getByRole('button', { name: 'Executar: Gênero ou estilo' }).click();
  await expect(page.getByLabel('Gênero ou estilo', { exact: true })).toHaveValue(
    'Fantasia marítima',
  );
  await expect(page.getByLabel('Título do projeto')).toHaveValue('Meu título preservado');
  await expectNoHorizontalOverflow(page, 'concepcao-com-acoes');
  await capture(page, testInfo, 'concepcao-com-acoes');
  await page.getByRole('button', { name: 'Criar livro · 2 créditos' }).click();
  await expect(
    page.getByRole('heading', { name: 'Meu título preservado', exact: true }),
  ).toBeVisible();
});
