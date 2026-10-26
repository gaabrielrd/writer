# Writer V2 — composição dos dados centrais de aventura

Data: 2026-10-26. Branch codex/writer-v2. Base: 604497e.
[Plano 162](../tasks/writer-v2/execucao/162-composicao-dos-dados-centrais-de-aventuras.md),
[ADR 0184](../decisions/0184-adventure-core-data-stream.md).

## Entrega e limite

Cinco seções ordenadas com bytes de raiz/partes, recursos/filhos/ausências, lore/
corpos, perfis usados/null e origem neutra. Endereços determinísticos preservam
identidade; manifestos e digests têm memória constante e totais precisam bater
com metadata. Origem não copia lore/nome global. Não inclui tokens como conteúdo.

Prova core-data-only contém o inventário da primeira passagem. Ainda faltam
corpos/manifestos de histórico e Storage, drafts, segunda passagem final,
validador/selo, RPC/UI e restauração. O envelope usado no teste tem placeholders
opacos nas três últimas seções; não é backup autoral completo ou restaurável.

Ponte de um slot extraída para shared/streams com wrapper compatível de livro.
Return/throw fecham sem esperar RPC e observam resultados tardios; ack depende
de consumo. Não há cópia do conjunto/prosa em memória nem inicialização Firebase
no import da feature.

## Testes dirigidos reais

33 Vitest distintos em seleções positivas:

- 15 regressões de recordCaptureStream/streamBookBackup: dois arquivos, 3,13 s
  (casos em 124 ms).
- Cinco novos da ponte + cinco regressões já contadas: dez positivos em 1,49 s
  (52 ms). Dois adicionais de throw não Error: dois positivos, cinco não
  selecionados, 1,31 s (3 ms).
- Oito novos de composição: 2,47 s (387 ms).
- Três adicionais de 53 membros, perfil privado arquivado/herança e mundo
  indisponível: três positivos, oito não selecionados, 2,04 s (280 ms).

Composição usa produtores/leitores reais no banco de fixture: Root, cenas/
blocos/narrativa/lore/checklist/histórico/persona. SHA Node independente reconstrói
unidades/digests/manifestos a partir dos registros, inclusive Unicode e corpo com
dois ranges. Corpus importado usa start/upload/materialize/activate nativos.
Perfis privados não copiam provider/key; null herda sem inventar perfil. Mundo
estrangeiro produz hint neutro, sem prosa/nomes globais.

Node: cinco novos de endereços/manifestos/markers e cinco regressões do envelope:

```text
ℹ tests 10
ℹ pass 10
ℹ fail 0
ℹ skipped 0
ℹ duration_ms 138.9186
```

Confere SHA de endereço independente, pais/kinds/scopes diferentes, BOM/
Unicode decomposto, identidades inválidas, contagens/tipos fechados e bytes de
recibo/digest canônicos.

## Checks e falha ambiental

Types/lint finais passaram. Lint inicial identificou tipagem any em catch de
teste, async sem await e rejeição unknown da semântica de throw. Tipos e Promise
foram corrigidos; somente rejeição original do iterador mantém comentário local
de lint, exercitado pelos dois casos não Error. Nenhuma regra global foi reduzida.

Bundle isolado do índice público para navegador: 16 módulos, 51,17 kB
(gzip 14,67), 62 ms, código 0. Não contém integração Firebase no import nem
helpers exclusivos Node. Artefato de QA fica fora do Git.

Primeira tentativa de `npm run build` não iniciou Node no passo typecheck:
PowerShell reportou System.OutOfMemoryException/ResourceUnavailable. Embora
a shell tenha devolvido zero, a tentativa foi tratada como falha.
Diagnóstico encontrou apenas Vite associado ao worktree; nenhum processo foi
encerrado. Typecheck final já tinha código 0. Bundle e smoke foram então
executados por Node direto, sequencialmente, com verificação real de exit code:

```text
M74_DIRECT_STEP bundle
built in 2.31s
M74_DIRECT_STEP smoke
Smoke test do bundle OK.
M74_DIRECT_BUILD_PASSED
```

Avisos existentes de chunks/imports dinâmicos foram preservados. Não atribuir
sucesso ao comando build original que falhou. Logs m74-*.log e runner
m74-finish-build.py no diretório privado writer-v2-portability-qa fora do Git.
Sem nova UI/Chromium, SDK, serviço de produção ou CI. Validate integral de 158
pertence ao código anterior; próximo fechamento integral encerra captura completa.

## Revisão e continuidade

Diff confere wrapper de livro, neutralidade de shared, fila/ack/encerramento,
DTOs/endereços/digests, tipos fechados e prova incompleta explícita. Sem
dependências novas, credenciais, armazenamento oculto ou mudança de publicação.
Checks de docs/arquitetura/formatação/diff são conferidos antes do commit.

Próximo: ordem/hash integral do histórico e bytes/provas de imagem, drafts,
composição completa, verificação/validador, UI e restauração. P2/P3/D, F2-09 e
demais gates continuam abertos; 8/35 preservado. Somente commit local,
sem push/PR/merge/deploy/subagentes.
