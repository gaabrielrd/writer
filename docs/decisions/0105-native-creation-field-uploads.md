# ADR 0105 — Uploads de campos vinculados à criação de lore

- Estado: aceita para preparação privada L2; composição/ativação L3 pendentes.
- Data: 2026-10-24.
- Contexto: [plano 90](../tasks/writer-v2/execucao/90-uploads-vinculados-a-criacao-de-lore.md).

## Fonte sem ficha existente

O contrato de campo aceita creationId/startHash/jobToken opcionais em creation.
sourceToken precisa ser o token dessa reserva, mas o token alegado não é grant.
A fonte reabre reserva/marcador e livro originais autorizados na mesma transação,
confere loreId derivado e nascimentos, e exige cabeça/tombstone/cancel ausentes.

Não há cabeça fictícia nem inspeção falsa. Origem privada fixa bookBirth e
creationBirth no contexto do campo. Outras fichas podem mudar; revogação,
deleting, controle recriado ou intenção de cancelamento bloqueiam novas unidades.

Criação usa inventoryVersion 2; campos existentes preservam o contrato v1.
Start cria binding/prova no inventário uploads da reserva junto de job/lease/
estado SHA. Binding é imutável, fixa alvo/manifesto/contexto por hash e tem o
mesmo nascimento do job. Load confere essa ligação historicamente sem conceder
leitura ou escrita atual da fonte. Reservas e materialização de fonte inline
não são combinadas por um marcador alegado.

Merkle, SHA, parser, append, recibos, selo e partSealBirth continuam no protocolo
existente de campos. Não há limite novo de 8 MiB ou 128 partes. Nenhum campo
temporário vira ficha ativa ou altera clock/datas/publicação do livro.

## Fechar antes de limpar

Cancel vazio e cancel-before-start de L1 continuam compatíveis. Havendo filhos,
cancel registra intenção/prova e journal privados antes de tocar nos seus bytes.
A intenção é irreversível e fixa cutoff nativo; reautorizar start/append/seal/
abertura selada passa a falhar. Confirmação de recibo antigo permanece metadata.

O journal tem estado revisionado, eventos/âncoras e recibos nativos/CAS.
O objeto de criação precisa ter sido aberto no mesmo tx, inclusive para cleanup
depois da revogação. DTO copiado ou outra transação não substituem a capacidade.
Provas iniciais órfãs também impedem reabrir uma intenção perdida.

Advance resolve um binding/filho por unidade, chama seu cancelamento ou cleanup
na mesma transação e confirma juntos filho/journal/recibo. Até 16 partes de
payload por unidade; header sai por último. Coleta consulta metadata/provas de
escrita nativa, sem reler bytes ou Merkle proof dos chunks. Estado SHA privado
do campo é validado/removido pelo protocolo existente.

Depois, auditorias limitadas conferem leases/jobs e ausência de cabeças/payloads/
gerações/descritores inesperados. Só então são gravados evento terminal e
checkpoint complete no mesmo nascimento. completedUploads conta cada filho
terminal uma vez; coordinatedUnits conta operações coordenadas, sem total
fictício de palavras ou conteúdo.

Bindings, leases, jobs e recibos permanecem fences. Escopo divergente, recurso
sem binding, artefato recriado ou filhos reserved/adotados sem a extensão de L3
bloqueiam terminar e ficam preservados. Não há namespace purge.

## Exclusão do livro e histórico

A etapa creations do inventário v3 coordena o mesmo cancel/advance. Se fields
já cancelou um filho, comprova sua identidade/ausência de bytes sem removê-los
novamente. Checkpoint do livro e progresso dos filhos compartilham a transação.

Cleanup próprio continua possível após owner/deleting/raiz ausente, sem reabrir
prosa. Uma raiz recriada não recebe essa autorização. Sucesso terminal e recibos
históricos permanecem consultáveis sem recriar ficha, upload ou raiz.

## Fronteiras e próxima etapa

Store da criação importa somente o journal de metadata, sem importar serviço
de upload. Fonte/bindings não dependem dos coordenadores de cleanup, evitando
ciclos entre criação, campo e inventário do livro.

Rules existentes já negam os descendentes privados. Sem novo callable,
dependência, UI ou deploy. L2 só prepara campos/páginas: L3 deve reservar os
selecionados para a geração, ampliar cancelamento de tentativas/filhos reserved,
compor/auditar sem base e ativar cabeça/geração/leases/clock/datas/recibo juntos.
Criação adotada deve ser sucesso histórico não cancelável.

Demais writers/consumidores, backup lógico/indexado, cliente/recuperação,
roteamento de preparações sem marca e rollout permanecem obrigatórios.
P1/F2-09/Writer V2 continuam abertos; validate integral no fechamento de P1.
