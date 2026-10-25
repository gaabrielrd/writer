# ADR 0159 — journal cifrado da preparação de livros

## Estado e contexto

Aceita em 2026-10-25.
[Plano 138](../tasks/writer-v2/execucao/138-journal-protegido-da-preparacao.md).
O sequenciador precisa preservar intenção antes do envio e retomá-la após
reinício. O servidor já oferece chave por HTTP autorizado e a revoga ao
ativar/cancelar; não criar outro endpoint ou persistir essa chave no cliente.

## Decisão

Cliente HTTP adia Firebase, verifica conta/vida útil após waits e usa Auth e
App Check no endpoint existente, mesma origem, credentials omit, cache no-store
e redirect error. Resposta JSON limitada a 8 KiB, contexto completo e base64
canônica de 32 bytes. Importar AES-GCM 256 não extraível; apagar bytes temporários.
Erros de JSON não expõem trechos da resposta. Vite ganha somente proxy exato do
book-restore, preservando o rewrite Hosting e a rota adventure-import.

IndexedDB dedicado writer.book-restore.preparation, store pending, chave composta
conta/restauração. Envelope fechado tem contexto, stamp, nonce e ciphertext;
não contém prosa, arquivo, tokens, chave ou intenção em plaintext.
Intenção fechada até 4 KiB, nonce aleatório novo por gravação e AAD ligada a
domínio/schema/conta/restauração/livro/token/revisão/keyId/stamp.

Reautorizar a chave antes de abrir ou substituir intenção; grant vive somente em
memória da operação. Web Lock exclusivo por conta/restauração coordena instâncias.
Rede/crypto fora da transação IDB. Comparar intenção inteira depois de decrypt;
write CAS compara o envelope inteiro original dentro de uma transação.
Leitura também confere que o envelope permaneceu igual depois da autorização.

Checar vida útil antes de efeitos e depois de waits. Invalidação antes de write
aborta a transação; após commit impede entrega tardia sem desfazer confirmação.
Erro, revogação, quota, dado inválido ou CAS perdido preservam ciphertext, sem
fallback plaintext. Falhas não tipadas do armazenamento viram Error seguro.
Não confiar somente em stamp/operationId ou Web Locks contra outros escritores.

## Consequências e limites

Fábrica pública satisfaz o port do sequenciador. Chromium real prova reinício,
duas abas, transação abortada e replay do driver com a mesma intenção.
Testes de journal usam grants sintéticos; HTTP unitário usa verificadores
mockados. Não comprova identidade, credenciais, Callable ou Storage de produção.

Origem terminal perde chave: conservar envelope sem abri-lo ou alegar retomada.
Descarte explícito/reconciliação terminal pertencem à interface seguinte.
Há reautorização por operação de abertura/gravação, sem cache persistente de chave;
latência de produção não foi medida.

Sem UI nova, deploy ou habilitação do modo indexado. Upload/revisão/ativação/
mídia/limpeza do cliente, roundtrip integral e demais P1/fases/gates continuam.
[Evidência](../entregas/2026-10-25-writer-v2-journal-protegido-da-preparacao.md).
