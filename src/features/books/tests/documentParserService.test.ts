import { describe, expect, it, vi } from 'vitest';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import {
  extractPlainText,
  splitIntoChapters,
  parseDocumentFile,
} from '../services/documentParserService';

vi.mock('mammoth', () => ({
  default: {
    convertToHtml: vi.fn(),
  },
}));

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: '' },
  version: '4.0.0',
}));

describe('documentParserService', () => {
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
          items: [{ str: 'Capítulo 1' }, { str: 'História em PDF aqui.' }],
        }),
      });

      vi.mocked(pdfjsLib.getDocument).mockReturnValueOnce({
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
