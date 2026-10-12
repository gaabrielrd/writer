import { readFile } from 'node:fs/promises';
import {
  capture,
  expect,
  expectDialogWithinViewport,
  expectNoHorizontalOverflow,
  test,
} from './support';

const titles = [
  'Introdução',
  'Parte 1: A chegada',
  'Parte 2: A vila',
  'Parte 3: A floresta',
  'Parte 4: A mina',
  'Apêndice A: Itens Mágicos',
  'Apêndice B: Monstros',
];

test('aventura em duas colunas conserva estrutura, caixas, atributos e revisão', async ({
  page,
  context,
}, testInfo) => {
  const source = await context.newPage();
  await source.setContent(
    '<style>@page {size:A5; margin:35px} body{font:12px Georgia} section{break-after:page} h1{font-size:24px;margin:0 0 20px} h2{font-size:18px} h3{font-size:16px} .columns{display:grid;grid-template-columns:1fr 1fr;gap:25px} p{margin:0 0 10px} blockquote{background:#ffefcf;border-left:2px solid #471f20;padding:10px;margin:10px 0} .map{height:300px;background:#eedcaa;border:3px solid #471f20}</style>' +
      '<section>' +
      titles.map((title, i) => '<p>' + title + ' ........ ' + (i + 2) + '</p>').join('') +
      '</section>' +
      titles
        .map(
          (title, i) =>
            '<section><h1>' +
            title +
            '</h1><div class="columns"><div>' +
            Array.from(
              { length: 5 },
              (_, n) =>
                '<p>Esquerda ' +
                i +
                '-' +
                n +
                ': o grupo encontrou uma trilha e seguiu até a vila.</p>',
            ).join('') +
            '<blockquote>Vocês veem uma torre antiga. <strong>Uma porta</strong> está aberta.</blockquote></div><div><h2>1. Entrada da Caverna</h2>' +
            Array.from(
              { length: 4 },
              (_, n) =>
                '<p>Direita ' +
                i +
                '-' +
                n +
                ': o mestre descreve os encontros e tesouros da aventura.</p>',
            ).join('') +
            '<h3>Tesouro da entrada</h3><p>Uma moeda está escondida.</p><p>Pontos de Vida 26 (4d10 + 4)</p><p>FOR DES CON INT SAB CAR</p><p>14 (+2) 16 (+3) 12 (+1) 2 (-4) 11 (+0) 4 (-3)</p><p>CD 15; 200 XP; alcance 1,5 m.</p></div></div></section>' +
            (i === 1 ? '<section><div class="map"></div></section>' : ''),
        )
        .join(''),
  );
  const buffer = await source.pdf({ format: 'A5', printBackground: true });
  await source.close();
  await page.goto('/');
  await page.getByRole('button', { name: 'Importar Documento', exact: true }).click();
  await page
    .getByLabel('Arquivo do manuscrito')
    .setInputFiles({ name: 'campanha.pdf', mimeType: 'application/pdf', buffer });
  await expect(page.getByText(/7 capítulos encontrados/)).toBeVisible();
  for (let i = 0; i < titles.length; i++)
    await expect(page.getByLabel(`Título do capítulo ${i + 1}`, { exact: true })).toHaveValue(
      titles[i],
    );
  await expect(
    page.getByText('Página sem texto extraível; mapas e imagens não serão importados.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Conferir conteúdo', exact: true }).nth(1).click();
  const preview = page.getByRole('textbox', {
    name: 'Texto importado de Parte 1: A chegada',
    exact: true,
  });
  await expect(preview).toContainText('Pontos de Vida 26 (4d10 + 4)');
  await expect(preview).toContainText('FOR: 14 (+2); DES: 16 (+3)');
  await expect(preview.locator('blockquote')).toContainText('Vocês veem uma torre antiga.');
  await expect(
    preview.getByRole('heading', { name: '1. Entrada da Caverna', level: 2 }),
  ).toBeVisible();
  await expect(
    preview.getByRole('heading', { name: 'Tesouro da entrada', level: 3 }),
  ).toBeVisible();
  const text = await preview.textContent();
  expect(text!.indexOf('Esquerda 1-4')).toBeLessThan(text!.indexOf('Direita 1-0'));
  await expect(page.getByRole('img', { name: /Página original 3 do PDF/ })).toBeVisible();
  await preview.focus();
  await expect(preview).toBeFocused();
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'campanha-duas-colunas-revisao');
  await page.getByRole('combobox', { name: 'Dividir antes do trecho', exact: true }).click();
  await page.getByRole('option').nth(0).click();
  await page.getByRole('button', { name: 'Dividir capítulo', exact: true }).click();
  await expect(page.getByText(/8 capítulos encontrados/)).toBeVisible();
  await page.getByRole('button', { name: 'Unir ao próximo capítulo', exact: true }).click();
  await expect(page.getByText(/7 capítulos encontrados/)).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  await capture(page, testInfo, 'campanha-revisao-320px');
  await expectNoHorizontalOverflow(page, 'campanha-320');
});

