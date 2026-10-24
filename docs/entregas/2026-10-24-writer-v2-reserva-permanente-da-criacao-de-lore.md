# Writer V2 — Reserva permanente da criação de lore

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2, somente commit local.
- **Plano**: [89, L1](../tasks/writer-v2/execucao/89-criacao-do-lore-por-reserva-permanente.md).
- **Decisão**: [ADR 0104](../decisions/0104-permanent-book-lore-creation-reservation.md).

## Objetivo e implementação

Preparar a criação de lore sem usar uma ficha vazia como origem fictícia.
Este incremento implementa reserva e cancelamento vazios; a criação completa
ainda depende de uploads L2 e composição/ativação L3.

Start reserva ID derivado no servidor por UID/livro/creationId. Contexto e
marcador imutáveis são nativos e atômicos com hasLoreResources. Cabeça e bytes
continuam ausentes; clock/datas/publicação/créditos permanecem intactos.

Cancel conserva ID/contexto/marcador e registra evento/prova juntos. Cancel
antes do start cria fence privado, sem reservar namespace de livro alheio.
Retries confirmam a intenção histórica; outra intenção com o mesmo creationId
é rejeitada. Revogação/raiz ausente não recriam projeto ou grant de conteúdo.

Abertura interna exige livro original atual/autorizado, marcador original,
capacidade de clock e cabeça/tombstone ausentes. DTO reconstruído ou outra
transação não substituem essa prova.

Etapa creations do inventário v3 do livro cancela reservas vazias junto do
checkpoint externo. Contextos/fences permanecem após remover a raiz.
Recursos inesperados bloqueiam o cancelamento; nenhum purge de payload é
declarado como implementado.

Rules, leitor e análise Admin protegem os IDs reservados contra cabeça
prematura/reutilização. Outros IDs continuam sob os gates legados existentes.
Sem endpoint/UI novo nem dependência.

## Critérios de L1

- [x] Reserva nativa por autor/livro ativo e capacidade de clock válida.
- [x] ID servidor, intenção fechada, marcador/flag atômicos.
- [x] Cabeça/prosa/bytes ausentes, datas/clock/publicação sem alteração.
- [x] Retry/concorrência/cancel-before-start e evento/prova permanentes.
- [x] Origem/controle recriados não obtêm capacidade.
- [x] Cancelamento vazio após revogação, sem tocar conteúdo alheio.
- [x] Recursos inesperados preservados e cancelamento bloqueado.
- [x] Inventário do livro coordenado, rollback e retomada nativos.
- [x] SDK com controles positivos e negações específicas do ID.
- [x] Testes dirigidos, revisão e documentação.
- [ ] Uploads e inventário/cancelamento de filhos L2 antes do primeiro byte.
- [ ] Composição/auditoria/adoção e sucesso histórico L3.
- [ ] Criação completa no cliente e validate integral de P1.

## Arquivos

Novos bookLoreCreation, Contracts e Store internos; integração de creations
em bookLoreDeletion/Store e transição de bookLoreRemovalHandoff.
Rules e guardas de bookLoreStorageRead/loreAnalysis atualizados.

Novo arquivo Node e helper de criação; três SDK novos. Leitores v1/v2 mantêm
contagem exata com leitura adicional da reserva. Dois casos novos da análise
provam rejeição antes de cobrar. Nenhum TS/UI ou pacote alterado.

## Evidência Node

Duas rodadas dirigidas, **336 casos distintos positivos**, sem falhas:

```text
Reserva e exclusões diretamente afetadas:
tests 90
pass 90
fail 0
skipped 0
duration_ms 2064.5082

Leitores, upload, inspeção, adoção, inventário e análise:
tests 246
pass 246
fail 0
skipped 0
duration_ms 4694.9779
```

São 31 casos do novo arquivo, 59 das exclusões do livro/ficha e 246 das
regressões, incluindo dois novos da análise. Sem somar repetições.

Cobrem publicação/datas/clock preservados, reserva metadata-only, dois pedidos
independentes, concorrência, outro dono/deleting/counter inválido/esgotado,
cancel prévio privado, revogação, intenção exata, DTO/cross-TX, raiz/controle/
marcador/evento/prova recriados, rollback inicial/terminal/checkpoint externo,
recursos inesperados, cabeça prematura e exclusão posterior do livro.

O leitor continua constante, com um único chunk: v1 base 6/relações 8;
v2 campo com base 7/relações 8 e campo sem base 6 leituras.
As guardas permanentes de retirada e reserva são ambas conferidas.

## Evidência SDK

Firestore 1.22.0 com SHA verificado, projeto demo e loopback dedicados.
**Três casos distintos positivos**, em rodadas dirigidas:

- Inicial: tests 3, pass 2, fail 1, duration_ms 14742.427.
- Corrigida somente a fixture afetada: tests 1, pass 1, fail 0,
  skipped 0, duration_ms 3028.441.

A fixture usava o mesmo creationId do UID para dois livros no mesmo teste.
A rejeição foi a regra correta do servidor. O segundo cenário recebeu ID novo;
não se alterou nem relaxou a implementação.

1. Start realmente concorrente reserva uma vez, com contexto/marcador/flag
   no mesmo timestamp nativo. Publicação/clock/datas mantidos; outro ID pode
   ser criado pelo SDK, mas o reservado é negado sob o mesmo gate. Controles
   privados, flag protegida, cancelamento/evento/prova acoplados.
2. Cancel-before-start não cria marcador de livro alheio; retry não muda a
   raiz posterior. Cabeça prematura é recusada e marcador recriado não
   confirma a reserva original, preservando o dado para reconciliação.
3. Falha no checkpoint externo reverte cancelamento/prova e ambos os progressos.
   Retry conclui a exclusão do livro e mantém reserva/cancelamento históricos.

Denies esperados usam assertFails. Sem produção, compra, IA ou chamadas pagas.

## Checks e revisão

Arquitetura e sintaxe dos 213 módulos de Functions passaram. Lint dirigido
identificou dois imports não usados no teste novo; removidos e o único arquivo
afetado passou na repetição. Demais arquivos passaram no lint inicial.

Formatação, links e diff finais conferidos antes do commit. Sem TS/UI novos,
não repetimos tipos, Vitest, build ou navegador. Validate/coverage integrais
seguem no fechamento de P1; CI remota ignorada. Dev server continua aberto.

## Pendências e próximo incremento

L2 deve ampliar inventário/cancelamento antes de gravar bytes: intenção nativa
de cancel deve bloquear uploads novos, e cleanup deve resolver todos os filhos
antes do evento terminal. Integrar fonte de criação ao protocolo existente sem
fabricar cabeça/inspeção. L3 compõe/audita geração e ativa cabeça/leases/clock/
recibo; reserva adotada vira sucesso histórico e não aceita cancelamento.

Demais writers/consumidores/backup lógico/indexado, cliente/recuperação e
roteamento de preparações sem marca continuam antes da exposição de endpoint/UI.
Campos grandes restantes, certificação/ativação da restauração, capa/personas,
host/roundtrip/validate e fases posteriores permanecem pendentes.
P1/F2-09/Writer V2 abertos. Sem push, PR, CI remota ou deploy.

## Como verificar

functions/test/bookLoreCreation.test.mjs contém o protocolo Node.
tests/firestore/bookLoreCreation.rules.test.mjs exige emulador demo dedicado
em 127.0.0.1, conforme [testes](../testing.md). Nenhum fluxo de UI é habilitado
por L1; não testar cancelamento/limpeza com livro real.
