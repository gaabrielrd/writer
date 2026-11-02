# ADR 0111 — Reserva nativa antes de preparar o lote da análise

- Data: 2026-10-24.
- Estado: aceito internamente, sem habilitar produtores de bytes.
- Plano: [96 / A2b1](../tasks/writer-v2/execucao/96-reserva-nativa-do-lote-da-analise.md).
- Antecedentes: [ADR 0109](0109-logical-lore-analysis-context.md) e
  [ADR 0110](0110-atomic-book-lore-adoption-batches.md).

## Contexto

A análise já lê lore lógico e existe adoção conjunta de gerações. Preparar
cada item sem registrar antes todos os filhos deixaria trabalhos impossíveis
de retomar ou descobrir no cancelamento/exclusão. O manifesto precisa nascer
antes do primeiro produtor e preservar 1..50 alvos locais/globais/novos.

## Decisão

createLoreAnalysisService compõe um serviço interno de reserva/get/cancel,
sem novo callable. O início lê a análise ready e reabre o contexto lógico na
mesma transação. Extrai-se loreAnalysisContext e os validadores puros para
reuso, preservando a fórmula de revisão e os limites existentes.

O contexto imutável em users/{uid}/loreAnalysisApplications/{id} fixa dono,
análise/nascimento/fingerprint/provedor, livro/capítulo/universo e seus
nascimentos observados na reserva, revisão, hashes de texto/pedido e expiração.
O hash de texto conserva a codificação JSON usada pela análise, diferente do
digest de texto bruto empregado por outros protocolos.

O manifesto contém até 50 alvos, origem nativa dos existentes e hash dos patches.
Mantém somente metadata, sem nomes, prosa do compêndio ou valores dos patches.
IDs de criação/inspeção/edição/uploads derivam no servidor da análise nativa,
pedido e índice. Fichas locais novas preveem campos padrão privados e relações
explicitamente presentes/vazias. Referências globais qualificadas validam os
componentes, preservando seus limites em vez de encurtar o identificador.

Contexto, estado e evento/prova originais nascem na mesma transação, junto da
marca servidor hasLoreResources. Token fixa contexto e nascimento. Estado
subsequente exige prova imutável ligada nativamente ao update. Nenhum clock,
cabeça, corpo ou crédito é alterado pela reserva.

Get/retry são metadata e não reabrem texto ou concedem autoridade para uploads.
Podem confirmar o mesmo pedido após expiração/revogação/exclusão da origem.
Mudança de intenção, token ou recriação parcial das provas é conflito.
Cancel-before-start cria fence permanente sem exigir análise/livro vivos.

Neste passo, somente reservas sem filhos podem ser canceladas: todos os IDs
planejados são conferidos antes do commit. Filho encontrado bloqueia para
reconciliação; não é adotado ou apagado por inferência. Nenhum produtor novo
está habilitado. A2b2 deve ligar pai/filho/checkpoint na mesma transação e
coordenar cancelamento/limpeza antes de criar o primeiro byte.

Exclusão do livro descobre reservas por bookId e passa pela fase applications
antes das edições. Valida cutoff e nascimento original e fecha a reserva na
transação do checkpoint, preservando metadata permanente. Checkpoints antigos
nas fases existentes continuam válidos. Rules negam SDK na árvore inteira
do novo namespace.

## Consequências e próximos passos

A2b1 é reserva metadata, não prontidão nem aplicação da análise. A2b2 deve
reautorizar análise e origens por unidade, conferir os nascimentos fixados,
ligar provas dos filhos, retomar produção e coordenar seu cleanup. Antes disso,
a presença de qualquer filho é bloqueio explícito, inclusive na exclusão.

A2c deve confirmar gerações locais, alvos globais, novas fichas, crédito e
recibo reais juntos, preservando até 50 itens. applyLoreAnalysis mantém seu
contrato atual e continua recusando payload. Demais consumidores, backup,
cliente, rollout e certificação de P1 permanecem abertos. Sem novo endpoint,
índice, dependência ou implantação.

## Evolução em 2026-10-24

[ADR 0112](0112-bound-lore-analysis-application-preparation.md) acrescenta
produtores, vínculos nativos e cleanup coordenado. Cancelling fecha o pai
antes de limpar filhos; dados sem prova original continuam preservados para
reconciliação. A2c e as demais integrações permanecem pendentes.
