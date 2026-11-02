# Writer V2 — rascunho explícito de aventuras

Entrega interna parcial do [plano 165](../tasks/writer-v2/execucao/165-rascunho-explicito-no-backup-de-aventuras.md).
Base: cdf3643. [ADR 0187](../decisions/0187-adventure-explicit-draft-stream.md).

Texto explícito de cena/bloco fica separado do salvo, vinculado a hashes dos
JSONs atuais. Preserva revisão local antiga, texto vazio e Unicode; não faz
autosave nem enumera armazenamento. Origem/token são revalidados nos readers
existentes. Segunda conferência permanece necessária antes do selo global.

Observador opcional da composição central fornece prova de unidade sem
duplicar conteúdo/mapa integral; callback fixado na chamada e falha sem prova.
Captura limita buffers a 64 KiB e cede execução por MiB na primeira passagem.

## Validação executada

- 13/13 Vitest novos: 140 ms; 2,01 s total.
- Seleção de revisão antiga real e composição central sem observador: 2/2,
  136 ms; 1,97 s total. São 14 casos distintos considerando a regressão central.
- Node puro: 1/1, 88,5549 ms total.
- Tipos e lint pertinentes positivos; bundle navegador: 24 módulos,
  83,95 kB, 20,77 kB gzip, 55 ms.
- Docs/arquitetura/styleguide, formatação e diff conferidos no fechamento.

Fixtures usam produtores/readers reais. Casos incluem cena/bloco, ausência,
vazio/revisão anterior à atual, BOM/Unicode acima de MiB e digest independente,
mutação de opções/texto/origem/observador, hash de salvo forjado, texto salvo
alterado, erro do observador, conta e encerramento sem aguardar RPC.
Nenhum novo teste SDK/UI: backend/Rules/superfícies não mudaram.
Validate integral permanece para fechamento do bloco de captura.

## Revisão e pendências

Diff confere escopo fechado, cópia de provas e intenção, ausência de writes/
localStorage, referências e hashes salvos, UTF-8 e lifecycle. Nenhum bloqueador
nesse recorte interno. A restauração futura mantém salvo e converte draft em
versão separada; não foi implementada ou declarada concluída aqui.

Próximo: composição final/segunda passagem, validador autoral e transporte/UI/
restauração/roundtrip. P2/P3/D, F2-09 e gates permanecem abertos; 8/35 preservado.
Sem CI/push/PR/merge/deploy/subagentes, somente commit local.
