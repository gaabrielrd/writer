import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { books, chapters, FIXTURE_BOOK_ID, FIXTURE_CHAPTER_ID } from './fixtures/data';
import { capture, expect, expectDialogWithinViewport, test } from './support';

const bookPath = `/books/${FIXTURE_BOOK_ID}`;
const editorPath = `${bookPath}/editor/${FIXTURE_CHAPTER_ID}`;

test('exportação preserva a versão atual, reabre o diálogo e baixa Markdown', async ({
  page,
}, testInfo) => {
  await page.goto(editorPath);
  const manuscript = page.getByRole('textbox', { name: 'Área de escrita do capítulo' });
  await expect(manuscript).toBeVisible();
  await manuscript.fill('Versão atual com ação, memória e café.');
  const trigger = page.getByRole('button', { name: 'Exportar', exact: true });
  await trigger.click();
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'exportar-capitulo');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Baixar arquivo' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`${books[0].title} - ${chapters[0].title}.md`);
  const path = await download.path();
  expect(path).not.toBeNull();
  const markdown = await readFile(path, 'utf8');
  expect(markdown).toContain('Versão atual com ação, memória e café');
  expect(markdown).not.toContain('visual-author');
  expect(markdown).not.toContain('A longa travessia');
  await expect(page.getByRole('status')).toContainText('Arquivo preparado');
  await capture(page, testInfo, 'exportacao-concluida');
});

test('exporta o livro inteiro como DOCX real e backup JSON privado', async ({ page }, testInfo) => {
  await page.goto(bookPath);
  await page.getByRole('button', { name: 'Exportar', exact: true }).click();
  await page.getByLabel('Formato do arquivo').selectOption('docx');
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'exportar-livro-docx');
  const [docxDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Baixar arquivo' }).click(),
  ]);
  const docxPath = await docxDownload.path();
  expect(docxPath).not.toBeNull();
  const zip = await JSZip.loadAsync(await readFile(docxPath));
  await testInfo.attach('livro-exportado.docx', {
    path: docxPath,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const xml = await zip.file('word/document.xml')!.async('string');
  for (const chapter of chapters) expect(xml).toContain(chapter.title);
  expect(xml).toContain('w:pageBreakBefore');
  expect(xml).toContain('w:pStyle w:val="Heading1"');
  expect(await zip.file('word/styles.xml')!.async('string')).toContain('Georgia');
  await page.getByLabel('Formato do arquivo').selectOption('json');
  await expect(page.getByLabel('Conteúdo da exportação')).toBeDisabled();
  await expect(page.getByText(/fichas de lore privadas/)).toBeVisible();
  await capture(page, testInfo, 'exportar-backup-privado');
  const [jsonDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Baixar arquivo' }).click(),
  ]);
  const jsonPath = await jsonDownload.path();
  expect(jsonPath).not.toBeNull();
  const raw = await readFile(jsonPath, 'utf8');
  const backup = JSON.parse(raw) as {
    format: string;
    chapters: unknown[];
    lore: { isPublic: boolean }[];
  };
  expect(backup.format).toBe('writer-book-backup');
  expect(backup.chapters).toHaveLength(chapters.length);
  expect(backup.lore.some((entity) => !entity.isPublic)).toBe(true);
  expect(raw).not.toMatch(/visual-author|autora@example|apiKey|writer_byok/);
});

test('falha de carregamento mantém diálogo aberto e permite tentar novamente', async ({
  page,
}, testInfo) => {
  await page.goto(bookPath);
  await page.getByRole('button', { name: 'Exportar', exact: true }).click();
  await page.evaluate(() => sessionStorage.setItem('writer.visual.export-failure', 'true'));
  await page.getByRole('button', { name: 'Baixar arquivo' }).click();
  await expect(page.getByRole('alert')).toContainText('Falha simulada na exportação');
  await expect(page.getByRole('button', { name: 'Baixar arquivo' })).toBeEnabled();
  await capture(page, testInfo, 'exportacao-erro-recuperavel');
  await page.evaluate(() => sessionStorage.removeItem('writer.visual.export-failure'));
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Baixar arquivo' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.md$/);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Arquivo preparado');
});

test('PDF usa um documento isolado sem a interface do aplicativo', async ({ page }, testInfo) => {
  let printedHtml = '';
  let printCaptureError: string | null = null;
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().startsWith('[writer-print-capture]')) {
      printCaptureError = message.text();
    }
  });
  await page.exposeFunction('__captureWriterPrint', (html: string) => {
    printedHtml = html;
  });
  await page.addInitScript(() => {
    window.print = () => {
      void (async () => {
        try {
          const bridge = window as unknown as Window & {
            __captureWriterPrint: (html: string) => Promise<void>;
          };
          // Keep the frame alive until Playwright acknowledges the captured document.
          await bridge.__captureWriterPrint(document.documentElement.outerHTML);
          window.dispatchEvent(new Event('afterprint'));
        } catch (cause) {
          console.error(
            '[writer-print-capture]',
            cause instanceof Error ? cause.message : String(cause),
          );
        }
      })();
    };
  });
  await page.goto(bookPath);
  await page.getByRole('button', { name: 'Exportar', exact: true }).click();
  await page.getByLabel('Formato do arquivo').selectOption('pdf');
  await capture(page, testInfo, 'exportar-pdf');
  await page.getByRole('button', { name: 'Abrir impressão' }).click();
  await expect
    .poll(
      () => ({
        error: printCaptureError,
        capturedPrintDocument: printedHtml.includes('@media print'),
      }),
      { message: 'O documento isolado deve ser capturado antes de remover o iframe de impressão.' },
    )
    .toEqual({ error: null, capturedPrintDocument: true });
  expect(printedHtml).toContain(books[0].title);
  for (const chapter of chapters) expect(printedHtml).toContain(chapter.title);
  expect(printedHtml).not.toMatch(/<button|data-lore|visual-author|Compêndio de Lore/);
  await expect(page.locator('iframe[title="Impressão do manuscrito"]')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Impressão aberta');
  const printPage = await page.context().newPage();
  await printPage.setContent(printedHtml);
  await printPage.setViewportSize({ width: 794, height: 1123 });
  await printPage.emulateMedia({ media: 'print' });
  await testInfo.attach('manuscrito-estilo-impressao.png', {
    body: await printPage.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  const pdf = await printPage.pdf({ preferCSSPageSize: true, printBackground: true });
  await testInfo.attach('manuscrito-impressao-nativa.pdf', {
    body: pdf,
    contentType: 'application/pdf',
  });
  await printPage.close();
});
