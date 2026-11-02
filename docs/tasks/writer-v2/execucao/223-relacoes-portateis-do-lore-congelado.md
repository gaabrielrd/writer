# P3 — relações portáteis do lore congelado

- Data: 2026-10-29.
- Base: 84ec506; sequência de [222](222-materiais-restaurados-nas-sessoes.md).
- Estado: leitores da base implementados e testes dirigidos positivos; variantes/P3/D abertos.

## Objetivo e aceite

Conservar relações do lore congelado quando o arquivo só fornece targetKey
e available, sem fabricar targetEntityId a partir do hash. Base lida normalmente,
por C2/S2 e por backup deve preservar ordem, múltiplos tipos e ausências.
Alvos disponíveis exigem identidade/prova atual da ficha capturada; indisponíveis
não revelam nome/tipo/descrição nem são religados automaticamente.

## Contrato e limites

Em item lore de base restaurada autorizada: structured.relationMode=portable e
structured.portableRelations contém os DTOs fechados do arquivo, até 50.
structured.relations bruto não pode coexistir. Presença parcial/nula ou
marcador em base nativa/tipo diferente falha fechada. Relação true guarda
targetKey, available, relationType e description opcional; false somente chave
e estado. Não acrescentar restrição nova aos textos aceitos no formato de base.

Declaração não é grant. Relação true cujo alvo não foi materializado, inclusive
alvo externo de âncora, projeta/reexporta como não resolvida, sem buscar origem
viva. O registro privado original conserva seus descritores; a revisão futura
de restauração deve informar as omissões de projeção por falta de prova/alvo.
Relação false permanece neutra; backup confere ausência física por metadata
para não emitir relação contraditória com item disponível no mesmo snapshot.

## Sequência e arquivos

1. Validador puro compartilhado dos marcadores e DTOs de relações da base.
2. campaignBaseRead.projectedStructured, campaignLoreContracts.readBaseEntity
   e campaignBackupBaseContent reconhecem o modelo sem inventar labels/IDs.
   Conferir estrutura antes de corpos; selecionar os novos campos no backup.
3. Leituras C2 efetivas conferem alvos na mesma base/âncora antes da projeção
   atual. Save de variante continua sendo substituição explícita da ficha inteira;
   não altera a base original. Discard retorna à base com seus marcadores intactos.
4. Testar conversão de DTO real, leitura/C2/S2, variantes save/discard, ausência,
   origem recriada, ordem/múltiplos tipos/self, limites/corrupção e reexportação
   assinada/revisão completa, incluindo âncora externa não resolvida.
5. Checks dirigidos, revisão, ADR/docs/AGENTS/evidência e commit local.

## Fora deste incremento e continuação obrigatória

Corpos de variantes usam JSON canônico entityInput e exigem contrato separado
para relações opacas sem label; não declarados prontos por este incremento.
Depois: esses corpos e seus consumidores de escrita/adoção, inventário/cleanup
C4 v1–v4 antes de jobs/prosa/pins/índices, upload/retomada, remapeamento/
materialização/ativação e Estúdio/ciclos. P3/D/F2-09 e macro 8/35 abertos.
Sem produtor persistente, API/formato novos, dependências, agentes ou remoto.
Testes dirigidos; suite integral no fechamento do grande bloco. Servidor preservado.

## Resultado dirigido

199/199 positivos (20 novos e 179 regressões), com emissão/revisão completas,
save/discard e âncora base-mode retida após adoção. Confira a
[evidência parcial](../../../entregas/2026-10-29-writer-v2-relacoes-portateis-do-lore-congelado.md).
O incremento seguinte deve tratar corpos de variantes e seus consumidores de
escrita/adoção; não habilitar produtor persistente antes deles e do C4.
