# Writer V2 — Sessões privadas da campanha (F2-08 S1)

- **Data:** 2026-10-18
- **Branch:** `codex/writer-v2`, checkout isolado
- **Plano de origem:** [S1](../tasks/writer-v2/execucao/21-sessoes-privadas-da-campanha.md)
- **Estado:** implementado e validado localmente; CI do novo head pendente no [PR 21 em rascunho](https://github.com/gaabrielrd/writer/pull/21).
- **Decisão:** [ADR 0037](../decisions/0037-private-campaign-sessions.md).

## Objetivo

Permitir ao mestre preparar e ordenar encontros particulares, conservando o texto
próprio quando uma resposta se perde, outra edição ocorre ou a base da aventura
é atualizada. Este é o primeiro recorte de F2-08; referências, pistas e missões
ainda não estão entregues.

## Funcionalidades entregues

- Criar, consultar, editar e excluir sessões com título, preparação em texto
  simples, data civil opcional e estado privado Planejada/Em andamento/Concluída.
  Criação começa Planejada; nenhuma mudança publica ou conduz a sessão.
- Mover acima/abaixo com comparação da lista observada, preservando os dois textos
  e recusando edição antiga do vizinho. Data e estado não mudam a ordem.
- Consultar páginas de metadados sem carregar a preparação de todas as sessões.
  Texto próprio continua disponível após a origem da aventura ser revogada.
- Preservar pedido incerto no dispositivo e repetir exatamente o mesmo pedido
  por ação explícita. Um recibo histórico pode confirmar sem adotar texto posterior.
- Fechar/reabrir preparação sem perder o rascunho; descartar texto ainda não enviado
  exige ação própria, indisponível quando existe pedido incerto. Atualizar a base
  da campanha conserva o painel autoral e seu rascunho durante a consulta.
- Excluir campanha revoga leitores/escritores de sessões e permite encerrar apenas
  o journal mostrado. C4 v2 limpa sessões/controle e sanitiza recibos; v1 continua
  retomável com seu inventário original. Biblioteca e outras mesas permanecem.

Data sem horário é uma **suposição inicial**, ainda sem resposta à pergunta de
preferência. O contrato a declara; não registrar como escolha humana aprovada.

## Critérios de aceite de S1

- [x] CRUD, data/estado e ordem preservam preparação e outra campanha.
- [x] Origem revogada não impede acesso ao texto próprio da sessão.
- [x] CAS, controle perdido, cursores, overflow e tombstones não produzem escrita parcial.
- [x] Pedido sem resposta e replay histórico não duplicam edição nem adotam outro corpo.
- [x] Rascunho sobrevive ao refresh de adoção; respostas tardias não reabrem outro formulário.
- [x] C4 bloqueia antes do corpo/recibo, limpa recursos novos e preserva jobs v1.
- [x] SDK direto do dono, outro UID e anônimo não acessa sessões/controle/recibos.
- [x] Teclado, cancelamento/foco, três temas, celular e largura de 320 px validados.
- [ ] CI do próprio novo head; conclusão técnica depende desse resultado.

Os critérios completos de F2-08 permanecem abertos: cena/NPC/pista/missão e seus
vínculos autorizados pertencem aos recortes S2/S3.

## Arquivos alterados

| Área                                                | Mudança                                                                                      |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/features/campaign-sessions`                    | Modelos, callables, validação, journal, controlador e painel privados; testes colocalizados. |
| `src/features/campaigns`                            | Slot autoral estável, pendências agregadas, closer público composto e regressões.            |
| `functions/src/campaignSessions*.mjs`               | Cinco APIs, autorização, CAS, ordenação, paginação e recibos históricos.                     |
| `functions/src/campaignDeletion*.mjs`               | Inventários internos v1/v2, sanitização de recibos e limpeza dos novos documentos.           |
| `functions/src/index.mjs`, `functions/package.json` | Composição dos callables e verificação de sintaxe dos módulos.                               |
| `firestore.rules`, `firestore.indexes.json`         | SDK fechado, índices de ordem nos dois sentidos e preparação fora do índice.                 |
| `scripts/check-architecture*`                       | Folha auth/shared e composição de sessões somente por campaigns.                             |
| `tests/firestore`, `functions/test`, `e2e/visual`   | Contratos reais e jornadas com transporte simulado; fixture isolada do build de produção.    |
| `docs/`, `README.md`, `AGENTS.md`                   | Contrato, ADR, estado real, fronteiras e evidência.                                          |

## Testes e validações executadas

`npm run validate` terminou com **exit 0**, uma execução completa de fechamento.

```text
Test Files  180 passed (180)
Tests       1860 passed (1860)
Duration    140.46s
All files   90.53 statements | 84.74 branches | 90.19 functions | 93.08 lines
scripts     82 pass, 0 fail, 0 skipped — 9125.9549 ms
Functions   369 pass, 0 fail, 0 skipped — 2520.1265 ms
built in    1.30s
Smoke test do bundle OK.
WRITER_SESSIONS_VALIDATE_EXIT=0
```

Cobertura: 16.064/17.744 instruções; 13.814/16.300 ramos; 4.185/4.640 funções;
14.705/15.798 linhas. Tipos, lint, sintaxe, arquitetura, documentação, estilo e
formato passaram. Limites e exclusões não foram alterados. Nenhuma dependência nova.
`npm ci --prefix functions` terminou com zero vulnerabilidades; aviso de engine
Node 22 versus Node 24.21.0 local e avisos preexistentes de glob/node-domexception.
Build conserva avisos de chunk grande e importação mista DOCX.

| Evidência dirigida         | Resultado e limite                                                                                                                                                                                                                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domínio S1 + regressão C4  | 22 casos únicos exercitados; o primeiro lote teve 19/22 por contagem incorreta de campos do recibo. Corrigida de sete para seis; repetidos quatro afetados. O validate final passou todos os 369 testes de Functions.                                                                                            |
| Cliente/host C4            | 46/46 dirigidos (26 de sessões e 20 de host), 10,97 s; validação de contrato/transporte mais 18/18, 1,80 s. Mocks do transporte somente SDK/app.                                                                                                                                                                 |
| Integração de adoção       | Negativo com leaf real reproduziu perda do draft antes da correção. Painel estável por UID/campanha preserva texto e pendência; pulso C4 ainda oculta. Asserção inicial de identidade de nó DOM foi substituída pelo valor observável após reabrir o diálogo; teste corrigido passou e entrou no validate final. |
| SDK Firestore/regras reais | Cinco famílias únicas comprovadas. Primeira execução: 3 passes/2 falhas de IDs curtos no teste, zero skips, 18.185,7756 ms. Corrigido somente o prefixo dos IDs; repetidas duas afetadas: 2/2, 18.483,0185 ms.                                                                                                   |
| SDK — controle perdido     | Mesma família fortalecida com somente tombstones antes de remover o controle: 1/1, zero falhas/skips, 3.731,5092 ms. Não houve novo lote completo de cinco.                                                                                                                                                      |
| Navegador Chromium         | 12/12 combinações únicas, zero falhas/retries/skips/flaky; lotes de 12.082,295 + 44.049,635 = 56.131,930 ms.                                                                                                                                                                                                     |

As famílias SDK exercitam autorização, token preciso, ordem/revisão do vizinho,
histórico sem corpo posterior, tombstone, cursor, calendário, controle e recibo
corrompidos, captura real com origem apagada e limpeza de 27 sessões/recibos por
C4 v2; job antigo sem versão permanece retomável. Assets de Storage são injetados.
O harness final desativa detecção de metadata e restaura o ambiente no teardown.
Emuladores foram encerrados, inclusive filhos Java identificados por comando/porta.

Navegador usa Web Locks e storage reais, com transporte simulado. Nos 12 percursos,
console.error, pageerrors e requisições externas ficaram em zero. Foram produzidas
18 capturas; a raiz inspecionou seis formulários/listas em 320 px nos três temas,
legíveis e sem corte horizontal. Formulários 320×740; listas fullpage 320×2537.
A segunda jornada cobre os tamanhos padrão desktop/celular. Escape retorna a Nova
sessão; mover por teclado foca Consultar sessões e Enter consulta a ordem sem
perder esse foco; cancelar exclusão retorna à ação da linha.

SDK fortalecido e documentação receberam verificações dirigidas de lint/formato
após o snapshot da validação completa; nenhum código do produto mudou depois dela.
Não repetir a matriz nativa para mudanças apenas em testes/documentos.

## Revisão e limitações

Revisão independente de backend/cliente e da integração encerrou sem bloqueadores.
Foram corrigidos perda de rascunho na adoção, GET atrasado sobre formulário novo,
falso conflito por espaços no título, ausência de descarte de draft não enviado,
invalidação após erro C4 próprio e descarte indevido de pedido por erro temporário.
Erros sem prova preservam journal; confirmação C4 exige identidade própria e ação
explícita para encerrá-lo. Controle inválido/futuro ou trocado por outra aba fica intacto.

CI de S1 ainda pendente. A CI verde de `0006a66` encerra C4/F2-07 e não valida
este novo incremento. A revisão dos 48 arquivos alterados não encontrou novos
arquivos .env, marcadores de segredo ou artefatos acima de 5 MiB. O checkout
original `master 522ccaa` foi conferido limpo e preservado; CLAUDE.md permanece
coerente. Após o validate, os documentos/AGENTS tiveram formato, links e diff
conferidos, sem novo ajuste ao produto.

Habilitação exige implantar guardas, cinco APIs, regras,
índices e início/avanço C4 conjuntamente, drenando versões antigas antes da UI.
Versionar apenas advance não protege de um start C4 v1 ainda ativo. Manutenção
Admin deve respeitar a reserva permanente. Não houve merge, deploy ou exclusão
de dados reais do operador. Checkout original master permanece fora deste trabalho.

Não comprovados: rollout/índices em produção, Storage real, leitor de tela,
zoom físico de 200%, segundo dispositivo e piloto humano. Referências de material,
pistas, missões, consequências, participantes, compartilhamento, condução ao vivo,
horário/notificações, IA, histórico e backup de sessões continuam fora de S1.

## Evidências e verificação manual

Artefatos em
`C:/Users/gaabr/.codex/visualizations/2026/10/12/01a131c1-057d-7721-88fb-d2454dec09b9`:
`writer-v2-campaign-sessions-validate.log` e
`writer-v2-campaign-sessions-qa/{qa-summary.json,captures-final.json,desktop-first,remaining}`,
além de `sdk-first.log`, `sdk-affected.log` e `sdk-tombstones.log` nessa pasta QA.

1. Abrir campanha própria e criar duas sessões; salvar data e preparação particulares.
2. Editar estado e mover a segunda para cima por teclado; consultar e recarregar.
3. Fechar preparação ainda não salva, atualizar a base e reabrir; o texto permanece.
4. Com resposta perdida, recarregar e confirmar o mesmo pedido; um recibo histórico
   pede consulta explícita e não substitui o rascunho por texto posterior.
5. Cancelar uma exclusão e conferir foco; confirmar depois e conferir outra mesa.
6. Excluir a campanha e encerrar explicitamente o controle preservado; conferir que
   o controle de outra campanha continua disponível.
