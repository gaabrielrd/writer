# P3 — referências portáteis da base congelada

- Data: 2026-10-29.
- Base: 4892cdb; sequência de [220](220-backup-das-campanhas-restauradas.md).
- Estado: leitores implementados e testes dirigidos positivos; P3/D abertos.

## Objetivo e aceite

Preparar os vínculos e o ledger de lore da base restaurada para guardar o alvo
lógico disponível no arquivo, sem fabricar reference.scopeId/entityId/sceneId
a partir de um hash. Conservar IDs dos vínculos, origem do vínculo e estado
indisponível explícito. Leitura normal e reexportação continuam autorizadas.

## Contrato

Somente em base com a prova restaurada válida de 219: referenceMode=portable e
portableReference fechado, schemaVersion 1, target={kind,sourceKey,available}.
Links também incluem ledgerId hash ou null. Ledger exige kind lore, referenceKey
igual ao ID privado preservado e processed true, sem reference/sourceKey/available
nativos duplicados. Links não incluem reference bruto. Presença parcial/nula/
conflitante falha fechada. Ausência de marcadores conserva capturas nativas.

Marcadores do servidor serão derivados exclusivamente do arquivo autenticado.
Na leitura normal, alvo com available false permanece indisponível sem consulta
à origem ou ao item, mesmo se outro material usar a mesma chave. O backup confere
somente a ausência física por metadata para recusar arquivo contraditório, sem
consultar origem ou prosa. Alvo true exige item
capturado do tipo correto e autorização atual. Link de lore e ledger devem
concordar e provar o vínculo nos dois sentidos. IDs/hash não concedem acesso.

## Sequência e arquivos

1. Validadores puros compartilhados do vínculo/ledger e correspondência.
2. campaignBaseRead seleciona a representação portátil, projeta DTO existente
   e nunca tenta resolver reference bruto ausente.
3. campaignBackupBaseResources seleciona marcadores, verifica fonte/item/ledger
   e testemunha reversa em consultas limitadas; mantém DTO e formato atuais.
4. Testar conversão em memória de DTOs reais, leitura, ledger/joins, ausências,
   revogação/recriação, corrupção, cursor/token e emissão assinada/revisão completa.
5. Checks dirigidos, revisão, ADR/docs/AGENTS/evidência e commit local.

## Limites e riscos

Sem produtor persistente, endpoint, novo formato público ou alteração de
capturas nativas. Não relaxar os joins semânticos: um arquivo que declara alvo
indisponível mas inclui o mesmo item disponível continua inconsistente.
A indisponibilidade do arquivo não é uma permissão para religar referência.

Vínculos de sessões e relações externas de lore/variantes precisam de contrato
próprio no incremento seguinte; depois inventário/cleanup C4 v1–v4 antes de
jobs/prosa/pins/índices. Upload/retomada, remapeamento/materialização/ativação e
Estúdio/ciclos continuam pendentes. P3/D/F2-09 e macro 8/35 abertos.
Testes necessários neste incremento; suite integral no grande bloco.
Sem agentes, CI, push, PR, merge ou deploy; preservar o servidor manual.

## Resultado dirigido

21 novos e 251 regressões positivos, com arquivo assinado/revisão completa e
ausências explícitas preservadas. Confira a
[evidência parcial](../../../entregas/2026-10-29-writer-v2-referencias-portateis-da-base.md).
O próximo contrato deve cobrir vínculos de sessões e relações externas antes
do inventário/cleanup C4 e do produtor persistente de restauração.
