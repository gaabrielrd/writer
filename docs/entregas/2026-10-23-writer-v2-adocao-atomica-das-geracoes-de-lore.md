# Writer V2 — Adoção atômica das gerações de lore

Data: 2026-10-23. Incremento interno P1 M38c3i,
[plano 86](../tasks/writer-v2/execucao/86-adocao-atomica-das-geracoes-de-lore.md)
e [ADR 0101](../decisions/0101-atomic-lore-generation-adoption.md).

## Implementado

Serviço interno adota geração ready de origem inline/payload v1/v2 com CAS.
Cabeça, geração ativa/aposentadoria anterior, clock, timestamp, marca servidor
e recibo são atômicos. CreatedAt e conteúdo literal permanecem; updatedAt avança.
Recibo/evento nativos tornam o pai adopted, irreversivelmente.

Retirada de consentimento público explícito revoga publicBooks, incrementa epoch
e retorna o livro a draft no mesmo commit. Ausência é privada, conforme o
publisher/Rules existentes; nenhum default visual ou valor do cliente decide.
O espelho isPublic do stub é calculado no servidor e a inspeção lógica recusa
divergência.

Leases ficam logicamente adotadas pela ativação nativa da geração; seu phase
físico reserved permanece fence. Não há writes proporcionais às páginas.
A coleta reconhece a prova original somente após aposentadoria e continua
conferindo cabeça/referências/nascimentos. Campos herdados continuam protegidos.

Registro de fonte reconhece a cabeça preparada pelo recibo/evento de adoção.
Segunda edição usa a fonte realmente adotada, sem harness de troca de cabeça.
Replay antigo não reverte edição posterior nem recria a raiz excluída.

Rules preservam hasLoreResources como marca servidor e bloqueiam a exclusão
legada desses livros. A exclusão coordenada ainda precisa ser implementada.

## Evidência Node

**277 Node distintos positivos**, em rodadas dirigidas:

- Regressão dos oito arquivos afetados: tests 239, pass 239, fail 0,
  skipped 0, duration_ms 2616.4323.
- Arquivo novo inicial: 36 casos, 33 positivos e três falhas de fixture ao
  comparar funções toMillis de timestamps do mock por referência.
- Corrigidos os componentes nativos da comparação, só os três casos afetados
  e um caso novo extenso foram executados: tests 4, pass 4, fail 0,
  skipped 0, duration_ms 1623.0155.
- Caso novo com 129 leases reservadas: tests 1, pass 1, fail 0,
  skipped 0, duration_ms 951.367.

A união é 239 de regressão e 38 novos; repetições não aumentam a contagem.
Não houve uma rodada única dos 277.

Cobrem inline/v1/v2, timestamps/createdAt, consentimento true/false/ausente/
removido, epochs/clocks inválidos/esgotados, source/owner/deleting/raiz alterados,
CAS/replay/concorrência/rollback, certificado/controle/pai/evento recriados,
cancelamento após sucesso recusado, segunda edição real, registro de fonte e
coleta de bytes retirados, preservando os herdados.

Há dois casos extensos: 141 partes e 129 páginas, e 129 leases realmente
reservadas. Ambos adotam com até 12 writes de metadata, sem writes de
leases/chunks/descritores por página.

## Evidência SDK

Firestore 1.22.0 com SHA verificado, projeto demo e loopback dedicados:

```text
tests 3
pass 3
fail 0
skipped 0
duration_ms 66898.2067
```

1. Acesso público positivo antes e negado após revogação; cabeça/livro/geração/
   recibo compartilham timestamp nativo. Metadata normal do livro continua
   editável, marca servidor não pode ser removida e exclusão legada é recusada,
   com controle positivo equivalente sem recursos de lore.
2. Consentimento explícito do stub permite projeção pública de staging; após
   segunda adoção privada, projeção equivalente é negada. Geração anterior
   aposentada e corpo retirado coletado, lease/fence preservada e novo campo
   lido corretamente.
3. Rollback preserva cabeça, raiz, pai e geração. Retry realmente concorrente
   confirma uma adoção/clock; replay após excluir raiz não a recria nem toca
   novamente a cabeça.

Denies esperados são assertFails. Sem serviços/dados de produção, compras ou IA.

## Checks e revisão

Lint dirigido, arquitetura e sintaxe dos 200 módulos de Functions passaram.
Formatação, links da documentação e diff finais conferidos antes do commit.
Sem cliente/visual novo, não repetimos tipos/Vitest/build/navegador.
Validate/coverage integrais seguem no fechamento de P1.

Sem dependência, callable, UI ou worker novo. Commit local, sem push/PR/CI
remota/deploy. Master original preservada; Functions/Rules não implantadas.

## Próxima sequência obrigatória

Criação/exclusão e inventário completo do livro/lore, coordenação de todos os
writers/consumidores e backup lógico/indexado, cliente de escrita/recuperação
e drain de versões antigas antes de habilitar endpoint/UI.

Campos grandes restantes, certificação/ativação de restauração, capa/personas,
host/UI/roundtrip/validate permanecem pendentes. Raiz restaurada continua ausente.
Adoção interna não conclui P1/F2-09 nem Writer V2.
