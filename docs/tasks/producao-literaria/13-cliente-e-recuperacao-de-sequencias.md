# Cliente e recuperação metadata de sequências — E4

Incremento sobre a base consolidada `1bc6ba8`, na worktree literária isolada.
O escopo integral continua sendo as cinco etapas do plano aprovado. Este bloco liga o
driver ao cliente e ao painel de recuperação existente. A seleção/consentimento da
sequência e seu registro público em Functions ainda não foram compostos.

## Cliente e acompanhamento local

`literarySequenceService.ts` define escopo, seleção nativa, checkpoints, limites,
controles, outcomes e descoberta paginada. Captura o input antes do primeiro await.
Antes de RPC produtora, grava no diário apenas conta/livro, IDs, método original,
revisão esperada e SHA-256 do pedido. Não persiste orientação, geração, prosa ou grant.

A versão 1 anterior do diário continua legível. Apenas entradas `sequence` admitem e
exigem `method`, limitado a start/advance/control; outros campos adicionais são
recusados. O wrapper genérico de salvamentos não aceita sequência. Para sequência,
uma exceção conserva a pendência: um erro após commit pode ocultar um resultado real.

O hash local vai como `requestHash` ao servidor, é ligado ao fingerprint nativo e
retorna no outcome. Método/ID/revisão iguais não bastam: se o hash divergir, a dívida
permanece. Isso evita confirmar outra intenção que reutilize o mesmo identificador.
Pedidos nativos anteriores sem hash preservam seus fingerprints e replay; um recibo
sem esse vínculo não confirma uma entrada cliente nova.

O retorno de um frame pode anteceder o fim do provedor. Só `confirmed`/`superseded`
correspondentes encerram o diário, com CAS do registro local. `running` e `unconfirmed`
conservam a pendência. O registro inicial guarda revisão 1, mesmo após controles;
um avanço supersedido permanece na revisão original, sem inventar commit de texto.

## Consulta e retomada são ações distintas

Abrir o painel não executa RPC. Consultar usa getLiterarySequenceOperation, confere o
pedido original e não reenvia start, advance ou controle. Um resultado running habilita
uma ação explícita separada: **Retomar passo original da sequência**.

resumeLiterarySequenceOperation recebe somente alvo, jobId e operationId. O servidor
reautoriza conta/livro/nascimentos, confere o ticket running/busy e reconstrói o pedido
imutável privado, incluindo o relatório de integração escolhido. Não usa formulário
atual, fonte nova ou argumentos de produtor fornecidos pelo cliente. O driver mantém o
wire congelado e os IDs nativos; ACK perdido após prosa/débito não produz a cena seguinte.

Um ticket concluído ou supersedido só devolve o checkpoint. Pausa/cancelamento não são
rearmados. Ausência de pedido privado válido, alteração do hash/fingerprint ou recriação
da origem bloqueiam a retomada. Start/controle não são promovidos a avanço por esta API.
Consulta não concede autorização e confirmação de comando não comprova aplicação de prosa.

O painel tem sessão por conta/livro; resposta antiga não remove a dívida de outra sessão.
A retomada também confere continuidade da sessão após o await de consulta e antes da RPC
produtora. O diário precisa continuar sendo a cópia original antes de retomar.

## Descoberta e fronteira de exposição

listLiterarySequences pagina pelo ID nativo, lê somente projeção metadata e mantém cursor
da página varrida, mesmo quando todas as linhas são filtradas. Reautoriza o livro em cada
página, omite outro ator/nascimento de livro e marca job recriado como stale. Não lê
instruções, snapshots de geração ou corpos. A listagem não é uma prova de que o escopo
inteiro segue atual; abrir o checkpoint revalida a seleção pelo núcleo.

O driver passa a oferecer oito métodos destinados à composição futura: scope, start,
get, operation, list, advance, resumeOperation e control. Não há registro em
functionDomains/domainServices nem exposição dos hooks/complete internos. O catálogo
público continua com 422 ações. Não foi criada coleção, Rule, índice ou dependência.

Próximo incremento: interface do livro para seleção ordenada dos capítulos, prévia de
escopo/limites/modo, consentimento, descoberta/retomada e composição do checkpoint do
capítulo ativo. Integrar os oito métodos explicitamente por setor, com gerador apenas
nos avanços/retomadas que podem produzir. Não habilitar atalhos genéricos para escapar do
orçamento. Depois permanecem a política tipada de publicação prévia, demais aceites
E1–E4 e inventário/impacto/portabilidade editorial de E5.

## Evidência e limitações

Os testes nativos percorrem recuperação após registro/prosa, controles posteriores,
recriação, paginação filtrada e hash divergente. O cliente usa o núcleo real por um
adaptador local; isso não comprova o transporte de setor ainda não registrado. A
interface foi exercitada no Chromium em três temas, desktop e 320 px, consulta e
retomada por Enter, sem overflow horizontal. O backend visual é fictício e isolado.
A captura foi inspecionada com o dock minimizado pelo controle real do produto.

Totais e logs da rodada estão no [relatório de validação](validacao-local-2026-11-02.md).
A última medição global anterior a este incremento reprovou cobertura de funções do
frontend em 86,23% < 90%; esse percentual não foi recalculado neste bloco. Não há gate
global aprovado, etapa encerrada, commit, push, integração de volta ou deploy.
