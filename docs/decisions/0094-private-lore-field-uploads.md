# ADR 0094 — Upload privado e verificável dos campos de lore

- Status: aceito para serviço interno; sem endpoint ou adoção ativa
- Data: 2026-10-23
- Plano: [M38c3, passo 2](../tasks/writer-v2/execucao/81-escrita-do-lore-completo.md)
- Complementa: [ADR 0093](0093-streamed-lore-field-validation.md)

## Contexto

Campos extensos precisam chegar por partes sem enviar o resto da ficha.
Preparação, integridade, domínio e adoção são provas distintas. Uma tentativa
cancelada ou uma resposta perdida não pode produzir bytes sem inventário,
apagar recurso recriado ou reaplicar uma edição antiga.

## Serviço interno e intenção

bookLoreFieldUpload oferece start/get/append/advanceSeal/cancel/cleanup internos.
A origem deste incremento é uma ficha existente, inline ou payload, com token
C1 observado. Ainda não há callable, cliente, criação por reserva ou troca de
geração ativa. O serviço não altera ficha, clock, publicação ou créditos.

A intenção fechada fixa UID, livro, lore, upload, token da origem, campo/página
e manifest. Reutilizar a identidade do codec M38a; operação derivada inclui
UID/livro/lore/upload/alvo. A extração de resourcePayloadBodyId preserva exatamente
o hash anterior. Rejeitar corpo, lease, estado ou chunk órfão preexistente.

Registrar inventário v1 sob users/uid/bookLoreFieldUploads e lease sob
books/bookId/bookResourceLeases antes dos bytes. Identidade nativa original do
job determina jobToken; job/lease nascem juntos e cada revisão os atualiza junto
com recibo e âncora imutáveis. Hash do estado atual e nascimento/updateTime
vinculam as provas. Recibo posterior ao job atual ou de revisão futura falha.

## Unidades e estado privado

Uma chamada append recebe até 64 KiB em base64 canônico e prova de Merkle.
Reautorizar origem/clock/encarnação, conferir CAS/índice, Merkle, parser e SHA
incrementais; gravar chunk/prova/estado/recibo juntos. Não limitar o total a
8 MiB ou 128 partes. O último append exige domínio/EOF e SHA integral corretos,
remove o estado privado e entra em verifying, ainda sem header.

Job e recibos guardam só metadata. O estado SHA serializado pode conter buffer
interno de bytes: fica em state/current privado, separado, nunca retornado,
com nascimento/update e hash fixados pelo job. Excluir no EOF ou cancelamento.
O parser em si continua sem texto livre, conforme ADR 0093. Capturar o tamanho
do estado SHA fora da callback e recarregá-lo a cada retry, inclusive após digest.

## Selo e barreira nativa

Verificar artefatos originais por metadata em lotes de até 16, conferindo
chunk/journal/recibo/âncora imutáveis. Só depois criar o header. O último recibo
de append fixa partSealBirth antes dessa varredura. Um chunk recriado depois
de já ter sido verificado pode nascer antes do header novo; comparar somente
com o header não basta.

O generic reader aceita partSealBirth opcional e fechado, anterior ou igual ao
header. Cada parte deve nascer até ambos. O ponteiro interno de campo exige
essa barreira; readers v1 sem ela continuam compatíveis. Abertura nativa exige
origem atual, lease/job, prova do header e barreira do último append.

sealed/prepared em get é metadata do evento, não grant nem prova de disponibilidade
física atual de todas as partes. No teste de recriação entre unidades, o header
pode ser fechado, mas ler a parte recriada falha pela barreira e cleanup a
preserva. O consumidor/adotante deve validar a leitura correspondente e nunca
adotar conteúdo apenas pela confirmação histórica do job.

## Reenvio, cancelamento e limpeza

Reenvio confere pedido/método e par nativo do recibo, sem reaplicar bytes.
Retornar recibo histórico separado do progresso atual. get também retorna só
metadata própria, sem exigir autorização atual da origem. Novos append/seal
sempre a reautorizam; confirmação histórica não autoriza ler corpo.

Cancelar exige intenção/hash próprios e pode criar fence antes do start. Fence
bloqueia start tardio. Cancelamento de upload revoga sua lease antes da limpeza,
remove o estado privado e impede novos append/seal. Lease adotada é recusada.

Cleanup independe do acesso atual à origem, mas exige a encarnação original do
livro quando ainda existe. Excluir no máximo 16 chunks por unidade, por provas
nativas e metadata, sem carregar texto; header por último. Recriação e filhos
extras bloqueiam sem removê-los. Certificar ausência dos chunks e contagem exata
antes de cancelled. Manter job/lease/fences e provas/recibos sem corpo.
Integrar esse inventário e os marcadores à exclusão do livro antes do rollout.

## Evidência e sequência

[Entrega M38c3b](../entregas/2026-10-23-writer-v2-upload-privado-dos-campos-de-lore.md):
124 Node distintos em três arquivos, 45 novos; três cenários SDK reais, incluindo
141 partes, concorrência/retry, leitura com origem fixada e cleanup após remoção
da raiz. Estado/chunks/corpos/leases permanecem negados ao SDK.

Serviço ainda sem endpoint, consumidor UI ou produtor ativo em produção.
Integração de geração v2/readers/adoção/privacidade, criação/exclusão/GC,
inventário do livro, recuperação do cliente e demais writers continuam pendentes.
M38c/P1/F2-09/V2 abertos; sem nova dependência, CI remota, push ou deploy.
