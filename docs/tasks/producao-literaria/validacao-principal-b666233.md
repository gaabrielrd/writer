# Validação após incorporar a principal b666233

## Base efetivamente testada

Worktree: `C:/Users/gaabr/.codex/worktrees/producao-literaria/writer`.
Branch: `codex/producao-literaria`.

Antes de executar os testes, foi feito fetch e incorporado `master` por fast-forward,
de `16d8af59f1e2739f1cf9a5b9e399212ea65438cd` para
`b66623310d487a6052148629d80125a0673e3e0f`. A atualização trouxe doze arquivos,
incluindo a direção de suporte desktop e a configuração visual correspondente.
A implementação literária foi guardada com arquivos não rastreados em stash e
reaplicada sem conflitos. O stash de segurança foi preservado.

O fetch de reconferência manteve `origin/master` em `16d8af5`; a principal local
`master` e a branch desta worktree permaneceram em `b666233`. Portanto, a base
inclui o commit local mais recente da principal. Alterações não commitadas que
continuaram chegando ao checkout original em `E:/Mega/dev/writer` foram preservadas
nesse checkout e não fazem parte desta base testada.

Não houve commit da implementação, integração de volta à principal, push ou deploy.

## Resultados

| Verificação                                    | Resultado                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Skills, arquitetura, documentação e styleguide | Aprovados no início da rodada                                                              |
| Formatação integral                            | Aprovada após correções; ajustes posteriores formatados pelo mesmo Prettier                |
| TypeScript                                     | Aprovado, incluindo reconferência após os ajustes dos mocks                                |
| Lint                                           | Grupos conferidos e arquivos com erros reconferidos; permanecem dois avisos de hooks       |
| Build e smoke do bundle                        | Aprovados                                                                                  |
| Sintaxe das Functions                          | 606 módulos aprovados                                                                      |
| Scripts                                        | 116/116 aprovados                                                                          |
| Frontend completo com cobertura                | 5.448/5.451 aprovados em 427 arquivos; três timeouts                                       |
| Reconferência dos casos frontend com timeout   | 6/6 aprovados, 23 casos não selecionados, sem mudar código, asserções ou timeouts          |
| Cobertura global                               | Statements 86,73%; branches 81,54%; functions **85,41%**; lines 90,12%                     |
| Backend completo                               | 5.652/5.665 aprovados; 13 falhas nessa execução                                            |
| Captura editorial após correções               | 49/49 aprovados                                                                            |
| Impacto, workflow e exclusão após correções    | 95/95 aprovados nos quatro arquivos consumidores                                           |
| Painel e hooks de impacto após ajustes         | 14/14 aprovados                                                                            |
| E2E Chromium sobre o bundle                    | 7/7 aprovados                                                                              |
| Visual dos fluxos afetados                     | 75/75 aprovados em desktop escuro, claro e sépia                                           |
| Impacto visual após ajuste da fixture          | 3/3 aprovados nos mesmos temas                                                             |
| Segurança dirigida com SDK real                | 12/12 aprovados em emulador separado, nos arquivos de captura editorial e marcador privado |
| Regras Firestore completas                     | Incompletas: timeout nativo de 30 minutos, exit 1, sem resumo integral                     |

A tentativa de `npm run validate` parou inicialmente na formatação. Os outros
checks foram executados separadamente para completar o diagnóstico. A execução
ampla e as reconferências dirigidas não constituem uma execução única integralmente
verde após todas as correções. O limite de cobertura de funções permanece **90%**;
não foi reduzido nem houve exclusão de arquivos para aprovar o gate. Não há
`npm run validate` verde.

Os três timeouts frontend foram de 20, 120 e 5 segundos. Os mesmos casos passaram
na reconferência com um worker, preservando seus limites originais. Isso é indício
de sensibilidade à carga concorrente, não prova de estabilidade na suíte completa.

A tentativa visual de todos os 798 cenários foi interrompida para conferir os fluxos
afetados. A execução aprovada selecionou `literary-`, `project-creation.visual.ts` e
`editor-adjustments.visual.ts`, mantendo a matriz desktop da principal. Os cenários
mistos de tela estreita existentes nesses arquivos também foram executados. Não há
aprovação de todos os 798 cenários nem da matriz opcional mobile.

## Correções da rodada

- Componentes passaram a usar a propriedade pública `label` de `LoadingState`.
- Foram corrigidos estreitamentos de tipos, IDs Unicode e mocks que precisam retornar promises.
- A captura da preparação passou a conferir `digest({ stateToken, gate })`, igual ao escritor nativo.
- O capturador preserva variáveis mutáveis de cabeça e estado durante a projeção.
- Fixtures de resolução usam IDs de check no formato fechado exigido pelo servidor.
- Os testes conferem a invalidação por metadata nativa e o incremento exato do clock de dependências, preservando os demais campos do livro e créditos.
- O helper de exclusão comporta as páginas de uma unidade do inventário ampliado, ainda com limite explícito de iterações; as asserções de revogação, limpeza integral e replay permanecem.
- Foram corrigidos declarações, parâmetros não usados e formatação apontados pelos checks.

Os dois avisos restantes do lint dizem respeito ao contador `epoch.current` no
cleanup de efeitos do acompanhamento de impacto. O contador invalida respostas
assíncronas tardias; os testes de troca de conta e cancelamento foram reconferidos.

## Evidências e limite do fechamento

Logs locais ignorados pelo Git em `.firebase/local-validation/principal-b666233-*`.
Os resultados completos e os dirigidos permanecem separados. O runner dirigido
usou cópia temporária do runner oficial com dois arquivos selecionados, mantendo
artefato verificado por SHA, timeouts e asserções; sua cópia foi removida após o uso.

Esta rodada cumpre a ordem de incorporar a principal antes dos testes. Não encerra
as cinco etapas do plano: o registro mantém **0/5 formalmente encerradas**. A
portabilidade editorial completa, restauração útil, auditoria dos aceites e gates
finais ainda exigem trabalho. Os produtores e a restauração editorial v2 continuam
fechados. Não há aprovação para publicação derivada destes resultados.

A conferência final não encontrou listeners nas portas 4177, 60615 e 61464 nem
processos Node/Java vinculados a esta worktree. Os servidores de teste e emuladores
desta rodada foram encerrados. `git diff --check` e a validação da documentação
passaram após consolidar este registro; HEAD e master permaneceram em b666233.
