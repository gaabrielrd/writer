# Writer V2 — Reserva dos uploads de lore

Data: 2026-10-23. Incremento interno P1 M38c3f,
[plano 83](../tasks/writer-v2/execucao/83-reserva-dos-uploads-de-lore.md)
e [ADR 0098](../decisions/0098-private-lore-edit-reservations.md).

## O que mudou

Tentativa privada congela intenção e inspeção da mesma origem. Reserva de
campos/páginas selados cria slot/inventário e liga job/lease à geração preparing,
com recibos e nascimentos nativos no mesmo commit. Pedidos não carregam prosa
nem ponteiros físicos. Cada avanço novo reautoriza; replay confirma seu evento.

Cancelamento fecha a geração antes de coletar os bytes próprios. Cleanup do
pai avança um slot por vez, com até 16 partes por unidade e header por último.
A capacidade interna ligada à transação permite limpar staged após ausência,
deleting ou revogação, mantendo bloqueio de cabeça/referências e recriações.
Corpo, upload, lease e pai avançam juntos; rollback não deixa remoção parcial.

Nenhuma cabeça, clock ou publicação foi alterada. O namespace bookLoreEdits
está negado ao SDK. Os controles/slots/recibos/leases permanecem como fences.

## Testes e resultados reais

**113 Node distintos positivos**: 38 novos de reserva, 45 existentes de upload
e 30 de inventário. As rodadas foram dirigidas, sem somar repetições:

- Regressão inicial de upload/inventário: 75 testes, 75 positivos, zero falhas,
  zero skips; duration_ms 1027.8976.
- Reserva expandida: 37 testes, 37 positivos, zero falhas, zero skips;
  duration_ms 1114.9424.
- Reconciliação independente do filho: um teste positivo, zero falhas/skips;
  duration_ms 226.5515.

Casos incluem fonte inline/v1/v2, 141 partes acima de 8 MiB, campos/removal/
páginas, CAS/concorrência, replay após revogação, cancelamento anterior ao início,
origem divergente, reserva já apropriada, rollback e cabeça tardia protetora.
Recriações de pai/geração/slot/job/lease/inventário/header/part são recusadas.
DTO, clone e capacidade usada em outra transação não autorizam coleta.
O pai reconcilia cleanup já concluído pelo filho sem recontagem.

**Cinco cenários SDK distintos positivos**, Firestore 1.22.0 com SHA verificado,
loopback e projeto demo dedicados:

1. Reserva realmente concorrente, metadata privada, origem/clock intactos,
   141 partes, cancelamento após remover livro, header por último e replay antigo.
2. Fontes v1/v2, campos/página e cancelamento após revogar autoria.
3. Cabeça atual referenciando bytes staged bloqueia cleanup; retomada após remover
   a referência no harness de teste.
4. Slot/lease/header/part recriados são preservados.
5. Falha no write do pai reverte remoção física e todos os controles; retry conclui.

A primeira tentativa não chegou ao contrato: regex do teste rejeitava o próprio
endereço loopback. Após corrigir o guard, a rodada teve três positivos e duas
falhas de fixture por reutilizar inspectionId entre livros. IDs únicos corrigiram
essas fixtures; somente os dois cenários afetados foram repetidos, ambos positivos:

```text
tests 2
pass 2
fail 0
skipped 0
duration_ms 40369.8846
```

Os outros três positivos permanecem válidos da rodada anterior
(duration_ms 82352.9521 para aquela rodada de cinco, com duas falhas).
Não houve uma rodada única de cinco verdes após a correção exclusiva das fixtures.
Denies esperados usam assertFails; não são falhas dos cenários.

## Validações e revisão

Lint dirigido e arquitetura passaram. O check de Functions atingiu o limite de
linha do Windows; foi substituído por runner que executa node --check por módulo,
mantendo e ampliando a sintaxe para todos os 191 módulos .mjs de functions/src.
O comando npm --prefix functions run check passou.

Revisão de diff, formatação e links da documentação verificadas antes do commit.
Sem código cliente/visual alterado, não repetimos tipos/Vitest/build/browser.
Validate/coverage integrais continuam no fechamento de P1, conforme orientação
do operador. Nenhuma dependência nova, serviço pago ou dado de produção usado.

## Próxima sequência

Compilar geração completa, ligar referências sob preparing, materializar origem
inline e certificar os corpos atuais. Depois adotar cabeça/leases/clock/
privacidade/recibo no mesmo CAS. Leases adopted e exclusão de livro/lore ainda
não estão integradas; preservar namespaces privados durante essa integração.
Uma cabeça com autoria/escopo divergente continua bloqueando a coleta própria.

Cliente de escrita, demais consumidores, backup lógico/indexado, campos grandes
restantes, certificação/ativação, capa/personas e host/UI/roundtrip continuam
pendentes. Nenhum endpoint, worker ou UI novo; raiz restaurada permanece ausente.
M38c/P1/F2-09 e Writer V2 continuam abertos.

Somente commit local; sem push/PR/CI remota/deploy.
