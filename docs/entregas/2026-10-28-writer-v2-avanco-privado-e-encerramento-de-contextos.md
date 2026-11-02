# Writer V2 — avanço privado e encerramento de contextos

## Estado e objetivo

Preparação interna parcial do [plano 199](../tasks/writer-v2/execucao/199-exclusao-completa-de-aventuras.md),
base 530413d. Acrescenta os primeiros processadores ao início privado;
não entrega exclusão completa ao usuário nem fecha P2/P3/D/F2-09/V2.
[ADR 0223](../decisions/0223-adventure-deletion-quiescence.md) registra o contrato.

## Implementado

- Nascimento original da aventura no job, conferido pelo token e recibo inicial.
- Advance interno com token, CAS de checkpoint, fingerprint e recibo atômico.
  Retry após ACK perdido ou checkpoint posterior conserva a mesma operação.
- Remoção de snapshots de contexto em páginas de dez, por metadata e origem
  exatas, mesmo sem raiz. Corpo recriado impede a transação inteira.
- Encerramento de turnos ativos, um chat por página, com atualização do catálogo.
  Resposta tardia não restaura snapshot nem altera turno parado.
- Dois índices locais para consultas por alvo/projectToken/nome.
- Perguntas próprias preservadas; política da exclusão inteira continua pendente.

## Testes e resultado real

| Verificação                                          | Resultado                                                                               |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Node adventureDeletion e adventureDeletionQuiescence | 27/27, 449,1966 ms                                                                      |
| SDK/Rules adventureDeletion, emulador demo loopback  | 11/11, 19485,567 ms                                                                     |
| Lote nativo de contextos                             | 13 snapshots removidos em 10/3/0, consulta vazia separada                               |
| Identidade e rollback                                | Corpo recriado preserva toda a página; raiz ausente permite retomar origem original     |
| Geração em voo                                       | Plataforma segurada por promise e BYOK pendente encerrados; pergunta própria preservada |
| Retry                                                | ACK perdido após commit recupera recibo; pedido antigo devolve progresso atual          |

A primeira ampliação do teste Node recusou um fixture com contextId diferente
de operationId. O fixture foi corrigido para obedecer ao contrato existente;
a rodada acima passou. O código de produção não foi relaxado.

Logs locais de QA: m114-node.log e m114-sdk.log, fora do Git.
O emulador e seus processos de teste foram encerrados; o Vite existente
continua independente. Testes usam conteúdo sintético, sem exclusão de dados reais.

## Checks dirigidos

ESLint dos cinco arquivos de código/teste, sintaxe dos 399 módulos Functions,
arquitetura, documentação e skills passaram. Formato dos arquivos alterados e
git diff --check passaram. Revisão do diff não encontrou bloqueador no incremento
interno; aceites da exclusão inteira seguem abertos. Nenhum resultado do validate
anterior é atribuído ao código atual.

## Pendências e limites

Quiescência para na parte de fontes ainda não implementada com erro tipado,
sem certificação falsa. Faltam fontes/chaves de importação e restauração,
mídia/usos, corpos históricos de chats, autoria/controles/atividade, inventário
final vazio e remoção da raiz, cliente/retomada/interface e validação integrada.
Os métodos continuam fora de index/callable; nada está disponível na conta real.

O validate integral fica no fechamento do bloco 198–exclusão, conforme orientação
do operador. Frontend/build/browser não foram repetidos: este incremento não
modifica a interface. Sem operação na CI/GitHub, push, PR, merge ou deploy.
Macro permanece 8/35 e gates humanos/comerciais continuam abertos.
