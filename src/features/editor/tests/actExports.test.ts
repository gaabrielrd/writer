import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { createExportDocument } from '../model/exportDocument';
import { exportMarkdown } from '../services/exportMarkdown';
import { exportDocx } from '../services/exportDocx';
import { buildPrintDocument } from '../services/exportPdf';
import { exportBook, exportChapter, readBlob } from './exportFixtures';

describe('atos nas exportações', () => {
  const acts = [
    { id: 'a', name: null, order: 1 },
    { id: 'b', name: 'Virada <fim>', order: 2 },
    { id: 'empty', name: 'Vazio', order: 3 },
  ];
  const chapters = [
    { ...exportChapter, id: 'free', title: 'Livre', order: 1 },
    { ...exportChapter, id: 'b', title: 'Último', actId: 'b', order: 1 },
    { ...exportChapter, id: 'a2', title: 'Continuação', actId: 'a', order: 2 },
    { ...exportChapter, id: 'a1', title: 'Primeiro', actId: 'a', order: 1 },
  ];
  it('agrupa na sequência de leitura e emite um cabeçalho por ato preenchido', () => {
    const document = createExportDocument(exportBook, chapters, acts);
    expect(document.chapters.map((chapter) => chapter.title)).toEqual([
      'Primeiro',
      'Continuação',
      'Último',
      'Livre',
    ]);
    expect(document.chapters.map((chapter) => chapter.actTitle)).toEqual([
      'I',
      undefined,
      'Virada <fim>',
      undefined,
    ]);
    const markdown = exportMarkdown(document);
    expect(markdown).toContain('## I\n\n### Primeiro');
    expect(markdown).toContain('### Continuação');
    expect(markdown).toContain('## Livre');
    expect(markdown).not.toContain('Vazio');
    expect(markdown).toContain('Virada &lt;fim&gt;');
  });
  it('produz hierarquia real no DOCX e HTML de impressão seguro no PDF', async () => {
    const document = createExportDocument(exportBook, chapters, acts);
    document.chapters[0]!.blocks.push({
      kind: 'heading',
      level: 1,
      runs: [{ text: 'Cena interna' }],
    });
    const blob = await exportDocx(document);
    const zip = await JSZip.loadAsync(await readBlob(blob));
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('Heading2');
    expect(xml).toContain('Heading3');
    expect(xml).toContain('Virada &lt;fim&gt;');
    expect(xml.indexOf('Primeiro')).toBeLessThan(xml.indexOf('Último'));
    const html = new DOMParser().parseFromString(buildPrintDocument(document), 'text/html');
    expect([...html.querySelectorAll('h2')].map((element) => element.textContent)).toEqual([
      'I',
      'Virada <fim>',
      'Livre',
    ]);
    expect(
      [...html.querySelectorAll('.chapter-title')].map((element) => element.textContent),
    ).toEqual(['Primeiro', 'Continuação', 'Último']);
    expect(html.querySelector('fim')).toBeNull();
    expect(html.body.textContent).not.toContain('Vazio');
  });
});
