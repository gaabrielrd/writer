# Writer V2 — Leitura lógica de capítulos (P1 M24)

## Objetivo e funcionalidades

Integrar o corpo externo de M23 à leitura do manuscrito, mantendo bytes completos
e acesso privado. O cliente reconstrói partes autenticadas, verifica hash/UTF-8/
BOM e confirma origem ao terminar. Erros não produzem manuscrito vazio ou parcial.

[Plano 57](../tasks/writer-v2/execucao/57-leitura-logica-dos-capitulos.md) e
[ADR 0068](../decisions/0068-logical-chapter-text-read.md) registram a API, tokens
nativos e integração de histórico, contagem, análise e backup. API por página
exige raiz própria ativa, capítulo e geração atuais; SDK direto permanece negado.

## Escopo e critérios atendidos

- Helpers internos de cabeçalho/parte reutilizam integridade e origem M23.
- readLegacyChapterText retorna até 64 KiB binários por chamada, com token que
  fixa as encarnações da raiz/capítulo/corpo. Reautoriza cada parte.
- bookService entrega string lógica e limita concorrência entre capítulos;
  metadata-only não baixa corpos. Cliente preserva conta, geração e token,
  confere bytes completos e faz confirmação final sem persistir prosa.
- Histórico/sourceToken, ledger/bootstrap, análise e exportação da estrutura
  consultam conteúdo lógico. Ausência/corrupção externa falha explicitamente.
- Nenhuma nova dependência, SDK Rule, publicação ou UI de restauração.

Principais arquivos: bookChapterText/bookChapterRead, workProgress/Ledger,
workHistoryContracts, bookBackupRead, loreAnalysis e index em functions/src;
chapterTextReadService e bookService na feature books, com testes Node/cliente/
SDK correspondentes. functions/package.json inclui check do novo módulo.

## Testes e validações executados

- Node dirigido: **119/119**, sem falhas ou skips, 3.436,4321 ms.
  bookChapterRead, bookChapterText, workHistory, workProgress, bookBackupRead,
  loreAnalysis e bookRestoreStructure. Após revisão, os dois arquivos afetados
  passaram novamente em 30/30 (2.091,5157 ms), incluindo um caso adicional de
  capítulo em exclusão cujo corpo já foi removido: total de 120 casos distintos.
- Vitest: **72 testes distintos positivos**. bookService (58) e
  chapterTextReadService (14); arquivos afetados repetidos após os ajustes de
  tipagem/lint e concorrência. Leitor cobre 8 MiB completos em 129 chamadas,
  corrupção, resposta/contexto inválidos, revogação final e troca de conta.
- SDK real em emulador loopback: **2/2**, sem falhas ou skips, 38.222,7741 ms.
  Casos native chunked e native chapter read de bookChapterText.rules.test.mjs.
  Jornada M23 de 1,1 MB e teste da API paginada, bloqueando raiz ausente, dono
  diferente, metadados alterados, raiz/parte recriados. SDK direto continua negado.
- npm --prefix functions run check, lint dirigido, check:architecture,
  typecheck, build:bundle e smoke:build: passaram. Bundle conserva avisos de
  tamanho/importações dinâmicas; nenhum erro de build.
- Formatação, check:docs e git diff --check conferidos no fechamento local.
- Suite npm run validate integral reservada ao fechamento P1; CI ignorada.

## Limitações e pendências

Os testes de livro ativo criam raiz pela fixture; não há ativação P1 implementada.
A callable está preparada no código, sem deploy. SDK não prova o wrapper Auth/
App Check produtivo; mocks cliente não comprovam toda a jornada autenticada no UI.

Escrita, versões por referências/pins, coleta, exclusão, conversão e chat aplicador
ainda exigem integração. Outros campos grandes, demais recursos, personas/mídia,
autorização final e host/UI/roundtrip/validate seguem pendentes. Backup conserva
o limite do item JSON codificado, incluindo seus metadados e escapes, e relê o
item lógico a cada parte. P1/F2-09 continuam abertos.

Somente commit local, sem CI/push/deploy. Checkout original preservado. Para
verificação local deste incremento, usar testes dirigidos e emulador demo; não
há nova interface visual de restauração para testar manualmente.
