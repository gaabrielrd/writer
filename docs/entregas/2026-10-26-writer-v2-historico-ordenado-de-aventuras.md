# Writer V2 — histórico ordenado de aventuras

Entrega local parcial do [plano 163](../tasks/writer-v2/execucao/163-historico-de-aventuras-em-ordem-textual.md).
Base: 50fc21a. [ADR 0185](../decisions/0185-adventure-ordered-history-stream.md).

## Resultado

Reader interno por ordinal com fonte/head/índice/endereço nativo verificados
na transação. Cliente preserva JSON do cabeçalho e texto integral de versões
manuais/before-restore, sem depender da existência atual da cena ou bloco.
Registros adventure-version-body/text distinguem contagem nativa da portátil,
com hash de cabeçalho, bytes e SHA integral do texto; seção fecha com manifesto.

Memória limitada, intent capturado antes de consumo, opções/páginas copiadas,
encerramento sem esperar RPC pendente e nenhuma prova em erro ou troca de conta.
Prova history-data-only permanece parcial; ainda não há arquivo de aventura
completo, restauração ou interface correspondente.

## Verificações executadas

- Node: 43/43 de readers (610,2818 ms); nove contrato/envelope (119,2834 ms).
  São 52 casos distintos, 14 novos e 38 regressões.
- Vitest: 18 casos passaram na seleção final do arquivo (165 ms; 1,85 s total);
  duas integrações adicionais passaram (119 ms; 1,92 s total); um UTF-8 incompleto
  adicional passou (19 ms; 1,82 s total). 21 casos distintos.
- SDK Firestore: um caso dirigido passou (4.162,9835 ms; 5.178,0237 ms total),
  cobrindo snapshots nativos, máscaras, autorização, retry, ABA e Rules.
  PERMISSION_DENIED de escrita direta são esperados. JVM próprio 486064 encerrado.
- Typecheck passou; bundle isolado para navegador: 19 módulos, 62,80 kB,
  16,69 kB gzip, 78 ms. Lint/formatação/checks de documentação/arquitetura e
  diff conferidos no fechamento.

Fixture independente confere SHA e 131.072 bytes em três chunks nativos e dois
portáteis, cortando caractere UTF-8 na fronteira de arquivo. Inclui vazio,
53 versões, manual/restauração, composição central na mesma origem e segunda
passagem de inventário; adulteração de resposta/hash/endereço, conta e cancelamento.

Primeira seleção cliente teve seis falhas e 12 êxitos: digest local usava ordem
versionId/index, enquanto o nativo canonicaliza index/versionId. Corrigido cálculo
cliente; nenhum ID/writer alterado. Logs m75-* preservados na pasta QA externa.

## Revisão e pendências

Diff confere reader sem escrita, projeção fechada, índice/endereço canônico,
hash de parte e integral, estabilidade de manifesto, UTF-8 e encerramento.
Nenhum segredo, dependência, endpoint ou Rule novo. Não há bloqueador neste
recorte interno. Full validate de 158 não é atribuído a esse código posterior.

Próximo: bytes/provas de imagens, drafts, composição completa/segunda passagem,
validador semântico, UI e restauração/roundtrip. P2/P3/D, F2-09 e demais gates
permanecem abertos; contagem 8/35 preservada. Sem CI/push/PR/merge/deploy/subagentes.
