# ADR 0214 — Journal cifrado da preparação de aventuras

- Data: 2026-10-28.
- Estado: implementado e validado dirigidamente no código local.
- Plano: [192](../tasks/writer-v2/execucao/192-journal-cifrado-da-preparacao-de-aventuras.md).
- Antecedente: [0213](0213-adventure-restore-private-key-client.md).

## Decisão

Persistir intents dos 14 comandos de preparação em contrato próprio fechado:
identidade da aventura/incarnação, action, operationId, expectedCheckpoint e
limit (1–16 na integridade, null nos demais). Normalizar/fixar antes de await.
Não guardar texto, arquivo, chunks, credenciais ou comandos arbitrários.

AES-GCM 256, chave não extraível, nonce de 12 bytes e stamp UUID novos a cada
gravação. AAD writer-adventure-restore-preparation inclui versão, ownerId,
restoreId, jobToken, adventureId, reviewHash, keyId e stamp. Envelope fechado
e Base64 canônico; plaintext até 4096 bytes, ciphertext até 4112.
Zerar buffers e ocultar erro de parser que poderia revelar conteúdo privado.

IndexedDB writer.adventure-restore.preparation, store pending, chave
[ownerId,restoreId], guarda somente contexto e envelope cifrado. Exigir
WebCrypto/Web Locks/contexto seguro; sem fallback plaintext.
Capturar contexto/expected/next antes do await e CAS do envelope inteiro em
transação nativa. Não decidir igualdade apenas pelo ID da operação.

O journal usa lock por conta/restauração. Read reautoriza com keyId esperado,
decifra e relê o envelope para recusar dado obsoleto. CompareAndSet confere
intent completo, reautoriza e usa CAS do envelope exato. Sem retry automático;
falha, corrupção ou conflito preservam o registro. Guard acompanha awaits.
Uma falha após commit pode deixar ACK incerto; não alegar rollback nem apagar
o novo pedido cifrado, que a próxima leitura autorizada pode recuperar.

Ativação/cancelamento/mídia/coleta/start/upload não pertencem a esse journal.
Cancelamento e coleta removem chave; seus pedidos incertos precisarão de
metadata própria e provas do servidor, sem depender da chave removida.
Descarte local após terminal exige contrato próprio de reautorização futura.

## Evidência e limites

Vitest cobre cifra/AAD, comandos, identidade, perda de guard, CAS/concorrência,
falhas e ACK incerto. O teste de separação de domínio produz AAD de livro
diretamente com WebCrypto, sem importar internos de outra feature.
Chromium isolado usa IndexedDB/Web Locks/WebCrypto reais e recarga/duas abas,
com provedor de autorização sintético e falha de quota injetada na operação
de gravação. Isso não comprova Auth/App Check/Firestore reais ou disco cheio.

Resultados na
[evidência](../entregas/2026-10-28-writer-v2-journal-cifrado-da-preparacao-de-aventuras.md).
Sem dispatch automático, bootstrap, revisão do arquivo ou UI. P2/P3/D/F2-09,
gates e macro 8/35 abertos; validate integral no fim do bloco do cliente.
Sem dependência, backend/Rules/índice novo, CI, push ou deploy.
