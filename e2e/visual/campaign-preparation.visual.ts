import type { Locator, Page } from '@playwright/test';
import {
  test,
  expect,
  capture,
  expectDialogWithinViewport,
  expectNoHorizontalOverflow,
} from './support';
const prefix = '/e2e/visual/fixtures/';
const recoveryPath = '/src/features/campaign-preparation/services/campaignPreparationRecovery.ts';
const uid = 'visual-author';
type Source = Awaited<
  ReturnType<typeof import('./fixtures/campaignPreparationFixture').fixtureSeedCampaignPreparation>
>;
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('console', (message) => {
    if (message.type() === 'error') list.push(message.text());
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
async function seed(page: Page): Promise<Source> {
  await page.goto('/studio');
  return page.evaluate(async (prefix) => {
    const api = (await import(
      prefix + 'campaignPreparationFixture.ts'
    )) as typeof import('./fixtures/campaignPreparationFixture');
    return api.fixtureSeedCampaignPreparation();
  }, prefix);
}
const preparation = (page: Page) =>
  page.getByRole('dialog', { name: 'Pistas e missões da campanha', exact: true });
const sessionDialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Editar sessão', exact: true });
const editor = (page: Page) =>
  preparation(page).getByRole('region', { name: 'Editor de pista ou missão', exact: true });
const catalogueRow = (page: Page, title: string) =>
  preparation(page)
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: title, exact: true, level: 3 }) });
const linkRegion = (page: Page) =>
  preparation(page).getByRole('region', { name: 'Itens vinculados à sessão', exact: true });
