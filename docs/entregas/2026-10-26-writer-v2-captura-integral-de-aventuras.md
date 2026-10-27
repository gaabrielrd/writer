# Writer V2 — captura integral de aventuras

Registro técnico parcial do [plano 166](../tasks/writer-v2/execucao/166-composicao-integral-da-captura-de-aventuras.md).
Base: ef53647. [ADR 0188](../decisions/0188-adventure-complete-capture-stream.md).
O fechamento formal com wrapper verde permanece pendente, conforme resultado abaixo.

## Resultado implementado

Composição de oito seções reais, conferência de contagens e segunda passagem
de imagens, draft e inventário completo antes do footer de pacote. Container
próprio de aventura com guard em cada bloco, inclusive antes do selo final.
Prova captured-data-only não certifica semanticamente um arquivo externo ou
autoriza restauração. Nenhum novo endpoint, Rule, consumidor ou interface.

Congelamento de contribuição local compartilhado internamente; somente duas
provas de recurso são retidas para o draft escolhido. Metadata operacional fica
na prova em memória, sem ser serializada no arquivo. Não há escrita nas origens.

## Validações dirigidas

11/11 testes integrados positivos (738 ms; 2,65 s total), por produtores/readers
nativos e inspeção independente do envelope/container. Incluem oito seções,
três chunks históricos Unicode em duas partes portáteis, PNGs/grants separados,
draft local, importação nativa/ausências, perfil privado alterado sem rootclock,
geração, contagens, erro/retry, origem antiga, conta e cancelamento com RPC retido.
A troca de conta depois de package-end impede selo válido de container.

Typecheck inicial encontrou source indevido em verifyInventory; removido,
pois a origem vem da prova. Lint encontrou async sem await no observador:
agora aceita callback síncrono ou Promise, aguardado em ambos os casos.
Integração principal reconferida: 1/1 (163 ms; 2,36 s total); tipos passaram.

## Recursos da validação integral

Duas tentativas falharam no lint por memória: Node padrão em zone allocation;
limite temporário de 1.536 MiB falhou por heap. Nenhum desses resultados é verde.
O limite foi somente do subprocesso e não é configuração permanente.

npm run lint agora usa processos sequenciais por feature e src/test de Functions,
com passagem final da raiz excluindo somente diretórios já verificados. Preserva
configuração/ignores e arquivos novos/restantes, sem filtro Git, cache, dependência
ou regra reduzida. Pre-commit segue ESLint direto no escopo preparado.
Três testes reais de executor passaram (6.407,3797 ms): novo diretório, restante
da raiz, ignorados/nomes especiais/vazios, erro real, sinal e falha de spawn.
Import não usado do harness foi retirado e lint dirigido passou.

Uma tentativa posterior passou todo lint (32 processos), mas o frontend com
quatro workers sofreu NewArray allocation OOM. Árvore própria do runner Python
506752 foi conferida e encerrada; Vite e processos alheios preservados.
Execução seguinte usa VITEST_MAX_WORKERS=1 somente no subprocesso, conforme
suporte conferido no Vitest instalado, preservando cobertura e configuração.
Logs m78-* permanecem na pasta QA externa ao Git.

## Resultado da rodada completa e ajuste dirigido

A rodada com um worker terminou com exit 1: 319 arquivos/4.226 casos positivos
e um timeout, em 320 arquivos/4.227 casos, duração de 1.382,65 s.
Cobertura global: 89,94% statements, 85,71% branches, 91,12% functions e 93,24%
lines, acima dos limites inalterados. Não houve falha de asserção funcional.

O caso que percorre PNG de 8 bytes e 16 MiB levou 7.967 ms com cobertura e
ultrapassou o prazo padrão de cinco segundos. Somente esse teste recebeu prazo
de 30 segundos; nenhuma asserção ou código de produção mudou.
Seleção corrigida: 1/1 positiva (19 não selecionados), 2,74 s de teste e 4,89 s
total. As 4.226 aprovações anteriores e essa seleção são evidências distintas;
não constituem uma chamada verde de npm run validate.

Conforme orientação de executar somente testes necessários depois de ajustes,
a suíte de frontend de 23 minutos não foi repetida por esse prazo individual.
O fechamento formal com wrapper verde permanece para o próximo grande bloco.
Os demais checks integrais, ainda não alcançados pelo wrapper interrompido,
seguem separadamente: scripts, Functions/sintaxe e tipos/build/smoke.

## Checks restantes e revisão

90/90 scripts passaram (18.169,098 ms), 3.367/3.367 Functions passaram
(306.921,5298 ms), sem skips/falhas, e sintaxe de 318 módulos positiva.
npm run build passou com typecheck, 3.026 módulos, bundle em 2,34 s e smoke.
Avisos de chunks grandes/imports dinâmicos ineficazes permanecem avisos;
não foram ocultados ou convertidos em limites mais permissivos.

Bundle isolado da interface pública para navegador: 28 módulos,
107,98 kB, 26,37 kB gzip, 58 ms. Lint do único teste alterado após a rodada
completa e formatação/checks de docs/arquitetura/styleguide/diff positivos.

Diff revisto para fonte/provas/copias antes de await, encerramento das pontes,
ordem/contagens/manifestos, presença de todas as famílias e separação entre
captura e validação semântica. Runner libera parser por processo, sem omitir
diretórios, alterações novas ou configuração. Sem bloqueador funcional identificado
nesse recorte interno. Nenhum teste SDK/UI novo; readers/Rules e superfícies iguais.

Commit local parcial reúne o código e estas evidências. O wrapper verde
continua pendente; não declarar F2-09/P2 ou o grande bloco formalmente concluídos.

Leitor/validador semântico, índice/revisão, transporte/UI, restauração e roundtrip
continuam pendentes. P2/P3/D, F2-09, demais fases/gates e contagem 8/35 não mudam.
Sem CI/push/PR/merge/deploy/subagentes.

## Pendência formal encerrada — 2026-10-27

O validate integral de 167 terminou exit 0: 4.259 frontend, 90 scripts,
3.379 Functions, sintaxe/tipos/build/smoke. Inclui o timeout individual corrigido
em 166 e os contratos do validador novo. A chamada antiga permanece exit 1;
não é aprovação retroativa. A [evidência de 167](2026-10-27-writer-v2-validacao-semantica-de-aventuras.md)
registra a nova execução. Fecha o bloco técnico de captura/validação;
P2/P3/D, restauração/UI e demais gates continuam abertos.
