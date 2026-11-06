# Validação após integração da principal — 2026-11-03

A principal foi incorporada à branch local `codex/producao-literaria` até
`16d8af59f1e2739f1cf9a5b9e399212ea65438cd`, preservando as alterações literárias locais.
A suíte completa desse commit passou em todos os testes. O processo reprovou somente o limiar de cobertura de funções do frontend: 86,32% diante dos 90% exigidos.
Os cenários afetados da rodada visual foram reconferidos após corrigir o mapeamento de contexto editorial da prévia.

## Integração

A principal avançou durante os testes. Foram incorporados, por fast-forward,
`296261c`, `e86a547`, `2b65552`, `f1bbfed`, `cc92d1b` e `16d8af5`. As trocas anteriores
preservaram o trabalho em stash. As duas últimas atualizações atingiram somente caminhos
previamente limpos, sem sobrepor o trabalho local. Nenhuma cópia de segurança foi removida.
O checkout principal permaneceu sob trabalho do operador, com suas alterações próprias
preservadas.

A combinação automática duplicou um import em `adventureRestoreCallable.rules.test.mjs`.
O lint detectou o problema; removida a duplicata, o arquivo ficou idêntico à principal
e passou em sintaxe e ESLint. A combinação de `ReaderView.module.css` preservou os
recuos do assistente e os estilos locais do guia literário.

## Correção da prévia visual

A rodada ampliada encontrou seis falhas no mesmo cenário de seleção, uma por combinação
de tema/tela. O envio consultava o serviço de contexto editorial, que ainda não estava
mapeado na configuração visual, e alcançava o bloqueio de Firebase real da prévia.

Foram ajustados `vite.visual.config.ts`, uma nova fixture de escrita e a especificação
de seleção. A fixture representa somente um capítulo próprio sem contrato nem planos,
retorna a ausência de contexto prevista pelo servidor e recusa contextos configurados.
O cenário também confere os IDs e o modo da consulta. O bloqueio a Firebase real foi
preservado. Esta fixture não prova autorização nem contexto configurado de produção.

A reconfirmação passou 42/42 testes em 2,4 minutos e cobre os ajustes do editor, colaboração e sequência nas seis combinações,
preservando as asserções de contraste, posição, aceite, texto e teclado. Os artefatos da
primeira rodada foram mantidos; a reconfirmação usa `visual-test-results/context-fix`.
As seis variantes antes reprovadas passaram. Há repetição de cenários entre as rodadas:
os 108 e os 42 não formam uma suíte de 150 testes distintos. As prévias mobile de
seleção após autosave e paginação do leitor também foram inspecionadas visualmente.

Em `cc92d1b`, a principal alterou somente a camada CSS do divisor e sua documentação.
Foram repetidos o build e três cenários de arraste, cancelamento e preservação do
workspace nos seis projetos: **18/18 aprovados**. O código de produção instrumentado
pela cobertura permaneceu idêntico ao de `e86a547`.

O commit `16d8af5` alterou depois a guarda de foco de `NarrativeOperationDialog` e
reforçou seu teste de correção de erro. A feature narrativa passou **81/81 testes em
cinco arquivos**, e o build completo desse commit passou. Como houve mudança TSX,
a suíte completa foi repetida exclusivamente nesse commit fixado: **5.397/5.397 testes,
420/420 arquivos, 871,49 segundos**. A tabela e a cobertura abaixo usam essa medição nova.

## Resultados locais

| Verificação                                 | Resultado                                        | Base e alcance                                                                    |
| ------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------- |
| Frontend completo                           | 5.397/5.397 testes, 420/420 arquivos             | Execução completa no commit fixado `16d8af5`, com as alterações literárias locais |
| Testes dos últimos ajustes                  | 60/60 testes, três arquivos                      | `f1bbfed`: preparação de lore, ChapterChatPanel e GhostSuggestion                 |
| Feature narrativa                           | 81/81 testes, cinco arquivos                     | `16d8af5`: guarda de foco e demais regressões da feature                          |
| TypeScript, bundle e smoke                  | Aprovados                                        | Build de `16d8af5`; tipos reconferidos após a correção da prévia                  |
| Divisor do workspace                        | 18/18 testes Chromium                            | `cc92d1b`: arraste, cancelamento e preservação de texto/seleção nos seis projetos |
| Chromium                                    | 108/114 na rodada inicial; 42/42 após a correção | `f1bbfed`: fluxos literários, leitor público e interações do editor               |
| Scripts de setup/validação                  | 116/116 testes                                   | Executados em `296261c`; fontes idênticas até `16d8af5`                           |
| Regressão de Functions                      | 17/17 testes; sintaxe de 577 módulos aprovada    | Executados em `296261c`; fontes idênticas até `16d8af5`                           |
| Firestore Rules dirigidas                   | 41/41 testes, dez arquivos                       | Shard 9/16; executado em `296261c`, fontes idênticas até `16d8af5`                |
| Arquitetura, documentação, estilo e formato | Aprovados nas conferências registradas           | Novos arquivos reconferidos após cada incorporação                                |

