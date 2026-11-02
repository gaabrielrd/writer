# ADR 0090 — Migração conservadora dos prefixos inline de lore

- Status: aceito para preparação privada
- Data: 2026-10-23
- Plano: [M38b2](../tasks/writer-v2/execucao/79-migracao-dos-prefixos-de-lore.md)
- Complementa: [ADR 0089](0089-private-paged-lore-payloads.md)

## Contexto

O escritor v6 podia ter gravado algumas páginas inline antes de o lore completo
ultrapassar o documento nativo. M38b preservava esses prefixos, mas recusava
avançá-los. A migração deve produzir a representação inteira sem descontar e
recontar relações nem invalidar os recibos antigos.

## Captura e prova original

Na entrada, conferir artefato/journal/recibos nativos do prefixo, dados gerais,
tamanho do prefixo e posição do item. O offset deve ser positivo, múltiplo de 64
e menor que o total da fonte. Capturar somente metadata constante no progresso
opcional legacy: schemaVersion 1, relations, counted, operationId, birth, update
e valueHash. Nenhum texto nem vetor de relações é copiado para o job.

operationId é a última operação do journal inline. Em cada unidade, autenticar
o recibo imutável, cujo nascimento deve ser update capturado. Exigir ação
advanceBookRestoreLore, offset/total/item/loreCount originais e ausência de um
payload ativo naquele recibo. Isso autentica o contador inicial independentemente
de uma alegação do job atual. Recriação de lore/journal/recibos falha.

O progresso M38b anterior, sem legacy, continua aceito. A presença de legacy exige
contrato fechado, contadores seguros, hashes e timestamps válidos. Não há novo
namespace, capacidade de inventário, callable ou Rule.

## Contagem e conservação

O prefixo nativo permanece intacto enquanto o novo cursor percorre a fonte desde
zero. relations é a quantidade do prefixo; counted inclui também relações de
lores anteriores. Durante toda a cópia:

```text
loreRelationCount = counted + max(relationOffset - relations, 0)
```

A cada página, acrescentar apenas a diferença entre o excedente novo e o excedente
anterior. Usar soma segura. Nenhum contador global diminui; recibos anteriores
continuam resolvíveis durante a migração, depois dela e após cancelamento.

Em cada unidade, reconferir identidade nativa do prefixo com metadata, sem reler
seu texto. Antes da troca final, conferir também valueHash completo. O original
só é substituído depois de todos os novos payloads/ponteiros certificados.

## Troca final e cancelamento

Usar replace autenticado no artefato lore existente. Preservar nascimento nativo,
createdByOperationId do journal, artifactCount do registro já existente e datas
lógicas. Atualizar journal/recibo/cursor e stub no mesmo commit. Só então
incrementar loreCount, limpar legacy ativo e avançar para o próximo item.

O nascimento do documento lore continua sendo o do primeiro prefixo. Leitores
devem usar sealBirth explícito para o limite superior dos segmentos novos, que
podem ter nascido depois desse documento. O ponteiro de cada corpo continua
fixando seu nascimento exato.

Falha depois de preparar o write do alvo ou do journal não pode deixar uma troca
parcial. Um clone por callback mantém retry/CAS; replay não produz outra cópia.
Cancelamento antes/durante/depois usa o inventário de capacidade v1 existente e
remove o prefixo/artefatos próprios exatamente uma vez. Alvos recriados ficam
preservados quando a operação bloqueia.

## Evidência e limites

Fixtures reproduzem as transações do protocolo M28/v6 com arquivos realmente
carregados e validados. Lore, journal, job e recibo são escritos atomicamente com
timestamps nativos reais; não é uma execução de um binário antigo. Nenhum
createTime/updateTime é fabricado para simular a origem.

Node cobre fronteiras de páginas, total prévio de outros lores, replay em cada
unidade, índices/totais adulterados, rollback de writes já preparados, concorrência,
retry, recriação das provas e cancelamento em cinco etapas. Também atravessa todas
as fases seguintes até v14/v12. SDK confirma prefixo real de 128 entradas,
substituição sem trocar nascimento/journal inicial e total global 130 para 202.

Não houve migração de dados de produção, deploy, raiz ativada ou UI habilitada.
Implantar parsers compatíveis e drenar handlers anteriores antes da migração.
M38c, demais campos grandes, saída portátil ampliada, certificação/ativação,
capa/biblioteca e host/UI/roundtrip/validate continuam em P1/F2-09.
