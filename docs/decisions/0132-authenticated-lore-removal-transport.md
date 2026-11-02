# ADR 0132 — Transporte autenticado da retirada de lore

- Estado: aceita; executor ADR 0133 e host ADR 0134 locais; compêndio pendente.
- Data: 2026-10-24.
- Plano: [117 / M38c5s](../tasks/writer-v2/execucao/117-transporte-autenticado-da-retirada-de-lore.md).

## Decisão

Expor o serviço da ADR 0103 por bookLoreRemoval no wrapper regional existente:
Auth por request.auth.uid, enforceAppCheck, timeout de 120 segundos,
private/no-store e Vary Authorization. Sem segredo, cobrança ou alteração de Rules.

Allowlist própria congelada tem sete métodos: start/get/advance/cancel de
SourceInspection e start/get/advance de Removal. Inspeções usam somente
lore-removal-source-<sha256>; retiradas usam lore-removal-<sha256>.
Start aceita referência de inspeção do mesmo namespace. IDs de análise/
criação/edição, métodos internos/herdados e envelopes adicionais são recusados
antes de abrir um serviço. Parsers nativos conferem DTO, conta, sourceToken e
nascimentos originais. Não ampliar bookLoreEdit nem journals: preservam 22
métodos no transporte manual e 18 no formato persistido.

## Cliente e efeito irreversível

bookLoreRemovalSession é porta interna. Captura actor/host antes/depois de RPC;
input é cópia profundamente congelada antes do SDK. Falhas sobem sem retry,
fallback SDK ou troca da fonte. Metadata do ReadClient usa getBookLoreRead
validado e não baixa partes de texto; não substitui prosa por conteúdo vazio.

Inspeção conserva a cabeça. startBookLoreRemoval já retira a ficha, avança o
clock e cria tombstone permanente atomicamente: não equivale a preparar nem
pode ser enviado automaticamente ao abrir a futura UI. GET confirma somente
o evento original. Advance usa recibos/CAS nativos e limpeza limitada,
inclusive handoff existente para exclusão do livro.

## Evidência e consequências

62 testes Node, 104 Vitest e dois novos casos SDK em emulador positivos:
168 distintos, 27 novos. Retake da sessão 13/13 também positivo.
SDK significa Admin/cliente Firestore reais contra emulador local; confirma
concorrência, timestamps, Rules privadas, cleanup e cancelamento separado.
Dispatch de callable integrado, sem exercitar Auth/App Check em produção.

Journal metadata e executor recuperável foram acrescentados posteriormente
na [ADR 0133](0133-recoverable-lore-removal.md). O host foi acrescentado na
[ADR 0134](0134-recoverable-lore-removal-ui.md). Composição no compêndio e ações
em lote permanecem pendentes; não ativar entrada antes dessa composição.
Lifecycle, consumidores/backup/rollout e validate de P1 seguem necessários.
P1/F2-09/V2/fases 3–5/gates humanos/comerciais abertos. Somente commits locais.
