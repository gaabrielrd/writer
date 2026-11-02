# ADR 0263 — Materialização privada dos dados próprios de campanhas

- Data: 2026-10-29.
- Estado: aceita para preparação interna; ativação pendente.
- Plano: [233](../tasks/writer-v2/execucao/233-materializacao-dos-dados-proprios.md).
- Continua [ADR 0262](0262-campaign-resumable-origin-review.md).

## Decisão e fronteira

Após integridade e semântica própria, campaignRestoreOwnMaterialization grava
notas, sessões, checklist, preparação, referências e vínculos nos caminhos
ordinários da campanha reservada. A raiz permanece pending sem ownerId.
Metadados do projeto e presença de progresso ficam no checkpoint cifrado;
não ligar universo, base, imagem ou biblioteca neste incremento.

Own não exige acesso corrente a derivados para recuperar texto próprio.
O parser fechado e o índice próprio autenticado conferem cada DTO/omissão.
sourceKey em referência é somente ponteiro preservado; não concede conteúdo.
A prova campaign-own-materialized-only descreve preparação, não ativação
nem certificação física de todos os recursos de uma campanha ativa.

## Texto, IDs e controles

Usar framing/fonte cifrada existentes. Uma chamada avança até 25 frames e
conclui no máximo um DTO, relido pelo parser limitado a 4 MiB; não acumular
partes no checkpoint. Preservar limites nativos atuais de 512 KiB e texto
literal, inclusive escapes/Unicode. Estado cifrado até 32 KiB contém cursores,
unidade ativa limitada, contadores e metadata própria do projeto; não contém
texto de notas/preparação. AAD vincula UID/RID/jobToken/checkpoint.

IDs determinísticos vinculam conta, restauração, encarnação, domínio e ID
original. Item/body compartilham ID; sessionId/itemId dos vínculos são remapeados.
Não criar índice redundante de mapeamento. Revisões próprias novas começam
em 1, controles vazios em 0. nextOrder preserva o máximo original mais um.
Controles globais usam totais da prova própria; controles por sessão usam
consultas limitadas aos recursos materializados. Checklist conserva total e
concluídos. Não transportar recibos, retomada ou clocks da conta original.

## Journal, auditoria e cancelamento antes do produtor

ownWrites/ORDINAL sob o job é schema 1: UID/RID/CID/jobToken/ordinal,
createdByOperationId e até quatro descritores de alvos com collection/id/
metadataHash. Coleções são whitelist fixa. Journal e alvos são criados
no mesmo commit de job/operação/recibo; conferir nascimento e imutabilidade
do journal/recibo e de cada alvo. Campos operacionais não são acrescentados
aos documentos ordinários que exigem formato exato.

Vazio inicial das 13 famílias e do journal impede adoção de dados existentes.
Auditoria limitada confere alvos registrados por metadata/nascimento, sem
prosa; contador pronto não equivale à auditoria física final da ativação.
Cancel limpa cipher/key atomicamente e mantém somente contadores de coleta.
Coletar até 25 journals e seus alvos antes de derivados, own index e chunks;
conferir vazio de todas as famílias antes de encerrar. Órfão, alvo alterado/
recriado, journal estrangeiro ou ausente interrompe sem apagar conteúdo alheio.

CAS e jobHash são reconferidos após I/O; prova de integridade/semântica atual
é relida antes da gravação. Operações exatas repetem recibo antes de exigir
chave/etapa aberta. Escritor pendente perde o direito de gravar após cancel.
Campos opcionais preservam jobs anteriores. C4 1–4 permanece; integrar
temporários ao C4 apropriado antes de liberar qualquer raiz ativa.

## Validação e continuação

258 testes dirigidos e um cenário SDK/Rules positivos; dados ricos foram lidos
e alterados pelos serviços ordinários após liberação apenas na fixture Node.
DTO acima de 2 MiB, duas mesas, rollback, concorrência, I/O atrasado, revogação,
recriação/alteração, órfãos e coleta sem prosa foram conferidos.
A [evidência](../entregas/2026-10-29-writer-v2-materializacao-propria-de-campanhas.md)
distingue testes dirigidos e o baseline integral anterior.

Derivados/base/lore/mídia, vínculo autorizado ao universo, C4 dos temporários,
auditoria física e ativação reais, Estúdio/ciclos e condições de lançamento
continuam necessários. Macro 8/35 e P3/D/F2-09 continuam abertos.
