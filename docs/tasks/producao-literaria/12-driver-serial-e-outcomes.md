# Driver serial de sequências e outcomes nativos — E4

Incremento na worktree literária sobre a principal1bc6ba8. Conecta o núcleo de orçamento
agregado ao avanço nativo de capítulos, mantendo a autorização original. O objetivo de
cinco etapas continua ativo; este bloco não expõe a sequência por HTTP ou pela interface.

## Um pedido, um avanço identificado

literarySequenceDriver.mjs compõe os serviços nativos existentes. advance recebe
jobId, operationId, expectedRevision e expectedOriginToken. A seleção de integração do
ato, quando necessária, também entra no fingerprint. O driver registra busyStep e ação
em literaryOperations antes de produzir. Não executa um loop de capítulos dentro da RPC.

A preparação do próximo ciclo e a inspeção do atual são fases de leitura. Antes de
chamar um produtor, o driver congela o wire de start/advance/controle no registro privado.
Recuperar um passo já congelado usa esse wire, sem repetir preflight, trocar fonte,
modelo, instrução ou unidade. Se o processo parar antes desse congelamento, a fase de
leitura pode ser refeita; nenhum produtor foi autorizado por essa fase isolada.

Cada avanço registra apenas uma ação: criar/confirmar o ciclo, avançar seu passo nativo,
propagar limites já ampliados pelo autor, fechar a unidade ou aguardar decisão. IDs dos
filhos incluem o nascimento do pai; IDs dos passos incluem a operação e sua origem.
O fechamento e o recibo completedUnit são gravados juntos na mesma transação. Repetir
esse recibo não entra no capítulo seguinte.

## Condições de passagem e orçamento

O ciclo seguinte usa como predecessor o ciclo realmente concluído na seleção. A fronteira
supervisionada aguarda authorizeNext. Sair de ato aguarda uma integração nativa aceita;
confirmar um registro de ação não cria nem aceita esse relatório. Uma operação que
escolheu um relatório não pode substituí-lo ao ser recuperada. Sem relatório válido não
há novo ciclo ou prosa. A seleção final não inicia outra unidade, livro ou volume.

A ampliação explícita do orçamento no pai pode ser propagada ao filho bloqueado, com
wire próprio e CAS; o consumo anterior é conservado. Fases e modo não são promovidos
silenciosamente. Pausa do capítulo, correções, fonte obsoleta e decisões autorais
continuam como paradas, com checkpoints nativos separados.

## Controles e consulta de resultado

O wrapper de controles exige operationId. A decisão e seu recibo são atômicos. Uma
repetição do mesmo pedido devolve o checkpoint sem aplicar de novo; um pedido diferente
não é confirmado pelo valor atual do pai. Pausa/cancelamento encerram o busyStep
original e o marcam superseded, além de fechar os filhos pelo núcleo existente.
Uma pausa pelo núcleo também fecha o ticket, sem deixar uma recuperação impossível.

getLiterarySequenceOperation reautoriza conta/livro e confere ator, nascimento do livro,
da sequência e do recibo. Retorna somente metadata: unconfirmed, running, confirmed ou
superseded, método, revisão e resultado histórico limitado. Não devolve wire, orientação,
corpo de manuscrito ou grant. Registro inicial cancelado é superseded; sua confirmação
posterior conserva a revisão original do start, separada da revisão do controle.

Confirmed comprova o resultado do comando, não afirma que prosa foi aplicada. Uma
resposta waiting pode anteceder o término do provedor registrado. Aplicação e débito
continuam exigindo o recibo nativo e o ledger; duplicatas ou respostas tardias não
consomem a próxima cena. Uma exceção sem resultado conclusivo conserva o passo running
para consulta/recuperação exata, sem fallback automático de geração.

## Fronteira técnica atual

Foram adicionados hooks internos de ativação/avanço/controle aos ciclos e de commit ao
núcleo da sequência. Nenhum hook é aceito em DTO HTTP. Leitura/guarda ocorrem antes dos
writes da mesma transação. O driver ainda não está no registro Functions:422 ações,
sem Function, índice, coleção ou dependência novos neste incremento.

Próximo bloco obrigatório antes de expor: cliente tipado e diário metadata da sequência,
descoberta paginada de execuções, ponte de consulta/outcomes no painel de recuperação,
seleção visual/consentimento e composição dos setores de Functions. Não restaurar grants
em backups. A política tipada que exige publicar a unidade anterior antes de avançar
continua pendente, assim como os demais aceites E1/E2/E3/E4 e impacto/portabilidade em E5.

## Evidência

18 testes dirigidos do driver percorrem dois capítulos, retomada do orçamento, fronteira
supervisionada/ato, ACK perdido após congelamento, registro, texto/debito e fechamento,
concorrência de entregas, provedor pendente, pausa/cancelamento e origens recriadas.
O conjunto backend final inclui 469 testes aprovados; os 109 testes frontend literários
continuam aprovados. Lint e sintaxe são registrados no
[relatório de validação](validacao-local-2026-11-02.md).

A composição usa núcleo real e double transacional. Não há prova de transporte HTTP ou
interface da sequência neste bloco. Não houve novo build/browser/Rules/validate global;
as evidências anteriores pertencem aos respectivos incrementos. Nenhuma etapa foi
formalmente encerrada, nenhum threshold foi reduzido e não houve commit, push ou deploy.
