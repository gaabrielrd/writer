import type { Locator, Page } from '@playwright/test';
import {
  capture,
  expect,
  expectDialogWithinViewport,
  expectNoHorizontalOverflow,
  test,
} from './support';
const prefix = '/e2e/visual/fixtures/';
const recoveryPath =
  '/src/features/campaign-session-references/services/sessionReferenceRecovery.ts';
const uid = 'visual-author';
type Source = Awaited<
  ReturnType<
    typeof import('./fixtures/campaignSessionReferenceFixture').fixtureSeedSessionReferences
  >
>;
async function seed(page: Page, paginated: boolean): Promise<Source> {
  await page.goto('/studio');
  return page.evaluate(
    async ({ prefix, paginated }) => {
      const fixture = (await import(
        prefix + 'campaignSessionReferenceFixture.ts'
      )) as typeof import('./fixtures/campaignSessionReferenceFixture');
      return fixture.fixtureSeedSessionReferences(paginated);
    },
    { prefix, paginated },
  );
}
async function openSession(page: Page, source: Source, title = 'Encontro com as fichas da mesa') {
  await page.getByRole('button', { name: 'Editar sessão ' + title, exact: true }).click();
  const parent = page.getByRole('dialog', { name: 'Editar sessão', exact: true });
  const slot = parent.getByRole('region', { name: 'Referências da sessão', exact: true });
  await expect(slot.getByRole('button', { name: 'Vincular ficha', exact: true })).toBeEnabled();
  if (title === 'Encontro com as fichas da mesa')
    await expect(parent.getByLabel('Preparação da sessão', { exact: true })).toHaveValue(
      source.authorText,
    );
  return { parent, slot };
}
const picker = (page: Page) =>
  page.getByRole('dialog', { name: 'Vincular ficha à sessão', exact: true });
