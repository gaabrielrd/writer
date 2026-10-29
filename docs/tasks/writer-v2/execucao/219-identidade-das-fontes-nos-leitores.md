# P3 — identidade das fontes nos leitores de campanhas restauradas

- Data: 2026-10-29.
- Base: f575981; sequência de [218](218-semantica-dos-derivados-da-campanha.md).
- Estado: leitores internos implementados; validação dirigida e revisão no fechamento.

## Objetivo e critérios de aceite

Preparar os leitores normais para bases materializadas de um arquivo autenticado.
A edição congelada permanece íntegra; excluir/recriar aventura, universo ou ficha
com o mesmo ID não autoriza os bytes antigos. Texto próprio da mesa continua
independente da disponibilidade das fontes. Não criar um produtor persistente.

## Contrato e suposições

Bases privadas têm discriminante sourceMode=restored e sourceEvidence fechada
(schemaVersion=1, archiveHash e source), ambos obrigatórios em conjunto. source
é a testemunha portátil de base já autenticada na revisão completa. Itens da
base restaurada exigem sourceEvidence com a mesma cadeia e uma testemunha de
item disponível, vinculada ao ID antigo da base, sourceKey e origem nativos.
ID privado da nova base/campanha continua nos campos normais; não procurar
a base antiga no banco. capturedAt e IDs das fontes devem concordar.

A evidência pertence à base, não muda o tipo público original da procedência
nem marca permanentemente toda a campanha como restaurada. Assim capturas novas
e candidatas futuras continuam nativas, e âncoras antigas conservam sua prova.
Ausência dos dois campos mantém o contrato nativo anterior; presença parcial,
nula ou inválida falha fechada. Somente serviços servidor podem gravar bases.
O produtor futuro deve derivar as provas exclusivamente do arquivo autenticado,
nunca aceitar esses campos do cliente como concessão de acesso.

## Sequência e arquivos

1. Extrair autorização exata de origem para módulo compartilhado sem ciclo com
   campaignBackupBaseContext; manter API/provas da revisão existentes.
2. Validar evidência privada de base/item e autorização atual por nascimento
   nativo, C4, dono, versão e exclusão. Metadata antes de leitura de prosa.
3. Integrar campaignBaseContracts, campaignBaseRead, campaignLoreStorage e
   campaignComparisonContracts. Projeção deve mudar com prova restaurada;
   campos privados nunca entram nos DTOs públicos.
4. Testar leitura nativa/restaurada, edição posterior da fonte, base antiga
   ausente, recriações de fontes, dono/exclusão/C4, evidências inconsistentes,
   lore local/global/âncoras e comparação. Rodar regressões afetadas.
5. Revisar diff, checks dirigidos, ADR/arquitetura/AGENTS/evidência e commit local.

## Riscos e continuação

Não usar nascimento da nova base como limite de autorização da origem antiga.
Não copiar conteúdo vivo para substituir a edição congelada. Não introduzir
ciclo de módulos, grant, endpoint ou novo formato público. Backup/reexportação
precisam integrar a mesma prova em incremento seguinte antes de materializar;
consumidores de referências opacas e inventário/cleanup C4 v1–v4 também pendem.
Depois: upload/retomada, remapeamento/materialização/ativação e Estúdio/ciclos.
P3/D/F2-09 e macro 8/35 abertos. Suite integral passou no bloco 201–218;
neste incremento executar checks necessários, sem CI/push/deploy/agentes.

## Resultado local

Leitores implementados e **153/153** cenários dirigidos positivos (31 novos,
122 regressões). Lint/sintaxe Functions/arquitetura/docs positivos; suite integral
reservada ao grande bloco. [Evidência parcial](../../../entregas/2026-10-29-writer-v2-identidade-das-fontes-restauradas.md).
O próximo incremento deve integrar as provas aos leitores de backup/reexportação
antes de qualquer escrita persistente de restauração.
