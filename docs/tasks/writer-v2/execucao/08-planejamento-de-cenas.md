# W2-F2-02 — Cenas e composição de manuscrito

**Base:** `15cd417`, 2026-10-13. **Estado:** implementado e validado localmente; CI do novo head pendente.
**Dependência:** F2-01 passou no [CI completo](https://github.com/gaabrielrd/writer/actions/runs/38411066845)
e nas [regras reais](https://github.com/gaabrielrd/writer/actions/runs/38411067039).
**Tarefa:** [planejamento de cenas](../fase-02-criar-e-preparar/02-planejamento-de-cenas.md).

## Escolhas e autorização

O objetivo ativo autoriza planejar, implementar e validar o V2 em sequência.
Nesta rodada o operador escolheu explicitamente:

- Cada cena tem texto próprio; capítulo/parte reúne cenas na ordem escolhida.
- Arquivar retira a cena da composição e guarda o conteúdo, com opção de restaurar.

O plano foi apresentado antes de alterações. Piloto humano, habilitação comercial,
lançamento e tarefas futuras mantêm os próprios aceites; não há deploy ou merge.

## Fonte canônica e compatibilidade

Livro mantém capítulos/atos/IDs/URLs. Capítulo sem `contentMode` é legado e usa
`content` como hoje. Com `contentMode: scenes`, somente cenas ativas vinculadas
compõem a prosa; o campo legado fica congelado e identificado como fonte privada
da conversão, nunca concatenado ou usado como fallback.

Guardar também a fonte em `sceneSources/{chapterId}`, privada e somente servidor,
para que a remoção posterior do agrupador não destrua a fonte da conversão.

Conversão explícita cria uma única cena com o corpo inteiro, conserva a fonte e
seu hash, e muda o modo atomicamente. Compara `expectedSourceVersion`, fingerprint
opaco devolvido pelo servidor para o documento inteiro observado. Retry não duplica.
Não dividir por títulos nem converter ao ler. Acima do orçamento novo, manter
legado intacto e informar divisão explícita. Não oferecer retorno silencioso ao
modo antigo, pois isso descartaria alterações posteriores das cenas.

Aventura usa cenas próprias e partes mínimas (título/ordem agrupadora). Não criar
livro auxiliar. Templates, pistas, audiência, sessões e lore local de aventura
continuam em F2-06/F2-09.

## Recursos privados

`target` fechado: `{kind: book|adventure, id}`. Autoria vem de Auth e do pai.
Documentos de cena em `books/{id}/scenes/{sceneId}` ou `adventures/{id}/scenes/{sceneId}`:

- ID, ownerId, schemaVersion 1, revision positiva, datas do servidor.
- Título obrigatório até300 caracteres; parentId opcional, rank e arquivamento.
- Estados `planned`, `writing`, `review`, `done`; são estados de planejamento da
  cena, independentes de publicação e do estado do projeto.
- Resumo com palavra/bytes/hash do corpo, sem prosa, plano ou fichas copiadas.
- Corpo em `/body/current`; objetivo, conflito e ponto de vista em `/planning/current`.
  Textos de planejamento opcionais até4.000 caracteres cada.
- Referências em filhos individuais `/references/{id}` com kind/scopeId/entityId.
  Livro referencia lore local próprio ou universo atual; aventura, universo atual.
  Identidade removida/inacessível aparece indisponível, sem substituição por nome.

Prosa nova até800.000 bytes UTF-8, documento serializado até900.000 bytes, sem
truncamento. Corpo é dado privado inerte; editor, leitura e exportação usam o
sanitizador de prosa existente. Não retornar plano ou referências em projeção pública.

Pais reais são capítulos/partes. `sceneControls/unassigned` organiza “Sem capítulo”
ou “Sem parte”, sem prosa publicada. `assemblyRevision` protege composição;
`structureRevision` protege posições; `sceneRevision` do projeto protege listagens.
Projeto guarda marcador protegido de recursos de cena, inclusive agrupadores vazios,
para clientes antigos não contornarem a limpeza.

## Protocolo e APIs

Toda mutação usa operationId estável, fingerprint do payload e recibo em namespace
privado `users/{uid}/sceneOperations/{operationId}`. Não usar recibos de IA/Estúdio.
Derivar dono/escopo; whitelist de campos; CAS antes de escrever; cena/corpo/plano,
revisões, contagens, datas e recibo atômicos. Conflito usa failed-precondition com
details.reason `revision-conflict`, sem corpo privado no erro. Cliente preserva
preenchimento e permite comparar/atualizar, sem reenviar silenciosamente sobre a revisão nova.

Callables:

| Método                   | Entrada específica / resultado                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createScene`            | target, operationId, title, parentId opcional, planning/content opcionais; retorna cena persistida.                                                |
| `updateScene`            | target, sceneId, operationId, expectedRevision, patch fechado (title/stage/planning/content).                                                      |
| `moveScene`              | target, sceneId, operationId, expectedRevision, parentId, beforeId/afterId opcionais, revisão estrutural observada; padrão final do destino.       |
| `archiveScene`           | target, sceneId, operationId, expectedRevision, archived boolean. Restaurar acrescenta ao final do agrupador original disponível; senão Sem grupo. |
| `getScene`               | target/sceneId; detalhe privado com prosa/plano, metadados do projeto/agrupador, ou indisponível.                                                  |
| `listScenes`             | target, parentId explícito (null=Sem grupo), stage/all, archived, cursor e limit25/50; resumo apenas.                                              |
| `listSceneGroups`        | target/cursor/limit25/50; capítulos/partes mínimos, sem composição.                                                                                |
| `getSceneGroup`          | target/parentId; detalhe do agrupador, fonte/versão legada somente quando pertinente.                                                              |
| `createSceneGroup`       | target, operationId, title, actId opcional para livro; capítulo novo em modo cenas ou parte simples.                                               |
| `convertChapterToScenes` | target book, parentId, operationId, expectedSourceVersion; conversão transacional.                                                                 |
| `setSceneReference`      | target, sceneId, operationId, expectedRevision, referência tipada e remove boolean opcional.                                                       |
| `listSceneReferences`    | target, sceneId/cursor/limit; disponibilidade validada, sem campos alheios.                                                                        |
| `readSceneAssembly`      | target, parentId, expectedAssemblyRevision, cursor/limit; página consistente de prosa ativa.                                                       |
| `rebalanceSceneRanks`    | target/parentId, operationId, limite; checkpoint e troca de slot ao concluir.                                                                      |
| `deleteSceneGroup`       | target/parentId, operationId, expectedUpdatedAt observado, limite; desvinculação limitada, preserva cenas.                                         |
| `deleteSceneGroups`      | seleção até200 capítulos/partes com versões observadas; marcação inicial atômica de toda a seleção, seguida de limpeza paginada retomável.         |
| `deleteSceneBook`        | target book, operationId, limite; limpeza retomável após revogação, conserva marcador até concluir.                                                |
| `listSceneSources`       | target/cursor/limit, expectedProjectRevision; fontes privadas da conversão para backup, com orçamento de resposta e revisão conferida.             |
| `getSceneJob`            | target/operationId; checkpoint privado tipado com pedido original e progresso, para retomar após recarregar.                                       |

Retry de edição cuja revisão já avançou exige comparação; não usar recibo velho
para fingir que o corpo enviado continua atual. Retry de criação não recria origem
removida. Recibos contêm identidade/revisões/hashes, sem segunda cópia da prosa.

## Ordem, páginas e contagens

Chave fracionária lexical ASCII com desempate por ID, sem dependência nova.
Servidor valida destino/vizinhos e revisões; não usa índice da página filtrada.
Orçamento de chave deve caber no índice Firestore. Esgotamento oferece reorganizar
posições com job retomável de50: preencher slot inativo, conservar slot ativo,
trocar ao concluir. Bloquear estrutura do agrupador durante o job; interrupção
mantém ordem anterior e checkpoint, sem publicar ordem parcialmente reescrita.

Listas25/50, limite+1 quando necessário, cursor ligado a UID/target/parentId/filtros,
revisão, rank/ID e slot. Alteração invalida cursor e oferece atualizar. Corpo não
entra na lista. Lista/quadro operam no agrupador escolhido; agrupadores são
carregados por páginas e “Sem grupo” é sempre explícito.

Listagem de agrupadores pagina por documentId para incluir capítulos legados sem
campo order. O order observado continua como metadado; a página do seletor não
representa a ordem narrativa completa. Remoção individual exige updatedAt observado,
assim como a seleção múltipla; não substituir pela versão atual no servidor.
createSceneGroup retorna SceneGroup; conversão e mutações retornam SceneMutationResult.
Agrupadores em job expõem somente ID da operação; getSceneJob recupera o pedido
original autorizado e suas versões observadas, sem fabricar uma revisão nova no
retry. Fontes retornam content separado e original sem content: reconstrução
{...original, content}, sem duplicação do corpo no documento armazenado.

Composição percorre páginas e confere assemblyRevision durante/ao final; cada corpo
deve corresponder à revisão/hash do resumo. Resposta de prosa tem orçamento de
1.000.000 bytes além do teto50 itens; cursor avança somente pelos itens incluídos.
Nunca retornar composição parcial como completa. Para publicação de capítulo,
aplicar orçamento800.000/900.000 e pedir dividir se excedido, mantendo versão pública anterior.

Palavras do livro = capítulos legados + cenas ativas vinculadas. Sem grupo e
arquivadas conservam corpo/contagem própria, sem contribuição no manuscrito.
Conversão não dobra total. Movimento/arquivo/restauração atualizam diferenças,
agrupadores, revisões e updatedAt do projeto na mesma transação.

## Exclusão e clientes antigos

Capítulo/parte removido não apaga cenas. Job marca deleting, bloqueia novos vínculos,
retira contribuição uma vez, desvincula por páginas50 e finaliza. Interrupção exibe
progresso retomável; cenas mantêm acesso por identidade e indicam origem removida.
Novos writes não transformam recurso ausente em recurso recriado.

Capítulo composto não aceita escrita direta do corpo/modo/contadores nem exclusão
direta. Clientes antigos não podem remover controles por set completo. Capítulos
legados preservam protocolo existente. Aceite de IA do capítulo confere modo dentro
da transação, antes de escrita/débito, impedindo corrida com conversão.

Exclusão de livro com recursos de cena exige servidor: revogar antes, limpar filhos
por lotes, conservar pai/tombstone até terminar. Finish antigo não pode pular isso.
Regras privadas cobrem cenas/corpo/plano/referências/partes; novos writes, controles,
jobs e recibos são exclusivos do servidor. Testar acesso direto, não só UI.

Exclusão em seleção mista mantém a garantia vigente: validar/marcar todos os alvos
atomicamente antes da limpeza; não apagar os capítulos legados primeiro e só depois
tentar os compostos. Publicação de livro com cenas captura `sourceSceneRevision`;
regras impedem que um cliente antigo publique o corpo congelado omitindo esse controle.

## Interface, leitura e exportação

Nova feature `scenes` expõe modelos, serviços, ScenePlanner e SceneEditorPage.
Books/adventures consomem interface pública. Planner oferece Lista/Quadro,
agrupador/estado/Arquivo, criar/editar plano, mover/antes/depois, estado e arquivar/
restaurar por teclado. Conversão/arquivo/movimento mostram alvo e efeito. Erro,
conflito ou resposta incerta preserva pedido; conta/filtro invalida respostas antigas.

Rotas `/books/:bookId/scenes/:sceneId` e `/adventures/:adventureId/scenes/:sceneId`.
RichEditor público mantém seleção/undo/formatação; identidade do autosave/rascunho
inclui UID/tipo/projeto/cena. CAS e escolha explícita de recuperação, sem substituir
texto pendente por snapshot remoto. IA especializada de cena pertence a F2-09;
não acionar débito/aceite de capítulo com IDs de cena. Escrita manual funciona sem créditos.

Rota antiga do capítulo composto mostra composição e acesso às cenas, impedindo
editar o corpo congelado. Capítulos legados continuam no editor existente.
Resolver público de books monta composição somente quando solicitada; listas de
planejamento não carregam prosa. Exportação/publicação usam prosa ordenada e campos
permitidos; título de planejamento não vira cabeçalho automaticamente. Publicação
confere updatedAt/revisão da captura antes de ativar.

Backup JSON de livro com cenas passa a formato5, incluindo estrutura, prosa, plano,
referências e fonte da conversão sob revisão consistente. Legado mantém formatos
anteriores. Não anunciar backup completo que perde cenas. Restauração completa de
histórico e importação de backup continuam nas tarefas próprias.

## Sequência e gates

1. Registrar escolhas, contrato/interfaces e baseline CI de F2-01.
2. Backend/regras/índices, ordenação, mutações, composição, limpeza e testes reais.
3. Planner/editor de cenas, autosave/recuperação e testes de frontend.
4. Integrar capítulos, leitura/export/publicação/backup e guardas de clientes/IA legados.
5. Fixtures isoladas e Chromium: autor/mestre, Unicode/rich text, conflito/retry,
   páginas/ordem, arquivo, conversão/exclusão, teclado/320 px/temas e regressões.
6. npm ci functions, validate completo, regras, produção E2E, revisão independente,
   documentação/entrega, commit/PR e CI do SHA pertinente.

Subagentes podem trabalhar em backend e frontend com contratos fixos e ownership
separada. Integrações dependentes e cobertura são sequenciais. Não há dependência
nova, migração automática, quota comercial de cenas nem aceite de fases futuras.

## Evidência local — 2026-10-13

Implementação completa, revisão independente sem bloqueadores e validate verde:
136 arquivos/1.069 testes frontend, 77 scripts, 119 backend, cobertura
92,99/86,38/91,76/95,20. Regras reais: 67 aprovados, zero falhas/skips.
Chromium: 90 cenários completos e 18 dirigidos após os ajustes finais aprovados;
a suíte final ampliada passou nos 96 cenários, sem falha, skip ou retry.
Validate foi repetido após documentação/AGENTS e correção de espera no teste de
paginação; validate completo passou. As 90 regressões existentes passaram sem
falha, skip ou retry. E2E de produção local teve dois timeouts de recursos Google
externos em duas tentativas intactas, com UI renderizada e sem exceções da
aplicação; cinco testes não executados em cada tentativa. Traces preservados na
entrega. Browser de produção e CI do novo head dependem da verificação remota.

Registro detalhado: [entrega de cenas](../../../entregas/2026-10-13-writer-v2-cenas.md).
O [PR 21](https://github.com/gaabrielrd/writer/pull/21) conserva o incremento em
rascunho; seus checks pertinentes condicionam a conclusão técnica. Não antecipar
merge, deploy, piloto humano ou habilitação comercial.
