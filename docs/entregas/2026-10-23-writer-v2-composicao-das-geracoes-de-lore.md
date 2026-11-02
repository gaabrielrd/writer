# Writer V2 — Composição de gerações de lore em payload

Data: 2026-10-23. Incremento interno P1 M38c3g,
[plano 84](../tasks/writer-v2/execucao/84-composicao-das-geracoes-de-lore.md) e
[ADR 0099](../decisions/0099-private-lore-generation-compilation.md).

## Implementado

Compositor reautoriza a mesma origem payload v1/v2, congela reservas, preserva
base/campos herdados e aplica substituições/remoções. Relações sem mudança
mantêm geração; diff de páginas cria descritores próprios, reaproveitando página
compatível ou upload reservado. Cada corpo recebe referência nativa à geração
preparing antes de avançar a seleção.

Auditoria lê uma parte por unidade, verifica Merkle/nascimento/SHA e valida
domínio de campos/páginas. Estado privado de SHA/parser sai no EOF/cancelamento.
Certificado ready fixa metadata e storage v2 com prova do recibo original.
Abertura nativa exige a mesma transação e autorização atual; nenhuma cabeça,
clock ou publicação é alterada.

Cancelamento coordena os slots e depois remove somente descritores próprios
com provas nativas e guard da cabeça. Herdados e fences permanecem. Origem
revogada permite cleanup próprio, mas não abertura do certificado.

## Validação real

**69 Node distintos positivos**, em rodadas dirigidas:

- 38 testes de reserva existentes após a integração: tests 38, pass 38,
  fail 0, skipped 0, duration_ms 799.7996.
- Compositor expandido: tests 28, pass 28, fail 0, skipped 0,
  duration_ms 1988.0505.
- Três casos acrescentados na revisão: tests 3, pass 3, fail 0,
  skipped 0, duration_ms 249.3276.

São 31 casos novos e 38 de regressão. O primeiro arquivo novo tinha duas
asserções de recriação que não acionavam o cancelamento real; foram corrigidas
para abrir positivamente, recriar, cancelar e só então testar a coleta.
A rodada expandida cobre essas correções. Repetições não aumentam a contagem.

Cobrem v1/v2, v2 sem base, ausência de createdAt, campo acima de 8 MiB/128 partes,
129 páginas, domínio inválido em página herdada, SHA/checkpoint, partes ausentes/
recriadas, diff/remoção de relações e cauda incompatível. Incluem fonte/clock/
publicação intactos, CAS/replay/rollback, revogação, preparação parcial,
segmento/journal/estado/certificado recriados e cabeça tardia protegendo segmentos.
Clone de pai e outra transação não autorizam a abertura interna.

**Três SDK positivos**, Firestore 1.22.0 verificado por SHA, projeto demo e
loopback dedicados:

```text
tests 3
pass 3
fail 0
skipped 0
duration_ms 79898.9956
```

1. Reserva congelada com avanço realmente concorrente, composição v2 com página
   herdada/nova, checkpoint/certificado privados, origem nativa intacta e cleanup
   após revogar autoria, preservando corpos herdados.
2. Checkpoint, segmento e certificado recriados não reutilizam a prova original.
3. Falha no write do pai reverte a inicialização do controle de corpo; retry da
   mesma unidade funciona sem efeito parcial.

Denies esperados usam assertFails. Sem dados/serviços de produção, compras ou IA.

## Checks e revisão

Sintaxe dos 195 módulos de Functions e arquitetura passaram. Lint identificou
dois imports de teste sem uso, removidos. Lint/formatação/documentação/diff finais
conferidos antes do commit. Sem cliente/visual novo, não repetimos tipos, Vitest,
build ou navegador; validate integral permanece no fim do bloco P1.

Sem nova dependência, namespace público, callable, worker ou UI. Somente commit
local, sem push/PR/CI remota/deploy; master original preservada.

## Pendências preservadas

O passo 4 do plano 82 ainda não terminou: falta materializar fontes inline no
servidor, incluindo cleanup dos filhos antes de estarem reservados. O teste
temporário de inline comprova recusa sem mutação, não suporte final do produto.

Depois: adoção CAS/leases/clock/privacidade/recibo, criação/exclusão e cliente;
demais consumidores e backup lógico/indexado; campos grandes restantes,
certificação/ativação, capa/personas e host/UI/roundtrip/validate.
Leases adopted e exclusão do livro ainda precisam de integração.
P1/F2-09 e Writer V2 continuam em andamento.
