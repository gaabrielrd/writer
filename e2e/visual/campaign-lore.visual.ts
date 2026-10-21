import type { Locator, Page } from '@playwright/test';
import type { CampaignLoreOperation } from '../../src/features/campaign-lore/model/campaignLore';
import { chooseDropdown } from '../dropdown';
import {
  capture,
  expect,
  expectDialogWithinViewport,
  expectNoHorizontalOverflow,
  test,
} from './support';

const prefix = '/e2e/visual/fixtures/';
const recoveryPath = '/src/features/campaign-lore/services/campaignLoreRecovery.ts';
const text =
  '  Memória da mesa 🐉\nLinha com ação e café.\n<strong>texto literal</strong>\n  Fim preservado  ';
interface Source {
  campaignId: string;
  otherId: string;
  baseId: string;
  adventureId: string;
  worldId: string;
  otherWorldId: string;
  main: { sourceKey: string; name: string; entityId: string };
  target: { sourceKey: string; name: string; entityId: string };
  last: { sourceKey: string; name: string; entityId: string };
  baseHash: string;
}
interface Call {
  uid: string;
  method: string;
  campaignId: string;
  sourceKey?: string;
  operationId?: string;
  expectedRevision?: number;
  intent?: string;
}
async function calls(page: Page): Promise<Call[]> {
  return page.evaluate(
    () =>
      (
        JSON.parse(localStorage.getItem('writer.visual.campaign-lore') ?? '{"calls":[]}') as {
          calls: Call[];
        }
      ).calls,
  );
}
async function journal(page: Page, campaignId: string) {
  return page.evaluate(
    async ({ path, campaignId }) => {
      const api = (await import(
        path
      )) as typeof import('../../src/features/campaign-lore/services/campaignLoreRecovery');
      const op = await api.readLoreOperation('visual-author', campaignId);
      return op
        ? {
            phase: op.phase,
            operationId: op.header.operationId,
            action: op.action,
            revision: op.header.expectedRevision,
            sourceKey: op.header.sourceKey,
          }
        : null;
    },
    { path: recoveryPath, campaignId },
  );
}
async function privacy(page: Page, campaignId: string, sentinels: string[]) {
  return page.evaluate(
    async ({ path, campaignId, sentinels }) => {
      const api = (await import(
        path
      )) as typeof import('../../src/features/campaign-lore/services/campaignLoreRecovery');
      const op = await api.readLoreOperation('visual-author', campaignId);
      const storage = [localStorage, sessionStorage].flatMap((s) =>
        Object.keys(s)
          .filter((key) => !key.startsWith('writer.visual.'))
          .map((key) => s.getItem(key) ?? ''),
      );
      const strings = [
        ...storage,
        JSON.stringify(op),
        ...(op?.ciphertext ? [new TextDecoder().decode(op.ciphertext)] : []),
      ];
      return {
        noPlaintext: sentinels.every((value) => strings.every((row) => !row.includes(value))),
        noKeyField:
          !op ||
          !Object.keys(op).some((key) =>
            ['key', 'rawKey', 'entity', 'name', 'aliases', 'relations'].includes(key),
          ),
        binaryCipher:
          op?.phase === 'sealed'
            ? Object.prototype.toString.call(op.ciphertext) === '[object ArrayBuffer]'
            : true,
      };
    },
    { path: recoveryPath, campaignId, sentinels },
  );
}
const panel = (page: Page) =>
  page.getByRole('heading', { name: 'Lore da mesa', exact: true }).locator('..');
