# Minimapa do capítulo

- **Data**: 2026-10-11
- **Branch**: `master` (commit local autorizado; sem push ou deploy)
- **Plano de origem**: plano aprovado na conversa
- **Estado**: implementação local validada por testes, lint e build; fechamento
  global pendente da formatação preexistente fora deste escopo e do CI.

## Objetivo

Permitir que o autor reconheça a estrutura do capítulo, acompanhe o trecho
visível e navegue pelo manuscrito sem perder sua seleção ou posição de escrita.

## Funcionalidades entregues

- **Visão do capítulo** — faixa gráfica à esquerda do texto com parágrafos,
  títulos por nível e ocorrências de entidades, incluindo nomes e aliases.
- **Posição de leitura** — retângulo acompanha a área realmente visível em
  rolagem interna no desktop e na rolagem da página em celular.
- **Navegação** — clique por região ou marca; teclado com setas, Home/End e
  Enter/Espaço. Tooltips e rótulos identificam o destino.
- **Atualização** — documento, formatação, colagem, lore, desfazer/refazer e
  redimensionamento atualizam o mapa em Edição e Preview.
- **Responsividade e temas** — faixa de 88 px no desktop e 40 px até 760 px,
  sem sobreposição ao texto, nos temas claro, escuro e sépia.

## Critérios de aceite

- [x] Minimapa entre a borda esquerda do editor e o manuscrito.
- [x] Parágrafos, títulos e ocorrências aparecem na ordem do texto.
- [x] Destaque corresponde à viewport no início, meio e fim.
- [x] Clique e teclado tornam o destino visível.
- [x] Documento/lore e redimensionamento atualizam os destinos; cliques em
      destinos antigos são recusados enquanto a nova geometria é medida.
- [x] Navegação preserva conteúdo, seleção, histórico e não dispara salvamento/IA.
- [x] Três temas e largura de 320 px sem transbordamento horizontal.
- [ ] Definição de concluído global: `npm run validate` verde e CI.

## Arquivos alterados

| Arquivo                                                    | Mudança                                                        |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| `src/features/editor/components/RichEditor.tsx`            | Integração do mapa e referência da área rolável.               |
| `src/features/editor/components/RichEditor.module.css`     | Faixa lateral e rolagem responsiva.                            |
| `src/features/editor/components/ChapterMinimap.tsx`        | Desenho, tooltips e navegação acessível.                       |
| `src/features/editor/components/ChapterMinimap.module.css` | Temas, estados e faixa aderente em celular.                    |
| `src/features/editor/model/chapterMinimap.ts`              | Estrutura, ocorrências e projeção da viewport.                 |
| `src/features/editor/hooks/useChapterMinimap.ts`           | Geometria, observação, rolagem e limpeza.                      |
| `src/features/editor/tests/chapterMinimapModel.test.ts`    | Estrutura e capítulo extenso.                                  |
| `src/features/editor/tests/ChapterMinimap.test.tsx`        | Interação por mouse, toque e teclado.                          |
| `src/features/editor/tests/useChapterMinimap.test.tsx`     | Sincronização, navegação e ciclo de vida.                      |
| `src/features/editor/tests/RichEditor.test.tsx`            | Atualização real do editor e consultas de menção por nome.     |
| `e2e/visual/chapter-minimap.visual.ts`                     | Navegação, geometria, seleção, temas e 320 px.                 |
| `e2e/visual/writer.visual.ts`                              | Identifica explicitamente o menu de menções, distinto do mapa. |
| `docs/chapter-minimap.md`                                  | Uso, funcionamento e limites.                                  |
| `docs/architecture.md`                                     | Responsabilidade interna do editor.                            |
| `docs/styleguide.md`                                       | Composição, temas e acessibilidade.                            |
| `docs/testing.md`                                          | Cenários e comando de navegador.                               |
| `docs/entregas/2026-10-11-minimapa-do-capitulo.md`         | Evidência e pendências reais.                                  |

## Testes

