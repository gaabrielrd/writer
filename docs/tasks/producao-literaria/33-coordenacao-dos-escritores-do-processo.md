# Incremento 33 — Coordenação explícita dos escritores do processo

Estado: implementação local; testes apenas preparados. A captura/restauração editorial v2 continua desabilitada.

## Escritores coordenados

O marcador privado do incremento 32 passa a acompanhar as chamadas explícitas dos escritores abaixo. A raiz, os clocks semânticos, a autorização existente e a API global de transações permanecem sob seus protocolos anteriores.

| Família       | Coleção observada       |
| ------------- | ----------------------- |
| workflow      | literaryWorkflowJobs    |
| sequence      | literarySequenceJobs    |
| draft         | literaryDraftJobs       |
| review        | literaryReviewJobs      |
| milestone     | literaryMilestones      |
| integration   | literaryIntegrationJobs |
| publication   | literaryPublications    |
| prose         | literaryProseRequests   |
| impact        | literaryImpactJobs      |
| impactControl | literaryImpactControls  |
| generation    | literaryGenerations     |

`writeLiteraryBackupProcess` é chamado nos pontos selecionados de create/set/update. Ele confere família por propriedade própria, método e pai exato do documento antes de encaminhar os argumentos nativos, inclusive precondições, sem substituí-los. Em seguida grava o marcador na mesma transação. Não decora db/tx, não adia as escritas nem acrescenta leituras após escrever.

Foram ligados sequência/driver, redação, revisão, preservação, integração, propostas textuais/editoriais e controles/grafo de impacto. Os escritores do guia e da confirmação final de publicação também atualizam o marcador. O persistidor de checkpoint de publicação recebe agora o contexto do livro em seus 17 chamadores, preservando o incremento de progressRevision.

Corpos/unidades escritos na mesma transação que esses cabeçalhos ficam cobertos pelo commit conjunto. Isso não prova que toda escrita de corpo seja acompanhada: por exemplo, a reserva nativa de uma unidade de marco pode atualizar somente tokens/hash operacionais. A projeção portátil não pode copiar esses campos como autorização ou assumir cobertura global sem concluir a auditoria das fontes.

O leitor interno chama-se `readLiteraryBackupFence`; a escrita simples, `touchLiteraryBackupWrite`. O digest inclui a versão 2 da observação e a lista das famílias coordenadas. O DTO retornado continua schema 1, com `coverage: process-headers-partial` e lista explícita. Essa versão de token é privada; não altera a versão ativa do `.writer`, não vai no arquivo e não é grant.

## Exclusão e cancelamentos tardios

Cancelamentos de impacto podem fechar metadata enquanto o livro está deleting. A etapa final de `deleteSceneBook` agora confere o marcador e os corpos antes de retirar a raiz. Um marcador reaparecido após a página da sua coleção reinicia a varredura limitada a partir de literaryProduction, incluindo todos os filhos literários e o marcador ao final. Não limpa só o marcador enquanto deixa o recurso tardio para trás.

As consultas são pequenas e ocorrem antes das escritas da transação final. Root, tombstone e recibos continuam pelo protocolo existente. O fechamento só pode ocorrer depois de uma passagem sem marcador remanescente. A prova de concorrência e comportamento do SDK permanece pendente de execução.

## Casos preparados

27 casos adicionais, sem execução:

- 11 famílias de escrita explícita e 3 casos de método/pai/propriedades herdadas, encaminhamento de precondição/retorno e falha nativa sem marcador;
- 8 casos de serviços reais locais: cancelamento/replay de redação, revisão, marco, integração e proposta, registro/vínculo de sequência, driver com replay e checkpoint de publicação;
- 4 casos com SDK real no emulador demo: commit conjunto/raiz preservada, escritores concorrentes, rollback por precondição e aborto/reautorização;
- 1 caso de exclusão com escrita tardia após chegar à fase finish.

Os oito casos anteriores do marcador foram ajustados à lista de famílias e ao novo nome da cobertura. Não houve testes, typecheck, lint, formatter, build, navegador, cobertura ou validate neste incremento. Nenhuma métrica da rodada antiga valida essas alterações.

## Continuação

Auditar as fontes que serão efetivamente exportadas e as mutações fora dos escritores coordenados; reautorizar derivados e definir projeções fechadas, sem jobs brutos. Os sete streams existentes continuam com suas próprias provas nativas. A seção editorial deverá capturar/reconferir seu token privado e a raiz antes do selo, sem inserir tokens no pacote.

Depois completar captura, inventário/cleanup de restauração, materialização de contrato/fichas utilizáveis e arquivo privado de evidências/checkpoints, ativação atômica e revisão. Drenar escritores antigos antes de habilitar o produtor. Não promover a cobertura parcial a captura completa.

O objetivo integral permanece ativo, com 0/5 etapas formalmente encerradas. Buscar/incorporar novamente a principal antes dos testes finais. Sem commit, merge de retorno, push ou deploy.
