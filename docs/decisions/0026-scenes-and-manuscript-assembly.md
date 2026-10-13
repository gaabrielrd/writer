# ADR 0026 — Texto próprio das cenas e composição do manuscrito

- **Status:** Aceito; implementado e concluído tecnicamente em `f4449a5`, com CI e regras verdes
- **Data:** 2026-10-13

## Contexto

Autores e criadores de aventuras precisam planejar e escrever por cenas sem
duplicar prosa nem expor notas privadas. Livros existentes usam um documento por
capítulo, com IDs, editor, atos, personas, exportações e publicação gratuitos.
O operador escolheu texto próprio por cena e arquivamento fora da composição,
preservando o conteúdo e sua restauração.

## Decisão

1. `scenes` é uma capacidade compartilhada de livros e aventuras autorais, consumida
   pela interface pública. Campanhas continuam distintas. Partes de aventura são
   agrupadores mínimos; não representam sessões, pistas ou uma engine de regras.
2. Capítulo sem `contentMode: scenes` conserva seu contrato legado. Conversão
   explícita cria uma cena com o texto inteiro e guarda uma fonte privada imutável
   independente do agrupador. Comparar o fingerprint do capítulo observado antes
   de converter. Não migrar durante leituras nem concatenar fonte e cenas.
3. Compor somente a prosa das cenas ativas vinculadas, em ordem, preservando blocos
   ricos pelo sanitizador existente. Arquivadas e sem agrupador ficam fora do
   manuscrito. Plano e referências não entram em exportação literária ou publicação.
4. Autoria, CAS, contagens, datas e recibos pertencem ao servidor. Cada cena tem
   resumo separado de corpo/plano e referências individuais. Cursores e capturas
   verificam revisões; falhas não transformam páginas incompletas em resultado final.
5. Ordenação usa duas posições por cena e slot ativo por agrupador. Reorganização
   preenche o slot inativo em lotes e troca atomicamente ao terminar. Jobs expõem
   checkpoints autorizados para recuperar pedidos originais após recarregar.
6. Remover capítulo/parte marca a seleção inteira antes de limpar e desvincula
   cenas, preservando prosa e referências. Remover livro revoga a publicação antes
   de limpar todos os filhos no servidor, deixando tombstone ao finalizar.
7. Regras protegem modo e controles contra clientes antigos; aceite de IA do
   capítulo também confere o modo dentro da transação. Publicação captura
   `sourceSceneRevision` e não ativa uma versão cuja fonte mudou durante o staging.
8. Backup privado de livros com recursos de cena usa JSON v5 e conserva grupos,
   cenas ativas/arquivadas/sem agrupador, plano, referências e fontes. O original
   é reconstruído por `{...original, content}`, sem corpo duplicado no armazenamento.
9. Editor de cena usa prosa rica, autosave CAS e rascunho por UID/tipo/projeto/cena,
   com comparação explícita de conflitos. Assistência especializada de IA continua
   na tarefa própria; não executar protocolo de IA de capítulo com IDs de cena.

## Consequências

Functions, regras e índices exigem implantação conjunta autorizada antes do uso
real. Clientes antigos podem continuar nos capítulos legados, mas não escrever
prosa ou publicar uma fonte congelada de capítulo convertido pelo fluxo antigo.
Novos capítulos podem reunir mais texto do que o orçamento de uma projeção pública;
nesse caso pedir divisão, preservando conteúdo e publicação anterior.

Histórico completo, diagramação, templates, sessões, edição paga, pilotos humanos
e habilitação comercial mantêm suas tarefas e aceites. Esta decisão não comprova
esses resultados nem autoriza deploy ou merge. Contrato detalhado e estado dos
gates: [execução F2-02](../tasks/writer-v2/execucao/08-planejamento-de-cenas.md).
