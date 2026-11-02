import type { Locator, Page } from '@playwright/test';
import { chooseDropdown } from '../dropdown';
import {
  capture,
  expect,
  expectDialogWithinViewport,
  expectNoHorizontalOverflow,
  test,
} from './support';
const prefix = '/e2e/visual/fixtures/';
const recoveryPath = '/src/features/campaign-sessions/services/campaignSessionRecovery.ts';
const uid = 'visual-author';
const ownText =
  '  Preparação particular 🐉\nLinha com ação, café e espaços.\n<b>texto literal</b>\n  Fim  ';
interface Calls {
  uid: string;
  campaignId: string;
  method: string;
  sessionId?: string;
  operationId?: string;
  expectedRevision?: number;
}
async function calls(page: Page): Promise<Calls[]> {
  return page.evaluate(
    () =>
      (
        JSON.parse(localStorage.getItem('writer.visual.campaign-sessions') ?? '{"calls":[]}') as {
          calls: Calls[];
        }
      ).calls,
  );
}
async function pending(page: Page, campaignId: string) {
  return page.evaluate(
    async ({ path, uid, campaignId }) => {
      const recovery = (await import(
        path
      )) as typeof import('../../src/features/campaign-sessions/services/campaignSessionRecovery');
      return recovery.readPendingCampaignSession(uid, campaignId);
    },
    { path: recoveryPath, uid, campaignId },
  );
}
async function open(page: Page, id: string) {
  await page.goto('/campaigns/' + id);
  await expect(page.getByRole('heading', { name: 'Sessões privadas', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nova sessão', exact: true })).toBeEnabled();
}
async function form(page: Page, title: string, summary: string, date = '') {
  await page.getByRole('button', { name: 'Nova sessão', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova sessão', exact: true });
  await dialog.getByLabel('Título da sessão', { exact: true }).fill(title);
  await dialog.getByLabel('Data do encontro', { exact: true }).fill(date);
  await dialog.getByLabel('Preparação da sessão', { exact: true }).fill(summary);
  return dialog;
}
async function closeSaved(page: Page, title: string, summary: string) {
  const dialog = page.getByRole('dialog', { name: 'Editar sessão', exact: true });
  await expect(dialog.getByLabel('Título da sessão', { exact: true })).toHaveValue(title.trim());
  await expect(dialog.getByLabel('Preparação da sessão', { exact: true })).toHaveValue(summary);
  await expect(dialog.getByRole('button', { name: 'Salvar sessão', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Fechar preparação', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Consultar sessões', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Editar sessão ' + title.trim(), exact: true }),
  ).toBeEnabled();
}
async function save(page: Page, dialog: Locator, title: string, summary: string) {
  await dialog.getByRole('button', { name: 'Salvar sessão', exact: true }).click();
  await closeSaved(page, title, summary);
}
function errors(page: Page) {
  const list: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') list.push(message.text());
  });
  return list;
}

test('sessões privadas em 320px criam, editam e reordenam por teclado sem mudar outra mesa', async ({
  page,
}, info) => {
  const consoleErrors = errors(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/studio');
  const source = await page.evaluate(async (prefix) => {
    const store = (await import(
      prefix + 'studioStore.ts'
    )) as typeof import('./fixtures/studioStore');
    const campaign = await store.fixtureCreate('campaign', {
      operationId: 'visual-session-own-table',
      title: 'Mesa de sessões privadas',
    });
    const other = await store.fixtureCreate('campaign', {
      operationId: 'visual-session-other-table',
      title: 'Outra mesa de sessões',
      description: 'Descrição independente preservada',
    });
    return { campaignId: campaign.id, otherId: other.id, otherRoot: JSON.stringify(other) };
  }, prefix);
  await open(page, source.campaignId);
  await page.getByRole('button', { name: 'Nova sessão', exact: true }).focus();
  await page.keyboard.press('Enter');
  let dialog = page.getByRole('dialog', { name: 'Nova sessão', exact: true });
  await expect(dialog.getByRole('button', { name: 'Salvar sessão', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Nova sessão', exact: true })).toBeFocused();
  expect((await calls(page)).filter((call) => call.method === 'saveCampaignSession')).toHaveLength(
    0,
  );
  dialog = await form(page, '  Chegada ao porto  ', ownText, '2000-02-29');
  await expect(
    dialog.getByText('Estado inicial: Planejada. Você poderá alterá-lo após criar a sessão.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(dialog.locator('b')).toHaveCount(0);
  await expectDialogWithinViewport(page);
  await capture(page, info, 'sessao-formulario-320');
  await dialog.getByRole('button', { name: 'Salvar sessão', exact: true }).focus();
  await page.keyboard.press('Enter');
  await closeSaved(page, 'Chegada ao porto', ownText);
  dialog = await form(page, 'Conselho da cidade', 'Preparação da segunda sessão', '0001-01-01');
  await save(page, dialog, 'Conselho da cidade', 'Preparação da segunda sessão');
  await page.getByRole('button', { name: 'Editar sessão Chegada ao porto', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Editar sessão', exact: true });
  await expect(dialog.getByLabel('Data do encontro', { exact: true })).toHaveValue('2000-02-29');
  await chooseDropdown(dialog.getByLabel('Estado da sessão', { exact: true }), 'Concluída');
  await expect(
    page.getByRole('button', {
      name: 'Mover Conselho da cidade para cima',
      exact: true,
      includeHidden: true,
    }),
  ).toBeDisabled();
  await save(page, dialog, 'Chegada ao porto', ownText);
  const move = page.getByRole('button', {
    name: 'Mover Conselho da cidade para cima',
    exact: true,
  });
  await move.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Ordem da sessão atualizada.', { exact: true })).toBeVisible();
  const consult = page.getByRole('button', { name: 'Consultar sessões', exact: true });
  await expect(consult).toBeFocused();
  await page.keyboard.press('Enter');
  const list = page
    .getByRole('heading', { name: 'Sessões privadas', exact: true })
    .locator('..')
    .locator('..')
    .getByRole('list');
  await expect(list.getByRole('heading', { level: 3 })).toHaveText([
    'Conselho da cidade',
    'Chegada ao porto',
  ]);
  await expect(consult).toBeFocused();
  await expect(list.getByText('Concluída', { exact: true })).toBeVisible();
  await expect(list.locator('time[datetime="0001-01-01"]')).toHaveText('01/01/0001');
  await page.reload();
  await expect(list.getByRole('heading', { level: 3 })).toHaveText([
    'Conselho da cidade',
    'Chegada ao porto',
  ]);
  await page.getByRole('button', { name: 'Editar sessão Chegada ao porto', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Editar sessão', exact: true });
  await expect(dialog.getByLabel('Preparação da sessão', { exact: true })).toHaveValue(ownText);
  await expect(dialog.getByLabel('Data do encontro', { exact: true })).toHaveValue('2000-02-29');
  await expect(dialog.getByLabel('Estado da sessão', { exact: true })).toContainText('Concluída');
  await dialog.getByRole('button', { name: 'Fechar preparação', exact: true }).click();
  const remove = page.getByRole('button', {
    name: 'Excluir sessão Conselho da cidade',
    exact: true,
  });
  await remove.click();
  let deletion = page.getByRole('dialog', { name: 'Excluir sessão', exact: true });
  await deletion.getByRole('button', { name: 'Manter sessão', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(deletion).toHaveCount(0);
  await expect(remove).toBeFocused();
  await remove.click();
  deletion = page.getByRole('dialog', { name: 'Excluir sessão', exact: true });
  await deletion
    .getByRole('button', { name: 'Excluir definitivamente a sessão', exact: true })
    .click();
  await expect(deletion).toHaveCount(0);
  await consult.click();
  await expect(list.getByRole('heading', { level: 3 })).toHaveText(['Chegada ao porto']);
  await expectNoHorizontalOverflow(page, 'sessões privadas e ordem em 320px');
  await page
    .getByRole('heading', { name: 'Sessões privadas', exact: true })
    .scrollIntoViewIfNeeded();
  await capture(page, info, 'sessoes-lista-320');
  await open(page, source.otherId);
  await expect(
    page.getByText('Nenhuma sessão preparada. Crie seu primeiro encontro.', { exact: true }),
  ).toBeVisible();
  const other = await page.evaluate(
    async ({ prefix, id }) => {
      const store = (await import(
        prefix + 'studioStore.ts'
      )) as typeof import('./fixtures/studioStore');
      return JSON.stringify(await store.fixtureGet('campaign', id));
    },
    { prefix, id: source.otherId },
  );
  expect(other).toBe(source.otherRoot);
  expect(consoleErrors).toEqual([]);
  await info.attach('console-errors', {
    body: JSON.stringify(consoleErrors),
    contentType: 'application/json',
  });
});

test('sessão capturada preserva preparação revogada, confirma recibo histórico e encerra apenas seu pedido após C4', async ({
  page,
}, info) => {
  const consoleErrors = errors(page);
  await page.goto('/studio');
  const source = await page.evaluate(async (prefix) => {
    const deletion = (await import(
      prefix + 'campaignDeletionFixture.ts'
    )) as typeof import('./fixtures/campaignDeletionFixture');
    return deletion.fixtureSeedCampaignDeletion(true);
  }, prefix);
  await open(page, source.campaignId);
  const dialog = await form(page, 'Preparação própria após a captura', ownText, '2026-10-18');
  await page.evaluate(() =>
    sessionStorage.setItem('writer.visual.session-lost-response', 'saveCampaignSession'),
  );
  await dialog.getByRole('button', { name: 'Salvar sessão', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Fechar e manter pedido', exact: true }),
  ).toBeEnabled();
  const request = await pending(page, source.campaignId);
  expect(request?.method).toBe('saveCampaignSession');
  if (!request || request.method !== 'saveCampaignSession')
    throw new Error('Pedido autoral não foi preservado');
  await page.evaluate(
    async ({ prefix, source, request }) => {
      const sessions = (await import(
        prefix + 'campaignSessionFixture.ts'
      )) as typeof import('./fixtures/campaignSessionFixture');
      const store = (await import(
        prefix + 'studioStore.ts'
      )) as typeof import('./fixtures/studioStore');
      await sessions.saveCampaignSession({
        ...request.input,
        operationId: 'visual-session-later-edit',
        expectedRevision: 1,
        summary: 'Texto posterior de outro dispositivo',
      });
      store.fixturePatchProject('adventure', source.adventureId!, { deleting: true } as never);
    },
    { prefix, source, request },
  );
  await dialog.getByRole('button', { name: 'Fechar e manter pedido', exact: true }).click();
  await page.reload();
  await expect(page.getByText(/A base não está disponível para esta leitura/)).toBeVisible();
  expect(await pending(page, source.campaignId)).toEqual(request);
  await page.getByRole('button', { name: 'Confirmar pedido de sessão', exact: true }).click();
  await expect(
    page.getByText(
      'O recibo confirma o pedido anterior. Consulte a sessão atual antes de adotar outra versão; seu texto foi preservado.',
      { exact: true },
    ),
  ).toBeVisible();
  expect(await pending(page, source.campaignId)).toBeNull();
  await page.getByRole('button', { name: 'Rever preparação da sessão', exact: true }).click();
  const historical = page.getByRole('dialog');
  await expect(historical.getByLabel('Preparação da sessão', { exact: true })).toHaveValue(ownText);
  await expect(
    historical.getByRole('button', { name: 'Salvar sessão', exact: true }),
  ).toBeDisabled();
  await historical
    .getByRole('button', { name: 'Descartar alterações e consultar sessão atual', exact: true })
    .click();
  await expect(historical.getByLabel('Preparação da sessão', { exact: true })).toHaveValue(
    'Texto posterior de outro dispositivo',
  );
  await historical
    .getByLabel('Preparação da sessão', { exact: true })
    .fill('Pedido próprio incerto que C4 não pode apagar silenciosamente');
  await page.evaluate(() =>
    sessionStorage.setItem('writer.visual.session-lost-response', 'saveCampaignSession'),
  );
  await historical.getByRole('button', { name: 'Salvar sessão', exact: true }).click();
  await expect(
    historical.getByRole('button', { name: 'Fechar e manter pedido', exact: true }),
  ).toBeEnabled();
  const beforeC4 = await pending(page, source.campaignId);
  await historical.getByRole('button', { name: 'Fechar e manter pedido', exact: true }).click();
  await page.evaluate(
    async ({ prefix, recoveryPath, source, uid }) => {
      const recovery = (await import(
        recoveryPath
      )) as typeof import('../../src/features/campaign-sessions/services/campaignSessionRecovery');
      const store = (await import(
        prefix + 'studioStore.ts'
      )) as typeof import('./fixtures/studioStore');
      await recovery.reserveCampaignSession(
        {
          schemaVersion: 1,
          ownerId: uid,
          method: 'saveCampaignSession',
          input: {
            campaignId: source.otherId,
            campaignToken: store.fixtureCampaignToken(uid, source.otherId),
            sessionId: 'visual-session-other-pending',
            operationId: 'visual-session-other-pending',
            expectedRevision: 0,
            title: 'Outra mesa pendente',
            summary: 'Texto da outra mesa preservado',
            scheduledDate: null,
            status: 'planned',
          },
        },
        () => {},
      );
    },
    { prefix, recoveryPath, source, uid },
  );
  await page.getByRole('button', { name: 'Excluir campanha', exact: true }).click();
  const deletion = page.getByRole('dialog', { name: 'Excluir campanha', exact: true });
  await deletion.getByRole('button', { name: 'Excluir definitivamente', exact: true }).click();
  await expect(
    deletion.getByRole('heading', { name: 'Campanha excluída', exact: true }),
  ).toBeVisible();
  expect(await pending(page, source.campaignId)).toEqual(beforeC4);
  await expect(page.getByRole('heading', { name: 'Sessões privadas', exact: true })).toHaveCount(0);
  await deletion
    .getByRole('button', { name: 'Encerrar controles antigos deste navegador', exact: true })
    .click();
  const closure = page.getByRole('dialog', {
    name: 'Encerrar controles da campanha excluída?',
    exact: true,
  });
  await expect(closure.getByText('Pedido de sessão privada', { exact: true })).toBeVisible();
  await closure.getByRole('button', { name: 'Manter controles', exact: true }).click();
  expect(await pending(page, source.campaignId)).toEqual(beforeC4);
  await deletion
    .getByRole('button', { name: 'Encerrar controles antigos deste navegador', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Encerrar controles da campanha excluída?', exact: true })
    .getByRole('button', { name: 'Confirmar encerramento dos controles', exact: true })
    .click();
  await expect.poll(() => pending(page, source.campaignId)).toBeNull();
  expect(await pending(page, source.otherId)).not.toBeNull();
  await expectDialogWithinViewport(page);
  await expectNoHorizontalOverflow(page, 'confirmação histórica e encerramento C4 de sessões');
  await capture(page, info, 'sessao-recuperacao-C4');
  const requests = (await calls(page)).filter((call) => call.method === 'saveCampaignSession');
  expect(requests.filter((call) => call.operationId === request.input.operationId)).toHaveLength(2);
  expect(
    new Set(
      requests
        .filter((call) => call.operationId === request.input.operationId)
        .map((call) => call.expectedRevision),
    ),
  ).toEqual(new Set([0]));
  expect(consoleErrors).toEqual([]);
  await info.attach('console-errors', {
    body: JSON.stringify(consoleErrors),
    contentType: 'application/json',
  });
});
