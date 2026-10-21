import type { Page, Locator } from '@playwright/test';
import { chooseDropdown } from '../dropdown';
import {
  test,
  expect,
  capture,
  expectDialogWithinViewport,
  expectNoHorizontalOverflow,
} from './support';
import type {
  EditorChatScope,
  EditorChatOperationRow,
} from '../../src/features/ai-assistant/model/editorChat';
import type * as Fixture from './fixtures/editorChatService';

type Kind = 'book' | 'adventure' | 'block';
type Seed = Awaited<ReturnType<typeof Fixture.fixtureSeedEditorChat>>;
const panel = (page: Page) =>
  page.getByRole('dialog', { name: 'Assistente de escrita', exact: true });
const opener = (page: Page) =>
  page.getByRole('button', { name: 'Abrir Assistente Criativo de IA', exact: true });
const editor = (page: Page, kind: Kind, includeHidden = false) =>
  page.getByRole('textbox', {
    name: kind === 'block' ? 'Área de escrita do bloco' : 'Área de escrita da cena',
    exact: true,
    includeHidden,
  });
async function seed(page: Page, kind: Kind): Promise<Seed> {
  await page.goto('/studio');
  const value = await page.evaluate(async (kind) => {
    const path = '/e2e/visual/fixtures/editorChatService.ts';
    const fixture = (await import(path)) as typeof Fixture;
    return fixture.fixtureSeedEditorChat(kind);
  }, kind);
  await page.goto(value.path);
  await expect(editor(page, kind)).toContainText('A Guardiã');
  const title = page.getByRole('heading', { level: 1 }).filter({ hasText: 'A Guardiã e o farol' });
  if (kind !== 'block') {
    await expect(title).toBeVisible();
    const width = await title.evaluate((element) => ({
      client: element.clientWidth,
      scroll: element.scrollWidth,
    }));
    expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
  }
  return value;
}
async function evidence(page: Page, scope: EditorChatScope) {
  return page.evaluate(async (scope) => {
    const path = '/e2e/visual/fixtures/editorChatService.ts';
    return ((await import(path)) as typeof Fixture).fixtureEditorChatEvidence(scope);
  }, scope);
}
async function open(page: Page) {
  await opener(page).click();
  await expect(panel(page)).toBeVisible();
  return panel(page);
}
async function expectPanelInternalWidth(dialog: Locator) {
  const width = await dialog.locator('[data-slot="dialog-body"]').evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
}
async function setupConversation(page: Page) {
  const dialog = await open(page);
  await dialog.getByRole('button', { name: 'Atualizar conversas', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Nova conversa', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Nova conversa', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Renomear conversa', exact: true }),
  ).toBeEnabled();
  await dialog.getByRole('button', { name: 'Preparar contexto', exact: true }).click();
  await expect(dialog.getByText('Consultando fichas locais', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Enviar pergunta', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Avançar uma página do contexto', exact: true }).click();
  await expect(dialog.getByText('Consultando universo', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Avançar uma página do contexto', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Conferir contexto', exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Enviar pergunta', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Conferir contexto', exact: true }).click();
  await expect(dialog.getByText('LORE LOCAL AUTORIZADO', { exact: true })).toBeVisible();
  await expect(dialog.getByText('SEGREDO GLOBAL PERDEDOR', { exact: true })).toHaveCount(0);
  await expectPanelInternalWidth(dialog);
  return dialog;
}
async function send(page: Page, dialog: Locator) {
  await dialog
    .getByRole('textbox', { name: 'Sua pergunta', exact: true })
    .fill('Como a Guardiã pode revelar a passagem?');
  await expect(dialog.getByRole('button', { name: 'Enviar pergunta', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Enviar pergunta', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Ler resposta 1', exact: true })).toBeEnabled();
  await expect(
    dialog.getByText('A Guardiã pode revelar a passagem sem resolver a escolha do grupo.', {
      exact: true,
    }),
  ).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Ler resposta 1', exact: true }).click();
  await expect(
    dialog.getByText('A Guardiã pode revelar a passagem sem resolver a escolha do grupo.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Sua pergunta', exact: true })).toHaveValue('');
  await expect(page.getByRole('dialog', { name: 'Confirmar aplicação', exact: true })).toHaveCount(
    0,
  );
}
async function close(page: Page) {
  await panel(page).getByRole('button', { name: 'Fechar painel', exact: true }).click();
  await expect(panel(page)).toHaveCount(0);
}
async function confirmApply(page: Page, dialog: Locator, retarget = false) {
  await dialog.getByRole('button', { name: 'Aplicar sugestão 1', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Confirmar aplicação', exact: true });
  if (retarget) {
    await chooseDropdown(
      confirm.getByLabel('Destino da sugestão', { exact: true }),
      'Nova seleção ou posição',
    );
    await chooseDropdown(confirm.getByLabel('Nova origem no editor', { exact: true }), 'Documento');
  }
  await chooseDropdown(
    confirm.getByLabel('Modo de aplicação', { exact: true }),
    'Substituir trecho',
  );
  await confirm.getByRole('button', { name: 'Confirmar aplicação no texto', exact: true }).click();
  await expect(confirm).toHaveCount(0);
}
async function assertJournalMetadata(page: Page, scope: EditorChatScope) {
  const current = await evidence(page, scope);
  const text = JSON.stringify(current.journal);
  expect(Object.keys(current.journal)).toHaveLength(1);
  for (const privateText of [
    'Como a Guardiã',
    'LORE LOCAL AUTORIZADO',
    'A Guardiã abriu',
    'Oriente a escrita',
  ])
    expect(text).not.toContain(privateText);
  expect(text).not.toContain('apiKey');
  return current;
}

for (const kind of ['book', 'adventure', 'block'] as const) {
  test(`chat integrado principal: ${kind}, contexto explícito, aplicação única e undo real`, async ({
    page,
  }, info) => {
    if (info.project.name.startsWith('mobile'))
      await page.setViewportSize({ width: 320, height: 900 });
    const value = await seed(page, kind);
    const before = await evidence(page, value);
    await editor(page, kind).locator('p').first().click();
    await editor(page, kind).press('End');
    const dialog = await setupConversation(page);
    await send(page, dialog);
    const free = await assertJournalMetadata(page, value);
    expect(free.credits).toBe(before.credits);
    expect(free.source?.content).toBe(before.source?.content);
    expect(free.legacyActions).toBeNull();
    expect(free.autocomplete).toBeNull();
    await expectDialogWithinViewport(page);
    await capture(page, info, `chat-${kind}-contexto`);
    await confirmApply(page, dialog);
    const applied = await assertJournalMetadata(page, value);
    expect(applied.credits).toBe(before.credits - 1);
    expect(applied.source?.content).toContain('A Guardiã abriu a passagem entre as estrelas.');
    expect(applied.scene?.wordCount).toBe(applied.group?.wordCount);
    if (kind === 'block') expect(applied.source?.sceneWordCount).toBe(applied.scene?.wordCount);
    await close(page);
    await expect(editor(page, kind)).toContainText('A Guardiã abriu a passagem entre as estrelas.');
    await editor(page, kind).press('Control+z');
    await expect(editor(page, kind)).toHaveText(
      (before.source?.content ?? '').replace(/<[^>]*>/g, ''),
    );
    await expect
      .poll(async () => (await evidence(page, value)).source?.content)
      .toBe(before.source?.content);
    expect((await evidence(page, value)).credits).toBe(before.credits - 1);
    await capture(page, info, `chat-${kind}-undo`);
    const reopened = await open(page);
    await reopened
      .getByRole('textbox', { name: 'Sua pergunta', exact: true })
      .fill('Rascunho próprio só em RAM');
    await page.keyboard.press('Escape');
    const warning = page.getByRole('dialog', { name: 'Fechar o assistente?', exact: true });
    await expect(warning).toBeVisible();
    await warning.getByRole('button', { name: 'Voltar', exact: true }).click();
    await expect(reopened.getByRole('textbox', { name: 'Sua pergunta', exact: true })).toHaveValue(
      'Rascunho próprio só em RAM',
    );
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Fechar agora', exact: true }).click();
    await expect(opener(page)).toBeFocused();
    expect(JSON.stringify((await evidence(page, value)).journal)).not.toContain('Rascunho próprio');
    await expectNoHorizontalOverflow(page, 'chat após fechar');
  });
}

test('chat dirigido: edição durante geração exige retarget e revogação preserva pergunta', async ({
  page,
}, info) => {
  if (info.project.name.startsWith('mobile'))
    await page.setViewportSize({ width: 320, height: 900 });
  const value = await seed(page, 'book');
  const dialog = await setupConversation(page);
  await page.evaluate(() => sessionStorage.setItem('writer.visual.editor-chat-hold', 'true'));
  await dialog
    .getByRole('textbox', { name: 'Sua pergunta', exact: true })
    .fill('Pergunta antes da edição');
  await dialog.getByRole('button', { name: 'Enviar pergunta', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Interromper geração', exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Fechar painel', exact: true }).click();
  await page.getByRole('button', { name: 'Fechar agora', exact: true }).click();
  await editor(page, 'book').locator('p').first().click();
  await editor(page, 'book').press('Control+End');
  await page.keyboard.type(' Mudança própria durante a geração.');
  await page.evaluate(async () => {
    const path = '/e2e/visual/fixtures/editorChatService.ts';
    ((await import(path)) as typeof Fixture).fixtureReleaseEditorChat();
  });
  await expect
    .poll(async () => (await evidence(page, value)).source?.content)
    .toContain('Mudança própria durante a geração.');
  const afterEdit = await evidence(page, value);
  await open(page);
  await dialog.getByRole('button', { name: 'Ler resposta 1', exact: true }).click();
  await dialog.getByRole('button', { name: 'Aplicar sugestão 1', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Confirmar aplicação', exact: true });
  await confirmation
    .getByRole('button', { name: 'Confirmar aplicação no texto', exact: true })
    .click();
  await expect(
    confirmation.getByText(
      'Não foi possível confirmar a ação. Confira o estado antes de tentar novamente.',
      { exact: true },
    ),
  ).toBeVisible();
  expect((await evidence(page, value)).credits).toBe(afterEdit.credits);
  await chooseDropdown(
    confirmation.getByLabel('Destino da sugestão', { exact: true }),
    'Nova seleção ou posição',
  );
  await chooseDropdown(
    confirmation.getByLabel('Nova origem no editor', { exact: true }),
    'Documento',
  );
  await chooseDropdown(
    confirmation.getByLabel('Modo de aplicação', { exact: true }),
    'Substituir trecho',
  );
  await confirmation
    .getByRole('button', { name: 'Confirmar aplicação no texto', exact: true })
    .click();
  await expect(confirmation).toHaveCount(0);
  expect((await evidence(page, value)).credits).toBe(afterEdit.credits - 1);
  await page.evaluate(async (scope) => {
    const path = '/e2e/visual/fixtures/editorChatService.ts';
    ((await import(path)) as typeof Fixture).fixtureRevokeEditorChat(scope);
  }, value);
  await expect(
    dialog.getByText('A Guardiã pode revelar a passagem sem resolver a escolha do grupo.', {
      exact: true,
    }),
  ).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Ler resposta 1', exact: true }).click();
  await expect(dialog.getByText('Pergunta antes da edição', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/Resposta indisponível/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Aplicar sugestão 1', exact: true })).toHaveCount(
    0,
  );
  await capture(page, info, 'chat-revogacao-pergunta-preservada');
});

test('chat dirigido: reload de pedido desconhecido confere e cancela o mesmo controle sem reenvio', async ({
  page,
}, info) => {
  if (info.project.name.startsWith('mobile'))
    await page.setViewportSize({ width: 320, height: 900 });
  const value = await seed(page, 'adventure');
  const dialog = await setupConversation(page);
  await page.evaluate(() => sessionStorage.setItem('writer.visual.editor-chat-loss', 'before'));
  await dialog
    .getByRole('textbox', { name: 'Sua pergunta', exact: true })
    .fill('PERGUNTA NÃO CONFIRMADA');
  await dialog.getByRole('button', { name: 'Enviar pergunta', exact: true }).click();
  await expect(dialog.getByRole('region', { name: 'Pedido pendente', exact: true })).toBeVisible();
  const pending = await assertJournalMetadata(page, value);
  const original = Object.values(pending.journal)[0];
  expect(original).toBeDefined();
  expect(JSON.stringify(pending.journal)).not.toContain('PERGUNTA NÃO CONFIRMADA');
  await page.reload();
  await open(page);
  await expect(dialog.getByRole('textbox', { name: 'Sua pergunta', exact: true })).toHaveValue('');
  await dialog.getByRole('button', { name: 'Conferir pedido', exact: true }).click();
  await expect(dialog.getByRole('region', { name: 'Pedido pendente', exact: true })).toBeVisible();
  const observed = await evidence(page, value);
  expect(observed.server.calls.filter((action) => action === 'send')).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Cancelar pedido pendente', exact: true }).click();
  await expect(dialog.getByRole('region', { name: 'Pedido pendente', exact: true })).toHaveCount(0);
  const canceled = await evidence(page, value);
  const beforeRow = JSON.parse(original) as { operationId: string; requestHash: string };
  const afterRow = JSON.parse(Object.values(canceled.journal)[0]) as {
    operationId: string;
    requestHash: string;
    intent: string;
    state: string;
  };
  expect(afterRow).toMatchObject({
    operationId: beforeRow.operationId,
    requestHash: beforeRow.requestHash,
    intent: 'cancel',
    state: 'settled',
  });
  expect(canceled.server.calls.filter((action) => action === 'send')).toHaveLength(1);
  expect(canceled.source?.content).toBe(pending.source?.content);
  expect(canceled.credits).toBe(pending.credits);
  await capture(page, info, 'chat-recovery-cancel-sem-prosa');
});

test('chat dirigido: BYOK pendente recarrega, lê pergunta e interrompe sem executar provedor', async ({
  page,
}, info) => {
  if (info.project.name.startsWith('mobile'))
    await page.setViewportSize({ width: 320, height: 900 });
  const value = await seed(page, 'block');
  const dialog = await setupConversation(page);
  await chooseDropdown(dialog.getByLabel('Provedor', { exact: true }), 'OpenAI com minha chave');
  await dialog
    .getByRole('textbox', { name: 'Sua pergunta', exact: true })
    .fill('PERGUNTA BYOK PRÓPRIA');
  await dialog.getByRole('button', { name: 'Enviar pergunta', exact: true }).click();
  await expect(dialog.getByText('Aguardando provedor próprio', { exact: true })).toBeVisible();
  const sent = await assertJournalMetadata(page, value);
  expect(sent.server.calls.filter((action) => action === 'send')).toHaveLength(1);
  expect(JSON.stringify(sent.journal)).not.toContain('PERGUNTA BYOK PRÓPRIA');
  await expect(dialog.getByText('Converse com o autor.', { exact: true })).toHaveCount(0);
  await page.reload();
  await open(page);
  await dialog.getByRole('button', { name: 'Conferir controles atuais', exact: true }).click();
  await expect(dialog.getByText('Aguardando provedor próprio', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Ler resposta 1', exact: true }).click();
  await expect(dialog.getByText('PERGUNTA BYOK PRÓPRIA', { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Gerar com meu provedor', exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Interromper geração', exact: true }).click();
  await expect(dialog.getByText('Interrompida', { exact: true })).toBeVisible();
  const stopped = await evidence(page, value);
  expect(stopped.server.calls.filter((action) => action === 'send')).toHaveLength(1);
  expect(
    stopped.server.calls.filter((action) => action === 'completeBYOK' || action === 'failBYOK'),
  ).toHaveLength(0);
  expect(stopped.credits).toBe(sent.credits);
  expect(stopped.source?.content).toBe(sent.source?.content);
  expect(JSON.stringify(stopped.journal)).not.toContain('apiKey');
  await capture(page, info, 'chat-byok-pendente-stop-metadata');
});

test('persona: base da aventura, complemento com ajuste, CAS e recuperação sem novo setter no bloco', async ({
  page,
}, info) => {
  if (info.project.name.startsWith('mobile'))
    await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/studio');
  const value = await page.evaluate(async () => {
    const path = '/e2e/visual/fixtures/editorChatService.ts';
    return ((await import(path)) as typeof Fixture).fixtureSeedEditorChat('block');
  });
  await page.goto(`/adventures/${value.target.id}`);
  await page.getByRole('button', { name: 'Persona da aventura', exact: true }).click();
  const base = page.getByRole('dialog', { name: 'Persona da aventura', exact: true });
  await chooseDropdown(
    base.getByRole('combobox', { name: 'Persona base', exact: true }),
    'O Épico',
  );
  await base.getByRole('button', { name: 'Salvar vínculo', exact: true }).click();
  await expect(base).toHaveCount(0);
  const bound = await evidence(page, value);
  expect(
    Object.values(bound.server.bindings).find((binding) => binding.sceneId === null)?.value,
  ).toEqual({ personaId: 'preset-epic' });
  await page.goto(value.path.replace(/\/blocks\/[^/]+$/, ''));
  await page.getByRole('button', { name: 'Persona da cena', exact: true }).click();
  const scene = page.getByRole('dialog', { name: 'Persona complementar da cena', exact: true });
  await chooseDropdown(
    scene.getByRole('combobox', { name: 'Persona complementar', exact: true }),
    'O Incisivo',
  );
  await chooseDropdown(
    scene.getByRole('combobox', { name: 'Aplicação de Sensorialidade', exact: true }),
    'Definir na cena',
  );
  const slider = scene.getByRole('slider', { name: 'Sensorialidade', exact: true });
  await slider.press('End');
  for (let n = 0; n < 15; n++) await slider.press('ArrowLeft');
  await expect(slider).toHaveValue('85');
  await page.evaluate(() =>
    sessionStorage.setItem('writer.visual.editor-chat-persona-conflict', 'true'),
  );
  await scene.getByRole('button', { name: 'Salvar vínculo', exact: true }).click();
  await expect(
    scene.getByRole('button', { name: 'Conferir pendência', exact: true }),
  ).toBeVisible();
  await expect(slider).toHaveValue('85');
  await expect(
    scene.getByRole('combobox', { name: 'Persona complementar', exact: true }),
  ).toContainText('O Incisivo');
  const failed = await evidence(page, value);
  const setterCalls = failed.server.calls.filter(
    (action) => action === 'setAdventurePersonaBinding',
  ).length;
  const pending = Object.values(failed.journal)
    .map((raw) => JSON.parse(raw) as EditorChatOperationRow)
    .find(
      (row) => row.action === 'setAdventurePersonaBinding' && row.resource?.id === value.sceneId,
    );
  expect(pending).toBeDefined();
  expect(pending?.resourceToken).toBeNull();
  await scene.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(scene).toBeVisible();
  await expect(
    scene.getByText('Confira ou cancele o pedido pendente antes de fechar esta janela.', {
      exact: true,
    }),
  ).toBeVisible();
  await scene.getByRole('button', { name: 'Salvar vínculo', exact: true }).click();
  expect(
    (await evidence(page, value)).server.calls.filter(
      (action) => action === 'setAdventurePersonaBinding',
    ),
  ).toHaveLength(setterCalls);
  await scene.getByRole('button', { name: 'Conferir pendência', exact: true }).click();
  await expect(
    scene.getByText('O pedido continua sem confirmação. Nenhum vínculo foi reenviado.', {
      exact: true,
    }),
  ).toBeVisible();
  await scene.getByRole('button', { name: 'Cancelar pendência', exact: true }).click();
  await expect(
    scene.getByRole('button', { name: 'Conferir vínculo atual e manter ajustes', exact: true }),
  ).toBeEnabled();
  const settled = await evidence(page, value);
  const canceled = Object.values(settled.journal)
    .map((raw) => JSON.parse(raw) as EditorChatOperationRow)
    .find((row) => row.operationId === pending?.operationId);
  expect(canceled).toMatchObject({
    operationId: pending?.operationId,
    requestHash: pending?.requestHash,
    state: 'settled',
    intent: 'cancel',
    resourceToken: null,
  });
  await scene
    .getByRole('button', { name: 'Conferir vínculo atual e manter ajustes', exact: true })
    .click();
  await expect(slider).toHaveValue('85');
  await expect(
    scene.getByRole('combobox', { name: 'Persona complementar', exact: true }),
  ).toContainText('O Incisivo');
  await expectPanelInternalWidth(scene);
  await capture(page, info, 'persona-complemento-85-apos-cas');
  await scene.getByRole('button', { name: 'Salvar vínculo', exact: true }).click();
  await expect(scene).toHaveCount(0);
  const saved = await evidence(page, value);
  const complement = Object.values(saved.server.bindings).find(
    (binding) => binding.sceneId === value.sceneId,
  );
  expect(complement?.value).toEqual({
    personaComplement: {
      personaId: 'preset-incisive',
      overrides: [{ traitId: 'sensory', value: 85 }],
    },
  });
  expect(
    saved.server.calls.filter((action) => action === 'setAdventurePersonaBinding'),
  ).toHaveLength(setterCalls + 1);
  await page.goto(value.path);
  await expect(editor(page, 'block')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Persona da cena', exact: true })).toHaveCount(0);
  const dialog = await setupConversation(page);
  await expect(dialog.getByText(/Persona da aventura: O Épico/)).toBeVisible();
  await expect(dialog.getByText(/Complemento da cena: O Incisivo/)).toBeVisible();
  await expect(dialog.getByText(/Sensorialidade: 85\/100/)).toBeVisible();
  const captured = await evidence(page, value);
  const frozen = Object.values(captured.server.contexts).find(
    (context) => context.summary.resource.kind === 'block' && context.summary.phase === 'ready',
  )?.frozen;
  expect(frozen?.persona.base?.id).toBe('preset-epic');
  expect(frozen?.persona.complement?.id).toBe('preset-incisive');
  expect(frozen?.persona.instruction).toContain('Sensorialidade: 85/100');
  expect(
    captured.server.calls.filter((action) => action === 'setAdventurePersonaBinding'),
  ).toHaveLength(setterCalls + 1);
  await capture(page, info, 'persona-herdada-no-bloco-sem-setter');
});

// Identity changes and uncertain responses run against the real controller, journal, locks and PM.
// This transport fixture does not prove Firestore authorization or atomic backend billing.
test('chat segurança: troca de UID durante retomada não confirma a linha antiga e voltar recupera o mesmo pedido', async ({
  page,
}, info) => {
  if (info.project.name.startsWith('mobile'))
    await page.setViewportSize({ width: 320, height: 900 });
  const value = await seed(page, 'book');
  const before = await evidence(page, value);
  const ownHTML = await editor(page, 'book').innerHTML();
  const dialog = await setupConversation(page);
  await page.evaluate(() => sessionStorage.setItem('writer.visual.editor-chat-loss', 'before'));
  await dialog
    .getByRole('textbox', { name: 'Sua pergunta', exact: true })
    .fill('PERGUNTA PRIVADA DA CONTA A');
  await dialog.getByRole('button', { name: 'Enviar pergunta', exact: true }).click();
  await expect(dialog.getByRole('region', { name: 'Pedido pendente', exact: true })).toBeVisible();
  const original = Object.values((await assertJournalMetadata(page, value)).journal)[0];
  expect(original).toBeDefined();
  const firstRow = JSON.parse(original) as EditorChatOperationRow;
  await page.reload();
  await open(page);
  await page.evaluate(() =>
    sessionStorage.setItem('writer.visual.editor-chat-hold-resolution', 'true'),
  );
  await dialog.getByRole('button', { name: 'Cancelar pedido pendente', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => sessionStorage.getItem('writer.visual.editor-chat-resolution-ready')),
    )
    .toBe('true');
  const held = await evidence(page, value);
  const heldRow = JSON.parse(Object.values(held.journal)[0]) as EditorChatOperationRow;
  expect(heldRow).toMatchObject({
    operationId: firstRow.operationId,
    requestHash: firstRow.requestHash,
    intent: 'cancel',
  });
  expect(heldRow.state).not.toBe('settled');
  expect(held.server.operations[firstRow.operationId]?.outcome).toBe('canceled');
  await page.evaluate(async () => {
    sessionStorage.setItem('writer.visual.account', 'second');
    window.dispatchEvent(new Event('writer.visual.auth-change'));
    const path = '/e2e/visual/fixtures/editorChatService.ts';
    ((await import(path)) as typeof Fixture).fixtureReleaseEditorChatResolution();
  });
  await expect
    .poll(() =>
      page.evaluate(() => sessionStorage.getItem('writer.visual.editor-chat-resolution-ready')),
    )
    .toBeNull();
  await expect(page.getByText('LORE LOCAL AUTORIZADO', { exact: true })).toHaveCount(0);
  await expect(page.getByText('PERGUNTA PRIVADA DA CONTA A', { exact: true })).toHaveCount(0);
  const switchedJournal = await page.evaluate(() =>
    Object.fromEntries(
      Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
        .filter((key): key is string => Boolean(key?.startsWith('writer:editor-chat-operation:')))
        .map((key) => [key, localStorage.getItem(key)]),
    ),
  );
  expect(switchedJournal).toEqual(held.journal);
  expect(JSON.stringify(switchedJournal)).not.toContain('visual-second-author');
  await page.evaluate(() => {
    sessionStorage.removeItem('writer.visual.account');
    window.dispatchEvent(new Event('writer.visual.auth-change'));
  });
  await page.reload();
  // The actor switch legitimately returns the workspace to Studio; reopen the original source.
  await page.goto(value.path);
  await expect(editor(page, 'book', true)).toHaveJSProperty('innerHTML', ownHTML);
  await open(page);
  await expect(dialog.getByRole('region', { name: 'Pedido pendente', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Conferir pedido', exact: true }).click();
  await expect(dialog.getByRole('region', { name: 'Pedido pendente', exact: true })).toHaveCount(0);
  const recovered = await assertJournalMetadata(page, value);
  const recoveredRow = JSON.parse(Object.values(recovered.journal)[0]) as EditorChatOperationRow;
  expect(recoveredRow).toMatchObject({
    operationId: firstRow.operationId,
    requestHash: firstRow.requestHash,
    state: 'settled',
    intent: 'cancel',
  });
  expect(recovered.server.calls.filter((action) => action === 'send')).toHaveLength(1);
  expect(recovered.server.calls.filter((action) => action === 'resolveOperation')).toHaveLength(2);
  expect(recovered.source?.content).toBe(before.source?.content);
  expect(recovered.credits).toBe(before.credits);
  await expect(editor(page, 'book', true)).toHaveJSProperty('innerHTML', ownHTML);
  await capture(page, info, 'chat-uid-retoma-mesmo-pedido');
});

test('chat segurança: aplicar com resposta perdida debita uma vez e conferir não adota um corpo posterior', async ({
  page,
}, info) => {
  if (info.project.name.startsWith('mobile'))
    await page.setViewportSize({ width: 320, height: 900 });
  const value = await seed(page, 'book');
  const ownHTML = await editor(page, 'book').innerHTML();
  const dialog = await setupConversation(page);
  await send(page, dialog);
  const before = await evidence(page, value);
  await dialog.getByRole('button', { name: 'Aplicar sugestão 1', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Confirmar aplicação', exact: true });
  await chooseDropdown(
    confirmation.getByLabel('Modo de aplicação', { exact: true }),
    'Substituir trecho',
  );
  await page.evaluate(() => sessionStorage.setItem('writer.visual.editor-chat-loss', 'after'));
  await confirmation
    .getByRole('button', { name: 'Confirmar aplicação no texto', exact: true })
    .click();
  await expect(
    confirmation.getByText(
      'Não foi possível confirmar a ação. Confira o estado antes de tentar novamente.',
      { exact: true },
    ),
  ).toBeVisible();
  const uncertain = await assertJournalMetadata(page, value);
  const original = JSON.parse(Object.values(uncertain.journal)[0]) as EditorChatOperationRow;
  expect(original).toMatchObject({ action: 'applySuggestion', state: 'uncertain' });
  expect(uncertain.server.operations[original.operationId]?.outcome).toBe('confirmed');
  expect(uncertain.source?.content).toContain('A Guardiã abriu a passagem entre as estrelas.');
  expect(uncertain.credits).toBe(before.credits - 1);
  expect(uncertain.server.calls.filter((action) => action === 'applySuggestion')).toHaveLength(1);
  await expect(editor(page, 'book', true)).toHaveJSProperty('innerHTML', ownHTML);
  await expect(
    confirmation.getByRole('button', { name: 'Confirmar aplicação no texto', exact: true }),
  ).toBeDisabled();
  // A later write is a distinct client using the same public scene writer; it is not a recovered answer.
  const laterContent = '<p>Versão posterior escrita por outra pessoa.</p>';
  await page.evaluate(
    async ({ scope, revision, content }) => {
      const path = '/e2e/visual/fixtures/sceneService.ts';
      const service = (await import(path)) as typeof import('./fixtures/sceneService');
      await service.updateScene({
        target: scope.target,
        sceneId: scope.resource.id,
        operationId: 'visual-chat-later-write',
        expectedRevision: revision,
        patch: { content },
      });
    },
    { scope: value, revision: uncertain.source!.revision!, content: laterContent },
  );
  const later = await evidence(page, value);
  expect(later.source?.content).toBe(laterContent);
  await expect(editor(page, 'book', true)).toHaveJSProperty('innerHTML', ownHTML);
  await confirmation.getByRole('button', { name: 'Voltar', exact: true }).click();
  await dialog.getByRole('button', { name: 'Conferir pedido', exact: true }).click();
  await expect(dialog.getByRole('region', { name: 'Pedido pendente', exact: true })).toHaveCount(0);
  const settled = await assertJournalMetadata(page, value);
  const row = JSON.parse(Object.values(settled.journal)[0]) as EditorChatOperationRow;
  expect(row).toMatchObject({
    operationId: original.operationId,
    requestHash: original.requestHash,
    action: 'applySuggestion',
    state: 'settled',
  });
  expect(settled.server.calls.filter((action) => action === 'applySuggestion')).toHaveLength(1);
  expect(settled.server.calls.filter((action) => action === 'getTurn')).toHaveLength(
    later.server.calls.filter((action) => action === 'getTurn').length,
  );
  expect(settled.credits).toBe(before.credits - 1);
  expect(settled.source?.content).toBe(laterContent);
  expect(settled.source?.revision).toBe(later.source?.revision);
  await expect(editor(page, 'book', true)).toHaveJSProperty('innerHTML', ownHTML);
  await expect(
    dialog.getByText('A Guardiã pode revelar a passagem sem resolver a escolha do grupo.', {
      exact: true,
    }),
  ).toHaveCount(0);
  await capture(page, info, 'chat-apply-incerto-sem-adocao-posterior');
});
