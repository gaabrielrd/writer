import type { Locator, Page } from '@playwright/test';
import {
  test,
  expect,
  capture,
  expectDialogWithinViewport,
  expectNoHorizontalOverflow,
} from './support';
const prefix = '/e2e/visual/fixtures/';
const recoveryPath =
  '/src/features/campaign-session-references/services/sessionReferenceRecovery.ts';
const uid = 'visual-author';
type Source = Awaited<
  ReturnType<typeof import('./fixtures/campaignSessionReferenceFixture').fixtureSeedSessionScenes>
>;
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('console', (m) => {
    if (m.type() === 'error') list.push(m.text());
  });
});
test.afterEach(async ({ page }, info) => {
  const list = errors.get(page) ?? [];
  await info.attach('console-errors', {
    body: JSON.stringify(list),
    contentType: 'application/json',
  });
  expect(list).toEqual([]);
});
async function seed(page: Page, paginated: boolean): Promise<Source> {
  await page.goto('/studio');
  return page.evaluate(
    async ({ prefix, paginated }) => {
      const api = (await import(
        prefix + 'campaignSessionReferenceFixture.ts'
      )) as typeof import('./fixtures/campaignSessionReferenceFixture');
      return api.fixtureSeedSessionScenes(paginated);
    },
    { prefix, paginated },
  );
}
async function select(page: Page, root: Locator, label: string, option: string) {
  await root.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
async function openSession(page: Page, source: Source, title = 'Preparar a travessia') {
  await page.getByRole('button', { name: 'Editar sessão ' + title, exact: true }).click();
  const parent = page.getByRole('dialog', { name: 'Editar sessão', exact: true }),
    slot = parent.getByRole('region', { name: 'Referências da sessão', exact: true });
  await expect(slot.getByRole('button', { name: 'Consultar vínculos', exact: true })).toBeEnabled();
  await expect(parent.getByLabel('Preparação da sessão', { exact: true })).toHaveValue(
    source.authorText,
  );
  await select(page, slot, 'Material da sessão', 'Cenas');
  await expect(slot.getByRole('button', { name: 'Vincular cena', exact: true })).toBeEnabled();
  return { parent, slot };
}
const picker = (page: Page) =>
  page.getByRole('dialog', { name: 'Vincular cena à sessão', exact: true });
const reader = (page: Page) =>
  page.getByRole('dialog', { name: 'Cena vinculada à sessão', exact: true });
async function choose(page: Page, slot: Locator, title: string, archive = false) {
  await slot.getByRole('button', { name: 'Vincular cena', exact: true }).click();
  if (archive) await select(page, picker(page), 'Cenas disponíveis', 'Arquivo');
  await picker(page)
    .getByRole('button', { name: 'Vincular cena ' + title, exact: true })
    .click();
  await expect(picker(page)).toHaveCount(0);
}
async function pending(page: Page, campaignId: string) {
  return page.evaluate(
    async ({ path, campaignId, uid }) => {
      const api = (await import(
        path
      )) as typeof import('../../src/features/campaign-session-references/services/sessionReferenceRecovery');
      return api.readPendingSessionReference(uid, campaignId);
    },
    { path: recoveryPath, campaignId, uid },
  );
}
async function flag(page: Page, name: string, method: string) {
  await page.evaluate(({ name, method }) => sessionStorage.setItem(name, method), { name, method });
}
async function closeSession(page: Page) {
  const parent = page.getByRole('dialog', { name: 'Editar sessão', exact: true });
  await parent.getByRole('button', { name: 'Fechar preparação', exact: true }).click();
  await expect(parent).toHaveCount(0);
}
async function verifyOwn(page: Page, source: Source) {
  const result = await page.evaluate(
    async ({ prefix, source }) => {
      const sessions = (await import(
        prefix + 'campaignSessionFixture.ts'
      )) as typeof import('./fixtures/campaignSessionFixture');
      const store = (await import(
        prefix + 'studioStore.ts'
      )) as typeof import('./fixtures/studioStore');
      return {
        own: (
          await sessions.getCampaignSession({
            campaignId: source.campaignId,
            campaignToken: source.campaignToken,
            sessionId: source.sessionId,
          })
        ).session,
        otherSession: (
          await sessions.getCampaignSession({
            campaignId: source.campaignId,
            campaignToken: source.campaignToken,
            sessionId: source.otherSessionId,
          })
        ).session,
        sourceUnchanged:
          JSON.stringify(await store.fixtureGet('adventure', source.adventureId)) ===
          source.sourceRoot,
        otherUnchanged:
          JSON.stringify(await store.fixtureGet('campaign', source.otherId)) === source.otherRoot,
      };
    },
    { prefix, source },
  );
  expect(result).toMatchObject({
    own: { revision: 1, summary: source.authorText },
    otherSession: { revision: 1, summary: 'OUTRA PREPARAÇÃO INTACTA' },
    sourceUnchanged: true,
    otherUnchanged: true,
  });
}

test('cena completa privada separa planejamento e main, pagina adicionais e arquivo com teclado e preparação dirty em 320px', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const source = await seed(page, true);
  await page.goto('/campaigns/' + source.campaignId);
  const { parent, slot } = await openSession(page, source),
    dirty = source.authorText + '\nRASCUNHO LOCAL NÃO SALVO';
  await parent.getByLabel('Preparação da sessão', { exact: true }).fill(dirty);
  const opener = slot.getByRole('button', { name: 'Vincular cena', exact: true });
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(
    picker(page).getByRole('button', { name: 'Vincular cena ' + source.sceneTitle, exact: true }),
  ).toBeEnabled();
  await expect(
    picker(page).getByRole('button', { name: 'Vincular cena Epílogo em Arquivo', exact: true }),
  ).toHaveCount(0);
  await expectDialogWithinViewport(page);
  await capture(page, info, 'cenas-picker-320');
  await picker(page).getByRole('button', { name: 'Fechar seleção de cena', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(opener).toBeFocused();
  await choose(page, slot, source.sceneTitle);
  const refresh = slot.getByRole('button', { name: 'Consultar vínculos', exact: true });
  await expect(refresh).toBeFocused();
  await page.keyboard.press('Enter');
  const readOpener = slot.getByRole('button', {
    name: 'Ler cena ' + source.sceneTitle,
    exact: true,
  });
  await readOpener.focus();
  await page.keyboard.press('Enter');
  await expect(reader(page).getByText('Alcançar o farol', { exact: true })).toBeVisible();
  await expect(reader(page).getByText('Maré e neblina 🐉', { exact: true })).toBeVisible();
  await expect(reader(page).getByText(/PRINCIPAL CONGELADO/)).toHaveCount(0);
  await expect(reader(page).getByLabel('Bloco selecionado', { exact: true })).toHaveCount(0);
  const blocks = reader(page).getByRole('region', {
    name: 'Blocos capturados da cena',
    exact: true,
  });
  await expect(blocks.getByRole('listitem')).toHaveCount(25);
  await expect(blocks.getByRole('listitem').nth(0)).toContainText('Bloco da travessia 0');
  await expect(blocks.getByRole('listitem').nth(1)).toContainText('Principal');
  await expect(
    blocks.getByRole('button', { name: 'Ler bloco ' + source.lastTitle, exact: true }),
  ).toHaveCount(0);
  await expect(
    reader(page).getByRole('button', { name: 'Ver ilustração do bloco', exact: true }),
  ).toHaveCount(0);
  await expectDialogWithinViewport(page);
  await capture(page, info, 'cenas-planejamento-320');
  await blocks.getByRole('button', { name: 'Ler bloco Texto principal', exact: true }).click();
  const selected = reader(page).getByLabel('Bloco selecionado', { exact: true });
  await expect(selected.getByText(/PRINCIPAL CONGELADO/)).toBeVisible();
  const corpus = await selected
    .locator('p')
    .filter({ hasText: 'PRINCIPAL CONGELADO' })
    .textContent();
  expect(corpus === source.mainText.slice(3, -4)).toBe(true);
  await expect(selected.getByText(/ALTERAÇÃO VIVA/)).toHaveCount(0);
  await expect(
    selected.getByText('Descrição da ilustração: Farol congelado na neblina', { exact: true }),
  ).toBeVisible();
  const mediaCalls = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('writer.visual.session-references')!) as {
      calls: { method: string }[];
    };
    return data.calls.filter((row) => row.method === 'readCampaignSessionSceneImage').length;
  });
  expect(mediaCalls).toBe(0);
  await selected.getByRole('button', { name: 'Ver ilustração do bloco', exact: true }).click();
  const image = page.getByRole('dialog', { name: 'Ilustração do bloco', exact: true });
  await expect(
    image.getByRole('img', { name: 'Farol congelado na neblina', exact: true }),
  ).toBeVisible();
  await expect(image.getByText('Ilustração privada da aventura', { exact: true })).toBeVisible();
  await expectDialogWithinViewport(page);
  await capture(page, info, 'cenas-imagem-320');
  await page.keyboard.press('Escape');
  await expect(image).toHaveCount(0);
  await expect(
    selected.getByRole('button', { name: 'Ver ilustração do bloco', exact: true }),
  ).toBeFocused();
  await blocks.getByRole('button', { name: 'Carregar mais blocos', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(blocks.getByRole('listitem')).toHaveCount(28);
  await blocks.getByRole('button', { name: 'Ler bloco ' + source.lastTitle, exact: true }).click();
  await expect(selected.getByText('ADICIONAL CONGELADO 27 🐉', { exact: true })).toBeVisible();
  await expect(selected.getByText(/PRINCIPAL CONGELADO/)).toHaveCount(0);
  await expect(
    selected.getByRole('button', { name: 'Ver ilustração do bloco', exact: true }),
  ).toHaveCount(0);
  await select(page, reader(page), 'Blocos disponíveis', 'Arquivo');
  await expect(blocks.getByRole('listitem')).toHaveCount(1);
  await expect(blocks.getByRole('listitem')).toContainText('Bloco guardado no Arquivo');
  await expect(selected).toHaveCount(0);
  await blocks
    .getByRole('button', { name: 'Ler bloco Bloco guardado no Arquivo', exact: true })
    .click();
  await expect(reader(page).getByText('ADICIONAL CONGELADO 2 🐉', { exact: true })).toBeVisible();
  await reader(page).getByRole('button', { name: 'Fechar cena vinculada', exact: true }).click();
  await expect(readOpener).toBeFocused();
  await expect(parent.getByLabel('Preparação da sessão', { exact: true })).toHaveValue(dirty);
  await choose(page, slot, 'Epílogo em Arquivo', true);
  await refresh.click();
  const archivedRow = slot.getByRole('listitem').filter({ hasText: 'Epílogo em Arquivo' });
  await expect(archivedRow.getByText('Arquivo da cena', { exact: true })).toBeVisible();
  await archivedRow
    .getByRole('button', { name: 'Ler cena Epílogo em Arquivo', exact: true })
    .click();
  await expect(
    reader(page).getByText('Nenhum bloco disponível neste recorte.', { exact: true }),
  ).toBeVisible();
  await select(page, reader(page), 'Blocos disponíveis', 'Arquivo');
  await reader(page)
    .getByRole('button', { name: 'Ler bloco Texto principal', exact: true })
    .click();
  await expect(reader(page).getByText('CENA ARQUIVADA CONGELADA', { exact: true })).toBeVisible();
  await reader(page).getByRole('button', { name: 'Fechar cena vinculada', exact: true }).click();
  await expect(parent.getByLabel('Preparação da sessão', { exact: true })).toHaveValue(dirty);
  await expectNoHorizontalOverflow(page, 'cenas privadas e arquivo em320px');
  await verifyOwn(page, source);
  await closeSession(page);
  await info.attach('corpus-congelado', {
    body: JSON.stringify({
      mainMatchesCaptured: true,
      liveEditAbsent: true,
      mainOccurrencesInActiveList: 1,
      activeBlocks: 28,
      archivedBlocks: 1,
    }),
    contentType: 'application/json',
  });
});

test('pedido scene confirmado após reload preserva rascunho e cena ausente após adoção fica removível', async ({
  page,
}) => {
  const source = await seed(page, false);
  await page.goto('/campaigns/' + source.campaignId);
  let opened = await openSession(page, source);
  await flag(page, 'writer.visual.reference-lost-response', 'addCampaignSessionReference');
  await choose(page, opened.slot, source.sceneTitle);
  await expect(
    opened.slot.getByRole('button', { name: 'Confirmar pedido de vínculo', exact: true }),
  ).toBeEnabled();
  const committed = await pending(page, source.campaignId);
  expect(committed?.intent).toBe('apply');
  expect(committed?.action === 'add' && committed.request.target.kind).toBe('scene');
  expect(JSON.stringify(committed)).not.toContain(source.sceneTitle);
  expect(JSON.stringify(committed)).not.toContain('PRINCIPAL CONGELADO');
  await closeSession(page);
  await page.reload();
  const controls = page
    .getByRole('heading', { name: 'Pedidos de vínculo de sessão', exact: true })
    .locator('..');
  await expect(
    controls.getByRole('button', { name: 'Confirmar pedido de vínculo', exact: true }),
  ).toBeEnabled();
  expect(await pending(page, source.campaignId)).toEqual(committed);
  await controls.getByRole('button', { name: 'Confirmar pedido de vínculo', exact: true }).click();
  await expect.poll(() => pending(page, source.campaignId)).toBeNull();
  opened = await openSession(page, source);
  const dirty = source.authorText + '\nRASCUNHO SOB RESPOSTA TARDIA';
  await opened.parent.getByLabel('Preparação da sessão', { exact: true }).fill(dirty);
  await flag(page, 'writer.visual.reference-hold-response', 'readCampaignSessionSceneReference');
  await opened.slot
    .getByRole('button', { name: 'Ler cena ' + source.sceneTitle, exact: true })
    .click();
  await expect(
    reader(page).getByText('Conferindo planejamento da cena...', { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const data = JSON.parse(localStorage.getItem('writer.visual.session-references')!) as {
          calls: { method: string }[];
        };
        return data.calls.some((c) => c.method === 'held:readCampaignSessionSceneReference');
      }),
    )
    .toBe(true);
  await reader(page).getByRole('button', { name: 'Fechar cena vinculada', exact: true }).click();
  await page.evaluate(() => {
    sessionStorage.removeItem('writer.visual.reference-hold-response');
    window.dispatchEvent(new Event('writer.visual.release-reference'));
  });
  await expect(reader(page)).toHaveCount(0);
  await expect(opened.parent.getByLabel('Preparação da sessão', { exact: true })).toHaveValue(
    dirty,
  );
  await closeSession(page);
  await page.evaluate(
    async ({ prefix, source }) => {
      const api = (await import(
        prefix + 'campaignSessionReferenceFixture.ts'
      )) as typeof import('./fixtures/campaignSessionReferenceFixture');
      await api.fixtureAdoptSessionSceneAbsence(source.campaignId, source.sceneId);
    },
    { prefix, source },
  );
  await page.reload();
  opened = await openSession(page, source);
  await expect(opened.slot.getByText('Material indisponível', { exact: true })).toBeVisible();
  await expect(
    opened.slot.getByRole('button', { name: 'Ler cena ' + source.sceneTitle, exact: true }),
  ).toHaveCount(0);
  await opened.slot.getByRole('button', { name: 'Remover vínculo 1', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Remover vínculo da sessão?', exact: true })
    .getByRole('button', { name: 'Confirmar remoção do vínculo', exact: true })
    .click();
  await opened.slot.getByRole('button', { name: 'Consultar vínculos', exact: true }).click();
  await expect(opened.slot.getByRole('listitem')).toHaveCount(0);
  await expect(opened.parent.getByLabel('Preparação da sessão', { exact: true })).toHaveValue(
    source.authorText,
  );
  await closeSession(page);
});

test('cancelamento scene sobrevive reload e fence; closer C4 preserva pedido lore antigo', async ({
  page,
}, info) => {
  const source = await seed(page, false);
  // Arrange the same server state left by the recovery/adoption journey: a removed
  // scene link, its receipt/control and the adopted base without that scene.
  // This uses the transport fixture, not product journals or a C4 controller mock.
  await page.evaluate(
    async ({ prefix, source }) => {
      const api = (await import(
        prefix + 'campaignSessionReferenceFixture.ts'
      )) as typeof import('./fixtures/campaignSessionReferenceFixture');
      const scope = {
        campaignId: source.campaignId,
        campaignToken: source.campaignToken,
        sessionId: source.sessionId,
        expectedSessionRevision: source.sessionRevision,
      };
      const initial = await api.listCampaignSessionReferences({
        ...scope,
        view: 'references',
        kind: 'scene',
      });
      if (!initial.sourceContext) throw Error('Contexto inicial da cena ausente');
      const referenceId = 'visual-session-scenes-before-cancel';
      const added = await api.addCampaignSessionReference({
        ...scope,
        referenceId,
        operationId: referenceId,
        expectedReferenceCollectionRevision: initial.referenceCollectionRevision,
        sourceContext: initial.sourceContext,
        target: { kind: 'scene', sourceKey: source.sceneKey },
      });
      if (added.kind !== 'confirmed') throw Error('Vínculo inicial não confirmado');
      const removed = await api.removeCampaignSessionReference({
        ...scope,
        referenceId,
        operationId: 'visual-session-scenes-removed-before-cancel',
        expectedRevision: added.receipt.revision,
        expectedReferenceCollectionRevision: added.receipt.referenceCollectionRevision,
      });
      if (removed.kind !== 'confirmed') throw Error('Remoção inicial não confirmada');
      await api.fixtureAdoptSessionSceneAbsence(source.campaignId, source.sceneId);
    },
    { prefix, source },
  );
  await page.goto('/campaigns/' + source.campaignId);
  const opened = await openSession(page, source);
  await expect(opened.slot.getByRole('listitem')).toHaveCount(0);
  await flag(page, 'writer.visual.reference-before-receive', 'addCampaignSessionReference');
  await choose(page, opened.slot, 'Epílogo em Arquivo', true);
  const unknown = await pending(page, source.campaignId);
  expect(unknown?.action === 'add' && unknown.request.target.kind).toBe('scene');
  await closeSession(page);
  await page.reload();
  let controls = page
    .getByRole('heading', { name: 'Pedidos de vínculo de sessão', exact: true })
    .locator('..');
  await flag(
    page,
    'writer.visual.reference-lost-response',
    'resolveCampaignSessionReferenceOperation',
  );
  await controls.getByRole('button', { name: 'Encerrar pedido de vínculo', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Encerrar pedido de vínculo?', exact: true })
    .getByRole('button', { name: 'Confirmar encerramento do vínculo', exact: true })
    .click();
  await expect.poll(async () => (await pending(page, source.campaignId))?.intent).toBe('cancel');
  await page.reload();
  controls = page
    .getByRole('heading', { name: 'Pedidos de vínculo de sessão', exact: true })
    .locator('..');
  await controls
    .getByRole('button', { name: 'Confirmar encerramento do pedido', exact: true })
    .click();
  await expect.poll(() => pending(page, source.campaignId)).toBeNull();
  if (!unknown || unknown.action !== 'add') throw Error('Pedido scene original ausente');
  const late = await page.evaluate(
    async ({ prefix, request }) => {
      const api = (await import(
        prefix + 'campaignSessionReferenceFixture.ts'
      )) as typeof import('./fixtures/campaignSessionReferenceFixture');
      return (await api.addCampaignSessionReference(request)).kind;
    },
    { prefix, request: unknown.request },
  );
  expect(late).toBe('canceled');
  // Reserve the literal old lore metadata journal through the real product adapter, not a controller mock.
  await page.evaluate(
    async ({ path, source, uid }) => {
      const api = (await import(
        path
      )) as typeof import('../../src/features/campaign-session-references/services/sessionReferenceRecovery');
      await api.reserveSessionReference(
        {
          schemaVersion: 1,
          ownerId: uid,
          intent: 'apply',
          action: 'add',
          request: {
            campaignId: source.campaignId,
            campaignToken: source.campaignToken,
            sessionId: source.sessionId,
            expectedSessionRevision: 1,
            referenceId: 'visual-session-scenes-old-lore-journal',
            operationId: 'visual-session-scenes-old-lore-journal',
            expectedReferenceCollectionRevision: 0,
            sourceContext: { baseId: source.baseId, projectionToken: 'a'.repeat(64) },
            target: { kind: 'lore', sourceKey: source.loreKey },
          },
        },
        () => {},
      );
    },
    { path: recoveryPath, source, uid },
  );
  const oldLore = await pending(page, source.campaignId);
  await page.reload();
  expect(await pending(page, source.campaignId)).toEqual(oldLore);
  await page.getByRole('button', { name: 'Excluir campanha', exact: true }).click();
  const deletion = page.getByRole('dialog', { name: 'Excluir campanha', exact: true });
  await deletion.getByRole('button', { name: 'Excluir definitivamente', exact: true }).click();
  await expect(
    deletion.getByRole('heading', { name: 'Campanha excluída', exact: true }),
  ).toBeVisible();
  expect(await pending(page, source.campaignId)).toEqual(oldLore);
  await deletion
    .getByRole('button', { name: 'Encerrar controles antigos deste navegador', exact: true })
    .click();
  let closure = page.getByRole('dialog', {
    name: 'Encerrar controles da campanha excluída?',
    exact: true,
  });
  await expect(closure.getByText('Pedido de vínculo da sessão', { exact: true })).toBeVisible();
  await closure.getByRole('button', { name: 'Manter controles', exact: true }).click();
  expect(await pending(page, source.campaignId)).toEqual(oldLore);
  await deletion
    .getByRole('button', { name: 'Encerrar controles antigos deste navegador', exact: true })
    .click();
  closure = page.getByRole('dialog', {
    name: 'Encerrar controles da campanha excluída?',
    exact: true,
  });
  await closure
    .getByRole('button', { name: 'Confirmar encerramento dos controles', exact: true })
    .click();
  await expect.poll(() => pending(page, source.campaignId)).toBeNull();
  const other = await page.evaluate(
    async ({ prefix, source }) => {
      const store = (await import(
        prefix + 'studioStore.ts'
      )) as typeof import('./fixtures/studioStore');
      return (
        JSON.stringify(await store.fixtureGet('campaign', source.otherId)) === source.otherRoot
      );
    },
    { prefix, source },
  );
  expect(other).toBe(true);
  await expectDialogWithinViewport(page);
  await expectNoHorizontalOverflow(page, 'recuperação scene e closer C4');
  await capture(page, info, 'cenas-recuperacao-C4');
});
