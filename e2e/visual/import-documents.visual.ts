import { capture, expect, expectDialogWithinViewport, test } from './support';

test('PDF real com nove capítulos e sumário é revisado sem páginas preliminares', async ({
  page,
  context,
}, testInfo) => {
  const source = await context.newPage();
  await source.setContent(
    '<style>@page { size: A5; margin: 55px 40px; } body { font-family: serif; font-size: 12px; } section { break-after: page; } h1 { font-size: 24px; } .label { font-size: 12px; } p { margin: 12px 0; }</style><section><h1>Livro de teste</h1><p>Capa e autor</p></section><section><h1>Sumário</h1>' +
      Array.from(
        { length: 9 },
        (_, index) =>
          '<p>' + (index + 1) + ' Título ' + (index + 1) + ' ........ ' + (index + 3) + '</p>',
      ).join('') +
      '</section>' +
      Array.from(
        { length: 9 },
        (_, index) =>
          '<section><div class="label">CAPÍTULO ' +
          String(index + 1).padStart(2, '0') +
          '</div><h1>Título ' +
          (index + 1) +
          '</h1>' +
          Array.from(
            { length: 6 },
            (_, paragraph) =>
              '<p>História do capítulo ' +
              (index + 1) +
              ', parágrafo ' +
              (paragraph + 1) +
              '. O viajante encontrou o caminho de volta e registrou suas lembranças.</p>',
          ).join('') +
          '</section>',
      ).join(''),
  );
  const pdf = await source.pdf({
    format: 'A5',
    displayHeaderFooter: true,
    headerTemplate:
      '<div style="font-size:9px; width:100%; text-align:center">LIVRO DE TESTE — ATO I</div>',
    footerTemplate:
      '<div style="font-size:9px; width:100%; text-align:center"><span class="pageNumber"></span></div>',
    margin: { top: '55px', bottom: '55px', left: '40px', right: '40px' },
  });
  await source.close();
  await page.goto('/');
  await page.getByRole('button', { name: 'Importar Documento', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Livro', exact: true }).click();
  await page
    .getByLabel('Arquivo do manuscrito')
    .setInputFiles({ name: 'nove-capitulos.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(page.getByText('capítulos encontrados', { exact: false })).toContainText(
    '9 capítulos encontrados',
  );
  for (let index = 0; index < 9; index++) {
    await expect(page.getByLabel('Título do capítulo ' + (index + 1), { exact: true })).toHaveValue(
      'CAPÍTULO ' + String(index + 1).padStart(2, '0') + ': Título ' + (index + 1),
    );
  }
  await expect(
    page.getByText(/Capa e autor|LIVRO DE TESTE — ATO I|Sumário/, { exact: false }),
  ).toHaveCount(0);
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'importacao-pdf-nove-capitulos');
  await testInfo.attach('pdf-sintetico', { body: pdf, contentType: 'application/pdf' });
});

test('Markdown preserva capítulos e permite selecionar e renomear antes de importar', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Importar Documento', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Livro', exact: true }).click();
  await page.getByLabel('Arquivo do manuscrito').setInputFiles({
    name: 'manuscrito.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(
      '# Manuscrito\n\n## A chegada\n\nUma **viajante** voltou.\n\n### Recordações\n\nA cidade permaneceu.\n\n## A partida\n\nEla partiu.',
    ),
  });
  await expect(page.getByText(/2 capítulos encontrados/)).toBeVisible();
  await expect(page.getByLabel('Título do capítulo 1', { exact: true })).toHaveValue('A chegada');
  await expect(page.getByLabel('Título do capítulo 2', { exact: true })).toHaveValue('A partida');
  await page.getByRole('checkbox').nth(1).uncheck();
  await page.getByLabel('Título do capítulo 1', { exact: true }).fill('O retorno');
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'importacao-markdown-revisao');
  await page.getByRole('button', { name: 'Importar 1 Capítulo(s)', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'manuscrito', exact: true })).toBeVisible();
  await expect(page.getByText('O retorno', { exact: true })).toBeVisible();
  await expect(page.getByText('A partida', { exact: true })).toHaveCount(0);
});
