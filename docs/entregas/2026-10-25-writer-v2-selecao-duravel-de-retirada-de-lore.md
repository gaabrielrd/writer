# Writer V2 — Seleção durável para retirada de lore

- **Data**: 2026-10-25.
- **Branch**: codex/writer-v2; commit local.
- **Plano**: [122 / M38c5x](../tasks/writer-v2/execucao/122-selecao-duravel-para-retirada-de-lore.md).
- **Decisão**: [ADR 0137](../decisions/0137-durable-book-lore-removal-selection.md).

## Objetivo e funcionalidades

Preservar seleção completa, origens aprovadas e progresso por ficha durante
retirada recuperável. Coordenador interno compõe os executores existentes;
não altera a semântica de grupo nem limita seleção à página de 50.

Manifesto metadata fica durável antes das RPCs, em banco próprio. Resultado,
cursores e contadores são atômicos. Advance não retira; apply não reenvia um
pedido incerto. Retry explícito conserva o wire. Cancel independente fecha
todos os IDs originais e preserva retiradas aceitas.

Recuperação confere recibos/fences nativos antes de anunciar conclusão.
Perda do journal filho não faz aceite virar “cancelado sem efeito”: consulta
metadata original sem novo produtor. Coleta de bytes continua pelo protocolo
próprio; o pai não certifica cleanup nem reconstrói journal perdido.

## Critérios de aceite

- [x] Manifesto de 53 membros em páginas de 50/3, sem prosa ou teto de seleção.
- [x] oncomplete/abort, CAS, resultados imutáveis e contadores idempotentes.
- [x] Preparar/verificar distintos de apply/retry explícitos.
- [x] Resposta perdida aceita/não aceita sem reenvio automático.
- [x] Conflito antes/no apply conferido e encerrado antes de avançar.
- [x] Cancel independente, filhos não iniciados e aceites preservados.
- [x] Dívida local e ACK tardio não produzem próxima unidade.
- [x] Retomada exige prova fresca, inclusive após perder journal filho.
- [x] Auth/host/conta/livro e descoberta paginada protegidos.
- [ ] Interface da seleção/retomada e visibilidade nativa.
- [ ] Compêndio, lifecycle/consumidores/backup/rollout/validate e demais gates.

## Arquivos alterados

| Arquivo/grupo                                | Mudança                                          |
| -------------------------------------------- | ------------------------------------------------ |
| RemovalSelectionContracts                    | Manifesto/páginas/IDs/estado/outcomes fechados   |
| RemovalSelectionDb                           | IndexedDB próprio, atomicidade, CAS e descoberta |
| RemovalSelectionOperation                    | Executor composto, incerteza/cancel/dívida/prova |
| RemovalSelectionService/index                | Sessão Auth e exports públicos                   |
| Harness e dois arquivos de testes            | 31 novos casos                                   |
| Plano/ADR/AGENTS/arquitetura/testes/execução | Contratos, evidência e continuidade              |

## Testes reais

**70 Vitest positivos: 31 novos e 39 regressões.**

```text
Test Files  5 passed (5)
Tests  70 passed (70)
Duration  2.36s

Smoke test do bundle OK.
2958 modules transformed.
```

26 casos de contratos/banco/executor: seleção e descoberta com 53, abort,
oncomplete, metadata alterada/forjada, órfãos, v1/v2/inline, origem alterada,
replay, progresso parcial, dívida antes/depois do efeito, duas abas, cancel/
produtor retido e perda de journal filho. Cinco casos de sessão Auth cobrem
UID forçado, conta/livro/host/perfil e armazenamento indisponível.
39 regressões do executor/sessão singular e leitura cliente com tokens v2.

Vitest usa harness de eventos IndexedDB e backend de produção com banco em
memória; o harness filho é um repositório em memória. A sessão simula SDK/Auth.
Não são SDK/credenciais de produção.

### Chromium com persistência real

Quatro jornadas positivas com os módulos de produção, IndexedDB/Web Locks
reais, duas bases novas e reinício de processo:

1. 53 origens, páginas 50/3, retiradas e 53 consultas metadata após reinício,
   sem novo produtor.
2. Resposta aceita perdida, reinício e confirmação original sem replay.
3. Outra aba cancela produtor aceito retido e fecha membros não iniciados;
   retorno tardio não envia outro start.
4. Journal filho alvo removido: cancel preserva aceite e nova retomada confere
   o mesmo evento nativo, sem nova retirada.

Cinco stores cifrados anteriores e uma retirada alheia permaneceram intactos.
São sentinelas sintéticas; não certificam recuperação de arquivos reais.
Port de SDK/Auth e banco remoto são fixtures; UI do produto não foi montada.

A jornada extra inicialmente apagava o banco filho inteiro enquanto exigia
a sentinela alheia; o harness foi corrigido para remover só o journal alvo,
sem repor sentinelas na retomada. Retake passou, sem ajuste de produto por
essa falha. Primeiro teste de escopo passou campos extras à identidade
fechada e foi corrigido. Lint/tipos iniciais apontaram casts, rejeições Error,
estreitamento never e variáveis sem uso; corrigidos, sem suprimir regras.

## Validações

| Verificação                          | Resultado                            |
| ------------------------------------ | ------------------------------------ |
| Vitest afetado                       | 70/70                                |
| Chromium/IDB/reinício                | Quatro jornadas                      |
| Lint alterado, typecheck/build/smoke | Positivo                             |
| Docs/arquitetura/formato/diff        | Conferidos no fechamento             |
| Node/Functions/Rules/SDK real        | Não repetidos; backend sem alteração |
| npm run validate/cobertura global    | Não executados; fechamento de P1     |
| UI, piloto humano, CI/remoto/deploy  | Não executados                       |

Build mantém avisos de chunks grandes e imports dinâmicos coexistentes;
smoke positivo. Artefatos externos em writer-v2-portability-qa:
m38c5x-integration.log, m38c5x-build-final.log, m38c5x-browser-final.log,
m38c5x-browser.mjs e m38c5x-browser-result.json. Logs iniciais preservados.

## Continuidade e verificação manual

API interna bookLoreRemovalSelectionSession oferece criar, retomar e listar;
o host deve apresentar membros/efeitos, usar origens v2 capturadas e chamar
apply explicitamente. Abrir/verificar não retira. Cleanup permanece separado.

Interface de retirada da seleção, visibilidade nativa e composição final
do compêndio seguem pendentes; não excluir ações existentes para ativação.
Lifecycle/consumidores/backup/rollout/validate de P1 e fases 3–5/gates humanos
e comerciais continuam abertos. Master e servidor local preservados.
Somente commit local; sem push, CI, PR, merge ou deploy.
