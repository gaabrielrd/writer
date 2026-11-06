# Validação após conferência da principal — 2026-11-03

## Base e preservação

Worktree: `C:/Users/gaabr/.codex/worktrees/producao-literaria/writer`.
Branch: `codex/producao-literaria`.

Antes dos testes, `git fetch origin master` confirmou que HEAD, `master` e
`origin/master` apontavam para `16d8af59f1e2739f1cf9a5b9e399212ea65438cd`.
`git merge --ff-only master` retornou `Already up to date`.
A principal consolidada já estava incorporada; não houve novo commit de merge.
Uma nova conferência por fetch ao fim da rodada confirmou os mesmos três heads.
As alterações literárias locais e os documentos não commitados na worktree da
principal foram preservados. Não houve commit, integração de volta, push ou deploy.

## Resultados desta rodada

| Verificação                                    | Resultado                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Skills, arquitetura, documentação e styleguide | Aprovados antes dos testes                                                                                         |
| Formatação completa                            | Aprovada após corrigir 51 arquivos indicados                                                                       |
| TypeScript                                     | Aprovado após as correções, incluindo nova conferência final                                                       |
| Lint                                           | Todos os grupos conferidos; execução particionada retomada após correções, mais reconferência dos últimos arquivos |
| Diff / whitespace                              | `git diff --check` aprovado                                                                                        |
| Frontend completo com cobertura                | 5.422/5.422 testes, 423/423 arquivos; comando saiu com erro de cobertura                                           |
| Cobertura                                      | Statements 87,48%; branches 82,92%; functions **86,24%**; lines 90,61%                                             |
| Functions completas                            | 5.431/5.436 aprovados; cinco falhas em helpers de testes recentes                                                  |
| Consumidores dos helpers após as correções     | 91/91 aprovados nos quatro arquivos consumidores dos helpers                                                       |
| Componentes após as correções                  | 50/50 aprovados em cinco arquivos afetados                                                                         |
| Scripts                                        | 116/116 aprovados                                                                                                  |
| Sintaxe Functions                              | 585 módulos conferidos                                                                                             |
| Build e smoke do bundle                        | Aprovados                                                                                                          |
| E2E Chromium / bundle                          | 7/7 aprovados                                                                                                      |
| Visual afetado                                 | 150/150 aprovados; desktop/celular, claro/escuro/sépia                                                             |
| Regras Firestore completas                     | Incompletas: encerradas pelo limite nativo de 30 minutos, exit 1                                                   |
| Regras literárias dirigidas                    | 6/6 aprovados em emulador isolado; não substituem a suíte completa                                                 |

O mínimo de cobertura de funções continua **90%**. Não foi reduzido nem houve
exclusão de arquivos para aprovar o gate. Portanto, **não há `npm run validate`
verde**. As tentativas do comando agregado pararam inicialmente em formatação
ou lint; os gates restantes foram executados separadamente para completar o
diagnóstico. Os resultados acima não constituem uma execução única integralmente
verde depois de todas as correções.

## Correções feitas durante os checks

- O painel de sequência agora guarda o capítulo de entrada antes de acessar seu ID.
- O estado da admissão é inicializado por leitura local e reiniciado pela identidade
  da conta/livro/capítulo e revisão do contrato; a sequência reinicia seus seletores
  quando muda o escopo, sem `setState` síncrono em efeitos.
- Foram corrigidos imports e asserções de tipo, `prefer-const` e callbacks sem await.
- O helper da preparação usa a revisão retornada pelo servidor, inclusive em no-op,
  separada do contador usado nos IDs das operações.
- Inspeções de capítulos distintos recebem IDs distintos no helper de workflow.
- O mock visual passou a exportar a consulta editorial, usando o compositor canônico.

A primeira execução visual foi interrompida após encontrar o export ausente no
mock. A repetição completa dos fluxos visuais afetados terminou com 150 aprovados.
As falhas de Functions foram corrigidas nos helpers; a suíte inteira não foi
repetida: primeiro os 73 testes dos dois arquivos afetados foram reconferidos e, em seguida,
os 91 testes dos quatro consumidores dos helpers passaram integralmente.
A suíte frontend completa terminou antes da reconferência dirigida de 50 testes.

## Evidências locais

Logs em `.firebase/local-validation/literary-final-*` nesta worktree, incluindo
`frontend.log`, `backend.log`, `backend-recheck2.log`, `frontend-recheck.log`,
`backend-consumers.log`, `visual-retry.log`, `rules.log`, `rules-directed.log`, `build.log`, `scripts.log` e os gates de lint/tipos.
São evidências locais ignoradas pelo Git; este documento conserva os resultados.

## Limite da entrega

Esta rodada valida o estado implementado; não encerra as cinco etapas do plano.
Continuam pendentes o impacto completo com orquestração/interface, a portabilidade
editorial `.writer`, a auditoria dos aceites restantes e o mínimo de cobertura.
O registro de execução mantém **0/5 etapas formalmente encerradas**.

## Encerramento das regras

O runner completo terminou com `Os testes de regras excederam trinta minutos.`
Não houve resumo integral de aprovação. As recusas `PERMISSION_DENIED` nos logs
fazem parte de asserções de segurança; não foram contadas como falhas por si só.
As três famílias novas de regras (architecture, impact e workflow) foram
reconferidas separadamente: seis testes aprovados no emulador oficial com SHA
verificado. Esse resultado dirigido não promove a suíte completa a verde.
O timeout e o runner dirigido encerraram seus emuladores/árvores de processos.
A conferência final não encontrou listener nas portas dos testes nem workers
Firestore desta worktree. Não ficou comando de validação ativo.
