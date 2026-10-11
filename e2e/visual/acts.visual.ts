import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { chooseDropdown } from '../dropdown';
import {
  capture,
  expect,
  expectDialogWithinViewport,
  expectNoHorizontalOverflow,
  test,
} from './support';
import { FIXTURE_BOOK_ID, chapters } from './fixtures/data';

const title = chapters[0].title;
async function createAct(page: import('@playwright/test').Page, name = '') {
  await page.getByRole('button', { name: 'Novo ato', exact: true }).click();
  await expectDialogWithinViewport(page);
  if (name) await page.getByLabel('Nome do ato (opcional)').fill(name);
  await page.getByRole('button', { name: 'Criar ato', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Novo ato', exact: true })).toBeFocused();
}
test('atos, busca, seleção e confirmação nos três temas', async ({ page }, testInfo) => {
  await page.goto('/books/' + FIXTURE_BOOK_ID);
  await expect(page.getByRole('button', { name: 'Novo ato', exact: true })).toBeEnabled();
  await createAct(page);
  await createAct(page, 'A travessia');
  await expect(page.getByRole('heading', { name: 'I', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A travessia', exact: true })).toBeVisible();
  const filter = page.getByRole('textbox', { name: 'Filtrar capítulos por nome' });
  if (testInfo.project.name.startsWith('desktop')) {
    const searchBounds = await filter.boundingBox();
    const createBounds = await page
      .getByRole('button', { name: 'Novo capítulo', exact: true })
      .boundingBox();
    expect(searchBounds).not.toBeNull();
    expect(createBounds).not.toBeNull();
    expect(
      Math.abs(
        searchBounds!.y + searchBounds!.height / 2 - createBounds!.y - createBounds!.height / 2,
      ),
    ).toBeLessThan(1);
    expect(createBounds!.x - searchBounds!.x - searchBounds!.width).toBeGreaterThanOrEqual(0);
    expect(createBounds!.x - searchBounds!.x - searchBounds!.width).toBeLessThanOrEqual(12);
  }
  await filter.fill(title);
  await page.getByRole('checkbox', { name: 'Selecionar todos os capítulos exibidos' }).check();
  const trigger = page.getByRole('button', { name: 'Mover para ato', exact: true });
  await trigger.click();
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'atos-mover-modal');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await chooseDropdown(page.getByRole('combobox', { name: 'Ato de destino' }), 'I');
  await page.evaluate(() => sessionStorage.setItem('writer.visual.acts-failure', 'true'));
  await page.getByRole('button', { name: 'Mover capítulos', exact: true }).click();
  await expect(page.getByText('Falha simulada na movimentação.')).toBeVisible();
  await page.evaluate(() => sessionStorage.removeItem('writer.visual.acts-failure'));
  await page.getByRole('button', { name: 'Mover capítulos', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await filter.fill('');
  const group = page.getByRole('region', { name: 'Ato I', exact: true });
  await expect(group.getByText(title, { exact: true })).toBeVisible();
  await capture(page, testInfo, 'atos-lista-agrupada');
  await page.getByRole('checkbox', { name: 'Selecionar ' + title, exact: true }).check();
  await page.getByRole('button', { name: 'Excluir seleção', exact: true }).click();
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'atos-excluir-modal');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Selecionar ' + title, exact: true }),
  ).toBeChecked();
  await page.getByRole('button', { name: 'Excluir seleção', exact: true }).click();
  await page.getByRole('button', { name: 'Excluir capítulos', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Selecionar ' + title, exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Ato I', exact: true })).toContainText(
    'Este ato ainda não tem capítulos',
  );
});
test('atos cabem em 320px e os modais conservam ações visíveis', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/books/' + FIXTURE_BOOK_ID);
  await expect(page.getByRole('button', { name: 'Novo ato', exact: true })).toBeEnabled();
  await createAct(page, 'Nome de ato suficientemente longo para testar a quebra de linhas');
  await page.getByRole('checkbox', { name: 'Selecionar todos os capítulos exibidos' }).check();
  await capture(page, testInfo, 'atos-320-selecao');
  await page.getByRole('button', { name: 'Mover para ato', exact: true }).click();
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'atos-320-modal');
  await page.keyboard.press('Escape');
  await expectNoHorizontalOverflow(page, 'atos-320');
});
test('publicação e artefatos preservam atos e a sequência do manuscrito', async ({
  page,
}, testInfo) => {
  let printedHtml = '';
  await page.exposeFunction('__captureWriterPrint', (html: string) => {
    printedHtml = html;
  });
  await page.addInitScript(() => {
    window.print = () => {
      void (async () => {
        const bridge = window as unknown as Window & {
          __captureWriterPrint: (html: string) => Promise<void>;
        };
        await bridge.__captureWriterPrint(document.documentElement.outerHTML);
        window.dispatchEvent(new Event('afterprint'));
      })();
    };
  });
  await page.goto('/books/' + FIXTURE_BOOK_ID);
  await expect(page.getByRole('button', { name: 'Novo ato', exact: true })).toBeEnabled();
  await createAct(page);
  await page.getByRole('checkbox', { name: 'Selecionar ' + title, exact: true }).check();
  await page.getByRole('button', { name: 'Mover para ato', exact: true }).click();
  await chooseDropdown(page.getByRole('combobox', { name: 'Ato de destino' }), 'I');
  await page.getByRole('button', { name: 'Mover capítulos', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Opções do livro', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Exportar', exact: true }).click();
  await chooseDropdown(page.getByLabel('Formato do arquivo'), 'Markdown (.md)');
  const downloadMarkdown = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar arquivo', exact: true }).click();
  const markdown = await downloadMarkdown;
  expect(await readFile(await markdown.path(), 'utf8')).toContain('## I');
  await chooseDropdown(page.getByLabel('Formato do arquivo'), 'Word (.docx)');
  const downloadWord = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar arquivo', exact: true }).click();
  const word = await downloadWord;
  const zip = await JSZip.loadAsync(await readFile(await word.path()));
  expect(await zip.file('word/document.xml')!.async('string')).toContain('Heading2');
  await testInfo.attach('atos.docx', {
    path: await word.path(),
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  await chooseDropdown(page.getByLabel('Formato do arquivo'), 'PDF (impressão)');
  await page.getByRole('button', { name: 'Abrir impressão', exact: true }).click();
  await expect.poll(() => printedHtml).toContain('<h2>I</h2>');
  const printPage = await page.context().newPage();
  await printPage.setContent(printedHtml);
  await printPage.setViewportSize({ width: 794, height: 1123 });
  await printPage.emulateMedia({ media: 'print' });
  await testInfo.attach('atos-impressao.png', {
    body: await printPage.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await testInfo.attach('atos.pdf', {
    body: await printPage.pdf({ preferCSSPageSize: true, printBackground: true }),
    contentType: 'application/pdf',
  });
  await printPage.close();
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Publicação', exact: true }).click();
  await page.getByRole('button', { name: 'Publicar Obra', exact: true }).click();
  await page.getByLabel('Nome de autor público').fill('Autora dos atos');
  await page.getByRole('button', { name: 'Confirmar publicação', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'Abrir leitor público' }).click();
  await expect(page.getByRole('heading', { name: 'I', exact: true })).toBeVisible();
  await expect(page.getByText('Ato I', { exact: true })).toBeVisible();
  await capture(page, testInfo, 'atos-leitor-publico');
  await page.getByRole('button', { name: 'Próximo', exact: true }).click();
  await expect(page.getByText('Ato I', { exact: true })).toHaveCount(0);
});
