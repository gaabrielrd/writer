# P1 — journal protegido da preparação de livros

## Objetivo

Implementar o port durável do [plano 137](137-preparacao-retomavel-no-cliente.md),
com a chave já oferecida pelo HTTP de recuperação do servidor. Recuperar a mesma
intenção após recarga somente pela mesma conta e contexto nativo autorizados.

## Descoberta e limites

Servidor oferece chave AES-GCM somente antes de ativação/cancelamento, ligada a
owner/restoreId/jobToken/bookId/reviewHash/keyId. Hosting já tem rewrite de
/api/book-restore/recovery-key; proxy Vite ainda cobre só adventure-import.
Não criar outro callable ou endpoint. Não guardar chave de recuperação, token
Auth/App Check, prosa ou arquivo no journal.

Preparação nunca ativa automaticamente. Se outro dispositivo ativar/cancelar,
chave deixa de estar disponível; preservar ciphertext, sem reabrir ou fingir
retomada. Descarte local explícito e reconciliação terminal serão tratados com
a interface. Esta etapa não resolve upload/ativação/mídia/limpeza no cliente.

## Sequência e contrato antes do código

1. Cliente HTTP adiado para chave, com Auth/App Check, mesma origem,
   credentials omit/cache no-store/redirect error, resposta JSON limitada,
   contexto exato e chave importada como CryptoKey AES-GCM 256 não extraível.
   Checar conta/vida útil após cada espera e limpar bytes temporários da chave.
   Acrescentar somente proxy Vite do book-restore.
2. Envelope fechado com identidade/contexto/stamp/nonce/ciphertext; AAD vincula
   contexto e stamp. Intenção completa limitada a 4 KiB, sem dados extras.
   Nonce novo por gravação; grant nunca persistido. Abrir requer chave
   reautorizada; falha preserva envelope.
3. IndexedDB dedicado, chave composta conta/restauração e Web Lock no mesmo
   escopo. Leitura/criptografia/rede fora da transação IDB; write CAS compara
   envelope inteiro original dentro da transação, sem confiar só em stamp.
   Comparar intenção completa após decrypt; CAS perdido não escreve.
   Guard de conta/vida útil antes dos efeitos e após awaits; aborta write se
   invalidado. Sem fallback em plaintext ou armazenamento sem CAS.
4. Conectar fábrica do journal ao driver pela interface pública.
5. Testes dirigidos HTTP/crypto/DB/CAS/conta/perda de resposta e navegador com
   IndexedDB/Web Locks reais; controles do navegador somente em contexto isolado.
6. Revisar, checks, ADR/evidência/AGENTS/docs e commit local.

## Aceites

- [x] Chave autorizada via HTTP existente, resposta limitada e sem persistência.
- [x] Envelope cifrado limitado e identidade/AAD/stamp/nonce íntegros.
- [x] CAS completo em IndexedDB e coordenação entre abas; falhas preservam dados.
- [x] Driver novo recupera mesmo pedido após reload; conta/origem inválida bloqueia.
- [x] Testes/checks reais documentados e commit local.
      [Evidência](../../../entregas/2026-10-25-writer-v2-journal-protegido-da-preparacao.md).

Sem CI/push/PR/merge/deploy/subagentes. Padrão indexado continua false.
Upload/revisão/ativação/mídia/limpeza/UI/roundtrip integral, inventários/writers/
exclusão/legados/rollout/validate de P1, fases 3–5 e gates humanos/comerciais
continuam no objetivo; validate global no fechamento de P1.
