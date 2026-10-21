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
const recovery = '/src/features/campaign-lore/services/campaignLoreRecovery.ts';
const adoptionRecovery = '/src/features/campaign-adoptions/services/campaignAdoptionRecovery.ts';
export interface AdoptionSource {
  campaignId: string;
  otherId: string;
  baseId: string;
  candidateBaseId: string;
  comparisonId: string;
  campaignToken: string;
  adventureId: string;
  worldId: string;
  heroId: string;
  heroKey: string;
  removedKey: string;
  discardKey: string;
  noteId: string;
  otherRoot: string;
}
export async function seedAdoption(page: Page, local = true): Promise<AdoptionSource> {
  await page.goto('/studio');
  return page.evaluate(
    async ({ prefix, local }) => {
      const load = <T>(name: string) => import(prefix + name + '.ts') as Promise<T>;
      const worlds = await load<typeof import('./fixtures/universeService')>('universeService'),
        lore = await load<typeof import('./fixtures/loreService')>('loreService'),
        adventures = await load<typeof import('./fixtures/adventureService')>('adventureService'),
        scenes = await load<typeof import('./fixtures/sceneService')>('sceneService'),
        bases = await load<typeof import('./fixtures/campaignBaseFixture')>('campaignBaseFixture'),
        variants =
          await load<typeof import('./fixtures/campaignLoreFixture')>('campaignLoreFixture'),
        comparisons = await load<typeof import('./fixtures/campaignComparisonFixture')>(
          'campaignComparisonFixture',
        ),
        notes =
          await load<typeof import('./fixtures/campaignNotesFixture')>('campaignNotesFixture'),
        studio = await load<typeof import('./fixtures/studioStore')>('studioStore');
      const world = await worlds.createUniverse(
        { name: 'Universo da adoção', description: 'Origem autorizada' },
        'visual-adoption-world',
      );
      const adventure = await adventures.createAdventure({
        operationId: 'visual-adoption-origin',
        title: 'Aventura da atualização explícita',
        synopsis: 'SINOPSE BASE ANTERIOR',
        universeId: world.id,
      });
      const target = { kind: 'adventure' as const, id: adventure.id },
        entities = [];
      for (const [index, name] of [
        'Lia original',
        'Farol da base antiga',
        'Ficha original ausente',
      ].entries()) {
        const entity = await lore.createLoreEntity(
          { kind: 'universe', id: world.id },
          {
            name,
            category: index === 1 ? 'location' : 'character',
            summary: 'Resumo congelado ' + index,
            details: 'CORPO BASE ANTERIOR ' + index,
            aliases: ['Nome antigo ' + index],
            structuredDetails: {
              appearance: 'Aparência ' + index,
              personality: 'Personalidade ' + index,
              history: 'História ' + index,
              notes: 'Notas ' + index,
            },
          },
        );
        entities.push(entity);
        const created = await scenes.createScene({
          target,
          operationId: 'visual-adoption-scene-' + index,
          parentId: null,
          title: 'Cena da atualização ' + index,
          content: '<p>TEXTO ANTERIOR ' + index + '</p>',
        });
        await scenes.setSceneReference({
          target,
          sceneId: created.scene.id,
          operationId: 'visual-adoption-reference-' + index,
          expectedRevision: created.scene.revision,
          reference: {
            kind: 'universe',
            scopeId: world.id,
            entityId: entity.id.split(':').at(-1)!,
          },
        });
      }
      async function capture(name: string) {
        const source = await bases.getCampaignCaptureSource({ adventureId: adventure.id });
        let p = await bases.startCampaignCapture({
          operationId: 'visual-adoption-capture-' + name,
          adventureId: adventure.id,
          expectedSourceToken: source.sourceToken,
          title: 'Mesa ' + name + ' da adoção',
          description: 'DESCRIÇÃO AUTORAL PRESERVADA ' + name,
          universeId: world.id,
        });
        for (let i = 0; p.state === 'preparing' && i < 40; i++)
          p = await bases.advanceCampaignCapture({
            captureId: p.captureId,
            operationId: 'visual-adoption-b-step-' + name + '-' + i,
            expectedCheckpoint: p.checkpoint,
          });
        const value = await bases.activateCampaignCapture({
          captureId: p.captureId,
          operationId: 'visual-adoption-b-activate-' + name,
          expectedCheckpoint: p.checkpoint,
        });
        if (value.kind !== 'activated') throw Error('Base inicial não ativada');
        return value.campaign;
      }
      const campaign = await capture('A'),
        other = await capture('B'),
        first = await variants.listCampaignLore({
          campaignId: campaign.id,
          baseId: campaign.activeBaseId!,
        });
      const scope = {
        campaignId: campaign.id,
        campaignToken: first.campaignToken,
        baseId: first.baseId,
      };
      const hero = first.items.find((row) => row.name === 'Lia original')!,
        farol = first.items.find((row) => row.name === 'Farol da base antiga')!,
        discard = first.items.find((row) => row.name === 'Ficha original ausente')!;
      if (local) {
        const cryptoPath = '/src/features/campaign-lore/services/campaignLoreCrypto.ts';
        const cryptoApi = (await import(
          cryptoPath
        )) as typeof import('../../src/features/campaign-lore/services/campaignLoreCrypto');
        for (const [row, name, details] of [
          [hero, 'Lia legada da mesa', 'VARIANTE LEGADA INTEIRA 🐉'],
          [discard, 'Variante a descartar', 'VARIANTE DESCARTADA EXPLICITAMENTE'],
        ] as const) {
          const state = await variants.getCampaignLore({ ...scope, sourceKey: row.sourceKey });
          if (!state.item?.entity) throw Error('Ficha inicial indisponível');
          const { relations, ...base } = state.item.entity;
          const entity = {
            ...base,
            relations: relations.map(({ targetKey, relationType, description }) => ({
              targetKey,
              relationType,
              description,
            })),
            name,
            details,
          };
          const header = {
            ...scope,
            sourceKey: row.sourceKey,
            operationId: 'visual-adoption-local-' + row.sourceKey,
            expectedRevision: 0,
          };
          const op = {
            schemaVersion: 1 as const,
            ownerId: 'visual-author',
            header,
            action: 'save' as const,
            relatedSourceKeys: [] as string[],
            phase: 'preparing' as const,
          };
          const prepared = await variants.prepareCampaignLoreVariant({
            ...header,
            relatedSourceKeys: [],
          });
          const sealed = await cryptoApi.sealLore(op, entity, prepared.key);
          await variants.saveCampaignLoreVariant({
            ...header,
            relatedSourceKeys: [],
            sealed: cryptoApi.sealedRequest({ ...op, phase: 'sealed', ...sealed }),
          });
          await variants.resolveCampaignLoreOperation({
            ...header,
            action: 'save',
            relatedSourceKeys: [],
            intent: 'confirm',
          });
        }
        const header = {
          ...scope,
          sourceKey: farol.sourceKey,
          operationId: 'visual-adoption-remove',
          expectedRevision: 0,
        };
        await variants.removeCampaignLore(header);
        await variants.resolveCampaignLoreOperation({
          ...header,
          action: 'remove',
          intent: 'confirm',
        });
      }
      const own = await notes.listCampaignNotes({ campaignId: campaign.id });
      await notes.saveCampaignNote({
        campaignId: campaign.id,
        campaignToken: own.campaignToken,
        noteId: 'visual-adoption-own-note',
        operationId: 'visual-adoption-own-note',
        expectedRevision: 0,
        title: 'Consequência própria preservada',
        content: 'NOTA PRÓPRIA ALÉM DAS BASES',
      });
      for (const index of [0, 2]) {
        const scene = (await scenes.getScene({
          target,
          sceneId: 'visual-adoption-scene-' + index,
        }))!;
        await scenes.setSceneReference({
          target,
          sceneId: scene.id,
          operationId: 'visual-adoption-unreference-' + index,
          expectedRevision: scene.revision,
          reference: {
            kind: 'universe',
            scopeId: world.id,
            entityId: entities[index].id.split(':').at(-1)!,
          },
          remove: true,
        });
      }
      await lore.updateLoreEntity({ kind: 'universe', id: world.id }, entities[1].id, {
        name: 'Farol da candidata',
        details: 'CORPO CANDIDATO FAROL CONGELADO',
      });
      const current = (await scenes.getScene({ target, sceneId: 'visual-adoption-scene-1' }))!;
      await scenes.updateScene({
        target,
        sceneId: current.id,
        operationId: 'visual-adoption-candidate-text',
        expectedRevision: current.revision,
        patch: { content: '<p>TEXTO CANDIDATO CONGELADO 🐉</p>' },
      });
      studio.fixturePatchProject('adventure', adventure.id, {
        synopsis: 'SINOPSE CANDIDATA CONGELADA',
      });
      const source = (await comparisons.getCampaignComparisonSource({
        campaignId: campaign.id,
        currentBaseId: scope.baseId,
      }))!;
      const started = await comparisons.startCampaignComparison({
        campaignId: campaign.id,
        currentBaseId: scope.baseId,
        campaignToken: scope.campaignToken,
        operationId: 'visual-adoption-candidate',
        expectedSourceToken: source.sourceToken,
      });
      if ('kind' in started) throw Error('Candidata encerrada');
      let p = started.progress;
      for (let i = 0; p.state === 'preparing' && i < 40; i++)
        p = (
          await comparisons.advanceCampaignComparison({
            comparisonId: p.comparisonId,
            operationId: 'visual-adoption-c-step-' + i,
            expectedCheckpoint: p.checkpoint,
          })
        ).progress;
      if (p.state !== 'ready') throw Error('Candidata incompleta');
      // A third live generation must never complete or replace the captured candidate.
      await lore.updateLoreEntity({ kind: 'universe', id: world.id }, entities[1].id, {
        details: 'CORPO VIVO POSTERIOR NÃO ADOTADO',
      });
      studio.fixturePatchProject('adventure', adventure.id, {
        synopsis: 'SINOPSE VIVA POSTERIOR NÃO ADOTADA',
      });
      return {
        campaignId: campaign.id,
        otherId: other.id,
        baseId: scope.baseId,
        candidateBaseId: p.candidateBaseId,
        comparisonId: p.comparisonId,
        campaignToken: scope.campaignToken,
        adventureId: adventure.id,
        worldId: world.id,
        heroId: entities[0].id,
        heroKey: hero.sourceKey,
        removedKey: farol.sourceKey,
        discardKey: discard.sourceKey,
        noteId: 'visual-adoption-own-note',
        otherRoot: JSON.stringify(await studio.fixtureGet('campaign', other.id)),
      };
    },
    { prefix, local },
  );
}
const dialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Atualizar base da campanha', exact: true });
const lorePanel = (page: Page) =>
  page.getByRole('heading', { name: 'Lore da mesa', exact: true }).locator('..');