async function select(page: Page, root: Locator, label: string, option: string) {
  await root.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
async function openSession(page: Page, title = 'Preparar a travessia') {
  await page.getByRole('button', { name: 'Editar sessão ' + title, exact: true }).click();
  const parent = sessionDialog(page);
  await expect(parent.getByLabel('Preparação da sessão', { exact: true })).toBeVisible();
  await parent.getByRole('button', { name: 'Pistas e missões desta sessão', exact: true }).click();
  await expect(preparation(page)).toBeVisible();
  await expect(
    linkRegion(page).getByRole('button', { name: 'Atualizar vínculos', exact: true }),
  ).toBeEnabled();
  return parent;
}
async function closePreparation(page: Page) {
  await preparation(page)
    .getByRole('button', { name: 'Fechar e manter preparação', exact: true })
    .click();
  await expect(preparation(page)).toHaveCount(0);
}
async function closeSession(page: Page) {
  await sessionDialog(page).getByRole('button', { name: 'Fechar preparação', exact: true }).click();
  await expect(sessionDialog(page)).toHaveCount(0);
}
async function refresh(page: Page) {
  await preparation(page).getByRole('button', { name: 'Atualizar itens', exact: true }).click();
  await expect(preparation(page).getByText('Carregando itens...', { exact: true })).toHaveCount(0);
}
async function refreshLinks(page: Page) {
  await linkRegion(page).getByRole('button', { name: 'Atualizar vínculos', exact: true }).click();
  await expect(linkRegion(page).getByText('Carregando vínculos...', { exact: true })).toHaveCount(
    0,
  );
}
async function discard(page: Page) {
  if (await editor(page).count()) {
    await editor(page).getByRole('button', { name: 'Descartar rascunho', exact: true }).click();
    await expect(editor(page)).toHaveCount(0);
  }
}
async function consult(page: Page, title: string) {
  await discard(page);
  await catalogueRow(page, title)
    .getByRole('button', { name: 'Consultar item', exact: true })
    .click();
  await expect(editor(page).getByLabel('Título do item', { exact: true })).toHaveValue(title);
}
async function saved(page: Page) {
  await editor(page).getByRole('button', { name: 'Salvar item', exact: true }).click();
  await expect(
    page.getByText('Pedido da preparação confirmado. Consulte a lista atual.', { exact: true }),
  ).toBeVisible();
  await expect(editor(page).getByText(/Seu rascunho foi preservado/)).toBeVisible();
  await discard(page);
  await refresh(page);
}
async function idle(page: Page) {
  await expect(
    preparation(page).getByRole('button', { name: /^Nova (pista|missão)$/, exact: true }),
  ).toBeEnabled();
}
async function add(page: Page, title: string) {
  await catalogueRow(page, title)
    .getByRole('button', { name: 'Vincular a esta sessão', exact: true })
    .click();
  await idle(page);
  await refresh(page);
  await refreshLinks(page);
  await expect(linkRegion(page).getByRole('heading', { name: title, exact: true })).toBeVisible();
}
async function pending(page: Page, campaignId: string) {
  return page.evaluate(
    async ({ path, campaignId, uid }) => {
      const api = (await import(
        path
      )) as typeof import('../../src/features/campaign-preparation/services/campaignPreparationRecovery');
      return api.readPendingCampaignPreparation(uid, campaignId);
    },
    { path: recoveryPath, campaignId, uid },
  );
}
async function flag(page: Page, key: string, method: string) {
  await page.evaluate(({ key, method }) => sessionStorage.setItem(key, method), { key, method });
}
async function verifySource(page: Page, source: Source) {
  const result = await page.evaluate(
    async ({ prefix, source }) => {
      const store = (await import(
        prefix + 'studioStore.ts'
      )) as typeof import('./fixtures/studioStore');
      return {
        original: JSON.stringify(await store.fixtureGet('adventure', source.adventureId)),
        other: JSON.stringify(await store.fixtureGet('campaign', source.otherId)),
      };
    },
    { prefix, source },
  );
  expect(result).toEqual({ original: source.sourceRoot, other: source.otherRoot });
}

test('pistas e missões são criadas e ordenadas sem perder rascunho da sessão', async ({
  page,
}, info) => {
  if (info.project.name.startsWith('mobile'))
    await page.setViewportSize({ width: 320, height: 740 });
  const source = await seed(page);
  await page.goto('/campaigns/' + source.campaignId);
  await page
    .getByRole('button', { name: 'Editar sessão Preparar a travessia', exact: true })
    .click();
  const parent = sessionDialog(page),
    dirty = source.authorText + '\nPREPARAÇÃO LOCAL NÃO SALVA';
  await parent.getByLabel('Preparação da sessão', { exact: true }).fill(dirty);
  const opener = parent.getByRole('button', { name: 'Pistas e missões desta sessão', exact: true });
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(preparation(page)).toBeVisible();
  await select(page, preparation(page), 'Mostrar itens', 'Todos');
  await preparation(page).getByRole('button', { name: 'Nova pista', exact: true }).click();
  await editor(page)
    .getByLabel('Título do item', { exact: true })
    .fill('Pista preparada no navegador');
  await editor(page)
    .getByLabel('Texto da pista', { exact: true })
    .fill('  PISTA DO NAVEGADOR 🐉\nTexto sem cópia.  ');
  await editor(page).getByLabel('Condição de descoberta', { exact: true }).fill('Ao abrir o baú');
  await editor(page).getByLabel('Destinatário da pista', { exact: true }).fill('Tripulação');
  await expectDialogWithinViewport(page);
  await capture(page, info, 'preparacao-pista-editor-320');
  await saved(page);
  await refreshLinks(page);
  await add(page, 'Pista preparada no navegador');
  await preparation(page)
    .getByRole('button', { name: 'Subir item Pista preparada no navegador', exact: true })
    .click();
  await idle(page);
  await refresh(page);
  await refreshLinks(page);
  await select(page, preparation(page), 'Tipo de item', 'Missões');
  await preparation(page).getByRole('button', { name: 'Nova missão', exact: true }).click();
  await editor(page)
    .getByLabel('Título do item', { exact: true })
    .fill('Missão preparada no navegador');
  await editor(page).getByLabel('Descrição da missão', { exact: true }).fill('MISSÃO DO NAVEGADOR');
  await editor(page)
    .getByLabel('Possíveis consequências', { exact: true })
    .fill('A vila pode recuperar a luz.');
  await saved(page);
  await refreshLinks(page);
  await add(page, 'Missão preparada no navegador');
  await preparation(page)
    .getByRole('button', { name: 'Subir vínculo Missão preparada no navegador', exact: true })
    .click();
  await idle(page);
  await refresh(page);
  await refreshLinks(page);
  await expect(linkRegion(page).getByRole('listitem').nth(0)).toContainText(
    'Missão preparada no navegador',
  );
  await capture(page, info, 'preparacao-vinculos-mistos-320');
  await closePreparation(page);
  await expect(opener).toBeFocused();
  await expect(parent.getByLabel('Preparação da sessão', { exact: true })).toHaveValue(dirty);
  await opener.click();
  await expect(preparation(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(preparation(page)).toHaveCount(0);
  await expect(parent).toBeVisible();
  await expect(parent.getByLabel('Preparação da sessão', { exact: true })).toHaveValue(dirty);
  await expect(opener).toBeFocused();
  await parent.getByRole('button', { name: 'Descartar rascunho e fechar', exact: true }).click();
  await expect(parent).toHaveCount(0);
  await verifySource(page, source);
  await expectNoHorizontalOverflow(page, 'preparação com rascunho próprio');
});

test('missão reutilizada compartilha estado e preserva texto ao excluir sessão', async ({
  page,
}, info) => {
  if (info.project.name.startsWith('mobile'))
    await page.setViewportSize({ width: 320, height: 740 });
  const source = await seed(page);
  // Arrange a mission already linked to the first session. The previous journey
  // proves creation, linking, ordering and preservation of the S1 draft through UI.
  await page.evaluate(
    async ({ prefix, source }) => {
      const api = (await import(
        prefix + 'campaignPreparationFixture.ts'
      )) as typeof import('./fixtures/campaignPreparationFixture');
      const scope = { campaignId: source.campaignId, campaignToken: source.campaignToken };
      const catalogue = await api.listCampaignPreparationItems({
        ...scope,
        kind: 'quest',
        view: 'all',
      });
      const itemId = 'visual-preparation-shared-quest';
      const result = await api.saveCampaignPreparationItem({
        ...scope,
        itemId,
        operationId: itemId,
        expectedRevision: 0,
        expectedItemCollectionRevision: catalogue.itemCollectionRevision,
        kind: 'quest',
        title: 'Missão preparada no navegador',
        status: 'available',
        body: { description: 'MISSÃO DO NAVEGADOR', consequences: 'A vila pode recuperar a luz.' },
      });
      if (result.kind !== 'confirmed') throw Error('Missão de preparação não criada');
      const sessionScope = {
        ...scope,
        sessionId: source.sessionId,
        expectedSessionRevision: 1,
      };
      const links = await api.listCampaignSessionPreparationLinks(sessionScope);
      const created = await api.listCampaignPreparationItems({
        ...scope,
        kind: 'quest',
        view: 'all',
      });
      const item = created.items.find((row) => row.id === itemId);
      if (!item) throw Error('Missão de preparação ausente');
      const linked = await api.addCampaignSessionPreparationLink({
        ...sessionScope,
        operationId: 'visual-preparation-shared-first-link',
        linkId: 'visual-preparation-shared-first-link',
        expectedRevision: 0,
        expectedLinkCollectionRevision: links.linkCollectionRevision,
        itemId,
        expectedItemRevision: item.revision,
      });
      if (linked.kind !== 'confirmed') throw Error('Vínculo de preparação não criado');
    },
    { prefix, source },
  );
  await page.goto('/campaigns/' + source.campaignId);
  await openSession(page, 'Outra sessão preservada');
  await select(page, preparation(page), 'Tipo de item', 'Missões');
  await select(page, preparation(page), 'Mostrar itens', 'Pendentes');
  await add(page, 'Missão preparada no navegador');
  await consult(page, 'Missão preparada no navegador');
  await select(page, editor(page), 'Estado do item', 'Em andamento');
  await saved(page);
  await refreshLinks(page);
  await expect(linkRegion(page).getByRole('listitem')).toContainText('Em andamento');
  await consult(page, 'Missão preparada no navegador');
  await select(page, editor(page), 'Estado do item', 'Concluída');
  await saved(page);
  await refreshLinks(page);
  await expect(catalogueRow(page, 'Missão preparada no navegador')).toHaveCount(0);
  await expect(linkRegion(page).getByRole('listitem')).toContainText('Concluída');
  await capture(page, info, 'preparacao-missao-concluida-320');
  await closePreparation(page);
  await closeSession(page);
  // Delete through the real S1 UI; campaign items are independent of this tombstone.
  await page
    .getByRole('button', { name: 'Excluir sessão Preparar a travessia', exact: true })
    .click();
  const deletion = page.getByRole('dialog', { name: 'Excluir sessão', exact: true });
  await deletion
    .getByRole('button', { name: 'Excluir definitivamente a sessão', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Editar sessão Preparar a travessia', exact: true }),
  ).toHaveCount(0);
  const state = await page.evaluate(
    async ({ prefix, source }) => {
      const api = (await import(
        prefix + 'campaignPreparationFixture.ts'
      )) as typeof import('./fixtures/campaignPreparationFixture');
      const scope = { campaignId: source.campaignId, campaignToken: source.campaignToken };
      const page = await api.listCampaignPreparationItems({ ...scope, kind: 'quest', view: 'all' });
      const item = page.items.find((i) => i.title === 'Missão preparada no navegador')!;
      const full = await api.getCampaignPreparationItem({
        ...scope,
        itemId: item.id,
        expectedRevision: item.revision,
      });
      const links = await api.listCampaignSessionPreparationLinks({
        ...scope,
        sessionId: source.otherSessionId,
        expectedSessionRevision: 1,
      });
      return { full: full.item, links: links.items };
    },
    { prefix, source },
  );
  expect(state.full).toMatchObject({
    status: 'completed',
    body: { description: 'MISSÃO DO NAVEGADOR', consequences: 'A vila pode recuperar a luz.' },
  });
  expect(state.links).toHaveLength(1);
  expect(state.links[0]).toMatchObject({ available: true, target: { status: 'completed' } });
  await verifySource(page, source);
  await expectNoHorizontalOverflow(page, 'preparação final');
});

test('recibo de preparação após reload confirma pedido e preserva texto salvo', async ({
  page,
}) => {
  const source = await seed(page);
  await page.goto('/campaigns/' + source.campaignId);
  await openSession(page);
  await select(page, preparation(page), 'Mostrar itens', 'Todos');
  await consult(page, 'A chave da maré');
  await editor(page)
    .getByLabel('Texto da pista', { exact: true })
    .fill('TEXTO SALVO COM RESPOSTA PERDIDA');
  await flag(page, 'writer.visual.preparation-lost-response', 'saveCampaignPreparationItem');
  await editor(page).getByRole('button', { name: 'Salvar item', exact: true }).click();
  await expect.poll(() => pending(page, source.campaignId)).not.toBeNull();
  const committed = await pending(page, source.campaignId);
  expect(committed?.action).toBe('save-item');
  await closePreparation(page);
  await closeSession(page);
  await page.reload();
  expect(await pending(page, source.campaignId)).toEqual(committed);
  await page.getByRole('button', { name: 'Confirmar pedido preservado', exact: true }).click();
  await expect.poll(() => pending(page, source.campaignId)).toBeNull();
  await openSession(page);
  await select(page, preparation(page), 'Mostrar itens', 'Todos');
  await consult(page, 'A chave da maré');
  await expect(editor(page).getByLabel('Texto da pista', { exact: true })).toHaveValue(
    'TEXTO SALVO COM RESPOSTA PERDIDA',
  );
  await closePreparation(page);
  await closeSession(page);
  await verifySource(page, source);
});

test('conflito de preparação preserva rascunho e permite encerrar pedido sem executar', async ({
  page,
}) => {
  const source = await seed(page);
  await page.goto('/campaigns/' + source.campaignId);
  await openSession(page);
  await select(page, preparation(page), 'Mostrar itens', 'Todos');
  await consult(page, 'A chave da maré');
  // A changed collection/item causes a genuine CAS conflict and preserves the unsent form.
  await page.evaluate(
    async ({ prefix, source }) => {
      const api = (await import(
        prefix + 'campaignPreparationFixture.ts'
      )) as typeof import('./fixtures/campaignPreparationFixture');
      const scope = { campaignId: source.campaignId, campaignToken: source.campaignToken },
        p = await api.listCampaignPreparationItems({ ...scope, kind: 'clue', view: 'all' });
      const current = p.items.find((i) => i.id === source.clueId);
      if (!current) throw Error('Pista esperada');
      const item = await api.getCampaignPreparationItem({
        ...scope,
        itemId: source.clueId,
        expectedRevision: current.revision,
      });
      if (item.item.kind !== 'clue') throw Error('Pista esperada');
      await api.saveCampaignPreparationItem({
        ...scope,
        operationId: 'visual-preparation-external-conflict',
        itemId: source.clueId,
        expectedRevision: item.item.revision,
        expectedItemCollectionRevision: p.itemCollectionRevision,
        kind: 'clue',
        title: item.item.title,
        status: item.item.status,
        body: { ...item.item.body, text: 'EDIÇÃO DE OUTRA ABA' },
      });
    },
    { prefix, source },
  );
  const draft = 'RASCUNHO LOCAL PRESERVADO APÓS CONFLITO';
  await editor(page).getByLabel('Texto da pista', { exact: true }).fill(draft);
  await editor(page).getByRole('button', { name: 'Salvar item', exact: true }).click();
  await expect.poll(() => pending(page, source.campaignId)).not.toBeNull();
  await expect(editor(page).getByLabel('Texto da pista', { exact: true })).toHaveValue(draft);
  await closePreparation(page);
  await closeSession(page);
  await page.getByRole('button', { name: 'Encerrar pedido sem executar', exact: true }).click();
  await expect.poll(() => pending(page, source.campaignId)).toBeNull();
  await verifySource(page, source);
});

test('vínculo de item excluído fica neutro após adoção sem perder texto próprio', async ({
  page,
}, info) => {
  const source = await seed(page);
  await page.goto('/campaigns/' + source.campaignId);
  // Arrange a removed item with a surviving link via the same transport; render/removal use the product UI.
  await page.evaluate(
    async ({ prefix, source }) => {
      const api = (await import(
        prefix + 'campaignPreparationFixture.ts'
      )) as typeof import('./fixtures/campaignPreparationFixture');
      const scope = { campaignId: source.campaignId, campaignToken: source.campaignToken },
        s = { ...scope, sessionId: source.sessionId, expectedSessionRevision: 1 },
        p = await api.listCampaignPreparationItems({ ...scope, kind: 'clue', view: 'all' }),
        row = p.items.find((i) => i.id === source.clueId)!,
        links = await api.listCampaignSessionPreparationLinks(s);
      await api.addCampaignSessionPreparationLink({
        ...s,
        operationId: 'visual-preparation-neutral-linked',
        linkId: 'visual-preparation-neutral-linked',
        expectedRevision: 0,
        expectedLinkCollectionRevision: links.linkCollectionRevision,
        itemId: row.id,
        expectedItemRevision: row.revision,
      });
      await api.deleteCampaignPreparationItem({
        ...scope,
        operationId: 'visual-preparation-neutral-deleted',
        itemId: row.id,
        expectedRevision: row.revision,
        expectedItemCollectionRevision: p.itemCollectionRevision,
      });
      const sourceApi = (await import(
        prefix + 'campaignSessionReferenceFixture.ts'
      )) as typeof import('./fixtures/campaignSessionReferenceFixture');
      await sourceApi.fixtureAdoptSessionSceneAbsence(source.campaignId, source.sceneId);
    },
    { prefix, source },
  );
  await page.reload();
  await openSession(page);
  await expect(
    linkRegion(page).getByRole('heading', { name: 'Item indisponível', exact: true }),
  ).toBeVisible();
  await expect(linkRegion(page).getByText('A chave da maré', { exact: true })).toHaveCount(0);
  await linkRegion(page).getByRole('button', { name: 'Remover vínculo', exact: true }).click();
  await idle(page);
  await refreshLinks(page);
  await expect(linkRegion(page).getByRole('listitem')).toHaveCount(0);
  await select(page, preparation(page), 'Tipo de item', 'Missões');
  await consult(page, 'Salvar o farol');
  await expect(editor(page).getByLabel('Descrição da missão', { exact: true })).toHaveValue(
    'MISSÃO PRÓPRIA',
  );
  await capture(page, info, 'preparacao-origem-adotada-texto-proprio');
  await closePreparation(page);
  await closeSession(page);
});

test('cancelamento próprio sobrevive reload e fence; closer C4 preserva outra campanha', async ({
  page,
}, info) => {
  const source = await seed(page);
  await page.goto('/campaigns/' + source.campaignId);
  // Arrange an unknown save through the actual journal adapter and fixture transport.
  // This isolates durable cancellation from the recognition/conflict journey's navigation budget.
  const unknown = await page.evaluate(
    async ({ prefix, path, source, uid }) => {
      const api = (await import(
        prefix + 'campaignPreparationFixture.ts'
      )) as typeof import('./fixtures/campaignPreparationFixture');
      const recovery = (await import(
        path
      )) as typeof import('../../src/features/campaign-preparation/services/campaignPreparationRecovery');
      const request = {
        campaignId: source.campaignId,
        campaignToken: source.campaignToken,
        operationId: 'visual-preparation-unknown-request',
        itemId: 'visual-preparation-unknown-request',
        expectedRevision: 0,
        expectedItemCollectionRevision: 2,
        kind: 'clue' as const,
        title: 'Pedido desconhecido',
        status: 'pending' as const,
        body: { text: 'PEDIDO ORIGINAL PRIVADO', condition: '', recipient: '' },
      };
      await recovery.reserveCampaignPreparation(
        { schemaVersion: 1, ownerId: uid, intent: 'apply', action: 'save-item', request },
        () => {},
      );
      sessionStorage.setItem(
        'writer.visual.preparation-before-receive',
        'saveCampaignPreparationItem',
      );
      try {
        await api.saveCampaignPreparationItem(request);
        throw Error('Falha injetada não ocorreu');
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('Pedido não recebido'))
          throw error;
      }
      return request;
    },
    { prefix, path: recoveryPath, source, uid },
  );
  await flag(
    page,
    'writer.visual.preparation-lost-response',
    'resolveCampaignPreparationOperation',
  );
  await page.getByRole('button', { name: 'Encerrar pedido sem executar', exact: true }).click();
  await expect.poll(async () => (await pending(page, source.campaignId))?.intent).toBe('cancel');
  await page.reload();
  await page.getByRole('button', { name: 'Confirmar encerramento', exact: true }).click();
  await expect.poll(() => pending(page, source.campaignId)).toBeNull();
  const late = await page.evaluate(
    async ({ prefix, request }) => {
      const api = (await import(
        prefix + 'campaignPreparationFixture.ts'
      )) as typeof import('./fixtures/campaignPreparationFixture');
      return (await api.saveCampaignPreparationItem(request)).kind;
    },
    { prefix, request: unknown },
  );
  expect(late).toBe('canceled');
  // Real product journal/locks and real C4 closer; only network transport is simulated.
  await page.evaluate(
    async ({ path, source, uid, prefix }) => {
      const store = (await import(
        prefix + 'studioStore.ts'
      )) as typeof import('./fixtures/studioStore');
      const api = (await import(
        path
      )) as typeof import('../../src/features/campaign-preparation/services/campaignPreparationRecovery');
      for (const campaignId of [source.campaignId, source.otherId])
        await api.reserveCampaignPreparation(
          {
            schemaVersion: 1,
            ownerId: uid,
            intent: 'apply',
            action: 'save-item',
            request: {
              campaignId,
              campaignToken: store.fixtureCampaignToken(uid, campaignId),
              operationId: 'visual-preparation-preserved-control',
              itemId: 'visual-preparation-preserved-control',
              expectedRevision: 0,
              expectedItemCollectionRevision: 0,
              kind: 'clue',
              title: 'Controle próprio preservado',
              status: 'pending',
              body: { text: 'PEDIDO PRIVADO', condition: '', recipient: '' },
            },
          },
          () => {},
        );
    },
    { path: recoveryPath, source, uid, prefix },
  );
  const own = await pending(page, source.campaignId),
    other = await pending(page, source.otherId);
  await page.getByRole('button', { name: 'Excluir campanha', exact: true }).click();
  const deletion = page.getByRole('dialog', { name: 'Excluir campanha', exact: true });
  await deletion.getByRole('button', { name: 'Excluir definitivamente', exact: true }).click();
  await expect(
    deletion.getByRole('heading', { name: 'Campanha excluída', exact: true }),
  ).toBeVisible();
  expect(await pending(page, source.campaignId)).toEqual(own);
  await deletion
    .getByRole('button', { name: 'Encerrar controles antigos deste navegador', exact: true })
    .click();
  const closer = page.getByRole('dialog', {
    name: 'Encerrar controles da campanha excluída?',
    exact: true,
  });
  await expect(
    closer.getByText('Pedido de pista ou missão privada', { exact: true }),
  ).toBeVisible();
  await closer.getByRole('button', { name: 'Manter controles', exact: true }).click();
  expect(await pending(page, source.campaignId)).toEqual(own);
  await deletion
    .getByRole('button', { name: 'Encerrar controles antigos deste navegador', exact: true })
    .click();
  await closer
    .getByRole('button', { name: 'Confirmar encerramento dos controles', exact: true })
    .click();
  await expect.poll(() => pending(page, source.campaignId)).toBeNull();
  expect(await pending(page, source.otherId)).toEqual(other);
  await capture(page, info, 'preparacao-controles-encerrados');
});