Os números são escopos diferentes: não devem ser somados como uma suíte única.
A regressão de Functions cobre `adventureRestoreImageStorage`; não representa uma
nova execução completa de Functions. A suíte completa anterior de 5.382 testes pertence
à base `1bc6ba8` e está preservada no registro cronológico.

Entre `e86a547` e `cc92d1b` não houve alteração nos arquivos de produção `.ts`/`.tsx`
de `src`, em Functions, scripts ou Rules. Os últimos ajustes foram CSS, helpers/testes
visuais, documentação e o prazo de um teste de cifragem de 20 para 60 segundos,
preservando seu volume e suas asserções. A medição global acima continua identificada
com sua base original; os testes afetados e o build foram repetidos na base final.

## Cobertura que reprova o gate

Medição completa do commit fixado `16d8af5`, com Node 24.21.0 e Vitest 5.1.0:

| Métrica             | Medição                   | Limiar  |
| ------------------- | ------------------------- | ------- |
| Statements          | 87,52%                    | 85%     |
| Branches            | 83,01%                    | 75%     |
| Funções do frontend | **86,32% — 9.318/10.794** | **90%** |
| Linhas              | 90,65%                    | 85%     |

Todos os testes dessa execução passaram; o processo terminou com código 1 pela
cobertura de funções. Os limites não foram reduzidos. As sete falhas por timeout da
primeira rodada desapareceram nas execuções completas seguintes, com os ajustes
da principal e sem outra suíte pesada concorrendo com a cobertura.

O comando integral `validate` não está aprovado. A tentativa em `296261c` parou no
import duplicado; após a correção, suas etapas foram conferidas separadamente, e as
execuções completas de cobertura continuaram reprovando o limiar de funções.

## Evidências e limites

Logs em `%TEMP%`:

- `writer-literary-master-16d8af5-coverage.log`: suíte completa e cobertura finais.
- `writer-literary-master-f1bbfed-affected.log`: 60 testes dos últimos ajustes.
- `writer-literary-master-f1bbfed-build.log`: build de produção.
- `writer-literary-master-f1bbfed-browser.log`: rodada ampliada com a falha de fixture.
- `writer-literary-master-f1bbfed-browser-context-fix.log`: reconfirmação após a correção.
- `writer-literary-master-f1bbfed-typecheck-final.log`: tipos após a correção visual.
- `writer-literary-master-cc92d1b-build.log` e `writer-literary-master-cc92d1b-resize.log`: build e divisor após a última incorporação.
- `writer-literary-master-16d8af5-narrative.log` e `writer-literary-master-16d8af5-build.log`: foco e build no commit fixado.
- `writer-literary-master-296261c-scripts.log`, `functions-regression.log` e `rules9.log`: provas dirigidas preservadas. Os dois últimos nomes também usam o prefixo completo `writer-literary-master-296261c-`.

A suíte completa de Rules da primeira base foi interrompida antes de trocar os arquivos;
não teve resumo final e não é registrada como aprovada. Os testes de navegador usam
fixtures locais, e as Rules usam somente emulador demo. Estes resultados não constituem
smoke autenticado em produção nem aprovação remota de CI.

Todos os processos de testes conhecidos terminaram; Playwright e o runner de Rules encerraram seus serviços locais. Não houve commit do trabalho literário, push, integração de volta à principal ou deploy.
Esta rodada não fecha as cinco etapas do [plano integral](plano-integral.md): permanecem
os aceites funcionais registrados, incluindo a política de publicação prévia e o
fechamento de E5, além da cobertura. O objetivo integral continua ativo, com 0/5 etapas
formalmente encerradas.

O histórico detalhado de cada base está no
[registro cronológico de validação](validacao-local-2026-11-02.md).

## Alterações posteriores ao snapshot da cobertura

O [incremento 15](15-unidade-de-publicacao.md) acrescenta a unidade tipada de publicação
sobre a mesma base16d8af5. Seus testes dirigidos passaram:67 servidor e14 interface,
com reconfirmação6/6 após correção de tipos dos testes; typecheck e lint dirigido verdes.
A medição5397/5397 e a cobertura86,32% acima pertencem ao snapshot anterior às mudanças
do incremento15. Não houve nova cobertura integral ou build após este incremento.
O gate global continua aberto, sem integração de volta ou deploy.
