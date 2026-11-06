# Incremento 32 — Fence explícito dos cabeçalhos de ciclo

Estado: implementação local, com cobertura parcial de escritores. Testes preparados, não executados. Nenhum produtor/editorial restore habilitado.

## Problema e escopo

Atualizações internas de `literaryWorkflowJobs` podem ocorrer sem alterar a raiz do livro. Uma captura que observe somente a raiz não detectaria esses avanços. Este incremento cobre criação e as onze escritas explícitas de cabeçalho em `literaryWorkflow`, incluindo registro, passagem de fase, pausa, cancelamento, limite e reconciliação.

As escritas usam um helper privado da própria família: após a mutação nativa do cabeçalho, a mesma transação escreve `books/{bookId}/literaryBackupControls/current`, com schema e UUID novo. Não há leitura depois da primeira escrita, contador sujeito a overflow ou alteração de clocks semânticos, texto, créditos ou raiz. Replays que retornam recibos existentes e consultas estáveis não escrevem o marcador.

O leitor reautoriza o projeto e compara a identidade nativa da raiz e do marcador. Ausência permanece explícita. A observação retorna `coverage: workflow-headers-only`; não certifica captura completa nem autorização de execução. Outras famílias e escritas de corpos ainda precisam ser coordenadas.

## Privacidade e limpeza

Rules recusam get/list/create/update/delete do marcador pelo SDK, inclusive para o dono. O inventário servidor de exclusão inclui a nova coleção. A limpeza existente recebeu um marcador órfão para comprovar sua retirada junto aos demais filhos. O marcador não vai no pacote portátil.

Não foi alterado o boot do servidor, `getFirestore`, o contrato genérico de transações ou os serviços de outras famílias. Uma proposta de interceptação global foi rejeitada pela revisão automática pelo alcance sobre transações de todo o servidor; ela não foi aplicada. A alternativa entregue usa chamadas explícitas nos escritores da família.

## Verificação preparada

12 casos novos: oito de marcador/observação, três de integração com workflow e um de Rules. Um caso existente de exclusão foi ampliado. Cobrem ausência, não alteração da raiz/créditos, unicidade de commits, aborto sem resíduo, reautorização, marcador malformado, escopo de outro livro, mudança da raiz, leituras estáveis, pausa e replay.

Nenhum teste/check, formatação, build ou navegador executado. A prova com SDK real e os gates integrais ficam para a rodada final. Sem commit, integração de retorno, push ou deploy.

## Continuação obrigatória

Coordenar explicitamente sequence/driver, drafting/review, integração, publicação, preparação, planejamento, decisões e as demais fontes efetivamente exportadas. Não promover `workflow-headers-only` a prova global. Definir as páginas/DTOs de captura com reautorização dos derivados, inventário/cleanup, materialização útil e ativação atômica antes de liberar archive v2. Drenar instâncias antigas antes da habilitação; nenhuma confirmação histórica substitui a autorização da origem.

O objetivo permanece ativo, com 0/5 etapas formalmente encerradas. Buscar/incorporar a principal novamente antes dos testes finais.
