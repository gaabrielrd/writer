# ADR 0286 — captura de gerações editoriais pelo gate nativo

- Estado: implementada localmente; testes preparados sem execução.
- Data: 2026-11-03.

## Contexto

Planejamento, auditoria e inferência de contrato guardam um rascunho próprio e um
resultado derivado de fontes. O leitor existente oculta o resultado se a prova da
seleção mudar. Copiar o pedido bruto para o backup misturaria entrada, resultado,
provas e controles; reutilizar o gate menos estrito da prosa ampliaria a permissão
sobre esses caches sem contrato nativo para isso.

## Decisão

Compartilhar a recaptura/conferência existente por readLiteraryAICaptureContext e
usá-la antes de abrir o cache original. Preservar rascunho e instrução próprios,
separados de resultados indisponíveis. Registrar artefatos tipados sem revision
adotada ou lineage; somente recursos já adotados em suas famílias podem fornecer
cabeças ativas na restauração futura.

Conservar escopo e nascimento originais pelos metadados de dependência. Índice
legado ausente não é preenchido pelo universo atual. O índice é procedência, não
grant. Desabilitar execução dos checkpoints e representar cancelamento anterior
ao envio sem inventar entrada ou unidade.

Acrescentar selected-sources ao escopo portátil de relatório. Preservar a contagem
nativa, incluindo rascunho/contrato, sem inferir leitura integral do manuscrito.
Aceitar offsetBase nulo no contexto de evidência somente quando o offset também
não foi registrado; não derivar posição de uma citação por escolher sua primeira
ocorrência. Propostas de contrato não transportam políticas ou decisões aprovadas.

## Consequências

A captura interna passa a quatorze famílias, sem novo endpoint. Bundle limitado a
45 artefatos/2 MiB e partes de 64 KiB permanece interno e exige desmembramento pelo
host futuro. Prova de fonte mudada oculta somente os derivados; entradas próprias
e indisponibilidades continuam preservadas. Modelos são snapshots históricos,
sem credenciais, quotas, CAS ou recibos.

Vinte e oito casos foram preparados, sem execução. Produtor e restauração editorial
v2 permanecem fechados. Detalhes e limitações no
[incremento 38](../tasks/producao-literaria/38-captura-de-geracoes-editoriais.md).
