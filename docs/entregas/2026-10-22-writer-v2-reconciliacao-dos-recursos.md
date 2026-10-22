# Writer V2 — Reconciliação dos recursos preparados (P1 M30)

- Data: 2026-10-22
- Branch: codex/writer-v2
- Plano: [contrato 63](../tasks/writer-v2/execucao/63-reconciliacao-dos-recursos.md)
- Decisão: [ADR 0074](../decisions/0074-restored-resource-reconciliation.md)

## Objetivo e funcionalidades

Reconciliar as contagens dos recursos preparados para a futura cópia do livro,
combinando capítulos legados e cenas elegíveis sem perder prosa do Arquivo,
sem capítulo ou com pai removido. Preparar o índice estrutural de referências,
mantendo o destino privado e indisponível até a ativação futura.

## Critérios atendidos

- [x] Conferência dos itens validados e de seus artefatos/journals nativos antes
      dos derivados, com cursor independente e prova no commit.
- [x] Cena conta seu corpo; agrupador inclui cenas arquivadas na quantidade,
      mas soma palavras somente das ativas. Sem capítulo/pai removido não
      contribuem ao manuscrito. Nenhum capítulo removido é inventado.
- [x] Ledger compartilhado, capítulos legados preservados, fontes de cenas
      inesperadas bloqueadas e delta/contagens/recibo atômicos.
- [x] Corpo congelado externo e pins preservados; somente a composição canônica
      entra na meta. Agrupadores/sequências recebem baseline de revisão 1.
- [x] Vínculos nativos únicos determinam referenceCount, inclusive referências
      indisponíveis. Fonte narrativa removida não é recriada.
- [x] Cursor de vínculo reautentica a âncora; replay/concorrência/retry não duplicam
      contribuições. Falhas e documentos recriados preservam o estado anterior.
- [x] Progresso v4/inventário v8, controle tipado entity-index-control e cleanup
      compatível. Substituição idêntica conserva artefato/journal sem no-op físico.
- [x] Índice completo somente após conferência. Raiz ausente e countReady false;
      estado interno final personas sem consumir esse primeiro item.

## Arquivos

BookRestoreCounts orquestra as etapas e BookRestoreCountEffects reaproveita
o ledger/projeções. Artifacts fornece leitura autenticada e controle derivado;
Upload/UploadContracts e cleanups incorporam progresso v4/inventário v8.
Functions check inclui os módulos novos. Testes Node/helper e
bookRestoreCounts.rules.test.mjs cobrem comportamento e SDKs reais.
AGENTS, README, arquitetura, testes, plano/execução e ADR registram as regras.

## Testes e validações reais

**175 testes Node distintos positivos** em onze arquivos dirigidos, incluindo
22 cenários novos de reconciliação, sem falhas/skips:

```text
tests 175
pass 175
fail 0
skipped 0
duration_ms 7337.4568
```

Arquivos: bookRestoreCounts, Resources, Lore, Structure, Remap, ContentRead,
Upload, Integrity, Validation, LegacyValidation e bookChapterText.
Cobre seis cenas com texto ativo/arquivado/sem capítulo/órfão/vazio, duplicatas
de vínculo, origem removida, contagem sem controle portátil, compatibilidade
JSON v1–v6, corpo congelado grande/pins, rollback/retry, replay gêmeo,
cancelamento durante leitura, âncora recriada e controle estrangeiro.

**2 cenários distintos com SDKs reais positivos**, no Firestore 1.22.0 verificado,
portas loopback dedicadas:

| Cenário                                                                                | Resultado                 |
| -------------------------------------------------------------------------------------- | ------------------------- |
| Contagens, disputa CAS, prova nativa/no-op, SDK privado, cleanup v8 e replay histórico | Passou em 118.967,1756 ms |
| Fonte nativa recriada bloqueia reconciliação antes de derivado/recibo                  | Passou em 86.901,1511 ms  |

O lote inicial teve uma falha de expectativa: três literais Unicode no teste SDK
foram corrompidos no pipe PowerShell. O contador real correspondia à fonte UTF-8.
Corrigidos para escapes Unicode ASCII; repetido somente o cenário afetado:

```text
tests 1
pass 1
fail 0
skipped 0
duration_ms 119799.2316
```

A conferência nativa compara nascimento/última alteração de cada artefato,
journal e recibos, incluindo substituições idênticas v8. A disputa por checkpoint
teve um vencedor; contagem e fontes não duplicaram. SDK direto de dono/outro/
anônimo permaneceu negado, e outro projeto conservou sua contagem.

Lint dirigido, check de Functions e arquitetura passaram. Formatação/docs/diff
e revisão final conferidos antes do commit. Sem código cliente modificado:
Vitest/typecheck/build não repetidos. npm run validate integral continua no
fechamento do grande bloco P1. Nenhuma Rule/API pública/dependência/crédito novo.

## Limitações e próximos passos

countReady continua false e a raiz não existe: a futura ativação deve normalizar
controle e contagem junto da raiz, depois de autorização/certificação integrais.
O índice completo só declara estrutura, sem conceder acesso às origens.

O harness de leitores usa uma raiz sintética somente no teste; comprova contagens
e consulta do índice, sem demonstrar ativação real ou jornada no navegador.
Faltam personas, histórico/rascunho/capa, representação de campos grandes e
consumidores, autorização/ativação, host/UI, roundtrip e validate integral.
P1/F2-09 e o objetivo Writer V2 continuam abertos.

Somente commit local, CI ignorada, sem push/PR/deploy. Checkout original e
servidor local preservados.
