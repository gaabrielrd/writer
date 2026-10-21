import type { Page } from '@playwright/test';
import { chooseDropdown } from '../dropdown';
import {
  capture,
  expect,
  expectDialogWithinViewport,
  expectNoHorizontalOverflow,
  test,
} from './support';

const prefix = '/e2e/visual/fixtures/';
const prose = '  Memória própria 🐉\nLinha com ação e café.\n<strong>texto literal</strong>  ';
const adapted = 'TEXTO PARTICULAR DA MESA LOCAL';
interface Source {
  adventureId: string;
  sceneId: string;
  worldId: string;
  localId: string;
  globalId: string;
  campaignId?: string;
}
async function seed(page: Page, withCampaign = false): Promise<Source> {
  await page.goto('/studio');
  return page.evaluate(
    async ({ prefix, prose, adapted, withCampaign }) => {
      const load = <T>(name: string) => import(prefix + name + '.ts') as Promise<T>;
      const adventures =
        await load<typeof import('./fixtures/adventureService')>('adventureService');
      const worlds = await load<typeof import('./fixtures/universeService')>('universeService');
      const globals = await load<typeof import('./fixtures/loreService')>('loreService');
      const local =
        await load<typeof import('./fixtures/adventureLoreFixture')>('adventureLoreFixture');
      const scenes = await load<typeof import('./fixtures/sceneService')>('sceneService');
      const world = await worlds.createUniverse(
        { name: 'Universo do lore local', description: 'Privado' },
        'visual-lore-universe',
      );
      const adventure = await adventures.createAdventure({
        operationId: 'visual-lore-adventure',
        title: 'Aventura do lore particular',
        synopsis: 'Preparação autoral',
        universeId: world.id,
      });
      let globalId = '';
      for (let n = 0; n < 27; n++) {
        const entity = await globals.createLoreEntity(
          { kind: 'universe', id: world.id },
          {
            name: n === 26 ? 'Alvo global autorizado' : 'Global ' + String(n).padStart(2, '0'),
            aliases: n === 26 ? ['Rastro'] : ['Alias global ' + n],
            category: 'character',
            summary: 'Resumo global ' + n,
            details: 'SEGREDO GLOBAL ' + n,
            isPublic: false,
          },
        );
        if (n === 26) globalId = entity.id;
      }
      const entities = Array.from({ length: 27 }, (_, n) => ({
        name: n === 26 ? 'Z Vigia da aventura' : 'Ficha local ' + String(n).padStart(2, '0'),
        aliases: n === 26 ? ['Rastro'] : ['Alias local ' + n],
        category: 'character' as const,
        summary: 'Resumo particular ' + n,
        details: prose,
        structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
        relations:
          n === 26
            ? [
                {
                  targetEntityId: globalId,
                  relationType: 'Conhece',
                  description: 'DESCRIÇÃO PRÓPRIA DA RELAÇÃO',
                },
              ]
            : [],
        isPublic: false as const,
      }));
      const ids = await local.fixtureSeedAdventureLore(adventure.id, entities);
      const localId = ids.at(-1)!;
      const target = { kind: 'adventure' as const, id: adventure.id };
      const scene = (
        await scenes.createScene({
          target,
          operationId: 'visual-lore-scene',
          title: 'Travessia local',
          parentId: null,
          content: '<p>Rastro aguarda no farol.</p>',
        })
      ).scene;
      const source: Source = {
        adventureId: adventure.id,
        sceneId: scene.id,
        worldId: world.id,
        localId,
        globalId,
      };
      if (!withCampaign) return source;
      // Capture/adaptation are transport preconditions; SDK proves their real transactions.
      for (const reference of [
        { kind: 'adventure' as const, scopeId: adventure.id, entityId: localId },
        { kind: 'universe' as const, scopeId: world.id, entityId: globalId.split(':').at(-1)! },
      ]) {
        const current = await scenes.getScene({ target, sceneId: scene.id });
        if (!current) throw Error('Cena de preparação indisponível');
        await scenes.setSceneReference({
          target,
          sceneId: scene.id,
          operationId: 'visual-lore-ref-' + reference.kind,
          expectedRevision: current.revision,
          reference,
        });
      }
      const captures =
        await load<typeof import('./fixtures/campaignBaseFixture')>('campaignBaseFixture');
      const available = await captures.getCampaignCaptureSource({ adventureId: adventure.id });
      let progress = await captures.startCampaignCapture({
        adventureId: adventure.id,
        operationId: 'visual-local-base-start',
        expectedSourceToken: available.sourceToken,
        title: 'Mesa do lore local',
        description: 'Consequências privadas',
        universeId: world.id,
      });
      for (let n = 0; n < 40 && progress.state !== 'prepared'; n++)
        progress = await captures.advanceCampaignCapture({
          captureId: progress.captureId,
          operationId: 'visual-local-base-step-' + n,
          expectedCheckpoint: progress.checkpoint,
        });
      if (progress.state !== 'prepared') throw Error('Base local não preparada');
      const activated = await captures.activateCampaignCapture({
        captureId: progress.captureId,
        operationId: 'visual-local-base-activate',
        expectedCheckpoint: progress.checkpoint,
      });
      if (activated.kind !== 'activated') throw Error('Campanha local não ativada');
      source.campaignId = activated.campaign.id;
      const lore =
        await load<typeof import('./fixtures/campaignLoreFixture')>('campaignLoreFixture');
      const page = await lore.listCampaignLore({
        campaignId: source.campaignId,
        baseId: activated.campaign.activeBaseId!,
      });
      const item = page.items.find((row) => row.name === 'Z Vigia da aventura');
      if (!item) throw Error('Ficha local não capturada');
      const scope = {
        campaignId: source.campaignId,
        baseId: page.baseId,
        campaignToken: page.campaignToken,
      };
      const original = await lore.getCampaignLore({ ...scope, sourceKey: item.sourceKey });
      if (!original.item?.entity) throw Error('Corpo local não capturado');
      const servicePath = '/src/features/campaign-lore/services/campaignLoreService.ts';
      const service = (await import(
        servicePath
      )) as typeof import('../../src/features/campaign-lore/services/campaignLoreService');
      const cryptoPath = '/src/features/campaign-lore/services/campaignLoreCrypto.ts';
      const crypto = (await import(
        cryptoPath
      )) as typeof import('../../src/features/campaign-lore/services/campaignLoreCrypto');
      const entity = {
        ...service.toEntityInput(original.item.entity),
        name: 'Vigia adaptada pela mesa',
        details: adapted,
      };
      const header = {
        ...scope,
        sourceKey: item.sourceKey,
        expectedRevision: 0,
        operationId: 'visual-local-variant-prepare',
      };
      const relatedSourceKeys = service.relatedKeys(entity);
      const prepared = await lore.prepareCampaignLoreVariant({ ...header, relatedSourceKeys });
      const operation: import('../../src/features/campaign-lore/model/campaignLore').CampaignLoreOperation =
        {
          schemaVersion: 1,
          ownerId: prepared.ownerId,
          header,
          action: 'save',
          relatedSourceKeys,
          phase: 'sealed',
        };
      const sealed = await crypto.sealLore(operation, entity, prepared.key);
      await lore.saveCampaignLoreVariant({
        ...header,
        relatedSourceKeys,
        sealed: crypto.sealedRequest({ ...operation, ...sealed }),
      });
      await lore.resolveCampaignLoreOperation({
        ...header,
        relatedSourceKeys,
        action: 'save',
        intent: 'confirm',
      });
      return source;
    },
    { prefix, prose, adapted, withCampaign },
  );
}
const collection = (page: Page) =>
  page.getByRole('region', { name: 'Lore da aventura', exact: true });
