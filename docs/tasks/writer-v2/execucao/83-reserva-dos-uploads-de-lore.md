# P1 / M38c3f — Reserva dos uploads de uma edição de lore

## Resultado exigido

Executar o passo 3 do [plano 82](82-alcance-e-coleta-dos-corpos-de-lore.md):
reservar campos/páginas selados sob geração preparing e cancelar a tentativa
sem remover corpos alcançados por outra cabeça/referência. Adoção ativa,
compilação completa e leases adopted permanecem na sequência dos passos 4/5.

## Contrato e arquivos previstos

Novo serviço/store/contratos de bookLoreEditReservation, provas nativas de
lease e cleanup do pai; integração com FieldUploadStore/Contracts/Cleanup e
ResourceInventoryContracts/Store/Cleanup. Testes Node/SDK, Rules, check e docs.
Sem endpoint, dependência, UI, escrita da cabeça, clock ou publicação.

Início fixa livro/ficha/sourceToken, inspeção pronta e intenção: campos conhecidos
por ref de upload ou remoção explícita e relações opcionais por presença/count.
Name/category não podem ser removidos. A inspeção deve ser da mesma origem e
encarnação. Dados de prosa e ponteiros físicos não entram no pedido do pai.
O job privado precede a geração; generationId deriva do token/nascimento do job.

Generation preparing tem contexto imutável de origem e prova do pai. Preparação
não pode ser aposentada pela API de fonte ativa. Cancelamento é monotônico para
cancelled, sem voltar a active. Corpo initializing e lease protegem os bytes
antes do vínculo de referência que o compilador completo fará depois.

Reserva por unidade identifica alvo e upload selado, confere origem/escopo e
provas, cria slot imutável e inventário do corpo, e altera job/lease do upload
para reserved no mesmo commit do recibo do pai. Marcador de reserva fixa pai,
geração, alvo e operação originais. Upload reservado não admite cancelamento
isolado, append ou novo selo. Reenvio confirma o evento antigo sem reexecutar.

## Cancelamento e coleta

Cancelamento do pai usa intenção própria, inclusive após revogação/exclusão,
e fence anterior ao start. Fecha a geração antes de liberar qualquer slot.
Cleanup percorre um slot por vez, coloca o upload em cancelling e avança sua
coleta por unidades. Só confirma o slot concluído após terminar o ciclo próprio
dos bytes. Slots/recibos/controles permanecem como provas e fences.

Para upload reservado, a coleta reutiliza o guard de alcance do inventário.
Uma capacidade interna, vinculada à transação e a snapshots nativos de
pai/geração/slot/job/lease, permite limpar seus próprios bytes staged após
perder acesso à origem. Nunca aceitar booleano/DTO como essa capacidade.
Livro recriado bloqueia; ausência/deleting/revogação não concedem leitura da
origem. Cabeça atual, referências e recriações continuam protegidas.

Cleanup coordena cursor/contagem/recibo do upload com o inventário na mesma
transação. A raiz do livro não é alterada. Lease permanece como fence privado.
A coleta genérica continua adiando leases sem prova; suporte adopted virá na
adoção. O caminho antigo de upload sem reserva conserva suas provas/cleanup.

## Validação

Casos Node/SDK: fonte v1/v2/inline, intenção/inspeção divergente, slots de
campos e páginas, reserva concorrente/duplicada, CAS/replay, job/lease/slot/
geração/corpo recriados, cancel antes/durante/depois, revogação e livro ausente/
deleting/recriado, estado em voo, rollback e referência tardia impedindo delete.
Campo >8 MiB/128 partes percorre reserva/cancelamento nativos, sem guardar prosa.

Somente testes afetados por ajustes. Validate integral permanece no fim de P1;
CI ignorada e commits locais. P1/F2-09/Writer V2 continuam abertos. Depois:
compilar base/campos/páginas e materialização inline, adotar com CAS/clock/
privacidade/recibo e integrar exclusão/handlers/cliente antes do rollout.

## Evidência e sequência

[Entrega](../../../entregas/2026-10-23-writer-v2-reserva-dos-uploads-de-lore.md)
e [ADR 0098](../../../decisions/0098-private-lore-edit-reservations.md):
113 Node e cinco SDK distintos positivos, em rodadas dirigidas. Reserva/
cancelamento internos implementados; nenhuma adoção ativa.

O check de Functions ultrapassou o limite de linha do Windows; o runner por
arquivo preserva a checagem e cobre os 191 módulos .mjs atuais. Regra correspondente
registrada na ADR. Compilação completa, leases adopted e passos 4–6 seguem pendentes.
