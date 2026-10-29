# ADR 0231 — âncora privada dos metadados de campanha

- Data: 2026-10-29.
- Estado: primeiro incremento interno implementado; P3 aberto.
- Plano: [201](../tasks/writer-v2/execucao/201-portabilidade-privada-de-campanhas.md).
- Base: 25eb87f.

## Decisão

Conferir a raiz própria e cinco controles globais com máscaras fixas em uma
transação somente leitura. UID, campaignId e token esperado são validados e
capturados antes de await. O serviço exige getAll com fieldMask antes da
reserva permanente C4; não admite fallback para ler documentos completos.

A raiz passa por ownership, schema 1, revisão positiva e ausência de deleting.
Os controles de domínio passam por ownerId, campaignId e campaignToken calculado
do nascimento nativo da raiz, schema e revisão. Sessões/preparação exigem
nextOrder positivo; lore exige formato válido de baseId. workProgress tem
schema próprio e herda o escopo da raiz. Ausência é preservada, sem escrita.

sourceToken cobre escopo root-fixed-controls, UID, ID e nascimento/updateTime
nativos da raiz e dos cinco controles. Timestamps exigem segundos seguros não
negativos, nanos válidos e atualização não anterior ao nascimento. Atualização
do mesmo conteúdo e recriação também invalidam o token observado.

A resposta contém somente schemaVersion, campaignId e sourceToken. Não consultar
aventura, universo, base ou autorizações externas para conferir dados próprios:
a origem derivada pode ficar indisponível sem bloquear essa conferência.

## Limites e consequências

A âncora não prova inventário completo, disponibilidade, procedência ou autorização
da edição congelada. S2 e vínculos S3 possuem controles por sessão; o escritor
real S3 pode alterá-los sem modificar nenhum singleton da âncora. Leitores
futuros precisam provas por recurso/sessão e segunda passagem de todas as
famílias, inclusive inserções/remoções e controles ausentes.

Não há endpoint, cliente, arquivo, chave, job, pin, grant ou documento novo
habilitado. O serviço não escreve nem lê prosa. C4 continua v1–v4: seu inventário
será ampliado antes de habilitar futuros produtores persistentes de P3.

A evidência é [parcial e local](../entregas/2026-10-29-writer-v2-ancora-privada-de-campanhas.md).
Testes usam serviços reais sobre banco transacional de teste; não comprovam
concorrência Firestore, credenciais ou implantação em produção. Validate completo
é reservado ao fechamento do bloco P3, conforme autorização do operador.
