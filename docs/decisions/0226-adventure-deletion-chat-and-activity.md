# ADR 0226 — chat derivado e retomada na exclusão de aventuras

- Data: 2026-10-28.
- Estado: processadores internos implementados; plano 199 aberto.
- Base: 4a9e46e. Complementa a [ADR 0225](0225-adventure-deletion-images-and-authorship.md).

## Decisão

Retirar corpos de contextos e turnos em páginas de dez documentos por metadata.
A varredura pertence ao UID; turnBodies usa intervalo documental da conta,
caminhos/profundidade exatos e cursor com o caminho completo codificado.
Selecionar somente identidade e folhas de escopo, sem captura, manuscrito,
resposta, instrução ou pergunta. Outros projetos, inclusive livros criados
depois do início da exclusão, permanecem intactos.

Controle presente exige token, dono e nascimento compatíveis. Sem controle,
contexto pronto exige recibo ready original imutável, hash reconstruído do
pedido e updateTime nativo do corpo igual ao nascimento desse recibo.
Conversa ausente exige recibo original de criação e hash do pedido, sem
presumir que operationId seja conversationId. Turno ausente exige recibo
original de send e nascimento conjunto. Corpos próprios não podem ter sido
atualizados depois do início da exclusão. Revisão inválida, identidade
recriada ou atribuição incerta recusam a página inteira.

Contexto temporário sem controle nem origem congelada verificável não pode
ser atribuído pelo ID opaco. Preservar e recusar, sem ler a captura privada.
Não reconstruir pais. Revalidar contextos encerrados e conversas sem turno
ativo/corpos antes de certificar controls; corpo conhecido reaparecido volta
à varredura correspondente.

Preservar perguntas próprias, metadados de turnos/conversas, recibos históricos
e limites da conta. O leitor existente continua mostrando a pergunta própria
e resposta nula após revogação da origem. Não usar o cleanup geral da conversa,
que também apaga perguntas. A decisão final sobre retenção das perguntas na
exclusão integral permanece pendente; esta etapa não a antecipa.

Retirar somente a linha canônica de workActivity da aventura e atualizar apenas
revision do estado global da conta na mesma transação do checkpoint/recibo.
Preservar accessedAt e outras linhas. Alias, alvo incompatível, estado ausente
ou overflow recusam sem efeito parcial. Sem linha, não incrementar a revisão.

Quatro índices de metadata declarados localmente: recibos ready/criação/send
e alvo da atividade. Nenhum índice foi implantado. Recibos de autoria auditados
guardam IDs/hashes/revisões; não retirar operações por prefixos opacos.

## Evidência e limites

56 testes Node direcionados e três cenários SDK/Rules demo passaram.
Veja a [entrega parcial](../entregas/2026-10-28-writer-v2-chat-e-retomada-na-exclusao-de-aventuras.md).
Incluem paginação, questões legíveis, órfãos comprovados, recusa sem atribuição,
rollback, ACK perdido e revisão nativa conjunta da atividade/recibo.

O job chega a verify ainda em deleting. Verificação terminal, remoção da raiz,
exposição autenticada, cliente/UI/recuperação e validate integral do bloco
permanecem abertos. Sem endpoint, Rules novas, dependências, CI ou operação remota.