async function openReview(page: Page, source: AdoptionSource) {
  await page.goto('/campaigns/' + source.campaignId);
  const panel = page
    .getByRole('heading', { name: 'Candidatas de base', exact: true })
    .locator('..');
  await panel.getByRole('button', { name: /^Candidata .+ · Pronta para comparar$/ }).click();
  await page
    .getByRole('dialog', { name: 'Candidata de base da campanha', exact: true })
    .getByRole('button', { name: 'Comparar candidata', exact: true })
    .click();
  await page.getByRole('button', { name: 'Revisar atualização da campanha', exact: true }).click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page)
    .getByRole('button', { name: 'Iniciar revisão da adoção', exact: true })
    .click();
  await expect(
    dialog(page).getByRole('heading', { name: 'Em revisão', exact: true }),
  ).toBeVisible();
}
async function choose(page: Page, name: string, value: string) {
  await chooseDropdown(
    dialog(page).getByRole('combobox', { name: 'Decisão para ' + name, exact: true }),
    value,
  );
  await page
    .getByRole('dialog', { name: 'Confirmar escolha da ficha inteira?', exact: true })
    .getByRole('button', { name: 'Confirmar escolha', exact: true })
    .click();
  await expect(
    dialog(page).getByRole('combobox', { name: 'Decisão para ' + name, exact: true }),
  ).toContainText(value);
}
async function prepare(page: Page) {
  await dialog(page).getByRole('button', { name: 'Preparar atualização', exact: true }).click();
  await expect(
    dialog(page).getByRole('heading', { name: 'Pronta para adotar', exact: true }),
  ).toBeVisible();
}
async function activate(page: Page) {
  await dialog(page).getByRole('button', { name: 'Adotar esta base', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Adotar a nova base?', exact: true });
  await confirmation.getByRole('button', { name: 'Confirmar adoção', exact: true }).focus();
  await page.keyboard.press('Enter');
}
async function flag(page: Page, name: string, value: string) {
  await page.evaluate(({ name, value }) => sessionStorage.setItem(name, value), { name, value });
}
async function calls(page: Page) {
  return page.evaluate(
    () =>
      (
        JSON.parse(localStorage.getItem('writer.visual.campaign-adoptions') ?? '{"calls":[]}') as {
          calls: {
            method: string;
            operationId?: string;
            expectedCheckpoint?: number;
            adoptionId?: string;
          }[];
        }
      ).calls,
  );
}
async function close(page: Page) {
  await dialog(page).getByRole('button', { name: 'Fechar atualização', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
}
async function reopen(page: Page, state: string) {
  const panel = page
    .getByRole('heading', { name: 'Atualizações de base', exact: true })
    .locator('..');
  await panel.getByRole('button', { name: 'Consultar atualizações', exact: true }).click();
  await panel.getByRole('button', { name: new RegExp('^Atualização .+ · ' + state + '$') }).click();
  await expect(dialog(page)).toBeVisible();
}
async function journalEmpty(page: Page, source: AdoptionSource) {
  await expect
    .poll(() =>
      page.evaluate(
        async ({ path, campaignId }) => {
          const store = (await import(
            path
          )) as typeof import('../../src/features/campaign-lore/services/campaignLoreRecovery');
          return (await store.readLoreOperation('visual-author', campaignId)) === null;
        },
        { path: recovery, campaignId: source.campaignId },
      ),
    )
    .toBe(true);
}
async function ownNote(page: Page) {
  await page.getByRole('button', { name: 'Consequência própria preservada', exact: true }).click();
  const d = page.getByRole('dialog', { name: 'Editar nota própria', exact: true });
  await expect(d.getByLabel('Texto da nota', { exact: true })).toHaveValue(
    'NOTA PRÓPRIA ALÉM DAS BASES',
  );
  await d.getByRole('button', { name: 'Cancelar', exact: true }).click();
}
async function invariant(page: Page, source: AdoptionSource) {
  const value = await page.evaluate(
    async ({ prefix, source }) => {
      const studio = (await import(
          prefix + 'studioStore.ts'
        )) as typeof import('./fixtures/studioStore'),
        bases = (await import(
          prefix + 'campaignBaseFixture.ts'
        )) as typeof import('./fixtures/campaignBaseFixture');
      const own = await studio.fixtureGet('campaign', source.campaignId),
        other = await studio.fixtureGet('campaign', source.otherId),
        base = await bases.getCampaignBase({ campaignId: source.campaignId });
      if (!own || !other) throw new Error('Campanha ausente no controle de preservação.');
      return {
        baseId: base.baseId,
        synopsis: base.source.synopsis,
        description: own.description,
        otherUnchanged: JSON.stringify(other) === source.otherRoot,
      };
    },
    { prefix, source },
  );
  expect(value.baseId).toBe(source.candidateBaseId);
  expect(value.synopsis).toBe('SINOPSE CANDIDATA CONGELADA');
  expect(value.description).toBe('DESCRIÇÃO AUTORAL PRESERVADA A');
  expect(value.otherUnchanged).toBe(true);
}

test('adoção explícita preserva variante legada, retirada e notas com candidata congelada em 320px', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const source = await seedAdoption(page);
  await openReview(page, source);
  await choose(page, 'Lia legada da mesa', 'Manter legado da mesa');
  await choose(page, 'Farol da base antiga', 'Manter ficha retirada');
  await choose(page, 'Variante a descartar', 'Descartar ficha ausente');
  await expectDialogWithinViewport(page);
  await expectNoHorizontalOverflow(page, 'revisão da adoção em 320px');
  await dialog(page)
    .getByRole('combobox', { name: 'Decisão para Lia legada da mesa', exact: true })
    .scrollIntoViewIfNeeded();
  await capture(page, info, 'adocao-decisoes-320');
  await prepare(page);
  await activate(page);
  await expect(dialog(page)).toHaveCount(0);
  await expect(
    lorePanel(page).getByRole('button', { name: 'Lia legada da mesa', exact: true }),
  ).toBeVisible();
  await expect(lorePanel(page).getByText('Legado da mesa', { exact: true })).toBeVisible();
  await expect(
    lorePanel(page).getByRole('button', { name: 'Variante a descartar', exact: true }),
  ).toHaveCount(0);
  await lorePanel(page).getByRole('button', { name: 'Lia legada da mesa', exact: true }).focus();
  await page.keyboard.press('Enter');
  let edit = page.getByRole('dialog', { name: 'Editar lore da mesa', exact: true });
  await expect(edit.getByLabel('Detalhes da ficha', { exact: true })).toHaveValue(
    'VARIANTE LEGADA INTEIRA 🐉',
  );
  await edit
    .getByLabel('Detalhes da ficha', { exact: true })
    .fill('VARIANTE LEGADA EDITADA APÓS ADOÇÃO 🐉');
  await edit.getByRole('button', { name: 'Salvar variante da mesa', exact: true }).click();
  await journalEmpty(page, source);
  await edit.getByRole('button', { name: 'Fechar ficha', exact: true }).click();
  await chooseDropdown(
    lorePanel(page).getByRole('combobox', { name: 'Fichas do lore da mesa', exact: true }),
    'Retiradas',
  );
  await lorePanel(page).getByRole('button', { name: 'Farol da candidata', exact: true }).click();
  const removed = page.getByRole('dialog', { name: 'Ficha retirada', exact: true });
  await removed.getByRole('button', { name: 'Restaurar ficha', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Restaurar ficha?', exact: true })
    .getByRole('button', { name: 'Confirmar restauração', exact: true })
    .click();
  await journalEmpty(page, source);
  const any = page.getByRole('dialog');
  if (await any.count())
    await any.getByRole('button', { name: 'Fechar ficha', exact: true }).click();
  await chooseDropdown(
    lorePanel(page).getByRole('combobox', { name: 'Fichas do lore da mesa', exact: true }),
    'Ativas',
  );
  await lorePanel(page).getByRole('button', { name: 'Farol da candidata', exact: true }).click();
  edit = page.getByRole('dialog', { name: 'Editar lore da mesa', exact: true });
  await expect(edit.getByLabel('Detalhes da ficha', { exact: true })).toHaveValue(
    'CORPO CANDIDATO FAROL CONGELADO',
  );
  await edit.getByRole('button', { name: 'Fechar ficha', exact: true }).click();
  await invariant(page, source);
  await ownNote(page);
  await page.reload();
  await lorePanel(page).getByRole('button', { name: 'Lia legada da mesa', exact: true }).click();
  edit = page.getByRole('dialog', { name: 'Editar lore da mesa', exact: true });
  await expect(edit.getByLabel('Detalhes da ficha', { exact: true })).toHaveValue(
    'VARIANTE LEGADA EDITADA APÓS ADOÇÃO 🐉',
  );
  await edit.getByRole('button', { name: 'Fechar ficha', exact: true }).click();
  await page.evaluate(
    async ({ prefix, source }) => {
      const lore = (await import(
        prefix + 'loreService.ts'
      )) as typeof import('./fixtures/loreService');
      await lore.deleteLoreEntity({ kind: 'universe', id: source.worldId }, source.heroId);
    },
    { prefix, source },
  );
  await lorePanel(page)
    .getByRole('button', { name: 'Atualizar lore da mesa', exact: true })
    .click();
  await expect(
    lorePanel(page).getByRole('button', { name: 'Lia legada da mesa', exact: true }),
  ).toHaveCount(0);
  await ownNote(page);
  await expectNoHorizontalOverflow(page, 'legado adotado em 320px');
  await capture(page, info, 'adocao-legado-e-notas-320');
});

test('pedido C2 remoto bloqueia adoção e confirmação incerta conserva IDs após reload e conflito sem rebase', async ({
  page,
}, info) => {
  const source = await seedAdoption(page, false);
  await page.evaluate(
    async ({ prefix, source }) => {
      const api = (await import(
        prefix + 'campaignLoreFixture.ts'
      )) as typeof import('./fixtures/campaignLoreFixture');
      await api.prepareCampaignLoreVariant({
        campaignId: source.campaignId,
        campaignToken: source.campaignToken,
        baseId: source.baseId,
        sourceKey: source.removedKey,
        operationId: 'visual-adoption-remote-pending',
        expectedRevision: 0,
        relatedSourceKeys: [],
      });
    },
    { prefix, source },
  );
  await openReview(page, source);
  await dialog(page).getByRole('button', { name: 'Preparar atualização', exact: true }).click();
  await expect(
    dialog(page).getByRole('heading', { name: 'Preparação interrompida', exact: true }),
  ).toBeVisible();
  const remote = dialog(page).getByRole('region', {
    name: 'Pedidos preservados de lore',
    exact: true,
  });
  await flag(page, 'writer.visual.adoption-lost-response', 'resolveCampaignLoreRemoteOperation');
  await remote.getByRole('button', { name: 'Encerrar preparo remoto', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Encerrar recuperação de lore?', exact: true })
    .getByRole('button', { name: 'Confirmar encerramento do pedido', exact: true })
    .click();
  await expect(
    remote.getByRole('button', { name: 'Confirmar resolução preservada', exact: true }),
  ).toBeEnabled();
  await page.reload();
  await reopen(page, 'Preparação interrompida');
  await dialog(page)
    .getByRole('region', { name: 'Pedidos preservados de lore', exact: true })
    .getByRole('button', { name: 'Confirmar resolução preservada', exact: true })
    .click();
  await expect(
    dialog(page).getByText('Resolução do pedido remoto confirmada.', { exact: true }),
  ).toBeVisible();
  await close(page);
  await openReview(page, source);
  const id = (await calls(page))
    .filter((value) => value.method === 'startCampaignAdoption')
    .at(-1)!.operationId!;
  await page.evaluate(
    async ({ prefix, source, id }) => {
      const api = (await import(
        prefix + 'campaignAdoptionFixture.ts'
      )) as typeof import('./fixtures/campaignAdoptionFixture');
      await api.decideCampaignAdoption({
        adoptionId: id,
        operationId: 'visual-adoption-other-device',
        expectedCheckpoint: 0,
        sourceKey: source.removedKey,
        expectedRevision: 0,
        choice: 'keep-local',
      });
    },
    { prefix, source, id },
  );
  await chooseDropdown(
    dialog(page).getByRole('combobox', { name: 'Decisão para Farol da base antiga', exact: true }),
    'Usar ficha da candidata',
  );
  await page
    .getByRole('dialog', { name: 'Confirmar escolha da ficha inteira?', exact: true })
    .getByRole('button', { name: 'Confirmar escolha', exact: true })
    .click();
  await expect(
    dialog(page).getByRole('button', {
      name: 'Encerrar tentativa e consultar progresso atual',
      exact: true,
    }),
  ).toBeEnabled();
  const pending = await page.evaluate(
    async ({ path, campaignId, id }) => {
      const store = (await import(
        path
      )) as typeof import('../../src/features/campaign-adoptions/services/campaignAdoptionRecovery');
      const op = store.readAdoptionControl('visual-author', campaignId, id);
      return op && 'method' in op ? { method: op.method, input: op.input } : null;
    },
    { path: adoptionRecovery, campaignId: source.campaignId, id },
  );
  expect(pending).toMatchObject({
    method: 'decide',
    input: { expectedCheckpoint: 0, choice: 'use-candidate' },
  });
  await dialog(page)
    .getByRole('button', { name: 'Encerrar tentativa e consultar progresso atual', exact: true })
    .click();
  await expect(
    dialog(page).getByRole('button', { name: 'Preparar atualização', exact: true }),
  ).toBeDisabled();
  await dialog(page).getByRole('button', { name: 'Rever decisões', exact: true }).click();
  await choose(page, 'Farol da base antiga', 'Usar ficha da candidata');
  await prepare(page);
  await flag(page, 'writer.visual.adoption-lost-response', 'activateCampaignAdoption');
  await activate(page);
  await expect(
    dialog(page).getByRole('button', { name: 'Confirmar pedido de adoção', exact: true }),
  ).toBeEnabled();
  const first = (await calls(page))
    .filter((value) => value.method === 'activateCampaignAdoption')
    .at(-1)!;
  await page.reload();
  await reopen(page, 'Base adotada');
  await dialog(page)
    .getByRole('button', { name: 'Confirmar pedido de adoção', exact: true })
    .click();
  await expect
    .poll(async () => {
      const list = await calls(page);
      return list.filter(
        (value) =>
          value.method === 'activateCampaignAdoption' && value.operationId === first.operationId,
      ).length;
    })
    .toBe(2);
  await invariant(page, source);
  if (await dialog(page).count()) await close(page);
  await ownNote(page);
  await capture(page, info, 'adocao-recuperacao-sem-rebase');
});
