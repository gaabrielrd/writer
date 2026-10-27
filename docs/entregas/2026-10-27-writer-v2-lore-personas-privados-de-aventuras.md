# Writer V2 — lore e personas privados da aventura restaurada

Data: 2026-10-27. Base: 648f63a.
[Plano 174](../tasks/writer-v2/execucao/174-lore-e-personas-da-aventura-restaurada.md)
e [ADR 0196](../decisions/0196-adventure-private-lore-persona-staging.md).

## Implementado

A passagem interna prepara pares nativos de lore e tombstones, conserva texto/
datas/aliases/relações e remapeia os vínculos próprios. Identidade usa o nascimento
nativo comum da raiz/job; a definição privada recebe loreVersion e cada ficha
reinicia revision em 1. Corpo e head vivos nascem juntos mesmo fora da ordem de
arquivo. Tombstone não recebe corpo; corpo inesperado é recusado.

Perfis completos e bindings explícitos de personas ficam privados no job,
deduplicados por hash/ensure comprovado. Conferência do binding usa a definição
ou scene head já comprovado. Null permanece explícito; presets também viram
snapshots privados com novo ID. Não cria aiPersonas nem contorna sua disponibilidade.
Integrar biblioteca antes da ativação ainda é obrigatório.

Lookup de lore e suas provas são reconferidos na transação que consome a unidade.
Novos endereços/recibos/metadados/limpeza preservam jobs e operações anteriores.
A view expõe somente contagens; profiles-ready mantém raiz sem ownerId e
countReady false. Nenhum endpoint, grant ou UI foi criado.

## Testes dirigidos

56 Node positivos numa seleção de 10.062,129 ms: 11 novos e regressões de
recursos/estrutura/transporte/validação. Essa chamada antecede a correção da
escrita sem mudança e os dois últimos casos novos.

Depois da correção, 26 Node positivos em 9.838,811 ms: 13 novos de profiles e
13 de recursos, incluindo pares/tombstones/identidade/relações, ordem invertida,
dedupe/null, replay/concorrência, rollback/retry, cancelamento durante I/O,
índice/target/journal adulterados, estrangeiros, metadata fechada, preservação
do journal numa escrita idêntica e orçamento nativo após remap.

O fixture próximo do limite tem entidade semanticamente válida de 899.900 bytes.
O remapeamento amplia as relações e excede o orçamento nativo; a escrita recusa
sem truncar ou criar meio par, preservando checkpoint e permitindo cancelar.
Esse caso passou inicialmente em seleção própria de 1.122,855 ms.

Dois Vitest novos positivos com lore/personas alterados pelos serviços reais
antes da captura do Writer, 4,44 s totais/2,07 s de testes. Contêm três heads,
dois corpos, tombstone, relação local, binding null e duas cenas usando o mesmo
snapshot com overrides. Conferem contrato nativo, perfil completo e cleanup.

Regressão Vitest após a correção: 11 casos positivos em três arquivos, 14,05 s
totais/10,04 s de testes, incluindo estrutura e recursos do incremento anterior.

SDK: o caso de rollback/concorrência passou na primeira chamada em 94.475,501 ms.
Os dois casos atingidos foram repetidos e passaram em chamada própria de
209.066,992 ms, comprovando pares/identidade, persona deduplicada e privada,
negação de SDK a dono/terceiro/anônimo, cleanup integral e recusa de persona
adulterada sem removê-la. São três casos distintos positivos em seleções; a
primeira chamada completa não foi verde. Ambas as JVMs próprias foram encerradas
pelo finally.

## Revisão e correções

A primeira rodada SDK terminou com um caso positivo e dois negativos em
290.371,948 ms. Rollback/concorrência reais passaram; os dois casos que chegavam
ao binding falharam na prova do target. O SDK conservou a versão de uma
substituição idêntica da definição, enquanto o journal avançava para outra operação.

Foi acrescentado um teste RED que exigia preservar o journal/metadata nesse caso.
Agora o helper de atualização prova o valor anterior e pula a mutação idêntica,
preservando journal, criador e versão nativa; o checkpoint e os demais efeitos
ainda avançam atomicamente. O novo teste, os 26 Node acima e os dois SDK atingidos
passaram após a correção, sem declarar a tentativa antiga verde.

A revisão fechou também campos de profiles em fases anteriores: metadata privada
não pode incluir contadores que a view ainda não permite. O teste confirma recusa
antes de retornar conteúdo. Um teste de adulteração foi ajustado para escrever
pela transação do double, alterando a versão nativa como o Firestore real.
O import não utilizado da fixture SDK foi removido após a falha de lint.

## Checks e limites

Sintaxe de 346 módulos de Functions positiva, ESLint dos 13 módulos/testes, formatação do escopo de 18
arquivos e checks de documentação/arquitetura/styleguide/diff acompanham o
fechamento. O preflight verifica escopo/HEAD/index, UTF-8/LF, tamanho e marcadores
de segredo; hashes de bytes e hooks normais conferem o commit local.
Nenhuma dependência, permissão SDK, configuração de testes ou callable novo.

Sem novo validate integral, build, browser/a11y ou Node 22 neste incremento.
O verde integral de 170 é base anterior; manter testes dirigidos após ajustes e
rodada integral no fechamento do bloco maior de montagem, conforme o operador.

Universo autorizado, integração de personas, histórico/draft separado, mídia,
agregados/audit/ativação, recuperação cifrada/UI e roundtrip continuam obrigatórios.
P2/P3/D/F2-09, gates humanos/comerciais e contagem macro 8/35 não mudam.
Somente commit local com hooks normais; sem CI/push/PR/merge/deploy/agentes.
