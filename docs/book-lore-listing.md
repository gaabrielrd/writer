# Listagem leve do compêndio de livros

Nos detalhes do livro, a lista e os cartões consultam somente nome, categoria,
apelidos, resumo, visibilidade e contagem de relações. A ficha completa continua
sendo buscada ao abrir “Ver Ficha” ou o editor nativo. Busca, filtros e seleção
mantêm o conteúdo integral dos nomes, apelidos e resumos, sem truncamento lógico.

## Contrato de leitura

A ação existente `listBookLoreRead`, de `loreApi`, aceita explicitamente
`projection: 'summary'` com `tokenVersion: 2`. Sem essa opção, conserva a
resposta de metadata v1 e o protocolo completo anterior. Não há nova Function.
A opção não é disponibilizada aos leitores internos de jobs de restauração.

Cada página contém até 50 itens em ordem nativa de ID, com `listToken`, cursor,
ID e token v2 da origem. A resposta projetada usa `schemaVersion: 2` e não
contém detalhes, campos estruturados, relações completas ou ponteiros físicos.
O servidor usa o leitor contextual autorizado e confere a identidade nativa
da projeção contra o item selecionado na mesma transação. As leituras por página
têm concorrência limitada a quatro fichas.

Depois de obter todas as páginas, o cliente reconfere a lista inteira apenas
por metadata, exigindo o mesmo clock, IDs e tokens. Só publica o resultado
completo depois dessa conferência. Mudança de conta, contexto, clock, identidade
ou falha de leitura impede a publicação. Os dados ficam somente em RAM.

`BookLoreSummary` é uma projeção de apresentação, separada de
`BookLorePresentation` e `BookLoreEditSource`. Não é uma captura C1 completa nem
entrada de escrita. Visualizar uma ficha exige nova captura completa com o
token original; editar, retirar e mudar visibilidade continuam nos protocolos
nativos com seus próprios gates, revisão e confirmação.

## Limites e publicação

Uma lista de 17 fichas usa duas RPCs: uma página projetada e uma reconferência
de metadata. O tempo real depende de rede, inicialização das Functions, tamanho
dos resumos e representação armazenada; não há promessa de latência fixa.

Gerações achatadas leem somente os campos selecionados e a privacidade, sem
buscar corpos de detalhes, campos estruturados ou páginas de relações. Bases
legadas monolíticas ainda precisam ser percorridas e ter o hash conferido no
servidor; apenas a projeção selecionada é retida e enviada ao navegador.
Documentos inline já contêm os dados no próprio documento. A listagem não
migra nem regrava nenhuma dessas representações.

Por página, o orçamento agregado é de 32 MiB de leitura, 512 partes e 900.000
bytes retidos pela projeção. Excedê-lo gera erro explícito, sem lista parcial
ou fallback para leitura completa. Esses limites não alteram os leitores C1.

Para disponibilizar a mudança, implantar primeiro `loreApi` com o novo contrato
e depois o frontend. O frontend novo exige essa versão do servidor; não tenta
substituir o pedido por uma captura completa. Frontends antigos continuam
compatíveis com o servidor atualizado. Deploy e medição com conta real são
etapas separadas da validação local.

## Evidências automatizadas

- `functions/test/bookLoreSummaries.test.mjs`: inline, payload v1/v2, criação
  nativa, campos selecionados, ausência de leitura de detalhes achatados e
  relações, paginação, tokens, clock, autorização, tombstones e exclusão.
- `src/features/lore/tests/bookLoreSummaries.test.ts`: contrato cliente,
  17/53 itens, duas/quatro chamadas, entradas inválidas e contexto revogado.
- `src/features/lore/tests/bookLoreSummaryRoundtrip.test.mjs`: integração real
  do cliente com o servidor nativo de 17 fichas e abertura completa posterior.
- `src/features/lore/tests/BookLoreCollection.test.tsx`: lista, filtros,
  seleção, ações, recuperação, foco, troca de contexto e respostas tardias.
- `e2e/visual/book-lore-summary.visual.ts`: rota real em Chromium, cartões,
  lista, busca, teclado, abertura sob demanda e retorno de foco nos três temas.
