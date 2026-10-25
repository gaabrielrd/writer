# P1 / M38c6 — Visibilidade durável da seleção de lore

## Objetivo e requisitos

Preservar a ação existente de tornar a seleção pública ou privada quando o
compêndio de livros adotar o lore nativo. Seleção inteira, origens fixas,
confirmação explícita, progresso parcial, cancelamento e retomada protegida.
Não reduzir a seleção a 50 fichas nem representar visibilidade como retirada.

- Manifesto metadata por conta/livro/seleção, bool desejado e IDs de filhos
  determinísticos antes de produção. Páginas de até 50 são unidades de I/O.
- Captura C1 completa/token v2 original para preparar o campo isPublic;
  não usar stubs, recaptura divergente, promoção de token ou fonte fictícia.
- Reaproveitar a edição manual cifrada; fonte/draft/checkpoint preservados.
  Gate metadata antes da RPC registra controles de uploads/edição; sem
  texto no manifesto, ledger ou callback.
- Guard síncrono e gate assíncrono rechecados antes da RPC. Cancel não
  espera produtor/lock de rede e bloqueia unidades novas.
- Salvar dívida local sem avançar outra unidade. Abrir/verificar/preparar
  não aplicam uma alteração, inclusive quando checkpoint contém apply pendente.
- Antes de aplicar, persistir referência/hash/token e intenção de apply.
  Resposta perdida consulta bookLoreEditOutcome; reenvio só explícito.
  Pin de jobToken/outcomeToken após observação. Não inferir aceite por valor
  atual, fase local ou worker salvo.
- Estado desejado já presente vira resultado distinto de nenhuma alteração,
  com origem conferida e IDs fechados. Não criar edição fictícia nem
  afirmar que a visibilidade atual está congelada depois da seleção.
- Cancel visita todos os IDs, preserva aceites e fecha produção antes da
  limpeza. Perda do journal não elimina referências metadata de pedidos.
- Revisão/confirmar/reenvio separados, nomes autorizados somente em RAM,
  descoberta paginada metadata, actor exato, temas/foco/mobile/teclado.
- Callback somente por resultados nativos conferidos, uma vez por seleção;
  não certificar atomicidade de grupo nem limpeza de corpos.

## Sequência e arquivos previstos

1. ManualOperation/PersistedOperation/EditService: gate de unidade metadata
   e flush local sem RPC de edição; regressões de dívida/cancel/actor.
2. VisibilitySelectionContracts/Db: manifesto e progresso fechado, IDB CAS
   oncomplete/Web Locks curtos, referências originais e resultados por membro.
3. VisibilitySelectionOperation/Service: preparar fonte real, compor filhos,
   consultar aceite, retry explícito, fechamento independente e reconciliação.
4. VisibilitySelectionReview e diálogo/retomadas: kit e acessibilidade;
   exportar antes da montagem coordenada do compêndio.
5. Composição do compêndio com leitura nativa e todas as ações existentes,
   mantendo universos/aventuras em seus contratos próprios.
6. Testes dirigidos por marco; Chromium real IDB/locks e UI quando existir.
   Documentar resultado real e commit local por incremento coerente.

## Critérios de aceite e riscos

Mais de 50 fichas, mixed/no-op, troca de origem, resposta perdida, dívida antes/
depois de RPC, duas abas, cancel com produtor retido, ACK tardio, reinício,
journal filho perdido, conta/contexto e descoberta sem prosa. Nenhum método
novo nos conjuntos fechados 18/22/7 ou mudança no formato cifrado existente.

Esta tarefa só termina com coordenação/retomada e interface completas;
o primeiro marco de gate/flush é infraestrutura necessária, não entrega
final de visibilidade em lote. Não antecipar mudança em Rules/deploy.

Validate completo no fechamento de P1. Lifecycle/consumidores/backup/rollout,
demais fases/gates humanos/comerciais da V2 permanecem no objetivo.
Somente commits locais, sem CI/push/PR/merge/deploy.

## Marco A — pontos de controle implementados

Gate metadata capturado após write-ahead e antes de RPC, revalidação tardia
de contexto/ticket/cancel e flushLocal sem dirigir produção. 155 casos distintos
positivos, dez novos; lint/tipos/build/smoke positivos. Nenhum schema/backend/UI
alterado. [ADR 0140](../../../decisions/0140-lore-manual-unit-gate-and-local-flush.md)
e [evidência](../../../entregas/2026-10-25-writer-v2-controle-de-unidades-da-visibilidade.md).

Marco A não conclui esta tarefa. Prosseguir com manifesto/ledger, executor e
resultados no-op, cancel/retomada/revisão/UI e composição do compêndio, além de
todos os demais pendentes de P1 e fases/gates. Sem CI/envio remoto/deploy.

## Marco B — manifesto, ledger, executor e sessão implementados

writer.book-lore-visibility-selections v1 com plano completo e estados metadata,
páginas de até 50 sem cap total, CAS/oncomplete e refs/tokens monotônicos.
Executor compõe C1/v2 e filhos cifrados, prova original, retry explícito, dívida
local isolada e cancel sem chave, preservando aceites. Unchanged distinto e
conflitos antes/depois de ready. Formatos antigos preservados.

98 casos distintos e nove jornadas Chromium positivos; lint/tipos/build/smoke
positivos. A corrida de observação de limpeza retida atualizando o membro ativo
seguinte foi reproduzida e corrigida com geração/membro fixos.
[ADR 0141](../../../decisions/0141-durable-book-lore-visibility-selection.md) e
[evidência](../../../entregas/2026-10-25-writer-v2-executor-da-selecao-de-visibilidade.md).

Etapas 2 e 3 implementadas; etapas 4 e 5 continuam necessárias. A revisão/UI/lista
da seleção devem retomar filhos somente pela seleção, sem oferecer apply isolado
na lista manual, e recarregar valores atuais no callback. Não declarar valor
atual pelo efeito histórico. Demais pendências de P1 e fases/gates preservadas.
Nenhuma montagem no compêndio nem envio remoto/deploy; somente commit local.
