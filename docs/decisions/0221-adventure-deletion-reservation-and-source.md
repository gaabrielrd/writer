# ADR 0221 — reserva permanente e confirmação privada de aventura

- Data: 2026-10-28.
- Estado: decisão implementada parcialmente no plano 199.
- Base: 7d5bd93; somente desenvolvimento local.

## Contexto

Excluir uma aventura exige impedir que uma tentativa antiga recrie o projeto,
um corpo, uma chave ou um uso. Conferir apenas root.deleting não protege uma
raiz que reaparece. Autoria, captura de campanha e restauração usam caminhos
diferentes; recibos históricos não equivalem a autorização atual.

## Decisão

Manter uma reserva global de metadados em adventureDeletionReservations,
separada dos controles privados da conta. A reserva conserva identidade da
aventura, dono, exclusão, token de nascimento, estado e datas. Ler com máscara,
validar presença/schema/identidade/datas e recusar metadados inconsistentes.
Outra conta recebe indisponibilidade sem identidade privada.

Conferir a reserva nos escritores e leitores antes de usar recursos da aventura:
Estúdio, cenas/jobs, narrativa/jobs, progresso/histórico/blocos, lore, backup,
contexto de IA, origem/base/comparação de campanha e criadores de importação/
restauração. Consultas do catálogo fazem uma janela limitada de metadados,
conferem a reserva e só então hidratam os resumos permitidos; mantêm cursor de
varredura quando a janela não produz itens. Retomada omite projeto reservado.

O SDK pode obter raiz/filhos permitidos somente enquanto a aventura está
disponível e não possui reserva. A listagem direta de raízes fica fechada:
o cliente existente já usa listStudioProjects. Conferir uma reserva por documento
na Rules de um catálogo de até 50 projetos não é uma substituição adequada da
janela transacional de servidor. Reservas/jobs/recibos/fences permanecem privados.

Separar reprodução de recibo e efeito novo: uma ativação já confirmada pode
reproduzir seus metadados sem consultar ou autorizar a raiz. Isso não libera
chave, mídia pendente, novos corpos ou nova ativação. A finalização de mídia
reconfere a reserva nas transações anterior/posterior ao I/O. Aceite de Storage
que já começou não passa a publicar metadados acessíveis depois da reserva.
Fechamento físico desse ativo pertence ao job de exclusão ainda pendente.

A fonte interna de confirmação lê apenas reserva, raiz e progresso por máscaras.
Devolve título/revisão, token do nascimento e token das identidades nativas
createTime/updateTime da raiz e progresso, com precisão de nanossegundos.
Não usa revisão ou updatedAt lógicos como substitutos dos carimbos. Ausência,
dono alheio ou reserva não concedem fonte. Identidade/corpo não são reparados
automaticamente. Ler a fonte não inicia nem reserva a exclusão.

## Consequências e limites

Não há novo produtor público de reserva, callable, comando destrutivo ou botão
de exclusão. Os registros de teste são sintéticos; não se excluiu dado real.
A tarefa 199 continua aberta: inventário operacional completo, início/recibos/
resolução, limpeza por famílias e Storage, universo/atividade, cliente/UI/
retomada e validate integral. Não reutilizar cleanup de restauração como
exclusão de projeto nem excluir campanhas, imagens/personas próprias ativas
ou universos junto. A reserva não é autorização para apagar cópias alheias.

As regressões dirigidas e o emulador demo comprovam esta preparação local,
conforme a entrega. Não comprovam Rules/endpoints ou configuração de produção.

Evolução interna: início/recibos/resolução e inventário físico foram acrescentados
pela [ADR 0222](0222-adventure-deletion-start-and-inventory.md), sem exposição
ou fechamento da exclusão completa.
