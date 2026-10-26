# ADR 0185 — histórico de aventura em ordem textual

Data: 2026-10-26. Estado: aceito para implementação local.
[Plano 163](../tasks/writer-v2/execucao/163-historico-de-aventuras-em-ordem-textual.md).

## Decisão

O reader interno readAdventureBackupHistoryText lê um chunk nativo por ordinal
na mesma transação de RootSource/head/parentToken. Endereço é chunkRef canônico,
com chaves index/versionId ordenadas pelo digest nativo. O cliente confere esse
endereço sem alterar IDs, tokens ou writers existentes. Não é endpoint publicado.

streamAdventureHistoryData preserva cabeçalhos JSON e compõe versões em ordem
de ID, texto em ordem de índice. SHA/bytes/UTF-8 são conferidos integralmente,
com estado limitado a página e buffers de 64 KiB. Cancelamento encerra a ponte
sem aguardar RPC, e respostas tardias não geram prova.

Cabeçalho preserva chunkCount nativo. adventure-version-body declara layout
fixed64k e headerHash, vinculando texto ao cabeçalho original; o número de partes
portáteis pode ser menor por fronteiras Unicode. adventure-version-text contém
bytes brutos, com uma parte vazia para texto vazio. Decodificação do arquivo deve
ser incremental: uma parte portátil pode cortar um caractere UTF-8.
adventure-history fecha apenas essa seção por contagens/digest.

Prova history-data-only não substitui inventário global, validação semântica,
imagem, drafts ou selo de arquivo. Cabeçalhos/partes emitidos são provisórios
até fechamento completo. Conteúdo corrente removido não elimina versão histórica.
Retenção manual continua até exclusão explícita; nenhum snapshot extra é criado.

## Validação e consequência

52 Node dirigidos (43 readers e nove contrato/envelope), 21 Vitest distintos
em seleções e um caso SDK Firestore passaram. Fixture de 131.072 bytes percorre
três chunks nativos e dois portáteis, com fronteira Unicode. Inclui manual e
before-restore, 53 versões, vazio, fonte compartilhada com composição central,
hash/base64/endereços adulterados, UTF-8 incompleto, conta/cancelamento e retry.

Primeira seleção cliente teve seis falhas por ordem incorreta de chaves no
cálculo do endereço nativo. Corrigido cliente para index/versionId; 18 casos
passaram, mais duas integrações e um UTF-8 acrescentados depois. Não houve mudança
do writer para acomodar teste. SDK registra PERMISSION_DENIED esperados nas
asserções negativas de Rules; emulador próprio encerrado ao final.

Sem UI/endpoints/Rules/dependências novas ou autorização remota. P2/P3/D e gates
continuam abertos. Validate integral volta no fechamento do bloco de captura;
somente commits locais.