test('arquivo real de Phandelver recupera sete seções e identifica os três mapas', async ({
  page,
}, testInfo) => {
  const sourcePath = process.env.WRITER_IMPORT_PDF;
  test.skip(
    !sourcePath,
    'Informe WRITER_IMPORT_PDF para verificar o arquivo local; o PDF não integra o repositório.',
  );
  const buffer = await readFile(sourcePath!);
  await page.goto('/');
  await page.getByRole('button', { name: 'Importar Documento', exact: true }).click();
  await page
    .getByLabel('Arquivo do manuscrito')
    .setInputFiles({ name: 'Phandelver.pdf', mimeType: 'application/pdf', buffer });
  await expect(page.getByText(/7 capítulos encontrados/)).toBeVisible();
  const expected = [
    'Introdução',
    'Parte 1: Flechas de Goblin',
    'Parte 2: Phandalin',
    'Parte 3: A Teia da Aranha',
    'Parte 4: A Caverna Onda Eco',
    'Apêndice A: Itens Mágicos',
    'Apêndice B: Monstros',
  ];
  for (let i = 0; i < expected.length; i++)
    await expect(page.getByLabel(`Título do capítulo ${i + 1}`, { exact: true })).toHaveValue(
      expected[i],
    );
  for (const number of [5, 13, 43])
    await expect(page.getByRole('button', { name: `Página ${number}`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Conferir conteúdo', exact: true }).nth(1).click();
  const preview = page.getByRole('textbox', {
    name: 'Texto importado de Parte 1: Flechas de Goblin',
    exact: true,
  });
  await expect(
    preview.getByRole('heading', { name: 'Esconderijo Dentefino', level: 2 }),
  ).toBeVisible();
  await expect(
    preview.getByRole('heading', { name: 'Características Gerais', level: 3 }),
  ).toBeVisible();
  await expect(
    preview.getByRole('heading', { name: 'Conduzindo a Carroça', level: 4 }),
  ).toBeVisible();
  await expect(preview).toContainText('A aventura inicia com os personagens escoltando uma');
  await expect(preview.locator('blockquote').first()).toContainText('Gundren');
  await expect(page.getByRole('img', { name: /Página original 6 do PDF/ })).toBeVisible();
  await expectDialogWithinViewport(page);
  await capture(page, testInfo, 'phandelver-secoes-e-original');
  await page.getByRole('button', { name: 'Conferir conteúdo', exact: true }).last().click();
  const monsters = page.getByRole('textbox', {
    name: 'Texto importado de Apêndice B: Monstros',
    exact: true,
  });
  await expect(
    monsters.getByRole('heading', {
      name: 'Vulnerabilidades, Resistências e Imunidades',
      level: 3,
    }),
  ).toBeVisible();
  await expect(monsters).toContainText('Pontos de Vida 26 (4d10 + 4)');
  await expect(monsters).toContainText(
    'FOR: 14 (+2); DES: 16 (+3); CON: 12 (+1); INT: 2 (-4); SAB: 11 (+0); CAR: 4 (-3)',
  );
  await testInfo.attach('resultado', {
    body: JSON.stringify({
      sections: expected,
      mapPages: [5, 13, 43],
      source: 'arquivo local do usuário',
    }),
    contentType: 'application/json',
  });
});
