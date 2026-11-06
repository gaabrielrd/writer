# Incremento 19 — Interface de política e inspeção de entrada

## Estado

Em implementação, sem testes ou validações executados neste incremento. O turno anterior
foi progresso (núcleo de admissão/publicação integral). O objetivo integral segue aberto.
Não há liberação, commit, integração de volta, push ou deploy.

## Comportamento implementado no código

O contrato opcional permite escolher a exigência de publicação antes de avançar. A
escolha é preservada entre capítulo e ato; livro inteiro remove a exigência interna
com explicação explícita. Comparação remota e histórico mostram a condição. A proposta
continua sendo rascunho até salvar/confirmar pelo fluxo existente.

O painel de preparação encaminha o contrato salvo ao ciclo. Contrato indisponível ou
exigência sem inspeção escolhida bloqueiam novo registro; pedido original incerto
continua com seu input congelado. O servidor permanece responsável pelo aceite.

O novo painel de inspeção consulta edições confirmadas por páginas, permite iniciar
uma inspeção de ordem/edição, consultar o mesmo ID, conferir uma página por ação e
escolher a prova ready após nova consulta. Abrir o painel não faz chamadas remotas.
Selecionar um resultado não registra nem executa o ciclo. Primeiro capítulo e
continuação dentro do ato têm explicações próprias; edição ausente em uma fronteira
não é promovida a autorização. O ciclo mostra a condição e o ingresso registrados.

A consulta de ciclos anteriores usa o agrupamento autorizado da inspeção selecionada,
sem chamar scope antes de fornecer a admissão que esse próprio scope exige. A ordem,
origem e o predecessor continuam reconferidos no servidor.

## Acompanhamento local

O adaptador guarda somente version, actorId, bookId, chapterId, inspectionId e
publicationId, isolados por conta/livro/capítulo. Reserva sob Web Lock curto antes de
start; nenhum lock atravessa HTTP. Formato fechado e comparação integral recusam
sobrescrever acompanhamento concorrente ou remover outro ID. Dados malformados são
preservados para recuperação, sem limpeza silenciosa. Não guarda prosa, chave, cursor
ou aprovação. Acompanhamento persistido não é rascunho editorial pendente por si só;
a escolha não registrada e chamadas ativas são informadas ao host.

Resposta perdida oferece consulta e repetição explícita do mesmo início. Cancelamento
usa metadata nativa atual; remoção local exige consultar encerramento confirmado e
comparar o registro inteiro. Consultar/reabrir nunca avança automaticamente.

Encerrar uma inspeção completa bloqueia novas entradas. Para um ciclo que já consumiu
a prova, o leitor interno aceita o certificado preservado mesmo depois do encerramento,
reconferindo origens. entered continua sendo dado privado do ciclo, não parâmetro RPC.

## Pendência importante de recuperação antes de integrar

O start atual ainda não recebe uma prova congelada da encarnação do livro/capítulo
obtida antes da reserva local. Antes de concluir este fluxo, acrescentar scope metadata
nativo à inspeção e fixar seu token no write-ahead/start/replay. Uma repetição antiga
não pode iniciar inspeção de um livro recriado com os mesmos IDs. Também compor o
cancelamento de início incerto ainda sem registro nativo observado; hoje a interface
só encerra depois de obter uma inspeção existente. Não permitir limpar a intenção por
simples not-found, pois o start original pode estar em trânsito.

## Testes preparados

- Adaptador: metadados restritos, isolamento, reserva concorrente, CAS de remoção,
  corrupção e ausência de Web Locks.
- Interface: abertura sem RPC, write-ahead antes de start, página por ação, retomada
  somente por consulta, escolha explícita, mesmo início após resposta perdida e
  remoção apenas após encerramento fresco.
- Proposta: exigência escolhida pelo autor e preservação entre capítulo/ato sem perder
  premissa, com explicação ao escolher livro inteiro.
- Host: novo ciclo bloqueado antes de escolher inspeção quando a exigência está ativa.
- Servidor: encerramento de inspeção ready bloqueia novo ingresso e conserva prova
  já consumida pelo ciclo. Nenhum destes testes foi executado neste turno.

## Próximos passos

Priorizar a pendência nativa de recuperação acima. Depois integrar seleção/admissão
por unidade ao driver e à interface de sequências, com parada de publicação distinta.
Completar casos de concorrência/ator/revogações, revisão de interface e validação no
fechamento. Continuam os aceites E1–E4 e E5 impacto/portabilidade editorial .writer
como nova cópia privada, além da cobertura global de funções de pelo menos 90%.
