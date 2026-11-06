# Redação contínua delimitada — primeiro incremento de E4

Incremento na worktree literária sobre `b9fc03c`. O objetivo integral segue ativo.
Este bloco implementa a autorização operacional da primeira versão de um capítulo;
não encerra os modos de colaboração de todo o processo.

## Uso

A redação por cenas oferece Supervisionado por cena e Contínuo com limites. O primeiro
mantém o aceite explícito de cada proposta. No contínuo, o autor informa limites totais
de aplicações e créditos para o capítulo e autoriza essa execução. A preparação atual
continua precisando de gate aceito. Registrar a autorização não inicia geração; Retomar
executa os checkpoints autorizados.

Cada passo produz no máximo uma proposta e sua aplicação nativa. O servidor confere o
orçamento junto do texto, crédito e recibo, mantendo os contadores na mesma transação.
O fluxo para ao atingir qualquer limite, encontrar impedimento estrutural, texto existente,
fonte alterada ou saldo insuficiente. Texto existente continua exigindo adoção explícita.
Ao terminar todas as cenas, preserva a primeira versão pelo fluxo nativo. Isso não significa
revisão, aceite literário final ou publicação.

Os limites incluem o que a execução já aplicou e debitou. Uma nova autorização explícita
pode ampliar os totais ou mudar para supervisionado; não zera gastos nem troca capítulo,
modelo ou raciocínio. Uma requisição antiga não reaplica autorização sobre um controle
mais recente. O modo operacional do processo inteiro e sua ligação à direção editorial
versionada de E1 continuam no próximo incremento; texto livre do contrato não concede
permissão automática para gastar ou aplicar prosa.

## Pausa, concorrência e recuperação

Pausar no servidor impede uma nova aplicação automática, inclusive quando a proposta já
está chegando do provedor. Uma geração já registrada pode concluir e ficar para conferência;
pausa não revoga a autorização de leitura dessa fonte nem desfaz o que já foi salvo.
Retomar concede uma nova revisão de controle. Uma resposta da revisão anterior não pode
aplicar texto depois dessa mudança. Cancelar conserva cenas e versões já salvas e impede
aplicações futuras.

Retentativas de avanço compartilham o pedido de cena. O aceite automático tem ID derivado
da execução e proposta, com recibo idempotente. Falhar depois de preparar o checkpoint
não grava texto, contador ou débito pela metade. Recuperar depois usa a mesma proposta,
sem repetir geração ou cobrança.

Autorizações usam CAS e recibos em `literaryOperations`. O journal local conserva somente
identidade e hash, com tipo `draftExecution`; não persiste texto, credenciais ou a autorização
como concessão portátil. Resposta perdida repete o mesmo pedido ou consulta seu recibo.
Na interface, uma resposta de avanço/controle antiga não substitui uma pausa ou cancelamento
posterior. Troca de conta/livro/capítulo desmonta a sessão correspondente.

## Contrato técnico

`literaryDraftExecution.mjs` é puro. `literaryDrafting.mjs` mantém política, revisão de
controle, pausa, gasto acumulado e motivo de parada no job existente. A checagem final da
autorização ocorre no hook nativo de aplicação, dentro da transação de prosa e crédito.
`setLiteraryDraftExecution` pertence a `planningApi`; o contrato completo tem **416 ações**.
Não há nova coleção, índice, Rule, dependência ou Function independente.

A autorização pertence ao nascimento nativo do livro/capítulo e ao conjunto atual de fontes.
Não autoriza outro capítulo, outro modelo, revisões posteriores nem publicação. Futuro
backup/restauração não deve reativar essa permissão: nova cópia exige nova autorização.
O limite é da execução, sem impor quantidade de cenas ou palavras ao livro.

## Evidência e pendências

- Servidor: 325/325 em todos os testes literários e contratos por setor. Nove novos cenários
  incluem orçamento, ampliação explícita, pausa/cancelamento com provedor pendente,
  concorrência, bloqueios, saldo insuficiente, revogação entre leitura e aplicação e rollback
  atômico de checkpoint.
- Frontend: 85/85 em 17 arquivos. O roundtrip real registra gate, executa, perde a resposta
  da pausa, recupera o mesmo recibo, amplia os limites e preserva a primeira versão com
  dois débitos únicos. Cenários de interface cobrem respostas antigas após pausa/cancelamento.
- Chromium: seis jornadas, nos três temas e desktop/móvel de 320 px, verificam limite,
  pausa, nova autorização e salvamento por teclado. Resultado final no relatório da pasta.

Permanecem em E4: orientação operacional, coordenação supervisionada/contínua das fases
preparação → gate → redação → revisão estrutural → revisão de prosa → versão revisada,
passagem entre capítulos/atos e reconciliação/reuso após alterações. E2 mantém auditoria
final dos critérios. E5 mantém inventário/backfill/fence/UI integral de impacto e portabilidade
editorial `.writer` editável. O gate global continua pendente; os testes dirigidos não o
substituem. Não houve commit, push, merge de volta à principal ou deploy.
