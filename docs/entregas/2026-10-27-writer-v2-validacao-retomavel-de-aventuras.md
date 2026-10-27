# Writer V2 — núcleo retomável da validação de aventuras

Data: 2026-10-27. Implementação interna com validação dirigida.
Base 96c6864; [plano 168](../tasks/writer-v2/execucao/168-validacao-retomavel-do-arquivo-de-aventuras.md),
[ADR 0190](../decisions/0190-adventure-resumable-content-validation.md).

## Implementado

prepareAdventureRestoreValidationStep reabre estado limitado e executa um frame,
uma unidade JSON ou até 64 relações. Preserva sourceSize, fases/counts, parser,
máquina, hash serializado e spans; não guarda prosa nem bytes no checkpoint.
Estado recebido não é mutado. Host fornece fonte imutável/verificada e buffer
transacional; o módulo não autoriza/persiste nada sozinho.

JSON recebido é acumulado por SHA e relido por posições com comparação antes
do uso semântico. Ponteiros de até 16 KiB mantêm SHA e cursor/layout/manifesto raw.
readAdventureValidationItem confere posições/bytes/SHA e vínculo do manifesto
com o JSON. Não admite omitir raw de cabeçalho que carrega texto/PNG.

O relatório stepped-content-only só sai depois de EOF/envelope e todas as
relações. Não concede propriedade/acesso, autentica job ou certifica grant.
O futuro coordenador precisa de provas imutáveis dos bytes, hash/birth/operação/
checkpoint e commit atômico; buffer falho deve ser descartado antes do retry.

## Testes efetivamente executados

20 Vitest distintos positivos em seleções, no ambiente Node, usando produtores/
leitores reais e arquivo nativo. Incluem:

- Comparação do relatório com o leitor contínuo de 167; engine nova e checkpoint
  serializado em cada passo; reabertura dos itens por SHA.
- Histórico com UTF-8 dividido, PNGs por recurso, draft separado e corpos vazios.
- Aventura vazia, cena arquivada e importação com filhos anteriores à ativação.
- 53 cenas, relações em múltiplos lotes, índice/item sem duplicação.
- JSON exato de 8 MiB/128 partes reaberto; primeiro byte excedente recusado.
- Arquivos com framing/manifestos reparados e conteúdo inválido; truncamento,
  short-read, tamanho mudado e alterações entre frame e releitura.
- Buffer com falha após escrita descartado, retry do mesmo checkpoint e fonte/
  read/signal/factory mudados durante espera, sem trocar a intenção original.
- Contadores/posições/envelope corrompidos e raw omitido/substituído.

O harness confere até 131 reads por chamada, leitura individual até 80 KiB
(payload mais metadata), checkpoint até 64 KiB, entrada de índice/item até
16 KiB, até um item e 96 escritas por lote. São limites do núcleo, não medição
de latência/quotas de Firestore em produção.

Primeira rodada: oito positivos/um erro de fixture, que usava sceneId inexistente
em vez de resource fornecido pelo histórico. Corrigida a fixture, seleção própria
passou (310 ms). Outra seleção tentou mutar a factory real, que é congelada;
o teste passou a usar um port mutável que delega à factory real, preservando a
asserção de intenção. Seleção própria final passou (57 ms).
Não foram enfraquecidos os contratos ou limites de produção.

As dez adições de fronteira passaram em 2,22 s de testes/4,30 s total;
seleção final de cinco após revisão de ponteiros/hash passou em 1,24 s/3,30 s.
A reabertura reforçada de histórico/draft/PNG e recusa de identidade trocada
passou em 323 ms/2,86 s total. São execuções distintas, não uma suíte global.

## Checks e revisão

Lint dirigido e formatação positivos. Sintaxe de 324 módulos positiva.
Revisão conferiu fonte e ports fixados, buffer descartável, releitura/SHA,
lookahead, contagens, EOF, ponteiros obrigatórios e vínculo de manifesto,
limites, abort e ausência de escrita autoral/credenciais/concessão de acesso.
Checks finais de docs/arquitetura/styleguide/diff acompanham o commit.

Nenhum arquivo TypeScript de produto, UI, endpoint ou Rule foi alterado.
Não houve novo SDK, navegador, build ou validate integral neste incremento.
O validate verde de 167 é a base anterior; o próximo bloco maior terá nova
validação integral conforme orientação de testes necessários durante os ajustes.

## Pendências preservadas

Reserva/upload e coordenação remota com fonte/índice persistentes, limpeza,
revisão e recuperação, remap/mídia/draft em versão separada, ativação privada,
interface, roundtrip e consumidores. Resolver nascimento da raiz antes do
histórico sem expor projeto incompleto. Este núcleo não é restauração utilizável.

P2/P3/D/F2-09 e gates humanos/comerciais continuam abertos. 8/35 permanece a
contagem de tarefas, sem estimativa por esforço. Somente commit local com hooks
normais; sem CI/push/PR/merge/deploy/subagentes. Servidor local preservado.
