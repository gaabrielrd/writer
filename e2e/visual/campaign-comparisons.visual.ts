import type { Page } from '@playwright/test';
import { chooseDropdown as choose } from '../dropdown';
import {
  capture,
  expect,
  expectDialogWithinViewport,
  expectNoHorizontalOverflow,
  test,
} from './support';
const prefix = '/e2e/visual/fixtures/';
const chooseDropdown = (page: Page, name: string, label: string) =>
  choose(page.getByRole('combobox', { name, exact: true }), label);
const corpus = 'INÍCIO C3 🐉 ' + 'ação 😀 memória autoral\n'.repeat(9000) + ' FIM C3';
interface Source {
  campaignId: string;
  baseId: string;
  adventureId: string;
  sceneId: string;
  worldId: string;
  heroId: string;
  heroKey: string;
  sceneKey: string;
  imageKey: string;
  rootState: string;
  baseHash: string;
  noteId: string;
}
interface Call {
  uid: string;
  method: string;
  operationId?: string;
  comparisonId?: string;
  expectedCheckpoint?: number;
}
async function seed(page: Page, blocks = 1): Promise<Source> {
  await page.goto('/studio');
  return page.evaluate(
    async ({ prefix, corpus, blocks }) => {
      const load = <T>(file: string) => import(prefix + file + '.ts') as Promise<T>;
      const worlds = await load<typeof import('./fixtures/universeService')>('universeService'),
        adventures = await load<typeof import('./fixtures/adventureService')>('adventureService'),
        scenes = await load<typeof import('./fixtures/sceneService')>('sceneService'),
        lore = await load<typeof import('./fixtures/loreService')>('loreService'),
        narrative = await load<typeof import('./fixtures/narrativePlanningService')>(
          'narrativePlanningService',
        ),
        blocksApi =
          await load<typeof import('./fixtures/adventureBlocksFixture')>('adventureBlocksFixture'),
        captures =
          await load<typeof import('./fixtures/campaignBaseFixture')>('campaignBaseFixture'),
        notes =
          await load<typeof import('./fixtures/campaignNotesFixture')>('campaignNotesFixture'),
        hashes = await load<typeof import('./fixtures/sceneStore')>('sceneStore');
      const world = await worlds.createUniverse(
        { name: 'Universo C3', description: 'Privado' },
        'visual-c3-world',
      );
      const adventure = await adventures.createAdventure({
        operationId: 'visual-c3-origin',
        title: 'Aventura das duas gerações',
        synopsis: 'SINOPSE ATUAL CONGELADA',
        universeId: world.id,
      });
      const target = { kind: 'adventure' as const, id: adventure.id };
      const part = await scenes.createSceneGroup({
        target,
        operationId: 'visual-c3-part',
        title: 'Parte das marés',
      });
      let scene = (
        await scenes.createScene({
          target,
          operationId: 'visual-c3-scene',
          parentId: part.id,
          title: 'Travessia comparada',
          content: '<p>TEXTO ATUAL CONGELADO 🐉</p>',
        })
      ).scene;
      const hero = await lore.createLoreEntity(
        { kind: 'universe', id: world.id },
        {
          name: 'Lia da comparação',
          category: 'character',
          summary: 'Resumo da geração atual',
          details: 'CORPO LORE ATUAL',
          aliases: ['Cartógrafa'],
        },
      );
      await lore.createLoreEntity(
        { kind: 'universe', id: world.id },
        {
          name: 'Ficha não vinculada C3',
          category: 'other',
          summary: 'Não capturada',
          details: 'SEGREDO FORA DA CAPTURA C3',
        },
      );
      scene = (
        await scenes.setSceneReference({
          target,
          sceneId: scene.id,
          operationId: 'visual-c3-ref',
          expectedRevision: scene.revision,
          reference: { kind: 'universe', scopeId: world.id, entityId: hero.id.split(':').at(-1)! },
        })
      ).scene;
      await blocksApi.setAdventureBlockImage({
        adventureId: adventure.id,
        resource: { kind: 'scene', id: scene.id },
        operationId: 'visual-c3-image',
        expectedRevision: scene.revision,
        image: {
          imageId: 'visual-image-000001',
          alt: 'Mapa congelado C3',
          caption: 'Legenda autoral C3',
        },
      });
      for (let i = 0; i < blocks; i++)
        await blocksApi.createAdventureBlock({
          adventureId: adventure.id,
          sceneId: scene.id,
          operationId: 'visual-c3-block-' + i,
          title: 'Pista C3 ' + String(i).padStart(2, '0'),
          content: '<p>Pista congelada ' + i + '</p>',
          audience: i % 2 ? 'gm' : 'players',
        });
      const arc = await narrative.createNarrativeItem({
        target,
        resource: { kind: 'arc' },
        operationId: 'visual-c3-arc',
        title: 'Arco das gerações',
        initialState: 'INÍCIO NARRATIVO C3',
        objective: 'Objetivo C3',
        plannedOutcome: 'Desfecho C3',
      });
      await narrative.createNarrativeItem({
        target,
        resource: { kind: 'milestone', arcId: arc.item.id },
        operationId: 'visual-c3-milestone',
        title: 'Marco das gerações',
        notes: 'Notas narrativas C3',
      });
      await narrative.createNarrativeItem({
        target,
        resource: { kind: 'event' },
        operationId: 'visual-c3-event',
        title: 'Evento das gerações',
        description: 'Cronologia preservada C3',
        dateLabel: '3º dia do inverno',
      });
      const captureSource = await captures.getCampaignCaptureSource({ adventureId: adventure.id });
      let progress = await captures.startCampaignCapture({
        operationId: 'visual-c3-base',
        adventureId: adventure.id,
        expectedSourceToken: captureSource.sourceToken,
        title: 'Mesa das gerações',
        description: 'Organização própria preservada',
        universeId: world.id,
      });
      for (let i = 0; progress.state === 'preparing' && i < 30; i++)
        progress = await captures.advanceCampaignCapture({
          captureId: progress.captureId,
          operationId: 'visual-c3-b-step-' + i,
          expectedCheckpoint: progress.checkpoint,
        });
      const activated = await captures.activateCampaignCapture({
        captureId: progress.captureId,
        operationId: 'visual-c3-b-activate',
        expectedCheckpoint: progress.checkpoint,
      });
      if (activated.kind !== 'activated') throw new Error('Base inicial não ativada');
      const campaign = activated.campaign,
        base = await captures.fixtureCampaignComparisonCurrent(campaign.id);
      const ownNotes = await notes.listCampaignNotes({ campaignId: campaign.id });
      await notes.saveCampaignNote({
        campaignId: campaign.id,
        campaignToken: ownNotes.campaignToken,
        noteId: 'visual-c3-own-note',
        operationId: 'visual-c3-own-note',
        expectedRevision: 0,
        title: 'Consequência própria C3',
        content: 'NOTA PRÓPRIA INDEPENDENTE C3',
      });
      const latest = (await scenes.getScene({ target, sceneId: scene.id }))!;
      await scenes.updateScene({
        target,
        sceneId: scene.id,
        operationId: 'visual-c3-live-edit',
        expectedRevision: latest.revision,
        patch: { content: '<p>' + corpus + '</p>' },
      });
      await lore.updateLoreEntity({ kind: 'universe', id: world.id }, hero.id, {
        details: 'CORPO LORE CANDIDATO',
      });
      const studio = await load<typeof import('./fixtures/studioStore')>('studioStore');
      studio.fixturePatchProject('adventure', adventure.id, {
        synopsis: 'SINOPSE CANDIDATA CONGELADA',
      });
      return {
        campaignId: campaign.id,
        baseId: campaign.activeBaseId!,
        adventureId: adventure.id,
        sceneId: scene.id,
        worldId: world.id,
        heroId: hero.id,
        heroKey: base.snapshot.items.find(({ item }) => item.kind === 'lore')!.item.sourceKey,
        sceneKey: base.snapshot.items.find(({ item }) => item.kind === 'scene')!.item.sourceKey,
        imageKey: Object.keys(base.snapshot.images)[0],
        rootState: sessionStorage.getItem('writer.visual.studio-projects')!,
        baseHash: await hashes.fixtureContentHash(JSON.stringify(base.snapshot)),
        noteId: 'visual-c3-own-note',
      };
    },
    { prefix, corpus, blocks },
  );
}
const dialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Candidata de base da campanha', exact: true });
const reader = (page: Page) =>
  dialog(page).getByRole('region', { name: 'Comparação das bases', exact: true });
