import { describe, expect, it, vi } from 'vitest';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import {
  extractPlainText,
  splitIntoChapters,
  parseDocumentFile,
  isSupportedDocument,
} from '../services/documentParserService';

vi.mock('mammoth', () => ({
  default: {
    convertToHtml: vi.fn(),
  },
}));

vi.mock('pdfjs-dist', () => ({
  OPS: {},
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: '' },
  version: '4.0.0',
}));

describe('documentParserService', () => {
  function textFile(text: string | Uint8Array, name: string): File {
    const bytes = typeof text === 'string' ? new TextEncoder().encode(text) : text;
    const file = new File([], name);
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.resolve(bytes.slice().buffer),
    });
    return file;
  }

  it.each(['.MD', '.markdown', '.txt', '.text', '.html', '.htm', '.pdf', '.docx'])(
    'aceita a extensão %s sem depender do MIME',
    (extension) => {
      expect(isSupportedDocument('obra' + extension)).toBe(true);
      expect(isSupportedDocument('obra' + extension + '.exe')).toBe(false);
    },
  );

  it.each(['md', 'markdown'])(
    'importa %s com capítulos, formatação e subtítulos internos',
    async (extension) => {
      const result = await parseDocumentFile(
        textFile(
          '---\ntitle: "Meu livro"\n---\n# Meu livro\n\n## A chegada\n\nA **viajante** voltou.\n\n### Memórias\n\nAs *lembranças* ficaram.\n\n## A partida\n\nEla partiu.',
          'livro.' + extension,
        ),
      );
      expect(result.chapters.map((chapter) => chapter.title)).toEqual(['A chegada', 'A partida']);
      expect(result.chapters[0]?.content).toContain('<strong>viajante</strong>');
      expect(result.chapters[0]?.content).toContain('<h3>Memórias</h3>');
      expect(result.chapters[0]?.preview).toContain('lembranças');
      expect(result.chapters[0]?.content).not.toContain('title:');
      expect(result.totalWords).toBe(
        result.chapters.reduce((total, chapter) => total + chapter.wordCount, 0),
      );
    },
  );

  it.each(['txt', 'text'])(
    'importa %s, preservando texto literal, acentos e quebras',
    async (extension) => {
      const result = await parseDocumentFile(
        textFile(
          '\uFEFFCapítulo 1\r\nUm <p> literal & **asteriscos**.\r\n\r\nCapítulo 2\r\nAção e emoção.',
          'obra.' + extension,
        ),
      );
      expect(result.chapters).toHaveLength(2);
      expect(result.chapters[0]?.content).toContain('&lt;p&gt; literal &amp; **asteriscos**');
      expect(result.chapters[0]?.preview).toContain('<p> literal & **asteriscos**');
      expect(result.chapters[1]?.preview).toBe('Ação e emoção.');
    },
  );

  it('decodifica UTF-16 com BOM e Windows-1252', async () => {
    const utf16 = new Uint8Array([255, 254, 65, 0, 231, 0, 227, 0, 111, 0]);
    expect((await parseDocumentFile(textFile(utf16, 'utf16.txt'))).chapters[0]?.preview).toBe(
      'Ação',
    );
    expect(
      (await parseDocumentFile(textFile(new Uint8Array([65, 231, 227, 111]), 'legado.txt')))
        .chapters[0]?.preview,
    ).toBe('Ação');
  });

  it.each(['html', 'htm'])(
    'importa %s sem executar conteúdo ativo e preserva a prosa',
    async (extension) => {
      const result = await parseDocumentFile(
        textFile(
          '<!doctype html><html><head><title>metadado</title></head><body><h1>Capítulo I</h1><p onclick="alert(1)">Olá &amp; <em>adeus</em>.</p><script>alert(1)</script><h2>Uma lembrança</h2><p>Outro parágrafo.</p><h1>Capítulo II</h1><p>Fim.</p></body></html>',
          'obra.' + extension,
        ),
      );
      expect(result.chapters).toHaveLength(2);
      expect(result.chapters[0]?.content).toContain('<em>adeus</em>');
      expect(result.chapters[0]?.content).toContain('<h2>Uma lembrança</h2>');
      expect(result.chapters[0]?.content).not.toMatch(/onclick|alert|script|metadado/);
    },
  );

  it('exclui capa e sumário de texto com títulos repetidos', () => {
    const chapters = splitIntoChapters(
      'Minha obra\nSumário\nCapítulo 1\nCapítulo 2\n\nCapítulo 1\nPrimeira história.\n\nCapítulo 2\nÚltima história.',
    );
    expect(chapters.map((chapter) => chapter.title)).toEqual(['Capítulo 1', 'Capítulo 2']);
    expect(chapters[0]?.content).toBe('Primeira história.');
  });

  it('mantém um capítulo único com vários subtítulos, inclusive após o título do livro', () => {
    const html =
      '<h2>A chegada</h2><p>Uma viajante voltou.</p><h3>Memórias</h3><p>O passado.</p><h3>Promessas</h3><p>O futuro.</p>';
    for (const input of [html, '<h1>Meu livro</h1>' + html]) {
      const chapters = splitIntoChapters(input);
      expect(chapters.map((chapter) => chapter.title)).toEqual(['A chegada']);
      expect(chapters[0]?.content).toContain('<h3>Promessas</h3>');
    }
  });

  it('preserva prólogo curto e capítulos compostos apenas por listas', () => {
    const chapters = splitIntoChapters(
      '<p>Antes de começar.</p><h1>Capítulo 1</h1><ul><li>Uma lembrança.</li></ul><h1>Capítulo 2</h1><p>O fim.</p>',
    );
    expect(chapters.map((chapter) => chapter.title)).toEqual([
      'Início / Prólogo',
      'Capítulo 1',
      'Capítulo 2',
    ]);
    expect(chapters[1]?.content).toBe('<ul><li>Uma lembrança.</li></ul>');
  });

  it('exclui sumário HTML e preserva capítulos DOCX com títulos em parágrafos', () => {
    const chapters = splitIntoChapters(
      '<h1>Livro</h1><h2>Sumário</h2><p>Capítulo 1</p><p>Capítulo 2</p><p>Capítulo 1</p><p>Uma <strong>história</strong>.</p><p>Capítulo 2</p><p>Fim.</p>',
    );
    expect(chapters.map((chapter) => chapter.title)).toEqual(['Capítulo 1', 'Capítulo 2']);
    expect(chapters[0]?.content).toBe('<p>Uma <strong>história</strong>.</p>');
  });

  it('mantém um documento sem delimitadores e não descarta menção a sumário', async () => {
    const result = await parseDocumentFile(
      textFile('O sumário da pesquisa contém observações.\nTexto final.', 'anotações.txt'),
    );
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0]?.preview).toContain('Texto final.');
  });

  it.each(['', ' \r\n '])('informa ausência de conteúdo para texto vazio', async (text) => {
    await expect(parseDocumentFile(textFile(text, 'vazio.txt'))).rejects.toThrow(/vazio/);
  });

  it('rejeita dados binários renomeados para texto', async () => {
    await expect(
      parseDocumentFile(textFile(new Uint8Array([65, 0, 1, 2]), 'falso.txt')),
    ).rejects.toThrow(/binários/);
  });

  it('extractPlainText remove tags HTML e formata espacos', () => {
    const raw = '<p>Olá <strong>Mundo</strong>!&nbsp;Este é um <em>teste</em>.</p>';
    expect(extractPlainText(raw)).toBe('Olá Mundo! Este é um teste.');
  });

  describe('splitIntoChapters em Texto Plano', () => {
    it('divide texto plano por padroes como Capitulo 1, Capitulo 2, Prologo', () => {
      const text = `
Prólogo
Nas eras esquecidas, a magia fluía livremente pelas montanhas.

Capítulo 1: O Despertar
Ele acordou com o som estrondoso dos tambores na floresta. Era o início de tudo.

Capítulo 2 - A Travessia
O rio estava agitado e os cavalos relinchavam de medo.
      `.trim();

      const chapters = splitIntoChapters(text);
      expect(chapters).toHaveLength(3);

      expect(chapters[0]?.title).toBe('Prólogo');
      expect(chapters[0]?.wordCount).toBeGreaterThan(0);
      expect(chapters[0]?.selected).toBe(true);

      expect(chapters[1]?.title).toBe('Capítulo 1: O Despertar');
      expect(chapters[1]?.content).toContain('Ele acordou com o som estrondoso');

      expect(chapters[2]?.title).toBe('Capítulo 2 - A Travessia');
      expect(chapters[2]?.content).toContain('O rio estava agitado');
    });

    it('faz fallback para capitulo unico quando nao ha padroes de capitulo', () => {
      const text = 'Este é um texto contínuo sem nenhuma quebra de capítulo explícita.';
      const chapters = splitIntoChapters(text, 'Minha História');

      expect(chapters).toHaveLength(1);
      expect(chapters[0]?.title).toBe('Minha História');
      expect(chapters[0]?.content).toBe(text);
      expect(chapters[0]?.wordCount).toBe(11);
    });

    it('retorna array vazio para texto vazio', () => {
      expect(splitIntoChapters('')).toHaveLength(0);
      expect(splitIntoChapters('   ')).toHaveLength(0);
    });
  });

  describe('splitIntoChapters em HTML (DOCX)', () => {
    it('divide HTML utilizando tags de heading', () => {
      const html = `
<h1>Capítulo 1: A Torre de Marfim</h1>
<p>O sol refletia nas pedras brancas do castelo real.</p>
<h2>Capítulo 2: Sombras no Vale</h2>
<p>Ninguém ousava cruzar os portões após o cair da noite.</p>
      `.trim();

      const chapters = splitIntoChapters(html);
      expect(chapters).toHaveLength(2);

      expect(chapters[0]?.title).toBe('Capítulo 1: A Torre de Marfim');
      expect(chapters[0]?.content).toContain('O sol refletia');

      expect(chapters[1]?.title).toBe('Capítulo 2: Sombras no Vale');
      expect(chapters[1]?.content).toContain('Ninguém ousava cruzar');
    });
  });

  describe('parseDocumentFile', () => {
    it('informa necessidade de OCR para PDF sem texto e libera o documento', async () => {
      const destroy = vi.fn().mockResolvedValue(undefined);
      vi.mocked(pdfjsLib.getDocument).mockReturnValueOnce({
        destroy,
        promise: Promise.resolve({
          numPages: 1,
          getPage: vi.fn().mockResolvedValue({
            getTextContent: vi.fn().mockResolvedValue({ items: [] }),
            getViewport: () => ({ height: 800 }),
            cleanup: vi.fn(),
          }),
        }),
      } as unknown as ReturnType<typeof pdfjsLib.getDocument>);
      await expect(parseDocumentFile(textFile('PDF', 'digitalizado.pdf'))).rejects.toThrow(/OCR/);
      expect(destroy).toHaveBeenCalledOnce();
    });

    it('libera o PDF quando a extração de uma página falha', async () => {
      const destroy = vi.fn().mockResolvedValue(undefined);
      vi.mocked(pdfjsLib.getDocument).mockReturnValueOnce({
        destroy,
        promise: Promise.resolve({
          numPages: 1,
          getPage: vi.fn().mockRejectedValue(new Error('Página corrompida')),
        }),
      } as unknown as ReturnType<typeof pdfjsLib.getDocument>);
      await expect(parseDocumentFile(textFile('PDF', 'corrompido.pdf'))).rejects.toThrow(
        'Página corrompida',
      );
      expect(destroy).toHaveBeenCalledOnce();
    });

    it('processa arquivo DOCX com sucesso', async () => {
      vi.mocked(mammoth.convertToHtml).mockResolvedValueOnce({
        value: '<h1>Capítulo 1</h1><p>Era uma vez...</p>',
        messages: [],
      });

      const file = new File(['mock content'], 'Meu Livro Incrível.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      const result = await parseDocumentFile(file);

      expect(result.title).toBe('Meu Livro Incrível');
      expect(result.chapters).toHaveLength(1);
      expect(result.chapters[0]?.title).toBe('Capítulo 1');
      expect(result.totalWords).toBeGreaterThan(0);
    });

    it('processa arquivo PDF com sucesso', async () => {
      const mockGetPage = vi.fn().mockResolvedValue({
        getTextContent: vi.fn().mockResolvedValue({
          items: [{ str: 'Capítulo 1', hasEOL: true }, { str: 'História em PDF aqui.' }],
        }),
        getViewport: vi.fn().mockReturnValue({ height: 800 }),
        cleanup: vi.fn(),
      });

      vi.mocked(pdfjsLib.getDocument).mockReturnValueOnce({
        destroy: vi.fn().mockResolvedValue(undefined),
        promise: Promise.resolve({
          numPages: 1,
          getPage: mockGetPage,
        }),
      } as unknown as ReturnType<typeof pdfjsLib.getDocument>);

      const file = new File(['pdf data'], 'Documento.pdf', {
        type: 'application/pdf',
      });

      const result = await parseDocumentFile(file);

      expect(result.title).toBe('Documento');
      expect(result.chapters.length).toBeGreaterThan(0);
    });

    it('lanca erro para formato nao suportado', async () => {
      const file = new File(['data'], 'arquivo.exe', { type: 'application/octet-stream' });
      await expect(parseDocumentFile(file)).rejects.toThrow(/formato de arquivo não suportado/i);
    });
  });
});
