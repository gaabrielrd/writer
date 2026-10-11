import { describe, expect, it } from 'vitest';
import { extractPdfText, type PdfTextPage } from '../services/pdfTextExtraction';
import { splitIntoChapters } from '../services/documentParserService';

function item(str: string, y: number, height = 12, x = 50, hasEOL = true) {
  return { str, transform: [height, 0, 0, height, x, y], height, hasEOL };
}

describe('extração de PDF', () => {
  it('não insere espaços em palavras ou pontuação fragmentadas por mudanças de fonte', () => {
    const text = extractPdfText([
      {
        number: 1,
        height: 800,
        items: [
          { ...item('Uma', 600, 12, 50, false), width: 20 },
          { ...item('memó', 600, 12, 75, false), width: 30 },
          { ...item('ria', 600, 12, 105, false), width: 15 },
          { ...item('.', 600, 12, 120), width: 3 },
        ],
      },
    ]);
    expect(text).toBe('Uma memória.');
  });
  it('reconhece nove capítulos, sem capa, sumário, cabeçalhos ou numeração', () => {
    const pages: PdfTextPage[] = [
      { number: 1, height: 800, items: [item('Minha obra', 600)] },
      {
        number: 2,
        height: 800,
        items: [
          item('Sumário', 600),
          ...Array.from({ length: 9 }, (_, index) =>
            item('Capítulo ' + (index + 1) + ' .... ' + (index + 3), 560 - index * 30),
          ),
        ],
      },
      ...Array.from({ length: 9 }, (_, index) => ({
        number: index + 3,
        height: 800,
        items: [
          item('MINHA OBRA', 770),
          item('ATO I', 740),
          item(String(index + 3), 30),
          item('CAPÍTULO ' + String(index + 1).padStart(2, '0'), 650, 12),
          item('Título ' + (index + 1), 610, 24),
          item('Primeiro parágrafo do capítulo.', 570),
          item('Continuação da história.', 550),
          item('Última frase.', 530),
        ],
      })),
    ];
    const text = extractPdfText(pages);
    const chapters = splitIntoChapters(text);
    expect(chapters).toHaveLength(9);
    chapters.forEach((chapter, index) => {
      expect(chapter.title).toBe(
        'CAPÍTULO ' + String(index + 1).padStart(2, '0') + ': Título ' + (index + 1),
      );
      expect(chapter.content).toContain('Primeiro parágrafo do capítulo.');
      expect(chapter.content).toContain('Última frase.');
      expect(chapter.content).not.toMatch(/Sumário|MINHA OBRA|ATO I|^\d+$/m);
    });
  });

  it('usa coordenadas quando não há hasEOL e preserva fragmentos da mesma linha', () => {
    const text = extractPdfText([
      {
        number: 1,
        height: 800,
        items: [
          item('Capítulo', 600, 12, 50, false),
          item('1', 600, 12, 100, false),
          item('Uma história.', 550, 12, 50, false),
          { type: 'beginMarkedContent' },
        ],
      },
    ]);
    expect(splitIntoChapters(text)[0]?.title).toBe('Capítulo 1');
    expect(splitIntoChapters(text)[0]?.content).toBe('Uma história.');
  });

  it('preserva prosa repetida no corpo e não inventa subtítulo usando a primeira frase', () => {
    const pages = Array.from({ length: 3 }, (_, index) => ({
      number: index + 1,
      height: 800,
      items: [
        item('Cabeçalho', 770),
        item('Capítulo ' + (index + 1), 600),
        item('Texto repetido.', 560),
        item('Mais texto.', 540),
      ],
    }));
    const chapters = splitIntoChapters(extractPdfText(pages));
    expect(chapters).toHaveLength(3);
    expect(chapters[0]?.title).toBe('Capítulo 1');
    expect(chapters.every((chapter) => chapter.content.includes('Texto repetido.'))).toBe(true);
    expect(chapters.every((chapter) => !chapter.content.includes('Cabeçalho'))).toBe(true);
  });

  it('preserva linhas sem geometria, inclusive vazias, e PDF sem camada de texto', () => {
    expect(
      extractPdfText([
        {
          number: 1,
          height: 0,
          items: [
            { str: 'Capítulo 1', hasEOL: true },
            { str: '', hasEOL: true },
            { str: 'Texto final.' },
          ],
        },
      ]),
    ).toContain('Texto final.');
    expect(extractPdfText([{ number: 1, height: 800, items: [] }])).toBe('');
  });
});
