# Writer V2 — Exclusão dos recursos de lore do livro

Data: 2026-10-24. Incremento interno P1 M38c3j,
[plano 87](../tasks/writer-v2/execucao/87-exclusao-dos-recursos-de-lore-do-livro.md)
e [ADR 0102](../decisions/0102-coordinated-book-lore-deletion.md).

## Objetivo e implementação

Evitar que a exclusão de um livro remova sua raiz deixando preparações e
payloads de lore sem limpeza coordenada. O inventário v3 de deleteSceneBook
agora resolve edições, uploads e inspeções antes de remover cabeças, aposentar
gerações e limpar descritores/partes/headers. Publicação deve estar revogada.

Contexto privado imutável fixa livro, checkpoint efetivo e cutoff nativos.
Estado/eventos/âncoras ligam cada unidade ao progresso externo. Cancelamentos
dos protocolos filhos usam a mesma transação; falha externa reverte bytes,
inventário e os dois checkpoints juntos. Aliases e migração v1/v2 preservam
a operação e a fase legada, sem reiniciar uma identidade recriada.

Limpeza de payload lê metadata, até 16 partes por unidade, e remove header
por último. Corpos controlados exigem inventário e provas de lease adotada/
aposentada; legados sem controle/lease usam header imutável/cutoff, sem geração
fabricada. Escopo divergente, objetos recriados e chunks órfãos ficam
preservados e bloqueiam concluir. Finish reconfere ausência de conteúdo.

Jobs, controles, leases e recibos permanecem fences. processed conta as remoções
diretas somadas ao inventário existente; protocolos filhos mantêm seus próprios
contadores, e coordinatedUnits conta unidades coordenadas, sem total fictício.

No cliente, hasLoreResources encaminha a exclusão ao servidor; finalização SDK
legada recusa esses livros. Backend também descobre preparações sem a marca.
O roteamento dessas preparações ainda precisa ser integrado antes de habilitar
uploads/escrita ao cliente.

## Critérios do incremento

- [x] Barreira deleting/publicação revogada e identidades nativas fixadas.
- [x] Cancelamento de preparação e filhos inline sem reautorizar prosa.
- [x] Sucesso adopted e fences privados preservados.
- [x] Limpeza limitada de cabeças, gerações, descritores e payloads.
- [x] Header por último, sem ler bytes/proof na coleta.
- [x] Rollback/retomada/aliases e migração v1/v2.
- [x] Recriação ou escopo divergente impedem remoção da raiz.
- [x] SDK nega controlador privado e reativação do livro deleting.
- [x] Roteamento de livros marcados e recusa da finalização legada.
- [x] Validação dirigida, documentação e revisão do diff.
- [ ] Validate integral, reservado ao fechamento de P1.
- [ ] Roteamento completo de preparações ainda não marcadas antes de exposição.

## Arquivos

Quatro módulos novos em functions/src: bookLoreDeletion, bookLoreDeletionStore,
bookLoreDeletionJobs e bookLoreDeletionPayload. Integração em sceneJobs e nos
cancelamentos de edição/upload/inspeção. Novo namespace negado em firestore.rules.

Modelo Book e serviços bookService/publicationService reconhecem a marca.
Testes novos Node/SDK, helper compartilhado e ajustes de fixtures nas regressões
de cenas, capítulos, narrativa e histórico. Sem dependência nova ou UI.

## Evidência Node

**248 casos Node distintos positivos**, em rodadas dirigidas:

| Escopo                                                               | Resultado real                                                                          |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Novo arquivo bookLoreDeletion, após correção compartilhada do helper | tests 23, pass 23, fail 0, skipped 0, duration_ms 1741.1173                             |
| Cenas                                                                | tests 19, pass 19, fail 0, skipped 0, duration_ms 1171.716                              |
| Capítulos, narrativa e histórico                                     | 66 casos; rodada inicial pass 65/fail 1, somente expectativa antiga de cleanupVersion 2 |
| Repetição da expectativa corrigida para v3                           | tests 1, pass 1, fail 0, skipped 0, duration_ms 427.8264                                |
| Cancelamentos de upload/edição/inspeção e materialização inline      | tests 140, pass 140, fail 0, skipped 0, duration_ms 2029.5871                           |

A união é 23 + 19 + 66 + 140. Repetições não aumentam a contagem;
não houve uma rodada única dos 248.

As primeiras rodadas do arquivo novo localizaram colisão de factory no helper
e ID curto em fixture de payload tardio. Corrigidos os testes afetados. O helper
compartilhado posteriormente recebeu callback async exigido pelo SDK, e os
23 casos que o usam foram conferidos na rodada final acima.

Cobertura dirigida inclui inline/v1/v2, preparação parcial não reservada,
upload independente/inspeção pendente, corpo legado com 141 partes, metadata-only,
header por último, rollback, aliases, fases v1/v2 preservadas, abertura interna
não copiável, conteúdo tardio e lease desconhecida. Livro, contexto, estado,
checkpoint, corpo, parte, inventário, geração e segmento recriados são recusados.

## Evidência SDK

Emulador Firestore 1.22.0 com SHA verificado, projeto demo e loopback dedicados:

```text
tests 5
pass 5
fail 0
skipped 0
duration_ms 140699.0701
```

1. Livro adotado: acesso público positivo antes da barreira e negado depois;
   deleting não pode voltar a false. Rollback reverte parte, inventário, raiz,
   controlador e checkpoint externo. Alias retoma, limpa conteúdo e preserva
   sucesso/leases/controles; replay não recria raiz. SDK não acessa o controlador.
2. Preparação inline parcial, upload independente e inspeção pendente são
   cancelados com cursor do livro; buffers/estado SHA saem e fences permanecem.
3. Corpo legado com 141 partes sai em lotes de até 16, mantendo header até os
   chunks terminarem e removendo a raiz somente ao fim.
4. Header com dados iguais recriado recebe outro nascimento e não é removido.
5. Parte com dados iguais recriada também impede continuar e preserva a raiz.

A rodada inicial dos cinco parou no helper síncrono de markBookDeleting:
o SDK exige Promise no callback. Após torná-lo async, os cinco passaram.
Denies esperados são assertFails; sem dados reais ou produção.

## Cliente e checks

Vitest dos dois serviços de livros: **2 arquivos, 91 testes positivos**,
duration 24.47s. Typecheck passou. Lint dirigido, arquitetura e sintaxe dos
204 módulos de Functions passaram. Formatação, links e diff finais conferidos
antes do commit.

Não repetimos build, cobertura, suíte integral ou navegador neste incremento
sem UI nova. Validate integral continua no fechamento de P1, conforme política
do operador. O dev server da V2 permanece disponível para testes manuais;
ele não representa Functions/Rules novas implantadas.

## Limitações e próxima sequência

Criação/exclusão individual de lore e roteamento completo de preparações ainda
sem marca, todos os writers/consumidores, backup lógico/indexado e recuperação
cliente seguem antes de habilitar endpoint/UI da escrita. O inventário do livro
não equivale a uma auditoria de todos os namespaces do produto.

Campos grandes restantes, certificação/ativação da restauração, capa/personas,
host/UI/roundtrip e validate permanecem pendentes. A raiz restaurada continua
ausente; P1/F2-09 e Writer V2 permanecem abertos.

Somente commit local, sem push/PR/CI remota/deploy ou dependência nova.
Master original preservada. Nenhum pedido pago, IA ou serviço de produção.
