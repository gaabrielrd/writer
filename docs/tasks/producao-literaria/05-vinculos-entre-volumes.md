# Vínculos entre volumes — E2

Incremento na worktree literária sobre `b9fc03c`. O plano de cinco etapas continua ativo.

## Uso

No planejamento, Unidade de outro volume permite consultar livros do próprio autor por
páginas e escolher ato, capítulo, cena, arco ou evento como fonte. O vínculo guarda livro,
tipo e ID nativo; títulos e números de capítulo são apenas apresentação. Duas unidades
homônimas de livros diferentes conservam origens distintas. Reordenar não troca o ID.
O seletor explicita o livro e o tipo de unidade; a justificativa e os vínculos já escolhidos
permanecem ao consultar outras páginas e volumes.

A fonte de outro volume sustenta o planejamento atual. Ela não é uma unidade planejada
deste livro e não entra em sua composição ou publicação. Para corrigir o próprio volume
de origem, use sua área nativa e seu fluxo editorial; o destino de correção da integração
atual continua pertencendo ao livro atual. Contrato, fichas e manuscrito atual mantêm as
suas decisões e versões.

## Fontes e IA

`volumeUnit` é um tipo explícito de referência privada. Seu ID composto canônico contém
livro, tipo e ID da unidade; `scopeId` precisa coincidir com o livro codificado. O domínio
permite somente fontes, sem converter o vínculo em assunto local. O servidor autoriza o
livro e a unidade a cada consulta e vincula a prova aos seus nascimentos nativos. Dono
alterado, remoção ou recriação não reautorizam a origem antiga nem revelam seus rótulos.

O contexto comum usa o leitor nativo de prosa de capítulo/cena da origem e preserva a
formatação como texto visível. Capítulo composto exige selecionar suas cenas; não há
fallback para uma cópia de conversão ou resumo. Atos/arcos/eventos fornecem os campos
narrativos autorizados. A prévia declara apenas as fontes selecionadas, sem alegar leitura
do volume inteiro. Orçamentos existentes de contexto continuam limites da operação.

Manifestos de escrita, dependências de geração, índices de integração e reconferência
conservam o livro de origem. Mudança da unidade invalida a versão de contexto capturada;
revogação impede abrir ou aceitar a resposta. Revogar a origem enquanto o provedor espera
agora encerra o pedido como desatualizado, sem expor a proposta tardia ou repetir geração
pela mesma operação. Seleção, salvamento e retentativas não alteram a prosa atual nem
debitam créditos.

## Arquitetura e limites

`literaryVolumeProtocol.mjs` é puro e valida o ID composto. `literaryReferences.mjs` resolve
a origem somente após autorização nativa. A lista de livros é `listLiteraryVolumeBooks`
em `planningApi`; o contrato completo passa a **415 ações**. Não há Function independente,
coleção, índice, permissão SDK ou dependência nova.

O motor de impacto aponta para a unidade nativa no seu livro, com prova de origem própria;
conferir identidade/versão não atesta leitura do manuscrito nem qualidade editorial. Este
incremento não fecha o inventário e a topologia integral de E5. A auditoria global de
arquitetura confere os vínculos das fichas, mas não declara leitura de todos os corpos dos
outros volumes. A restauração editorial em nova cópia privada `.writer` continua pendente.

## Evidência

- Servidor: 316/316, incluindo todos os testes `literary*.test.mjs` e os dois contratos de
  roteamento por setor. Nove cenários próprios cobrem 59 livros paginados, homônimos,
  reconstrução de origem, revogação, cenas nativas, contexto de escrita e índice de integração.
- Frontend: 81/81 em 17 arquivos da feature, incluindo o fluxo real cliente/servidor com
  resposta perdida, origem preservada e nomes indisponíveis após revogação.
- Chromium: 6/6 nos três temas, desktop/móvel de 320 px; paginação de livros, dois capítulos
  homônimos, preservação do rascunho e salvamento por teclado. Capturas inspecionadas.

Resultados finais de build/lint/sintaxe e logs estão no relatório de validação desta pasta.
O último `validate` global é anterior a este incremento e reprovou na cobertura de funções
(86,02%, mínimo 90%). Nenhum limite foi reduzido. Não há commit, push ou deploy nosso.
