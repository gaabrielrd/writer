import type { Page } from '@playwright/test';
import {
  capture,
  expect,
  expectDialogWithinViewport,
  expectNoHorizontalOverflow,
  test,
} from './support';
const prefix = '/e2e/visual/fixtures/';
const loreRecovery = '/src/features/campaign-lore/services/campaignLoreRecovery.ts';
const noteRecovery = '/src/features/campaign-notes/services/campaignNotesRecovery.ts';
const captureRecovery = '/src/features/campaign-bases/services/campaignCaptureRecovery.ts';
const deletionRecovery = '/src/features/campaign-deletions/services/campaignDeletionRecovery.ts';
const uid = 'visual-author';
type Source = Awaited<
  ReturnType<typeof import('./fixtures/campaignDeletionFixture').fixtureSeedCampaignDeletion>
>;
async function seed(page: Page, captured: boolean): Promise<Source> {
  await page.goto('/studio');
  return page.evaluate(
    async ({ prefix, captured, captureRecovery, noteRecovery, uid }) => {
      const fixture = (await import(
          prefix + 'campaignDeletionFixture.ts'
        )) as typeof import('./fixtures/campaignDeletionFixture'),
        studio = (await import(
          prefix + 'studioStore.ts'
        )) as typeof import('./fixtures/studioStore');
      const source = await fixture.fixtureSeedCampaignDeletion(captured);
      if (captured) {
        const captures = (await import(
          captureRecovery
        )) as typeof import('../../src/features/campaign-bases/services/campaignCaptureRecovery');
        const scope = { kind: 'start' as const, adventureId: source.adventureId! };
        await captures.withCampaignCaptureJournalLock(
          uid,
          scope,
          () => {},
          () =>
            captures.writePendingCampaignCapture(uid, scope, {
              method: 'startCampaignCapture',
              input: source.captureRequest!,
            }),
        );
        const notes = (await import(
          noteRecovery
        )) as typeof import('../../src/features/campaign-notes/services/campaignNotesRecovery');
        for (const campaignId of [source.campaignId, source.otherId])
          await notes.reserveCampaignNote(
            uid,
            {
              method: 'saveCampaignNote',
              input: {
                campaignId,
                campaignToken: studio.fixtureCampaignToken(uid, campaignId),
                noteId: 'pending-note-' + campaignId,
                operationId: 'pending-note-' + campaignId,
                expectedRevision: 0,
                title: 'Rascunho próprio pendente',
                content: 'RASCUNHO PRÓPRIO PRESERVADO ATÉ CONFIRMAÇÃO',
              },
            },
            () => true,
          );
      }
      return source;
    },
    { prefix, captured, captureRecovery, noteRecovery, uid },
  );
}
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Excluir campanha', exact: true });
async function flag(page: Page, name: string, method: string) {
  await page.evaluate(({ name, method }) => sessionStorage.setItem(name, method), { name, method });
}
async function calls(page: Page) {
  return page.evaluate(
    () =>
      (
        JSON.parse(localStorage.getItem('writer.visual.campaign-deletions') ?? '{"calls":[]}') as {
          calls: { method: string; operationId?: string; expectedCheckpoint?: number }[];
        }
      ).calls,
  );
}
async function cipher(page: Page, campaignId: string) {
  return page.evaluate(
    async ({ path, uid, campaignId }) => {
      const recovery = (await import(
        path
      )) as typeof import('../../src/features/campaign-lore/services/campaignLoreRecovery');
      const op = await recovery.readLoreOperation(uid, campaignId);
      if (!op) return null;
      const bytes = op.ciphertext
        ? new Uint8Array(await crypto.subtle.digest('SHA-256', op.ciphertext))
        : null;
      return {
        phase: op.phase,
        operationId: op.header.operationId,
        cipherHash: bytes
          ? Array.from(bytes, (n) => n.toString(16).padStart(2, '0')).join('')
          : null,
        hasKey: Object.keys(op).some((k) => ['key', 'rawKey', 'entity'].includes(k)),
      };
    },
    { path: loreRecovery, uid, campaignId },
  );
}
async function loreMutations(page: Page, campaignId: string) {
  return page.evaluate((campaignId) => {
    const data = JSON.parse(
      localStorage.getItem('writer.visual.campaign-lore') ?? '{"calls":[]}',
    ) as { calls: { campaignId: string; method: string; operationId?: string }[] };
    return data.calls
      .filter(
        (row) =>
          row.campaignId === campaignId &&
          [
            'prepareCampaignLoreVariant',
            'saveCampaignLoreVariant',
            'resolveCampaignLoreOperation',
          ].includes(row.method),
      )
      .map((row) => ({ method: row.method, operationId: row.operationId }));
  }, campaignId);
}
async function control(page: Page, campaignId: string) {
  return page.evaluate(
    async ({ path, uid, campaignId }) => {
      const recovery = (await import(
        path
      )) as typeof import('../../src/features/campaign-deletions/services/campaignDeletionRecovery');
      return recovery.readDeletion(uid, campaignId);
    },
    { path: deletionRecovery, uid, campaignId },
  );
}
async function verifyOther(page: Page, source: Source) {
  const kept = await page.evaluate(
    async ({ prefix, source }) => {
      const studio = (await import(
          prefix + 'studioStore.ts'
        )) as typeof import('./fixtures/studioStore'),
        notes = (await import(
          prefix + 'campaignNotesFixture.ts'
        )) as typeof import('./fixtures/campaignNotesFixture'),
        worlds = (await import(
          prefix + 'universeService.ts'
        )) as typeof import('./fixtures/universeService'),
        work = (await import(
          prefix + 'workProgressFixture.ts'
        )) as typeof import('./fixtures/workProgressFixture');
      const other = await studio.fixtureGet('campaign', source.otherId),
        list = await notes.listCampaignNotes({ campaignId: source.otherId });
      return {
        unchanged: JSON.stringify(other) === source.otherRoot,
        noteTitles: list.items.map((row) => row.title),
        checklistTitles: (
          await work.listWorkChecklist({ target: { kind: 'campaign', id: source.otherId } })
        ).items.map((row) => row.title),
        worldName: (await worlds.getUniverse(source.worldId))?.name,
        adventurePresent: source.adventureId
          ? !!(await studio.fixtureGet('adventure', source.adventureId))
          : true,
      };
    },
    { prefix, source },
  );
  expect(kept).toEqual({
    unchanged: true,
    noteTitles: ['Nota da outra mesa preservada'],
    checklistTitles: ['Preparação da outra mesa preservada'],
    worldName: 'Universo preservado na exclusão',
    adventurePresent: true,
  });
}
function consoleErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}
test('exclusão independente em 320px exige confirmação, preserva outra mesa e desaparece do Estúdio', async ({
  page,
}, info) => {
  const errors = consoleErrors(page);
  await page.setViewportSize({ width: 320, height: 740 });
  const source = await seed(page, false);
  await page.goto('/campaigns/' + source.campaignId);
  await expect(page.getByRole('heading', { name: source.title, exact: true })).toBeVisible();
  const opener = page.getByRole('button', { name: 'Excluir campanha', exact: true });
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(
    dialog(page).getByRole('heading', { name: source.title, exact: true }),
  ).toBeVisible();
  await expectDialogWithinViewport(page);
  await expectNoHorizontalOverflow(page, 'confirmar exclusão independente em 320px');
  await capture(page, info, 'exclusao-confirmacao-320');
  await dialog(page).getByRole('button', { name: 'Cancelar', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect((await calls(page)).filter((row) => row.method === 'startCampaignDeletion')).toHaveLength(
    0,
  );
  await opener.press('Enter');
  await expect(
    dialog(page).getByRole('button', { name: 'Excluir definitivamente', exact: true }),
  ).toBeEnabled();
  await dialog(page).getByRole('button', { name: 'Excluir definitivamente', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(
    dialog(page).getByRole('heading', { name: 'Campanha excluída', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: 'Notas próprias da campanha',
      exact: true,
      includeHidden: true,
    }),
  ).toHaveCount(0);
  expect(await page.locator('textarea').count()).toBe(0);
  await expectDialogWithinViewport(page);
  await capture(page, info, 'exclusao-concluida-320');
  await dialog(page).getByRole('button', { name: 'Fechar exclusão', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Conteúdo da campanha oculto', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Voltar ao Estúdio', exact: true }).click();
  await expect(page.locator('a[href="/campaigns/' + source.campaignId + '"]')).toHaveCount(0);
  await expect(page.locator('a[href="/campaigns/' + source.otherId + '"]')).toHaveCount(1);
  await verifyOther(page, source);
  expect(errors).toEqual([]);
  await info.attach('console-errors', {
    body: JSON.stringify(errors),
    contentType: 'application/json',
  });
});
test('exclusão capturada retoma pedidos incertos após reload e encerra cipher antigo somente por confirmação', async ({
  page,
}, info) => {
  const errors = consoleErrors(page),
    source = await seed(page, true);
  await page.goto('/campaigns/' + source.campaignId);
  const lore = page.getByRole('heading', { name: 'Lore da mesa', exact: true }).locator('..');
  await lore.getByRole('button', { name: 'Lia da origem preservada', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Editar lore da mesa', exact: true });
  await edit.getByLabel('Detalhes da ficha', { exact: true }).fill('VARIANTE CIFRADA A EXCLUIR');
  await flag(page, 'writer.visual.campaign-lore-before-first-send', 'saveCampaignLoreVariant');
  await edit.getByRole('button', { name: 'Salvar variante da mesa', exact: true }).click();
  await expect(edit.getByText('O transporte não recebeu o pedido.', { exact: true })).toBeVisible();
  await expect.poll(async () => (await cipher(page, source.campaignId))?.phase).toBe('sealed');
  const sealed = await cipher(page, source.campaignId);
  expect(sealed?.hasKey).toBe(false);
  expect(sealed?.cipherHash).toMatch(/^[a-f0-9]{64}$/);
  await edit.getByRole('button', { name: 'Fechar ficha', exact: true }).click();
  await page.evaluate(
    async ({ prefix, source }) => {
      const studio = (await import(
        prefix + 'studioStore.ts'
      )) as typeof import('./fixtures/studioStore');
      studio.fixturePatchProject('adventure', source.adventureId!, { deleting: true } as never);
    },
    { prefix, source },
  );
  await flag(page, 'writer.visual.deletion-lost-response', 'startCampaignDeletion');
  await page.getByRole('button', { name: 'Excluir campanha', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Excluir definitivamente', exact: true }).click();
  await expect(
    dialog(page).getByRole('button', { name: 'Confirmar pedido de exclusão', exact: true }),
  ).toBeEnabled();
  const start = await control(page, source.campaignId);
  expect(start?.kind).toBe('start');
  await page.reload();
  await page.goto('/studio');
  const preparations = page
    .getByRole('heading', { name: 'Exclusões em andamento', exact: true })
    .locator('..');
  await preparations.getByRole('button', { name: /^Exclusão .+ · Em andamento$/ }).click();
  await expect(
    dialog(page).getByRole('button', { name: 'Confirmar pedido de exclusão', exact: true }),
  ).toBeEnabled();
  expect(await control(page, source.campaignId)).toEqual(start);
  expect((await calls(page)).filter((row) => row.method === 'startCampaignDeletion')).toHaveLength(
    1,
  );
  expect(await cipher(page, source.campaignId)).toEqual(sealed);
  await flag(page, 'writer.visual.deletion-lost-response', 'advanceCampaignDeletion');
  await dialog(page)
    .getByRole('button', { name: 'Confirmar pedido de exclusão', exact: true })
    .click();
  await expect.poll(async () => (await control(page, source.campaignId))?.kind).toBe('step');
  await expect(
    dialog(page).getByRole('button', { name: 'Confirmar pedido de exclusão', exact: true }),
  ).toBeEnabled();
  const step = await control(page, source.campaignId);
  await page.reload();
  await page
    .getByRole('heading', { name: 'Exclusões em andamento', exact: true })
    .locator('..')
    .getByRole('button', { name: /^Exclusão .+ · Em andamento$/ })
    .click();
  expect(await control(page, source.campaignId)).toEqual(step);
  expect(
    (await calls(page)).filter((row) => row.method === 'advanceCampaignDeletion'),
  ).toHaveLength(1);
  await dialog(page)
    .getByRole('button', { name: 'Confirmar pedido de exclusão', exact: true })
    .click();
  await expect(
    dialog(page).getByRole('heading', { name: 'Campanha excluída', exact: true }),
  ).toBeVisible();
  const requests = await calls(page),
    starts = requests.filter((row) => row.method === 'startCampaignDeletion'),
    advances = requests.filter((row) => row.method === 'advanceCampaignDeletion');
  expect(starts).toHaveLength(2);
  expect(starts[0]?.operationId).toBe(starts[1]?.operationId);
  expect(advances[0]?.operationId).toBe(advances[1]?.operationId);
  expect(advances[0]?.expectedCheckpoint).toBe(advances[1]?.expectedCheckpoint);
  expect(await cipher(page, source.campaignId)).toEqual(sealed);
  const beforeClosure = await loreMutations(page, source.campaignId);
  await dialog(page)
    .getByRole('button', { name: 'Encerrar controles antigos deste navegador', exact: true })
    .click();
  const closure = page.getByRole('dialog', {
    name: 'Encerrar controles da campanha excluída?',
    exact: true,
  });
  await expect(closure.getByText('Rascunho protegido de lore', { exact: true })).toBeVisible();
  await expect(closure.getByText('Pedido de nota própria', { exact: true })).toBeVisible();
  await expect(closure.getByText('Controle de captura', { exact: true })).toBeVisible();
  await closure.getByRole('button', { name: 'Manter controles', exact: true }).click();
  expect(await cipher(page, source.campaignId)).toEqual(sealed);
  await dialog(page)
    .getByRole('button', { name: 'Encerrar controles antigos deste navegador', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Encerrar controles da campanha excluída?', exact: true })
    .getByRole('button', { name: 'Confirmar encerramento dos controles', exact: true })
    .click();
  await expect.poll(() => cipher(page, source.campaignId)).toBeNull();
  const closed = await page.evaluate(
    async ({ noteRecovery, captureRecovery, source, uid }) => {
      const notes = (await import(
          noteRecovery
        )) as typeof import('../../src/features/campaign-notes/services/campaignNotesRecovery'),
        captures = (await import(
          captureRecovery
        )) as typeof import('../../src/features/campaign-bases/services/campaignCaptureRecovery');
      return {
        own: notes.readPendingCampaignNote(uid, source.campaignId) === null,
        other: notes.readPendingCampaignNote(uid, source.otherId) !== null,
        capture:
          captures.readPendingCampaignCapture(uid, {
            kind: 'start',
            adventureId: source.adventureId!,
          }) === null,
      };
    },
    { noteRecovery, captureRecovery, source, uid },
  );
  expect(closed).toEqual({ own: true, other: true, capture: true });
  expect(await loreMutations(page, source.campaignId)).toEqual(beforeClosure);
  await expectDialogWithinViewport(page);
  await expectNoHorizontalOverflow(page, 'encerramento explícito da recuperação');
  await capture(page, info, 'exclusao-recuperacao-confirmada');
  await verifyOther(page, source);
  expect(errors).toEqual([]);
  await info.attach('console-errors', {
    body: JSON.stringify(errors),
    contentType: 'application/json',
  });
});
