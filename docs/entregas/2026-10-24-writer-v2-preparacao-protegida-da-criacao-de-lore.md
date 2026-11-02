# Writer V2 — Preparação e cópia protegida da criação de lore

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2; somente commit local.
- **Plano**: [113 / M38c5o](../tasks/writer-v2/execucao/113-preparacao-e-copia-protegida-da-criacao-de-lore.md).
- **Decisão**: [ADR 0128](../decisions/0128-protected-lore-creation-preparation.md).

## Objetivo e funcionalidades entregues

Preparação de uma ficha nova fica descobrível antes da primeira chamada, mesmo
se a reserva não responder. Uma cópia inicial cifrada conserva os literais do
rascunho no dispositivo e pode ser reaberta pela mesma conta após nova autorização.
Sessão oferece creationPreparation/resumeCreationPreparation/creationPreparations.

Cancelamento conserva rascunho e chave; release explícito fecha o criador antes
de revogar. Descarte confirmado remove partes em lotes limitados e deixa fence
permanente. Falhas de rede, cifra ou armazenamento preservam dados e intenção.
Retomar em outra instância impede que a anterior leia/escreva; ausência de cópia
completa exige texto original e não produz rascunho vazio.

Banco v3 acrescenta stores da criação e mantém registros v1/v2 da edição.
Provider HTTP de chave é compartilhado, mantendo Auth/App Check e CryptoKey
não extraível; não há chave, prosa ou digest em claro nos tickets.

**Fronteira**: este bootstrap não oferece advance/apply e não está na navegação
normal. O checkpoint do coordenador do plano 112 ainda precisa de write-ahead
durável integrado; a cópia inicial não conclui produção/CRUD ou P1.

## Critérios de aceite

- [x] Ticket fechado/paginado antes de start/reserve/cancel/cleanup/revoke.
- [x] Cópia imutável de 64 KiB com digest cifrado, prefixo conferido e oncomplete.
- [x] Leitura com identidade/intenção/SHA/UTF-8 e grants frescos nas duas pontas.
- [x] Retomada após resposta perdida sem outra intenção ou texto inventado.
- [x] Cancel independente de RPC/chave/AES pendentes; cancel conserva cópia.
- [x] Release e purga próprios, atômicos e limitados, com ausência reconferida.
- [x] Migração v2→v3 preserva cópias e preparação v2; downgrade recusado.
- [x] Auth/actor/host capturados e compatibilidade da recuperação de edição.
- [ ] Coordenador de produção persistido, host e entrada no compêndio.
- [ ] Exclusão/lifecycle, demais consumidores/backup/rollout e validate de P1.

## Arquivos alterados

| Grupo                                                  | Mudança                                           |
| ------------------------------------------------------ | ------------------------------------------------- |
| bookLoreCreationTicketContracts/TicketDb/Ticket        | Schema, descoberta, CAS, posse e purge            |
| bookLoreCreationDraft/CreationPreparation              | Cópia cifrada e bootstrap metadata                |
| bookLoreRecoveryKeyClient/JournalSession               | Provider HTTP compartilhado sem mudar contrato    |
| bookLoreCreationPlan/EditService/services index        | IDs puros e composição Auth                       |
| bookLoreJournalDb                                      | Migração aditiva v3 e acesso transacional interno |
| CreationPreparation/CreationSession tests e harness    | 38 testes novos e fixtures nativas                |
| Plano 113, ADR, arquitetura, testes, AGENTS e execução | Regras, resultados e próximos portões             |

## Testes e validações executadas

**221 Vitest distintos positivos em dez arquivos, com 38 testes novos**
(31 de preparação e sete de sessão). Retakes não somam casos.

Saída da regressão final:

```text
Test Files  10 passed (10)
Tests  221 passed (221)
Duration  15.51s
```

Abrange criação, sessão autenticada, manualOperation/manualSession e journal,
crypto/checkpoint de edição. Casos novos incluem respostas perdidas, troca de
conta/host, falhas de commit, prefixo corrompido, takeover, autorização nas
duas pontas, cancel com RPC/chave/AES em voo, CAS de cleanup concorrente e
adoção conflitante. Campo >8 MiB passa por mais de 128 partes; purge respeita
50 partes por chamada e recusa órfãos/geração desconhecida.

Um teste de sessão revelou ausência do guard do host no port de edição do
ambiente manual. Wrapper corrigido antes/depois da chamada; sete casos da
sessão e regressão final passaram. Typecheck inicial encontrou imports sem uso
e narrowing de chave IDB; lint encontrou atribuições inúteis. Corrigidos antes
dos resultados finais. O teste de adoção foi alinhado ao failed-precondition
nativo seguido de get; não se trata cancel recusado como prova de fechamento.

**Quatro jornadas Chromium positivas**, com IndexedDB/WebCrypto/Web Locks reais:

1. Banco v2 com edição cifrada e preparação confirmada passa a v3 após encerrar
   o processo, preservando os registros/frames anteriores; downgrade v2 dá VersionError.
2. Cópia de criação >9 MiB, 146 frames, reabre após novo processo com quatro
   grants frescos entre initialize e readDraft.
3. Cancel conserva texto/chave; release precede purge em lotes até 50.
   Novo reinício retoma a limpeza, totaliza 146 deletes e preserva frames de edição.
4. Reserva de chave aceita com resposta perdida é descoberta e repetida
   exatamente após reinício; anuncia awaiting-draft e permite descarte metadata.

Script/perfis/JSON ficam fora do Git, no diretório local writer-v2-portability-qa
do workspace de visualizações; m38c5o-browser-creation.mjs e
m38c5o-browser-result.json. O adaptador v2 do teste foi ajustado à formatação e
às URLs transformadas do Vite antes das duas rodadas completas positivas.

| Validação                           | Resultado                                            |
| ----------------------------------- | ---------------------------------------------------- |
| Vitest dirigido (dez arquivos)      | 221/221                                              |
| Chromium de armazenamento           | 4/4                                                  |
| npm run build                       | Typecheck, bundle de 2.938 módulos e smoke positivos |
| Lint dirigido e arquitetura         | Positivos                                            |
| Formatação, docs e git diff --check | Conferidos no fechamento                             |
| npm run validate/coverage integral  | Não executado; fechamento de P1                      |
| Backend/Rules/SDK reais/CI          | Não executados neste incremento                      |

Build conserva avisos existentes de chunks grandes/imports dinâmicos.
Serviços Functions reais rodam sobre doubles de banco/identidade nos testes;
browser comprova armazenamento, sem certificar Auth/App Check/SDK ou UI reais.
Backend e Rules não foram alterados; nenhuma dependência foi adicionada.

## Como verificar e próximos passos

Executar os arquivos CreationPreparation/CreationSession em Vitest e as
regressões indicadas em docs/testing.md. A preparação está na API de serviços;
não há fluxo visual novo para criação. O dev server permanece em
http://127.0.0.1:5173/, servindo o worktree Writer V2.

Próximo: checkpoint privado write-ahead, controles e resultado integrados ao
coordenador da criação antes de advance/apply duráveis; depois host e exclusão.
Lifecycle das chaves, consumidores/backup/ativação/rollout, P1/F2-09/Writer V2,
fases 3–5 e gates humanos/comerciais continuam abertos. Validate integral no
fechamento de P1; sem CI/push/PR/merge/deploy.