async function choose(page: Page, slot: Locator, name: string, paginated = false) {
  await slot.getByRole('button', { name: 'Vincular ficha', exact: true }).click();
  if (paginated)
    await picker(page).getByRole('button', { name: 'Carregar mais fichas', exact: true }).click();
  await picker(page)
    .getByRole('button', { name: 'Vincular ' + name, exact: true })
    .click();
  await expect(picker(page)).toHaveCount(0);
}
async function pending(page: Page, campaignId: string) {
  return page.evaluate(
    async ({ path, campaignId, uid }) => {
      const recovery = (await import(
        path
      )) as typeof import('../../src/features/campaign-session-references/services/sessionReferenceRecovery');
      return recovery.readPendingSessionReference(uid, campaignId);
    },
    { path: recoveryPath, campaignId, uid },
  );
}
async function flag(page: Page, name: string, method: string) {
  await page.evaluate(({ name, method }) => sessionStorage.setItem(name, method), { name, method });
}
async function closePreparation(page: Page) {
  const parent = page.getByRole('dialog', { name: 'Editar sessão', exact: true });
  await parent.getByRole('button', { name: 'Fechar preparação', exact: true }).click();
  await expect(parent).toHaveCount(0);
}
async function deleteSession(page: Page, title: string) {
  await page.getByRole('button', { name: 'Excluir sessão ' + title, exact: true }).click();
  const deletion = page.getByRole('dialog', { name: 'Excluir sessão', exact: true });
  await deletion
    .getByRole('button', { name: 'Excluir definitivamente a sessão', exact: true })
    .click();
  await expect(deletion).toHaveCount(0);
}
function consoleErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('referências efetivas e legadas em 320px usam picker paginado e preservam foco e preparação dirty', async ({
  page,
}, info) => {
  const errors = consoleErrors(page);
  await page.setViewportSize({ width: 320, height: 740 });
  const source = await seed(page, true);
  await page.goto('/campaigns/' + source.campaignId);
  const { parent, slot } = await openSession(page, source);
  const dirty = source.authorText + '\nRASCUNHO LOCAL AINDA NÃO SALVO';
  await parent.getByLabel('Preparação da sessão', { exact: true }).fill(dirty);
  const opener = slot.getByRole('button', { name: 'Vincular ficha', exact: true });
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(
    picker(page).getByRole('button', { name: 'Carregar mais fichas', exact: true }),
  ).toBeEnabled();
  await expect(
    picker(page).getByRole('button', { name: 'Vincular ' + source.legacyName, exact: true }),
  ).toHaveCount(0);
  await expectDialogWithinViewport(page);
  await capture(page, info, 'referencias-picker-320');
  await picker(page).getByRole('button', { name: 'Carregar mais fichas', exact: true }).focus();
  await page.keyboard.press('Enter');
  await picker(page)
    .getByRole('button', { name: 'Vincular ' + source.legacyName, exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(picker(page)).toHaveCount(0);
  const refresh = slot.getByRole('button', { name: 'Consultar vínculos', exact: true });
  await expect(refresh).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    slot.getByRole('button', { name: 'Ler ficha ' + source.legacyName, exact: true }),
  ).toBeVisible();
  await expect(parent.getByLabel('Preparação da sessão', { exact: true })).toHaveValue(dirty);
  await slot.getByRole('button', { name: 'Ler ficha ' + source.legacyName, exact: true }).click();
  let reader = page.getByRole('dialog', { name: 'Ficha vinculada à sessão', exact: true });
  await expect(reader.getByRole('heading', { name: source.legacyName, exact: true })).toBeVisible();
  await expect(reader.getByText(source.legacyDetails, { exact: true })).toBeVisible();
  await expect(reader.getByText('Legado da mesa', { exact: true })).toBeVisible();
  await expectDialogWithinViewport(page);
  await capture(page, info, 'referencias-leitor-320');
  await page.keyboard.press('Escape');
  await expect(reader).toHaveCount(0);
  await expect(
    slot.getByRole('button', { name: 'Ler ficha ' + source.legacyName, exact: true }),
  ).toBeFocused();
  await expect(parent.getByLabel('Preparação da sessão', { exact: true })).toHaveValue(dirty);
  await opener.click();
  await picker(page).getByRole('button', { name: 'Fechar seleção de ficha', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(opener).toBeFocused();
  await expect(parent.getByLabel('Preparação da sessão', { exact: true })).toHaveValue(dirty);
  await choose(page, slot, source.overrideName, true);
  await refresh.click();
  await slot.getByRole('button', { name: 'Ler ficha ' + source.overrideName, exact: true }).click();
  reader = page.getByRole('dialog', { name: 'Ficha vinculada à sessão', exact: true });
  await expect(reader.getByText(source.overrideDetails, { exact: true })).toBeVisible();
  await expect(reader.getByText('Legado da mesa', { exact: true })).toHaveCount(0);
  await reader.getByRole('button', { name: 'Fechar ficha vinculada', exact: true }).click();
  await expect(
    slot.getByRole('button', { name: 'Ler ficha ' + source.overrideName, exact: true }),
  ).toBeFocused();
  await choose(page, slot, source.legacyName, true);
  await slot.getByRole('button', { name: 'Encerrar pedido de vínculo', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Encerrar pedido de vínculo?', exact: true })
    .getByRole('button', { name: 'Confirmar encerramento do vínculo', exact: true })
    .click();
  await expect.poll(() => pending(page, source.campaignId)).toBeNull();
  await refresh.click();
  await expect(slot.getByRole('listitem')).toHaveCount(2);
  const unlink = slot.getByRole('button', {
    name: 'Remover vínculo ' + source.legacyName,
    exact: true,
  });
  await unlink.click();
  let removal = page.getByRole('dialog', { name: 'Remover vínculo da sessão?', exact: true });
  await removal.getByRole('button', { name: 'Manter vínculo', exact: true }).click();
  await expect(unlink).toBeFocused();
  await unlink.click();
  removal = page.getByRole('dialog', { name: 'Remover vínculo da sessão?', exact: true });
  await removal.getByRole('button', { name: 'Confirmar remoção do vínculo', exact: true }).click();
  await refresh.click();
  await expect(slot.getByRole('listitem')).toHaveCount(1);
  await expect(
    slot.getByRole('button', { name: 'Ler ficha ' + source.legacyName, exact: true }),
  ).toHaveCount(0);
  await choose(page, slot, source.legacyName, true);
  await refresh.click();
  await expect(slot.getByRole('listitem')).toHaveCount(2);
  await expect(parent.getByLabel('Preparação da sessão', { exact: true })).toHaveValue(dirty);
  await expectNoHorizontalOverflow(page, 'vínculos da sessão em 320px');
  const own = await page.evaluate(
    async ({ prefix, source }) => {
      const sessions = (await import(
        prefix + 'campaignSessionFixture.ts'
      )) as typeof import('./fixtures/campaignSessionFixture');
      const store = (await import(
        prefix + 'studioStore.ts'
      )) as typeof import('./fixtures/studioStore');
      const rows = Object.values(
        (
          JSON.parse(localStorage.getItem('writer.visual.session-references')!) as {
            rows: Record<string, { deleted: boolean }>;
          }
        ).rows,
      );
      return {
        session: (
          await sessions.getCampaignSession({
            campaignId: source.campaignId,
            campaignToken: source.campaignToken,
            sessionId: source.sessionId,
          })
        ).session,
        sourceUnchanged:
          JSON.stringify(await store.fixtureGet('adventure', source.adventureId)) ===
          source.sourceRoot,
        otherUnchanged:
          JSON.stringify(await store.fixtureGet('campaign', source.otherId)) === source.otherRoot,
        active: rows.filter((row) => !row.deleted).length,
        tombstones: rows.filter((row) => row.deleted).length,
      };
    },
    { prefix, source },
  );
  expect(own).toMatchObject({
    session: { revision: 1, summary: source.authorText },
    sourceUnchanged: true,
    otherUnchanged: true,
    active: 2,
    tombstones: 1,
  });
  await parent.getByLabel('Preparação da sessão', { exact: true }).fill(source.authorText);
  await closePreparation(page);
  const other = await openSession(page, source, 'Outra sessão preservada');
  await expect(
    other.slot.getByText('Nenhuma ficha vinculada à sessão.', { exact: true }),
  ).toBeVisible();
  await expect(other.parent.getByLabel('Preparação da sessão', { exact: true })).toHaveValue(
    'PREPARAÇÃO DA OUTRA SESSÃO',
  );
  expect(errors).toEqual([]);
  await info.attach('console-errors', {
    body: JSON.stringify(errors),
    contentType: 'application/json',
  });
});

test('recuperação de vínculo sobrevive revogação e tombstone, persiste cancelamento e usa closer C4 explícito', async ({
  page,
}, info) => {
  const errors = consoleErrors(page),
    source = await seed(page, false);
  await page.goto('/campaigns/' + source.campaignId);
  let opened = await openSession(page, source);
  await flag(page, 'writer.visual.reference-lost-response', 'addCampaignSessionReference');
  await choose(page, opened.slot, source.legacyName);
  await expect(
    opened.slot.getByRole('button', { name: 'Confirmar pedido de vínculo', exact: true }),
  ).toBeEnabled();
  const committed = await pending(page, source.campaignId);
  expect(committed?.intent).toBe('apply');
  expect(JSON.stringify(committed)).not.toContain(source.legacyName);
  expect(JSON.stringify(committed)).not.toContain(source.legacyDetails);
  await closePreparation(page);
  await page.evaluate(
    async ({ prefix, source }) => {
      const lore = (await import(
        prefix + 'loreService.ts'
      )) as typeof import('./fixtures/loreService');
      await lore.deleteLoreEntity({ kind: 'universe', id: source.worldId }, source.legacyId);
    },
    { prefix, source },
  );
  await deleteSession(page, 'Encontro com as fichas da mesa');
  await page.reload();
  let controls = page
    .getByRole('heading', { name: 'Pedidos de vínculo de sessão', exact: true })
    .locator('..');
  await expect(
    controls.getByRole('button', { name: 'Confirmar pedido de vínculo', exact: true }),
  ).toBeEnabled();
  expect(await pending(page, source.campaignId)).toEqual(committed);
  await controls.getByRole('button', { name: 'Confirmar pedido de vínculo', exact: true }).click();
  await expect.poll(() => pending(page, source.campaignId)).toBeNull();
  await expect(
    controls.getByText('Pedido de vínculo confirmado. Consulte a lista atual.', { exact: true }),
  ).toBeVisible();
  opened = await openSession(page, source, 'Outra sessão preservada');
  await flag(page, 'writer.visual.reference-before-receive', 'addCampaignSessionReference');
  await choose(page, opened.slot, source.overrideName);
  await expect(
    opened.slot.getByRole('button', { name: 'Encerrar pedido de vínculo', exact: true }),
  ).toBeEnabled();
  const unknown = await pending(page, source.campaignId);
  await closePreparation(page);
  await deleteSession(page, 'Outra sessão preservada');
  controls = page
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
  await expect(
    controls.getByRole('button', { name: 'Confirmar encerramento do pedido', exact: true }),
  ).toBeEnabled();
  const canceled = await pending(page, source.campaignId);
  expect(canceled?.request).toEqual(unknown?.request);
  await page.reload();
  controls = page
    .getByRole('heading', { name: 'Pedidos de vínculo de sessão', exact: true })
    .locator('..');
  await expect(
    controls.getByRole('button', { name: 'Confirmar pedido de vínculo', exact: true }),
  ).toHaveCount(0);
  await controls
    .getByRole('button', { name: 'Confirmar encerramento do pedido', exact: true })
    .click();
  await expect.poll(() => pending(page, source.campaignId)).toBeNull();
  if (!unknown || unknown.action !== 'add') throw new Error('Pedido original ausente');
  const late = await page.evaluate(
    async ({ prefix, request }) => {
      const api = (await import(
        prefix + 'campaignSessionReferenceFixture.ts'
      )) as typeof import('./fixtures/campaignSessionReferenceFixture');
      const result = await api.addCampaignSessionReference(request);
      const data = JSON.parse(localStorage.getItem('writer.visual.session-references')!) as {
        rows: Record<string, { id: string }>;
      };
      return {
        kind: result.kind,
        present: Object.values(data.rows).some((row) => row.id === request.referenceId),
      };
    },
    { prefix, request: unknown.request },
  );
  expect(late).toEqual({ kind: 'canceled', present: false });
  await page.getByRole('button', { name: 'Nova sessão', exact: true }).click();
  const creating = page.getByRole('dialog', { name: 'Nova sessão', exact: true });
  await creating.getByLabel('Título da sessão', { exact: true }).fill('Última sessão com pedido');
  await creating
    .getByLabel('Preparação da sessão', { exact: true })
    .fill('Autoria preservada até a exclusão explícita.');
  await creating.getByRole('button', { name: 'Salvar sessão', exact: true }).click();
  const parent = page.getByRole('dialog', { name: 'Editar sessão', exact: true });
  const slot = parent.getByRole('region', { name: 'Referências da sessão', exact: true });
  await expect(slot.getByRole('button', { name: 'Vincular ficha', exact: true })).toBeEnabled();
  await flag(page, 'writer.visual.reference-before-receive', 'addCampaignSessionReference');
  await choose(page, slot, source.overrideName);
  await expect(
    slot.getByRole('button', { name: 'Confirmar pedido de vínculo', exact: true }),
  ).toBeEnabled();
  const beforeC4 = await pending(page, source.campaignId);
  await closePreparation(page);
  await page.evaluate(
    async ({ source, uid }) => {
      const path = '/src/features/campaign-sessions/services/campaignSessionRecovery.ts';
      const api = (await import(
        path
      )) as typeof import('../../src/features/campaign-sessions/services/campaignSessionRecovery');
      const fixturePath = '/e2e/visual/fixtures/studioStore.ts';
      const store = (await import(fixturePath)) as typeof import('./fixtures/studioStore');
      await api.reserveCampaignSession(
        {
          schemaVersion: 1,
          ownerId: uid,
          method: 'saveCampaignSession',
          input: {
            campaignId: source.otherId,
            campaignToken: store.fixtureCampaignToken(uid, source.otherId),
            sessionId: 'visual-reference-other-pending',
            operationId: 'visual-reference-other-pending',
            expectedRevision: 0,
            title: 'Pedido da outra campanha',
            summary: 'AUTORIA DA OUTRA MESA PRESERVADA',
            scheduledDate: null,
            status: 'planned',
          },
        },
        () => {},
      );
    },
    { source, uid },
  );
  await page.getByRole('button', { name: 'Excluir campanha', exact: true }).click();
  const deletion = page.getByRole('dialog', { name: 'Excluir campanha', exact: true });
  await deletion.getByRole('button', { name: 'Excluir definitivamente', exact: true }).click();
  await expect(
    deletion.getByRole('heading', { name: 'Campanha excluída', exact: true }),
  ).toBeVisible();
  expect(await pending(page, source.campaignId)).toEqual(beforeC4);
  await expect(
    page.getByRole('region', { name: 'Referências da sessão', exact: true }),
  ).toHaveCount(0);
  await deletion
    .getByRole('button', { name: 'Encerrar controles antigos deste navegador', exact: true })
    .click();
  let closure = page.getByRole('dialog', {
    name: 'Encerrar controles da campanha excluída?',
    exact: true,
  });
  await expect(closure.getByText('Pedido de vínculo da sessão', { exact: true })).toBeVisible();
  await closure.getByRole('button', { name: 'Manter controles', exact: true }).click();
  expect(await pending(page, source.campaignId)).toEqual(beforeC4);
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
  const kept = await page.evaluate(
    async ({ prefix, source, uid }) => {
      const path = '/src/features/campaign-sessions/services/campaignSessionRecovery.ts';
      const recovery = (await import(
        path
      )) as typeof import('../../src/features/campaign-sessions/services/campaignSessionRecovery');
      const store = (await import(
        prefix + 'studioStore.ts'
      )) as typeof import('./fixtures/studioStore');
      return {
        otherPending: recovery.readPendingCampaignSession(uid, source.otherId) !== null,
        otherRoot:
          JSON.stringify(await store.fixtureGet('campaign', source.otherId)) === source.otherRoot,
      };
    },
    { prefix, source, uid },
  );
  expect(kept).toEqual({ otherPending: true, otherRoot: true });
  await expectDialogWithinViewport(page);
  await expectNoHorizontalOverflow(page, 'recuperação e closer explícito do vínculo');
  await capture(page, info, 'referencias-recuperacao-C4');
  expect(errors).toEqual([]);
  await info.attach('console-errors', {
    body: JSON.stringify(errors),
    contentType: 'application/json',
  });
});
