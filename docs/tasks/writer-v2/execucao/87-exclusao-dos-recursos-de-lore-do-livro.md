# P1 / M38c3j — Exclusão coordenada dos recursos de lore do livro

## Objetivo

Integrar o passo 6 do [plano 82](82-alcance-e-coleta-dos-corpos-de-lore.md) à
exclusão de livros existente, antes de habilitar a escrita completa ao cliente.
A raiz só pode sair depois de resolver preparações e remover cabeças, descritores
e payloads; jobs/leases/controles/recibos continuam como provas e fences.
Exclusão de uma ficha e criação por reserva permanecem tarefas seguintes.

## Sequência e contratos

1. Controlador privado nativo sob users/uid/bookLoreDeletions/bookId, vinculado
   ao livro original e ao checkpoint efetivo de sceneOperations. Contexto
   imutável, estado revisionado e eventos/âncoras. O nascimento do contexto fixa
   o cutoff depois de deleting e revogação pública; livro/checkpoint recriados
   não são retomados como os originais.
2. Etapa retomável antes da limpeza legada: cancelar e concluir edições em
   preparação; cancelar uploads independentes e inspeções pendentes, sem
   reautorizar texto; manter sucessos adopted e seus recibos.
3. Remover cabeças locais por metadata, aposentar gerações controladas, remover
   descritores e limpar corpos em lotes de até 16 partes, header por último.
   Fences não entram nas fases flat antigas.
4. Corpos controlados mantêm eventos/estado de inventário e validam leases
   originais adotadas/aposentadas. Corpos legados sem inventário usam identidade
   nativa/header/cutoff e cursor privado, sem inventar uma origem de edição.
   Leases desconhecidas, escopo divergente e chunks sem prova/header bloqueiam.
5. Nenhum campo de prosa/proof de chunk é lido na coleta. Contexto/header/partes/
   segmento recriados após cutoff são preservados; partes respeitam também o
   cutoff original do corpo. Progressos de filhos e controlador compartilham
   transação, sem leitura após writes.
6. Adaptar cleanupVersion 1/2 para 3 sem perder a fase legada em andamento;
   aliases apontam para o checkpoint original. Sem recursos privados/payload,
   registrar auditoria vazia e conservar a sequência legada.
7. Antes do finish, reconferir ausência de bytes/descritores e identidade do
   livro. Conteúdo tardio bloqueia terminar. Publicação fica revogada durante
   todo o processo; replay final não recria a raiz.
8. Roteamento do cliente reconhece hasLoreResources. Antes de expor uploads/
   escrita ao cliente, o fluxo de exclusão também deverá cobrir preparações em
   livros ainda não marcados; backend já fará a descoberta por UID/bookId.

## Arquivos e validação

Novos módulos de store/controlador/jobs/cleanup de payload e integração sceneJobs.
Execução interna nativa dos cancelamentos existentes; Rules negam o namespace.
Modelo/serviços do livro e testes de roteamento conforme necessidade.

Testes Node/SDK: livro adotado e preparação não adotada, filho inline parcial,
upload independente/inspeção pendente, corpos v1 sem inventário, mais de 128
partes, header por último, corpo/parte/controle/checkpoint/livro recriados,
rollback/retomada/aliases, migração v1/v2, fences mantidas e fonte pública negada.
Regressão dirigida de cenas/capítulos/lore; checks estáticos; docs/ADR/AGENTS/
evidência e commit local. Validate integral no fechamento de P1, sem CI remota.

## Limites e riscos

A remoção é autorizada somente por livro próprio já deleting, com publicação
revogada, sem grant de leitura da origem. O controlador tem capacidade interna
ligada à transação; não aceitar UID/path/booleano alegado como prova.

Contador processed do livro não é um total de conteúdo: protocolos filhos
mantêm seus contadores próprios; a etapa nova conta suas remoções diretas e
as unidades coordenadas separadamente. Fences não são conteúdo removido.

Não fazer namespace purge de jobs/restaurações/controles. Chunks órfãos
desconhecidos e dados com escopo/provas divergentes exigem reconciliação,
não um delete recursivo. Nenhuma execução contra livro real/produção.

Criação/exclusão individual de lore, demais writers/consumidores/backup/cliente,
certificação/ativação e rollout continuam pendentes. P1/F2-09/V2 abertos.
Somente commits locais; sem endpoint público novo, deploy ou dependência.

## Evidência e estado

[Entrega](../../../entregas/2026-10-24-writer-v2-exclusao-dos-recursos-de-lore-do-livro.md)
e [ADR 0102](../../../decisions/0102-coordinated-book-lore-deletion.md):
248 Node distintos, 91 Vitest e cinco SDK positivos em rodadas dirigidas.
Lint, typecheck, arquitetura e sintaxe dos 204 módulos passaram.

O núcleo backend de exclusão do livro e roteamento de hasLoreResources estão
implementados. A exposição de uploads/escrita ainda depende do roteamento das
preparações sem marca, criação/exclusão por ficha e demais integrações listadas.
Não se declara o passo 6 inteiro, P1/F2-09 ou V2 concluídos. Sem deploy/CI remota.

## Coordenação posterior com a ficha — M38c3k

O [plano 88](88-exclusao-individual-do-lore-completo.md) acrescenta removals ao
inventário v3: jobs individuais em curso entregam a limpeza ao contexto nativo
do livro antes de heads/gerações/payloads. Fences e sucesso histórico permanecem;
a conclusão individual confere o checkpoint original após a raiz sair.

[Evidência](../../../entregas/2026-10-24-writer-v2-exclusao-individual-do-lore-completo.md):
303 Node e cinco SDK distintos positivos, incluindo rollback/handoff reais.
Criação e demais integrações continuam pendentes; P1/F2-09/V2 abertos.
