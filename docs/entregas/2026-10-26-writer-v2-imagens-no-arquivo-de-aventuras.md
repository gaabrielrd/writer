# Writer V2 — imagens no arquivo de aventuras

Entrega interna parcial do [plano 164](../tasks/writer-v2/execucao/164-imagens-no-arquivo-de-aventuras.md).
Base: 10002be. [ADR 0186](../decisions/0186-adventure-image-data-stream.md).

## Resultado e revisão

Interface pública de adventure-portability captura bindings explícitos e PNGs
por recurso, com memória limitada, metadata preservada e SHA integral.
Principal/adicional com mesmo asset mantêm grants separados, repetindo bytes
sem deduplicação por ID. Arquivo não contém caminhos/URLs/tokens/gerações.

Segunda passagem verifica todos os vínculos e hash de Storage novamente,
comparando contagens/digests autoral e operacional. Não precisa guardar lista
inteira de tokens nem repetir os ranges no cliente. Prova images-data-only
não substitui inventário geral ou validação semântica/selo de arquivo.

Revisão conferiu whitelist fechada, metadados opcionais copiados, páginas
copiadas antes de await, ordem/IDs, limites, bytes/SHA/signature, cancelamento
e diferenças entre prova parcial e arquivo completo. Sem bloqueador nesse
recorte; sem novo endpoint, Rule, writer, dependência, segredo ou interface.

## Verificações

- Node: 37/37 (389,8917 ms), dois contratos novos e 35 regressões de readers.
- Vitest: primeira seleção 15 passes/uma falha em 16 casos (3.726 ms;
  5,85 s total). A falha era a expectativa de next pendente após return:
  contrato existente rejeita AbortError. Corrigida expectativa.
- Seleção de cancelamento e quatro novos casos: 5/5 (117 ms; 1,94 s total).
  Troca de membro com contagem igual foi refinada e passou em seleção própria
  (21 ms; 1,86 s total). São 20 casos distintos positivos nas seleções finais.
- Tipos e lint pertinentes passaram. Bundle isolado da interface pública:
  22 módulos, 74,93 kB, 18,97 kB gzip, 115 ms.
- Checks de docs/arquitetura/styleguide, formatação e diff conferidos no fechamento.

Corpus inclui 53 cenas, PNG de 8 bytes e 16 MiB, imagem compartilhada por dois
usos, fonte/inventário da composição central, hashes/respostas adulterados,
troca de geração sem mudar bytes, metadata da biblioteca sem rootclock, ABA,
revogação durante range, I/O/retry, intenção mutável, conta e RPC retido.
JVM/SDK/UI não foram executados novamente; backend/Rules não mudaram.
Não atribuir validate integral anterior a esse código. Integral ao fim do bloco.

## Continuidade

Faltam drafts explícitos, composição final/selo, validador semântico,
transporte/UI e restauração/roundtrip. P2/P3/D, F2-09, fases e gates permanecem
abertos, com contagem 8/35 preservada. Somente commit local, sem CI/push/PR/
merge/deploy/subagentes.