async function openCampaign(page: Page, id: string) {
  await page.goto('/campaigns/' + id);
  await expect(
    panel(page).getByRole('button', { name: 'Atualizar lore da mesa', exact: true }),
  ).toBeEnabled();
}
async function seed(page: Page, count = 2): Promise<Source> {
  await page.goto('/studio');
  return page.evaluate(
    async ({ prefix, count }) => {
      const load = <T>(file: string) => import(prefix + file + '.ts') as Promise<T>;
      const worlds = await load<typeof import('./fixtures/universeService')>('universeService'),
        adventures = await load<typeof import('./fixtures/adventureService')>('adventureService'),
        scenes = await load<typeof import('./fixtures/sceneService')>('sceneService'),
        lore = await load<typeof import('./fixtures/loreService')>('loreService'),
        captures =
          await load<typeof import('./fixtures/campaignBaseFixture')>('campaignBaseFixture'),
        hashes = await load<typeof import('./fixtures/sceneStore')>('sceneStore');
      const world = await worlds.createUniverse(
        { name: 'Universo da captura C2', description: 'Privado' },
        'visual-c2-world',
      );
      const otherWorld = await worlds.createUniverse(
        { name: 'Universo organizacional C2', description: 'Privado' },
        'visual-c2-other-world',
      );
      const adventure = await adventures.createAdventure({
        operationId: 'visual-c2-origin',
        title: 'Aventura das variantes particulares',
        synopsis: 'Origem congelada de duas mesas',
        universeId: world.id,
      });
      const entities: { id: string; name: string }[] = [];
      for (let i = 0; i < count; i++) {
        const entity = await lore.createLoreEntity(
          { kind: 'universe', id: world.id },
          {
            name: 'Ficha capturada ' + String(i).padStart(2, '0'),
            category: 'character',
            summary: 'Resumo capturado ' + i,
            details: 'Detalhe capturado ' + i,
            aliases: ['Alias capturado ' + i],
            structuredDetails: {
              appearance: 'Aparência capturada ' + i,
              personality: 'Personalidade capturada ' + i,
              history: 'História capturada ' + i,
              notes: 'Anotação capturada ' + i,
            },
          },
        );
        entities.push(entity);
        const scene = await scenes.createScene({
          target: { kind: 'adventure', id: adventure.id },
          operationId: 'visual-c2-scene-' + i,
          parentId: null,
          title: 'Cena da ficha ' + i,
          content: '<p>Fonte autoral ' + i + '</p>',
        });
        await scenes.setSceneReference({
          target: { kind: 'adventure', id: adventure.id },
          sceneId: scene.scene.id,
          operationId: 'visual-c2-ref-' + i,
          expectedRevision: scene.scene.revision,
          reference: {
            kind: 'universe',
            scopeId: world.id,
            entityId: entity.id.split(':').at(-1)!,
          },
        });
      }
      async function capture(n: string) {
        const source = await captures.getCampaignCaptureSource({ adventureId: adventure.id });
        let p = await captures.startCampaignCapture({
          operationId: 'visual-c2-start-' + n,
          adventureId: adventure.id,
          expectedSourceToken: source.sourceToken,
          title: 'Mesa ' + n + ' das variantes',
          description: 'Consequências independentes',
          universeId: world.id,
        });
        for (let i = 0; p.state !== 'prepared' && i < 40; i++)
          p = await captures.advanceCampaignCapture({
            captureId: p.captureId,
            operationId: 'visual-c2-step-' + n + i,
            expectedCheckpoint: p.checkpoint,
          });
        if (p.state !== 'prepared') throw Error('Preparação incompleta');
        const result = await captures.activateCampaignCapture({
          captureId: p.captureId,
          operationId: 'visual-c2-activate-' + n,
          expectedCheckpoint: p.checkpoint,
        });
        if (result.kind !== 'activated') throw Error('Campanha não ativada');
        return result.campaign;
      }
      const first = await capture('A'),
        second = await capture('B'),
        metadata = await captures.fixtureCampaignBaseLoreMetadata(first.id);
      const rows = metadata.items
        .filter((item) => item.name)
        .sort((a, b) => a.sourceKey.localeCompare(b.sourceKey));
      const identify = (row: (typeof rows)[number]) => ({
        sourceKey: row.sourceKey,
        name: row.name!,
        entityId: entities.find((entity) => entity.name === row.name)!.id,
      });
      return {
        campaignId: first.id,
        otherId: second.id,
        baseId: first.activeBaseId!,
        adventureId: adventure.id,
        worldId: world.id,
        otherWorldId: otherWorld.id,
        main: identify(rows[0]),
        target: identify(rows[1]),
        last: identify(rows.at(-1)!),
        baseHash: await hashes.fixtureContentHash(
          sessionStorage.getItem('writer.visual.campaign-bases')!,
        ),
      };
    },
    { prefix, count },
  );
}
async function openFicha(page: Page, name: string) {
  await panel(page).getByRole('button', { name, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar lore da mesa', exact: true });
  await expect(dialog.getByLabel('Nome da ficha', { exact: true })).toHaveValue(name);
  return dialog;
}
async function idleAfter(
  page: Page,
  source: Source,
  method: string,
  trigger: () => Promise<unknown>,
) {
  const before = (await calls(page)).filter((call) => call.method === method).length;
  await trigger();
  await expect
    .poll(async () => (await calls(page)).filter((call) => call.method === method).length)
    .toBeGreaterThan(before);
  await expect.poll(() => journal(page, source.campaignId)).toBeNull();
}
async function save(page: Page, source: Source, dialog: Locator) {
  await idleAfter(page, source, 'saveCampaignLoreVariant', () =>
    dialog.getByRole('button', { name: 'Salvar variante da mesa', exact: true }).click(),
  );
}
async function close(page: Page) {
  await page
    .getByRole('dialog', { name: 'Editar lore da mesa', exact: true })
    .getByRole('button', { name: 'Fechar ficha', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function confirm(page: Page, source: Source, kind: 'remove' | 'restore' | 'discard') {
  const labels = {
    remove: {
      button: 'Retirar ficha da mesa',
      dialog: 'Retirar ficha desta mesa?',
      confirm: 'Confirmar retirada',
      method: 'removeCampaignLore',
    },
    restore: {
      button: 'Restaurar ficha',
      dialog: 'Restaurar ficha?',
      confirm: 'Confirmar restauração',
      method: 'restoreCampaignLore',
    },
    discard: {
      button: 'Descartar variante',
      dialog: 'Descartar variante inteira?',
      confirm: 'Confirmar descarte',
      method: 'discardCampaignLoreVariant',
    },
  }[kind];
  await page
    .getByRole('dialog', {
      name: kind === 'restore' ? 'Ficha retirada' : 'Editar lore da mesa',
      exact: true,
    })
    .getByRole('button', { name: labels.button, exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: labels.dialog, exact: true });
  await idleAfter(page, source, labels.method, () =>
    dialog.getByRole('button', { name: labels.confirm, exact: true }).click(),
  );
  await expect(dialog).toHaveCount(0);
}
async function flag(page: Page, key: string, value: string) {
  await page.evaluate(({ key, value }) => sessionStorage.setItem(key, value), { key, value });
}
async function recover(page: Page, source: Source) {
  await panel(page).getByRole('button', { name: 'Recuperar pedido de lore', exact: true }).click();
  await expect.poll(() => journal(page, source.campaignId)).toBeNull();
}
async function release(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('writer.visual.release-campaign-lore')));
}

test('variante inteira isola mesas e original e retirar restaurar descartar conservam revisões em 320px', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const source = await seed(page);
  await openCampaign(page, source.campaignId);
  let dialog = await openFicha(page, source.main.name);
  await dialog.getByLabel('Nome da ficha', { exact: true }).fill('Nome cancelado');
  await dialog.getByRole('button', { name: 'Fechar ficha', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(
    panel(page).getByRole('button', { name: source.main.name, exact: true }),
  ).toBeFocused();
  dialog = await openFicha(page, source.main.name);
  await dialog.getByLabel('Nome da ficha', { exact: true }).focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.insertText('Guardiã particular da mesa A');
  await page.keyboard.press('Tab');
  await expect(dialog.getByLabel('Categoria da ficha', { exact: true })).toBeFocused();
  await chooseDropdown(dialog.getByLabel('Categoria da ficha', { exact: true }), 'Local');
  await dialog.getByLabel('Resumo da ficha', { exact: true }).fill('Resumo exclusivo da mesa A');
  await dialog.getByRole('button', { name: 'Remover outro nome 1', exact: true }).click();
  await dialog.getByLabel('Detalhes da ficha', { exact: true }).fill(text);
  await dialog.getByLabel('Aparência', { exact: true }).fill('');
  await dialog.getByLabel('Personalidade', { exact: true }).fill('Voz particular 🐉');
  await dialog.getByLabel('História', { exact: true }).fill('');
  await dialog.getByLabel('Anotações da ficha', { exact: true }).fill('Apenas desta mesa.');
  await dialog.getByLabel('Nome da ficha', { exact: true }).scrollIntoViewIfNeeded();
  await expectDialogWithinViewport(page);
  await capture(page, info, 'lore-variante-formulario-320');
  await save(page, source, dialog);
  await expect(dialog.getByLabel('Aparência', { exact: true })).toHaveValue('');
  await expect(dialog.getByLabel('Detalhes da ficha', { exact: true })).toHaveValue(text);
  await close(page);
  await page.reload();
  dialog = await openFicha(page, 'Guardiã particular da mesa A');
  await expect(dialog.getByLabel('Detalhes da ficha', { exact: true })).toHaveValue(text);
  await expect(dialog.getByLabel('História', { exact: true })).toHaveValue('');
  await expect(dialog.getByLabel('Outro nome 1', { exact: true })).toHaveCount(0);
  await close(page);
  const unchanged = await page.evaluate(
    async ({ prefix, source }) => {
      const lore = (await import(
        prefix + 'loreService.ts'
      )) as typeof import('./fixtures/loreService');
      const hashes = (await import(
        prefix + 'sceneStore.ts'
      )) as typeof import('./fixtures/sceneStore');
      return {
        entity: await lore.getLoreEntity(
          { kind: 'universe', id: source.worldId },
          source.main.entityId,
        ),
        baseHash: await hashes.fixtureContentHash(
          sessionStorage.getItem('writer.visual.campaign-bases')!,
        ),
      };
    },
    { prefix, source },
  );
  expect(unchanged.entity?.name).toBe(source.main.name);
  expect(unchanged.baseHash).toBe(source.baseHash);
  await openCampaign(page, source.otherId);
  dialog = await openFicha(page, source.main.name);
  await expect(dialog.getByLabel('Aparência', { exact: true })).not.toHaveValue('');
  await expect(dialog.getByLabel('Detalhes da ficha', { exact: true })).not.toHaveValue(text);
  await close(page);
  await openCampaign(page, source.campaignId);
  await page.getByRole('button', { name: 'Editar campanha', exact: true }).click();
  const metadata = page.getByRole('dialog', { name: 'Editar campanha', exact: true });
  await chooseDropdown(
    metadata.getByLabel('Universo compartilhado', { exact: true }),
    'Universo organizacional C2',
  );
  await metadata.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(metadata).toHaveCount(0);
  dialog = await openFicha(page, 'Guardiã particular da mesa A');
  await expect(dialog.getByLabel('Detalhes da ficha', { exact: true })).toHaveValue(text);
  await confirm(page, source, 'remove');
  await expect(dialog).toHaveCount(0);
  await chooseDropdown(
    panel(page).getByLabel('Fichas do lore da mesa', { exact: true }),
    'Retiradas',
  );
  await panel(page)
    .getByRole('button', { name: 'Guardiã particular da mesa A', exact: true })
    .click();
  const removed = page.getByRole('dialog', { name: 'Ficha retirada', exact: true });
  await expect(removed.getByRole('textbox')).toHaveCount(0);
  await confirm(page, source, 'restore');
  dialog = page.getByRole('dialog', { name: 'Editar lore da mesa', exact: true });
  await expect(dialog.getByLabel('Detalhes da ficha', { exact: true })).toHaveValue(text);
  await expect(dialog.getByLabel('Aparência', { exact: true })).toHaveValue('');
  await page.evaluate(
    async ({ prefix, source }) => {
      const lore = (await import(
        prefix + 'loreService.ts'
      )) as typeof import('./fixtures/loreService');
      await lore.updateLoreEntity({ kind: 'universe', id: source.worldId }, source.main.entityId, {
        name: 'Nome vivo posterior',
        details: 'TEXTO VIVO POSTERIOR',
      });
    },
    { prefix, source },
  );
  await confirm(page, source, 'discard');
  await expect(dialog.getByLabel('Nome da ficha', { exact: true })).toHaveValue(source.main.name);
  await expect(dialog.getByLabel('Detalhes da ficha', { exact: true })).not.toHaveValue(
    'TEXTO VIVO POSTERIOR',
  );
  await close(page);
  await chooseDropdown(panel(page).getByLabel('Fichas do lore da mesa', { exact: true }), 'Ativas');
  await openFicha(page, source.target.name);
  await confirm(page, source, 'remove');
  await chooseDropdown(
    panel(page).getByLabel('Fichas do lore da mesa', { exact: true }),
    'Retiradas',
  );
  await panel(page).getByRole('button', { name: source.target.name, exact: true }).click();
  await confirm(page, source, 'restore');
  dialog = page.getByRole('dialog', { name: 'Editar lore da mesa', exact: true });
  await expect(dialog.getByLabel('Nome da ficha', { exact: true })).toHaveValue(source.target.name);
  await close(page);
  await chooseDropdown(panel(page).getByLabel('Fichas do lore da mesa', { exact: true }), 'Ativas');
  await expectNoHorizontalOverflow(page, 'lore-painel-320');
  await panel(page).scrollIntoViewIfNeeded();
  await capture(page, info, 'lore-variante-painel-320');
  const modes = await page.evaluate(({ campaignId }) => {
    const data = JSON.parse(localStorage.getItem('writer.visual.campaign-lore')!) as {
      projects: Record<
        string,
        { overlays: Record<string, { revision: number; mode: string; entity?: unknown }> }
      >;
    };
    return Object.values(data.projects[JSON.stringify(['visual-author', campaignId])].overlays).map(
      ({ revision, mode, entity }) => ({ revision, mode, hasBody: entity !== undefined }),
    );
  }, source);
  expect(modes).toEqual(
    expect.arrayContaining([
      { revision: 4, mode: 'base', hasBody: false },
      { revision: 2, mode: 'base', hasBody: false },
    ]),
  );
});

test('lore efetivo e seletor paginados usam identidade capturada e removem relações indisponíveis', async ({
  page,
}) => {
  const source = await seed(page, 28);
  await openCampaign(page, source.campaignId);
  let dialog = await openFicha(page, source.main.name);
  await dialog.getByRole('button', { name: 'Selecionar ficha para relação', exact: true }).click();
  const picker = dialog.getByLabel('Fichas para relação', { exact: true });
  await expect(picker.getByRole('button', { name: source.last.name, exact: true })).toHaveCount(0);
  await picker
    .getByRole('button', { name: 'Carregar mais fichas para relação', exact: true })
    .click();
  await picker.getByRole('button', { name: source.last.name, exact: true }).click();
  await dialog.getByLabel('Tipo da relação 1', { exact: true }).fill('Conhece na mesa');
  await dialog
    .getByLabel('Descrição da relação 1', { exact: true })
    .fill('Descrição particular da relação');
  await save(page, source, dialog);
  await close(page);
  await panel(page)
    .getByRole('button', { name: 'Carregar mais lore da mesa', exact: true })
    .click();
  dialog = await openFicha(page, source.last.name);
  await dialog.getByLabel('Nome da ficha', { exact: true }).fill('Alvo efetivo da mesa');
  await save(page, source, dialog);
  await close(page);
  dialog = await openFicha(page, source.main.name);
  await expect(dialog.getByText('Alvo efetivo da mesa', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Descrição da relação 1', { exact: true })).toHaveValue(
    'Descrição particular da relação',
  );
  await close(page);
  await page.evaluate(
    async ({ prefix, source }) => {
      const api = (await import(
        prefix + 'campaignLoreFixture.ts'
      )) as typeof import('./fixtures/campaignLoreFixture');
      const list = await api.listCampaignLore({
        campaignId: source.campaignId,
        baseId: source.baseId,
      });
      await api.removeCampaignLore({
        campaignId: source.campaignId,
        baseId: source.baseId,
        campaignToken: list.campaignToken,
        sourceKey: source.target.sourceKey,
        operationId: 'visual-c2-remote-removal',
        expectedRevision: 0,
      });
    },
    { prefix, source },
  );
  await panel(page)
    .getByRole('button', { name: 'Carregar mais lore da mesa', exact: true })
    .click();
  await expect(panel(page).getByText('A lista mudou. Recarregue.', { exact: true })).toBeVisible();
  await expect(
    panel(page).getByRole('button', { name: source.main.name, exact: true }),
  ).toHaveCount(0);
  await panel(page).getByRole('button', { name: 'Atualizar lore da mesa', exact: true }).click();
  await expect(
    panel(page).getByRole('button', { name: source.main.name, exact: true }),
  ).toBeEnabled();
  await page.evaluate(
    async ({ prefix, source }) => {
      const api = (await import(
        prefix + 'campaignLoreFixture.ts'
      )) as typeof import('./fixtures/campaignLoreFixture');
      const list = await api.listCampaignLore({
        campaignId: source.campaignId,
        baseId: source.baseId,
      });
      await api.removeCampaignLore({
        campaignId: source.campaignId,
        baseId: source.baseId,
        campaignToken: list.campaignToken,
        sourceKey: source.last.sourceKey,
        operationId: 'visual-c2-related-removal',
        expectedRevision: 1,
      });
    },
    { prefix, source },
  );
  dialog = await openFicha(page, source.main.name);
  await expect(dialog.getByLabel('Tipo da relação 1', { exact: true })).toHaveCount(0);
  await expect(dialog.getByText('Alvo efetivo da mesa', { exact: true })).toHaveCount(0);
  await close(page);
  await chooseDropdown(
    panel(page).getByLabel('Fichas do lore da mesa', { exact: true }),
    'Retiradas',
  );
  await panel(page)
    .getByRole('button', { name: 'Carregar mais lore da mesa', exact: true })
    .click();
  await panel(page).getByRole('button', { name: 'Alvo efetivo da mesa', exact: true }).click();
  await confirm(page, source, 'restore');
  await close(page);
  await chooseDropdown(panel(page).getByLabel('Fichas do lore da mesa', { exact: true }), 'Ativas');
  dialog = await openFicha(page, source.main.name);
  await expect(dialog.getByText('Alvo efetivo da mesa', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Descrição da relação 1', { exact: true })).toHaveValue(
    'Descrição particular da relação',
  );
});

// Arrange only variants already proven through the preceding UI journeys. This uses the
// transport and real encryption; it never inserts a journal or bypasses the controller under test.
async function seedConfirmedVariants(
  page: Page,
  source: Source,
  variants: { name: string; details: string }[],
) {
  await page.evaluate(
    async ({ prefix, source, variants }) => {
      const api = (await import(
        prefix + 'campaignLoreFixture.ts'
      )) as typeof import('./fixtures/campaignLoreFixture');
      const cryptoPath = '/src/features/campaign-lore/services/campaignLoreCrypto.ts';
      const crypto = (await import(
        cryptoPath
      )) as typeof import('../../src/features/campaign-lore/services/campaignLoreCrypto');
      const servicePath = '/src/features/campaign-lore/services/campaignLoreService.ts';
      const service = (await import(
        servicePath
      )) as typeof import('../../src/features/campaign-lore/services/campaignLoreService');
      const list = await api.listCampaignLore({
        campaignId: source.campaignId,
        baseId: source.baseId,
      });
      const scope = {
        campaignId: source.campaignId,
        baseId: source.baseId,
        campaignToken: list.campaignToken,
      };
      for (const [index, variant] of variants.entries()) {
        const current = await api.getCampaignLore({
          ...scope,
          sourceKey: source.main.sourceKey,
        });
        if (!current.item?.entity) throw Error('Missing confirmed variant precondition');
        const entity = { ...service.toEntityInput(current.item.entity), ...variant };
        const header = {
          ...scope,
          sourceKey: source.main.sourceKey,
          operationId: 'visual-c2-confirmed-precondition-' + index,
          expectedRevision: current.item.revision,
        };
        const relatedSourceKeys = service.relatedKeys(entity);
        const prepared = await api.prepareCampaignLoreVariant({ ...header, relatedSourceKeys });
        const operation: CampaignLoreOperation = {
          schemaVersion: 1,
          ownerId: prepared.ownerId,
          header,
          action: 'save',
          relatedSourceKeys,
          phase: 'sealed',
        };
        const sealed = await crypto.sealLore(operation, entity, prepared.key);
        await api.saveCampaignLoreVariant({
          ...header,
          relatedSourceKeys,
          sealed: crypto.sealedRequest({ ...operation, ...sealed }),
        });
        const receipt = await api.resolveCampaignLoreOperation({
          ...header,
          action: 'save',
          relatedSourceKeys,
          intent: 'confirm',
        });
        if (receipt.state !== 'committed' || receipt.revision !== index + 1)
          throw Error('Variant precondition was not confirmed at its original revision');
      }
    },
    { prefix, source, variants },
  );
}

test('envio ausente preserva journal cifrado e recupera o texto depois de recarregar', async ({
  page,
}) => {
  const source = await seed(page);
  await openCampaign(page, source.campaignId);
  let dialog = await openFicha(page, source.main.name);
  await dialog.getByLabel('Nome da ficha', { exact: true }).fill('Sentinela cifrada da mesa');
  await dialog.getByLabel('Detalhes da ficha', { exact: true }).fill(text);
  await flag(page, 'writer.visual.campaign-lore-before-first-send', 'saveCampaignLoreVariant');
  await dialog.getByRole('button', { name: 'Salvar variante da mesa', exact: true }).click();
  await expect.poll(async () => (await journal(page, source.campaignId))?.phase).toBe('sealed');
  await expect(
    dialog.getByText('O transporte não recebeu o pedido.', { exact: true }),
  ).toBeVisible();
  expect((await calls(page)).filter((c) => c.method === 'saveCampaignLoreVariant')).toHaveLength(0);
  expect(await privacy(page, source.campaignId, ['Sentinela cifrada da mesa', text])).toEqual({
    noPlaintext: true,
    noKeyField: true,
    binaryCipher: true,
  });
  const firstOp = await journal(page, source.campaignId);
  await page.reload();
  expect(await journal(page, source.campaignId)).toEqual(firstOp);
  await recover(page, source);
  dialog = page.getByRole('dialog', { name: 'Editar lore da mesa', exact: true });
  await expect(dialog.getByLabel('Detalhes da ficha', { exact: true })).toHaveValue(text);
  await close(page);
});

test('commit incerto confirma recibo e recupera depois de recarregar sem preparar novamente', async ({
  page,
}) => {
  const source = await seed(page);
  await seedConfirmedVariants(page, source, [{ name: 'Sentinela cifrada da mesa', details: text }]);
  await openCampaign(page, source.campaignId);
  const dialog = await openFicha(page, 'Sentinela cifrada da mesa');
  const edited = text + '\nRevisão confirmada por recibo.';
  await dialog.getByLabel('Detalhes da ficha', { exact: true }).fill(edited);
  await flag(page, 'writer.visual.campaign-lore-lost-response', 'saveCampaignLoreVariant');
  await dialog.getByRole('button', { name: 'Salvar variante da mesa', exact: true }).click();
  await expect(
    dialog.getByText('A resposta se perdeu. Repita o mesmo pedido.', { exact: true }),
  ).toBeVisible();
  await close(page);
  await flag(page, 'writer.visual.campaign-lore-lost-response', 'resolveCampaignLoreOperation');
  await panel(page).getByRole('button', { name: 'Recuperar pedido de lore', exact: true }).click();
  await expect.poll(async () => (await journal(page, source.campaignId))?.phase).toBe('confirmed');
  await expect(
    page
      .getByRole('dialog', { name: 'Editar lore da mesa', exact: true })
      .getByText('A resposta se perdeu. Repita o mesmo pedido.', { exact: true }),
  ).toBeVisible();
  const preparedCount = (await calls(page)).filter(
    (c) => c.method === 'prepareCampaignLoreVariant',
  ).length;
  await page.reload();
  await recover(page, source);
  expect((await calls(page)).filter((c) => c.method === 'prepareCampaignLoreVariant')).toHaveLength(
    preparedCount,
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('duas abas reservam um envio com Web Lock real e preservam ambos os rascunhos', async ({
  page,
  context,
}) => {
  const source = await seed(page);
  const edited = text + '\nRevisão confirmada por recibo.';
  await seedConfirmedVariants(page, source, [
    { name: 'Sentinela cifrada da mesa', details: text },
    { name: 'Sentinela cifrada da mesa', details: edited },
  ]);
  await openCampaign(page, source.campaignId);
  const otherEvent = context.waitForEvent('page');
  await page.evaluate(() => {
    window.open(location.href, '_blank');
  });
  const other = await otherEvent;
  await expect(
    panel(other).getByRole('button', { name: 'Sentinela cifrada da mesa', exact: true }),
  ).toBeEnabled();
  const a = await openFicha(page, 'Sentinela cifrada da mesa'),
    b = await openFicha(other, 'Sentinela cifrada da mesa');
  await a.getByLabel('Nome da ficha', { exact: true }).fill('Rascunho da aba A');
  await b.getByLabel('Nome da ficha', { exact: true }).fill('Rascunho da aba B');
  for (const tab of [page, other])
    await flag(tab, 'writer.visual.campaign-lore-hold-response', 'saveCampaignLoreVariant');
  const lock = 'writer.campaign-lore:' + JSON.stringify(['visual-author', source.campaignId]);
  await page.evaluate((lock) => {
    void navigator.locks.request(
      lock,
      () =>
        new Promise<void>((resolve) =>
          window.addEventListener('writer.visual.release-test-lock', () => resolve(), {
            once: true,
          }),
        ),
    );
  }, lock);
  await expect
    .poll(() =>
      page.evaluate(
        async (lock) => (await navigator.locks.query()).held?.some((item) => item.name === lock),
        lock,
      ),
    )
    .toBe(true);
  const before = (await calls(page)).filter((c) => c.method === 'saveCampaignLoreVariant').length;
  await a.getByRole('button', { name: 'Salvar variante da mesa', exact: true }).click();
  await b.getByRole('button', { name: 'Salvar variante da mesa', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('writer.visual.release-test-lock')));
  await expect
    .poll(
      async () => (await calls(page)).filter((c) => c.method === 'saveCampaignLoreVariant').length,
    )
    .toBe(before + 1);
  await expect.poll(async () => (await journal(page, source.campaignId))?.phase).toBe('sealed');
  await expect(a.getByLabel('Nome da ficha', { exact: true })).toHaveValue('Rascunho da aba A');
  await expect(b.getByLabel('Nome da ficha', { exact: true })).toHaveValue('Rascunho da aba B');
  await release(page);
  await release(other);
  await expect.poll(() => journal(page, source.campaignId)).toBeNull();
  await expect(a.getByLabel('Nome da ficha', { exact: true })).toHaveValue('Rascunho da aba A');
  await expect(b.getByLabel('Nome da ficha', { exact: true })).toHaveValue('Rascunho da aba B');
  await close(page);
  await close(other);
  await other.close();
  await page.reload();
  const winningName = await panel(page)
    .getByRole('button', { name: /^Rascunho da aba [AB]$/ })
    .textContent();
  expect(winningName).not.toBeNull();
});

test('conta trocada rejeita resposta tardia e preserva a recuperação cifrada da conta original', async ({
  page,
}) => {
  const source = await seed(page);
  const edited = text + '\nRevisão confirmada por recibo.';
  await seedConfirmedVariants(page, source, [
    { name: 'Sentinela cifrada da mesa', details: text },
    { name: 'Sentinela cifrada da mesa', details: edited },
    { name: 'Rascunho da aba A', details: edited },
  ]);
  await openCampaign(page, source.campaignId);
  const winningName = await panel(page)
    .getByRole('button', { name: /^Rascunho da aba [AB]$/ })
    .textContent();
  expect(winningName).not.toBeNull();
  let dialog = await openFicha(page, winningName!);
  await dialog
    .getByLabel('Detalhes da ficha', { exact: true })
    .fill('TEXTO DERIVADO DA PRIMEIRA CONTA');
  await flag(page, 'writer.visual.campaign-lore-hold-response', 'saveCampaignLoreVariant');
  await dialog.getByRole('button', { name: 'Salvar variante da mesa', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => sessionStorage.getItem('writer.visual.campaign-lore-hold-response')),
    )
    .toBeNull();
  const old = await journal(page, source.campaignId);
  expect(old?.phase).toBe('sealed');
  await page.evaluate(() => {
    sessionStorage.setItem('writer.visual.account', 'second');
    window.dispatchEvent(new Event('writer.visual.auth-change'));
  });
  await expect(
    page.getByRole('heading', { name: 'Campanha indisponível', exact: true }),
  ).toBeVisible();
  await release(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await journal(page, source.campaignId)).toEqual(old);
  await expect(page.getByText('TEXTO DERIVADO DA PRIMEIRA CONTA', { exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    sessionStorage.removeItem('writer.visual.account');
    window.dispatchEvent(new Event('writer.visual.auth-change'));
  });
  await recover(page, source);
  dialog = page.getByRole('dialog', { name: 'Editar lore da mesa', exact: true });
  await expect(dialog.getByLabel('Detalhes da ficha', { exact: true })).toHaveValue(
    'TEXTO DERIVADO DA PRIMEIRA CONTA',
  );
  expect(await privacy(page, source.campaignId, ['TEXTO DERIVADO DA PRIMEIRA CONTA'])).toEqual({
    noPlaintext: true,
    noKeyField: true,
    binaryCipher: true,
  });
});

test('revogação do alvo e da origem bloqueia chave e plaintext mas preserva notas próprias e encerramento', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const source = await seed(page);
  await page.evaluate(
    async ({ prefix, source }) => {
      const notes = (await import(
        prefix + 'campaignNotesFixture.ts'
      )) as typeof import('./fixtures/campaignNotesFixture');
      const first = await notes.listCampaignNotes({ campaignId: source.campaignId });
      await notes.saveCampaignNote({
        campaignId: source.campaignId,
        campaignToken: first.campaignToken,
        noteId: 'visual-c2-own-note',
        operationId: 'visual-c2-own-note',
        expectedRevision: 0,
        title: 'Nota própria preservada',
        content: 'Texto autoral independente da mesa.',
      });
    },
    { prefix, source },
  );
  await openCampaign(page, source.campaignId);
  const dialog = await openFicha(page, source.main.name);
  await dialog.getByRole('button', { name: 'Selecionar ficha para relação', exact: true }).click();
  await dialog
    .getByLabel('Fichas para relação', { exact: true })
    .getByRole('button', { name: source.target.name, exact: true })
    .click();
  await dialog.getByLabel('Tipo da relação 1', { exact: true }).fill('Relação particular');
  await dialog
    .getByLabel('Descrição da relação 1', { exact: true })
    .fill('SEGREDO DERIVADO DO ALVO REVOGADO');
  await flag(page, 'writer.visual.campaign-lore-before-first-send', 'saveCampaignLoreVariant');
  await dialog.getByRole('button', { name: 'Salvar variante da mesa', exact: true }).click();
  await expect(
    dialog.getByText('O transporte não recebeu o pedido.', { exact: true }),
  ).toBeVisible();
  await close(page);
  await page.evaluate(
    async ({ prefix, source }) => {
      const lore = (await import(
        prefix + 'loreService.ts'
      )) as typeof import('./fixtures/loreService');
      await lore.deleteLoreEntity({ kind: 'universe', id: source.worldId }, source.target.entityId);
    },
    { prefix, source },
  );
  const keyCount = (await calls(page)).filter((c) => c.method === 'key-delivered').length;
  await page.addInitScript(() => {
    Reflect.set(window, 'writerVisualDecryptCount', 0);
    const original = crypto.subtle.decrypt.bind(crypto.subtle);
    Object.defineProperty(crypto.subtle, 'decrypt', {
      value: (...args: Parameters<SubtleCrypto['decrypt']>) => {
        Reflect.set(
          window,
          'writerVisualDecryptCount',
          Number(Reflect.get(window, 'writerVisualDecryptCount')) + 1,
        );
        return original(...args);
      },
    });
  });
  await page.reload();
  await panel(page).getByRole('button', { name: 'Recuperar pedido de lore', exact: true }).click();
  await expect(panel(page).getByText('Ficha indisponível.', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await calls(page)).filter((c) => c.method === 'key-delivered')).toHaveLength(keyCount);
  expect(await page.evaluate(() => Number(Reflect.get(window, 'writerVisualDecryptCount')))).toBe(
    0,
  );
  expect((await journal(page, source.campaignId))?.phase).toBe('sealed');
  expect(await privacy(page, source.campaignId, ['SEGREDO DERIVADO DO ALVO REVOGADO'])).toEqual({
    noPlaintext: true,
    noKeyField: true,
    binaryCipher: true,
  });
  await page.evaluate(
    async ({ prefix, source }) => {
      const store = (await import(
        prefix + 'studioStore.ts'
      )) as typeof import('./fixtures/studioStore');
      store.fixturePatchProject('adventure', source.adventureId, { deleting: true } as never);
    },
    { prefix, source },
  );
  await page.reload();
  await expect(panel(page).getByText('Aventura indisponível.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Nota própria preservada', exact: true }).click();
  const note = page.getByRole('dialog', { name: 'Editar nota própria', exact: true });
  await expect(note.getByLabel('Texto da nota', { exact: true })).toHaveValue(
    'Texto autoral independente da mesa.',
  );
  await note
    .getByLabel('Texto da nota', { exact: true })
    .fill('Consequência autoral após revogação.');
  await note.getByRole('button', { name: 'Salvar nota', exact: true }).click();
  await expect(note.getByRole('button', { name: 'Salvar nota', exact: true })).toBeDisabled();
  await note.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Nota própria preservada', exact: true }).click();
  await expect(note.getByLabel('Texto da nota', { exact: true })).toHaveValue(
    'Consequência autoral após revogação.',
  );
  await note.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await panel(page)
    .getByRole('button', { name: 'Encerrar pedido sem recuperar texto', exact: true })
    .click();
  const ending = page.getByRole('dialog', { name: 'Encerrar recuperação de lore?', exact: true });
  await ending.getByRole('button', { name: 'Confirmar encerramento', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => journal(page, source.campaignId)).toBeNull();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await calls(page)).filter((c) => c.method === 'key-delivered')).toHaveLength(keyCount);
  expect(await page.evaluate(() => Number(Reflect.get(window, 'writerVisualDecryptCount')))).toBe(
    0,
  );
  await expect(page.getByText('SEGREDO DERIVADO DO ALVO REVOGADO', { exact: true })).toHaveCount(0);
  await expectNoHorizontalOverflow(page, 'lore-revogado-notas-preservadas-320');
});
