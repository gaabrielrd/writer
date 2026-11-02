import { capture, expect, expectDialogWithinViewport, test } from './support';
import { chooseDropdown } from '../dropdown';

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
    .getByRole('button', { name: 'Confirmar: 0 novas e 1 atualizadas', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Arthur', exact: true })).toHaveCount(1);
  await page.setViewportSize({ width: 320, height: 780 });
  await page.getByRole('button', { name: 'Importar lore', exact: true }).click();
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'importar-lore-320');
});