async function journal(page: Page, campaignId: string) {
  return page.evaluate(async (campaignId) => {
    const path = '/src/features/campaign-lore/services/campaignLoreRecovery.ts';
    const api = (await import(
      path
    )) as typeof import('../../src/features/campaign-lore/services/campaignLoreRecovery');
    const operation = await api.readLoreOperation('visual-author', campaignId);
    return operation
      ? {
          phase: operation.phase,
          operationId: operation.header.operationId,
          revision: operation.header.expectedRevision,
          sourceKey: operation.header.sourceKey,
        }
      : null;
  }, campaignId);
}

test('autor cria e edita lore privado e usa referência e alias local além da primeira página', async ({
  page,
}, info) => {
  if (info.project.name.startsWith('mobile'))
    await page.setViewportSize({ width: 320, height: 740 });
  const source = await seed(page);
  await page.goto('/adventures/' + source.adventureId + '?tab=lore');
  const create = collection(page).getByRole('button', { name: 'Nova Entidade', exact: true });
  await expect(create).toBeEnabled();
  await create.focus();
  await page.keyboard.press('Enter');
  let form = page.getByRole('dialog', {
    name: 'Cadastrar Nova Entidade no Compêndio',
    exact: true,
  });
  await form.getByLabel('Nome da Entidade', { exact: true }).fill('A ficha criada pelo autor');
  await form.getByLabel('Apelidos / Aliases', { exact: true }).fill('Autora');
  await form
    .getByLabel('Resumo Curto', { exact: true })
    .fill('Resumo particular criado no navegador');
  await form.getByRole('button', { name: /^História e notas/ }).click();
  await expect(form.getByRole('button', { name: /^História e notas/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await form.getByLabel('Ficha Detalhada / Lore Completo (opcional)', { exact: true }).fill(prose);
  await expect(form.getByRole('checkbox')).toHaveCount(0);
  await expectDialogWithinViewport(page);
  await capture(page, info, 'aventura-lore-criacao-privada');
  await form.getByRole('button', { name: 'Cadastrar Entidade', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(
    collection(page).getByRole('heading', { name: 'A ficha criada pelo autor', exact: true }),
  ).toBeVisible();
  await collection(page)
    .getByRole('button', { name: 'Carregar mais lore da aventura', exact: true })
    .click();
  await collection(page)
    .getByRole('button', { name: 'Editar Z Vigia da aventura', exact: true })
    .click();
  form = page.getByRole('dialog', { name: 'Editar Entidade: Z Vigia da aventura', exact: true });
  const edited = prose + '\nREVISÃO SEM TRIM';
  await form.getByRole('button', { name: /^História e notas/ }).click();
  await expect(form.getByRole('button', { name: /^História e notas/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await form.getByLabel('Ficha Detalhada / Lore Completo (opcional)', { exact: true }).fill(edited);
  await page.evaluate(
    async ({ prefix, source }) => {
      const hints = (await import(
        prefix + 'adventureLoreFixture.ts'
      )) as typeof import('./fixtures/adventureLoreFixture');
      const worlds = (await import(
        prefix + 'universeService.ts'
      )) as typeof import('./fixtures/universeService');
      await worlds.updateUniverse(source.worldId, {
        name: 'Universo atualizado',
        description: 'Mudança global não rebaseia o formulário',
      });
      hints.fixtureAdventureLoreHint(source.adventureId, 'universe');
    },
    { prefix, source },
  );
  await expect(
    form.getByLabel('Ficha Detalhada / Lore Completo (opcional)', { exact: true }),
  ).toHaveValue(edited);
  await form.getByRole('button', { name: 'Salvar Alterações', exact: true }).click();
  await expect(form).toHaveCount(0);
  await page.getByRole('tab', { name: 'Cenas', exact: true }).click();
  const planner = page.getByRole('region', { name: 'Planejamento de cenas', exact: true });
  await planner.getByRole('button', { name: 'Ações da cena Travessia local', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Editar planejamento', exact: true }).click();
  const planning = page.getByRole('dialog', { name: 'Editar planejamento', exact: true });
  await chooseDropdown(
    planning.getByLabel('Lore para vincular', { exact: true }),
    'Z Vigia da aventura · Aventura',
  );
  await planning.getByRole('button', { name: 'Vincular referência', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Vincular referência', exact: true })
    .getByRole('button', { name: 'Confirmar referência', exact: true })
    .click();
  await expect(
    planning
      .getByRole('region', { name: 'Referências da cena', exact: true })
      .getByText('Z Vigia da aventura', { exact: true }),
  ).toBeVisible();
  await planning.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(planning).toHaveCount(0);
  await planner.getByRole('link', { name: 'Travessia local', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Área de escrita da cena', exact: true });
  await expect(editor).toHaveText('Rastro aguarda no farol.');
  const mention = editor.getByRole('button', {
    name: 'Ver ficha de Z Vigia da aventura',
    exact: true,
  });
  await expect(mention).toHaveText('Rastro');
  await editor.press('Control+End');
  await page.keyboard.type(' A vigília continua.');
  await expect(editor).toHaveText('Rastro aguarda no farol. A vigília continua.');
  await expect(mention).toHaveAttribute(
    'data-lore-id',
    JSON.stringify(['adventure', source.adventureId, source.localId]),
  );
  await expect(editor.locator('[data-lore-id]')).toHaveCount(1);
  await expect(
    editor.getByRole('button', { name: 'Ver ficha de Alvo global autorizado', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText('Salvo', { exact: true })).toBeVisible();
  await capture(page, info, 'aventura-alias-local-com-referencia');
  await mention.focus();
  await page.keyboard.press('Enter');
  const reader = page.getByRole('dialog', { name: 'Z Vigia da aventura', exact: true });
  await expect(reader.getByText('Resumo particular 26', { exact: true })).toBeVisible();
  await expect(reader.getByText('REVISÃO SEM TRIM', { exact: true })).toBeVisible();
  await reader.press('Escape');
  await expect(reader).toHaveCount(0);
  const saved = await page.evaluate(
    async ({ prefix, source }) => {
      const api = (await import(
        prefix + 'adventureLoreFixture.ts'
      )) as typeof import('./fixtures/adventureLoreFixture');
      return api.fixtureGetLocalAdventureLore(source.adventureId, source.localId);
    },
    { prefix, source },
  );
  expect(saved?.details).toBe(edited);
  expect(saved?.isPublic).toBe(false);
  await expectNoHorizontalOverflow(page, 'autor lore da aventura');
});

test('mestre mantém variante local com relação neutra e recupera pedido protegido após conta e resposta tardia', async ({
  page,
}, info) => {
  if (info.project.name.startsWith('mobile'))
    await page.setViewportSize({ width: 320, height: 740 });
  const source = await seed(page, true);
  if (!source.campaignId) throw Error('Campanha local esperada');
  const campaignId = source.campaignId;
  await page.goto('/campaigns/' + campaignId);
  const panel = page.getByRole('heading', { name: 'Lore da mesa', exact: true }).locator('..');
  await panel.getByRole('button', { name: 'Vigia adaptada pela mesa', exact: true }).click();
  let form = page.getByRole('dialog', { name: 'Editar lore da mesa', exact: true });
  await expect(form.getByLabel('Detalhes da ficha', { exact: true })).toHaveValue(adapted);
  await expect(form.getByText('Alvo global autorizado', { exact: true })).toBeVisible();
  await form.getByRole('button', { name: 'Fechar ficha', exact: true }).click();
  await expect(form).toHaveCount(0);
  await page.evaluate(
    async ({ prefix, source }) => {
      const worlds = (await import(
        prefix + 'universeService.ts'
      )) as typeof import('./fixtures/universeService');
      const hints = (await import(
        prefix + 'adventureLoreFixture.ts'
      )) as typeof import('./fixtures/adventureLoreFixture');
      await worlds.deleteUniverse(source.worldId);
      hints.fixtureAdventureLoreHint(source.adventureId, 'universe');
    },
    { prefix, source },
  );
  await panel.getByRole('button', { name: 'Atualizar lore da mesa', exact: true }).click();
  await panel.getByRole('button', { name: 'Vigia adaptada pela mesa', exact: true }).click();
  form = page.getByRole('dialog', { name: 'Editar lore da mesa', exact: true });
  await expect(form.getByLabel('Detalhes da ficha', { exact: true })).toHaveValue(adapted);
  await expect(form.getByText('Alvo global autorizado', { exact: true })).toHaveCount(0);
  await expect(form.getByLabel('Tipo da relação 1', { exact: true })).toHaveCount(0);
  await expectDialogWithinViewport(page);
  await capture(page, info, 'aventura-variante-local-relacao-neutra');
  const recovered = adapted + '\nPEDIDO DA PRIMEIRA CONTA';
  await form.getByLabel('Detalhes da ficha', { exact: true }).fill(recovered);
  await page.evaluate(() =>
    sessionStorage.setItem('writer.visual.campaign-lore-hold-response', 'saveCampaignLoreVariant'),
  );
  await form.getByRole('button', { name: 'Salvar variante da mesa', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => sessionStorage.getItem('writer.visual.campaign-lore-hold-response')),
    )
    .toBeNull();
  const sealed = await journal(page, campaignId);
  expect(sealed?.phase).toBe('sealed');
  const privacy = await page.evaluate(
    async ({ campaignId, recovered }) => {
      const path = '/src/features/campaign-lore/services/campaignLoreRecovery.ts';
      const api = (await import(
        path
      )) as typeof import('../../src/features/campaign-lore/services/campaignLoreRecovery');
      const operation = await api.readLoreOperation('visual-author', campaignId);
      const storage = [localStorage, sessionStorage].flatMap((store) =>
        Object.keys(store)
          .filter((key) => !key.startsWith('writer.visual.'))
          .map((key) => store.getItem(key) ?? ''),
      );
      const strings = [
        ...storage,
        JSON.stringify(operation),
        ...(operation?.ciphertext ? [new TextDecoder().decode(operation.ciphertext)] : []),
      ];
      return {
        noPlaintext: strings.every((value) => !value.includes(recovered)),
        noKey:
          !!operation &&
          !Object.keys(operation).some((key) =>
            ['key', 'rawKey', 'entity', 'name', 'relations'].includes(key),
          ),
        binaryCipher:
          Object.prototype.toString.call(operation?.ciphertext) === '[object ArrayBuffer]',
      };
    },
    { campaignId, recovered },
  );
  expect(privacy).toEqual({ noPlaintext: true, noKey: true, binaryCipher: true });
  await page.evaluate(() => {
    sessionStorage.setItem('writer.visual.account', 'second');
    window.dispatchEvent(new Event('writer.visual.auth-change'));
  });
  await expect(
    page.getByRole('heading', { name: 'Campanha indisponível', exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('writer.visual.release-campaign-lore')));
  expect(await journal(page, campaignId)).toEqual(sealed);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText(recovered, { exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    sessionStorage.removeItem('writer.visual.account');
    window.dispatchEvent(new Event('writer.visual.auth-change'));
  });
  await panel.getByRole('button', { name: 'Recuperar pedido de lore', exact: true }).click();
  await expect.poll(() => journal(page, campaignId)).toBeNull();
  form = page.getByRole('dialog', { name: 'Editar lore da mesa', exact: true });
  await expect(form.getByLabel('Detalhes da ficha', { exact: true })).toHaveValue(recovered);
  await expect(form.getByText('Alvo global autorizado', { exact: true })).toHaveCount(0);
  await capture(page, info, 'aventura-variante-recuperada-conta-original');
});
