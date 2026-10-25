# Writer V2 — Retirada recuperável de lore

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2; commit local.
- **Plano**: [118 / M38c5t](../tasks/writer-v2/execucao/118-retirada-recuperavel-de-lore.md).
- **Decisão**: [ADR 0133](../decisions/0133-recoverable-lore-removal.md).

## Objetivo e funcionalidades implementadas

Permitir preparar, retirar explicitamente e recuperar uma retirada individual
após recarga, mantendo a intenção original e a limpeza nativa. API interna
ainda sem botão no compêndio.

Journal metadata separado guarda somente conta/livro/ficha/tentativa/token,
intenção/wire/progresso e flags. Espera commit local antes do envio, usa CAS/
Web Locks curtos e lista até 50 por conta. Não altera cópias cifradas existentes.

Preparação para em ready sem retirar. Apply é explícito; uma resposta perdida
é resolvida pelo evento original. Abrir/retomar não envia RPC, e advance não
reenvia start incerto. Recuperação já concluída exige nova confirmação servidor.
Dívida de gravação bloqueia outra unidade até ser confirmada.

Cancelamento independente fecha inspeção e consulta a retirada: conserva
retirada aceita e limpeza; ausência após fence confirma cancelamento.
Resposta RPC ou ACK local tardios não reiniciam produção. Limpeza handed-off
usa somente consulta original. Conta/host/livro e origem permanecem fixados.

## Critérios de aceite

- [x] Preparar/abrir sem retirada; apply explícito e intenção original durável.
- [x] Recarga de start incerto consulta metadata sem reenviar automaticamente.
- [x] Falhas locais antes/depois de RPC preservam recuperação e bloqueiam produtor.
- [x] Cancel independente durante inspeção/start e proteção contra respostas tardias.
- [x] Duas abas/CAS/recibos preservam clock único e origem.
- [x] Descoberta paginada privada e confirmação fria do resultado remoto.
- [x] Handoff sem cursor individual; origem alterada e conta/livro errados recusados.
- [x] Stores antigos preservados em Chromium real.
- [ ] Host de confirmação/retomada e composição final no compêndio.
- [ ] Validate integral de P1 e demais gates do produto.

## Arquivos alterados

| Grupo                                        | Mudança                                                   |
| -------------------------------------------- | --------------------------------------------------------- |
| RemovalProtocol/JournalContracts             | Identidade, wire, progresso, estado e transições fechados |
| RemovalJournalDb                             | Metadata em base própria, CAS/oncomplete/paginação        |
| RemovalOperation                             | Preparar/apply/retomar/dívida/cancel/cleanup/handoff      |
| RemovalService                               | createRemoval/resumeRemoval/recoveries com Auth/host      |
| RemovalHarness/Operation/Session tests       | 30 casos novos                                            |
| Plano/ADR/AGENTS/arquitetura/testes/execução | Contratos e evidência                                     |

## Testes e validações reais

**43 Vitest distintos positivos: 30 novos e 13 regressões.**
25 casos do executor/journal e cinco da composição Auth; retakes não somam casos.

```text
Test Files  3 passed (3)
Tests  43 passed (43)
Duration  2.69s

Chromium:
lost reply and process restart: complete; oldStoresPreserved 5; clock 1
independent cancellation with accepted reply held: complete; clock 1
two tabs CAS and explicit apply: complete; clock 1; withdrawalCalls 2

npm run build
2946 modules transformed.
Smoke test do bundle OK.
```

Casos cobrem inline/v1/v2, confirmação explícita, start aceito/não enviado,
recarga, cancel antes/durante inspeção e retirada, dívida antes/depois de RPC,
oncomplete, duas abas, origem alterada, corrupção, paginação/conta, host/actor,
handoff, cleanup perdido e resposta inválida. Revisão acrescentou dois casos
de ACK local tardio: após cancelamento, nenhuma nova RPC do produtor é enviada.

Rodada inicial encontrou expectativas de ready no primeiro start (inspeção é
por etapas) e diferença de realm do hash-wasm em jsdom; testes de serviços
nativos usam Node, sem alterar o servidor. Tipos/lint iniciais apontaram
narrowing do helper never, binding não usado e rejeições desconhecidas;
corrigidos sem reduzir regras ou limites. Conjunto final 43/43.

Três jornadas Chromium distintas passaram e foram repetidas após o ajuste
final. IndexedDB/Web Locks e reinício de perfil são reais; Functions nativas
executam sobre fixture de banco/identidade. As cinco sentinelas dos stores
antigos permaneceram intactas, com bases v3/v1 separadas. Isso não certifica
Firebase SDK/Auth/App Check em produção.

Artefatos fora do Git em writer-v2-portability-qa:
m38c5t-browser.mjs e m38c5t-browser-result.json.
Build conserva os avisos existentes de chunk/import dinâmico.

| Verificação                               | Resultado                        |
| ----------------------------------------- | -------------------------------- |
| Testes dirigidos e três jornadas Chromium | Positivo                         |
| Typecheck/build/smoke/lint                | Positivo                         |
| Formato/docs/arquitetura/styleguide/diff  | Conferidos no fechamento         |
| npm run validate/cobertura global         | Não executados; fechamento de P1 |
| CI/remoto/deploy                          | Não executados                   |

## Fora do escopo e pendências

API recuperável sem host visual ou entrada no compêndio; confirmação/listagem
visual vêm depois. Sem mudança de backend, Rules, dependências ou env.

Lifecycle/chaves, consumidores/backup/rollout, validação integral e jornadas
integradas de P1 continuam necessários. Piloto humano, leitor de tela, zoom
físico e segundo dispositivo não foram executados. P1/F2-09/V2/fases 3–5 e
gates humanos/comerciais continuam abertos. Sem push, CI, PR, merge ou deploy.

## Como verificar

Executar os três arquivos de testes citados no registro de execução. Para QA
de persistência, usar a API real no servidor local, preparar sem retirar,
confirmar apply e simular resposta perdida antes de recarregar.
Consulta original confirma o resultado; reenviar exige nova ação explícita.
Servidor da branch permanece em http://127.0.0.1:5173/.
