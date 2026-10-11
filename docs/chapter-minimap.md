# Minimapa do capítulo

O editor mostra uma visão gráfica do capítulo à esquerda do manuscrito, entre
a borda do editor e o texto. O mapa permanece visível durante a rolagem, abaixo
da barra de ferramentas e do resumo de lore. O capítulo permanece editável,
sem seletor Edição/Preview.

## Representação e navegação

- Parágrafos aparecem como conjuntos de linhas, na ordem e proporção vertical
  do texto renderizado. Títulos têm traços mais fortes e largura distinta por nível.
- Ocorrências de entidades aparecem na margem direita do mapa. Personagens usam
  traço arredondado, locais tracejado, conceitos pontilhado e outros um traço neutro.
  As cores correspondem ao fundo das tags de lore: `accent` para personagens,
  verde das tags `success` para locais, `primary` para conceitos e `secondary`
  para outros. A linha colorida tem 1 px e o contorno 2 px, sem engrossar com a
  escala do SVG. Cada marca reserva 1 px livre até a próxima. Ocorrências na
  mesma faixa de 3 px compartilham uma marca;
  categorias diferentes dividem sua largura, com cores lado a lado.
  O tooltip informa categoria, entidade e termo reconhecido.
- O retângulo com borda e fundo discreto representa a parte do manuscrito visível.
- Clicar no mapa rola até a região correspondente. Clicar junto a uma marca
  navega ao bloco ou à ocorrência; não abre a ficha de lore.
- Tab leva ao mapa. Setas escolhem destinos, Home/End escolhem o primeiro/último,
  e Enter ou Espaço confirmam a navegação. O destino tem rótulo e foco visível.
- Em capítulo vazio, o mapa informa o estado e não oferece destinos.

A navegação altera somente a rolagem: não move o cursor, não modifica a seleção
do manuscrito nem cria uma edição, salvamento ou geração de IA. A rolagem é
imediata, inclusive quando a preferência de movimento reduzido está ativa.

## Atualização e compatibilidade

O mapa deriva do documento Tiptap/ProseMirror em memória, incluindo conteúdo
legado já interpretado pelo editor. Edição, colagem, desfazer/refazer, substituição
externa e alteração de lore atualizam os destinos. As posições usam a geometria
renderizada, incluindo quebra de linhas e formatação. O reconhecimento reutiliza
o motor público de lore: nomes, aliases e entidades locais/globais recebidas pelo
editor, sem correspondências entre blocos e sem entidades em blocos de código.

Listas e citações preservam seus parágrafos; outros blocos de texto mantêm sua
posição no mapa. Sugestões de IA ainda não aceitas não são destinos do documento.

No desktop, o texto rola em sua área interna. Até 760 px, a página rola e a faixa
do minimapa permanece aderente à viewport, com largura reduzida. Os temas claro,
escuro e sépia usam os mesmos tokens semânticos.

## Organização e limites

`src/features/editor/model/chapterMinimap.ts` deriva os destinos;
`hooks/useChapterMinimap.ts` mede o texto, acompanha scroll/resize e realiza a
navegação; `components/ChapterMinimap.tsx` apresenta o mapa e o controle acessível.
O componente é interno ao editor, sem nova dependência ou persistência.

A estrutura só é reconstruída quando documento ou entidades mudam. Leituras de
geometria são agrupadas por frame e refeitas após mudanças de conteúdo ou tamanho.
Rolagem atualiza apenas o destaque. Marcas coincidentes são agrupadas no desenho
SVG, enquanto cada ocorrência continua disponível pelo teclado. Em alta densidade,
o clique escolhe a marca mais próxima; setas permitem distinguir destinos sobrepostos.

Arrastar o destaque, filtros e preferências persistidas ficam fora desta versão.
Veja [testes](testing.md) para os cenários automatizados.
