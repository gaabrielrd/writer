# Writer V2 — Clock da estrutura legada (P1 M3a)

- **Data:** 2026-10-21
- **Branch:** codex/writer-v2
- **Plano:** [contrato 35](../tasks/writer-v2/execucao/35-clock-da-estrutura-legada.md).
- **Estado:** marco interno validado por SDK real; CI do novo head pendente.
  P1 e F2-09 permanecem abertos.

## Objetivo e comportamento

Impedir que capítulos surjam/desapareçam ou atos sejam criados via SDK sem
invalidar a raiz usada como fonte de captura. As Rules agora exigem avanço válido
e atômico de updatedAt no mesmo livro para essas operações de estrutura ativa.
Não altera prosa, metadados ou autoria por conta própria: uma operação incompleta
é recusada. Os escritores atuais da aplicação já usam essa atomicidade.

Livro legado sem updatedAt válido pode receber a data da mutação; createdAt
válido é preservado e o ausente continua ausente. Limpeza de capítulos com livro
já deleting continua autorizada pelo contrato anterior, e criação nesse estado
continua bloqueada. Regras de dono, progress resources, vínculos e personas mantidas.

## Critérios de aceite deste marco

- [x] Quatro casos indevidos reproduzidos antes do fix com SDK real.
- [x] Operações isoladas, data igual/retrocesso, raiz errada e avanço anterior recusados.
- [x] Criação/remoção atômica aceita e token nativo muda com palavra/histórico iguais.
- [x] Atos exigem raiz; lote de 200 capítulos e limpeza deleting continuam válidos.
- [x] Legado sem data válida não exige inventar createdAt.
- [x] Isolamento por conta e privacidade preservados.
- [x] Casos relacionados têm resultados positivos após ajustes das duas operações antigas.
- [x] Sintaxe, lint, formato, links, escopo e diff verificados.
- [ ] CI do novo head verde (acompanhada sem bloquear o próximo incremento).
- [ ] Snapshot/arquivo/restauração P1 completos (fora deste marco interno).

## Arquivos alterados

| Grupo                                              | Mudança                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------- |
| firestore.rules                                    | Helper e três gates de pertencimento com get/getAfter.              |
| tests/firestore/bookStructureBackup.rules.test.mjs | Dez casos SDK/Native, incluindo lote 200 e limite do token de raiz. |
| tests/firestore/personas.rules.test.mjs            | Criação positiva passa a escrever capítulo/raiz no mesmo batch.     |
| tests/firestore/publication.rules.test.mjs         | Mesmo ajuste no capítulo legado privado de livro publicado.         |
| ADR 0046, arquitetura, testes, P1/M3a e execução   | Contrato, provas e pendências.                                      |
| AGENTS.md                                          | Regra curta para escritores SDK da estrutura.                       |
| Evidência da manutenção CI anterior                | Registra CI/regras verdes de 96ff5e0 separadamente deste gate.      |

## Testes e resultados reais

```text
Antes do fix, arquivo novo: tests 10; pass 6; fail 4; duration_ms 4237.2136
Depois do fix, arquivo novo: tests 10; pass 10; fail 0; duration_ms 4625.3574
Sete famílias relacionadas: tests 61; pass 59; fail 2; duration_ms 91526.0777
Após ajustar só os arquivos alterados: tests 26; pass 26; fail 0; duration_ms 11326.553
```

A última execução inclui os dez novos casos (com vetor adicional de raiz sem
createdAt), três casos de personas e treze de publicação. Os outros 45 casos
das cinco famílias inalteradas já tinham passado com as mesmas Rules. Portanto
71 cenários distintos têm resultado positivo composto; não houve uma execução
única nova de 71/71. Sem skip/cancelamento/todo nas execuções SDK. A primeira
execução vermelha demonstra a lacuna; a regressão intermediária de duas operações
antigas e os ajustes não foram ocultados.

Os dois positivos antigos criavam capítulo isoladamente. Foram convertidos para
batch com a raiz e data avançada, sem remover expectativas de conteúdo,
privacidade, persona inválida, vínculo ou autoria. As Rules não foram relaxadas.

SDK Web + Admin local + createWorkHistoryService reais, no emulador Firestore
1.22.0 com SHA-256 conferido. A criação vazia mantém wordCount/historyRevision,
mas muda updateTime nativo e invalida uma listagem M1 com token antigo.
Metadata direta de capítulo muda seu próprio timestamp e mantém o token da raiz:
esse teste prova também o limite do marco, sem fingir snapshot integral.

O lote de criação e remoção usa 200 capítulos e uma atualização de raiz por batch.
Isso verifica o orçamento de acessos no SDK/emulador, com vínculo a ato existente.
Não foi feita chamada ao Firestore de produção ou provedor pago.

## Validação e revisão

Node syntax check e ESLint dos três arquivos de teste passaram. Formato, links
e diff foram conferidos. Não houve novo npm run validate local para esse gate
dirigido de Rules: a validação completa anterior de produto passou no M2, e a
CI de 96ff5e0 confirmou validate Node 22/24, auditoria, produção, 16 shards,
agregador e Rules verdes antes deste novo comportamento de estrutura.

Nenhum arquivo src/functions, lockfile ou dependência mudou. O snapshot anterior
do produto permanece byte a byte igual; as Rules alteradas têm prova própria.
Não repetimos UI fictícia ou suíte frontend para provar um gate que só o SDK real
exerce. A suíte completa permanece no fechamento do grande bloco P1, conforme
a preferência do operador. Novo head ainda exige acompanhamento de seus checks.

Revisão: avanço pertence ao mesmo livro/operação, cleanup já deleting preservado,
sem ampliação de permissões ou redução de limites. Nenhum segredo ou artefato
grande adicionado. Rollout requer coordenar writers/Rules e drenar clientes antigos.

Logs privados em writer-v2-portability-qa: m3-sdk-before.log, m3-sdk-fixed.log,
m3-sdk-regressions.log, m3-sdk-adjusted.log, respectivos logs do emulador,
run-book-structure-sdk.mjs e m3-structure-freeze.json.

## Limites e continuidade

O gate cobre pertencimento SDK, não todos os dados do livro. Metadados ainda
exigem readset nativo; Admin, personas, controle de progresso e mídia precisam
da captura própria. JSON v1–v6 continua inalterado; pacote novo, preparação,
revisão, remapeamento, restauração e roundtrip continuam pendentes.

Sem deploy, merge ou modificação de master. Não contar M3a como tarefa ampla
nova: o objetivo continua sendo P1 completo e o restante do Writer V2, com
pilotos humanos e habilitação comercial preservados como pendências.

## Como verificar

Com emulador demo em FIRESTORE_EMULATOR_HOST, executar o arquivo SDK novo.
Criar/remover capítulo de livro ativo sem raiz deve falhar; batch com data
avançada deve passar e trocar o token preciso, mesmo sem palavras novas.
Repetir a data ou avançar outro livro não serve. O projeto deleting continua
limpável. A suíte central npm run test:rules descobre o arquivo automaticamente.
