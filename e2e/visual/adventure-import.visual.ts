import JSZip from 'jszip';
import type { Page } from '@playwright/test';
import { capture, expect, expectDialogWithinViewport, test } from './support';
import type { LocalImportRecord } from '../../src/features/adventure-import/model/adventureImport';

const fixturePath = '/e2e/visual/fixtures/adventureImportFixture.ts';
const recoveryPath = '/src/features/adventure-import/services/adventureImportRecovery.ts';
const servicePath = '/src/features/adventure-import/services/adventureImportService.ts';
const prefix = '/e2e/visual/fixtures/';
const privateText = 'MEMORIA CONFIRMADA PRIVADA 🐉';
async function docx() {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/_rels/document.xml.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
  );
  zip.file(
    'word/styles.xml',
    '<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style></w:styles>',
  );
  const heading = (value: string) =>
    '<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>' + value + '</w:t></w:r></w:p>';
  const paragraph = (value: string) => '<w:p><w:r><w:t>' + value + '</w:t></w:r></w:p>';
  zip.file(
    'word/document.xml',
    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      heading('A chegada') +
      paragraph(privateText) +
      paragraph('Um segundo trecho preservado.') +
      heading('A despedida') +
      paragraph('TRECHO EXCLUIDO DA REVISAO') +
      '<w:sectPr/></w:body></w:document>',
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}
async function fault(
  page: Page,
  method: Parameters<typeof import('./fixtures/adventureImportFixture').fixtureImportFault>[0],
  mode: Parameters<typeof import('./fixtures/adventureImportFixture').fixtureImportFault>[1],
) {
  await page.evaluate(
    async ({ fixturePath, method, mode }) => {
      const api = (await import(fixturePath)) as typeof import('./fixtures/adventureImportFixture');
      api.fixtureImportFault(method, mode);
    },
    { fixturePath, method, mode },
  );
}
async function server(page: Page) {
  return page.evaluate(
    async (path) =>
      (
        (await import(path)) as typeof import('./fixtures/adventureImportFixture')
      ).fixtureImportInspect(),
    fixturePath,
  );
}
async function localRecords(page: Page): Promise<LocalImportRecord[]> {
  return page.evaluate(
    async ({ recoveryPath, prefix }) => {
      const recovery = (await import(
        recoveryPath
      )) as typeof import('../../src/features/adventure-import/services/adventureImportRecovery');
      const store = (await import(
        prefix + 'studioStore.ts'
      )) as typeof import('./fixtures/studioStore');
      const records = await recovery.listLocalAdventureImports(store.fixtureOwner());
      return records.map((r) => ({
        ...r,
        snapshot: r.snapshot
          ? {
              ...r.snapshot,
              nonce: Array.from(r.snapshot.nonce),
              ciphertext: Array.from(new Uint8Array(r.snapshot.ciphertext)),
            }
          : null,
      }));
    },
    { recoveryPath, prefix },
  ) as unknown as Promise<LocalImportRecord[]>;
}
async function beginMarkdown(page: Page) {
  await page.getByRole('button', { name: 'Importar Documento', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Nova aventura', exact: true }).click();
  await page.getByLabel('Arquivo da aventura', { exact: true }).setInputFiles({
    name: 'preparacao.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(
      '# Aventura\n\n## A chegada\n\n' +
        privateText +
        '\n\n## A travessia\n\nOutro caminho privado.\n',
    ),
  });
  await expect(page.getByLabel('Título da seção 1', { exact: true })).toBeVisible();
  await page.getByLabel('Título da aventura', { exact: true }).fill('Aventura em preparação');
}

test('I autor: DOCX real revisado gera aventura privada com principal virtual único', async ({
  page,
}, info) => {
  if (info.project.name.startsWith('mobile'))
    await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/studio');
  await page.getByRole('button', { name: 'Importar Documento', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Nova aventura', exact: true }).click();
  await page.getByLabel('Arquivo da aventura', { exact: true }).setInputFiles({
    name: 'aventura.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: await docx(),
  });
  await expect(page.getByLabel('Título da seção 1', { exact: true })).toHaveValue('A chegada');
  await expect(page.getByLabel('Título da seção 2', { exact: true })).toHaveValue('A despedida');
  await page.getByLabel('Título da aventura', { exact: true }).fill('DOCX confirmado pelo autor');
  await page.getByLabel('Título da seção 1', { exact: true }).fill('Chegada revisada');
  await page.getByRole('button', { name: 'Conferir conteúdo', exact: true }).first().click();
  await page.getByRole('combobox', { name: 'Dividir antes do trecho', exact: true }).click();
  await page.getByRole('option', { name: /Um segundo trecho preservado/ }).click();
  await page.getByRole('button', { name: 'Dividir seção', exact: true }).click();
  await expect(page.getByLabel('Título da seção 3', { exact: true })).toHaveValue('A despedida');
  await page.getByRole('button', { name: 'Unir à próxima seção', exact: true }).click();
  await expect(page.getByLabel('Título da seção 3', { exact: true })).toHaveCount(0);
  await page.getByLabel('Selecionar seção 2', { exact: true }).uncheck();
  await expect(page.getByRole('button', { name: 'Unir à próxima seção', exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByText('Para unir, selecione ou desmarque as duas seções explicitamente.'),
  ).toBeVisible();
  await expectDialogWithinViewport(page);
  await capture(page, info, 'aventura-docx-revisao');
  await page.getByRole('button', { name: 'Confirmar importação', exact: true }).click();
  await expect(page).toHaveURL(/\/adventures\/[a-f0-9]{64}$/);
  await expect(
    page.getByRole('heading', { name: 'DOCX confirmado pelo autor', exact: true, level: 1 }),
  ).toBeVisible();
  const result = await page.evaluate(
    async ({ fixturePath, prefix }) => {
      const api = (await import(fixturePath)) as typeof import('./fixtures/adventureImportFixture');
      const jobs = Object.values(api.fixtureImportInspect().jobs);
      const job = jobs.find((j) => j.progress.title === 'DOCX confirmado pelo autor');
      if (!job) throw Error('Importação ausente');
      const sceneStore = (await import(
        prefix + 'sceneStore.ts'
      )) as typeof import('./fixtures/sceneStore');
      const state = await sceneStore.fixtureSceneState({
        kind: 'adventure',
        id: job.progress.adventureId,
      });
      const blocks = (await import(
        prefix + 'adventureBlocksFixture.ts'
      )) as typeof import('./fixtures/adventureBlocksFixture');
      const scene = Object.values(state.scenes)[0];
      if (!scene) throw Error('Cena ausente');
      const page = await blocks.listAdventureBlocks({
        adventureId: job.progress.adventureId,
        sceneId: scene.id,
      });
      return {
        progress: job.progress,
        sections: job.sections,
        groups: Object.values(state.groups).filter((g) => g.id !== null),
        scenes: Object.values(state.scenes),
        body: state.bodies[scene.id],
        blocks: page.items,
      };
    },
    { fixturePath, prefix },
  );
  expect(result.progress.state).toBe('activated');
  expect(result.progress.sectionCount).toBe(1);
  expect(result.sections).toEqual([]);
  expect(result.scenes[0]?.title).toBe('Chegada revisada');
  expect(result.body).toContain(privateText);
  expect(result.body).toContain('Um segundo trecho preservado.');
  expect(result.body).not.toContain('TRECHO EXCLUIDO');
  expect(result.groups).toHaveLength(1);
  expect(result.scenes).toHaveLength(1);
  expect(result.blocks).toHaveLength(1);
  expect(result.blocks[0]?.resource.kind).toBe('scene');
  expect(result.blocks[0]?.audience).toBe('creator');
  expect(result.blocks[0]?.narrativeType).toBe('scene');
  expect(await localRecords(page)).toEqual([]);
  await capture(page, info, 'aventura-docx-ativada');
});

test('I mestre: Markdown parcial recupera cópia protegida após reload e cancela com limpeza', async ({
  page,
}, info) => {
  if (info.project.name.startsWith('mobile'))
    await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/studio');
  await beginMarkdown(page);
  await fault(page, 'appendAdventureImportSection', 'fail-after');
  await page.getByRole('button', { name: 'Confirmar importação', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Verificar pedido', exact: true })).toBeEnabled();
  const initial = await server(page),
    job = Object.values(initial.jobs)[0];
  expect(job).toBeTruthy();
  expect(job.progress.uploadedSections).toBe(1);
  expect(job.progress.state).toBe('uploading');
  const before = await localRecords(page);
  expect(before).toHaveLength(1);
  expect(before[0]?.snapshot).toBeTruthy();
  expect(before[0]?.journal?.action).toBe('appendAdventureImportSection');
  const serialized = JSON.stringify(before);
  expect(serialized).not.toContain(privateText);
  expect(serialized).not.toContain('keyBase64');
  await capture(page, info, 'aventura-preparacao-protegida');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Retomar importação', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retomar importação', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Importar aventura', exact: true });
  await expect(dialog).toBeVisible();
  await fault(page, 'advanceAdventureImport', 'fail-before');
  await dialog.getByRole('button', { name: 'Retomar importação', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Cancelar importação', exact: true }),
  ).toBeEnabled();
  const recovered = await server(page),
    current = Object.values(recovered.jobs)[0];
  expect(current.progress.uploadedSections).toBe(2);
  expect(current.progress.state).toBe('preparing');
  const keyCalls = recovered.calls.filter(
    (c) => c.method === 'getAdventureImportRecoveryKey' && c.stage === 'committed',
  );
  expect(keyCalls.length).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Cancelar importação', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar cancelamento', exact: true }).click();
  await expect
    .poll(async () => Object.values((await server(page)).jobs)[0]?.progress.state)
    .toBe('deleted');
  expect(await localRecords(page)).toEqual([]);
  const final = Object.values((await server(page)).jobs)[0];
  expect(final.key).toBeNull();
  expect(final.sections).toEqual([]);
  const root = await page.evaluate(
    async ({ prefix, id }) =>
      (
        (await import(
          prefix + 'adventureService.ts'
        )) as typeof import('./fixtures/adventureService')
      ).getAdventure(id),
    { prefix, id: final.progress.adventureId },
  );
  expect(root).toBeNull();
  await capture(page, info, 'aventura-preparacao-cancelada');
});

test('I crypto dirigido: AES real, adulteração e IDB fechado sem prosa/chave em claro', async ({
  page,
}) => {
  await page.goto('/studio');
  const result = await page.evaluate(
    async ({ recoveryPath }) => {
      const r = (await import(
        recoveryPath
      )) as typeof import('../../src/features/adventure-import/services/adventureImportRecovery');
      const uid = 'owner-fixture',
        importId = 'ImportFixture0001',
        jobToken = 'e568a4a32319f6f6ac380c6e7181b9dad716e16646ed41dfb49490982247a20c',
        keyId = '11'.repeat(32),
        reviewHash = '78e8daa3650d494acfed5bdda5e90da6c4835d0f2ca9b5e699e0c7270a098440';
      const review = {
        schemaVersion: 1 as const,
        project: { title: 'Aventura Á', synopsis: 'Revisão confirmada.', universeId: null },
        source: {
          mediaType: 'text/html' as const,
          sha256: '1f008eb780e579037a4dfb134513ce3b9aeff647dc382509aba1a5496a33baeb',
          byteLength: 15,
        },
        sections: [
          { title: 'Chegada', content: '<p>Olá 🐉</p>\n' },
          { title: 'Mapa', content: '<p>"Mapa" &amp; trilha\\</p>' },
        ],
      };
      const key = {
        schemaVersion: 1 as const,
        ownerId: uid,
        importId,
        jobToken,
        adventureId: 'd0b805cd641b02db651d7d20ab1a2584ecc393bb49678176f41ef5840a425933',
        reviewHash,
        keyId,
        algorithm: 'AES-GCM' as const,
        keyBase64: btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i))),
      };
      const sealed =
        'PCCleK2Ar3rbJOX42IYWT7nnqxaACTAWXQSRpycSIsZoZMKZjfsw2QLBEZn99UkYLdhCoXil2rRQ51lwa8HPzKJZsBOgEoUOPDfFAInmfIVZ7qhMVE9xHZOU6KkKg9zEr9pjiNEtpGeyPk3dPQdCGphdGYmOoEHzLKsuvefEVCzPN3iym7+/PmTDZINOsi3wA8LBDxcg9Xq8Z40VzerZi6agpyXayK1KwwW/y+y0s4qura8R6ZIS2QO59vNGodTAK36/yjS8tKgGN+bSg3e4t9IcmRNfIpbTE+juog0t4Z03S/aV1xV+CXA03WvBeBM/27GDLuYS/cxjBwJRsb4B6XG2k/T8+GQcFLAcc9JDTijglva9vsTtbNAPnc6afYZkcT2CJpi44mywSFMuZvCC6bqHOi4otuM1+15zYvJTMcvzt0NatTxapMKQGnx/8zsD/mrspOhm7GQhwiQ6sZ44wXtSpKTMsDatYJMp585j4o51uZoA';
      const vector = {
        schemaVersion: 1 as const,
        ownerId: uid,
        importId,
        jobToken,
        keyId,
        reviewHash,
        sectionCount: 2,
        nonce: Uint8Array.from({ length: 12 }, (_, i) => i),
        ciphertext: Uint8Array.from(atob(sealed), (c) => c.charCodeAt(0)).buffer,
      };
      const opened = await r.openAdventureImportReview(vector, key);
      const fresh = await r.sealAdventureImportReview(review, key),
        another = await r.sealAdventureImportReview(review, key);
      let rejected = 0;
      const alteredBytes = new Uint8Array(fresh.ciphertext.slice(0));
      alteredBytes[0] = alteredBytes[0] ^ 1;
      const alteredNonce = new Uint8Array(fresh.nonce);
      alteredNonce[0] = alteredNonce[0] ^ 1;
      for (const patch of [
        { ownerId: 'other-owner' },
        { importId: 'OtherImport00001' },
        { jobToken: 'f'.repeat(64) },
        { keyId: 'f'.repeat(64) },
        { reviewHash: 'f'.repeat(64) },
        { sectionCount: 3 },
        { nonce: alteredNonce },
        { ciphertext: alteredBytes.buffer },
      ]) {
        try {
          await r.openAdventureImportReview({ ...fresh, ...patch }, key);
        } catch {
          rejected++;
        }
      }
      const record = r.nextImportRecord(r.newImportRecord(uid, importId), { snapshot: fresh });
      await r.compareLocalAdventureImport(uid, importId, null, record, () => {});
      const durable = await r.readLocalAdventureImport(uid, importId);
      const text = JSON.stringify(durable, (_k, v: unknown) =>
        v instanceof ArrayBuffer
          ? Array.from(new Uint8Array(v))
          : v instanceof Uint8Array
            ? Array.from(v)
            : v,
      );
      // writer.visual.* is the isolated simulated server, never application persistence.
      const browserStorage = [localStorage, sessionStorage]
        .flatMap((storage) =>
          Object.keys(storage)
            .filter((name) => !name.startsWith('writer.visual.'))
            .map((name) => storage.getItem(name)),
        )
        .join();
      const hasCryptoKey = (v: unknown): boolean =>
        v instanceof CryptoKey ||
        (!!v && typeof v === 'object' && Object.values(v).some(hasCryptoKey));
      const other = await r.readLocalAdventureImport('other-owner', importId);
      const tamperedExpected = structuredClone(record);
      tamperedExpected.snapshot!.ciphertext = alteredBytes.buffer;
      let staleRejected = false;
      try {
        await r.compareLocalAdventureImport(uid, importId, tamperedExpected, null, () => {});
      } catch {
        staleRejected = true;
      }
      const remaining = await r.readLocalAdventureImport(uid, importId);
      return {
        opened,
        sameNonce: Array.from(fresh.nonce).join() === Array.from(another.nonce).join(),
        rejected,
        text,
        keyBase64: key.keyBase64,
        browserStorage,
        hasPersistedCryptoKey: hasCryptoKey(durable),
        other,
        staleRejected,
        remaining: !!remaining,
        recordKeys: Object.keys(durable ?? {}).sort(),
        snapshotKeys: Object.keys(durable?.snapshot ?? {}).sort(),
      };
    },
    { recoveryPath },
  );
  expect(result.opened.sections).toHaveLength(2);
  expect(result.sameNonce).toBe(false);
  expect(result.rejected).toBe(8);
  expect(result.text).not.toContain('Olá');
  expect(result.text).not.toContain('Revisão confirmada.');
  expect(result.text).not.toContain(result.keyBase64);
  expect(result.text).not.toContain('keyBase64');
  expect(result.browserStorage).not.toContain('Olá');
  expect(result.browserStorage).not.toContain(result.keyBase64);
  expect(result.hasPersistedCryptoKey).toBe(false);
  expect(result.recordKeys).toEqual([
    'importId',
    'journal',
    'ownerId',
    'schemaVersion',
    'snapshot',
    'stamp',
  ]);
  expect(result.snapshotKeys).toEqual([
    'ciphertext',
    'importId',
    'jobToken',
    'keyId',
    'nonce',
    'ownerId',
    'reviewHash',
    'schemaVersion',
    'sectionCount',
  ]);
  expect(result.other).toBeNull();
  expect(result.staleRejected).toBe(true);
  expect(result.remaining).toBe(true);
});

test('I pre-seal dirigido: HTTP sem WebLock, resposta tardia troca conta e cancel sem snapshot', async ({
  page,
}) => {
  await page.goto('/studio');
  await fault(page, 'getAdventureImportRecoveryKey', 'hold-after');
  const scope = await page.evaluate(
    async ({ servicePath, prefix }) => {
      const service = (await import(
        servicePath
      )) as typeof import('../../src/features/adventure-import/services/adventureImportService');
      const store = (await import(
        prefix + 'studioStore.ts'
      )) as typeof import('./fixtures/studioStore');
      const uid = store.fixtureOwner(),
        id = '11111111-2222-4333-8444-555555555555';
      const session = service.createAdventureImportSession(
        uid,
        () => {
          if (store.fixtureOwner() !== uid) throw Error('A conta mudou.');
        },
        () => {},
      );
      const promise = session
        .start(
          {
            schemaVersion: 1,
            project: { title: 'Janela pré-seal', synopsis: '', universeId: null },
            source: { mediaType: 'text/plain', sha256: 'a'.repeat(64), byteLength: 10 },
            sections: [{ title: 'Privado', content: '<p>PROSA PRESEAL NUNCA PERSISTIDA</p>' }],
          },
          id,
        )
        .then(
          () => 'unexpected-success',
          () => 'fenced',
        );
      (window as unknown as { importPending: Promise<string> }).importPending = promise;
      return { uid, id };
    },
    { servicePath, prefix },
  );
  await expect
    .poll(async () =>
      (await server(page)).calls.some(
        (c) => c.method === 'getAdventureImportRecoveryKey' && c.stage === 'held-after',
      ),
    )
    .toBe(true);
  const lock = await page.evaluate(
    async ({ uid, id }) =>
      navigator.locks.request(JSON.stringify([uid, id]), { ifAvailable: true }, (l) => !!l),
    scope,
  );
  expect(lock).toBe(true);
  const records = await localRecords(page);
  expect(records).toHaveLength(1);
  expect(records[0]?.snapshot).toBeNull();
  expect((await server(page)).calls.some((c) => c.method === 'appendAdventureImportSection')).toBe(
    false,
  );
  await page.evaluate(() => {
    sessionStorage.setItem('writer.visual.account', 'second');
    window.dispatchEvent(new Event('writer.visual.auth-change'));
  });
  await page.evaluate(
    async (path) =>
      (
        (await import(path)) as typeof import('./fixtures/adventureImportFixture')
      ).fixtureReleaseImport(),
    fixturePath,
  );
  expect(
    await page.evaluate(
      () => (window as unknown as { importPending: Promise<string> }).importPending,
    ),
  ).toBe('fenced');
  await page.evaluate(() => {
    sessionStorage.removeItem('writer.visual.account');
    window.dispatchEvent(new Event('writer.visual.auth-change'));
  });
  const result = await page.evaluate(
    async ({ servicePath, prefix, id }) => {
      const service = (await import(
        servicePath
      )) as typeof import('../../src/features/adventure-import/services/adventureImportService');
      const store = (await import(
        prefix + 'studioStore.ts'
      )) as typeof import('./fixtures/studioStore');
      return service
        .createAdventureImportSession(
          store.fixtureOwner(),
          () => {},
          () => {},
        )
        .cancel(id);
    },
    { servicePath, prefix, id: scope.id },
  );
  expect(result?.state).toBe('deleted');
  expect(await localRecords(page)).toEqual([]);
});

test('I activated dirigido: resposta perdida e perda da cópia local confirmam obra sem nova chave/importação', async ({
  page,
}) => {
  await page.goto('/studio');
  await fault(page, 'activateAdventureImport', 'fail-after');
  const id: `${string}-${string}-${string}-${string}-${string}` =
    '22222222-3333-4444-8555-666666666666';
  await page.evaluate(
    async ({ servicePath, prefix, id }) => {
      const service = (await import(
        servicePath
      )) as typeof import('../../src/features/adventure-import/services/adventureImportService');
      const store = (await import(
        prefix + 'studioStore.ts'
      )) as typeof import('./fixtures/studioStore');
      try {
        await service
          .createAdventureImportSession(
            store.fixtureOwner(),
            () => {},
            () => {},
          )
          .start(
            {
              schemaVersion: 1,
              project: { title: 'Resultado ativado', synopsis: '', universeId: null },
              source: { mediaType: 'text/plain', sha256: 'b'.repeat(64), byteLength: 10 },
              sections: [{ title: 'Chegada', content: '<p>Corpo definitivo particular.</p>' }],
            },
            id,
          );
      } catch {
        /* Commit exists; the only lost part is the transport response. */
      }
    },
    { servicePath, prefix, id },
  );
  const before = await server(page);
  expect(Object.values(before.jobs)[0]?.progress.state).toBe('activated');
  const confirmed = await page.evaluate(
    async ({ servicePath, recoveryPath, prefix, id }) => {
      const recovery = (await import(
        recoveryPath
      )) as typeof import('../../src/features/adventure-import/services/adventureImportRecovery');
      const service = (await import(
        servicePath
      )) as typeof import('../../src/features/adventure-import/services/adventureImportService');
      const store = (await import(
        prefix + 'studioStore.ts'
      )) as typeof import('./fixtures/studioStore');
      const uid = store.fixtureOwner();
      const record = await recovery.readLocalAdventureImport(uid, id);
      if (record) await recovery.compareLocalAdventureImport(uid, id, record, null, () => {});
      return service
        .createAdventureImportSession(
          uid,
          () => {},
          () => {},
        )
        .run(id);
    },
    { servicePath, recoveryPath, prefix, id },
  );
  expect(confirmed?.state).toBe('activated');
  expect(await localRecords(page)).toEqual([]);
  const after = await server(page);
  expect(Object.keys(after.jobs)).toHaveLength(1);
  expect(after.calls.filter((c) => c.method === 'getAdventureImportRecoveryKey').length).toBe(
    before.calls.filter((c) => c.method === 'getAdventureImportRecoveryKey').length,
  );
  expect(after.calls.filter((c) => c.method === 'appendAdventureImportSection').length).toBe(
    before.calls.filter((c) => c.method === 'appendAdventureImportSection').length,
  );
});

test('I identidade dirigido: verify deleting e cancel recusam identidade divergente sem apagar IDB', async ({
  page,
}) => {
  await page.goto('/studio');
  const checks = await page.evaluate(
    async ({ servicePath, recoveryPath, fixturePath, prefix }) => {
      const service = (await import(
        servicePath
      )) as typeof import('../../src/features/adventure-import/services/adventureImportService');
      const recovery = (await import(
        recoveryPath
      )) as typeof import('../../src/features/adventure-import/services/adventureImportRecovery');
      const contractsPath = '/src/features/adventure-import/services/adventureImportContracts.ts';
      const contracts = (await import(
        contractsPath
      )) as typeof import('../../src/features/adventure-import/services/adventureImportContracts');
      const api = (await import(fixturePath)) as typeof import('./fixtures/adventureImportFixture');
      const store = (await import(
        prefix + 'studioStore.ts'
      )) as typeof import('./fixtures/studioStore');
      const uid = store.fixtureOwner();
      const serialize = (value: unknown) =>
        JSON.stringify(value, (_key, entry: unknown) =>
          entry instanceof ArrayBuffer
            ? Array.from(new Uint8Array(entry))
            : entry instanceof Uint8Array
              ? Array.from(entry)
              : entry,
        );
      const observed: {
        label: string;
        rejected: boolean;
        preserved: boolean;
        mutations: number;
        keys: number;
        state: string;
      }[] = [];
      for (const label of [
        'verify-deleting-token',
        'cancel-uploading-keyId',
        'cancel-uploading-reviewHash',
      ]) {
        const id = crypto.randomUUID(),
          operationId = crypto.randomUUID();
        const review = {
          schemaVersion: 1 as const,
          project: { title: label, synopsis: '', universeId: null },
          source: { mediaType: 'text/plain' as const, sha256: 'a'.repeat(64), byteLength: 10 },
          sections: [{ title: 'Cena própria', content: '<p>REVISAO PARTICULAR PRESERVADA 🐉</p>' }],
        };
        const described = await contracts.describeConfirmedReview(review, id);
        const started = await api.startAdventureImport(described.start);
        if (started.kind !== 'confirmed') throw Error('Precondição de start não confirmada');
        const p = started.progress;
        const key = await api.getAdventureImportRecoveryKey({
          importId: id,
          jobToken: p.jobToken,
          reviewHash: p.reviewHash,
          expectedKeyId: p.keyId,
        });
        const snapshot = await recovery.sealAdventureImportReview(described.review, key);
        const request = {
          importId: id,
          jobToken: p.jobToken,
          operationId,
          expectedCheckpoint: p.checkpoint,
          index: 0,
          section: described.review.sections[0],
        };
        const journal = recovery.importJournal(
          uid,
          id,
          'appendAdventureImportSection',
          operationId,
          await contracts.importDigest({ action: 'appendAdventureImportSection', request }),
          p.jobToken,
          p.checkpoint,
          0,
        );
        if (label === 'verify-deleting-token') {
          await api.cancelAdventureImport({
            importId: id,
            jobToken: p.jobToken,
            operationId: crypto.randomUUID(),
            expectedCheckpoint: p.checkpoint,
          });
          journal.jobToken = 'f'.repeat(64);
        } else if (label === 'cancel-uploading-keyId') snapshot.keyId = 'f'.repeat(64);
        else snapshot.reviewHash = 'f'.repeat(64);
        const record = recovery.nextImportRecord(recovery.newImportRecord(uid, id), {
          journal,
          snapshot,
        });
        await recovery.compareLocalAdventureImport(uid, id, null, record, () => {});
        const before = await recovery.readLocalAdventureImport(uid, id);
        const beforeCalls = api.fixtureImportInspect().calls.length;
        const session = service.createAdventureImportSession(
          uid,
          () => {
            if (store.fixtureOwner() !== uid) throw Error('A conta mudou.');
          },
          () => {},
        );
        let rejected = false;
        try {
          if (label === 'verify-deleting-token') await session.verify(id);
          else await session.cancel(id);
        } catch {
          rejected = true;
        }
        const after = await recovery.readLocalAdventureImport(uid, id);
        const calls = api.fixtureImportInspect().calls.slice(beforeCalls);
        observed.push({
          label,
          rejected,
          preserved: serialize(before) === serialize(after) && after?.stamp === record.stamp,
          mutations: calls.filter((c) =>
            [
              'startAdventureImport',
              'appendAdventureImportSection',
              'advanceAdventureImport',
              'activateAdventureImport',
              'cancelAdventureImport',
            ].includes(c.method),
          ).length,
          keys: calls.filter((c) => c.method === 'getAdventureImportRecoveryKey').length,
          state: api.fixtureImportInspect().jobs[JSON.stringify([uid, id])].progress.state,
        });
      }
      return observed;
    },
    { servicePath, recoveryPath, fixturePath, prefix },
  );
  expect(checks).toHaveLength(3);
  for (const [index, check] of checks.entries()) {
    expect(check.rejected, check.label).toBe(true);
    expect(check.preserved, check.label).toBe(true);
    expect(check.mutations, check.label).toBe(0);
    expect(check.keys, check.label).toBe(0);
    expect(check.state, check.label).toBe(index === 0 ? 'deleting' : 'uploading');
  }
});
