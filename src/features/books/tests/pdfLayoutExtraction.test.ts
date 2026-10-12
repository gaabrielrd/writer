import { describe, expect, it } from 'vitest';
import {
  extractPdfLayout,
  type LayoutItem,
  type LayoutPage,
} from '../services/pdfLayoutExtraction';

function item(str: string, x: number, y: number, height = 12, width = 200): LayoutItem {
  return { str, transform: [height, 0, 0, height, x, y], width, height };
}
function page(number: number, items: LayoutItem[], extra: Partial<LayoutPage> = {}): LayoutPage {
  return { number, width: 600, height: 800, items, ...extra };
}
const body = (prefix: string, x: number, y: number) =>
  Array.from({ length: 4 }, (_, i) =>
    item(prefix + ' linha de texto ' + (i + 1) + '.', x, y - i * 16),
  );

describe('PDF de aventuras', () => {
  it('preserva níveis de títulos e subtítulos em vez de achatar todos como h2', () => {
    const result = extractPdfLayout([
      page(1, [
        item('Parte 1: A chegada', 40, 730, 24),
        item('Esconderijo', 40, 680, 20),
        ...body('Prosa da seção', 40, 640),
        item('1. Entrada da Caverna', 40, 550, 18),
        ...body('Prosa do encontro', 40, 510),
        item('Tesouro', 40, 420, 16),
        ...body('Prosa do tesouro', 40, 380),
      ]),
    ]);
    expect(result.sections).toHaveLength(1);
    expect(
      result.sections[0]!.blocks.filter((block) => /^<h/.test(block.html)).map(
        (block) => block.html,
      ),
    ).toEqual(['<h2>Esconderijo</h2>', '<h3>1. Entrada da Caverna</h3>', '<h4>Tesouro</h4>']);
  });

  it('não confunde uma inicial decorativa, ênfase inline ou frase em negrito com título', () => {
    const result = extractPdfLayout([
      page(1, [
        item('Parte 1: A chegada', 40, 730, 24),
        item('A', 40, 670, 30, 20),
        item('aventura começa.', 60, 670, 12),
        { ...item('Uma porta', 40, 640, 12, 70), bold: true },
        item(' está aberta.', 110, 640, 12),
        { ...item('Uma frase inteira em negrito.', 40, 610), bold: true },
        { ...item('Uma frase em negrito', 40, 580), bold: true },
        { ...item('continua nesta segunda linha.', 40, 564), bold: true },
      ]),
    ]);
    const blocks = result.sections[0]!.blocks;
    expect(blocks.every((block) => !/^<h/.test(block.html))).toBe(true);
    expect(blocks.map((block) => block.text).join(' ')).toContain(
      'Uma frase em negrito continua nesta segunda linha.',
    );
  });

  it('reconhece subtítulo isolado em negrito do tamanho da prosa', () => {
    const result = extractPdfLayout([
      page(1, [
        item('Parte 1: A chegada', 40, 730, 24),
        item('Esconderijo', 40, 680, 20),
        ...body('Prosa da seção', 40, 640),
        { ...item('Tesouro', 40, 540), bold: true },
        ...body('Prosa do tesouro', 40, 500),
      ]),
    ]);
    expect(result.sections[0]!.blocks.find((block) => block.text === 'Tesouro')?.html).toBe(
      '<h3><strong>Tesouro</strong></h3>',
    );
  });

  it('junta um título quebrado em duas linhas sem juntar títulos de níveis distintos', () => {
    const result = extractPdfLayout([
      page(1, [
        item('Parte 1: A chegada', 40, 730, 24),
        item('A caverna dos', 40, 680, 20),
        item('ecos perdidos', 40, 656, 20),
        item('1. Entrada', 40, 620, 18),
        ...body('Prosa da entrada', 40, 580),
      ]),
    ]);
    expect(result.sections[0]!.blocks.slice(0, 2).map((block) => block.html)).toEqual([
      '<h2>A caverna dos ecos perdidos</h2>',
      '<h3>1. Entrada</h3>',
    ]);
  });

  it.each(['Parte 1:', 'Apêndice A', 'CAPÍTULO 01'])(
    'combina o marcador %s e o título separado sem perder prosa',
    (label) => {
      const result = extractPdfLayout([
        page(1, [
          item(label, 40, 730, 24),
          item('O caminho esquecido', 40, 700, 24),
          ...body('Prosa da abertura', 40, 650),
        ]),
      ]);
      expect(result.sections.map((section) => section.title)).toEqual([
        label.replace(/:$/, '') + ': O caminho esquecido',
      ]);
      expect(result.sections[0]!.blocks[0]?.text).toContain('Prosa da abertura');
    },
  );

  it('recompõe a abertura em duas colunas quando a coluna oposta começa mais alto', () => {
    const result = extractPdfLayout([
      page(1, [
        item('Parte 1:', 40, 720, 24),
        item('O caminho esquecido', 40, 690, 24),
        ...body('Prosa esquerda', 40, 650),
        ...body('Prosa direita', 330, 735),
      ]),
    ]);
    expect(result.sections.map((section) => section.title)).toEqual([
      'Parte 1: O caminho esquecido',
    ]);
    const text = result.sections[0]!.blocks.map((block) => block.text).join(' ');
    expect(text.indexOf('Prosa esquerda')).toBeLessThan(text.indexOf('Prosa direita'));
  });

  it('preserva a introdução como seção quando seguida por outro título do mesmo tamanho', () => {
    const result = extractPdfLayout([
      page(1, [
        item('Introdução', 40, 730, 24),
        item('Os personagens', 40, 700, 24),
        ...body('Prosa inicial', 40, 650),
      ]),
    ]);
    expect(result.sections[0]?.title).toBe('Introdução');
    expect(result.sections[0]?.blocks[0]?.html).toBe('<h2>Os personagens</h2>');
  });

  it('mantém o subtítulo menor separado de um marcador de parte sem título', () => {
    const result = extractPdfLayout([
      page(1, [
        item('Parte 1', 40, 730, 24),
        item('Uma vila', 40, 690, 18),
        ...body('Prosa da vila', 40, 650),
      ]),
    ]);
    expect(result.sections[0]?.title).toBe('Parte 1');
    expect(result.sections[0]?.blocks[0]?.html).toBe('<h2>Uma vila</h2>');
  });

  it('recompõe título de 18 pontos com entrelinha de 24 pontos como no PDF real', () => {
    const result = extractPdfLayout([
      page(1, [
        item('Apêndice B: Monstros', 40, 730, 24),
        item('Vulnerabilidades, Resistências e', 40, 650, 18),
        item('Imunidades', 40, 626, 18),
        ...body('Prosa da regra', 40, 580),
      ]),
    ]);
    expect(result.sections[0]?.blocks[0]?.html).toBe(
      '<h2>Vulnerabilidades, Resistências e Imunidades</h2>',
    );
  });

  it('não une subtítulos próximos de colunas diferentes nem de páginas diferentes', () => {
    const result = extractPdfLayout([
      page(1, [
        item('Parte 1: A chegada', 40, 730, 24),
        ...body('Coluna esquerda', 40, 680),
        item('Esquerda', 40, 610, 20),
        item('Direita', 330, 600, 20),
        ...body('Coluna direita', 330, 560),
      ]),
      page(2, [item('Página seguinte', 40, 730, 20), ...body('Prosa seguinte', 40, 690)]),
    ]);
    expect(
      result.sections[0]!.blocks.filter((block) => /^<h/.test(block.html)).map(
        (block) => block.text,
      ),
    ).toEqual(['Esquerda', 'Direita', 'Página seguinte']);
  });

  it('converte tabela simples de encontros para pares de rótulos e valores', () => {
    const result = extractPdfLayout([
      page(1, [
        item('1d12', 40, 650, 12, 30),
        item('Monstro', 150, 650, 12, 60),
        item('1-3', 40, 630, 12, 30),
        item('Dois goblins', 150, 630, 12, 80),
        item('4-6', 40, 610, 12, 30),
        item('Um bugbear', 150, 610, 12, 80),
      ]),
    ]);
    expect(result.sections[0]!.blocks.map((b) => b.text)).toEqual([
      '1d12: 1-3; Monstro: Dois goblins',
      '1d12: 4-6; Monstro: Um bugbear',
    ]);
  });
  it('mantém linhas de tabela sem cabeçalho e sinaliza três colunas para conferência', () => {
    const rows = [item('1-3', 40, 650, 12, 30), item('Dois goblins', 150, 650, 12, 80)];
    const unknown = extractPdfLayout([page(1, rows)]);
    expect(unknown.sections[0]!.blocks[0]?.text).toBe('1-3 | Dois goblins');
    expect(unknown.warnings[0]?.code).toBe('table');
    const columns = extractPdfLayout([
      page(1, [
        ...body('Coluna primeira', 40, 650).map((i) => ({ ...i, width: 125 })),
        ...body('Coluna segunda', 230, 650).map((i) => ({ ...i, width: 125 })),
        ...body('Coluna terceira', 420, 650).map((i) => ({ ...i, width: 125 })),
      ]),
    ]);
    expect(columns.warnings.find((w) => w.code === 'layout')?.pages).toEqual([1]);
  });
  it('ordena duas colunas e move o título pintado por último antes de sua prosa', () => {
    const result = extractPdfLayout([
      page(1, [
        ...body('Direita', 330, 650),
        ...body('Esquerda', 40, 650),
        item('Parte 1: A chegada', 40, 720, 24, 330),
      ]),
    ]);
    expect(result.sections.map((s) => s.title)).toEqual(['Parte 1: A chegada']);
    const text = result.sections[0]!.blocks.map((b) => b.text).join(' ');
    expect(text.indexOf('Esquerda linha de texto 4.')).toBeLessThan(
      text.indexOf('Direita linha de texto 1.'),
    );
    expect(result.sections[0]!.pages).toEqual([1]);
  });

  it('respeita título largo entre faixas de colunas e introdução acima da coluna oposta', () => {
    const result = extractPdfLayout([
      page(1, [
        item('Introdução', 40, 730, 24, 130),
        ...body('Primeira faixa esquerda', 40, 710),
        ...body('Primeira faixa direita', 330, 735),
        item('Parte 1: Um caminho mais longo', 40, 500, 24, 400),
        ...body('Segunda faixa esquerda', 40, 460),
        ...body('Segunda faixa direita', 330, 460),
      ]),
    ]);
    expect(result.sections.map((s) => s.title)).toEqual([
      'Introdução',
      'Parte 1: Um caminho mais longo',
    ]);
    expect(result.sections[0]!.blocks.map((b) => b.text).join(' ')).not.toContain('Segunda faixa');
    expect(result.sections[1]!.blocks.map((b) => b.text).join(' ')).not.toContain('Primeira faixa');
  });

  it('remove sumário sem marcador e reconhece partes e apêndices como seções', () => {
    const titles = [
      'Introdução',
      'Parte 1: A chegada',
      'Parte 2: A vila',
      'Parte 3: A floresta',
      'Parte 4: A mina',
      'Apêndice A: Itens',
      'Apêndice B: Monstros',
    ];
    const result = extractPdfLayout([
      page(
        1,
        titles.map((title, i) => item(title + ' ........ ' + (i + 2), 40, 650 - i * 20)),
      ),
      ...titles.map((title, i) =>
        page(i + 2, [item(title, 40, 700, 24), item('Prosa da seção ' + i + '.', 40, 650)]),
      ),
    ]);
    expect(result.sections.map((s) => s.title)).toEqual(titles);
    expect(result.sections.some((s) => s.blocks.some((b) => b.text.includes('....')))).toBe(false);
    expect(result.warnings.find((w) => w.code === 'contents')?.pages).toEqual([1]);
  });

  it('confirma sumário pelos títulos mesmo depois de juntar número e nome dos capítulos', () => {
    const titles = ['A chegada', 'A floresta', 'O retorno'];
    const result = extractPdfLayout([
      page(1, [item('Livro de teste', 40, 700, 24), item('Capa e autor', 40, 650)]),
      page(2, [
        item('Sumário', 40, 720, 24),
        ...titles.map((title, i) =>
          item(i + 1 + ' ' + title + ' ....... ' + (i + 3), 40, 650 - i * 25),
        ),
      ]),
      ...titles.map((title, i) =>
        page(i + 3, [
          item('CAPÍTULO ' + (i + 1), 40, 720),
          item(title, 40, 685, 24),
          ...body('Prosa de capítulo', 40, 630),
        ]),
      ),
    ]);
    expect(result.sections.map((section) => section.title)).toEqual(
      titles.map((title, i) => 'CAPÍTULO ' + (i + 1) + ': ' + title),
    );
    expect(result.warnings.find((warning) => warning.code === 'contents')?.pages).toEqual([1, 2]);
    expect(
      result.sections
        .flatMap((section) => section.blocks)
        .some((block) => /Capa e autor|\.\.\./.test(block.text)),
    ).toBe(false);
  });

  it('preserva pontilhados de uma lista que não corresponde a títulos posteriores', () => {
    const result = extractPdfLayout([
      page(1, [
        item('Introdução', 40, 700, 24),
        item('Item A ........ 1', 40, 650),
        item('Item B ........ 2', 40, 630),
        item('Item C ........ 3', 40, 610),
      ]),
    ]);
    expect(result.sections[0]!.blocks.map((b) => b.text).join(' ')).toContain('Item A');
    expect(result.warnings).toEqual([]);
  });

  it('preserva salas numeradas, subtítulos e menções de partes dentro da seção', () => {
    const result = extractPdfLayout([
      page(1, [
        item('Parte 1: A chegada', 40, 700, 24),
        item('1. Entrada da Caverna', 40, 650, 20),
        item('Retorne à parte 3 se precisar de outra pista.', 40, 610),
        item('Tesouros', 40, 580, 18),
        item('Parte 2: anotação com tipografia de prosa', 40, 550),
      ]),
    ]);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]!.blocks[0]!.html).toBe('<h2>1. Entrada da Caverna</h2>');
    expect(result.sections[0]!.blocks.map((b) => b.text).join(' ')).toContain('Parte 2: anotação');
  });

  it('preserva caixas como citações e formatação inline sem HTML ativo', () => {
    const result = extractPdfLayout([
      page(
        1,
        [
          item('Capítulo 1', 40, 720, 24),
          { ...item('Vocês encontram <script>', 50, 630), bold: true },
          { ...item('Uma trilha escondida.', 50, 615), italic: true },
          item('Texto do mestre fora da caixa.', 40, 560),
        ],
        { boxes: [{ x: 45, y: 590, width: 220, height: 70 }] },
      ),
    ]);
    const html = result.sections[0]!.blocks.map((b) => b.html).join('');
    expect(html).toContain(
      '<blockquote><p><strong>Vocês encontram &lt;script&gt;</strong> <em>Uma trilha escondida.</em></p></blockquote>',
    );
    expect(html).toContain('<p>Texto do mestre fora da caixa.</p>');
  });

  it('associa os seis atributos a seus valores e preserva dados, CD, XP e medidas', () => {
    const result = extractPdfLayout([
      page(1, [
        item('Apêndice B: Monstros', 40, 720, 24),
        item('Classe de Armadura 14', 40, 670),
        item('Pontos de Vida 26 (4d10 + 4)', 40, 650),
        item('FOR DES CON INT SAB CAR', 40, 630),
        item('14 (+2) 16 (+3) 12 (+1) 2 (-4) 11 (+0) 4 (-3)', 40, 615),
        item('Força CD 12; 200 XP; alcance 1,5 m.', 40, 580),
      ]),
    ]);
    const text = result.sections[0]!.blocks.map((b) => b.text).join(' ');
    expect(text).toContain(
      'FOR: 14 (+2); DES: 16 (+3); CON: 12 (+1); INT: 2 (-4); SAB: 11 (+0); CAR: 4 (-3)',
    );
    expect(text).toContain('26 (4d10 + 4)');
    expect(text).toContain('CD 12; 200 XP; alcance 1,5 m');
  });

  it('avisa quando uma tabela de atributos é ambígua sem descartar seus valores', () => {
    const result = extractPdfLayout([
      page(1, [item('FOR DES CON INT SAB CAR', 40, 630), item('14 (+2) 16 (+3)', 40, 615)]),
    ]);
    expect(result.warnings[0]?.code).toBe('table');
    expect(result.sections[0]!.blocks.map((b) => b.text).join(' ')).toContain('14 (+2) 16 (+3)');
  });

  it('identifica páginas sem texto e imagens em documentos mistos', () => {
    const result = extractPdfLayout([
      page(1, [item('Introdução', 40, 720, 24), item('Texto aproveitável.', 40, 650)], {
        hasImages: true,
        uncertain: true,
      }),
      page(2, [item('2', 40, 30)], { hasImages: true }),
      page(3, []),
    ]);
    expect(result.sections).toHaveLength(1);
    expect(result.warnings.find((w) => w.code === 'no-text')?.pages).toEqual([2, 3]);
    expect(result.warnings.find((w) => w.code === 'visual-content')?.pages).toEqual([1]);
    expect(result.warnings.find((w) => w.code === 'layout')?.pages).toEqual([1]);
  });

  it('remove margens repetidas preservando prosa idêntica e títulos grandes no alto', () => {
    const pages = Array.from({ length: 3 }, (_, i) =>
      page(i + 1, [
        item('Título recorrente', 40, 780),
        item('Capítulo ' + (i + 1), 40, 730, 24),
        item('Título recorrente', 40, 630),
        item('Texto final.', 40, 610),
        item(String(i + 1), 40, 30),
      ]),
    );
    const result = extractPdfLayout(pages);
    expect(result.sections).toHaveLength(3);
    for (const section of result.sections)
      expect(section.blocks.map((b) => b.text).join(' ')).toBe('Título recorrente Texto final.');
  });

  it('combina número e título separados em PDF de uma coluna', () => {
    const result = extractPdfLayout([
      page(1, [
        item('CAPÍTULO 01', 40, 700),
        item('O retorno', 40, 660, 24),
        item('Prosa de uma coluna.', 40, 610),
      ]),
    ]);
    expect(result.sections[0]?.title).toBe('CAPÍTULO 01: O retorno');
    expect(result.sections[0]?.blocks[0]?.text).toBe('Prosa de uma coluna.');
  });

  it('mantém palavras e pontuação fragmentadas sem inserir espaços', () => {
    const result = extractPdfLayout([
      page(1, [
        item('Uma', 40, 600, 12, 20),
        item('memó', 65, 600, 12, 30),
        item('ria', 95, 600, 12, 15),
        item('.', 110, 600, 12, 3),
      ]),
    ]);
    expect(result.sections[0]?.blocks[0]?.text).toBe('Uma memória.');
  });
});
