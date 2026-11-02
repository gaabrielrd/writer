# ADR 0102 — Exclusão coordenada dos recursos de lore do livro

- Estado: aceita para limpeza interna de livros; exclusão por ficha e rollout pendentes.
- Data: 2026-10-24.
- Contexto: [plano 87](../tasks/writer-v2/execucao/87-exclusao-dos-recursos-de-lore-do-livro.md).

## Barreira e identidade

deleteSceneBook exige livro próprio já deleting e publicBooks ausente.
A irreversibilidade de deleting continua nas Rules existentes. O novo contexto
privado users/uid/bookLoreDeletions/bookId é imutável e fixa nascimento do livro,
checkpoint efetivo de sceneOperations e cutoff nativo posterior à barreira.
Aliases continuam apontando para a operação original.

Estado, eventos e âncoras são revisionados e vinculados pelos timestamps nativos.
Uma abertura interna só vale para a transação que a produziu; copiar seus campos
não concede capacidade. Livro, contexto, estado, checkpoint e corpos recriados
não podem ser assimilados ao processo original.

## Ordem e atomicidade

cleanupVersion 3 acrescenta a etapa lore-resources antes da sequência legada.
Jobs v1/v2 preservam a fase em andamento para retomá-la após a etapa nova.
Sem atividade de payload/preparação, registra-se auditoria vazia sem adicionar
rodadas à limpeza legada. O finish reconfere ausência de cabeças, segmentos,
headers e chunks antes de remover a raiz.

A ordem é: resolver edições, uploads e inspeções; remover cabeças locais;
aposentar gerações; remover descritores; coletar partes e, por último, headers.
Edições em preparação usam seu próprio cancelamento e limpeza; filhos inline
ainda não reservados são resolvidos antes dos slots. Jobs adotados permanecem
sucessos históricos. Inspeção cancelada perde seu estado SHA, preservando fences.

Cada unidade dos protocolos filhos compartilha a transação do controlador e do
checkpoint externo. O controlador reserva seus próximos eventos antes das
escritas dos filhos; a etapa incompleta não executa leituras legadas depois.
Falha do checkpoint externo reverte também bytes, inventário e progresso interno.

processed soma somente as remoções diretas dessa etapa ao contador existente.
Protocolos filhos conservam seus próprios contadores; coordinatedUnits registra
unidades coordenadas. Nenhum deles representa total de palavras ou de conteúdo.

## Coleta sem ler prosa

Headers, partes e descritores são abertos por projeções de metadata e limite.
A coleta lê até 16 partes por unidade, sem bytes/proof. O cursor fixa nascimento,
manifesto, escopo do recurso e identidade/token do controle, quando existir.
Partes precisam ser imutáveis e anteriores ao header, cutoff e selo aplicável.
Chunks extras ou sem header/prova bloqueiam terminar.

Corpos controlados preservam estados/eventos do inventário. Suas gerações ficam
retired/cancelled antes da coleta. Lease conhecida exige prova nativa da adoção
aposentada; string phase não é autorização. Qualquer lease desconhecida bloqueia.

O livro inteiro está irrevogavelmente deleting, com todas as cabeças removidas
e gerações aposentadas. Essa barreira permite a limpeza do inventário do próprio
livro; ela não altera os guards da coleta genérica por alcance de uma ficha.

Corpos legados sem inventário e sem lease usam o header imutável e seu cutoff
original, vinculados ao livro autorizado e ao cursor privado. Não se fabrica
uma geração de edição. Escopo divergente e objetos posteriores ao cutoff ficam
preservados e bloqueiam a conclusão, exigindo reconciliação.

Jobs, recibos, leases, controles e reservas permanentes não são apagados por
namespace purge. A remoção de conteúdo não autoriza reciclar seus IDs.

## Cliente e rollout

hasLoreResources já protegido nas Rules passa a encaminhar a exclusão do cliente
para deleteSceneBook; finishBookDeletion recusa finalizar esses livros pelo SDK.
O backend descobre também preparações de livros ainda sem a marca.

Antes de habilitar uploads/escrita ao cliente, o roteamento deve cobrir também
esses livros ainda não marcados. A criação/exclusão individual de lore, todos os
writers/consumidores, backup lógico/indexado e recuperação do cliente continuam
obrigatórios. O incremento não habilita callable novo, produtor, UI ou worker.

Handlers/regras coordenados e drain das versões antigas permanecem condições de
rollout. Sem deploy ou acesso a dados reais. Certificação/ativação de restauração,
P1/F2-09 e Writer V2 seguem em andamento.
