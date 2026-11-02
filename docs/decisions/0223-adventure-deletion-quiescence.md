# ADR 0223 — avanço interno e encerramento dos contextos de aventuras

- Data: 2026-10-28.
- Estado: processadores internos parciais; plano 199 aberto.
- Base: 530413d; complementa a [ADR 0222](0222-adventure-deletion-start-and-inventory.md).

## Contexto

A reserva impede novos consumidores, mas snapshots de contexto e um provedor
já iniciado ainda precisam ser encerrados. A raiz pode ter sido removida por
uma operação externa antes da retomada da limpeza.

## Decisão

Guardar no job o nascimento nativo original da aventura, conferindo seu token.
O valor vem do snapshot do início, nunca do cliente. O formato v1 ainda é
interno, sem endpoints, jobs de produção ou migração de um contrato público.
O hash do recibo inicial inclui esse valor.

Advance usa pedido fechado com deletionId, deletionToken, operationId e
expectedCheckpoint. Comprova job/reserva/recibos nativos antes de processar.
Grava estado, hash e recibo do novo checkpoint na mesma transação. Retry exato
devolve o recibo histórico com progresso atual; identidade trocada, operação
reutilizada ou checkpoint antigo não produzem novos efeitos. A raiz marcada
conserva seu updateTime da transação inicial.

A parte zero consulta contextos pelo UID, tipo/alvo e projectToken derivado do
nascimento original. Cada página contém até dez controles. Ler somente
metadata; conferir contexto/token e nascimento conjunto do corpo por máscara.
Corpo recriado recusa a página inteira. Retirar o snapshot e fechar o controle
como deleted, com fonte/manifesto/provas removidos, no mesmo checkpoint.
Não carregar captura, acumulador, frozen ou texto do manuscrito.

A parte um consulta uma conversa por página, confere a mesma origem e desliga
activeTurnId. Turnos running/awaiting-byok ficam stopped com revisão/data e
catálogo atualizados atomicamente. O fence impede conclusão tardia da geração.
A autorização atual da origem continua obrigatória para qualquer novo consumo.

Os índices de editorChatContexts/editorChats por alvo/projectToken/nome foram
declarados localmente. O emulador comprova as consultas e transações, sem
comprovar ativação dos índices em produção.

## Limites

Esta etapa preserva perguntas próprias e corpos de turnos. O operador foi
consultado sobre retenção das perguntas na exclusão inteira; a escolha sobre
lore indisponível não foi tratada como exclusão de todo o projeto. Não executar
remoção dependente dessa decisão enquanto a resposta estiver pendente.

Página vazia avança a parte; não certifica a fase inteira. A parte seguinte
recusa com adventure-deletion-step-unavailable sem alterar checkpoint.
Fontes de importação/restauração, chaves, mídia/usos, inventário de autoria,
controles/atividade, verificação final, exposição autenticada e UI permanecem
obrigatórios antes de concluir o plano 199.

## Evidência

27 Node (17 de início e dez de quiescência) e 11 SDK/Rules no emulador demo
passaram. Cobrem lote 10/3/0, vizinho preservado, raiz ausente, corpo recriado,
recibo após avanço posterior, perda de ACK, plataforma atrasada e BYOK pendente.
Veja a [entrega parcial](../entregas/2026-10-28-writer-v2-avanco-privado-e-encerramento-de-contextos.md).
Validate integral permanece no fechamento do bloco; sem CI, push ou deploy.
