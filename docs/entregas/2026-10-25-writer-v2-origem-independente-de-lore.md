# Writer V2 — Origem independente por ficha de lore

- **Data**: 2026-10-25.
- **Branch**: codex/writer-v2; commit local.
- **Plano**: [121 / M38c5w](../tasks/writer-v2/execucao/121-origem-independente-por-ficha-de-lore.md).
- **Decisão**: [ADR 0136](../decisions/0136-independent-book-lore-source-tokens.md).

## Objetivo e funcionalidades

Permitir conservar a origem revisada de cada ficha ao alterar outros membros
da seleção. Leitura oferece tokenVersion 2 explícito, ligado à encarnação do
livro e à identidade nativa da ficha. Padrão v1 permanece byte a byte; origens
antigas não são recapturadas nem promovidas.

O cliente e a sessão Auth aceitam a opção. Origem esperada sempre prevalece,
sem negociação em retry. Lista mantém verificação global de começo/fim,
cursores fixam o esquema e não há teto de 50 fichas na coleção/seleção.

Inspeção, upload, inventário e reserva de recuperação reconhecem a fórmula
original exata. Autorização, clocks válidos, provas de corpo e CAS permanecem.
Nenhum consumidor atual é migrado e nenhuma UI nova é montada.

## Critérios de aceite

- [x] Padrão/formato v1 preservados; clock posterior continua invalidando v1.
- [x] V2 preserva ficha intacta e recusa troca da origem/conta/estado e ABA.
- [x] Cursor v2 não mistura esquemas; lista completa conserva checagem global.
- [x] Cliente/sessão preservam token esperado e guardas antes/depois da RPC.
- [x] 53 origens revisadas retiradas sequencialmente sem renovação/cap.
- [x] Conflito real não troca fonte nem transforma sucessos parciais em grupo.
- [x] Upload, edição/adoção, inventário e recuperação aceitam origem v2 exata.
- [ ] Coordenador durável de seleção, UI e composição final do compêndio.
- [ ] Lifecycle/consumidores/backup/rollout/validate integral e demais gates de P1/V2.

## Arquivos alterados

| Grupo                                                                  | Mudança                                             |
| ---------------------------------------------------------------------- | --------------------------------------------------- |
| Read/ReadContracts                                                     | Fórmula v2 opcional, cursor e correspondência exata |
| SourceInspectionStore/FieldUploadStore/ResourceInventory/WriteRecovery | Validar origem v1/v2 sem migração                   |
| ReadClient/ReadService                                                 | Opção no transporte e sessão Auth                   |
| Fixtures/tests Node/cliente/SDK                                        | Novos casos e regressões dos consumidores diretos   |
| Plano/ADR/AGENTS/arquitetura/testes/execução                           | Contratos e evidência                               |

## Testes e resultados reais

**601 casos distintos positivos em rodadas: 38 novos, 563 existentes.**
490 Node, 108 Vitest distintos e três SDK. Reexecuções não somam casos.

```text
Node integrado, 14 arquivos dos consumidores afetados:
tests 490
pass 490
fail 0
duration_ms 106279.642

Cliente real e regressões, cinco arquivos:
Test Files  5 passed (5)
Tests  105 passed (105)
Duration  6.00s

Retake Auth com três casos novos:
Test Files  1 passed (1)
Tests  11 passed (11)
Duration  18.19s

SDK real/Admin no emulador Firestore 1.22.0:
tests 3
pass 3
fail 0
duration_ms 7130.9775

Functions syntax checked: 254 modules
```

23 novos Node cobrem inline/payload v1/v2, fonte alterada, ABA, autorização,
clock inválido, cursor, seleção 53, conflito parcial e preparação/adoção/chave.
Nove novos Vitest exercitam o cliente real com servidor nativo, strings literais,
coleção/seleção acima de 50, trocas durante montagem e ausência de rebase.
Três novos Auth conferem opção, origem fixada e resposta de conta substituída.
Node/Vitest usam banco em memória; a sessão usa SDK/Auth simulados.
Três SDK conferem retiradas sequenciais e lista stale, nascimentos reais
distintos, autorização, Rules privadas e prova de corpo recriado.

Rodada inicial dos novos Node teve 22/23: a fixture da geração v2 sobrepõe
isPublic false, enquanto o teste esperava true da base antiga. A expectativa
foi alinhada à privacidade lógica vigente; as 23 passaram e entraram na rodada
integrada. Lint apontou let em array nunca reatribuído; corrigido para const.
Não houve redução de cobertura, Rules ou regras de autorização.

## Validações e limites

| Verificação                       | Resultado                        |
| --------------------------------- | -------------------------------- |
| Node/Vitest/SDK direcionados      | Positivo em rodadas              |
| Lint alterado/Functions syntax    | Positivo                         |
| Typecheck/build/smoke             | Positivo; bundle 2954 módulos    |
| Docs/arquitetura/formato/diff     | Conferidos no fechamento         |
| npm run validate/cobertura global | Não executados; fechamento de P1 |
| UI/browser/piloto humano          | Não executados; UI sem alteração |
| CI/remoto/deploy                  | Não executados                   |

Build emite avisos de tamanho de chunks/imports dinâmicos já coexistentes;
smoke positivo. Logs externos em writer-v2-portability-qa: m38c5w-node-initial,
node, node-regressions, vitest, auth, sdk e build (.log). Primeiro log com
falha é conservado. SDK direto em emulador não comprova Functions HTTP,
Auth/App Check, índices/latência/limites de produção ou uma compra real.

## Continuidade e verificação manual

Capturar novas seleções por v2 explicitamente no futuro coordenador. Fixar
cada origem e seus controles duráveis; apresentar progresso/conflitos próprios
sem alegar transação conjunta. Operação atômica de grupo ainda exige suas
provas nativas. Tokens não substituem grant nem autorizam corpos ausentes.

Compêndio, transporte/recuperação/UI de seleção, lifecycle na exclusão,
demais consumidores/backup/rollout/validate integral de P1 e fases 3–5/gates
humanos/comerciais continuam abertos. A opção não foi ativada em produção.
Master original e servidor local preservados; somente commit local.
