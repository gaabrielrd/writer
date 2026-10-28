# ADR 0213 — Cliente da chave privada de aventuras

- Data: 2026-10-28.
- Estado: implementado e validado dirigidamente no código local.
- Plano: [191](../tasks/writer-v2/execucao/191-cliente-da-chave-privada-de-aventuras.md).
- Antecedente: [0212](0212-adventure-restore-private-recovery-key.md).

## Decisão

Definir identidade própria de recuperação da aventura: ownerId, restoreId,
adventureId, jobToken e reviewHash. O contexto acrescenta keyId.
A primeira chamada pode desconhecer keyId; uma retomada deve fornecer o
contexto conhecido e exigir correspondência. Não buscar chave de livro,
converter domínio por cast nem ler dados de credenciais ao importar o módulo.

O cliente captura identidade fechada e imutável antes de aguardar. A cada
await de tokens, fetch, leitura ou importação criptográfica, confere guard e
UID atuais. Auth/App Check vão em headers de POST mesmo domínio; credentials
omit, cache no-store e redirect error. Não enviar chave/token em query,
persistir segredo ou usar callable/retry/fallback.

A resposta é JSON/UTF-8 estrito limitado a 8192 bytes. Validar envelope exato,
schema, algoritmo, identidade e eventual keyId esperado; Base64 canônico de
32 bytes. Importar AES-GCM 256 não extraível com encrypt/decrypt.
O grant devolve somente contexto e CryptoKey; buffers temporários são zerados.
Encerrar reader e limpar inclusive o chunk recebido quando limite/guard falham.

Erro remoto reconhecido conserva code/reason somente se status e vocabulário
fixos corresponderem; não ecoar mensagem privada. Outros corpos falham
genericamente. Nenhum dado persistente é alterado por uma recusa.

Configurar /api/adventure-restore/recovery-key no proxy Vite exato, descartando
query ao encaminhar para getAdventureRestoreRecoveryKey. Hosting declara
essa rota antes do fallback SPA. Conservar rotas de livros/lore/importação.
Declaração local não significa endpoint remoto implantado.

## Evidência e limites

Vitest cobre primeira obtenção, revalidação/AES, imutabilidade, conta/guard,
respostas inválidas, limites/limpeza, erros e rotas. Um caso compõe o cliente
com o handler/serviço reais de restauração e banco transacional de teste:
retoma a mesma chave e recusa após cancelar. Não é prova de Firestore nativo,
credenciais/App Check reais ou navegador. O SDK de 190 não é atribuído ao
cliente novo.

Resultados na
[evidência](../entregas/2026-10-28-writer-v2-cliente-da-chave-privada-de-aventuras.md).
Journal/cópia cifrada, controlador, UI e roundtrip permanecem pendentes.
P2/P3/D/F2-09, gates e macro 8/35 continuam abertos; validate integral no
fechamento do bloco do cliente. Sem dependência, novo backend, CI ou deploy.
