import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { createExportDocument, exportFileName, parseExportBlocks } from '../model/exportDocument';
import { exportMarkdown } from '../services/exportMarkdown';
import { exportDocx, DOCX_MIME } from '../services/exportDocx';
import { exportBook, exportChapter, readBlob } from './exportFixtures';

const fullContent =
  '<h1>A jornada</h1><p>Olá, <strong>ação</strong>, <em>memória</em>, <u>sublinhado</u>, <s>rasurado</s> e <code>código</code>.<br>Uma nova linha.</p><blockquote><p>Uma citação.</p></blockquote><ul><li>Primeiro<ul><li>Interno</li></ul></li><li>Segundo</li></ul><ol><li>Passo um</li><li>Passo dois</li></ol><pre><code>linha 1\nlinha 2 ```</code></pre><hr><p><a href="https://example.com/ação">Link</a></p>';

describe('manuscript exports', () => {
  it('orders chapters without mutating the source and rejects a book with no chapters', () => {
    const chapters = [{ ...exportChapter, id: '2', title: 'Segundo', order: 2 }, exportChapter];
    expect(
      createExportDocument(exportBook, chapters).chapters.map((chapter) => chapter.title),
    ).toEqual(['O início', 'Segundo']);
    expect(chapters[0]?.id).toBe('2');
    expect(() => createExportDocument(exportBook, [])).toThrow('Adicione um capítulo');
    expect(
      createExportDocument({ ...exportBook, genre: undefined, synopsis: undefined }, [
        { ...exportChapter, content: '' },
      ]).chapters[0]?.blocks,
    ).toEqual([]);
  });

  it('parses safe HTML inline formatting, headings, quotes, nested lists, code and line breaks', () => {
    const blocks = parseExportBlocks(fullContent);
    expect(blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'heading', level: 1 }),
        expect.objectContaining({ kind: 'quote' }),
        expect.objectContaining({ kind: 'list', marker: '-', level: 1 }),
        expect.objectContaining({ kind: 'list', marker: '2.' }),
        expect.objectContaining({ kind: 'code' }),
        expect.objectContaining({ kind: 'rule' }),
      ]),
    );
    expect(blocks.flatMap((block) => block.runs)).toEqual(
      expect.arrayContaining([
        { text: 'ação', bold: true },
        { text: 'memória', italic: true },
        { text: '\n' },
        { text: 'sublinhado', underline: true },
        { text: 'rasurado', strike: true },
        { text: 'código', code: true },
      ]),
    );
    expect(parseExportBlocks('Antes <b>forte</b><!-- ignored --><p>Depois</p>Fim')).toHaveLength(3);
  });

  it('generates structured Markdown with real formatting, metadata and Unicode', () => {
    const markdown = exportMarkdown(
      createExportDocument(exportBook, [{ ...exportChapter, content: fullContent }]),
    );
    expect(markdown).toContain('title: "Crônicas: ação & memória"');
    expect(markdown).toContain('genre: "Fantasia"');
    expect(markdown).toContain('# Crônicas: ação & memória');
    expect(markdown).toContain('## O início');
    expect(markdown).toContain('### A jornada');
    expect(markdown).toContain('**ação**');
    expect(markdown).toContain('*memória*');
    expect(markdown).toContain('<u>sublinhado</u>');
    expect(markdown).toContain('~~rasurado~~');
    expect(markdown).toContain('` código `');
    expect(markdown).toContain('  \nUma nova linha');
    expect(markdown).toContain('> Uma citação');
    expect(markdown).toContain('  - Interno');
    expect(markdown).toContain('2. Passo dois');
    expect(markdown).toContain('````\nlinha 1\nlinha 2 ```\n````');
    expect(markdown).toContain('[Link](<https://example.com/a%C3%A7%C3%A3o>)');
    expect(markdown).not.toContain(exportBook.authorId);
  });

  it('exports legacy Markdown and plain prose without exposing unsafe HTML or private attributes', () => {
    const plain = exportMarkdown(
      createExportDocument({ ...exportBook, genre: '', synopsis: '' }, [
        { ...exportChapter, content: '# Cena\n\n**Coragem** e *fé*.\n> Uma frase\n- Um\n- Dois' },
      ]),
    );
    expect(plain).toContain('### Cena');
    expect(plain).toContain('**Coragem**');
    expect(plain).toContain('*fé*');
    expect(plain).not.toContain('genre:');
    const unsafe = exportMarkdown(
      createExportDocument(exportBook, [
        {
          ...exportChapter,
          content:
            '<p data-lore-id="secret" onclick="danger()">Visível<script>alert(1)</script><img src="https://tracker"><a href="javascript:bad()">Link</a></p>',
        },
      ]),
    );
    expect(unsafe).toContain('VisívelLink');
    expect(unsafe).not.toMatch(/secret|danger|alert\(1\)|tracker|javascript/);
  });

  it('creates a valid OOXML ZIP with styles, Unicode, formatting, page breaks and escaped metadata', async () => {
    const manuscript = createExportDocument({ ...exportBook, title: 'A < B & "C"\u0001' }, [
      { ...exportChapter, content: fullContent },
      { ...exportChapter, id: 'two', order: 2, title: 'Final ☕', content: '<p>Fim.</p>' },
    ]);
    const blob = await exportDocx(manuscript);
    expect(blob.type).toBe(DOCX_MIME);
    const zip = await JSZip.loadAsync(await readBlob(blob));
    expect(Object.keys(zip.files)).toEqual(
      expect.arrayContaining([
        '[Content_Types].xml',
        '_rels/.rels',
        'word/document.xml',
        'word/styles.xml',
        'word/_rels/document.xml.rels',
        'docProps/core.xml',
      ]),
    );
    const documentXml = await zip.file('word/document.xml')!.async('string');
    const stylesXml = await zip.file('word/styles.xml')!.async('string');
    const coreXml = await zip.file('docProps/core.xml')!.async('string');
    for (const xml of [
      documentXml,
      stylesXml,
      coreXml,
      await zip.file('[Content_Types].xml')!.async('string'),
    ]) {
      expect(
        new DOMParser().parseFromString(xml, 'application/xml').querySelector('parsererror'),
      ).toBeNull();
    }
    expect(documentXml).toContain('ação');
    expect(documentXml).toContain('Final ☕');
    expect(documentXml).toContain('<w:b/>');
    expect(documentXml).toContain('<w:i/>');
    expect(documentXml).toContain('<w:u w:val="single"/>');
    expect(documentXml).toContain('<w:strike/>');
    expect(documentXml).toContain('<w:br/>');
    expect(documentXml).toContain('<w:hyperlink r:id="link1">');
    const relationships = await zip.file('word/_rels/document.xml.rels')!.async('string');
    expect(relationships).toContain('https://example.com/a%C3%A7%C3%A3o');
    expect(relationships).toContain('TargetMode="External"');
    expect(documentXml).toContain('<w:pageBreakBefore/>');
    expect(documentXml).toContain('A &lt; B &amp; &quot;C&quot;');
    expect(documentXml).not.toContain('\u0001');
    expect(documentXml).not.toContain(exportBook.authorId);
    expect(stylesXml).toContain('w:styleId="Title"');
    expect(stylesXml).toContain('w:styleId="Heading6"');
    expect(stylesXml).toContain('w:styleId="Quote"');
    expect(stylesXml).toContain('Georgia');
  });

  it('supports minimal documents and cancellation before DOCX generation', async () => {
    const manuscript = createExportDocument({ ...exportBook, genre: '', synopsis: '' }, [
      { ...exportChapter, content: 'Sem formatação' },
    ]);
    expect((await exportDocx(manuscript)).size).toBeGreaterThan(1000);
    const controller = new AbortController();
    controller.abort();
    await expect(exportDocx(manuscript, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('keeps whitespace outside emphasis markers and preserves escaped prose', () => {
    const markdown = exportMarkdown(
      createExportDocument(exportBook, [
        {
          ...exportChapter,
          content:
            '<p><strong> antes </strong><em> depois </em> &lt;literal&gt; <code>a`b</code><code> padded </code> &amp;copy;</p>',
        },
      ]),
    );
    expect(markdown).toContain(' **antes**  *depois* ');
    expect(markdown).toContain('&lt;literal&gt;');
    expect(markdown).toContain('`` a`b ``');
    expect(markdown).toContain('`  padded  ` &amp;copy;');
  });

  it('makes safe readable filenames while retaining accents', () => {
    expect(exportFileName('../Crônicas: café?"', 'docx')).toBe('Crônicas café.docx');
    expect(exportFileName('... /', 'md')).toBe('manuscrito.md');
    expect(exportFileName('a'.repeat(150), 'json')).toHaveLength(125);
  });
});
