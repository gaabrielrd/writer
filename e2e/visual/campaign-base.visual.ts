import type { Page, Locator } from '@playwright/test';
import { chooseDropdown } from '../dropdown';
import {
  capture,
  expect,
  expectDialogWithinViewport,
  expectNoHorizontalOverflow,
  test,
} from './support';
const prefix = '/e2e/visual/fixtures/';
interface Source {
  id: string;
  sceneId: string;
  heroId: string;
}
const unicode =
  'INÍCIO DO CORPUS 🐉 ' + 'ação 😀 memória "autoral" '.repeat(16000) + ' FIM DO CORPUS';
async function source(
  page: Page,
  options: { large?: boolean; blocks?: number } = {},
): Promise<Source> {
  await page.goto('/studio');
  return page.evaluate(
    async ({ prefix, large, blocks, unicode }) => {
      const load = <T>(file: string) => import(prefix + file + '.ts') as Promise<T>;
      const worlds = await load<typeof import('./fixtures/universeService')>('universeService');
      const adventures =
        await load<typeof import('./fixtures/adventureService')>('adventureService');
      const scenes = await load<typeof import('./fixtures/sceneService')>('sceneService');
      const lore = await load<typeof import('./fixtures/loreService')>('loreService');
      const narrative = await load<typeof import('./fixtures/narrativePlanningService')>(
        'narrativePlanningService',
      );
      const block =
        await load<typeof import('./fixtures/adventureBlocksFixture')>('adventureBlocksFixture');
      const world = await worlds.createUniverse(
        { name: 'Mundo da captura', description: 'Privado' },
        'visual-capture-world',
      );
      const adventure = await adventures.createAdventure({
        operationId: 'visual-capture-source',
        title: 'A expedição congelada',
        synopsis: 'Sinopse autoral da expedição',
        universeId: world.id,
      });
      const target = { kind: 'adventure' as const, id: adventure.id };
      const part = await scenes.createSceneGroup({
        target,
        operationId: 'visual-capture-part',
        title: 'Parte da expedição',
      });
      const scene = await scenes.createScene({
        target,
        operationId: 'visual-capture-scene',
        parentId: part.id,
        title: 'A travessia original',
        content: large ? '<p>' + unicode + '</p>' : '<p>Texto original da travessia 🐉</p>',
        planning: {
          objective: 'Objetivo autoral',
          conflict: 'Conflito original',
          pointOfView: 'Lia',
        },
      });
      const hero = await lore.createLoreEntity(
        { kind: 'universe', id: world.id },
        {
          name: 'Lia referenciada',
          category: 'character',
          summary: 'Cartógrafa',
          details: 'DETALHE CONGELADO da cartógrafa',
          aliases: ['Navegadora'],
        },
      );
      const other = await lore.createLoreEntity(
        { kind: 'universe', id: world.id },
        {
          name: 'Ficha sem referência',
          category: 'other',
          summary: 'Não deve ser capturada',
          details: 'CORPO NÃO REFERENCIADO',
        },
      );
      await lore.updateLoreEntity({ kind: 'universe', id: world.id }, hero.id, {
        relations: [
          {
            targetEntityId: other.id,
            relationType: 'Conhece',
            description: 'RELAÇÃO NÃO EXPANDE CAPTURA',
          },
        ],
      });
      await scenes.setSceneReference({
        target,
        sceneId: scene.scene.id,
        operationId: 'visual-capture-reference',
        expectedRevision: scene.scene.revision,
        reference: { kind: 'universe', scopeId: world.id, entityId: hero.id.split(':').at(-1)! },
      });
      await narrative.createNarrativeItem({
        target,
        resource: { kind: 'arc' },
        operationId: 'visual-capture-arc',
        title: 'O retorno das lanternas',
        initialState: 'Início preservado',
        objective: 'Voltar ao porto',
        plannedOutcome: 'Regresso planejado',
      });
      for (let index = 1; index <= (blocks ?? 1); index++)
        await block.createAdventureBlock({
          adventureId: adventure.id,
          sceneId: scene.scene.id,
          operationId: 'visual-capture-block-' + index,
          title: 'Bloco capturado ' + index,
          content: '<p>Pista original ' + index + '</p>',
          audience: index % 2 ? 'players' : 'gm',
        });
      return { id: adventure.id, sceneId: scene.scene.id, heroId: hero.id };
    },
    { prefix, ...options, unicode },
  );
}
async function flag(page: Page, name: string, value: string) {
  await page.evaluate(({ name, value }) => sessionStorage.setItem(name, value), { name, value });
}
async function openStart(page: Page, id: string, title: string) {
  await page.goto('/adventures/' + id);
  await page.getByRole('button', { name: 'Criar campanha desta aventura', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Criar campanha desta aventura', exact: true });
  await expect(dialog.getByLabel('Título da campanha', { exact: true })).toBeEnabled();
  await dialog.getByLabel('Título da campanha', { exact: true }).fill(title);
  await dialog
    .getByLabel('Descrição da campanha', { exact: true })
    .fill('Notas próprias desta mesa');
  return dialog;
}
async function start(page: Page, id: string, title: string) {
  const dialog = await openStart(page, id, title);
  await dialog.getByRole('button', { name: 'Preparar campanha', exact: true }).click();
  const preparation = page.getByRole('dialog', { name: 'Preparação da campanha', exact: true });
  await expect(
    preparation.getByRole('button', { name: 'Continuar preparação', exact: true }),
  ).toBeEnabled();
  return preparation;
}
async function finish(page: Page, preparation: Locator, title: string) {
  await preparation.getByRole('button', { name: 'Continuar preparação', exact: true }).click();
  await expect(
    preparation.getByRole('button', { name: 'Criar campanha com esta base', exact: true }),
  ).toBeEnabled();
  await preparation
    .getByRole('button', { name: 'Criar campanha com esta base', exact: true })
    .click();
  await expect(page).toHaveURL(/\/campaigns\/[^/]+$/);
  await expect(page.getByRole('heading', { name: title, level: 1, exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Base congelada da campanha', exact: true }),
  ).toBeVisible();
  return new URL(page.url()).pathname.split('/').at(-1)!;
}
async function area(page: Page, label: string) {
  await chooseDropdown(page.getByRole('combobox', { name: 'Área da base', exact: true }), label);
}
async function kind(page: Page, label: string) {
  await chooseDropdown(
    page.getByRole('combobox', { name: 'Tipo de material capturado', exact: true }),
    label,
  );
}
async function captures(page: Page) {
  return page.evaluate(
    () =>
      JSON.parse(sessionStorage.getItem('writer.visual.campaign-bases') ?? '[]') as [
        string,
        {
          campaignId: string | null;
          progress: {
            captureId: string;
            reserved: { campaignId: string; baseId: string };
            state: string;
            checkpoint: number;
          };
        },
      ][],
  );
}
test('duas mesas recebem bases independentes, texto congelado e somente lore explicitamente referenciado', async ({
  page,
}) => {
  const original = await source(page),
    first = await finish(
      page,
      await start(page, original.id, 'Mesa das lanternas'),
      'Mesa das lanternas',
    );
  await kind(page, 'Cenas');
  await page.getByRole('button', { name: 'A travessia original', exact: true }).click();
  const body = page.getByRole('region', { name: 'Recurso capturado', exact: true });
  await expect(body).toContainText('Texto original da travessia 🐉');
  await expect(body).toContainText('Objetivo autoral');
  await body.getByRole('button', { name: 'Consultar ficha capturada 1', exact: true }).click();
  await expect(body).toContainText('DETALHE CONGELADO da cartógrafa');
  await expect(body).toContainText('Navegadora');
  await expect(body).not.toContainText('RELAÇÃO NÃO EXPANDE CAPTURA');
  await area(page, 'Lore');
  const baseReader = page
    .getByRole('heading', { name: 'Base congelada da campanha', exact: true })
    .locator('..');
  await expect(
    baseReader.getByRole('button', { name: 'Lia referenciada', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ficha sem referência', exact: true })).toHaveCount(
    0,
  );
  await page.evaluate(
    async ({ prefix, original }) => {
      const stores = (await import(
        prefix + 'studioStore.ts'
      )) as typeof import('./fixtures/studioStore');
      const lore = (await import(
        prefix + 'loreService.ts'
      )) as typeof import('./fixtures/loreService');
      const scenes = (await import(
        prefix + 'sceneService.ts'
      )) as typeof import('./fixtures/sceneService');
      const detail = await scenes.getScene({
        target: { kind: 'adventure', id: original.id },
        sceneId: original.sceneId,
      });
      if (!detail) throw new Error('Cena de origem não encontrada');
      await scenes.updateScene({
        target: { kind: 'adventure', id: original.id },
        sceneId: original.sceneId,
        operationId: 'visual-rewrite-after-capture',
        expectedRevision: detail.revision,
        patch: { content: '<p>Texto vivo reescrito após captura</p>' },
      });
      stores.fixturePatchProject('adventure', original.id, { title: 'Título vivo atualizado' });
      await lore.updateLoreEntity(
        { kind: 'universe', id: 'visual-capture-world' },
        original.heroId,
        { name: 'Nome vivo atualizado', details: 'Detalhe vivo atualizado' },
      );
    },
    { prefix, original },
  );
  const second = await finish(page, await start(page, original.id, 'Outra mesa'), 'Outra mesa');
  expect(second).not.toBe(first);
  const stored = await captures(page);
  expect(
    stored
      .map(([, value]) => value.progress.reserved.baseId)
      .filter((value, index, all) => all.indexOf(value) === index),
  ).toHaveLength(2);
  await page.goto('/campaigns/' + first);
  await expect(
    page.getByRole('heading', { name: 'A expedição congelada', exact: true }),
  ).toBeVisible();
  await kind(page, 'Cenas');
  await page.getByRole('button', { name: 'A travessia original', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Recurso capturado' })).toContainText(
    'Texto original da travessia 🐉',
  );
  await expect(page.getByRole('region', { name: 'Recurso capturado' })).not.toContainText(
    'Texto vivo reescrito',
  );
  await area(page, 'Lore');
  await baseReader.getByRole('button', { name: 'Lia referenciada', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Recurso capturado' })).toContainText(
    'DETALHE CONGELADO da cartógrafa',
  );
});
test('paginação e leitura integral preservam Unicode grande e todos os blocos do corpus criado', async ({
  page,
}) => {
  const original = await source(page, { large: true, blocks: 28 });
  await finish(
    page,
    await start(page, original.id, 'Mesa do corpus grande'),
    'Mesa do corpus grande',
  );
  await kind(page, 'Blocos');
  await expect(
    page.getByRole('button', { name: 'Bloco capturado 28 · Adicional', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Carregar mais material', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Bloco capturado 28 · Adicional', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Carregar mais material', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Texto principal · Principal', exact: true }).click();
  const region = page.getByRole('region', { name: 'Recurso capturado' });
  await expect(region).toContainText('FIM DO CORPUS');
  expect(
    await region
      .locator('p')
      .filter({ hasText: /^INÍCIO DO CORPUS/ })
      .textContent(),
  ).toBe(unicode);
});
test('respostas perdidas e reload confirmam o mesmo start e a ativação sem criar duas campanhas', async ({
  page,
}) => {
  const original = await source(page),
    title = 'Mesa em recuperação';
  const dialog = await openStart(page, original.id, title);
  await flag(page, 'writer.visual.capture-lost-response', 'startCampaignCapture');
  await dialog.getByRole('button', { name: 'Preparar campanha', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Confirmar mesmo pedido', exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Criar campanha desta aventura', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Criar campanha desta aventura', exact: true })
    .getByRole('button', { name: 'Confirmar mesmo pedido', exact: true })
    .click();
  const preparation = page.getByRole('dialog', { name: 'Preparação da campanha', exact: true });
  await preparation.getByRole('button', { name: 'Continuar preparação', exact: true }).click();
  await expect(
    preparation.getByRole('button', { name: 'Criar campanha com esta base', exact: true }),
  ).toBeEnabled();
  const before = await captures(page);
  expect(before).toHaveLength(1);
  expect(before[0][1].progress.reserved.campaignId).not.toBe(before[0][1].progress.captureId);
  expect(before[0][1].progress.reserved.baseId).not.toBe(before[0][1].progress.reserved.campaignId);
  await flag(page, 'writer.visual.capture-lost-response', 'activateCampaignCapture');
  await preparation
    .getByRole('button', { name: 'Criar campanha com esta base', exact: true })
    .click();
  await expect(
    preparation.getByRole('button', { name: 'Confirmar mesmo pedido', exact: true }),
  ).toBeVisible();
  await page.reload();
  // A confirmação local deve continuar acessível mesmo quando a lista remota omite activated.
  await page.getByRole('button', { name: 'Confirmar pedido pendente 1', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Preparação da campanha', exact: true })
    .getByRole('button', { name: 'Confirmar mesmo pedido', exact: true })
    .click();
  await expect(page).toHaveURL('/campaigns/' + before[0][1].progress.reserved.campaignId);
  await expect(page.getByRole('heading', { name: title, level: 1, exact: true })).toBeVisible();
  expect(await captures(page)).toHaveLength(1);
  const roots = await page.evaluate(() => {
    const data = JSON.parse(sessionStorage.getItem('writer.visual.studio-projects') ?? '{}') as {
      campaigns: { provenance: { kind: string } }[];
    };
    return data.campaigns.filter((campaign) => campaign.provenance.kind === 'original').length;
  });
  expect(roots).toBe(1);
});
test('mudança da origem interrompe preparação sem ativar campanha parcial', async ({ page }) => {
  const original = await source(page),
    dialog = await start(page, original.id, 'Mesa interrompida');
  await flag(page, 'writer.visual.capture-source-changed', original.id);
  await dialog.getByRole('button', { name: 'Continuar preparação', exact: true }).click();
  await expect(
    dialog.getByText('A aventura mudou durante a preparação.', { exact: false }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Criar campanha com esta base', exact: true }),
  ).toHaveCount(0);
  const record = (await captures(page))[0][1];
  expect(record.progress.state).toBe('aborted');
  expect(record.campaignId).toBeNull();
  await expect(
    page.getByRole('heading', { name: 'Mesa interrompida', level: 1, exact: true }),
  ).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancelar preparação e limpar', exact: true }).click();
  await expect(
    dialog.getByText('A preparação foi cancelada e a limpeza foi concluída.', { exact: true }),
  ).toBeVisible();
});
test('Estúdio retoma e limpa preparação privada mesmo após a origem ficar indisponível', async ({
  page,
}) => {
  const original = await source(page),
    dialog = await start(page, original.id, 'Mesa sem origem');
  await dialog.getByRole('button', { name: 'Fechar e manter preparação', exact: true }).click();
  await flag(page, 'writer.visual.capture-revoked', original.id);
  await page.goto('/studio');
  await expect(
    page.getByRole('heading', { name: 'Campanhas em preparação', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Mesa sem origem · Em preparação', exact: true }).click();
  const preparation = page.getByRole('dialog', { name: 'Preparação da campanha', exact: true });
  await expect(
    preparation.getByText('A origem está indisponível.', { exact: false }),
  ).toBeVisible();
  await preparation
    .getByRole('button', { name: 'Cancelar preparação e limpar', exact: true })
    .click();
  await expect(
    preparation.getByText('A preparação foi cancelada e a limpeza foi concluída.', { exact: true }),
  ).toBeVisible();
  await preparation
    .getByRole('button', { name: 'Fechar e manter preparação', exact: true })
    .click();
  await expect(page.getByRole('button', { name: /^Mesa sem origem · / })).toHaveCount(0);
  expect((await captures(page))[0][1].progress.state).toBe('deleted');
});
test('teclado em 320px e troca de UID descartam resposta tardia e preservam recuperação privada', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const original = await source(page),
    dialog = await openStart(page, original.id, 'Mesa privada da primeira conta');
  const title = dialog.getByLabel('Título da campanha', { exact: true });
  await title.focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByLabel('Descrição da campanha', { exact: true })).toBeFocused();
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'captura-formulario-320');
  await flag(page, 'writer.visual.capture-hold', 'startCampaignCapture');
  await dialog.getByRole('button', { name: 'Preparar campanha', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await captures(page)).length).toBe(1);
  await page.evaluate(() => {
    sessionStorage.setItem('writer.visual.account', 'second');
    window.dispatchEvent(new Event('writer.visual.auth-change'));
  });
  await expect(
    page.getByRole('heading', { name: 'Aventura indisponível', exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('writer.visual.capture-release')));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Mesa privada da primeira conta', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Outro Autor de Exemplo/ })).toBeVisible();
  const secondRecords = await page.evaluate(() => {
    const rows = JSON.parse(sessionStorage.getItem('writer.visual.campaign-bases') ?? '[]') as [
      string,
      { uid: string },
    ][];
    return rows.filter(([, row]) => row.uid === 'visual-second-author');
  });
  expect(secondRecords).toEqual([]);
  await page.evaluate(() => {
    sessionStorage.removeItem('writer.visual.account');
    window.dispatchEvent(new Event('writer.visual.auth-change'));
  });
  await page.getByRole('button', { name: 'Criar campanha desta aventura', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Criar campanha desta aventura', exact: true })
    .getByRole('button', { name: 'Confirmar mesmo pedido', exact: true })
    .click();
  const preparation = page.getByRole('dialog', { name: 'Preparação da campanha', exact: true });
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'captura-retomada-320');
  await finish(page, preparation, 'Mesa privada da primeira conta');
  await expectNoHorizontalOverflow(page, 'base-campanha-320');
  await capture(page, testInfo, 'base-campanha-320');
});
