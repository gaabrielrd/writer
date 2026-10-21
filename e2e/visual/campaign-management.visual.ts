import type { Page } from '@playwright/test';
import type { Campaign } from '../../src/features/campaigns/model/campaign';
import { chooseDropdown } from '../dropdown';
import {
  capture,
  expect,
  expectDialogWithinViewport,
  expectNoHorizontalOverflow,
  test,
} from './support';

const campaignPath = '/campaigns/visual-campaign-1';
const originalTitle = 'Crônicas do Porto das Lanternas';
const originalDescription = 'Anotações particulares para a próxima jornada.';
const pendingKey =
  'writer:campaign-management:' + JSON.stringify(['visual-author', 'visual-campaign-1']);
async function openCampaign(page: Page) {
  await page.goto(campaignPath);
  await expect(
    page.getByRole('heading', { name: originalTitle, exact: true, level: 1 }),
  ).toBeVisible();
}
async function edit(page: Page) {
  await page.getByRole('button', { name: 'Editar campanha', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar campanha', exact: true });
  await expect(dialog.getByLabel('Título da campanha', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Universo compartilhado', { exact: true })).toBeVisible();
  return dialog;
}
async function flag(page: Page, key: string, value: string) {
  await page.evaluate(({ key, value }) => sessionStorage.setItem(key, value), { key, value });
}
async function campaignMetadata(page: Page, id: string): Promise<Campaign | null> {
  return page.evaluate((id) => {
    const stored = JSON.parse(
      sessionStorage.getItem('writer.visual.studio-projects') ?? '{"campaigns":[]}',
    ) as { campaigns: Campaign[] };
    return (
      stored.campaigns.find(
        (campaign) => campaign.id === id && campaign.ownerId === 'visual-author',
      ) ?? null
    );
  }, id);
}

test('criação legada e edição por teclado em 320px preservam identidade e confirmação própria', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/studio');
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Campanha', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Criar campanha', exact: true });
  await create.getByLabel('Título da campanha', { exact: true }).fill('Campanha da expedição');
  await create
    .getByLabel('Descrição da campanha', { exact: true })
    .fill('Notas particulares da expedição.');
  await create.getByRole('button', { name: 'Criar campanha', exact: true }).click();
  await expect(page).toHaveURL(/\/campaigns\/visual-created-campaign-/);
  await expect(
    page.getByRole('heading', { name: 'Campanha da expedição', exact: true, level: 1 }),
  ).toBeVisible();
  const id = new URL(page.url()).pathname.split('/').at(-1)!;
  const before = await campaignMetadata(page, id);
  expect(before).not.toBeNull();
  let dialog = await edit(page);
  await dialog.getByLabel('Título da campanha', { exact: true }).fill('Título cancelado');
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Campanha da expedição', exact: true, level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar campanha', exact: true })).toBeFocused();
  dialog = await edit(page);
  const title = dialog.getByLabel('Título da campanha', { exact: true });
  await title.focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.insertText('Expedição das lanternas');
  await page.keyboard.press('Tab');
  await expect(dialog.getByLabel('Descrição da campanha', { exact: true })).toBeFocused();
  await page.keyboard.press('Control+A');
  await page.keyboard.insertText('Consequências particulares da mesa.');
  await dialog.getByLabel('Estado da campanha', { exact: true }).focus();
  await page.keyboard.press('Space');
  const active = page.getByRole('option', { name: 'Em andamento', exact: true });
  await expect(active).toBeVisible();
  await active.focus();
  await page.keyboard.press('Enter');
  await expect(dialog.getByLabel('Estado da campanha', { exact: true })).toContainText(
    'Em andamento',
  );
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'gestao-campanha-formulario-320');
  await dialog.getByRole('button', { name: 'Salvar alterações', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Expedição das lanternas', exact: true, level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText('Consequências particulares da mesa.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Em andamento', { exact: true })).toBeVisible();
  const after = await campaignMetadata(page, id);
  expect(after).toMatchObject({
    id: before!.id,
    ownerId: before!.ownerId,
    createdAt: before!.createdAt,
    provenance: before!.provenance,
    revision: before!.revision + 1,
  });
  expect(after!.updatedAt).toBeGreaterThan(before!.updatedAt);
  await expectNoHorizontalOverflow(page, 'campanha-confirmada-320');
  await capture(page, testInfo, 'gestao-campanha-confirmada-320');
});

