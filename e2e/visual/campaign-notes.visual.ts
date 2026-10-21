import type { Page, Locator } from '@playwright/test';
import { chooseDropdown } from '../dropdown';
import {
  capture,
  expect,
  expectDialogWithinViewport,
  expectNoHorizontalOverflow,
  test,
} from './support';

const campaignId = 'visual-campaign-1';
const secondCampaignId = 'visual-campaign-2';
const stateKey = 'writer.visual.campaign-notes';
const journalKey = 'writer:campaign-notes:' + JSON.stringify(['visual-author', campaignId]);
const prefix = '/e2e/visual/fixtures/';
const text =
  '  Memória particular 🐉\nLinha com ação e café.\n<strong>texto literal</strong>\n  Fim com espaços  ';
interface NoteState {
  projects: Record<
    string,
    {
      token: string;
      revision?: number;
      notes: Record<
        string,
        { id: string; revision: number; deleted: boolean; title?: string; content?: string }
      >;
    }
  >;
  calls: {
    uid: string;
    campaignId: string;
    method: string;
    noteId?: string;
    operationId?: string;
    expectedRevision?: number;
  }[];
}
async function state(page: Page): Promise<NoteState> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? '{"projects":{},"calls":[]}') as NoteState,
    stateKey,
  );
}
async function pending(page: Page) {
  return page.evaluate((key) => localStorage.getItem(key), journalKey);
}
async function open(page: Page, id = campaignId) {
  await page.goto('/campaigns/' + id);
  await expect(
    page.getByRole('heading', { name: 'Notas próprias da campanha', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nova nota', exact: true })).toBeEnabled();
}
async function draft(page: Page, title: string, content: string) {
  await page.getByRole('button', { name: 'Nova nota', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova nota própria', exact: true });
  await expect(dialog.getByLabel('Título da nota', { exact: true })).toHaveValue('');
  await expect(dialog.getByLabel('Texto da nota', { exact: true })).toHaveValue('');
  await dialog.getByLabel('Título da nota', { exact: true }).fill(title);
  await dialog.getByLabel('Texto da nota', { exact: true }).fill(content);
  return dialog;
}
async function closeSaved(page: Page, title: string, content: string) {
  const dialog = page.getByRole('dialog', { name: 'Editar nota própria', exact: true });
  await expect(dialog.getByLabel('Título da nota', { exact: true })).toHaveValue(title.trim());
  await expect(dialog.getByLabel('Texto da nota', { exact: true })).toHaveValue(content);
  await expect(dialog.getByRole('button', { name: 'Salvar nota', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Cancelar', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: title.trim(), exact: true })).toBeEnabled();
}
async function save(page: Page, dialog: Locator, title: string, content: string) {
  await dialog.getByRole('button', { name: 'Salvar nota', exact: true }).click();
  await closeSaved(page, title, content);
}
async function edit(page: Page, title: string) {
  await page.getByRole('button', { name: title, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar nota própria', exact: true });
  await expect(dialog.getByLabel('Título da nota', { exact: true })).toHaveValue(title);
  return dialog;
}
async function flag(page: Page, key: string, method: string) {
  await page.evaluate(({ key, method }) => sessionStorage.setItem(key, method), { key, method });
}
async function lost(page: Page, method: string) {
  await flag(page, 'writer.visual.campaign-note-lost-response', method);
}
async function release(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('writer.visual.release-campaign-note')));
}

test('notas próprias em 320px usam teclado, preservam texto simples e exigem exclusão explícita', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await open(page);
  let dialog = await draft(page, 'Não salvar', 'Rascunho cancelado');
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Nova nota', exact: true })).toBeFocused();
  expect(
    (await state(page)).calls.filter((call) => call.method === 'saveCampaignNote'),
  ).toHaveLength(0);
  dialog = await draft(page, '  Consequências da sessão  ', '');
  await dialog.getByLabel('Título da nota', { exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByLabel('Texto da nota', { exact: true })).toBeFocused();
  await page.keyboard.insertText(text);
  await expect(dialog.getByLabel('Texto da nota', { exact: true })).toHaveValue(text);
  await expect(dialog.locator('strong')).toHaveCount(0);
  await expectDialogWithinViewport(page);
  await capture(page, info, 'notas-formulario-320');
  await dialog.getByRole('button', { name: 'Salvar nota', exact: true }).focus();
  await page.keyboard.press('Enter');
  await closeSaved(page, 'Consequências da sessão', text);
  await page.reload();
  dialog = await edit(page, 'Consequências da sessão');
  await expect(dialog.getByLabel('Texto da nota', { exact: true })).toHaveValue(text);
  const changed = text + '\nDecisão tomada pelos jogadores.';
  await dialog.getByLabel('Texto da nota', { exact: true }).fill(changed);
  await save(page, dialog, 'Consequências da sessão', changed);
  await expectNoHorizontalOverflow(page, 'notas-painel-320');
  await page
    .getByRole('heading', { name: 'Notas próprias da campanha', exact: true })
    .scrollIntoViewIfNeeded();
  await capture(page, info, 'notas-painel-320');
  await page
    .getByRole('button', { name: 'Excluir nota Consequências da sessão', exact: true })
    .click();
  let deletion = page.getByRole('dialog', { name: 'Excluir nota própria', exact: true });
  await deletion.getByRole('button', { name: 'Cancelar exclusão', exact: true }).click();
  await expect(deletion).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Excluir nota Consequências da sessão', exact: true }),
  ).toBeFocused();
  await page
    .getByRole('button', { name: 'Excluir nota Consequências da sessão', exact: true })
    .click();
  deletion = page.getByRole('dialog', { name: 'Excluir nota própria', exact: true });
  await deletion.getByRole('button', { name: 'Confirmar exclusão', exact: true }).click();
  await expect(deletion).toHaveCount(0);
  await expect(
    page.getByText('Nenhuma nota própria nesta campanha.', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText('Nenhuma nota própria nesta campanha.', { exact: true }),
  ).toBeVisible();
  const notes = Object.values(
    (await state(page)).projects[JSON.stringify(['visual-author', campaignId])].notes,
  );
  expect(notes).toHaveLength(1);
  expect(notes[0]).toMatchObject({ deleted: true, revision: 3 });
  expect(notes[0]).not.toHaveProperty('title');
  expect(notes[0]).not.toHaveProperty('content');
});

test('notas da mesa permanecem independentes da base indisponível e da troca de universo', async ({
  page,
}) => {
  await page.goto('/studio');
  const original = await page.evaluate(async (prefix) => {
    const load = <T>(file: string) => import(prefix + file + '.ts') as Promise<T>;
    const worlds = await load<typeof import('./fixtures/universeService')>('universeService');
    const adventures = await load<typeof import('./fixtures/adventureService')>('adventureService');
    const scenes = await load<typeof import('./fixtures/sceneService')>('sceneService');
    const captures =
      await load<typeof import('./fixtures/campaignBaseFixture')>('campaignBaseFixture');
    const tasks =
      await load<typeof import('./fixtures/workProgressFixture')>('workProgressFixture');
    const world = await worlds.createUniverse(
      { name: 'Mundo da origem das notas', description: 'Privado' },
      'visual-note-origin-world',
    );
    const other = await worlds.createUniverse(
      { name: 'Mundo organizacional das notas', description: 'Privado' },
      'visual-note-other-world',
    );
    const adventure = await adventures.createAdventure({
      operationId: 'visual-note-origin',
      title: 'Origem particular das notas',
      synopsis: 'SEGREDO DA BASE NÃO COPIAR',
      universeId: world.id,
    });
    await scenes.createScene({
      target: { kind: 'adventure', id: adventure.id },
      operationId: 'visual-note-scene',
      parentId: null,
      title: 'Cena original',
      content: '<p>SEGREDO DA CENA NÃO COPIAR</p>',
    });
    const source = await captures.getCampaignCaptureSource({ adventureId: adventure.id });
    let progress = await captures.startCampaignCapture({
      operationId: 'visual-note-start',
      adventureId: adventure.id,
      expectedSourceToken: source.sourceToken,
      title: 'Mesa com notas independentes',
      description: 'Descrição particular preservada',
      universeId: world.id,
    });
    for (let index = 0; progress.state !== 'prepared' && index < 20; index++)
      progress = await captures.advanceCampaignCapture({
        captureId: progress.captureId,
        operationId: 'visual-note-step-' + index,
        expectedCheckpoint: progress.checkpoint,
      });
    if (progress.state !== 'prepared') throw new Error('Preparação não terminou');
    const result = await captures.activateCampaignCapture({
      captureId: progress.captureId,
      operationId: 'visual-note-activate',
      expectedCheckpoint: progress.checkpoint,
    });
    if (result.kind !== 'activated') throw new Error('Campanha original não ativada');
    await tasks.createWorkChecklistItem({
      target: { kind: 'campaign', id: result.campaign.id },
      operationId: 'visual-note-task',
      title: 'Lembrança de preparação preservada',
    });
    return {
      campaignId: result.campaign.id,
      adventureId: adventure.id,
      worldId: world.id,
      otherId: other.id,
    };
  }, prefix);
  await open(page, original.campaignId);
  await expect(
    page.getByRole('heading', { name: 'Base congelada da campanha', exact: true }),
  ).toBeVisible();
  const initialBase = await page.evaluate(() =>
    sessionStorage.getItem('writer.visual.campaign-bases'),
  );
  const dialog = await draft(page, 'Minha mesa', 'Só o que aconteceu nesta mesa.');
  await save(page, dialog, 'Minha mesa', 'Só o que aconteceu nesta mesa.');
  await page.getByRole('button', { name: 'Editar campanha', exact: true }).click();
  const metadata = page.getByRole('dialog', { name: 'Editar campanha', exact: true });
  await chooseDropdown(
    metadata.getByLabel('Universo compartilhado', { exact: true }),
    'Mundo organizacional das notas',
  );
  await metadata.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(metadata).toHaveCount(0);
  await page.evaluate(
    async ({ prefix, original }) => {
      const store = (await import(
        prefix + 'studioStore.ts'
      )) as typeof import('./fixtures/studioStore');
      const worlds = (await import(
        prefix + 'universeService.ts'
      )) as typeof import('./fixtures/universeService');
      store.fixturePatchProject('adventure', original.adventureId, { deleting: true } as never);
      await worlds.deleteUniverse(original.worldId);
    },
    { prefix, original },
  );
  await page.reload();
  await expect(page.getByText(/A base não está disponível para esta leitura/)).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Abrir universo vinculado', exact: true }),
  ).toHaveAttribute('href', '/universes/' + original.otherId + '/lore');
  await page.getByRole('button', { name: 'Editar campanha', exact: true }).click();
  const reloadedMetadata = page.getByRole('dialog', { name: 'Editar campanha', exact: true });
  await expect(
    reloadedMetadata.getByLabel('Universo compartilhado', { exact: true }),
  ).toContainText('Mundo organizacional das notas');
  await reloadedMetadata.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByText('Descrição particular preservada', { exact: true })).toBeVisible();
  await expect(page.getByText('Lembrança de preparação preservada', { exact: true })).toBeVisible();
  const note = await edit(page, 'Minha mesa');
  await expect(note.getByLabel('Texto da nota', { exact: true })).toHaveValue(
    'Só o que aconteceu nesta mesa.',
  );
  await note
    .getByLabel('Texto da nota', { exact: true })
    .fill('Consequência própria após perder a origem.');
  await save(page, note, 'Minha mesa', 'Consequência própria após perder a origem.');
  await page.getByRole('button', { name: 'Excluir nota Minha mesa', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Excluir nota própria', exact: true })
    .getByRole('button', { name: 'Confirmar exclusão', exact: true })
    .click();
  await expect(
    page.getByText('Nenhuma nota própria nesta campanha.', { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('writer.visual.campaign-bases'))).toBe(
    initialBase,
  );
  const own = await page.evaluate(
    async ({ prefix, id }) => {
      const store = (await import(
        prefix + 'studioStore.ts'
      )) as typeof import('./fixtures/studioStore');
      return store.fixtureGet('campaign', id);
    },
    { prefix, id: original.campaignId },
  );
  expect(own).toMatchObject({
    universeId: original.otherId,
    description: 'Descrição particular preservada',
    provenance: { kind: 'original', adventureId: original.adventureId },
  });
  expect(own?.activeBaseId).toBe(
    own?.provenance.kind === 'original' ? own.provenance.baseId : null,
  );
});

test('duas abas reservam um único pedido e notas não atravessam mesa nem conta após resposta tardia', async ({
  page,
  context,
}) => {
  await open(page);
  const other = await context.newPage();
  await open(other);
  const firstDraft = await draft(page, 'Rascunho da aba A', 'Texto da aba A');
  const otherDraft = await draft(other, 'Rascunho da aba B', 'Texto da aba B');
  for (const tab of [page, other])
    await flag(tab, 'writer.visual.campaign-note-hold-response', 'saveCampaignNote');
  await page.evaluate((key) => {
    void navigator.locks.request(
      key,
      () =>
        new Promise<void>((resolve) =>
          window.addEventListener('writer.visual.release-test-reservation', () => resolve(), {
            once: true,
          }),
        ),
    );
  }, journalKey);
  await expect
    .poll(() =>
      page.evaluate(
        async (key) => (await navigator.locks.query()).held?.some((lock) => lock.name === key),
        journalKey,
      ),
    )
    .toBe(true);
  await firstDraft.getByRole('button', { name: 'Salvar nota', exact: true }).click();
  await otherDraft.getByRole('button', { name: 'Salvar nota', exact: true }).click();
  await page.evaluate(() =>
    window.dispatchEvent(new Event('writer.visual.release-test-reservation')),
  );
  await expect
    .poll(
      async () =>
        (await state(page)).calls.filter((call) => call.method === 'saveCampaignNote').length,
    )
    .toBe(1);
  await expect.poll(() => pending(page)).not.toBeNull();
  await expect(firstDraft.getByLabel('Título da nota', { exact: true })).toHaveValue(
    'Rascunho da aba A',
  );
  await expect(otherDraft.getByLabel('Título da nota', { exact: true })).toHaveValue(
    'Rascunho da aba B',
  );
  const request = JSON.parse((await pending(page))!) as {
    input: { title: string; content: string };
  };
  const winner = request.input.title === 'Rascunho da aba A' ? page : other;
  const loser = winner === page ? other : page;
  await release(page);
  await release(other);
  await expect.poll(() => pending(page)).toBeNull();
  await closeSaved(winner, request.input.title, request.input.content);
  const losingDialog = loser.getByRole('dialog', { name: 'Nova nota própria', exact: true });
  await expect(losingDialog.getByLabel('Título da nota', { exact: true })).toHaveValue(
    winner === page ? 'Rascunho da aba B' : 'Rascunho da aba A',
  );
  await expect(losingDialog.getByLabel('Texto da nota', { exact: true })).toHaveValue(
    winner === page ? 'Texto da aba B' : 'Texto da aba A',
  );
  await losingDialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await other.close();
  await open(page, secondCampaignId);
  await expect(
    page.getByText('Nenhuma nota própria nesta campanha.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: request.input.title, exact: true })).toHaveCount(0);
  await open(page);
  const dialog = await edit(page, request.input.title);
  await dialog.getByLabel('Texto da nota', { exact: true }).fill('TEXTO PRIVADO DA PRIMEIRA CONTA');
  await flag(page, 'writer.visual.campaign-note-hold-response', 'saveCampaignNote');
  await dialog.getByRole('button', { name: 'Salvar nota', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await state(page)).calls.filter((call) => call.method === 'saveCampaignNote').length,
    )
    .toBe(2);
  const oldJournal = await pending(page);
  expect(oldJournal).not.toBeNull();
  await page.evaluate(() => {
    sessionStorage.setItem('writer.visual.account', 'second');
    window.dispatchEvent(new Event('writer.visual.auth-change'));
  });
  await expect(
    page.getByRole('heading', { name: 'Campanha indisponível', exact: true }),
  ).toBeVisible();
  await release(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('TEXTO PRIVADO DA PRIMEIRA CONTA', { exact: true })).toHaveCount(0);
  expect(await pending(page)).toBe(oldJournal);
  await page.evaluate(() => {
    sessionStorage.removeItem('writer.visual.account');
    window.dispatchEvent(new Event('writer.visual.auth-change'));
  });
  await page.getByRole('button', { name: 'Confirmar pedido pendente', exact: true }).click();
  await closeSaved(page, request.input.title, 'TEXTO PRIVADO DA PRIMEIRA CONTA');
  expect(await pending(page)).toBeNull();
  const calls = (await state(page)).calls.filter((call) => call.method === 'saveCampaignNote');
  expect(calls).toHaveLength(3);
  expect(calls[1].operationId).toBe(calls[2].operationId);
  expect(
    Object.values(
      (await state(page)).projects[JSON.stringify(['visual-author', campaignId])].notes,
    ),
  ).toHaveLength(1);
});

test('respostas perdidas de criar editar e excluir recuperam o mesmo pedido após reload', async ({
  page,
}) => {
  await open(page);
  let dialog = await draft(page, 'Nota com confirmação pendente', text);
  await lost(page, 'saveCampaignNote');
  await dialog.getByRole('button', { name: 'Salvar nota', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Confirmar pedido pendente', exact: true }),
  ).toBeEnabled();
  const createJournal = await pending(page);
  expect(createJournal).not.toBeNull();
  await page.reload();
  expect(await pending(page)).toBe(createJournal);
  await page.getByRole('button', { name: 'Confirmar pedido pendente', exact: true }).click();
  await closeSaved(page, 'Nota com confirmação pendente', text);
  dialog = await edit(page, 'Nota com confirmação pendente');
  const changed = text + '\nEdição confirmada por recibo.';
  await dialog.getByLabel('Texto da nota', { exact: true }).fill(changed);
  await lost(page, 'saveCampaignNote');
  await dialog.getByRole('button', { name: 'Salvar nota', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Confirmar pedido pendente', exact: true }),
  ).toBeEnabled();
  const editJournal = await pending(page);
  await page.reload();
  expect(await pending(page)).toBe(editJournal);
  await page.getByRole('button', { name: 'Confirmar pedido pendente', exact: true }).click();
  await closeSaved(page, 'Nota com confirmação pendente', changed);
  await page
    .getByRole('button', { name: 'Excluir nota Nota com confirmação pendente', exact: true })
    .click();
  const deletion = page.getByRole('dialog', { name: 'Excluir nota própria', exact: true });
  await lost(page, 'deleteCampaignNote');
  await deletion.getByRole('button', { name: 'Confirmar exclusão', exact: true }).click();
  await expect(
    deletion.getByRole('button', { name: 'Confirmar pedido pendente', exact: true }),
  ).toBeEnabled();
  const deleteJournal = await pending(page);
  const callsBeforeReload = (await state(page)).calls.length;
  await page.reload();
  expect(await pending(page)).toBe(deleteJournal);
  await expect(
    page.getByRole('button', { name: 'Confirmar pedido pendente', exact: true }),
  ).toBeEnabled();
  expect(
    (await state(page)).calls
      .slice(callsBeforeReload)
      .filter((call) => call.method === 'getCampaignNote'),
  ).toHaveLength(0);
  await page.getByRole('button', { name: 'Confirmar pedido pendente', exact: true }).click();
  await expect(
    page.getByText('Nenhuma nota própria nesta campanha.', { exact: true }),
  ).toBeVisible();
  expect(await pending(page)).toBeNull();
  const snapshot = await state(page);
  const mutations = snapshot.calls.filter((call) =>
    ['saveCampaignNote', 'deleteCampaignNote'].includes(call.method),
  );
  expect(mutations).toHaveLength(6);
  for (let index = 0; index < mutations.length; index += 2) {
    expect(mutations[index].operationId).toBe(mutations[index + 1].operationId);
    expect(mutations[index].expectedRevision).toBe(mutations[index + 1].expectedRevision);
    expect(mutations[index].noteId).toBe(mutations[index + 1].noteId);
  }
  expect(new Set(mutations.map((call) => call.noteId)).size).toBe(1);
  const project = snapshot.projects[JSON.stringify(['visual-author', campaignId])];
  expect(project.revision).toBe(3);
  expect(Object.values(project.notes)).toHaveLength(1);
  expect(Object.values(project.notes)[0]).toMatchObject({ deleted: true, revision: 3 });
  expect(Object.values(project.notes)[0]).not.toHaveProperty('content');
});