| Teste                                                  | Tipo       | O que cobre                                                                                                     |
| ------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------- |
| `chapterMinimapModel.test.ts`                          | Unidade    | Títulos, blocos aninhados, aliases, marcas inline, código excluído, vazio, 15 mil palavras e viewport limitada. |
| `ChapterMinimap.test.tsx`                              | Componente | Escolha/aceite por teclado, limites, clique em bloco/ocorrência/espaço e toque sem salto ao iniciar o gesto.    |
| `useChapterMinimap.test.tsx`                           | Integração | Geometria, scroll/resize, atualização externa/lore, seleção preservada, destinos antigos e desmontagem.         |
| `RichEditor.test.tsx`                                  | Componente | Atualização após substituir conteúdo, retirar lore e formatar título; regressões existentes preservadas.        |
| `chapter-minimap.visual.ts`                            | Navegador  | Geometria no início/meio/fim, entidade, seleção/HTML preservados, Edição/Preview, compêndio aberto e 320 px.    |
| `editor-adjustments.visual.ts`, `scrollbars.visual.ts` | Navegador  | Regressões de seleção, ações de IA, menções, compêndio e barras de rolagem.                                     |

Saída real da suíte completa (`npm run test`):

```text
Test Files  96 passed (96)
     Tests  670 passed (670)
All files          |   93.18 |    86.39 |   91.59 |    95.2 |
ℹ tests 68
ℹ pass 68
ℹ fail 0
ℹ tests 63
ℹ pass 63
ℹ fail 0
```

Os percentuais são instruções, ramos, funções e linhas, respectivamente.
Os testes específicos finais passaram em 4 arquivos / 26 testes. A matriz
de navegador com o minimapa e regressões passou em 42 cenários; a confirmação
do minimapa isolado passou nos 6 projetos. Capturas foram inspecionadas.

## Validações executadas

| Comando                          | Resultado real                                                               |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `npm ci --prefix functions`      | Dependências instaladas; auditoria sem vulnerabilidades.                     |
| `npm run validate`               | Interrompido por Prettier em 32 arquivos preexistentes fora desta alteração. |
| `npm run check:skills`           | Verde, 11 skills.                                                            |
| `npm run check:architecture`     | Verde.                                                                       |
| `npm run check:docs`             | Verde.                                                                       |
| `npm run check:styleguide`       | Verde.                                                                       |
| Prettier nos arquivos da entrega | Verde.                                                                       |
| `npm run lint`                   | Verde.                                                                       |
| `npm run test`                   | Verde, cobertura e suítes de infraestrutura/backend.                         |
| `npm run build`                  | Typecheck, bundle e smoke verdes.                                            |
| `git diff --check`               | Verde.                                                                       |

Trechos reais dos comandos:

```text
Verificacao de skills OK: 11 skill(s) validada(s) e sincronizada(s).
Verificação arquitetural OK.
Validação da documentação OK.
Verificação do styleguide OK.
[warn] Code style issues found in 32 files. Run Prettier with --write to fix.
All matched files use Prettier code style!
Smoke test do bundle OK.
42 passed (2.3m)
6 passed (32.8s)
```

## Fora do escopo

Arrastar o destaque, filtros, preferências persistidas, novas dependências,
mudanças de backend, push e deploy. O commit local foi autorizado após a implementação.

## Limitações e pendências conhecidas

O gate global de formatação já aponta arquivos fora do diff desta entrega,
incluindo `AGENTS.md`, `README.md`, criação assistida, functions e índices
Firestore. Eles foram preservados. A entrega registra resultados reais em
cumprimento de `AGENTS.md`; não declara `npm run validate` verde nem o fechamento
da definição de concluído enquanto essa pendência e o CI permanecerem.

Em capítulos densos, marcas na mesma faixa são agrupadas no SVG. O clique
escolhe o destino mais próximo; o teclado mantém cada ocorrência disponível.
No fim do editor em celular, a faixa sai naturalmente da tela ao continuar
rolando para o compêndio. A navegação mantém o fim do texto e o mapa na viewport.

## Como verificar manualmente

1. Abrir um capítulo com títulos, vários parágrafos e entidades do compêndio.
2. Rolar o manuscrito e observar o retângulo no mapa.
3. Clicar em uma região e em uma marca de entidade; o texto correspondente aparece.
4. Entrar no mapa com Tab, escolher com setas/Home/End e confirmar com Enter.
5. Editar, formatar e desfazer/refazer; conferir a atualização do mapa.
6. Alternar Preview e os três temas. Em 320 px, navegar ao início e ao fim com
   o compêndio aberto e confirmar que a faixa não cobre o texto.
