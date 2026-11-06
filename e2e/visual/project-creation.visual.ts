import { capture, expect, expectNoHorizontalOverflow, test } from './support';

test('livro manual permite gerar capa e mostra somente o custo da capa', async ({
  page,
}, testInfo) => {
  await page.goto('/studio/new');
  await page.getByRole('button', { name: /^Manualmente/ }).click();
  await page.getByRole('button', { name: /^Livro/ }).click();
  await page.getByLabel('Ideia ou título inicial').fill('As ilhas do silêncio');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: /^Capa opcional/ }).click();
  await page.getByRole('button', { name: 'Gerar capa · 5 créditos', exact: true }).click();
  await expect(
    page.getByRole('img', { name: 'Capa proposta de As ilhas do silêncio' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Criar livro · 5 créditos', exact: true }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page, 'capa-na-criacao-manual');
  await capture(page, testInfo, 'criacao-manual-capa-gerada');
  await page.getByRole('button', { name: 'Sem capa', exact: true }).click();
  await expect(
    page.getByRole('img', { name: 'Capa proposta de As ilhas do silêncio' }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Criar livro', exact: true })).toBeVisible();
});

test('criação mantém largura de formulário, gêneros próprios e aviso de retomada', async ({
  page,
}, testInfo) => {
  await page.goto('/studio/new');
  const form = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Novo projeto', exact: true }) })
    .last();
  expect((await form.boundingBox())!.width).toBeLessThanOrEqual(760);
  await page.getByRole('button', { name: /^Manualmente/ }).click();
  await page.getByRole('button', { name: /^Livro/ }).click();
  await page.getByLabel('Ideia ou título inicial').fill('Ilhas de papel');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: /^Premissa e detalhes/ }).click();
  const genre = page.getByRole('combobox', { name: 'Gênero ou estilo', exact: true });
  await genre.click();
  await page.getByRole('option', { name: 'Mistério', exact: true }).click();
  await expect(genre).toContainText('Mistério');
  await genre.click();
  await page.getByRole('option', { name: 'Criar meu estilo', exact: true }).click();
  await page.getByLabel('Seu gênero ou estilo', { exact: true }).fill('Mistério poético');
  await page.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
  await expect(page.getByLabel('Seu gênero ou estilo', { exact: true })).toHaveValue(
    'Mistério poético',
  );
  await expectNoHorizontalOverflow(page, 'criacao-formulario-compacto');
  await capture(page, testInfo, 'criacao-estilo-proprio');
  await page.goto('/studio/new');
  const notice = page.getByRole('region', { name: 'Criação em andamento', exact: true });
  await expect(notice).toBeVisible();
  await expect(notice.locator('svg[aria-hidden="true"]')).toBeVisible();
  expect(
    await notice.evaluate((el) => parseFloat(getComputedStyle(el).padding)),
  ).toBeGreaterThanOrEqual(16);
  await capture(page, testInfo, 'criacao-aviso-retomada');
  await page.getByRole('button', { name: 'Retomar criação', exact: true }).click();
  await page.getByRole('button', { name: /^Premissa e detalhes/ }).click();
  await expect(page.getByLabel('Seu gênero ou estilo', { exact: true })).toHaveValue(
    'Mistério poético',
  );
});

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
      const dock = page.getByRole('complementary', { name: 'Assistente da página' });
      await expect(dock).toBeVisible();
      // Both methods carry their conception into the newly created project.
      await expect(dock).toHaveAttribute('data-mode', 'expanded');
      await dock.getByRole('button', { name: 'Minimizar assistente' }).click();
      await expect(dock).toHaveAttribute('data-mode', 'minimized');
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
  await expect(page.getByLabel('Pedido ao assistente da página')).toBeVisible();
  await capture(page, testInfo, 'assistente-no-dialogo');
  await page.getByRole('button', { name: 'Minimizar assistente' }).click();
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
    const dock = page.getByRole('complementary', { name: 'Assistente da página' });
    const toggle = dock.getByRole('button', { name: 'Assistente da página', exact: true });
    if ((await toggle.getAttribute('aria-expanded')) === 'true') await toggle.click();
    await expect(dock).toHaveAttribute('data-mode', 'minimized');
    await toggle.click();
    const field = dock.getByLabel('Pedido ao assistente da página');
    await expect(field).toBeVisible();
    await field.fill(prompt);
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
  const dock = page.getByRole('complementary', { name: 'Assistente da página' });
  const minimize = dock.getByRole('button', { name: 'Minimizar assistente', exact: true });
  if (await minimize.isVisible()) await minimize.click();
  await expect(dock).toHaveAttribute('data-mode', 'minimized');
  await dock.getByRole('button', { name: 'Assistente da página', exact: true }).click();
  await dock.getByRole('button', { name: 'Expandir conversa', exact: true }).click();
  await expect(dock).toHaveAttribute('data-mode', 'expanded');
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
  await page.getByRole('combobox', { name: 'Gênero ou estilo', exact: true }).click();
  await page.getByRole('option', { name: 'Criar meu estilo', exact: true }).click();
  await ask('Ajuste o gênero');
  await expect(page.getByLabel('Texto proposto')).toHaveValue('Fantasia marítima');
  await page.getByRole('button', { name: 'Executar: Seu gênero ou estilo' }).click();
  await expect(page.getByLabel('Seu gênero ou estilo', { exact: true })).toHaveValue(
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
