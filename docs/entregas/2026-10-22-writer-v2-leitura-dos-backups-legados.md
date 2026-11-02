# Writer V2 — Leitura dos backups JSON legados (P1 M12)

- **Data:** 2026-10-22.
- **Branch:** codex/writer-v2, desenvolvimento local.
- **Plano:** [contrato 45](../tasks/writer-v2/execucao/45-leitura-dos-backups-json-legados.md).
- **Decisão:** [ADR 0056](../decisions/0056-legacy-book-backup-review.md).
- **Estado:** marco interno com checks dirigidos; P1/F2-09 continuam abertos.

## Implementado

- [x] Ler JSON writer-book-backup v1–v6 com gramática/UTF-8/duplicatas/EOF estritos.
- [x] Preservar ordem de propriedades/whitespace/BOM sem carregar todo o projeto.
- [x] Indexar spans de itens próprios no adaptador protegido M11.
- [x] Validar estrutura, lore próprio, personas, atos, cenas/fontes e narrativa.
- [x] Conservar prosa vazia/Unicode, fontes e artefato de composição renderizada.
- [x] Registrar histórico/progresso/draft/capa/ranks ausentes sem inventar dados.
- [x] Separar candidato de universo sem prova nativa e ignorar corpo global inline.
- [x] Não buscar URL, copiar labels resolvidos ou aplicar flags de publicação.
- [x] Distinguir legacy-content-only do relatório do formato novo.
- [x] Reutilizar hash/lifecycle do índice e preservar cleanup/cancelamento.
- [ ] Interface final, preparação/remapeamento/ativação e recuperação completos.

Validador comum mantém via nova estrita; somente a via legada permite avisos para
perfil ausente/override antigo indisponível. Não criar perfil ou reutilizar ID
da biblioteca atual. Conversão de ranks é derivação do slot ativo disponível,
não recuperação do buffer perdido. Leitura não cria nem altera projetos.

## Descoberta e testes executados

Além das fontes atuais, foram consultados commits locais do exportador:
401b200 (v1), 7eb3568 (v2), c2f3c4e (atos), 38ef449/7003ed4 (personas/atos),
f4449a5 (cenas) e 3b79591 (narrativa). Confirmam campos básicos, whitelist local,
lore global inline, SceneSource sem data de conversão e rank somente ativo.

Node final: **27/27** em 437 ms — cinco do scanner, onze da revisão legada e
onze de regressão do conteúdo novo. Casos agregam vetores de gramática/escapes,
duplicatas escapadas, campos/versões futuras, capacidades incompatíveis, IDs/
BOM/UTF-8, EOF/truncamento, perfis/overrides, metadata/parentesco/grupos e hashes.
Arquivo com corpo global de **9 MiB** é percorrido sem materializar esse item;
há 3.000 elementos sem limite artificial de quantidade e ranges até 64 KiB.
Índice da fixture verifica teto de entrada e ausência de prosa/URLs/labels.
Fixtures de teste usam memória somente como porta, não fallback do produto.

Primeiro caso do scanner usava sintaxe genérica TypeScript num arquivo MJS;
fixture corrigida. Percorrer cada byte por await custava cerca de 1,6 s no caso
de 1 MiB; varredura direta dos trechos de string dentro do range reduziu o caso
para cerca de 74 ms, preservando os testes negativos. Não é benchmark de produção.

Vitest final: **46/46**, cinco arquivos em 3,32 s: seis de interoperabilidade,
25 do exportador existente, dois da API legada e 13 de inspeção/índice anteriores.
A interoperabilidade executa exportManuscript real com APIs autorais simuladas;
cada Blob v1–v6 emitido é lido pelo novo núcleo. Inclui capítulo removido ainda
aberto/vazio, universo, fichas locais/globais, presets, atos, cenas, fonte com
persona ausente e narrativa. Não alegar SDK/Auth ou persistência remota reais.

Fixture da API pública precisou envolver os bytes do TextEncoder no Uint8Array
do realm do teste jsdom, como faz o adaptador Blob real. Não relaxar o guard de
bytes por causa de diferenças entre realms do harness.

## Chromium / File / OPFS reais

Artefatos v1–v6 vieram do exportador real no teste de interoperabilidade, com
as mesmas APIs simuladas. Um helper temporário verificado por hash gravou as
seis fixtures fora do Git; foi removido apenas após conferir caminho/hash.
Probe nativo usa os arquivos, código de inspeção e índice protegido reais.

**Nove cenários em um probe**, 3,57 s (Node test positivo, 4,01 s).
Seis arquivos OPFS de **943, 1.244, 3.988, 4.139, 5.956 e 6.741 bytes**.
Fingerprint é conferido com Web Crypto independente. Os pequenos arquivos exigiram
ranges de até 6.741 bytes em 85 leituras; o limite de 64 KiB e grandes valores
têm prova Node separada, não inferida só dessas fixtures pequenas.

v1 conserva dois capítulos, incluindo removido/vazio; demais versões têm um.
v2+ conserva candidato world e informa uma entrada global ignorada.
v3+ tem perfil usado; v4+ ato; v5+ cena/corpo/plano/referência/fonte e aviso de
perfil ausente; v6 inclui arco e evento. URL tokenizada, corpo/nome global,
label resolvido e prosa não aparecem no relatório/índice. Não houve fetch externo.

Versão futura e corpo com hash divergente não devolvem relatório.
Abort após doze leituras também não devolve relatório; índice fica vazio depois
de cada sucesso/falha/cancelamento. Zero erros de runtime do navegador e
requisições externas bloqueadas. Fixtures OPFS de entrada foram removidas.

Probe é de leitura local, sem emulador ou serviço de produção: não comprova
Auth/App Check, restauração, seletor externo ou revisão de UI.

## Checks e limites

Lint dirigido, typecheck, build/bundle/smoke, arquitetura e sintaxe Functions
passaram. Documentação/formato/diff conferidos no fechamento, com revisão local.
Sem nova dependência, RPC, Rule, coleção ou crédito. Sem subagentes.

Mantêm-se avisos de chunks grandes/imports estáticos-dinâmicos do bundle.
O probe deste marco não usa Storage; avisos de listeners/runtime de M9/M10
continuam como histórico conhecido, sem nova alegação de correção.
Auditoria não repetida: três moderados preexistentes na baseline M4.

Validate completo continua no fechamento P1. Nenhuma CI consultada/disparada,
push, PR, merge ou deploy. Master original em E preservada.
Próximo contrato: preparar/ativar uma nova cópia privada no servidor,
com remapeamento, autorização, retomada e cleanup. Este marco não encerra
P1/F2-09 nem soma uma tarefa ampla concluída.

## Reprodução dirigida

```bash
node --test functions/test/bookLegacyJSON.test.mjs functions/test/bookLegacyReview.test.mjs functions/test/bookBackupContent.test.mjs
npx vitest run src/features/editor/tests/bookLegacyInterop.test.ts src/features/editor/tests/exportManuscript.test.ts src/features/book-portability/tests/inspectLegacyBookBackup.test.ts src/features/book-portability/tests/inspectBookBackupContent.test.ts src/features/book-portability/tests/bookValidationIndex.test.ts
npm run build
npm --prefix functions run check
```

Probes, seis JSON e relatório m12-native.json permanecem no diretório privado
writer-v2-portability-qa dos artefatos da sessão, fora do Git.
