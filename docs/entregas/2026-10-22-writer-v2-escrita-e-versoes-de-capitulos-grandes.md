# Writer V2 — Escrita e versões de capítulos grandes (P1 M25)

## Objetivo e funcionalidades

Salvar, versionar e restaurar capítulos grandes sem truncar texto ou duplicar dois
corpos de quase 8 MiB na transação. O histórico passa a referenciar gerações
imutáveis, mantendo as versões quando o capítulo é removido.

[Plano 58](../tasks/writer-v2/execucao/58-escrita-e-versoes-dos-capitulos-grandes.md)
e [ADR 0069](../decisions/0069-chapter-body-references-and-history.md) descrevem
planejador transacional, deltas compartilhados e compatibilidade do histórico.

## Critérios atendidos e escopo

- Escrita, criação e replay usam texto lógico, com CAS, validação UTF-8 e limite
  de 8 MiB. Texto idêntico reaproveita corpo; volta para inline limpa ponteiro.
- Versão manual ou anterior à restauração referencia corpo existente, com segmentos
  UTF-8. Resumo/API preservados e versões v1 continuam legíveis/restauráveis.
- Restauração atualiza manuscrito/ledger/versão anterior/referências/recibo juntos.
- Excluir capítulo preserva versões; excluir versão revoga acesso e libera seu pin
  uma vez, inclusive após interrupção da limpeza e replay.
- Último pin deixa corpo unreferenced para futura coleta; não é exclusão física.
- Não há nova dependência, SDK Rule, transporte de mutação ou UI.

Principais arquivos: functions/src/bookChapterStorage.mjs, workProgressLegacy.mjs,
workHistory.mjs e workHistoryContracts.mjs; testes e helper de escrita nativa.
functions/package.json verifica sintaxe do novo módulo. O teste legado de Unicode
passou a usar a fixture que reproduz nascimento conjunto dos documentos nativos.

## Testes e validações executados

- Node dirigido: **97/97**, sem falhas ou skips, **16.932,9154 ms**.
  bookChapterStorage, workHistory, workProgress, bookChapterRead, bookChapterText
  e bookBackupRead. Os 14 testes novos incluem deltas compartilhados, CAS,
  rollback, corrupção, duas gerações grandes e retomada da exclusão.
- Vitest de compatibilidade: **60/60**, três arquivos, **1,77 s**.
  workHistoryService, workHistoryBackupStream e workHistoryRecovery.
- SDK Admin/Rules reais em emulador loopback: **dois casos distintos positivos**,
  53.827,821 ms na execução conjunta. Após a guarda final de identidade/projeto,
  o caso afetado passou novamente em 48.564,7411 ms, incluindo os novos casos
  negativos de identidade/projeto, sem skips.
- SDK preservou textos de 8.384.512 e 8.380.416 bytes, zero cópias em
  workVersionBodies, somente duas gerações e pins corretos após restauração,
  replay, exclusão de capítulo e versão. Leitura SDK dos corpos continua negada.
- Falha nativa por parte ocupada abortou criação de geração e liberação do pin
  anterior, sem alterar capítulo ou criar recibo. Concorrência tem um vencedor.
- Lint dirigido, check de Functions, arquitetura, formatação, docs e diff:
  passaram. Revisão final conferiu deltas, identidade/projeto, compatibilidade,
  leituras antes de writes e pendências de coleta/exclusão antes da ativação.
- npm run validate integral fica no fechamento do grande bloco P1, conforme
  orientação do usuário. Sem alterações frontend; build/typecheck não repetidos.
  CI ignorada, sem push/deploy.

## Limitações e próximos passos

O SDK cria raiz ativa pela fixture, sem comprovar restore P1 ou transporte Auth/
App Check produtivo. Os testes Node não substituem prova de concorrência nativa;
o SDK exercita CAS real, sem afirmar cobertura de todo tipo de retry do serviço.

Corpos unreferenced aguardam coleta física. Inventário de exclusão integral,
conversão e chat aplicador ainda exigem integração. Permanecem demais recursos/
campos grandes, personas/mídia, autorização/ativação e host/UI/roundtrip/validate.
P1/F2-09 seguem abertos; não há nova tela de restauração ou deploy para teste manual.

Somente commit local. Checkout original e servidor local preservados.