async function flag(page: Page, name: string, value: string) {
  await page.evaluate(({ name, value }) => sessionStorage.setItem(name, value), { name, value });
}
async function release(page: Page, name: string) {
  await page.evaluate((name) => {
    sessionStorage.removeItem(name);
    window.dispatchEvent(new Event('writer.visual.release-comparison'));
  }, name);
}
async function calls(page: Page): Promise<Call[]> {
  return page.evaluate(
    () =>
      (
        JSON.parse(
          localStorage.getItem('writer.visual.campaign-comparisons') ?? '{"calls":[]}',
        ) as { calls: Call[] }
      ).calls,
  );
}
async function start(page: Page, source: Source) {
  await page.goto('/campaigns/' + source.campaignId);
  await page.getByRole('button', { name: 'Preparar nova candidata', exact: true }).click();
  const current = dialog(page);
  await expect(
    current.getByRole('button', { name: 'Iniciar preparação da candidata', exact: true }),
  ).toBeEnabled();
  await current
    .getByRole('button', { name: 'Iniciar preparação da candidata', exact: true })
    .click();
  return current;
}
async function ready(page: Page) {
  await expect(
    dialog(page).getByRole('heading', { name: 'Pronta para comparar', exact: true }),
  ).toBeVisible();
}
async function compare(page: Page) {
  await dialog(page).getByRole('button', { name: 'Comparar candidata', exact: true }).click();
  await expect(
    reader(page).getByRole('heading', { name: 'Comparar bases congeladas', exact: true }),
  ).toBeVisible();
  await expect(
    reader(page).getByText('SINOPSE CANDIDATA CONGELADA', { exact: true }),
  ).toBeVisible();
}
async function group(page: Page, value: string) {
  await chooseDropdown(page, 'Grupo da comparação', value);
}
async function close(page: Page) {
  await dialog(page).getByRole('button', { name: 'Fechar candidata', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
}
async function reopen(page: Page) {
  const section = page
    .getByRole('heading', { name: 'Candidatas de base', exact: true })
    .locator('..');
  await section.getByRole('button', { name: 'Atualizar candidatas', exact: true }).click();
  await section.getByRole('button', { name: /^Candidata .+ · / }).click();
  await expect(dialog(page)).toBeVisible();
}
async function detail(page: Page, name: string) {
  await reader(page)
    .getByRole('button', { name: 'Comparar ' + name, exact: true })
    .click();
  const details = reader(page).getByRole('region', { name: 'Detalhes da comparação', exact: true });
  await expect(
    details.getByRole('heading', { name: 'Detalhes autorizados', exact: true }),
  ).toBeVisible();
  return details;
}
async function invariant(page: Page, source: Source) {
  const result = await page.evaluate(
    async ({ prefix, source }) => {
      const studio = (await import(
          prefix + 'studioStore.ts'
        )) as typeof import('./fixtures/studioStore'),
        bases = (await import(
          prefix + 'campaignBaseFixture.ts'
        )) as typeof import('./fixtures/campaignBaseFixture'),
        hashes = (await import(prefix + 'sceneStore.ts')) as typeof import('./fixtures/sceneStore'),
        notes = (await import(
          prefix + 'campaignNotesFixture.ts'
        )) as typeof import('./fixtures/campaignNotesFixture');
      const campaign = await studio.fixtureGet('campaign', source.campaignId),
        base = await bases.fixtureCampaignComparisonCurrent(source.campaignId),
        own = await notes.listCampaignNotes({ campaignId: source.campaignId });
      const note = await notes.getCampaignNote({
        campaignId: source.campaignId,
        campaignToken: own.campaignToken,
        noteId: source.noteId,
      });
      return {
        rootsUnchanged:
          sessionStorage.getItem('writer.visual.studio-projects') === source.rootState,
        activeBaseId: campaign?.activeBaseId,
        hash: await hashes.fixtureContentHash(JSON.stringify(base.snapshot)),
        note: note.note?.content,
      };
    },
    { prefix, source },
  );
  expect(result).toEqual({
    rootsUnchanged: true,
    activeBaseId: source.baseId,
    hash: source.baseHash,
    note: 'NOTA PRÓPRIA INDEPENDENTE C3',
  });
}

test('candidata captura inteira na mesma campanha e compara gerações congeladas sem adotar', async ({
  page,
}, info) => {
  const source = await seed(page);
  await start(page, source);
  await ready(page);
  await compare(page);
  await expect(reader(page).getByText('SINOPSE ATUAL CONGELADA', { exact: true })).toBeVisible();
  await group(page, 'Conteúdo');
  await chooseDropdown(page, 'Tipo de conteúdo comparado', 'Cenas');
  const details = await detail(page, 'Travessia comparada');
  await expect(details.getByText('TEXTO ATUAL CONGELADO 🐉', { exact: true })).toBeVisible();
  await expect(details.getByText(corpus, { exact: true })).toBeVisible();
  await details.getByRole('button', { name: 'Fechar detalhes', exact: true }).click();
  await chooseDropdown(page, 'Tipo de conteúdo comparado', 'Arcos');
  const arc = await detail(page, 'Arco das gerações');
  await expect(arc.getByText('INÍCIO NARRATIVO C3', { exact: true })).toHaveCount(2);
  await arc.getByRole('button', { name: 'Fechar detalhes', exact: true }).click();
  await chooseDropdown(page, 'Tipo de conteúdo comparado', 'Fichas de lore');
  const lore = await detail(page, 'Lia da comparação');
  await expect(lore.getByText('CORPO LORE ATUAL', { exact: true })).toBeVisible();
  await expect(lore.getByText('CORPO LORE CANDIDATO', { exact: true })).toBeVisible();
  await expect(reader(page).getByText('Ficha não vinculada C3', { exact: true })).toHaveCount(0);
  await expect(reader(page).getByText('SEGREDO FORA DA CAPTURA C3', { exact: true })).toHaveCount(
    0,
  );
  await lore.getByRole('button', { name: 'Fechar detalhes', exact: true }).click();
  await group(page, 'Referências');
  await expect(
    reader(page).getByRole('button', { name: 'Consultar ficha candidata', exact: true }),
  ).toBeVisible();
  await group(page, 'Ilustrações');
  await reader(page).getByRole('button', { name: 'Comparar ilustração 1', exact: true }).click();
  await expect(
    reader(page).getByRole('img', { name: 'Ilustração da base atual', exact: true }),
  ).toBeVisible();
  await expect(
    reader(page).getByRole('img', { name: 'Ilustração da base candidata', exact: true }),
  ).toBeVisible();
  await invariant(page, source);
  await page.evaluate(
    async ({ prefix, id }) => {
      const studio = (await import(
        prefix + 'studioStore.ts'
      )) as typeof import('./fixtures/studioStore');
      studio.fixturePatchProject('adventure', id, { synopsis: 'SINOPSE POSTERIOR NÃO CAPTURADA' });
    },
    { prefix, id: source.adventureId },
  );
  await group(page, 'Dados da origem');
  await expect(
    reader(page).getByText('SINOPSE CANDIDATA CONGELADA', { exact: true }),
  ).toBeVisible();
  await expect(
    reader(page).getByText('SINOPSE POSTERIOR NÃO CAPTURADA', { exact: true }),
  ).toHaveCount(0);
  await capture(page, info, 'comparacao-geracoes-congeladas');
});

test('união paginada filtra janelas vazias e mudança C2 invalida toda composição', async ({
  page,
}, info) => {
  const source = await seed(page, 28);
  await start(page, source);
  await ready(page);
  await compare(page);
  await flag(page, 'writer.visual.comparison-scan-window', '2');
  await group(page, 'Conteúdo');
  await chooseDropdown(page, 'Tipo de conteúdo comparado', 'Fichas de lore');
  await expect(
    reader(page).getByRole('button', { name: 'Carregar mais diferenças', exact: true }),
  ).toBeVisible();
  let count = 0;
  while (
    await reader(page)
      .getByRole('button', { name: 'Carregar mais diferenças', exact: true })
      .count()
  ) {
    await reader(page)
      .getByRole('button', { name: 'Carregar mais diferenças', exact: true })
      .click();
    await expect(
      reader(page).getByText('Conferindo diferenças autorizadas...', { exact: true }),
    ).toHaveCount(0);
    count++;
    expect(count).toBeLessThan(30);
  }
  await expect(
    reader(page).getByRole('button', { name: 'Comparar Lia da comparação', exact: true }),
  ).toBeVisible();
  const details = await detail(page, 'Lia da comparação');
  await expect(details.getByText('CORPO LORE CANDIDATO', { exact: true })).toBeVisible();
  await page.evaluate(
    async ({ prefix, source }) => {
      const api = (await import(
        prefix + 'campaignLoreFixture.ts'
      )) as typeof import('./fixtures/campaignLoreFixture');
      const list = await api.listCampaignLore({
        campaignId: source.campaignId,
        baseId: source.baseId,
      });
      await api.removeCampaignLore({
        campaignId: source.campaignId,
        campaignToken: list.campaignToken,
        baseId: source.baseId,
        sourceKey: source.heroKey,
        operationId: 'visual-c3-local-remove',
        expectedRevision: 0,
      });
    },
    { prefix, source },
  );
  await group(page, 'Dados da origem');
  await expect(
    reader(page).getByRole('button', { name: 'Reabrir comparação', exact: true }),
  ).toBeVisible();
  await expect(reader(page).getByText('CORPO LORE CANDIDATO', { exact: true })).toHaveCount(0);
  await expect(reader(page).getByText('SINOPSE ATUAL CONGELADA', { exact: true })).toHaveCount(0);
  await release(page, 'writer.visual.comparison-scan-window');
  await reader(page).getByRole('button', { name: 'Reabrir comparação', exact: true }).click();
  await group(page, 'Conteúdo');
  await chooseDropdown(page, 'Tipo de conteúdo comparado', 'Fichas de lore');
  await expect(
    reader(page).getByText('Lore da mesa: Retirada · Revisão 1', { exact: true }),
  ).toBeVisible();
  await expect(
    reader(page).getByText(/Esta ficha tem uma variante ou retirada particular/),
  ).toBeVisible();
  await invariant(page, source);
  await capture(page, info, 'comparacao-c2-apos-invalidacao');
});

test('pedidos incertos repetem recibos e fence explícito; descarte permanece no Estúdio sem origem', async ({
  page,
}, info) => {
  const source = await seed(page);
  await flag(page, 'writer.visual.comparison-lost-response', 'startCampaignComparison');
  await start(page, source);
  await expect(
    dialog(page).getByRole('button', { name: 'Confirmar pedido da candidata', exact: true }),
  ).toBeEnabled();
  const initial = (await calls(page)).find((c) => c.method === 'startCampaignComparison')!;
  const journal = await page.evaluate(() => {
    const rows = Object.keys(localStorage)
      .filter((key) => key.startsWith('writer:campaign-comparison:'))
      .map((key) => localStorage.getItem(key) ?? '');
    return {
      exists: rows.length > 0,
      metadataOnly: rows.every(
        (row) =>
          ![
            'SINOPSE',
            'CORPO LORE',
            'Aventura das duas gerações',
            'TEXTO ATUAL',
            'action 😀',
            'ciphertext',
            'data:image',
          ].some((sentinel) => row.includes(sentinel)),
      ),
    };
  });
  expect(journal).toEqual({ exists: true, metadataOnly: true });
  await page.reload();
  const panel = page
    .getByRole('heading', { name: 'Candidatas de base', exact: true })
    .locator('..');
  await panel.getByRole('button', { name: /^Candidata .+ · / }).click();
  await flag(page, 'writer.visual.comparison-lost-response', 'advanceCampaignComparison');
  await dialog(page)
    .getByRole('button', { name: 'Confirmar pedido da candidata', exact: true })
    .click();
  await expect(
    dialog(page).getByRole('button', { name: 'Confirmar pedido da candidata', exact: true }),
  ).toBeEnabled();
  const advance = (await calls(page))
    .filter((c) => c.method === 'advanceCampaignComparison')
    .at(-1)!;
  await dialog(page)
    .getByRole('button', { name: 'Confirmar pedido da candidata', exact: true })
    .click();
  await ready(page);
  expect(
    (await calls(page)).filter(
      (c) => c.method === 'advanceCampaignComparison' && c.operationId === advance.operationId,
    ),
  ).toHaveLength(2);
  expect(
    (await calls(page))
      .filter((c) => c.method === 'startCampaignComparison')
      .map((c) => c.operationId),
  ).toEqual([initial.operationId, initial.operationId]);
  await close(page);
  await flag(page, 'writer.visual.comparison-before-receive', 'startCampaignComparison');
  await start(page, source);
  await expect(
    dialog(page).getByRole('button', { name: 'Encerrar pedido inicial', exact: true }),
  ).toBeEnabled();
  const absent = (await calls(page)).filter((c) => c.method === 'startCampaignComparison').at(-1)!;
  await dialog(page).getByRole('button', { name: 'Encerrar pedido inicial', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Encerrar pedido inicial?', exact: true })
    .getByRole('button', { name: 'Confirmar encerramento inicial', exact: true })
    .click();
  await expect(dialog(page).getByText(/pedido inicial.*encerrado/i)).toBeVisible();
  expect(
    (await calls(page))
      .filter((c) => c.method === 'resolveCampaignComparisonStart')
      .map((c) => c.operationId),
  ).toEqual([absent.operationId]);
  await close(page);
  await flag(page, 'writer.visual.comparison-hold-response', 'startCampaignComparison');
  await start(page, source);
  await expect
    .poll(async () => (await calls(page)).some((c) => c.method === 'held:startCampaignComparison'))
    .toBe(true);
  await page.evaluate(
    async ({ prefix, id }) => {
      const studio = (await import(
        prefix + 'studioStore.ts'
      )) as typeof import('./fixtures/studioStore');
      studio.fixturePatchProject('adventure', id, { synopsis: 'Mudou durante a preparação C3' });
    },
    { prefix, id: source.adventureId },
  );
  await release(page, 'writer.visual.comparison-hold-response');
  await expect(
    dialog(page).getByRole('heading', { name: 'Interrompida', exact: true }),
  ).toBeVisible();
  await expect(
    dialog(page).getByText(
      'A origem mudou durante a preparação. Esta candidata foi interrompida.',
      { exact: true },
    ),
  ).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Descartar candidata', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Descartar candidata?', exact: true })
    .getByRole('button', { name: 'Confirmar descarte da candidata', exact: true })
    .click();
  await expect(
    dialog(page).getByRole('heading', { name: 'Descartada', exact: true }),
  ).toBeVisible();
  await close(page);
  await page.evaluate(
    async ({ prefix, source }) => {
      const studio = (await import(
        prefix + 'studioStore.ts'
      )) as typeof import('./fixtures/studioStore');
      studio.fixturePatchProject('adventure', source.adventureId, { deleting: true } as never);
    },
    { prefix, source },
  );
  await page.goto('/studio');
  await reopen(page);
  await expect(dialog(page).getByText(/A origem ou a campanha não está disponível/)).toBeVisible();
  await flag(page, 'writer.visual.comparison-lost-response', 'cancelCampaignComparison');
  await dialog(page).getByRole('button', { name: 'Descartar candidata', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Descartar candidata?', exact: true })
    .getByRole('button', { name: 'Confirmar descarte da candidata', exact: true })
    .click();
  await expect(
    dialog(page).getByRole('button', { name: 'Confirmar pedido da candidata', exact: true }),
  ).toBeEnabled();
  const cancel = (await calls(page)).filter((c) => c.method === 'cancelCampaignComparison').at(-1)!;
  await page.reload();
  await page
    .getByRole('heading', { name: 'Candidatas de base', exact: true })
    .locator('..')
    .getByRole('button', { name: /^Candidata .+ · / })
    .click();
  await dialog(page)
    .getByRole('button', { name: 'Confirmar pedido da candidata', exact: true })
    .click();
  await expect(
    dialog(page).getByRole('heading', { name: 'Descartada', exact: true }),
  ).toBeVisible();
  expect(
    (await calls(page)).filter(
      (c) => c.method === 'cancelCampaignComparison' && c.operationId === cancel.operationId,
    ),
  ).toHaveLength(2);
  await capture(page, info, 'comparacao-descarte-sem-origem');
});

test('320px teclado protege lado, mídia e respostas tardias sem perder notas próprias', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const source = await seed(page);
  await start(page, source);
  await ready(page);
  await compare(page);
  await expectDialogWithinViewport(page);
  await expectNoHorizontalOverflow(page, 'comparação C3A em 320px');
  await reader(page)
    .getByRole('combobox', { name: 'Grupo da comparação', exact: true })
    .scrollIntoViewIfNeeded();
  await capture(page, info, 'comparacao-320-origem');
  await group(page, 'Conteúdo');
  await chooseDropdown(page, 'Tipo de conteúdo comparado', 'Cenas');
  await flag(page, 'writer.visual.comparison-wrong-side', 'readCampaignComparisonItem');
  await reader(page)
    .getByRole('button', { name: 'Comparar Travessia comparada', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    reader(page).getByRole('button', { name: 'Reabrir comparação', exact: true }),
  ).toBeVisible();
  await expect(reader(page).getByText('TEXTO ATUAL CONGELADO 🐉', { exact: true })).toHaveCount(0);
  await release(page, 'writer.visual.comparison-wrong-side');
  await reader(page).getByRole('button', { name: 'Reabrir comparação', exact: true }).click();
  await group(page, 'Ilustrações');
  await flag(page, 'writer.visual.comparison-hold-media-io', 'candidate');
  await reader(page).getByRole('button', { name: 'Comparar ilustração 1', exact: true }).click();
  await expect(
    reader(page).getByText('Verificando texto integral e mídia...', { exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => (await calls(page)).some((c) => c.method === 'held:candidate'))
    .toBe(true);
  await flag(page, 'writer.visual.preview-revoked-image', 'visual-image-000001');
  await release(page, 'writer.visual.comparison-hold-media-io');
  await expect(
    reader(page).getByRole('button', { name: 'Reabrir comparação', exact: true }),
  ).toBeVisible();
  await expect(reader(page).getByRole('img')).toHaveCount(0);
  await release(page, 'writer.visual.preview-revoked-image');
  await reader(page).getByRole('button', { name: 'Reabrir comparação', exact: true }).click();
  await group(page, 'Conteúdo');
  await chooseDropdown(page, 'Tipo de conteúdo comparado', 'Fichas de lore');
  await page.evaluate(
    async ({ prefix, source }) => {
      const lore = (await import(
        prefix + 'loreService.ts'
      )) as typeof import('./fixtures/loreService');
      await lore.deleteLoreEntity({ kind: 'universe', id: source.worldId }, source.heroId);
    },
    { prefix, source },
  );
  await group(page, 'Referências');
  await expect(
    reader(page).getByRole('button', { name: 'Reabrir comparação', exact: true }),
  ).toBeVisible();
  await reader(page).getByRole('button', { name: 'Reabrir comparação', exact: true }).click();
  await group(page, 'Conteúdo');
  await chooseDropdown(page, 'Tipo de conteúdo comparado', 'Fichas de lore');
  await expect(
    reader(page).getByRole('button', { name: 'Comparar Lia da comparação', exact: true }),
  ).toHaveCount(0);
  await capture(page, info, 'comparacao-320-controles');
  await dialog(page).getByRole('button', { name: 'Fechar candidata', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Preparar nova candidata', exact: true }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Consequência própria C3', exact: true }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Editar nota própria', exact: true })
      .getByLabel('Texto da nota', { exact: true }),
  ).toHaveValue('NOTA PRÓPRIA INDEPENDENTE C3');
  await page
    .getByRole('dialog', { name: 'Editar nota própria', exact: true })
    .getByRole('button', { name: 'Cancelar', exact: true })
    .click();
  await flag(page, 'writer.visual.comparison-hold-response', 'getCampaignComparison');
  await reopen(page);
  await expect
    .poll(async () => (await calls(page)).some((c) => c.method === 'held:getCampaignComparison'))
    .toBe(true);
  await page.evaluate(() => {
    sessionStorage.setItem('writer.visual.account', 'second');
    window.dispatchEvent(new Event('writer.visual.auth-change'));
  });
  await release(page, 'writer.visual.comparison-hold-response');
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByText('CORPO LORE CANDIDATO', { exact: true })).toHaveCount(0);
  await expect(page.getByText('SINOPSE CANDIDATA CONGELADA', { exact: true })).toHaveCount(0);
  await expectNoHorizontalOverflow(page, 'comparação C3A em 320px');
});
