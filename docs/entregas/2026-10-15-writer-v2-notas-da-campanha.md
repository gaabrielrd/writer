# Writer V2 — Notas próprias da campanha

- **Data:** 2026-10-15
- **Branch:** codex/writer-v2
- **Plano de origem:** [F2-07 C1](../tasks/writer-v2/execucao/16-notas-proprias-da-campanha.md)
- **Estado:** validado localmente; CI pendente. Não encerra F2-07.

## Objetivo

Registrar texto autoral particular de cada mesa sem modificar o original. As
notas continuam acessíveis quando a aventura ou o universo da base fica indisponível.

## Funcionalidades entregues

- Criar, ler, editar e excluir notas com título e texto simples, salvamento manual
  e confirmação de exclusão. Cancelar preserva o servidor.
- Preservar texto, Unicode e quebras de linha; exibir marcação como texto literal.
- Recuperar pedidos sem resposta após fechar/recarregar, inclusive criação e
  exclusão que já chegaram ao servidor. Repetir exatamente a operação preservada.
- Isolar mesas, contas e abas. Conflito mantém os campos e exige descarte explícito;
  resposta antiga não reabre o diálogo nem substitui conteúdo/revisão mais recente.
- Manter notas separadas de base/lore, checklist e metadados. Nota nova começa vazia.

## Critérios de aceite

- [x] CRUD, cancelamento, Unicode, limites e lista sem corpos.
- [x] CAS, replay, tombstone e rejeição de recibo anterior após nova edição.
- [x] Root recriado não adota filhos ou pedidos da encarnação anterior.
- [x] Recuperação após reload e reserva entre abas com Web Locks reais.
- [x] Origem indisponível não bloqueia texto próprio; SDK direto nega todos os papéis.
- [x] Três temas, teclado/foco e 320 px sem overflow nas jornadas verificadas.
- [x] Revisão, validate e documentação locais.
- [ ] CI do novo head, acompanhado em paralelo no PR 21.

## Arquivos alterados

| Área                                                                 | Mudança                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------- |
| src/features/campaign-notes                                          | Contratos, transporte, journal, controlador e painel públicos |
| campaigns/CampaignPage e teste                                       | Composição da API pública de notas                            |
| functions/src/campaignNotes*.mjs                                     | Leitura, paginação, CAS e recibos/tombstones transacionais    |
| functions/src/campaigns.mjs e index.mjs                              | Gate próprio exportado e quatro callables                     |
| functions/package.json e test/helpers/studioDb.mjs                   | Sintaxe e createTime imutável preciso no helper               |
| firestore.indexes.json                                               | Índice de lista e dispensa de índice do corpo                 |
| Testes colocalizados, functions/test e tests/firestore               | Interface, identidade, autorização e persistência             |
| e2e/visual/campaign-notes.visual.ts, fixture e vite.visual.config.ts | Jornada nativa, duas abas, reload e três temas                |
| AGENTS, README, arquitetura, testes, planos e ADR 0032               | Regras implementadas, estado e limitações                     |

## Testes

Frontend dirigido inicial: 40/40. Os sete afetados pelos últimos ajustes passaram;
três negativos foram observados falhando antes das correções de fechamento e
resposta atrasada. Servidor dirigido: notas 8/8, campanhas existentes 7/7.

SDK real no emulador Firestore, com escritores e regras reais:

```text
ℹ tests 4
ℹ pass 4
ℹ fail 0
ℹ skipped 0
ℹ duration_ms 8777.6044
```

O SDK verifica isolamento, negação direta, CAS/replay/tombstone, controle ausente,
limites/UTF-8 e createTime real. Edição de metadados mantém a identidade; recriação
do root invalida filhos e pedidos antigos. Origem removida não revoga notas.

Chromium final: **24/24**, **68.230,421 ms**, sem falhas, skips, flaky ou retries,
em seis projetos (desktop/móvel × três temas). Inclui duas abas reais, troca de
UID, respostas perdidas de create/edit/delete, reload e origem indisponível.
Controles da fixture: 5/5. Seis imagens finais de painel/formulário inspecionadas.
A primeira execução desktop teve 3/4: o teste esperava um nome de universo que a
tela não apresenta. Corrigida a observação para href e seleção reais após reload;
caso afetado 1/1, depois a execução final 24/24. Nenhuma asserção de produto removida.

## Validações executadas

`npm run validate` final terminou com exit 0:

```text
Test Files  165 passed (165)
     Tests  1581 passed (1581)
  Duration  117.93s
All files | 90.88 | 84.58 | 90.28 | 93.43 |
ℹ tests 77
ℹ pass 77
ℹ duration_ms 7980.9947
ℹ tests 297
ℹ pass 297
ℹ duration_ms 1797.6947
✓ built in 1.23s
Smoke test do bundle OK.
```

Cobertura: statements/branches/functions/lines, nessa ordem. Arquitetura, docs,
styleguide, formato, lint, tipos e sintaxe também verdes. Primeira tentativa parou
na formatação do novo SDK antes de lint/testes; formato corrigido e validate
integral repetido. SDK não repetido por mudança exclusivamente de formato.
Permanecem os avisos conhecidos de chunk acima de 500 kB e import misto de DOCX.
Revisões independentes de servidor e cliente não deixaram P0/P1/P2 remanescente.

Artefatos locais em C:/Users/gaabr/.codex/visualizations/2026/10/12/01a131c1-057d-7721-88fb-d2454dec09b9:
writer-v2-campaign-notes-validate-final.log, writer-v2-campaign-notes-sdk.log e
writer-v2-campaign-notes-qa/final/results.json, native-summary.json e captures-final.json.

## Fora do escopo

Variantes derivadas, comparação/adoção de base, exclusão integral da campanha,
histórico de notas, rich text, anexos, IA, sessões, compartilhamento e comércio.

## Limitações e pendências conhecidas

Journal integral contém apenas texto próprio; não autoriza cache de lore derivado.
Sem Web Locks ou persistência segura, campos são preservados e mutações não saem.
Excluir nota remove título/corpo e mantém tombstone; não há restauração. Limpeza
integral futura deverá incluir notas, controles e recibos. Índice declarado não
significa implantado. Fixture não comprova produção ou piloto humano.
Sem dependências novas, merge ou deploy. CI pendente não é conclusão técnica.

## Como verificar manualmente

1. Abrir uma campanha, criar uma nota e cancelar outra; conferir apenas a salva.
2. Editar com Unicode/quebras de linha e recarregar; conferir texto integral.
3. Abrir a mesma campanha em duas abas; pedido reservado bloqueia outro envio.
4. Simular resposta perdida e recarregar; repetir o pedido preservado sem duplicar.
5. Tornar a origem indisponível; notas próprias continuam editáveis e a base falha
   separadamente. Excluir com confirmação e conferir ausência após reload.
