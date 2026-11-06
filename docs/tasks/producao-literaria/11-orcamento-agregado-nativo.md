# Núcleo nativo de escopo e orçamento agregado — E4

Incremento servidor de coordenação entre capítulos. A worktree incorporou a principal
1bc6ba8 (onboarding e assistente persistente) após preservar o trabalho literário no stash
06deab0df63d5a4444df66fd4a79eaaa2defff67. O checkout original da principal e seus arquivos
não commitados permanecem separados. Nenhuma integração de volta ou publicação nossa.

## Implementado

literarySequence.mjs cria um registro privado com capítulos nativos ordenados, ator,
nascimento do livro, modo/revisão de E1, orientação, modelo/raciocínio e limites totais.
A consulta metadata fixa o scopeToken antes do registro. Duas transações separam registro
pendente de ativação pelo nascimento real. A reserva em literaryOperations impede
recriar o mesmo registro após sua retirada; confirmação/cancelamento explícitos tratam
registro interrompido, sem produzir conteúdo.

O núcleo aceita um lote de até25 capítulos por registro. Esse limite mantém o manifesto
metadata e a reconferência transacional limitados; não impõe quantidade de capítulos,
atos ou palavras ao livro. Seleções maiores e seus checkpoints precisam conservar a
mesma autorização/orçamento por protocolo paginado ou lotes explicitamente autorizados;
não promover este limite interno a estrutura narrativa obrigatória.

workflowHooks é capacidade interna, nunca DTO HTTP. O hook confere a unidade atual,
origem, orientação, snapshot de geração e saldo restante e vincula a criação do ciclo na
mesma transação. Não pode adotar um ciclo arbitrário ou recriar um filho removido.
Ciclos já concluídos permanecem legíveis como histórico, sem concessão de reexecutá-los.

Aplicações e créditos do conjunto avançam na mesma transação da prosa, débito e recibo
nativos. Replays não consomem outra unidade. Passos novos do workflow também debitam o
contador compartilhado atomicamente. Limites e fases não podem ser ampliados por um
filho. Revogar fase automática bloqueia o grant antigo; contador inválido falha fechado,
sem inventar saldo zero. Texto manual permanece sob a autorização autoral existente.

Propostas produzidas para a sequência têm executionBinding privado. Não podem ser
aplicadas pela rota genérica de prosa fora do ciclo/ledger originais. Avanços automáticos
ligados à sequência usam o driver nativo; os atalhos públicos de redação/revisão não
contornam o contador. Propostas e ciclos independentes anteriores mantêm seu contrato.

Pausar/cancelar fecha pai, ciclo atual, redação/revisão e recibo pendente na mesma
transação. Um provedor já em execução pode terminar a resposta registrada; não aplica
texto ou débito depois da pausa. Retomar não zera consumo. O fechamento da unidade exige
ciclo original concluído, revisão atual aceita e duas versões completas distintas.
A próxima unidade supervisionada aguarda decisão; sair de ato conserva a exigência da
integração nativa. O encerramento da seleção não inicia outro capítulo/livro.

## Fronteira atual

**O núcleo ainda não está roteado em Functions nem exposto na interface.** Não foi criada
uma Function ou ação nova; registro segue422. O
[driver serial e outcomes internos](12-driver-serial-e-outcomes.md) foram implementados
no incremento seguinte. Continuam pendentes descoberta/recuperação e bridge cliente,
UI de seleção/limites e política tipada de publicação anterior obrigatória. Os testes
compõem os métodos internos; não comprovam um runner HTTP já disponível.
Não habilitar esse acesso antes de integrar idempotência, diário metadata, recuperação
e proteção contra respostas tardias. Não restaurar autorizações ao importar um backup.

literarySequenceJobs tem SDK bloqueado e foi incluída no inventário bounded de exclusão
do livro antes de qualquer exposição. O teste de exclusão sem descendentes restantes
inclui o novo órfão. Sem dependência ou índice novo. O contrato puro de limites/fases foi
extraído para literaryExecutionContracts.mjs com reexports anteriores preservados.

## Evidência

14 testes do núcleo percorrem dois capítulos, orçamento exato, replay, pedido de prosa
fora do ledger, pausa durante provedor, revogação, ator/origem recriados, registro
interrompido e unidade/contadores inválidos. Na base1bc6ba8 foram aprovados451 backend dirigidos,191frontend,72Chromium,
41Rules no shard9/16, build/tipos/smoke, lint e sintaxe576. São testes dirigidos,
com a sequência composta internamente e ainda sem teste HTTP público. Limites da evidência estão
no [relatório](validacao-local-2026-11-02.md).

O objetivo integral continua ativo com0/5 etapas encerradas. Além da conexão acima,
concluir os aceites E1/E2/E3/E4, mapa de impacto e restauração .writer editável como nova
cópia privada de E5 e o gate global. A cobertura histórica86,02%<90 não aprova este estado.
