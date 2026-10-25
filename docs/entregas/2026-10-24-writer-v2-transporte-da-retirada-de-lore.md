# Writer V2 — Transporte autenticado da retirada de lore

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2; commit local.
- **Plano**: [117 / M38c5s](../tasks/writer-v2/execucao/117-transporte-autenticado-da-retirada-de-lore.md).
- **Decisão**: [ADR 0132](../decisions/0132-authenticated-lore-removal-transport.md).

## Objetivo e funcionalidades implementadas

Preparar o caminho autenticado da retirada individual sem montar o botão no
compêndio. Endpoint dedicado encaminha sete métodos nativos com namespaces
próprios para inspeção/retirada. Preserva 18/22 métodos anteriores do journal
de edição e transporte manual.

Inspeção conserva a ficha. Retirada explícita usa CAS, clock/privacidade,
tombstone permanente e limpeza limitada nativos. GET/replay confirmam evento
original sem repetir efeitos; origem editada após a inspeção é preservada.
Sessão interna congela wire e captura Auth/host; metadata não baixa prosa.
Falha sobe sem retry automático, fallback ou seleção de outra ficha.

## Critérios de aceite

- [x] Auth/envelope/namespace fechados antes do acesso ao banco.
- [x] Headers/dispatch/export no wrapper regional com App Check exigido.
- [x] Namespace próprio sem cancelamento de controles de edição/análise/criação.
- [x] Inspeção sem retirada, replay único, origem alterada bloqueada e cleanup.
- [x] Sessão confere actor/host, congela wire e lê metadata sem conteúdo.
- [x] Testes dirigidos, tipos/build/smoke/lint positivos.
- [ ] Executor/journal durável, confirmação visual e entrada no compêndio.
- [ ] Validate integral de P1 e demais gates de rollout.

## Arquivos alterados

| Grupo                                        | Mudança                             |
| -------------------------------------------- | ----------------------------------- |
| RemovalTransport/Methods e declaração        | Entrada fechada browser-safe        |
| functions index                              | Headers, dispatch e export regional |
| ReadClient/RemovalService                    | Metadata e porta Auth sem retry     |
| RemovalTransport/RemovalService tests        | 25 casos novos                      |
| bookLoreRemoval.rules.test                   | Dois novos casos SDK em emulador    |
| Plano/ADR/AGENTS/arquitetura/testes/execução | Contrato e evidência                |

## Testes e validações reais

**168 casos distintos positivos: 27 novos e 141 regressões.**
Retakes não somam casos.

```text
Node: RemovalTransport + EditTransport + Removal
tests 62
pass 62
fail 0
duration_ms 3214.4579

Vitest: RemovalService + ReadClient + ReadService + EditService
Test Files  4 passed (4)
Tests  104 passed (104)
Duration  5.21s

Retake dos mocks tipados da sessão:
Test Files  1 passed (1)
Tests  13 passed (13)
Duration  1.74s

SDK direcionado no emulador Firestore 1.22.0:
tests 2
pass 2
fail 0
duration_ms 13070.8857

npm run build
2946 modules transformed.
Smoke test do bundle OK.
```

Native tests exercitam inline/v1/v2, Auth/envelope/namespace, inspeção sem
efeito destrutivo, concorrência/replay, cleanup, privacidade, clocks, recriações,
handoff e origem alterada. Sessão cobre congelamento, metadata inválida,
perfil/actor/host e erro sem retry/fallback. SDK confirma timestamps e Rules
com Admin/cliente Firestore reais no emulador; PERMISSION_DENIED esperado nos
acessos proibidos. Não comprova rede Functions/Auth/App Check em produção.

Typecheck/lint iniciais detectaram declaração ausente e tipos dos mocks;
corrigidos sem reduzir regras/limites. Tipos/lint finais positivos.
Build conserva avisos existentes de chunk/import dinâmico.

| Verificação                       | Resultado                        |
| --------------------------------- | -------------------------------- |
| Node/Vitest e SDK direcionados    | Positivo                         |
| Typecheck/build/smoke/lint        | Positivo                         |
| Arquitetura/docs/formato/diff     | Conferidos no fechamento         |
| npm run validate/cobertura global | Não executados; fechamento de P1 |
| CI/remoto/deploy                  | Não executados                   |

## Fora do escopo e pendências

Não há mudança visual nem entrada de retirada no compêndio. Porta Auth não é
recuperação durável: journal metadata, wire antes de enviar, descoberta após
reload e executor precedem confirmação visual.

Não exercitados SDK Functions/Auth/App Check em produção, implantação de
índices, piloto humano, leitor de tela, zoom físico ou segundo dispositivo.
Rules existentes foram conferidas sem alteração. Lifecycle, consumidores/
backup/rollout/validate integral seguem necessários. P1/F2-09/V2/fases 3–5 e
gates humanos/comerciais abertos. Master original e dev server preservados.
Sem push, CI, PR, merge ou deploy.

## Como verificar

Executar os arquivos de teste citados; SDK exige emulador dedicado loopback e
FIRESTORE_EMULATOR_HOST. Não apontar os testes para projeto real.
Servidor da branch em http://127.0.0.1:5173/.
