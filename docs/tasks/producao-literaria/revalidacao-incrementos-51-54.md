# Revalidação com a principal — incrementos 51–54

## Base conferida antes dos testes

Em 2026-11-04, na worktree `C:/Users/gaabr/.codex/worktrees/producao-literaria/writer`,
branch `codex/producao-literaria`, foram executados `git fetch origin`,
`git merge --ff-only master` e `git merge --ff-only origin/master`. Os dois merges
retornaram `Already up to date`. HEAD e master local estão em
`b66623310d487a6052148629d80125a0673e3e0f`; origin/master está em
`16d8af59f1e2739f1cf9a5b9e399212ea65438cd`, ancestral da principal local.
A comparação HEAD...master é 0/0; master...origin/master é 1/0.

As 48 entradas não commitadas de `E:/Mega/dev/writer` foram preservadas no
checkout original e não copiadas. A equivalência entre commits não equivale
a igualdade dos arquivos não commitados. A worktree de implementação tinha
495 entradas locais antes deste registro. Não houve commit, merge de volta
à principal, push ou deploy. Nenhum código foi alterado nesta rodada.

## Resultados confirmados

- Node 24.21.0; npm 10.6.0.
- Skills, arquitetura, documentação e styleguide: aprovados.
- `npm run validate`: reprovado na formatação de 41 arquivos. As etapas
  posteriores não foram alcançadas por esse comando.
- `npm run typecheck`: reprovado em três erros: componente
  `BookEditorialHistoryBrowser` ausente e dois usos de `LoadingState.message`,
  enquanto a interface pública desse componente aceita `label`.
- `npm run lint`: reprovado no lote book-portability, cinco erros no journal
  de recuperação (quatro rejeições de Promise sem Error e uma atribuição any)
  e quatro avisos nos componentes novos. O runner parou nesse lote; não há
  aprovação dos lotes seguintes.
- Scripts: 116/116 aprovados.
- Sintaxe das Functions: 637 módulos aprovados.
- Functions: 5.963 testes executados; 5.959 aprovados e quatro reprovados;
  zero cancelamentos e zero casos pulados. Duração aproximada de 12 minutos.
- Frontend: 5.480/5.480 testes aprovados, 429 arquivos; duração de 1.067,14 s.
  O comando com cobertura retornou exit 1: functions 85,17%, abaixo de 90%.
  Statements 86,55%; branches 82,23%; lines 89,92%. Limites preservados.
- Rules completas: exit 1 por timeout original de 30 minutos, sem resumo
  integral. Antes do timeout foram registradas duas falhas em
  `bookEditorialRestoreReview.rules.test.mjs`: reconciliação com limpeza dos
  stores e CAS/revogação/concorrência de aceites. Sem a conclusão do runner,
  não há diagnóstico final dessas duas falhas nem aprovação dos casos restantes.
  Mensagens PERMISSION_DENIED de asserções negativas não foram contadas como
  falhas por si só. O limite de tempo não foi aumentado.
- Build e navegador: não executados nesta rodada; o erro de TypeScript e o
  import ausente impedem considerar o bundle e a interface prontos.

## Quatro falhas de Functions

1. `bookEditorialRestoreReview.test.mjs:200`: limpeza do livro restaurado
   chamada sem iniciar antes o protocolo de exclusão.
2. `bookRestoreEditorialActivation.test.mjs:201`: mesma pré-condição de exclusão
   ausente. Ambas foram reproduzidas isoladamente; o servidor responde
   failed-precondition, sem relaxamento da proteção.
3. `domainCallable.test.mjs:17`: espera 453 ações, enquanto o registro contém 461.
4. `domainServices.test.mjs:14`: verificação de destinos ainda não reconhece
   os oito métodos editoriais de bookPortabilityApi. A falha também foi
   reproduzida isoladamente com os testes de domínio.

Nenhuma expectativa, fixture, regra ou limite de cobertura foi alterado para
transformar esses resultados em aprovação. O painel do incremento 54 permanece
incompleto e sem comprovação funcional; a suíte geral não substitui os testes
de recuperação e interação específicos ainda pendentes desse incremento.

## Evidência e limite

Logs locais ignorados em `.firebase/local-validation/current-main-54-*`:
validate, types, lint, scripts, syntax, functions, domain-failures, frontend e rules.
Resultados anteriores de 5.898 Functions e 5.480 testes frontend não validam
os incrementos 51–54. Não há validate integral verde nem evidência
para declarar a integração final pronta. As cinco etapas continuam abertas.

## Encerramento da rodada

Todas as sessões de comandos iniciadas nesta rodada terminaram. O listener do
emulador Firestore na porta 58745 foi encerrado. Não foi iniciado servidor de
interface nem navegador. O código permaneceu inalterado durante os testes;
este relatório e o registro de continuação são a única edição desta rodada.

Próximo trabalho: concluir o painel 54, corrigir tipos/lint/formatação e contratos
de teste/destinos, investigar as duas falhas SDK, completar sua cobertura de
comportamento e segurança e repetir os gates afetados. Não habilitar o fluxo
público de arquivo v2, não declarar as cinco etapas concluídas nem integrar
a implementação à principal com base nesta rodada reprovada.
