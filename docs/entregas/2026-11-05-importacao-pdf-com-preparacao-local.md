# Importação de PDF com preparação local e reaproveitamento de análises

- **Data**: 2026-11-05
- **Branch**: `master`, alterações locais sem commit
- **Plano de origem**: [Otimização da importação de PDF](../tasks/otimizacao-importacao-pdf-local.md), autorizado na conversa
- **Decisão**: [ADR 0276](../decisions/0276-local-prepared-lore-import.md)

## Objetivo

Reduzir requisições e trabalho repetido na importação de universos/lore, enviando
à IA texto já extraído, organizado e limitado. Livro e aventura continuam usando
extração e revisão locais, sem IA para organizar o PDF.

## Funcionalidades entregues

- **Preparação local** — páginas curtas compartilham blocos; cortes preferem
  seções/parágrafos e conservam texto, Unicode e páginas de origem. A limpeza
  retira números e margens recorrentes, preservando ocorrências no corpo,
  apresentação, sumário e apêndices.
- **Upload v2** — novas importações enviam somente texto preparado e metadata.
  Não enviam o original nem armazenam uma segunda cópia do texto nos recibos.
  O servidor mede bytes UTF-8 e verifica hashes, cadeia, ordem e completude.
- **Compatibilidade v1** — sessões antigas conservam o upload de bytes e a
  extração anterior; a versão da sessão determina a retomada. Não há fallback
  automático de protocolo após falha.
- **Contexto selecionado** — nomes/apelidos selecionam fichas pertinentes ao
  bloco, incluindo homônimos, acentos e nomes quebrados entre linhas/páginas.
  Essa comparação não altera nem filtra o texto enviado para análise.
- **Recuperação de análises** — resultados validados ficam privados na própria
  unidade de origem. Retry exato reaproveita sucessos, inclusive em outra
  instância, sem publicar candidatos parciais ou avançar o cursor cedo demais.
  Uma lease impede requests concorrentes do mesmo lote e cerca respostas antigas.
- **Origem e encerramento** — evidências mostram as páginas realmente cobertas.
  Cancelamento/revogação são reconferidos; limpeza conserva versão/resultado e
  retira metadata privada do marcador terminal.
- **Impeccable preservado** — correção adicional autorizada durante o fechamento:
  registro explícito de instalação externa, com metadata/versão verificadas e
  preservação das variantes por plataforma. Assets do fornecedor e cache gerado
  ficam fora da reformatação. As cópias canônicas continuam verificadas.

## Critérios de aceite

- [x] Preparação local reduz blocos sem resumir ou truncar conteúdo autoral.
- [x] Limites por bloco: 12.000 unidades UTF-16, 32.000 bytes UTF-8 e 200 faixas.
- [x] V2 verifica bytes reais e integridade antes de qualquer análise.
- [x] V1 permanece retomável; partes alteradas/incompletas/estrangeiras são recusadas.
- [x] Contexto conserva todas as correspondências ambíguas e o texto fonte inteiro.
- [x] Falhas reutilizam sucessos persistidos, com fingerprints e autorização atuais.
- [x] Concorrência, expiração da lease e ACK tardio não duplicam publicação do lote.
- [x] Revisão, crédito e recibo continuam atômicos e exigem confirmação explícita.
- [x] Dados privados permanecem server-only, com limpeza pela família importSources.
- [x] Testes, cobertura, lint, typecheck, build e smoke test aprovados.
- [x] Documentação e decisão arquitetural atualizadas.

## Arquivos alterados

| Área                | Arquivos e mudança                                                                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extração/preparação | `document-import/services/loreDocumentPreparation.ts`, `pdfLayoutExtraction.ts`, `documentParserService.ts` e API pública: blocos, hashes, faixas e limpeza compartilhada. |
| Cliente/revisão     | `universes/services/loreImportService.ts`, `model/loreImport.ts` e `components/LoreImportDialog.tsx`: protocolo por sessão, envio preparado e páginas da evidência.        |
| Servidor            | `functions/src/universeLoreImport.mjs`, `universeLoreImportAnalysis.mjs` e `index.mjs`: validação, contexto, cache privado, lease e projeção terminal fechada.             |
| Testes              | Testes de preparação, parser, upload, diálogo, servidor, Rules de universos e jornada Chromium de PDF multipágina.                                                         |
| Sincronização       | `scripts/skill-registry.mjs`, `check-skills.mjs`, `sync-skills.mjs`, `skills.test.mjs`, `skills/external-skills.json` e `.prettierignore`.                                 |
| Documentação        | Plano, ADR 0276, arquitetura, processo de desenvolvimento e contratos de importação de documentos/universos.                                                               |

## Testes

| Grupo                  | Resultado e cobertura                                                                                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend com cobertura | 398 arquivos e 5.292 testes aprovados no validate. Inclui parser legado, preparação, codecs, upload, retomada e revisão.                                                                                       |
| Infraestrutura         | 121 testes aprovados. Inclui preservação das variantes externas, cópias canônicas, extras desconhecidos e registros inválidos.                                                                                 |
| Functions              | 4.976 testes aprovados. Inclui os 23 testes direcionados de importação/contexto, metadata terminal, falhas, replays, concorrência e autorização.                                                               |
| Firestore direcionado  | 7 testes em `tests/firestore/universes.rules.test.mjs`, no emulador isolado: privacidade inclusive de importSources e criação/replay/atualização transacionais v1/v2.                                          |
| Chromium               | 6 cenários em `e2e/visual/universe-lore-import.visual.ts`, nos temas claro, escuro e sépia. PDF sintético real de seis páginas é extraído e preparado no navegador. A revisão usa serviços fictícios isolados. |