test('arquivar e restaurar para estado explícito conservam descrição e checklist após reload', async ({
  page,
}) => {
  await openCampaign(page);
  const panel = page.getByRole('region', { name: 'Preparação do projeto', exact: true });
  await panel.getByRole('button', { name: 'Adicionar tarefa', exact: true }).click();
  const task = page.getByRole('dialog', { name: 'Nova tarefa de preparação', exact: true });
  await task.getByLabel('Título da tarefa', { exact: true }).fill('Preparar mapas particulares');
  await task.getByRole('button', { name: 'Salvar tarefa', exact: true }).click();
  await expect(task).toHaveCount(0);
  await panel
    .getByRole('button', { name: 'Concluir tarefa Preparar mapas particulares', exact: true })
    .click();
  await expect(panel.getByText('1 de 1 tarefas concluídas', { exact: true })).toBeVisible();
  let dialog = await edit(page);
  await chooseDropdown(dialog.getByLabel('Estado da campanha', { exact: true }), 'Arquivada');
  await expect(dialog.getByText(/escolha explicitamente o estado da campanha/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Arquivada', { exact: true })).toBeVisible();
  await expect(panel.getByText('1 de 1 tarefas concluídas', { exact: true })).toBeVisible();
  dialog = await edit(page);
  await chooseDropdown(dialog.getByLabel('Estado da campanha', { exact: true }), 'Em andamento');
  await dialog.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Em andamento', { exact: true })).toBeVisible();
  await expect(page.getByText(originalDescription, { exact: true })).toBeVisible();
  await expect(panel.getByText('1 de 1 tarefas concluídas', { exact: true })).toBeVisible();
  await expect(
    panel.getByRole('button', { name: 'Reabrir tarefa Preparar mapas particulares', exact: true }),
  ).toHaveCount(1);
});

test('vínculo organizacional preserva nome do universo no reload e permite desvincular sem apagar descrição', async ({
  page,
}) => {
  await page.goto('/universes');
  await page.getByRole('button', { name: 'Criar primeiro universo', exact: true }).click();
  await page.getByLabel('Nome do universo', { exact: true }).fill('Ilhas da campanha particular');
  await page
    .getByLabel('Descrição do universo', { exact: true })
    .fill('Universo organizacional próprio.');
  await page.getByRole('button', { name: 'Salvar universo', exact: true }).click();
  await expect(page.getByLabel('Nome do universo', { exact: true })).toHaveCount(0);
  await openCampaign(page);
  let dialog = await edit(page);
  await chooseDropdown(
    dialog.getByLabel('Universo compartilhado', { exact: true }),
    'Ilhas da campanha particular',
  );
  await dialog.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const link = page.getByRole('link', { name: 'Abrir universo vinculado', exact: true });
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  expect(href).toMatch(/^\/universes\/.+\/lore$/);
  await page.reload();
  await expect(link).toHaveAttribute('href', href!);
  dialog = await edit(page);
  await expect(dialog.getByLabel('Universo compartilhado', { exact: true })).toContainText(
    'Ilhas da campanha particular',
  );
  await expect(dialog.getByLabel('Descrição da campanha', { exact: true })).toHaveValue(
    originalDescription,
  );
  await chooseDropdown(
    dialog.getByLabel('Universo compartilhado', { exact: true }),
    'Sem universo',
  );
  await dialog.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(link).toHaveCount(0);
  await expect(
    page.getByText('Projeto independente, sem universo vinculado.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(originalDescription, { exact: true })).toBeVisible();
});

test('resposta perdida mantém pedido estável no reload e confirmação libera próxima revisão', async ({
  page,
}) => {
  await openCampaign(page);
  let dialog = await edit(page);
  await dialog.getByLabel('Título da campanha', { exact: true }).fill('Mesa com resposta perdida');
  await flag(page, 'writer.visual.campaign-lost-response', 'updateCampaign');
  await dialog.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Confirmar mesmo pedido', exact: true }),
  ).toBeEnabled();
  await expect(dialog.getByLabel('Título da campanha', { exact: true })).toBeDisabled();
  const preserved = await page.evaluate((key) => localStorage.getItem(key), pendingKey);
  expect(preserved).not.toBeNull();
  await dialog.getByRole('button', { name: 'Fechar e manter pedido', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Confirmar alterações pendentes', exact: true }),
  ).toBeVisible();
  page.once('dialog', (dialog) => {
    void dialog.accept();
  });
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Confirmar alterações pendentes', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), pendingKey)).toBe(preserved);
  await page.getByRole('button', { name: 'Confirmar alterações pendentes', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Editar campanha', exact: true });
  await expect(dialog.getByLabel('Título da campanha', { exact: true })).toHaveValue(
    'Mesa com resposta perdida',
  );
  await expect(dialog.getByLabel('Título da campanha', { exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Confirmar mesmo pedido', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Mesa com resposta perdida', exact: true, level: 1 }),
  ).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), pendingKey)).toBeNull();
  dialog = await edit(page);
  await dialog.getByLabel('Título da campanha', { exact: true }).fill('Próxima edição confirmada');
  await dialog.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Próxima edição confirmada', exact: true, level: 1 }),
  ).toBeVisible();
});

test('conflito conserva campos locais e exige descarte explícito antes de salvar nova base', async ({
  page,
}, testInfo) => {
  await openCampaign(page);
  const dialog = await edit(page);
  await dialog.getByLabel('Título da campanha', { exact: true }).fill('Título local preservado');
  await dialog
    .getByLabel('Descrição da campanha', { exact: true })
    .fill('Descrição local não reaplicada.');
  await flag(page, 'writer.visual.campaign-conflict', 'true');
  await dialog.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  const discard = dialog.getByRole('button', {
    name: 'Descartar alterações e carregar versão atual',
    exact: true,
  });
  await expect(discard).toBeVisible();
  await expect(dialog.getByLabel('Título da campanha', { exact: true })).toHaveValue(
    'Título local preservado',
  );
  await expect(dialog.getByLabel('Descrição da campanha', { exact: true })).toHaveValue(
    'Descrição local não reaplicada.',
  );
  await expect(
    dialog.getByRole('button', { name: 'Salvar alterações', exact: true }),
  ).toBeDisabled();
  await capture(page, testInfo, 'gestao-campanha-conflito');
  await discard.click();
  await expect(dialog.getByLabel('Título da campanha', { exact: true })).toHaveValue(
    'Campanha atualizada em outro dispositivo',
  );
  await expect(dialog.getByLabel('Descrição da campanha', { exact: true })).toHaveValue(
    originalDescription,
  );
  await expect(discard).toHaveCount(0);
  await dialog
    .getByLabel('Descrição da campanha', { exact: true })
    .fill('Descrição escolhida após conferir a base.');
  await dialog.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('heading', {
      name: 'Campanha atualizada em outro dispositivo',
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  await expect(
    page.getByText('Descrição escolhida após conferir a base.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Título local preservado', { exact: true })).toHaveCount(0);
});

test('troca de UID descarta resposta tardia e conserva pedido somente na conta original', async ({
  page,
}, testInfo) => {
  await openCampaign(page);
  let dialog = await edit(page);
  await dialog
    .getByLabel('Título da campanha', { exact: true })
    .fill('TÍTULO PRIVADO DA PRIMEIRA CONTA');
  await dialog
    .getByLabel('Descrição da campanha', { exact: true })
    .fill('NOTA PRIVADA DA PRIMEIRA CONTA');
  await flag(page, 'writer.visual.campaign-hold-response', 'updateCampaign');
  await dialog.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Confirmando…', exact: true })).toBeDisabled();
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('writer.visual.campaign-hold-response')))
    .toBeNull();
  const preserved = await page.evaluate((key) => localStorage.getItem(key), pendingKey);
  expect(preserved).not.toBeNull();
  await page.evaluate(() => {
    sessionStorage.setItem('writer.visual.account', 'second');
    window.dispatchEvent(new Event('writer.visual.auth-change'));
  });
  await expect(
    page.getByRole('heading', { name: 'Campanha indisponível', exact: true }),
  ).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('writer.visual.release-campaign')));
  await expect(page.getByRole('button', { name: /Outro Autor de Exemplo/ })).toBeVisible();
  await expect(page.getByText('TÍTULO PRIVADO DA PRIMEIRA CONTA', { exact: true })).toHaveCount(0);
  await expect(page.getByText('NOTA PRIVADA DA PRIMEIRA CONTA', { exact: true })).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), pendingKey)).toBe(preserved);
  expect(
    await page.evaluate(() =>
      localStorage.getItem(
        'writer:campaign-management:' +
          JSON.stringify(['visual-second-author', 'visual-campaign-1']),
      ),
    ),
  ).toBeNull();
  await capture(page, testInfo, 'gestao-campanha-conta-diferente');
  await page.evaluate(() => {
    sessionStorage.removeItem('writer.visual.account');
    window.dispatchEvent(new Event('writer.visual.auth-change'));
  });
  await expect(
    page.getByRole('button', { name: 'Confirmar alterações pendentes', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar alterações pendentes', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Editar campanha', exact: true });
  await dialog.getByRole('button', { name: 'Confirmar mesmo pedido', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'TÍTULO PRIVADO DA PRIMEIRA CONTA', exact: true, level: 1 }),
  ).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), pendingKey)).toBeNull();
});
