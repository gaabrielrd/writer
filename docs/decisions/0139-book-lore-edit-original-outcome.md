# ADR 0139 — Prova histórica do aceite da edição manual

- Status: aceito, implementação local.
- Data: 2026-10-25.
- Contexto: [plano 124](../tasks/writer-v2/execucao/124-consulta-do-aceite-original-da-edicao.md).

## Contexto

Uma seleção de visibilidade precisa distinguir o aceite original de um pedido
sem resposta, mesmo após recarga e perda de seu journal cifrado. Um checkpoint
local applied, a fase de um worker ou o valor atual de isPublic não provam
que aquela operação foi aplicada. Reenviar apply para descobrir seu resultado
também pode executar uma intenção ainda não aplicada.

## Decisão

Adicionar bookLoreEditOutcome, callable Auth/App Check com resposta privada
no-store e Vary Authorization no handler. Não alterar os conjuntos fechados
de 18 métodos de journal, 22 manuais e sete de retirada.

O pedido contém writeId, bookId, loreId, sourceToken, editId e startHash;
jobToken/outcomeToken são opcionais, mas passam a ser obrigatórios no caller
depois de observados. O servidor deriva editId pela mesma fórmula da conta,
writeId, livro e ficha do cliente; não aceita outro namespace ou escopo.
Reabre a reserva e provas nativas existentes e compara a origem original.
Criação tem protocolo próprio e é recusada por esta consulta.

Na fase adopted, conferir recibo/âncora da edição e evento/prova da geração,
hashes, operação, pedido CAS original e nascimentos compartilhados.
outcomeToken vincula UID, identidade inteira, token do job e hashes/nascimentos
do recibo e evento originais. Não depende da cabeça atual, clock atual,
autorização atual de conteúdo nem existência dos corpos.

Retornar somente fase, aplicação, nomes dos campos alterados, indicador de
relações e metadata da adoção: operação, datas/versões, hash do storage,
privacidade anterior/posterior e revogação. Nenhum nome, prosa, corpo,
caminho, chave ou descritor de storage cruza esta fronteira.

Se o pai não existe, tokens já fixados falham. Sem tokens fixados, conferir
ausência dos filhos imediatos operations/operationProofs/slots antes de null.
Essa ausência não é certificado de cancelamento nem autorização de replay.
Preparação/cancelamento retornam applied false, sem outcomeToken.

A sessão Auth captura o objeto SDK original e confere contexto antes/depois;
o cliente congela o pedido e valida resposta fechada, escopo, tokens,
campos e privacidade. Sem fallback, decrypt, mutação ou retry automático.

## Consequências e limites

O resultado comprova apenas o efeito original histórico. Pode continuar
válido depois de outra edição, coleta do corpo antigo ou ausência da
cabeça/livro, enquanto os controles/provas históricos sobrevivem. Não permite
ler a origem indisponível nem restaura ou cancela o efeito já aceito.

Nenhum novo job, recurso, schema persistido, chave, migração ou dependência.
Os formatos cifrados anteriores permanecem intactos. Esta unidade não monta
UI nem coordena visibilidade em lote. O futuro coordenador deve persistir os
tokens observados, consultar antes de resolver apply incerto e usar o
protocolo próprio para cancelar; null nunca autoriza reenvio implícito.
Lifecycle/consumidores/backup/rollout/validate de P1 e demais fases/gates
continuam abertos. Somente desenvolvimento/commit local, sem deploy.