Saída real da execução integral:

```text
Test Files  398 passed (398)
Tests  5292 passed (5292)
All files | 89.41 | 85.73 | 90.21 | 92.56

Infraestrutura:
ℹ tests 121
ℹ pass 121
ℹ fail 0
ℹ skipped 0

Functions:
ℹ tests 4976
ℹ pass 4976
ℹ fail 0
ℹ skipped 0
Functions syntax checked: 498 modules

Smoke test do bundle OK.
```

Cobertura: statements **89,41%**, branches **85,73%**, functions **90,21%** e
lines **92,56%**. Os limites existentes foram mantidos.

## Medição local

Amostra controlada: 60 páginas textuais já extraídas, 109.851 unidades UTF-16,
com preservação integral conferida pelo teste de reconstrução.

| Medida                               | Observação                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Chamadas de análise planejadas       | 60 por página antes; 10 blocos depois: redução de 83,3% nessa amostra.                                                                      |
| Texto preparado                      | 112.729 bytes UTF-8, incluindo separadores e sobreposições.                                                                                 |
| Preparação                           | 1,13 ms observados nesta máquina.                                                                                                           |
| Hashes/manifesto                     | 6,32 ms observados nesta máquina.                                                                                                           |
| Retry com uma falha em três unidades | Quatro chamadas ao gerador fictício no total; os dois sucessos não são reenviados. Antes, seriam seis chamadas para repetir o lote inteiro. |

Os tempos não incluem leitura do PDF, HTTP ou provedor. A medição não comprova
latência/custo real em produção. Nenhuma chamada paga foi executada.

## Validações executadas

| Comando/verificação                                                                                         | Resultado                                                                                                             |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `npm run validate`                                                                                          | Verde, saída 0: skills, arquitetura, docs, styleguide, formatação, lint, testes, Functions, typecheck, build e smoke. |
| `node --test functions/test/universeLoreImport.test.mjs functions/test/universeLoreImportAnalysis.test.mjs` | 23 aprovados, incluindo o ajuste de limpeza identificado no fechamento.                                               |
| `node --test scripts/skills.test.mjs`                                                                       | 4 aprovados; também incluídos nos 121 da infraestrutura.                                                              |
| `npm run sync:skills` e `npm run check:skills`                                                              | 11 skills canônicas sincronizadas/verificadas; Impeccable externo preservado.                                         |
| SHA-256 das instalações externas                                                                            | 182 arquivos nas três cópias de skills preservados byte a byte.                                                       |
| `npx playwright test --config playwright.visual.config.ts e2e/visual/universe-lore-import.visual.ts`        | 6 aprovados; porta isolada 4199.                                                                                      |
| Firestore direcionado em emulador                                                                           | 7 aprovados, sem recursos de produção.                                                                                |
| Revisão do diff e `git diff --check`                                                                        | Sem bloqueadores ou erros de whitespace no escopo.                                                                    |

O primeiro validate encontrou a instalação externa do Impeccable fora da fonte
gerada. A correção foi autorizada pelo operador e conferida sem apagar/reformatar
o pacote. Ajustes de tipos/lint encontrados no fechamento também foram corrigidos;
somente a execução integral aprovada é usada como evidência do gate.

Os 17 arquivos já modificados no início mantiveram seus hashes. Não foram
adicionadas dependências nem alterados limites de cobertura.

## Fora do escopo

OCR, leitura de mapas/imagens, modelo local, novas regras de preço, publicação,
migração de sessões expiradas, commit, push e implantação.

## Limitações e pendências conhecidas

- PDF sem camada textual continua exigindo OCR prévio. Heurísticas de layout e
  extração semântica exigem revisão das fichas.
- Limites de saída permanecem: até 50 entidades por resposta e 200 candidatas,
  com erros explícitos para excedentes. Não há promessa de extração literária
  perfeita nem benchmark com provedor real.
- No v2, o tamanho do original é declarado; a cota servidor é de 20 MB reais de
  texto preparado. Hashes não certificam correspondência entre PDF e texto.
- Um processo interrompido pode manter a lease por até quatro minutos antes de
  uma retomada explícita. Cache exige fonte/contexto/configuração idênticos.
- Publicação exige frontend e Functions coordenados e drenagem das instâncias
  anteriores. Validação local não equivale a deploy ou sessão de produção validada.

## Como verificar manualmente

1. Abra Universos e importe um PDF com texto em múltiplas páginas curtas.
2. Confira a preparação local e a quantidade de trechos; no painel de rede,
   novos uploads devem enviar somente partes source com hashes/faixas.
3. Revise fichas e evidências, inclusive quando a citação atravessa páginas.
4. Pause/retome a análise e simule uma falha de unidade em ambiente de teste:
   sucessos validados são reutilizados; confirmar continua sendo uma ação própria.
5. Confira uma sessão v1 pendente: ela conserva o formato anterior de upload.
