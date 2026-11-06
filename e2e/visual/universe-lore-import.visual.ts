import { capture, expect, expectDialogWithinViewport, test } from './support';
import { chooseDropdown } from '../dropdown';

test('orienta seleção por teclado e arraste, preserva arquivos após erro e mantém ações visíveis', async ({
  page,
}, testInfo) => {
  await page.goto('/universes');
  await page.getByRole('button', { name: 'Importar universo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Analisar arquivos', exact: true })).toBeDisabled();
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'importar-universo-arquivos-vazio');
  const choose = page.getByRole('button', { name: 'Escolher arquivos', exact: true });
  await choose.focus();
  const picker = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  await (
    await picker
  ).setFiles({
    name: 'atlas.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('Arthur voltou.'),
  });
  await expect(page.getByText('1 de 50 arquivos', { exact: true })).toBeVisible();
  const zone = page.getByText('Arraste seus arquivos para cá', { exact: true }).locator('..');
  const invalid = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['imagem'], 'mapa.png', { type: 'image/png' }));
    return transfer;
  });
  await zone.dispatchEvent('drop', { dataTransfer: invalid });
  await expect(page.getByRole('alert')).toContainText('Use PDF, TXT ou Markdown.');
  await expect(page.getByText('atlas.md', { exact: true })).toBeVisible();
  const files = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    for (let index = 0; index < 15; index++) {
      transfer.items.add(
        new File(['Ilhas e cidades.'], `anotacoes-do-universo-com-nome-extenso-${index + 1}.txt`, {
          type: 'text/plain',
        }),
      );
    }
    return transfer;
  });
  await zone.dispatchEvent('drop', { dataTransfer: files });
  await expect(page.getByText('16 de 50 arquivos', { exact: true })).toBeAttached();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const analyze = page.getByRole('button', { name: 'Analisar arquivos', exact: true });
  await expect(analyze).toBeVisible();
  await expect(analyze).toBeEnabled();
  await capture(page, testInfo, 'importar-universo-arquivos-selecionados');
  await page.getByRole('button', { name: 'Remover atlas.md', exact: true }).click();
  await expect(page.getByText('atlas.md', { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 1024, height: 768 });
  await expectDialogWithinViewport(page);
  await expect(analyze).toBeVisible();
  await capture(page, testInfo, 'importar-universo-laptop');
});

test('prepara PDF multipágina no navegador em menos blocos com hashes e origem literal', async ({
  page,
  context,
}) => {
  const source = await context.newPage();
  await source.setContent(
    '<style>@page { size: A5; margin: 40px; } section { break-after: page; } header { position: fixed; top: -25px; font-size: 10px; }</style><header>Atlas de referência</header>' +
      Array.from(
        { length: 6 },
        (_, index) =>
          `<section><h1>Região ${index + 1}</h1><p>Arthur visitou a região ${index + 1}. ${'As ilhas abrigam cidades e florestas. '.repeat(20)}</p></section>`,
      ).join(''),
  );
  const pdf = await source.pdf({ format: 'A5' });
  await source.close();
  await page.goto('/universes');
  const result = await page.evaluate(
    async (bytes) => {
      const path = '/src/features/document-import/index.ts';
      const { extractLoreDocument, prepareLoreSources, describeLoreSources } = (await import(
        /* @vite-ignore */ path
      )) as typeof import('../../src/features/document-import');
      const pages = await extractLoreDocument(
        new File([new Uint8Array(bytes)], 'atlas.pdf', { type: 'application/pdf' }),
      );
      const parts = prepareLoreSources(pages);
      const description = await describeLoreSources(parts);
      return {
        pages: pages.length,
        parts: parts.length,
        hash: description.sourceHash,
        text: parts.map((part) => part.text).join(''),
        origins: [...new Set(parts.flatMap((part) => part.spans.map((span) => span.page)))],
      };
    },
    [...pdf],
  );
  expect(result.pages).toBe(6);
  expect(result.parts).toBeLessThan(result.pages);
  expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
  expect(result.text).not.toContain('Atlas de referência');
  for (let number = 1; number <= 6; number++) {
    expect(result.text).toContain(`Arthur visitou a região ${number}.`);
    expect(result.origins).toContain(number);
  }
});

test('importa PDF e texto, revisa novas entradas e atualiza ficha com diff', async ({
  page,
  context,
}, testInfo) => {
  const source = await context.newPage();
  await source.setContent(
    '<style>@page { size: A5; margin: 30px; } .columns { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; } h1 { font-size: 20px; }</style><h1>Universo de Atlas</h1><div class="columns"><p>Arthur voltou ao reino. Ele foi coroado e governa as ilhas.</p><p>Porto Azul recebe navios e viajantes. O comércio liga as ilhas.</p></div>',
  );
  const pdf = await source.pdf({ format: 'A5' });
  await source.close();
  await page.goto('/universes');
  await page.getByRole('button', { name: 'Importar universo', exact: true }).click();
  await page.getByLabel('Arquivos para importar').setInputFiles([
    { name: 'atlas.pdf', mimeType: 'application/pdf', buffer: pdf },
    {
      name: 'notas.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Notas\nArthur protege Porto Azul.'),
    },
  ]);
  await page.getByRole('button', { name: 'Analisar arquivos', exact: true }).click();
  await page.getByLabel('Nome do universo', { exact: true }).fill('Atlas importado');
  await expect(page.getByText('Fonte: atlas.pdf, página 1').first()).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Criar universo com 2 entradas', exact: true }),
  ).toBeEnabled();
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'importar-universo-revisao');
  await page.getByRole('button', { name: 'Criar universo com 2 entradas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Atlas importado', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Arthur', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Importar lore', exact: true }).click();
  await page.getByLabel('Arquivos para importar').setInputFiles({
    name: 'retorno.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Arthur voltou como rei das ilhas.'),
  });
  await page.getByRole('button', { name: 'Analisar arquivos', exact: true }).click();
  await chooseDropdown(page.getByLabel('Destino de Arthur'), 'Atualizar: Arthur');
  await page.getByText('Revisar campos de Arthur').click();
  await page.getByLabel('Detalhes', { exact: true }).fill('');
  await expect(page.getByText('Detalhes — Removido')).toBeVisible();
  await expect(
    page.locator('del').filter({ hasText: 'Nova história do rei.' }).last(),
  ).toBeVisible();
  await expectDialogWithinViewport(page);
  await page.getByText('Detalhes — Removido').scrollIntoViewIfNeeded();
  await capture(page, testInfo, 'importar-lore-diff');
  await page
    .getByRole('button', { name: 'Confirmar: 0 novas e 1 atualizada', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Arthur', exact: true })).toHaveCount(1);
  await page.setViewportSize({ width: 320, height: 780 });
  await page.getByRole('button', { name: 'Importar lore', exact: true }).click();
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'importar-lore-320');
});
