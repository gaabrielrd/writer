# ADR 0100 — Materialização servidor do lore inline

- Estado: aceita para preparação privada; adoção/rollout pendentes.
- Data: 2026-10-23.
- Contexto: [plano 85](../tasks/writer-v2/execucao/85-materializacao-das-fichas-inline.md)
  e [compositor](0099-private-lore-generation-compilation.md).

## Decisão

O compositor aceita origem inline reautorizada e materializa somente os campos
presentes herdados e páginas de relações compatíveis. Substituições e remoções
do criador prevalecem. O resultado v2 tem base null, campos achatados e descritores
próprios; não há default novo de privacidade, aliases, datas ou relações.

Upload do filho deriva do token nativo do pai e alvo. JSON/manifesto/partes são
calculados no servidor a partir do valor atual autorizado, sem prosa no pedido
ou checkpoint do pai. Uma parte avança por unidade; selo confere até 16 partes.
O serviço de upload existente pode receber uma transação nativa interna; início,
append/selo/reserva e recibo do pai são atômicos, sem transação aninhada.

Job e lease do filho guardam materialization com identidade/token/nascimento do
pai e sourceToken. Novos appends/selos exigem a coordenação interna correspondente.
Cancelamento isolado e reserva por outro fluxo são recusados; confirmação de
evento histórico continua sem reaplicar efeito. Essa opção de construção não
é entrada de cliente, endpoint ou autoridade por DTO.

inlineWork no pai guarda somente alvo, uploadId, startHash e operação do início.
A abertura do filho exige objeto nativo do pai na mesma transação, contexto/
manifesto esperados e nascimento do filho igual ao recibo original do início.
Recriar filho, lease ou provas não retoma a encarnação antiga.

Depois de selar, o slot materialized vincula início original e reserva ao recibo
do compositor, preservando os slots normais de uploads do criador. Job/lease,
slot, inventário e contador do pai mudam juntos. A partir daí, o filho usa os
mesmos guardas de alcance/cancelamento dos uploads reservados.

Cancelamento fecha a geração e limpa primeiro o filho em preparação, mesmo
antes de existir slot. Suas partes/header são removidos pelas provas de upload
existentes; estado SHA privado é descartado. Ausência/deleting/revogação do livro
não concede leitura da origem. Livro recriado e artefatos divergentes bloqueiam.
Só filhos reservados entram nos contadores; retomada reconcilia cleanup já
concluído sem recontar. Fences/jobs/leases/recibos são preservados.

A origem inline nativa está limitada pelo documento Firestore; a expansão JSON
escapada pode gerar mais de 16 partes. Recalcular sua codificação por unidade
não cria uma cópia monolítica no Firestore nem guarda prosa no pai.

## Estado e sequência

Preparação agora cobre inline e payload v1/v2, com auditoria/certificado privados.
Certificado não ativa a cabeça, não concede leitura e não comprova disponibilidade
física futura sem os guards atuais. Adoção ainda deve revalidar seus contratos.

Próximo: CAS de cabeça/leases/clock/privacidade/recibo, integração da exclusão
do livro/lore e demais writers/consumidores/backup/cliente. Nenhum endpoint,
worker ou UI habilitado; P1/F2-09/V2 continuam abertos.
