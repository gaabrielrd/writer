# ADR 0069 — Escrita e histórico por referência de capítulos

- **Estado:** adotado localmente em 2026-10-22.
- **Contrato:** [P1 M25](../tasks/writer-v2/execucao/58-escrita-e-versoes-dos-capitulos-grandes.md).

## Decisão

createBookChapterBodyPlan é um acumulador interno criado dentro de cada tentativa
transacional. Agrupa deltas por bodyId, valida dono/livro/recurso/manifesto e
confere contador seguro. Todos os participantes da transação compartilham o mesmo
plano; o commit aplica o resultado agregado uma única vez. Não persistir nem
reutilizar o acumulador entre pedidos ou retries.

createLegacyChapter/saveLegacyChapter usam o codec puro M23 para texto novo acima
de 512 KiB, com identidade de operação separada por finalidade. O codec não concede
autorização: workProject e snapshot do capítulo devem ser conferidos primeiro.
Criação/replay devolvem texto lógico. CAS e recibos do save conferem hash lógico;
replay de criação recusa texto posterior diferente. Texto idêntico conserva geração.
Ao voltar para inline, limpar explicitamente contentStorage.

prepareLegacyChapterTextWrite mantém texto/contagem/ledger/raiz/recibo e referências
na mesma transação. Chamadores podem reutilizar conteúdo já verificado do mesmo
snapshot e transação, sem aceitar esse valor em payload público. Escrita nova
preserva limite lógico de 8 MiB e UTF-8 válido. Nenhum corpo vazio substitui null.

## Referências e histórico v2

Um pin representa a referência do capítulo ou de uma versão. A última liberação
marca pins zero/state unreferenced. Não reabrir essa geração nem apagar partes
nessa operação; coleta física é a próxima integração obrigatória. Isso não expira
nem compacta versões. Corpo com versão ou capítulo remanescente continua ready.

Versões de capítulo com corpo externo usam schemaVersion 2, contentStorage e
partLengths (até 129 segmentos textuais de até 64 KiB). Cabeçalho confere tamanhos,
hash e recurso. Os comprimentos delimitam UTF-8 enquanto chunks físicos permanecem
binários. readHistoryChunk lê até duas partes por segmento, confere origem/hash
nativos e decodifica estritamente, preservando BOM. Não precisa de capítulo atual.
Versões v1, cenas e blocos conservam corpos anteriores e o resumo público não muda.

Capturar versão acrescenta um pin sem copiar prosa. Restaurar lê/valida o texto
integral, cria versão anterior, troca ponteiro, atualiza ledger e confirma recibo
juntos. Preferir geração da versão quando disponível. Captura e substituição podem
tocar o mesmo corpo: somar deltas evita perder a referência anterior. Restaurar
v1 grande cria no máximo um novo corpo; versão anterior externa guarda referência,
evitando duas cópias grandes na transação.

Excluir capítulo libera somente seu pin. Versões de recurso removido permanecem
legíveis até exclusão explícita. A primeira etapa de deleteWorkVersion revoga o
manifesto e libera seu pin junto do recibo; retomada da limpeza não libera de novo.
Conferir identidade/projeto do manifesto antes de ler ou ajustar referências.

## Evidência e limites

97 Node dirigidos e 60 Vitest de compatibilidade passaram. SDK real provou troca
entre dois corpos de 8.384.512 e 8.380.416 bytes, captura/restauração por referência,
pins e histórico após exclusão do capítulo. Parte ocupada causou rollback nativo,
preservando capítulo, pin anterior e ausência de recibo. O cenário de histórico
passou novamente após a guarda final de identidade/projeto, incluindo casos negativos.

Esses testes criam livro ativo pela fixture, não pelo restore P1. Nenhum transporte,
Rule ou API nova foi adicionado. SDK local não prova wrapper Auth/App Check produtivo.
Coleta/exclusão física de livro, conversão e chat aplicador seguem obrigatórios
antes da ativação, além de demais recursos/campos grandes, mídia/personas,
autorização e host/UI/roundtrip/validate integral. Somente local, CI ignorada.
